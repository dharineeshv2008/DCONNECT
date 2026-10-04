package com.dconnect.app.network;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Networking Client communicating with D-Connect Backend.
 * Implements REST APIs for Auth, Disasters, Volunteers, Resources, Admin Command Center, and FCM Token registration.
 */
public class ApiClient {

    private static final String TAG = "DConnect_API";
    public static String BASE_URL = "http://10.0.2.2:8000";

    private static final OkHttpClient HTTP_CLIENT = new OkHttpClient.Builder()
            .callTimeout(15, TimeUnit.SECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build();

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    public static final Gson GSON = new Gson();

    public interface ApiCallback {
        void onSuccess(String responseText);
        void onError(String errorMessage);
    }

    /**
     * Registers FCM device token with backend: POST /api/save-device-token
     */
    public static void sendDeviceTokenToBackend(Context context, String userId, String fcmToken, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            int maxRetries = 3;
            int attempt = 0;
            boolean success = false;

            while (attempt < maxRetries && !success) {
                attempt++;
                try {
                    Map<String, Object> payload = new HashMap<>();
                    payload.put("user_id", userId != null ? userId : "");
                    payload.put("fcm_token", fcmToken);
                    payload.put("device", "android");
                    payload.put("device_type", "android");

                    String jsonBody = GSON.toJson(payload);
                    Log.d(TAG, "📤 [Attempt " + attempt + "] POST /api/save-device-token Payload: " + jsonBody);

                    RequestBody body = RequestBody.create(jsonBody, JSON);
                    Request request = new Request.Builder()
                            .url(BASE_URL + "/api/save-device-token")
                            .post(body)
                            .addHeader("Content-Type", "application/json")
                            .build();

                    try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                        String responseText = response.body() != null ? response.body().string() : "";

                        if (response.isSuccessful()) {
                            success = true;
                            Log.i(TAG, "✅ Device token saved to backend: " + responseText);

                            if (context != null) {
                                SharedPreferences prefs = context.getSharedPreferences("dconnect_prefs", Context.MODE_PRIVATE);
                                prefs.edit().putString("fcm_token", fcmToken).putBoolean("token_saved", true).apply();
                            }

                            if (callback != null) callback.onSuccess(responseText);
                            return;
                        } else {
                            Log.w(TAG, "⚠️ Backend HTTP " + response.code() + ": " + responseText);
                        }
                    }
                } catch (IOException e) {
                    Log.w(TAG, "🔁 Network error on attempt " + attempt + ": " + e.getMessage());
                    if (attempt < maxRetries) {
                        try { Thread.sleep(2000L * attempt); } catch (InterruptedException ignored) {}
                    }
                }
            }

            if (!success && callback != null) {
                callback.onError("Failed to register FCM token with backend after " + maxRetries + " retries.");
            }
        });
    }

    /**
     * Authenticates user via POST /api/auth/login
     */
    public static void loginUser(String phone, String password, String role, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Map<String, String> payload = new HashMap<>();
                payload.put("phone", phone);
                payload.put("password", password);
                if (role != null && !role.isBlank()) payload.put("role", role);

                RequestBody body = RequestBody.create(GSON.toJson(payload), JSON);
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/auth/login")
                        .post(body)
                        .addHeader("Content-Type", "application/json")
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        Log.i(TAG, "✅ Login successful: " + responseText);
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        Log.w(TAG, "❌ Login failed HTTP " + response.code() + ": " + responseText);
                        if (callback != null) callback.onError("Login failed: " + responseText);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "❌ Login exception: " + e.getMessage(), e);
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Registers new user via POST /api/auth/register
     */
    public static void registerUser(String name, String phone, String password, String role,
                                     String orgName, String orgRegNo, String skills, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Map<String, String> payload = new HashMap<>();
                payload.put("name", name);
                payload.put("phone", phone);
                payload.put("password", password);
                payload.put("role", role != null ? role : "CITIZEN");
                if (orgName != null && !orgName.isBlank()) payload.put("organizationName", orgName);
                if (orgRegNo != null && !orgRegNo.isBlank()) payload.put("organizationRegNo", orgRegNo);
                if (skills != null && !skills.isBlank()) payload.put("volunteerSkills", skills);

                RequestBody body = RequestBody.create(GSON.toJson(payload), JSON);
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/auth/register")
                        .post(body)
                        .addHeader("Content-Type", "application/json")
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        Log.i(TAG, "✅ Registration successful: " + responseText);
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        Log.w(TAG, "❌ Registration failed HTTP " + response.code() + ": " + responseText);
                        if (callback != null) callback.onError("Registration failed: " + responseText);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "❌ Registration exception: " + e.getMessage(), e);
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Fetches disasters feed: GET /api/disasters
     */
    public static void getDisasters(String typeFilter, String statusFilter, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                String url = BASE_URL + "/api/disasters";
                boolean hasQuery = false;
                if (typeFilter != null && !typeFilter.isBlank()) {
                    url += "?type=" + typeFilter;
                    hasQuery = true;
                }
                if (statusFilter != null && !statusFilter.isBlank()) {
                    url += (hasQuery ? "&status=" : "?status=") + statusFilter;
                }

                Request request = new Request.Builder().url(url).get().build();
                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to load disasters: HTTP " + response.code());
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Submits a new disaster report: POST /api/disasters/report
     */
    public static void reportDisaster(String title, String type, String locationName,
                                      double latitude, double longitude, String description, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Map<String, Object> payload = new HashMap<>();
                payload.put("title", title);
                payload.put("type", type);
                payload.put("locationName", locationName);
                payload.put("latitude", latitude);
                payload.put("longitude", longitude);
                payload.put("description", description);

                RequestBody body = RequestBody.create(GSON.toJson(payload), JSON);
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/disasters/report")
                        .post(body)
                        .addHeader("Content-Type", "application/json")
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to submit report: " + responseText);
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Updates disaster status: PUT /api/disasters/{id}/status
     */
    public static void updateDisasterStatus(String disasterId, String newStatus, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Map<String, String> payload = new HashMap<>();
                payload.put("status", newStatus);

                RequestBody body = RequestBody.create(GSON.toJson(payload), JSON);
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/disasters/" + disasterId + "/status")
                        .put(body)
                        .addHeader("Content-Type", "application/json")
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to update status: " + responseText);
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Fetches emergency resources: GET /api/resources
     */
    public static void getResources(ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Request request = new Request.Builder().url(BASE_URL + "/api/resources").get().build();
                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to load resources");
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Submits a new resource offer: POST /api/resources
     */
    public static void createResource(String category, String description, int quantity, String unit,
                                       String status, String address, double latitude, double longitude,
                                       String phone, String availableUntil, ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Map<String, Object> payload = new HashMap<>();
                payload.put("resourceType", category);
                payload.put("description", description);
                payload.put("quantity", quantity);
                payload.put("unit", unit);
                payload.put("status", status);
                payload.put("address", address);
                payload.put("latitude", latitude);
                payload.put("longitude", longitude);
                if (phone != null && !phone.isBlank()) payload.put("phone", phone);
                if (availableUntil != null && !availableUntil.isBlank()) payload.put("availableUntil", availableUntil);

                RequestBody body = RequestBody.create(GSON.toJson(payload), JSON);
                Request request = new Request.Builder()
                        .url(BASE_URL + "/api/resources")
                        .post(body)
                        .addHeader("Content-Type", "application/json")
                        .build();

                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to offer resource: " + responseText);
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Fetches volunteers list: GET /api/volunteers
     */
    public static void getVolunteers(ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Request request = new Request.Builder().url(BASE_URL + "/api/volunteers").get().build();
                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to load volunteers");
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Fetches admin dashboard analytics: GET /api/admin/analytics
     */
    public static void getAdminStats(ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                Request request = new Request.Builder().url(BASE_URL + "/api/admin/analytics").get().build();
                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to load admin stats");
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    /**
     * Reset system data: POST /api/admin/reset-system
     */
    public static void resetSystemData(ApiCallback callback) {
        EXECUTOR.submit(() -> {
            try {
                RequestBody body = RequestBody.create("{}", JSON);
                Request request = new Request.Builder().url(BASE_URL + "/api/admin/reset-system").post(body).build();
                try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                    String responseText = response.body() != null ? response.body().string() : "";
                    if (response.isSuccessful()) {
                        if (callback != null) callback.onSuccess(responseText);
                    } else {
                        if (callback != null) callback.onError("Failed to reset system data");
                    }
                }
            } catch (Exception e) {
                if (callback != null) callback.onError("Network error: " + e.getMessage());
            }
        });
    }
}
