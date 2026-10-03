package com.dconnect.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * D-Connect Main Activity.
 *
 * On launch:
 * 1. Initializes Firebase
 * 2. Requests notification permission (Android 13+)
 * 3. Requests location permission (for GPS)
 * 4. Fetches FCM token → saves to backend via ApiClient
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "DConnect_Main";

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Log.d(TAG, "🚀 D-Connect App starting...");

        // 1. Initialize Firebase (idempotent — safe to call multiple times)
        FirebaseApp.initializeApp(this);

        // 2. Request permissions in sequence
        requestNotificationPermission();

        // 3. Initialize FCM token
        initializeFcmToken();

        // 4. Handle notification tap (deep link into disaster details)
        handleIncomingNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingNotificationIntent(intent);
    }

    // =========================================================================
    // 1. FIREBASE & FCM TOKEN INITIALIZATION
    // =========================================================================

    private void initializeFcmToken() {
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        Log.w(TAG, "⚠️ FCM token fetch failed", task.getException());
                        return;
                    }

                    String token = task.getResult();

                    // ──────────────────────────────────────────────────────
                    // ✅ TOKEN IN LOGCAT — search for this in Android Studio
                    Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    Log.d(TAG, "🔑 FCM TOKEN (copy this for testing): ");
                    Log.d(TAG, "    " + token);
                    Log.d(TAG, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    // ──────────────────────────────────────────────────────

                    // Save token locally
                    SharedPreferences prefs = getSharedPreferences("dconnect_prefs", MODE_PRIVATE);
                    prefs.edit().putString("fcm_token", token).apply();

                    // Send to D-Connect backend
                    com.dconnect.app.network.ApiClient.sendFcmTokenToBackend(
                            getApplicationContext(), token);

                    Toast.makeText(this, "📡 D-Connect connected!", Toast.LENGTH_SHORT).show();
                });
    }

    // =========================================================================
    // 2. ANDROID 13+ NOTIFICATION PERMISSION REQUEST
    // =========================================================================

    private final ActivityResultLauncher<String> notificationPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) {
                    Log.d(TAG, "✅ Notification permission granted");
                } else {
                    Log.w(TAG, "⚠️ Notification permission denied — push alerts will not show on Android 13+");
                    Toast.makeText(this,
                            "Enable notifications to receive disaster alerts",
                            Toast.LENGTH_LONG).show();
                }
            });

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            } else {
                Log.d(TAG, "✅ Notification permission already granted");
            }
        }
    }

    // =========================================================================
    // 3. HANDLE DISASTER NOTIFICATION TAP (Deep Link)
    // =========================================================================

    private void handleIncomingNotificationIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        if ("OPEN_DISASTER_ALERT".equals(action)) {
            String disasterId   = intent.getStringExtra("disasterId");
            String disasterType = intent.getStringExtra("disasterType");
            String address      = intent.getStringExtra("address");
            String distanceKm   = intent.getStringExtra("distanceKm");

            Log.d(TAG, "🔔 Notification tapped! Opening disaster:");
            Log.d(TAG, "   ID:      " + disasterId);
            Log.d(TAG, "   Type:    " + disasterType);
            Log.d(TAG, "   Address: " + address);
            Log.d(TAG, "   Dist:    " + distanceKm + " km");

            // TODO: Navigate to disaster detail screen or highlight it on map
            // e.g., getSupportFragmentManager()...
            //       navigate(DisasterDetailFragment.newInstance(disasterId))
        }
    }
}
