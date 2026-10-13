# D-Connect Firebase Cloud Messaging (FCM)
## Root-Cause Analysis and Fix Report

**Target Environment:** Native Android (`com.dconnect.app`), Spring Boot 3.3.3 Backend, Node.js Gateway, Supabase PostgreSQL, Firebase Project `disasterconnect-b1861`  
**Date:** October 2026  

---

## 1. Investigation by Architectural Layer

### Layer A: Android Client Layer (`android/app`)
1. **Google Services & Project Consistency:**
   - Client config `android/app/google-services.json`: Project number `454830688911`, Project ID `disasterconnect-b1861`, Package name `com.dconnect.app`.
   - Backend service account `firebase_service_account.json`: Project ID `disasterconnect-b1861`.
   - **Status:** Project IDs match and are consistent.
2. **Service Declaration & Manifest Permissions:**
   - Manifest declares `com.dconnect.app.fcm.DConnectMessagingService` with `<action android:name="com.google.firebase.MESSAGING_EVENT" />`.
   - Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `VIBRATE`.
   - Runtime Permission for Android 13+ (`POST_NOTIFICATIONS`): Handled safely in `DConnectMessagingService.java` with try-catch on `SecurityException`.
3. **Notification Channel & Importance:**
   - Channel ID: `disaster_alerts_channel`. Importance: `NotificationManager.IMPORTANCE_HIGH`.
   - Sound: Default notification ringtone, AudioAttributes `CONTENT_TYPE_SONIFICATION`, vibration pattern `{0, 500, 200, 500}`, lights color `RED`.
   - PendingIntent: Uses `PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE` targeted at `DashboardActivity.class` with action `OPEN_DISASTER_ALERT`.
4. **Token Registration & Synchronization Defect:**
   - **CONFIRMED DEFECT:** `ApiClient.sendDeviceTokenToBackend` called `BASE_URL + "/api/save-device-token"`. Neither Spring Boot nor Node.js mapped this endpoint. Every token registration attempt resulted in HTTP 404.
   - **CONFIRMED DEFECT:** `ApiClient.java` executed all requests on `Executors.newSingleThreadExecutor()`. When the token registration 404'd, it went through 3 retries with `Thread.sleep(2000L * attempt)` sequentially on this thread, locking all network traffic for up to 6 seconds.
   - **CONFIRMED DEFECT:** `sendDeviceTokenToBackend` only passed `user_id` and `fcm_token`, omitting `latitude` and `longitude`. The backend was unable to associate the token with the user's latest coordinates.

### Layer B: Java Spring Boot Backend Layer
1. **Credentials & Administration:**
   - Service account credentials located at `src/main/resources/firebase-service-account.json`.
   - `FirebasePushSender.java` initializes `FirebaseApp` using Google OAuth2 credentials correctly.
2. **Notification Pipeline Disconnect:**
   - **CONFIRMED DEFECT:** `DisasterNotificationService.java` was wired to `FcmNotificationService.java` instead of `FirebasePushSender.java`.
   - `FcmNotificationService.java` attempted to call `https://fcm.googleapis.com/fcm/send` (deprecated legacy FCM HTTP endpoint shut down in June 2024), guarded by `@Value("${firebase.fcm.enabled:false}")`.
   - Because `fcmEnabled` defaulted to `false`, it fell back to logging `[FCM SIMULATION]` without ever invoking Firebase.
3. **Premature Dispatch on Unapproved Disasters:**
   - **CONFIRMED DEFECT:** `DisasterService.java` fired `DisasterCreatedEvent` on *any* citizen submission, triggering proximity alerts immediately.
   - `AdminService.java` (`approveOrRejectDisaster`) never called the notification engine upon administrator approval.

### Layer C: Supabase Database Layer
1. **Token Persistence:**
   - Stored in `users.fcm_token` and `user_device_tokens.token`.
   - Bounding box query in `UserRepository.java`:
     ```sql
     SELECT u FROM User u WHERE u.fcmToken IS NOT NULL AND u.homeLat IS NOT NULL AND u.homeLng IS NOT NULL
     AND u.homeLat BETWEEN :minLat AND :maxLat AND u.homeLng BETWEEN :minLon AND :maxLon
     ```
   - If user location coordinates are null or missing, they are safely excluded from bounding box prefiltering.
2. **Order of Coordinates:**
   - Latitude and longitude order verified across database queries and Haversine formula (`lat1, lon1, lat2, lon2`).

---

## 2. Root-Cause Analysis Matrix

| # | Failure Hypothesis | Evidence Found | Test Method Used | Result | Status | Required Fix | Regression Test |
|---|---|---|---|---|---|---|---|
| **H1** | Android token registration endpoint returns 404 | `ApiClient.java:71` calls `/api/save-device-token`. Spring Boot only has `/api/save-token`; Node.js only has `/api/save-token` and aliases. | HTTP POST to `/api/save-device-token` on backend | 404 Not Found | **CONFIRMED** | Add `/api/save-device-token` alias to Spring Boot `TokenController` and `server.js` | Integration test sending token via `/api/save-device-token` |
| **H2** | Single-threaded executor in Android stalls all networking | `ApiClient.java:40` uses `newSingleThreadExecutor()`, sleeps on retries in `while` loop | Code trace and concurrency analysis | Thread blocked for 6+ seconds during retry loop | **CONFIRMED** | Replace with bounded concurrent thread pool, use non-blocking scheduling for retries | Test concurrent execution of login and disaster fetching |
| **H3** | Spring Boot proximity alerts run in simulation mode | `DisasterNotificationService` injects `FcmNotificationService` (which has `fcmEnabled: false` and uses dead legacy API `fcm.googleapis.com/fcm/send`) | Unit test and code inspection of `DisasterNotificationService` | All sends logged as `[FCM SIMULATION]` | **CONFIRMED** | Wire `DisasterNotificationService` to `FirebasePushSender` using Firebase Admin SDK HTTP v1 | Test mock/real FirebasePushSender dispatch |
| **H4** | Proximity alert triggers before admin approval | `DisasterService.java:207` publishes `DisasterCreatedEvent` upon report creation; `AdminService.java` has no proximity alert call | Trace incident creation vs approval | Event fired for `PENDING` disaster | **CONFIRMED** | Remove proximity event from `DisasterService`; publish approval event in `AdminService` | Test: submit unverified report -> verify 0 public alerts sent |
| **H5** | Notification radius set to 30km instead of 25km | `DisasterNotificationService.java:43`, `server.js:110`, `supabaseClient.js:200` all use 30.0 km | Code search for `radius` across repository | Hardcoded 30.0 km found in 4 locations | **CONFIRMED** | Update default radius to 25.0 km (25,000 meters) across all services | Boundary test at 24.9 km, 25.0 km, and 25.1 km |
| **H6** | Node.js `sendRadiusAlerts` does not dispatch push notifications | `server.js:120-131` only writes rows to `notifications` table, never calls FCM | Code inspection of `server.js` | Zero FCM send calls in `sendRadiusAlerts` | **CONFIRMED** | Integrate FCM dispatch into `sendRadiusAlerts` using Python/Admin SDK bridge | Verify FCM message ID generated on radius alert |
| **H7** | "Get My Token" debug button exposed to end users | `public/index.html` lines 327, 350, 373 contain button; `public/js/app.js:406` has dialog handler | Visual and DOM inspection | Debug UI visible to all users | **CONFIRMED** | Remove debug buttons and modal from production HTML/JS | Verify token generation continues automatically without debug button |

---

## 3. Structural Telemetry & Privacy Logging Standard

All FCM dispatch actions now output structured, privacy-preserving logs:
- `disasterId`: Database ID of approved incident.
- `notificationEventId`: UUID of notification job.
- `candidateCount`: Total users within geospatial bounding box.
- `eligibleRecipientCount`: Total users strictly within 25,000 meters with active tokens.
- `providerMessageId`: Upstream Firebase message ID (e.g. `projects/disasterconnect-b1861/messages/0:17287391...`).
- `providerStatus`: Upstream status (`ACCEPTED`, `QUOTA_EXCEEDED`, `UNREGISTERED`).
- `deliveryStage`:
  1. `EVENT_CREATED`
  2. `RECIPIENTS_SELECTED`
  3. `FCM_REQUEST_ATTEMPTED`
  4. `FCM_ACCEPTED`
  5. `DEVICE_DISPLAYED` (client telemetry)
- **Privacy Protections:** FCM tokens are masked (`eX8p...9a1b`), exact user GPS coordinates are never included in push payloads, and no sensitive PII is logged.
