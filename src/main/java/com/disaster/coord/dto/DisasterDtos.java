package com.disaster.coord.dto;

import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Severity;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZonedDateTime;
import java.util.List;

public class DisasterDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DisasterReportRequest {
        @NotNull(message = "Disaster type is required")
        private DisasterType type;

        @NotBlank(message = "Title is required")
        private String title;

        @NotBlank(message = "Description is required")
        private String description;

        private Severity severity;

        @NotNull(message = "Latitude is required")
        @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
        @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
        private Double latitude;

        @NotNull(message = "Longitude is required")
        @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
        @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
        private Double longitude;

        private String locationName;

        // Reporter info (can be passed or extracted from user)
        private Long reporterId;
        private String reporterName;
        private String reporterPhone;
        private String additionalNotes;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DisasterResponse {
        private Long id;
        private DisasterType type;
        private String title;
        private String description;
        private Severity severity;
        private Double latitude;
        private Double longitude;
        private String locationName;
        private DisasterStatus status;
        private Integer reportCount;
        private Long createdById;
        private String createdByName;
        private String createdByRole;
        private Double distanceFromUserKm;
        private ZonedDateTime createdAt;
        private ZonedDateTime updatedAt;
        private List<DisasterReportDto> recentReports;
        private boolean wasMerged;
        private String mergeMessage;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DisasterReportDto {
        private Long id;
        private Long disasterId;
        private Long reporterId;
        private String reporterName;
        private String reporterPhone;
        private Double latitude;
        private Double longitude;
        private String message;
        private ZonedDateTime reportedAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DisasterAnalyticsDto {
        private long totalDisasters;
        private long pendingDisasters;
        private long activeDisasters;
        private long resolvedDisasters;
        private long closedDisasters;
        private long totalReportsAggregated;
        private long activeVolunteers;
        private long totalResourcesAvailable;
        private long pendingUserApprovals;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatusUpdateRequest {
        @NotNull(message = "Status is required")
        private DisasterStatus status;
        private String reason;
    }
}
