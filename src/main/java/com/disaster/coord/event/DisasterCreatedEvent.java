package com.disaster.coord.event;

import com.disaster.coord.enums.DisasterType;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * Domain Event published immediately upon disaster creation or confirmation.
 * Listeners handle async reverse geocoding, proximity calculation, and FCM push notifications.
 */
@Getter
public class DisasterCreatedEvent extends ApplicationEvent {

    private final Long disasterId;
    private final Double latitude;
    private final Double longitude;
    private final DisasterType disasterType;
    private final String title;
    private final String locationName;

    public DisasterCreatedEvent(Object source, Long disasterId, Double latitude, Double longitude,
                                DisasterType disasterType, String title, String locationName) {
        super(source);
        this.disasterId = disasterId;
        this.latitude = latitude;
        this.longitude = longitude;
        this.disasterType = disasterType;
        this.title = title;
        this.locationName = locationName;
    }
}
