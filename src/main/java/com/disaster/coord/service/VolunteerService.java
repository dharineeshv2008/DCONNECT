package com.disaster.coord.service;

import com.disaster.coord.dto.VolunteerDtos.*;
import com.disaster.coord.entity.Assignment;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.User;
import com.disaster.coord.entity.VolunteerProfile;
import com.disaster.coord.enums.AssignmentStatus;
import com.disaster.coord.enums.AvailabilityStatus;
import com.disaster.coord.enums.Role;
import com.disaster.coord.exception.AccessDeniedException;
import com.disaster.coord.exception.AppException;
import com.disaster.coord.exception.InvalidStateTransitionException;
import com.disaster.coord.exception.ResourceNotFoundException;
import com.disaster.coord.repository.AssignmentRepository;
import com.disaster.coord.repository.DisasterRepository;
import com.disaster.coord.repository.UserRepository;
import com.disaster.coord.repository.VolunteerRepository;
import com.disaster.coord.util.GeoLocationUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class VolunteerService {

    private final VolunteerRepository volunteerRepository;
    private final UserRepository userRepository;
    private final DisasterRepository disasterRepository;
    private final AssignmentRepository assignmentRepository;
    private final NotificationService notificationService;

    @Transactional(readOnly = true)
    public List<VolunteerProfileDto> getAvailableVolunteers(Double disasterLat, Double disasterLon) {
        List<VolunteerProfile> profiles = volunteerRepository.findByAvailabilityStatus(AvailabilityStatus.AVAILABLE);

        return profiles.stream().map(p -> {
            Double distance = null;
            if (disasterLat != null && disasterLon != null && p.getCurrentLatitude() != null && p.getCurrentLongitude() != null) {
                distance = GeoLocationUtil.calculateDistanceKm(disasterLat, disasterLon, p.getCurrentLatitude(), p.getCurrentLongitude());
            }

            return VolunteerProfileDto.builder()
                    .id(p.getId())
                    .userId(p.getUser().getId())
                    .name(p.getUser().getName())
                    .phone(p.getUser().getPhone())
                    .skills(p.getSkills())
                    .availabilityStatus(p.getAvailabilityStatus())
                    .helpedCount(p.getHelpedCount())
                    .currentLatitude(p.getCurrentLatitude())
                    .currentLongitude(p.getCurrentLongitude())
                    .distanceFromDisasterKm(distance)
                    .build();
        }).sorted((a, b) -> {
            if (a.getDistanceFromDisasterKm() != null && b.getDistanceFromDisasterKm() != null) {
                return Double.compare(a.getDistanceFromDisasterKm(), b.getDistanceFromDisasterKm());
            }
            return 0;
        }).collect(Collectors.toList());
    }

    @Transactional
    public void updateAvailability(Long userId, UpdateAvailabilityRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with ID: " + userId));

        if (user.getRole() != Role.VOLUNTEER) {
            throw new AppException("Only registered volunteers can update availability status.");
        }

        VolunteerProfile profile = volunteerRepository.findByUserId(userId)
                .orElseGet(() -> VolunteerProfile.builder().user(user).build());

        profile.setAvailabilityStatus(req.getAvailabilityStatus());
        if (req.getLatitude() != null && req.getLongitude() != null) {
            profile.setCurrentLatitude(req.getLatitude());
            profile.setCurrentLongitude(req.getLongitude());
        }
        volunteerRepository.save(profile);
    }

    /**
     * Dispatches task assignment. Volunteer ID must resolve to a valid VolunteerProfile.
     */
    @Transactional
    public AssignmentResponse assignTask(AssignmentRequest req) {
        Disaster disaster = disasterRepository.findById(req.getDisasterId())
                .orElseThrow(() -> new ResourceNotFoundException("Disaster not found with ID: " + req.getDisasterId()));

        // Resolve volunteer profile (by volunteer profile id or user id)
        VolunteerProfile volunteerProfile = volunteerRepository.findById(req.getVolunteerId())
                .orElseGet(() -> volunteerRepository.findByUserId(req.getVolunteerId())
                        .orElseThrow(() -> new ResourceNotFoundException("Volunteer profile not found for ID: " + req.getVolunteerId())));

        User volunteerUser = volunteerProfile.getUser();
        if (volunteerUser.getRole() != Role.VOLUNTEER) {
            throw new AppException("User " + volunteerUser.getName() + " does not have the VOLUNTEER role.");
        }

        User assignedBy = null;
        if (req.getAssignedById() != null) {
            assignedBy = userRepository.findById(req.getAssignedById()).orElse(null);
        }

        Assignment assignment = Assignment.builder()
                .disaster(disaster)
                .volunteer(volunteerProfile)
                .taskTitle(req.getTaskTitle())
                .taskDescription(req.getTaskDescription())
                .status(AssignmentStatus.ASSIGNED)
                .assignedBy(assignedBy)
                .build();

        assignment = assignmentRepository.save(assignment);

        // Mark volunteer busy
        volunteerProfile.setAvailabilityStatus(AvailabilityStatus.BUSY);
        volunteerRepository.save(volunteerProfile);

        // Notify Volunteer
        notificationService.notifyUser(
                volunteerUser,
                "New Task Assignment: " + req.getTaskTitle(),
                String.format("You have been assigned to '%s' for mission '%s'.", disaster.getTitle(), req.getTaskTitle()),
                disaster
        );

        return mapToAssignmentResponse(assignment);
    }

    /**
     * Updates assignment status with strict lifecycle transition guards.
     * Flow: ASSIGNED -> IN_PROGRESS -> COMPLETED or CANCELLED
     */
    @Transactional
    public AssignmentResponse updateAssignmentStatus(Long assignmentId, Long userId, AssignmentStatus newStatus) {
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Assignment not found with ID: " + assignmentId));

        if (userId != null) {
            User caller = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found with ID: " + userId));

            boolean isAssignedVolunteer = assignment.getVolunteer().getUser().getId().equals(userId);
            boolean isAuthorizedAdmin = (caller.getRole() == Role.ADMIN || caller.getRole() == Role.GOVERNMENT_AGENCY);

            if (!isAssignedVolunteer && !isAuthorizedAdmin) {
                throw new AccessDeniedException("You do not have permission to update this assignment.");
            }
        }

        validateAssignmentTransition(assignment.getStatus(), newStatus);

        assignment.setStatus(newStatus);
        if (newStatus == AssignmentStatus.COMPLETED) {
            assignment.setCompletedAt(ZonedDateTime.now());

            // Increment volunteer helped_count & make available again
            VolunteerProfile profile = assignment.getVolunteer();
            profile.setHelpedCount(profile.getHelpedCount() + 1);
            profile.setAvailabilityStatus(AvailabilityStatus.AVAILABLE);
            volunteerRepository.save(profile);
        } else if (newStatus == AssignmentStatus.CANCELLED) {
            VolunteerProfile profile = assignment.getVolunteer();
            profile.setAvailabilityStatus(AvailabilityStatus.AVAILABLE);
            volunteerRepository.save(profile);
        }

        assignment = assignmentRepository.save(assignment);
        return mapToAssignmentResponse(assignment);
    }

    private void validateAssignmentTransition(AssignmentStatus current, AssignmentStatus target) {
        if (current == target) return;

        if (current == AssignmentStatus.COMPLETED || current == AssignmentStatus.CANCELLED) {
            throw new InvalidStateTransitionException("Cannot modify an assignment that is already " + current + ".");
        }

        switch (current) {
            case ASSIGNED:
                if (target != AssignmentStatus.IN_PROGRESS && target != AssignmentStatus.CANCELLED) {
                    throw new InvalidStateTransitionException("ASSIGNED task can only move to IN_PROGRESS or CANCELLED.");
                }
                break;
            case IN_PROGRESS:
                if (target != AssignmentStatus.COMPLETED && target != AssignmentStatus.CANCELLED) {
                    throw new InvalidStateTransitionException("IN_PROGRESS task can only move to COMPLETED or CANCELLED.");
                }
                break;
        }
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getAssignmentsByDisaster(Long disasterId) {
        return assignmentRepository.findByDisasterIdOrderByAssignedAtDesc(disasterId)
                .stream().map(this::mapToAssignmentResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> getAssignmentsByVolunteerUser(Long userId) {
        return assignmentRepository.findByVolunteerUserId(userId)
                .stream().map(this::mapToAssignmentResponse).collect(Collectors.toList());
    }

    private AssignmentResponse mapToAssignmentResponse(Assignment a) {
        return AssignmentResponse.builder()
                .id(a.getId())
                .disasterId(a.getDisaster().getId())
                .disasterTitle(a.getDisaster().getTitle())
                .volunteerId(a.getVolunteer().getId())
                .volunteerName(a.getVolunteer().getUser().getName())
                .volunteerPhone(a.getVolunteer().getUser().getPhone())
                .taskTitle(a.getTaskTitle())
                .taskDescription(a.getTaskDescription())
                .status(a.getStatus())
                .assignedByName(a.getAssignedBy() != null ? a.getAssignedBy().getName() : "Command Center")
                .assignedAt(a.getAssignedAt())
                .completedAt(a.getCompletedAt())
                .build();
    }
}
