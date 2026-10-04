package com.disaster.coord.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload sent from Android app to register FCM token and user location.
 * Supports both snake_case (user_id, fcm_token, device_type/device) and camelCase (userId, fcmToken, deviceType).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaveTokenRequest {

    @JsonProperty("user_id")
    @JsonAlias({"userId", "user_id", "id"})
    private String userId;

    @JsonProperty("fcm_token")
    @JsonAlias({"fcmToken", "fcm_token", "token"})
    private String fcmToken;

    @JsonProperty("device_type")
    @JsonAlias({"deviceType", "device_type", "device"})
    private String deviceType;

    @JsonProperty("latitude")
    @JsonAlias({"latitude", "lat"})
    private String latitude;

    @JsonProperty("longitude")
    @JsonAlias({"longitude", "lng"})
    private String longitude;
}
