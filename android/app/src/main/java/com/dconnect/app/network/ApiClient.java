package com.dconnect.app.network;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.gson.Gson;

import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * HTTP API Client for D-Connect Backend.
 *
 * Handles:
 * - Sending FCM Token + GPS Coordinates to POST /api/save-token
 * - Retries on failure
 * - Background thread execution (no NetworkOnMainThreadException)
 */
public class ApiClient {

    private static final String TAG = "DConnect_API";

    // ======================================================================
    // 🔧 CONFIGURE THIS — your backend base URL
    // Production: "https://your-dconnect-backend.vercel.app"
    // Local dev:  "http://10.0.2.2:3000"  (Android emulator → host localhost)
    // ======================================================================
    public static final String BASE_URL = "https://your-dconnect-backend.vercel.app";

    private static final OkHttpClient HTTP_CLIENT = new OkHttpClient.Builder()
            .callTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .build();

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Gson gson = new Gson();

    /**
     * Sends FCM Token + GPS Location to backend POST /api/save-token.
     * Runs on a background thread — safe to call from any context.
     *
     * Payload:
     * {
     *   "userId":    "<USER_ID>",
     *   "latitude":  "<LATITUDE>",
     *   "longitude": "<LONGITUDE>",
     *   "fcmToken":  "<FCM_TOKEN>"
     * }
     */
    public static void sendFcmTokenToBackend(Context context, String fcmToken) {
        executor.submit(() -> {
            try {
                SharedPreferences prefs = context.getSharedPreferences("dconnect_prefs", Context.MODE_PRIVATE);
                String userId = prefs.getString("user_id", "");

                if (userId.isEmpty()) {
                    Log.w(TAG, "⚠️ user_id not set in prefs — token will be registered without userId");
                }

                // Try to get last known GPS location
                tryGetLocationAndSend(context, fcmToken, userId);

            } catch (Exception e) {
                Log.e(TAG, "❌ Unexpected error in sendFcmTokenToBackend: " + e.getMessage(), e);
            }
        });
    }

    private static void tryGetLocationAndSend(Context context, String fcmToken, String userId) {
        boolean hasLocation = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (hasLocation) {
            FusedLocationProviderClient locationClient =
                    LocationServices.getFusedLocationProviderClient(context);

            locationClient.getLastLocation()
                    .addOnSuccessListener(location -> {
                        if (location != null) {
                            executor.submit(() ->
                                    doPostSaveToken(context, userId, fcmToken,
                                            String.valueOf(location.getLatitude()),
                                            String.valueOf(location.getLongitude())));
                        } else {
                            Log.w(TAG, "📍 GPS location unavailable — sending token without coordinates");
                            executor.submit(() ->
                                    doPostSaveToken(context, userId, fcmToken, "", ""));
                        }
                    })
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "📍 GPS lookup failed: " + e.getMessage());
                        executor.submit(() ->
                                doPostSaveToken(context, userId, fcmToken, "", ""));
                    });
        } else {
            Log.w(TAG, "📍 No location permission — sending token without coordinates");
            doPostSaveToken(context, userId, fcmToken, "", "");
        }
    }

    /**
     * Performs the actual HTTP POST to /api/save-token.
     */
    private static void doPostSaveToken(Context context,
                                         String userId,
                                         String fcmToken,
                                         String latitude,
                                         String longitude) {
        int maxRetries = 3;
        int attempt = 0;

        while (attempt < maxRetries) {
            attempt++;
            try {
                Map<String, String> payload = new HashMap<>();
                payload.put("userId",    userId);
                payload.put("fcmToken",  fcmToken);
                payload.put("latitude",  latitude);
                payload.put("longitude", longitude);

                String jsonBody = gson.toJson(payload);
                Log.d(TAG, "📤 Attempt " + attempt + " — POST /api/save-token: " + jsonBody);

                RequestBody body = RequestBody.create(jsonBody, JSON);
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/save-token")
                        .post(body)
                        .addHeader("Content-Type", "application/json")
                        .addHeader("Accept",       "application/json")
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseBody = response.body() != null ? response.body().string() : "";

                    if (response.isSuccessful()) {
                        Log.i(TAG, "✅ FCM token saved to backend. Response: " + responseBody);

                        // Persist token registration flag
                        context.getSharedPreferences("dconnect_prefs", Context.MODE_PRIVATE)
                                .edit()
                                .putString("fcm_token", fcmToken)
                                .putBoolean("token_registered", true)
                                .apply();
                        return; // Success — stop retrying
                    } else {
                        Log.w(TAG, "⚠️ Backend returned non-2xx: " + response.code() + " — " + responseBody);
                    }
                }
            } catch (IOException e) {
                Log.w(TAG, "🔁 Network error on attempt " + attempt + ": " + e.getMessage());
                if (attempt < maxRetries) {
                    try { Thread.sleep(2000L * attempt); } catch (InterruptedException ignored) {}
                }
            }
        }

        Log.e(TAG, "❌ All " + maxRetries + " attempts to register FCM token failed");
    }

    /**
     * Sends a test HTTP GET to verify backend connectivity.
     */
    public static void pingBackend(Callback callback) {
        executor.submit(() -> {
            try {
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/config")
                        .get()
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    if (response.isSuccessful()) {
                        Log.i(TAG, "✅ Backend ping successful: " + response.code());
                        callback.onSuccess("Backend connected: " + response.code());
                    } else {
                        callback.onError("Backend returned: " + response.code());
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "❌ Backend ping failed: " + e.getMessage());
                callback.onError(e.getMessage());
            }
        });
    }

    public interface Callback {
        void onSuccess(String message);
        void onError(String error);
    }
}
