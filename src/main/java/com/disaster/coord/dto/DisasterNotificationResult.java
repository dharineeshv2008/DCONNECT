package com.disaster.coord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Result DTO summarizing disaster notification execution metrics and recipient details.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DisasterNotificationResult {
    private Long disasterId;
    private String disasterType;
    private Double latitude;
    private Double longitude;
    private String resolvedAddress;
    private int candidateUsersInBoundingBox;
    private int usersWithinRadius;
    private int notificationsSent;
    private double radiusKm;
    private long executionDurationMs;
    private List<RecipientDetail> recipients;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecipientDetail {
        private Long userId;
        private String userName;
        private Double distanceKm;
        private String formattedDistance;
        private String fcmTokenMasked;
        private boolean delivered;
    }
}
