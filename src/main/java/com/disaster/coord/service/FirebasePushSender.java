package com.disaster.coord.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.*;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Server-side Spring Boot Service for Firebase Cloud Messaging (FCM) via Firebase Admin SDK.
 * Dispatches high-priority push notifications (including Welcome notifications and Disaster Alerts).
 */
@Service
public class FirebasePushSender {

    private static final Logger log = LoggerFactory.getLogger(FirebasePushSender.class);
    private static final String PROJECT_ID = "disasterconnect-b1861";

    private boolean initialized = false;

    @PostConstruct
    public void init() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                InputStream serviceAccount = getClass().getResourceAsStream("/firebase-service-account.json");
                if (serviceAccount == null) {
                    log.warn("⚠️ firebase-service-account.json not found in classpath. Searching root fallback...");
                    serviceAccount = getClass().getClassLoader().getResourceAsStream("firebase_service_account.json");
                }

                if (serviceAccount != null) {
                    FirebaseOptions options = FirebaseOptions.builder()
                            .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                            .setProjectId(PROJECT_ID)
                            .build();
                    FirebaseApp.initializeApp(options);
                    initialized = true;
                    log.info("✅ Firebase Admin SDK initialized successfully for project: {}", PROJECT_ID);
                } else {
                    log.error("❌ Could not locate firebase-service-account.json in classpath!");
                }
            } else {
                initialized = true;
                log.info("✅ Firebase Admin SDK already initialized.");
            }
        } catch (Exception e) {
            log.error("❌ Failed to initialize Firebase Admin SDK: {}", e.getMessage(), e);
        }
    }

    /**
     * Sends Welcome Notification immediately after token save.
     *
     * Specs:
     * - Title: "Welcome to D-Connect"
     * - Body: "You are now connected to real-time disaster alerts"
     * - Message Type: Notification payload (NOT data-only)
     * - High Priority
     */
    public boolean sendWelcomeNotification(String fcmToken) {
        if (fcmToken == null || fcmToken.isBlank()) {
            log.warn("⚠️ Cannot send Welcome Notification: missing FCM token");
            return false;
        }

        try {
            Notification notification = Notification.builder()
                    .setTitle("Welcome to D-Connect")
                    .setBody("You are now connected to real-time disaster alerts")
                    .build();

            AndroidConfig androidConfig = AndroidConfig.builder()
                    .setPriority(AndroidConfig.Priority.HIGH)
                    .setNotification(AndroidNotification.builder()
                            .setChannelId("disaster_alerts_channel")
                            .setSound("default")
                            .setDefaultSound(true)
                            .setDefaultVibrateTimings(true)
                            .build())
                    .build();

            Map<String, String> data = new HashMap<>();
            data.put("clickAction", "OPEN_DISASTER_ALERT");
            data.put("type", "WELCOME_NOTIFICATION");

            Message message = Message.builder()
                    .setToken(fcmToken)
                    .setNotification(notification)
                    .putAllData(data)
                    .setAndroidConfig(androidConfig)
                    .build();

            if (initialized && !FirebaseApp.getApps().isEmpty()) {
                String response = FirebaseMessaging.getInstance().send(message);
                log.info("🎉 Welcome notification successfully dispatched to token: {}. Message ID: {}",
                        fcmToken.substring(0, Math.min(15, fcmToken.length())) + "...", response);
                return true;
            } else {
                log.warn("⚠️ Firebase Admin SDK not initialized; attempting fallback init...");
                init();
                if (initialized && !FirebaseApp.getApps().isEmpty()) {
                    String response = FirebaseMessaging.getInstance().send(message);
                    log.info("🎉 Welcome notification sent on retry! Message ID: {}", response);
                    return true;
                } else {
                    log.error("❌ Failed to send welcome notification: Firebase Admin SDK uninitialized");
                    return false;
                }
            }
        } catch (Exception ex) {
            log.error("❌ Exception dispatching welcome notification to FCM: {}", ex.getMessage(), ex);
            return false;
        }
    }

    /**
     * Sends an emergency disaster notification to a target FCM device token.
     */
    public boolean sendDisasterAlert(
            String fcmToken,
            String title,
            String body,
            String disasterId,
            String disasterType,
            String address,
            double distanceKm) {

        if (fcmToken == null || fcmToken.isBlank()) {
            return false;
        }

        try {
            Notification notification = Notification.builder()
                    .setTitle(title != null ? title : "🚨 Disaster Alert")
                    .setBody(body != null ? body : "Emergency near your location")
                    .build();

            AndroidConfig androidConfig = AndroidConfig.builder()
                    .setPriority(AndroidConfig.Priority.HIGH)
                    .setNotification(AndroidNotification.builder()
                            .setChannelId("disaster_alerts_channel")
                            .setSound("default")
                            .setDefaultSound(true)
                            .setDefaultVibrateTimings(true)
                            .build())
                    .build();

            Map<String, String> data = new HashMap<>();
            data.put("disasterId", disasterId != null ? disasterId : "");
            data.put("disasterType", disasterType != null ? disasterType : "UNKNOWN");
            data.put("address", address != null ? address : "");
            data.put("distanceKm", String.format("%.2f", distanceKm));
            data.put("clickAction", "OPEN_DISASTER_ALERT");

            Message message = Message.builder()
                    .setToken(fcmToken)
                    .setNotification(notification)
                    .putAllData(data)
                    .setAndroidConfig(androidConfig)
                    .build();

            if (initialized && !FirebaseApp.getApps().isEmpty()) {
                String response = FirebaseMessaging.getInstance().send(message);
                log.info("🚨 Disaster alert push sent to FCM token. Message ID: {}", response);
                return true;
            }
        } catch (Exception ex) {
            log.error("❌ Error sending disaster alert to FCM token: {}", ex.getMessage(), ex);
        }
        return false;
    }
}
