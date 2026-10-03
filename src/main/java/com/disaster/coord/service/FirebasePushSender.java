package com.dconnect.app.service;

import android.util.Log;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;

/**
 * =========================================================
 * BACKEND SPRING BOOT: Firebase Admin FCM v1 Push Sender
 *
 * This class runs on the SERVER (Java Spring Boot), not Android.
 * It sends push notifications to Android devices using
 * Firebase Admin SDK v9 (HTTP v1 API — recommended).
 *
 * Setup:
 * 1. Download firebase-service-account.json from Firebase Console
 *    → Project Settings → Service Accounts → Generate New Private Key
 * 2. Place at: src/main/resources/firebase-service-account.json
 * 3. Add to pom.xml:
 *    <dependency>
 *        <groupId>com.google.firebase</groupId>
 *        <artifactId>firebase-admin</artifactId>
 *        <version>9.3.0</version>
 *    </dependency>
 *    <dependency>
 *        <groupId>com.google.auth</groupId>
 *        <artifactId>google-auth-library-oauth2-http</artifactId>
 *        <version>1.23.0</version>
 *    </dependency>
 * =========================================================
 */
// NOTE: This is a BACKEND service file — Spring Boot only
// It uses firebase-admin SDK which runs server-side
// On Android client, use DConnectMessagingService instead

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class FirebasePushSender {

    private static final String TAG = "FirebasePushSender";

    // Firebase project ID (from google-services.json → project_id)
    private static final String PROJECT_ID = "disasterconnect-b1861";
    private static final String FCM_ENDPOINT =
            "https://fcm.googleapis.com/v1/projects/" + PROJECT_ID + "/messages:send";

    private static GoogleCredentials cachedCredentials = null;

    /**
     * Gets OAuth2 bearer token for Firebase HTTP v1 API authentication.
     * Credentials are cached and auto-refreshed.
     */
    private static String getBearerToken() throws IOException {
        if (cachedCredentials == null) {
            InputStream serviceAccount = FirebasePushSender.class
                    .getResourceAsStream("/firebase-service-account.json");

            if (serviceAccount == null) {
                throw new IOException("firebase-service-account.json not found in classpath. " +
                        "Place it at src/main/resources/firebase-service-account.json");
            }

            cachedCredentials = GoogleCredentials
                    .fromStream(serviceAccount)
                    .createScoped(Collections.singletonList("https://www.googleapis.com/auth/firebase.messaging"));
        }

        cachedCredentials.refreshIfExpired();
        return cachedCredentials.getAccessToken().getTokenValue();
    }

    /**
     * Sends a disaster push notification to a specific FCM device token.
     *
     * Called automatically when:
     *  - A new disaster is created (DisasterService.reportDisaster)
     *  - Admin approves a disaster report (Telegram webhook callback)
     *
     * @param fcmToken    Target device's FCM registration token
     * @param title       Notification title (e.g. "🚨 Disaster Alert")
     * @param body        Notification body (e.g. "Fire at XYZ, 2.3 km from you")
     * @param disasterId  Disaster ID for deep link on notification tap
     * @param disasterType Disaster type (FLOOD, FIRE, EARTHQUAKE, etc.)
     * @param address     Human-readable location from reverse geocoding
     * @param distanceKm  Precise Haversine distance from user's home
     * @return true if HTTP 200 response received, false otherwise
     */
    public static boolean sendDisasterAlert(
            String fcmToken,
            String title,
            String body,
            String disasterId,
            String disasterType,
            String address,
            double distanceKm) {

        try {
            String bearerToken = getBearerToken();

            // ================================================================
            // FCM HTTP v1 JSON Payload
            // ================================================================
            JSONObject message = new JSONObject();

            // Notification block (shown in system tray)
            JSONObject notification = new JSONObject();
            notification.put("title", title != null ? title : "🚨 Disaster Alert");
            notification.put("body",  body  != null ? body  : "Emergency near you");

            // Data block (for app logic: deep link, metadata)
            JSONObject data = new JSONObject();
            data.put("disasterId",   disasterId   != null ? disasterId   : "");
            data.put("disasterType", disasterType != null ? disasterType : "UNKNOWN");
            data.put("address",      address      != null ? address      : "");
            data.put("distanceKm",   String.format("%.2f", distanceKm));
            data.put("clickAction",  "OPEN_DISASTER_ALERT");

            // Android-specific: override channel + priority
            JSONObject androidNotification = new JSONObject();
            androidNotification.put("channel_id",           "disaster_alerts_channel");
            androidNotification.put("sound",                "default");
            androidNotification.put("notification_priority","PRIORITY_HIGH");
            androidNotification.put("default_vibrate_timings", true);
            androidNotification.put("default_sound",        true);
            androidNotification.put("default_light_settings", true);

            JSONObject androidConfig = new JSONObject();
            androidConfig.put("priority",     "high"); // Wake device even in Doze mode
            androidConfig.put("notification", androidNotification);

            // Assemble message
            message.put("token",        fcmToken);
            message.put("notification", notification);
            message.put("data",         data);
            message.put("android",      androidConfig);

            JSONObject payload = new JSONObject();
            payload.put("validate_only", false);
            payload.put("message",       message);

            // ================================================================
            // HTTP POST to FCM HTTP v1 endpoint
            // ================================================================
            URL url = new URL(FCM_ENDPOINT);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);

            byte[] payloadBytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payloadBytes);
            }

            int statusCode = conn.getResponseCode();

            if (statusCode == HttpURLConnection.HTTP_OK) {
                Log.d(TAG, "✅ FCM push sent successfully to token: " + fcmToken.substring(0, 12) + "...");
                return true;
            } else {
                // Read error body for diagnostics
                InputStream errorStream = conn.getErrorStream();
                String errorBody = "";
                if (errorStream != null) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    byte[] buf = new byte[1024];
                    int bytesRead;
                    while ((bytesRead = errorStream.read(buf)) != -1) {
                        bos.write(buf, 0, bytesRead);
                    }
                    errorBody = bos.toString(StandardCharsets.UTF_8.name());
                }
                Log.warn("⚠️ FCM push failed. Status: " + statusCode + " | Error: " + errorBody);
                return false;
            }

        } catch (Exception ex) {
            Log.error("❌ Exception while sending FCM push: " + ex.getMessage(), ex);
            return false;
        }
    }

    // Placeholder for SLF4J-style log (swap with actual Logger in production)
    private static final class Log {
        static void d(String tag, String msg) { System.out.println("[" + tag + "] " + msg); }
        static void warn(String msg) { System.out.println("[WARN] " + msg); }
        static void error(String msg, Throwable t) { System.err.println("[ERROR] " + msg); t.printStackTrace(); }
    }
}
