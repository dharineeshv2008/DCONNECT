package com.dconnect.app.fcm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.dconnect.app.MainActivity;
import com.dconnect.app.R;
import com.dconnect.app.network.ApiClient;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * D-Connect Firebase Cloud Messaging Service.
 *
 * Responsibilities:
 * 1. Generates and refreshes FCM registration token.
 * 2. Sends token + user GPS coordinates to backend: POST /api/save-token
 * 3. Handles incoming disaster push notifications — both foreground and background.
 * 4. Builds and shows rich notifications (WhatsApp-style) visible outside the app.
 */
public class DConnectMessagingService extends FirebaseMessagingService {

    private static final String TAG = "DConnect_FCM";

    private static final String CHANNEL_ID          = "disaster_alerts_channel";
    private static final String CHANNEL_NAME        = "Disaster Alerts";
    private static final String CHANNEL_DESCRIPTION = "Real-time emergency disaster notifications";

    private static final AtomicInteger notificationIdCounter = new AtomicInteger(1000);

    // =========================================================================
    // 1. TOKEN GENERATION & REFRESH
    // Called when a new FCM token is generated (first launch, token rotation)
    // =========================================================================

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);

        Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Log.d(TAG, "🔑 FCM TOKEN GENERATED:  " + token);
        Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        // Persist token locally for offline access
        getSharedPreferences("dconnect_prefs", MODE_PRIVATE)
                .edit()
                .putString("fcm_token", token)
                .apply();

        // Send token + location to D-Connect backend
        ApiClient.sendFcmTokenToBackend(getApplicationContext(), token);
    }

    // =========================================================================
    // 2. HANDLE INCOMING MESSAGES — Foreground (app is open)
    // When app is in foreground, FCM does NOT auto-display — we must show it.
    // When app is in background/killed, FCM auto-displays the notification block.
    // =========================================================================

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Log.d(TAG, "📩 FCM Message received from: " + remoteMessage.getFrom());

        // Extract notification payload (title + body from FCM console or backend)
        String title = "🚨 Disaster Alert";
        String body  = "An emergency has been detected near your location.";

        if (remoteMessage.getNotification() != null) {
            if (remoteMessage.getNotification().getTitle() != null) {
                title = remoteMessage.getNotification().getTitle();
            }
            if (remoteMessage.getNotification().getBody() != null) {
                body = remoteMessage.getNotification().getBody();
            }
        }

        // Extract data payload fields (sent from backend)
        Map<String, String> data = remoteMessage.getData();
        String disasterId    = data.getOrDefault("disasterId",    "");
        String disasterType  = data.getOrDefault("disasterType",  "UNKNOWN");
        String address       = data.getOrDefault("address",       "Nearby Location");
        String distanceKm    = data.getOrDefault("distanceKm",    "");
        String clickAction   = data.getOrDefault("clickAction",   "OPEN_DISASTER_ALERT");

        Log.d(TAG, "📍 Disaster Type: " + disasterType);
        Log.d(TAG, "📍 Address:       " + address);
        Log.d(TAG, "📍 Distance:      " + distanceKm + " km");
        Log.d(TAG, "📍 DisasterID:    " + disasterId);

        // Show local notification (visible even in foreground)
        showDisasterNotification(title, body, disasterId, disasterType, address, distanceKm);
    }

    // =========================================================================
    // 3. BUILD & DISPLAY RICH NOTIFICATION
    // =========================================================================

    private void showDisasterNotification(
            String title,
            String body,
            String disasterId,
            String disasterType,
            String address,
            String distanceKm) {

        ensureNotificationChannelCreated();

        // Intent: tapping notification opens MainActivity with disaster context
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("OPEN_DISASTER_ALERT");
        intent.putExtra("disasterId",   disasterId);
        intent.putExtra("disasterType", disasterType);
        intent.putExtra("address",      address);
        intent.putExtra("distanceKm",   distanceKm);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                notificationIdCounter.get(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Notification sound (WhatsApp-style loud alert)
        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        // Build rich notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_disaster)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle()
                        .bigText(body)
                        .setBigContentTitle(title)
                        .setSummaryText(distanceKm.isEmpty() ? "Nearby" : distanceKm + " km away"))
                .setPriority(NotificationCompat.PRIORITY_HIGH)    // Heads-up / banner notification
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setSound(soundUri)
                .setVibrate(new long[]{0, 500, 200, 500})        // Pattern: wait, vibrate, pause, vibrate
                .setLights(Color.RED, 500, 500)                  // LED flash: red
                .setAutoCancel(true)                             // Dismiss on tap
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_ALARM)  // HIGH importance category
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC); // Show on lock screen

        // Show the notification
        NotificationManagerCompat manager = NotificationManagerCompat.from(this);
        int notifId = notificationIdCounter.getAndIncrement();

        try {
            manager.notify(notifId, builder.build());
            Log.i(TAG, "✅ Disaster notification displayed. ID: " + notifId + " | Type: " + disasterType + " | Addr: " + address);
        } catch (SecurityException se) {
            // Android 13+: POST_NOTIFICATIONS permission not granted yet
            Log.w(TAG, "⚠️ Notification permission not granted (Android 13+). Notification suppressed.", se);
        }
    }

    // =========================================================================
    // 4. CREATE NOTIFICATION CHANNEL (Android 8.0 / API 26+)
    // Must be created before first notification is displayed.
    // =========================================================================

    private void ensureNotificationChannelCreated() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            if (notificationManager == null) return;

            // Only create if it doesn't already exist
            if (notificationManager.getNotificationChannel(CHANNEL_ID) == null) {

                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_HIGH  // Heads-up notification
                );

                channel.setDescription(CHANNEL_DESCRIPTION);
                channel.enableLights(true);
                channel.setLightColor(Color.RED);
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 500, 200, 500});

                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                channel.setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                        audioAttributes
                );

                channel.setShowBadge(true);  // Show badge on app icon (like WhatsApp)
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

                notificationManager.createNotificationChannel(channel);
                Log.d(TAG, "📣 Notification channel created: " + CHANNEL_ID);
            }
        }
    }
}
