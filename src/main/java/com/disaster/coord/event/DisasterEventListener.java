package com.disaster.coord.event;

import com.disaster.coord.service.DisasterNotificationService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Event Listener handling real-time push notifications when a disaster event is fired.
 * Ensures the triggering transaction completes immediately without blocking.
 */
@Component
@RequiredArgsConstructor
public class DisasterEventListener {

    private static final Logger log = LoggerFactory.getLogger(DisasterEventListener.class);

    private final DisasterNotificationService notificationService;

    @Async("notificationTaskExecutor")
    @EventListener
    public void onDisasterCreated(DisasterCreatedEvent event) {
        log.info("Received DisasterCreatedEvent for disaster ID {}: {}", event.getDisasterId(), event.getTitle());

        notificationService.processDisasterNotification(
                event.getDisasterId(),
                event.getLatitude(),
                event.getLongitude(),
                event.getDisasterType(),
                event.getTitle(),
                null // uses default 30 km radius
        );
    }
}
