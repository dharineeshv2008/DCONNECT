package com.disaster.coord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * Payload data for sending Firebase Cloud Messaging (FCM) notifications.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FcmNotificationPayload {
    private String fcmToken;
    private String title;
    private String body;
    private Long disasterId;
    private String disasterType;
    private String address;
    private Double distanceKm;
    private Map<String, String> customData;
}
