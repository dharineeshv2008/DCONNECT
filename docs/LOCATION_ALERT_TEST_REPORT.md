# D-Connect Location-Based Alerting (25 km Radius) & Verification Report

## 1. Executive Summary

This report documents the implementation, mathematical verification, trigger security, and automated test results for D-Connect's **25 km (25,000 meters) Location-Based Disaster Alerting System**.

### Key Architectural Guarantees Verified
1. **Strict 25.0 km (25,000 meters) Radius**:
   - Enforced across Spring Boot (`DisasterNotificationService.DEFAULT_NOTIFICATION_RADIUS_KM = 25.0`, `DisasterEventListener`, `AdminService`, `application.yml`), Node.js (`server.js`, `supabaseClient.js`, `telegramBot.js`), and PostgreSQL (`supabase_schema.sql`).
2. **Post-Approval Trigger Only**:
   - Citizen disaster reports (`POST /api/disasters/report`) are saved with status `PENDING` and **never** trigger public proximity push notifications upon submission or ML severity prediction alone.
   - Public 25 km proximity alerts are dispatched **exclusively** when an authorized `ADMIN` approves the incident (`POST /api/admin/approve-disaster` with `action = "APPROVED"` -> status transitions to `VERIFIED_ACTIVE`).
3. **Two-Stage Geospatial Filtering**:
   - **Stage 1 (SQL Bounding Box)**: Pre-filters active users with valid `fcm_token` inside `[minLat, maxLat]` and `[minLon, maxLon]` for 25.0 km.
   - **Stage 2 (Exact Haversine Formula)**: Computes exact great-circle distance $d \le 25.0\text{ km}$ ($R = 6371.0088\text{ km}$).
4. **Idempotency & Token Deduplication**:
   - Deduplicates identical `fcm_token` values (`Set<String> seenTokens`) so a physical device linked to multiple test accounts receives at most **one** push notification per approved disaster.
5. **Production UI Cleanup**:
   - All "Get My Token" / "Get My Device Token" debug buttons, modals (`#getDeviceTokenModal`), and WebView dialog bridges (`showDeviceTokenDialog`) have been removed from Web (`public/index.html`, `src/main/resources/static/index.html`, `index.html`, `app.js`) and Android (`compile_real_apk.py`), while preserving automatic background FCM token registration.

---

## 2. Geospatial Boundary Test Matrix (Origin: Chennai Central `13.0827, 80.2707`)

| Test Case | Target Location / Offset | Calculated Distance | Radius Threshold | Expected Decision | Actual Result |
|---|---|---|---|---|---|
| **Boundary 1: Exact Epicenter** | `(13.0827, 80.2707)` | `0.00 km` (`0 m`) | `<= 25.00 km` | **NOTIFY** | **PASS (Notified)** |
| **Boundary 2: Inner Urban Zone** | Marina Beach `(13.0500, 80.2824)` | `3.85 km` (`3,850 m`) | `<= 25.00 km` | **NOTIFY** | **PASS (Notified)** |
| **Boundary 3: 5.0 km North** | `(13.1277, 80.2707)` | `5.00 km` (`5,000 m`) | `<= 25.00 km` | **NOTIFY** | **PASS (Notified)** |
| **Boundary 4: Just Inside (24.9 km)** | `(13.3066, 80.2707)` | `24.90 km` (`24,900 m`) | `<= 25.00 km` | **NOTIFY** | **PASS (Notified)** |
| **Boundary 5: Exact Boundary (25.0 km)** | `(13.3075, 80.2707)` | `25.00 km` (`25,000 m`) | `<= 25.00 km` | **NOTIFY** | **PASS (Notified)** |
| **Boundary 6: Just Outside (25.1 km)** | `(13.3084, 80.2707)` | `25.10 km` (`25,100 m`) | `<= 25.00 km` | **EXCLUDE** | **PASS (Excluded)** |
| **Boundary 7: Outer Suburb (Tambaram)** | `(12.9249, 80.1000)` | `25.49 km` (`25,490 m`) | `<= 25.00 km` | **EXCLUDE** | **PASS (Excluded)** |
| **Boundary 8: Far City (50.0 km)** | `(13.5324, 80.2707)` | `50.00 km` (`50,000 m`) | `<= 25.00 km` | **EXCLUDE** | **PASS (Excluded)** |
| **Edge Case 9: Invalid Coordinates** | `(105.000, 200.000)` | `Invalid` | `N/A` | **ABORT SAFELY** | **PASS (0 Sent, No Crash)** |
| **Edge Case 10: Duplicate FCM Token** | 2 users sharing `fcm_token_arun_101` | `3.85 km` | `<= 25.00 km` | **SEND ONCE** | **PASS (Deduplicated to 1)** |

---

## 3. Approval-Gate Verification Matrix

| Workflow Step | Actor | Endpoint | Incident Status | Proximity Alert Triggered? | Verification Status |
|---|---|---|---|---|---|
| 1. Citizen submits disaster report | `USER` | `POST /api/disasters/report` | `PENDING` | **NO** (Blocked until verified) | **PASS** |
| 2. ML service predicts `CRITICAL` severity | `SYSTEM` | `POST /api/predict` | `PENDING` | **NO** (ML does not bypass Admin) | **PASS** |
| 3. Admin rejects disaster report | `ADMIN` | `POST /api/admin/approve-disaster` (`REJECTED`) | `REJECTED` | **NO** | **PASS** |
| 4. Admin approves disaster report | `ADMIN` | `POST /api/admin/approve-disaster` (`APPROVED`) | `VERIFIED_ACTIVE` | **YES** (25 km radius dispatch) | **PASS** |

---

## 4. Automated Test Suite Execution Summary

### Java Spring Boot JUnit 5 Suite (`mvn test`)
- `GeoLocationUtilTest`:
  - `testCalculateDistanceKm_KnownPoints` — **PASS**
  - `testCalculateDistanceKm_ZeroDistance` — **PASS**
  - `testCalculateBoundingBox_EnclosesRadius` (25.0 km) — **PASS**
  - `testStrict25KmRadiusBoundaries` (0km, 5km, 24.9km, 25.0km, 25.1km, 50km) — **PASS**
  - `testFormatDistance` — **PASS**
- `DisasterNotificationServiceTest`:
  - `testProcessDisasterNotification_Success` (25.0 km filter + geocoding + FCM) — **PASS**
  - `testProcessDisasterNotification_DeduplicatesTokens` — **PASS**
  - `testProcessDisasterNotification_InvalidCoordinates` — **PASS**
  - `testProcessDisasterNotification_ZeroNearbyUsers` — **PASS**
  - `testProcessDisasterNotification_ExecutionSpeedWithinSla` (< 2000 ms) — **PASS**
- `DisasterNotificationControllerTest`:
  - `testTriggerNotifications_ReturnsOk` (25.0 km) — **PASS**
  - `testTriggerNotificationsAsync_ReturnsAccepted` — **PASS**
  - `testGetDispatchedNotifications_ReturnsOk` — **PASS**
- `IncidentPredictionServiceTest`, `IncidentPredictionControllerTest`, `HuggingFaceInferenceClientTest` — **PASS**
