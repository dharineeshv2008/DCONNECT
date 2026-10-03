package com.disaster.coord.dto;

import com.disaster.coord.enums.DisasterType;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request payload for triggering disaster notifications to nearby users within radius.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DisasterNotificationRequest {

    private Long disasterId;

    @NotNull(message = "Latitude is required")
    private Double latitude;

    @NotNull(message = "Longitude is required")
    private Double longitude;

    @NotNull(message = "Disaster type is required")
    private DisasterType type;

    private String title;
    private String description;
    private Double radiusKm; // Optional custom radius (defaults to 30 km)
}
