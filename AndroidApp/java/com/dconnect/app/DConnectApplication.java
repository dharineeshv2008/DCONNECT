package com.dconnect.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.util.Log;

import com.google.firebase.FirebaseApp;

/**
 * Global Application Context for D-Connect Android Native Application.
 */
public class DConnectApplication extends Application {

    private static final String TAG = "DConnect_App";
    public static final String CHANNEL_ID = "disaster_alerts_channel";

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "🚀 Initializing D-Connect Application...");

        try {
            FirebaseApp.initializeApp(this);
            Log.i(TAG, "✅ FirebaseApp initialized successfully.");
        } catch (Exception e) {
            Log.e(TAG, "❌ FirebaseApp initialization error: " + e.getMessage(), e);
        }

        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Disaster Alerts",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Real-time emergency disaster notifications");
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
                channel.setShowBadge(true);

                notificationManager.createNotificationChannel(channel);
                Log.i(TAG, "📣 Notification Channel initialized");
            }
        }
    }
}
