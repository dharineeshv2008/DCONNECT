package com.disaster.coord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload sent from Android app to register FCM token and user location.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveTokenRequest {
    private String userId;
    private String latitude;
    private String longitude;
    private String fcmToken;
}
