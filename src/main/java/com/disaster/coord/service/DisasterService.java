package com.disaster.coord.service;

import com.disaster.coord.dto.DisasterDtos.*;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.DisasterReport;
import com.disaster.coord.entity.User;
import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.exception.AccessDeniedException;
import com.disaster.coord.exception.AccountPendingException;
import com.disaster.coord.exception.InvalidStateTransitionException;
import com.disaster.coord.exception.ResourceNotFoundException;
import com.disaster.coord.repository.DisasterReportRepository;
import com.disaster.coord.repository.DisasterRepository;
import com.disaster.coord.repository.UserRepository;
import com.disaster.coord.util.GeoLocationUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DisasterService {

    private static final Logger log = LoggerFactory.getLogger(DisasterService.class);

    private final DisasterRepository disasterRepository;
    private final DisasterReportRepository disasterReportRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final RateLimiterService rateLimiterService;

    @Value("${disaster-app.merge.max-distance-km:10.0}")
    private double maxMergeDistanceKm;

    @Value("${disaster-app.merge.time-window-hours:3}")
    private int mergeTimeWindowHours;

    /**
     * Concurrency-Safe Disaster Reporting & Haversine Merging Flow.
     * Uses SELECT ... FOR UPDATE (PESSIMISTIC_WRITE) to prevent race conditions during concurrent reports.
     * Enforces a 2-minute rate limit per reporter.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public DisasterResponse reportDisaster(DisasterReportRequest req) {
        // 1. Rate Limiting Check (Max 1 report per user/phone per 2 minutes)
        String reporterPhone = req.getReporterPhone();
        User reporter = null;
        if (req.getReporterId() != null) {
            reporter = userRepository.findById(req.getReporterId())
                    .orElseThrow(() -> new ResourceNotFoundException("Reporter not found with ID: " + req.getReporterId()));
            reporterPhone = reporter.getPhone();

            // 2. Strict Role & Approval Validation for NGO/Gov
            if ((reporter.getRole() == Role.NGO || reporter.getRole() == Role.GOVERNMENT_AGENCY) 
                    && reporter.getStatus() != UserStatus.ACTIVE) {
                throw new AccountPendingException(
                        "Your " + reporter.getRole() + " account must be approved by the Administrator before publishing or reporting disasters."
                );
            }

            if (reporter.getStatus() == UserStatus.REJECTED || reporter.getStatus() == UserStatus.SUSPENDED) {
                throw new AccessDeniedException("Your account is not permitted to submit disaster reports.");
            }
        }

        rateLimiterService.checkReportRateLimit(req.getReporterId(), reporterPhone);

        String reporterName = (reporter != null) ? reporter.getName() :
                (req.getReporterName() != null ? req.getReporterName() : "Anonymous Citizen");
        if (reporterPhone == null || reporterPhone.isBlank()) {
            reporterPhone = "N/A";
        }

        // 3. Concurrency-Safe Candidate Lookup with Pessimistic Write Lock
        ZonedDateTime windowStart = ZonedDateTime.now().minusHours(mergeTimeWindowHours);
        List<DisasterStatus> eligibleMergeStatuses = Arrays.asList(
                DisasterStatus.PENDING,
                DisasterStatus.VERIFIED_ACTIVE,
                DisasterStatus.IN_PROGRESS
        );

        List<Disaster> lockedCandidates = disasterRepository.findCandidatesForMergeWithLock(
                req.getType(),
                eligibleMergeStatuses,
                windowStart
        );

        Disaster targetDisaster = null;
        double closestDistance = Double.MAX_VALUE;

        // 4. Apply Haversine Distance Formula
        for (Disaster candidate : lockedCandidates) {
            double distance = GeoLocationUtil.calculateDistanceKm(
                    req.getLatitude(), req.getLongitude(),
                    candidate.getLatitude(), candidate.getLongitude()
            );

            if (distance <= maxMergeDistanceKm && distance < closestDistance) {
                closestDistance = distance;
                targetDisaster = candidate;
            }
        }

        boolean wasMerged = false;
        String mergeMessage;

        if (targetDisaster != null) {
            // MERGE CASE
            wasMerged = true;
            targetDisaster.setReportCount(targetDisaster.getReportCount() + 1);

            // Escalate severity if report count surges
            if (targetDisaster.getReportCount() >= 5 && targetDisaster.getSeverity() == com.disaster.coord.enums.Severity.LOW) {
                targetDisaster.setSeverity(com.disaster.coord.enums.Severity.MEDIUM);
            } else if (targetDisaster.getReportCount() >= 10 && targetDisaster.getSeverity() == com.disaster.coord.enums.Severity.MEDIUM) {
                targetDisaster.setSeverity(com.disaster.coord.enums.Severity.HIGH);
            }

            targetDisaster = disasterRepository.save(targetDisaster);

            // Insert into reports table as immutable audit log
            DisasterReport report = DisasterReport.builder()
                    .disaster(targetDisaster)
                    .reporter(reporter)
                    .reporterName(reporterName)
                    .reporterPhone(reporterPhone)
                    .latitude(req.getLatitude())
                    .longitude(req.getLongitude())
                    .message(req.getDescription() + (req.getAdditionalNotes() != null ? " | Notes: " + req.getAdditionalNotes() : ""))
                    .build();
            disasterReportRepository.save(report);

            mergeMessage = String.format("Report successfully merged into existing %s disaster (#%d, '%s') located %s away. Total aggregated reports: %d.",
                    targetDisaster.getType(), targetDisaster.getId(), targetDisaster.getTitle(),
                    GeoLocationUtil.formatDistance(closestDistance), targetDisaster.getReportCount());

            log.info("CONCURRENCY SAFE MERGE: Incident report merged into disaster ID {}. Distance: {} km", targetDisaster.getId(), closestDistance);

            notificationService.notifyAllVolunteers(
                    "Disaster Escalation / Reports Merged",
                    String.format("Disaster #%d (%s) now has %d incident reports confirmed in proximity.",
                            targetDisaster.getId(), targetDisaster.getTitle(), targetDisaster.getReportCount()),
                    targetDisaster
            );

        } else {
            // CREATE NEW DISASTER
            wasMerged = false;

            // Determine initial status: Approved NGO / Gov / Admin -> VERIFIED_ACTIVE; General User -> PENDING
            DisasterStatus initialStatus = DisasterStatus.PENDING;
            if (reporter != null && (reporter.getRole() == Role.NGO || reporter.getRole() == Role.GOVERNMENT_AGENCY || reporter.getRole() == Role.ADMIN)) {
                initialStatus = DisasterStatus.VERIFIED_ACTIVE;
            }

            Disaster newDisaster = Disaster.builder()
                    .type(req.getType())
                    .title(req.getTitle())
                    .description(req.getDescription())
                    .severity(req.getSeverity() != null ? req.getSeverity() : com.disaster.coord.enums.Severity.MEDIUM)
                    .latitude(req.getLatitude())
                    .longitude(req.getLongitude())
                    .locationName(req.getLocationName() != null ? req.getLocationName() : String.format("Coordinates: %.4f, %.4f", req.getLatitude(), req.getLongitude()))
                    .status(initialStatus)
                    .reportCount(1)
                    .createdBy(reporter)
                    .verifiedBy(initialStatus == DisasterStatus.VERIFIED_ACTIVE ? reporter : null)
                    .build();

            targetDisaster = disasterRepository.save(newDisaster);

            // Audit record in reports table
            DisasterReport firstReport = DisasterReport.builder()
                    .disaster(targetDisaster)
                    .reporter(reporter)
                    .reporterName(reporterName)
                    .reporterPhone(reporterPhone)
                    .latitude(req.getLatitude())
                    .longitude(req.getLongitude())
                    .message(req.getDescription())
                    .build();
            disasterReportRepository.save(firstReport);

            mergeMessage = (initialStatus == DisasterStatus.VERIFIED_ACTIVE) ?
                    "New disaster published directly to active response pipeline." :
                    "Citizen disaster report logged. Pending Admin verification before public broadcast.";

            log.info("NEW DISASTER CREATED: ID {} with initial status {}", targetDisaster.getId(), initialStatus);

            if (initialStatus == DisasterStatus.VERIFIED_ACTIVE) {
                notificationService.notifyAllVolunteers(
                        "New Disaster Verified",
                        String.format("URGENT: %s incident '%s' published. Mobilization underway.",
                                targetDisaster.getType(), targetDisaster.getTitle()),
                        targetDisaster
                );
            } else {
                notificationService.notifyAdmins(
                        "New Citizen Disaster Report",
                        String.format("Citizen report received for %s at %s. Admin verification required.",
                                targetDisaster.getType(), targetDisaster.getLocationName()),
                        targetDisaster
                );
            }
        }

        return mapToDisasterResponse(targetDisaster, req.getLatitude(), req.getLongitude(), wasMerged, mergeMessage);
    }

    /**
     * Validates and updates disaster lifecycle status.
     * Flow: PENDING -> VERIFIED_ACTIVE -> IN_PROGRESS -> RESOLVED -> CLOSED
     */
    @Transactional
    public DisasterResponse updateDisasterStatus(Long id, DisasterStatus newStatus, Long actorId) {
        Disaster disaster = disasterRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Disaster not found with ID: " + id));

        User actor = null;
        if (actorId != null) {
            actor = userRepository.findById(actorId).orElse(null);
        }

        validateDisasterStatusTransition(disaster.getStatus(), newStatus);

        disaster.setStatus(newStatus);
        if (newStatus == DisasterStatus.VERIFIED_ACTIVE && actor != null) {
            disaster.setVerifiedBy(actor);
        }

        disaster = disasterRepository.save(disaster);

        notificationService.notifyAllVolunteers(
                "Disaster Status Updated",
                String.format("Disaster #%d (%s) status transitioned to %s", disaster.getId(), disaster.getTitle(), newStatus),
                disaster
        );

        return mapToDisasterResponse(disaster, null, null, false, "Disaster status transitioned to " + newStatus);
    }

    private void validateDisasterStatusTransition(DisasterStatus current, DisasterStatus target) {
        if (current == target) return;

        if (current == DisasterStatus.CLOSED) {
            throw new InvalidStateTransitionException("Cannot change status of a CLOSED disaster.");
        }

        switch (current) {
            case PENDING:
                if (target != DisasterStatus.VERIFIED_ACTIVE && target != DisasterStatus.CLOSED) {
                    throw new InvalidStateTransitionException("PENDING disaster can only transition to VERIFIED_ACTIVE or CLOSED.");
                }
                break;
            case VERIFIED_ACTIVE:
                if (target != DisasterStatus.IN_PROGRESS && target != DisasterStatus.RESOLVED && target != DisasterStatus.CLOSED) {
                    throw new InvalidStateTransitionException("VERIFIED_ACTIVE disaster can only transition to IN_PROGRESS, RESOLVED, or CLOSED.");
                }
                break;
            case IN_PROGRESS:
                if (target != DisasterStatus.RESOLVED && target != DisasterStatus.CLOSED) {
                    throw new InvalidStateTransitionException("IN_PROGRESS disaster can only transition to RESOLVED or CLOSED.");
                }
                break;
            case RESOLVED:
                if (target != DisasterStatus.CLOSED && target != DisasterStatus.IN_PROGRESS) {
                    throw new InvalidStateTransitionException("RESOLVED disaster can only transition to CLOSED or back to IN_PROGRESS.");
                }
                break;
        }
    }

    @Transactional(readOnly = true)
    public List<DisasterResponse> getAllDisasters(DisasterStatus status, Double userLat, Double userLon) {
        List<Disaster> disasters;
        if (status != null) {
            disasters = disasterRepository.findByStatusOrderByCreatedAtDesc(status);
        } else {
            disasters = disasterRepository.findAllByOrderByCreatedAtDesc();
        }

        return disasters.stream()
                .map(d -> mapToDisasterResponse(d, userLat, userLon, false, null))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public DisasterResponse getDisasterById(Long id, Double userLat, Double userLon) {
        Disaster disaster = disasterRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Disaster not found with ID: " + id));

        return mapToDisasterResponse(disaster, userLat, userLon, false, null);
    }

    private DisasterResponse mapToDisasterResponse(Disaster d, Double userLat, Double userLon, boolean wasMerged, String mergeMsg) {
        Double distanceKm = null;
        if (userLat != null && userLon != null && d.getLatitude() != null && d.getLongitude() != null) {
            distanceKm = GeoLocationUtil.calculateDistanceKm(userLat, userLon, d.getLatitude(), d.getLongitude());
        }

        List<DisasterReportDto> reportDtos = new ArrayList<>();
        List<DisasterReport> reports = disasterReportRepository.findByDisasterIdOrderByReportedAtDesc(d.getId());
        for (DisasterReport r : reports) {
            reportDtos.add(DisasterReportDto.builder()
                    .id(r.getId())
                    .disasterId(d.getId())
                    .reporterId(r.getReporter() != null ? r.getReporter().getId() : null)
                    .reporterName(r.getReporterName())
                    .reporterPhone(r.getReporterPhone())
                    .latitude(r.getLatitude())
                    .longitude(r.getLongitude())
                    .message(r.getMessage())
                    .reportedAt(r.getReportedAt())
                    .build());
        }

        return DisasterResponse.builder()
                .id(d.getId())
                .type(d.getType())
                .title(d.getTitle())
                .description(d.getDescription())
                .severity(d.getSeverity())
                .latitude(d.getLatitude())
                .longitude(d.getLongitude())
                .locationName(d.getLocationName())
                .status(d.getStatus())
                .reportCount(d.getReportCount())
                .createdById(d.getCreatedBy() != null ? d.getCreatedBy().getId() : null)
                .createdByName(d.getCreatedBy() != null ? d.getCreatedBy().getName() : "Anonymous Citizen")
                .createdByRole(d.getCreatedBy() != null ? d.getCreatedBy().getRole().name() : "PUBLIC")
                .distanceFromUserKm(distanceKm)
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .recentReports(reportDtos)
                .wasMerged(wasMerged)
                .mergeMessage(mergeMsg)
                .build();
    }
}
