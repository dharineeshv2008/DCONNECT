package com.disaster.coord.dto;

import com.disaster.coord.enums.AssignmentStatus;
import com.disaster.coord.enums.AvailabilityStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZonedDateTime;

public class VolunteerDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AssignmentRequest {
        @NotNull(message = "Disaster ID is required")
        private Long disasterId;

        @NotNull(message = "Volunteer ID is required")
        private Long volunteerId;

        @NotBlank(message = "Task title is required")
        private String taskTitle;

        @NotBlank(message = "Task description is required")
        private String taskDescription;

        private Long assignedById;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AssignmentResponse {
        private Long id;
        private Long disasterId;
        private String disasterTitle;
        private Long volunteerId;
        private String volunteerName;
        private String volunteerPhone;
        private String taskTitle;
        private String taskDescription;
        private AssignmentStatus status;
        private String assignedByName;
        private ZonedDateTime assignedAt;
        private ZonedDateTime completedAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateAssignmentStatusRequest {
        @NotNull(message = "Status is required")
        private AssignmentStatus status;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class VolunteerProfileDto {
        private Long id;
        private Long userId;
        private String name;
        private String phone;
        private String skills;
        private AvailabilityStatus availabilityStatus;
        private Integer helpedCount;
        private Double currentLatitude;
        private Double currentLongitude;
        private Double distanceFromDisasterKm;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateAvailabilityRequest {
        @NotNull(message = "Availability status is required")
        private AvailabilityStatus availabilityStatus;
        private Double latitude;
        private Double longitude;
    }
}
