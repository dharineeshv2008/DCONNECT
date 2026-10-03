package com.disaster.coord.service;

import com.disaster.coord.dto.FcmNotificationPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Enterprise Firebase Cloud Messaging (FCM) Integration Service.
 * Handles high-throughput push notifications with payload data (Disaster Type, Address, Distance),
 * parallel async execution, and resilient fallback/mocking for testing & staging.
 */
@Service
public class FcmNotificationService {

    private static final Logger log = LoggerFactory.getLogger(FcmNotificationService.class);

    private final RestTemplate restTemplate;
    private final List<FcmNotificationPayload> dispatchedNotifications = new CopyOnWriteArrayList<>();

    @Value("${firebase.fcm.enabled:false}")
    private boolean fcmEnabled;

    @Value("${firebase.fcm.server-key:}")
    private String serverKey;

    @Value("${firebase.fcm.endpoint:https://fcm.googleapis.com/fcm/send}")
    private String fcmEndpoint;

    public FcmNotificationService(RestTemplateBuilder restTemplateBuilder) {
        this.restTemplate = restTemplateBuilder
                .setConnectTimeout(Duration.ofMillis(1500))
                .setReadTimeout(Duration.ofMillis(2000))
                .build();
    }

    /**
     * Dispatches a single push notification synchronously.
     */
    public boolean sendNotification(FcmNotificationPayload payload) {
        if (payload == null || payload.getFcmToken() == null || payload.getFcmToken().isBlank()) {
            log.warn("Cannot send FCM notification: missing or blank FCM token");
            return false;
        }

        // Record to dispatched history for telemetry and test assertions
        dispatchedNotifications.add(payload);

        if (!fcmEnabled || serverKey == null || serverKey.isBlank()) {
            log.info("[FCM SIMULATION] Push sent to token: {}... | Type: {} | Address: {} | Distance: {} km",
                    payload.getFcmToken().substring(0, Math.min(10, payload.getFcmToken().length())),
                    payload.getDisasterType(),
                    payload.getAddress(),
                    String.format(Locale.ROOT, "%.2f", payload.getDistanceKm()));
            return true;
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "key=" + serverKey);

            Map<String, Object> notificationBody = new HashMap<>();
            notificationBody.put("title", payload.getTitle());
            notificationBody.put("body", payload.getBody());
            notificationBody.put("sound", "default");

            Map<String, String> dataPayload = new HashMap<>();
            dataPayload.put("disasterId", String.valueOf(payload.getDisasterId()));
            dataPayload.put("disasterType", payload.getDisasterType());
            dataPayload.put("address", payload.getAddress());
            dataPayload.put("distanceKm", String.format(Locale.ROOT, "%.2f", payload.getDistanceKm()));
            if (payload.getCustomData() != null) {
                dataPayload.putAll(payload.getCustomData());
            }

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("to", payload.getFcmToken());
            requestBody.put("notification", notificationBody);
            requestBody.put("data", dataPayload);
            requestBody.put("priority", "high");

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(fcmEndpoint, request, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("FCM push notification successfully delivered to token: {}", payload.getFcmToken());
                return true;
            } else {
                log.warn("FCM push notification returned status: {}", response.getStatusCode());
                return false;
            }
        } catch (Exception ex) {
            log.error("Failed to send FCM push notification to token {}: {}", payload.getFcmToken(), ex.getMessage());
            return false;
        }
    }

    /**
     * Dispatches notification asynchronously via CompletableFuture.
     */
    public CompletableFuture<Boolean> sendNotificationAsync(FcmNotificationPayload payload) {
        return CompletableFuture.supplyAsync(() -> sendNotification(payload));
    }

    /**
     * Dispatches batch of notifications in parallel.
     */
    public int sendBatchParallel(List<FcmNotificationPayload> payloads) {
        if (payloads == null || payloads.isEmpty()) {
            return 0;
        }

        List<CompletableFuture<Boolean>> futures = payloads.stream()
                .map(this::sendNotificationAsync)
                .toList();

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        long successCount = futures.stream()
                .filter(f -> f.getNow(false))
                .count();

        return (int) successCount;
    }

    public List<FcmNotificationPayload> getDispatchedNotifications() {
        return Collections.unmodifiableList(dispatchedNotifications);
    }

    public void clearDispatchedHistory() {
        dispatchedNotifications.clear();
    }
}
