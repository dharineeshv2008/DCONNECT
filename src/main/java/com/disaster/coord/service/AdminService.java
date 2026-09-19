package com.disaster.coord.service;

import com.disaster.coord.dto.AdminDtos.*;
import com.disaster.coord.dto.AuthDtos.UserProfileDto;
import com.disaster.coord.dto.DisasterDtos.DisasterAnalyticsDto;
import com.disaster.coord.dto.DisasterDtos.DisasterResponse;
import com.disaster.coord.entity.ApprovalLog;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.User;
import com.disaster.coord.enums.ApprovalAction;
import com.disaster.coord.enums.AvailabilityStatus;
import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.exception.AccessDeniedException;
import com.disaster.coord.exception.ResourceNotFoundException;
import com.disaster.coord.repository.*;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    private final UserRepository userRepository;
    private final DisasterRepository disasterRepository;
    private final VolunteerRepository volunteerRepository;
    private final ResourceRepository resourceRepository;
    private final ApprovalLogRepository approvalLogRepository;
    private final NotificationService notificationService;
    private final DisasterService disasterService;

    @Transactional
    public UserProfileDto approveOrRejectUser(UserApprovalRequest req) {
        User admin = userRepository.findById(req.getAdminId())
                .orElseThrow(() -> new ResourceNotFoundException("Admin user not found with ID: " + req.getAdminId()));

        if (admin.getRole() != Role.ADMIN) {
            throw new AccessDeniedException("Only Administrator accounts can approve or reject organizations.");
        }

        User targetUser = userRepository.findById(req.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("Target user not found with ID: " + req.getUserId()));

        UserStatus newStatus = (req.getAction() == ApprovalAction.APPROVED) ? UserStatus.ACTIVE : UserStatus.REJECTED;
        targetUser.setStatus(newStatus);
        targetUser = userRepository.save(targetUser);

        // Record Audit Log
        ApprovalLog logEntry = ApprovalLog.builder()
                .admin(admin)
                .targetType("USER")
                .targetId(targetUser.getId())
                .action(req.getAction())
                .comments(req.getComments())
                .build();
        approvalLogRepository.save(logEntry);

        // Send Notification to the User
        String statusMessage = (req.getAction() == ApprovalAction.APPROVED) ?
                "Congratulations! Your " + targetUser.getRole() + " organization account has been approved. You now have full access." :
                "Your organization registration request has been rejected. Reason: " + (req.getComments() != null ? req.getComments() : "Policy check failed.");

        notificationService.notifyUser(targetUser, "Account Status Update", statusMessage, null);
        log.info("Admin {} {} user {} ({})", admin.getName(), req.getAction(), targetUser.getName(), targetUser.getId());

        return UserProfileDto.builder()
                .id(targetUser.getId())
                .name(targetUser.getName())
                .phone(targetUser.getPhone())
                .role(targetUser.getRole())
                .status(targetUser.getStatus())
                .organizationName(targetUser.getOrganizationName())
                .organizationRegNo(targetUser.getOrganizationRegNo())
                .createdAt(targetUser.getCreatedAt())
                .build();
    }

    @Transactional
    public DisasterResponse approveOrRejectDisaster(DisasterApprovalRequest req) {
        User admin = userRepository.findById(req.getAdminId())
                .orElseThrow(() -> new ResourceNotFoundException("Admin user not found with ID: " + req.getAdminId()));

        if (admin.getRole() != Role.ADMIN) {
            throw new AccessDeniedException("Only Administrator accounts can verify disaster reports.");
        }

        Disaster disaster = disasterRepository.findById(req.getDisasterId())
                .orElseThrow(() -> new ResourceNotFoundException("Disaster not found with ID: " + req.getDisasterId()));

        DisasterStatus newStatus = (req.getAction() == ApprovalAction.APPROVED) ?
                DisasterStatus.VERIFIED_ACTIVE : DisasterStatus.CLOSED;

        disaster.setStatus(newStatus);
        if (req.getAction() == ApprovalAction.APPROVED) {
            disaster.setVerifiedBy(admin);
        }
        disaster = disasterRepository.save(disaster);

        // Record Audit Log
        ApprovalLog logEntry = ApprovalLog.builder()
                .admin(admin)
                .targetType("DISASTER")
                .targetId(disaster.getId())
                .action(req.getAction())
                .comments(req.getComments())
                .build();
        approvalLogRepository.save(logEntry);

        if (req.getAction() == ApprovalAction.APPROVED) {
            notificationService.notifyAllVolunteers(
                    "Emergency Incident Verified: " + disaster.getTitle(),
                    String.format("Admin verified disaster #%d. Mobilizing volunteers and relief supplies.", disaster.getId()),
                    disaster
            );
        }

        return disasterService.getDisasterById(disaster.getId(), null, null);
    }

    @Transactional(readOnly = true)
    public List<UserProfileDto> getPendingUsers() {
        return userRepository.findByStatus(UserStatus.PENDING_APPROVAL)
                .stream().map(u -> UserProfileDto.builder()
                        .id(u.getId())
                        .name(u.getName())
                        .phone(u.getPhone())
                        .role(u.getRole())
                        .status(u.getStatus())
                        .organizationName(u.getOrganizationName())
                        .organizationRegNo(u.getOrganizationRegNo())
                        .createdAt(u.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<DisasterResponse> getPendingDisasters() {
        return disasterService.getAllDisasters(DisasterStatus.PENDING, null, null);
    }

    @Transactional(readOnly = true)
    public DisasterAnalyticsDto getSystemAnalytics() {
        long totalDisasters = disasterRepository.count();
        long pendingDisasters = disasterRepository.countByStatus(DisasterStatus.PENDING);
        long activeDisasters = disasterRepository.countByStatus(DisasterStatus.VERIFIED_ACTIVE) + disasterRepository.countByStatus(DisasterStatus.IN_PROGRESS);
        long resolvedDisasters = disasterRepository.countByStatus(DisasterStatus.RESOLVED);
        long closedDisasters = disasterRepository.countByStatus(DisasterStatus.CLOSED);

        Long aggregatedReports = disasterRepository.getTotalReportsCount();
        long totalReports = (aggregatedReports != null) ? aggregatedReports : 0;

        long activeVolunteers = volunteerRepository.countByAvailabilityStatus(AvailabilityStatus.AVAILABLE) + volunteerRepository.countByAvailabilityStatus(AvailabilityStatus.BUSY);
        long totalResources = resourceRepository.countByStatus("AVAILABLE");
        long pendingUserApprovals = userRepository.countByStatus(UserStatus.PENDING_APPROVAL);

        return DisasterAnalyticsDto.builder()
                .totalDisasters(totalDisasters)
                .pendingDisasters(pendingDisasters)
                .activeDisasters(activeDisasters)
                .resolvedDisasters(resolvedDisasters)
                .closedDisasters(closedDisasters)
                .totalReportsAggregated(totalReports)
                .activeVolunteers(activeVolunteers)
                .totalResourcesAvailable(totalResources)
                .pendingUserApprovals(pendingUserApprovals)
                .build();
    }
}
