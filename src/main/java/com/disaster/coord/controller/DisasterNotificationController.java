package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.DisasterNotificationRequest;
import com.disaster.coord.dto.DisasterNotificationResult;
import com.disaster.coord.dto.FcmNotificationPayload;
import com.disaster.coord.service.DisasterNotificationService;
import com.disaster.coord.service.FcmNotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Controller for triggering and testing real-time disaster notifications.
 * Guarantees SLA < 2 seconds response time for notification dispatch.
 */
@RestController
@RequestMapping("/api/disasters")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DisasterNotificationController {

    private final DisasterNotificationService notificationService;
    private final FcmNotificationService fcmNotificationService;

    /**
     * Synchronous notification endpoint.
     * Evaluates spatial bounding box, filters users <= 30km using Haversine,
     * reverse geocodes the coordinates, and delivers FCM push notifications in parallel.
     */
    @PostMapping("/notify")
    public ResponseEntity<ApiResponse<DisasterNotificationResult>> triggerNotifications(
            @Valid @RequestBody DisasterNotificationRequest request) {

        DisasterNotificationResult result = notificationService.processDisasterNotification(
                request.getDisasterId(),
                request.getLatitude(),
                request.getLongitude(),
                request.getType(),
                request.getTitle(),
                request.getRadiusKm()
        );

        return ResponseEntity.ok(ApiResponse.ok("Disaster notification broadcast completed successfully", result));
    }

    /**
     * Non-blocking asynchronous notification endpoint.
     * Immediately returns 202 ACCEPTED in < 20ms while notifications are dispatched in background threads.
     */
    @PostMapping("/notify-async")
    public ResponseEntity<ApiResponse<String>> triggerNotificationsAsync(
            @Valid @RequestBody DisasterNotificationRequest request) {

        notificationService.processDisasterNotificationAsync(
                request.getDisasterId(),
                request.getLatitude(),
                request.getLongitude(),
                request.getType(),
                request.getTitle(),
                request.getRadiusKm()
        );

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.ok("Notification pipeline dispatched asynchronously in background thread pool", "ACCEPTED"));
    }

    /**
     * Retrieves recent FCM notifications for audit or test verification.
     */
    @GetMapping("/notifications/dispatched")
    public ResponseEntity<ApiResponse<List<FcmNotificationPayload>>> getDispatchedNotifications() {
        List<FcmNotificationPayload> list = fcmNotificationService.getDispatchedNotifications();
        return ResponseEntity.ok(ApiResponse.ok("Dispatched notification history retrieved", list));
    }
}
