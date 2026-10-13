# D-Connect — Hugging Face Inference API Migration Plan

## 1. Executive Summary & Objective

This document outlines the architectural audit and comprehensive migration plan for replacing the legacy, dataset-trained local Machine Learning (ML) pipeline in D-Connect with the hosted **Hugging Face Inference Providers Router API**.

### Target Architecture
- **Inference Model**: `Qwen/Qwen2.5-7B-Instruct`
- **API Base URL**: `https://router.huggingface.co/v1`
- **Chat Completions Endpoint**: `https://router.huggingface.co/v1/chat/completions`
- **Authentication**: Bearer token via environment variable `HF_TOKEN`
- **Model Identifier**: Configurable via environment variable `HF_MODEL_ID` (Default: `Qwen/Qwen2.5-7B-Instruct`)
- **Backend Service**: Java Spring Boot 3.3 (`IncidentPredictionService`, `HuggingFaceInferenceClient`)
- **Persistence Layer**: Supabase PostgreSQL (`disasters.ml_severity` and `ml_predictions` audit table)

---

## 2. Phase 1 — Comprehensive Repository Audit

### 2.1 Existing ML Inference & Training Code
1. **`ml_pipeline.py`**:
   - Trains scikit-learn TF-IDF + LogisticRegression / MultinomialNB on disaster text corpora.
   - Outputs binary pickle files `model.pkl` (94 KB) and `vectorizer.pkl` (70 KB).
   - Obsolete once external API is integrated.
2. **`python_ml_standalone.py`**:
   - Pure-Python TF-IDF and Naive Bayes classifier without numpy/scikit-learn dependencies.
   - Also used for offline experimentation and pickle generation.
   - Obsolete once external API is integrated.
3. **`DisasterMLPipeline.java`**:
   - Standalone experimental in-memory Java TF-IDF classifier with hardcoded text samples in `com.disaster.coord.ml`.
   - Obsolete once external API is integrated.
4. **`api_service.py`**:
   - FastAPI server exposing `POST /predict`, `GET /`.
   - Loads `model.pkl` and `vectorizer.pkl` and falls back to regex keywords.
   - Also contained `/save-token`, `/send-test`, `/send-notification` endpoints that are already natively provided by Spring Boot (`TokenController`, `FcmNotificationService`).
   - Obsolete once Java Spring Boot natively provides prediction and client endpoints.

### 2.2 Datasets & Generated Artifacts
- **`datasets/`** directory: Contains ~38 MB of legacy training files:
  - `2013_Pakistan_eq_CF_labeled_data.tsv`
  - `2014_California_Earthquake_CF_labeled_data.tsv`
  - `2014_India_floods_CF_labeled_data.tsv`
  - `test.parquet`, `train.parquet`, `validation.parquet`, `entities.csv`, `records.csv`
  - `kaggle nlp/` subfolder
- **`model.pkl`** (94,313 bytes) and **`vectorizer.pkl`** (70,411 bytes).
- All candidates for safe archival/deletion after external inference verification.

### 2.3 Prediction API Endpoints & Integration Points
- **Node.js Gateway (`server.js`)**:
  - `getMlSeverityPrediction(descriptionText)`: Sends HTTP POST to `http://127.0.0.1:8000/predict`.
  - Exposes `POST /predict` and `POST /api/predict` as proxies.
  - Calls prediction inside incident creation (`POST /api/disasters/report` or `POST /api/incidents`).
- **Spring Boot Backend (`DisasterService.java`)**:
  - Currently saves `disaster.setSeverity(...)` defaulting to `MEDIUM` if omitted.
  - Integration target: Inject `IncidentPredictionService` into `DisasterService` and expose `POST /predict` & `POST /api/predict` from Spring Boot.
- **Spring Boot Port**:
  - Configured via `server.port: ${PORT:8000}`. By running Spring Boot on port 8000, `server.js` and external clients seamlessly communicate with the Java service.

### 2.4 Database Entities, Columns & Repositories
- **`disasters` table**:
  - Contains column `ml_severity VARCHAR(50)` / `TEXT` in Supabase PostgreSQL schema.
  - Already mapped in `Disaster.java` or ready for direct persistence.
- **`ml_predictions` table**:
  - Audit logging table referenced in `supabaseClient.js` (`disaster_id`, `predicted_severity`, `confidence`, `model_version`, `description_text`).
  - Spring Boot will map this via `IncidentPrediction` entity and `IncidentPredictionRepository` with fields for `severity`, `reason`, `evidence`, `modelId`, and `status`.

### 2.5 Prediction Consumers
- **Frontend Web (`src/main/resources/static/js/app.js` & `index.html`)**:
  - Displays incident severity badges: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
  - Admin incident review and inline status/severity overrides (`updateAdminInlineSeverity`).
- **Android Application (`android/` & `AndroidApp/`)**:
  - Submits incident reports to `BASE_URL + "/api/disasters/report"`.
  - Receives `DisasterResponse` containing `severity` and incident metadata.
- **Telegram Admin Bot (`telegramBot.js`)**:
  - Formats incident approval cards:
    ```
    New Disaster Report 🚨
    Description: <desc>
    ML Prediction: <severity> (Confidence: <pct>%)
    Location: <loc>
    Approve / Reject
    ```
  - Receives `ml_severity` and `mlSeverity` from the disaster creation response.

### 2.6 Unrelated Python & Project Scripts (PRESERVE)
The following files perform tasks unrelated to local ML and **must not be deleted**:
- `build_apk.py` & `compile_real_apk.py`: Android APK packaging and AAPT2 compilation scripts.
- `test_production_auth.py` & `test_reset_and_auth.py`: Authentication testing suites.
- `firebase_config.py` & `fcm_tokens.db`: Standalone utility scripts.
- Operational database tables and migration scripts.

---

## 3. Hugging Face Inference Router Specifications

### 3.1 Endpoint & Authentication
- **Base URL**: `https://router.huggingface.co/v1`
- **Path**: `/chat/completions`
- **Method**: `POST`
- **Headers**:
  ```http
  Authorization: Bearer <HF_TOKEN>
  Content-Type: application/json
  User-Agent: D-Connect-Incident-Service/1.0
  ```

### 3.2 Model & Provider Routing
- Default Model: `Qwen/Qwen2.5-7B-Instruct`
- Provider selection: The Hugging Face serverless router automatically load balances requests across providers (e.g., Together AI, Fireworks, Nebius, Hyperbolic, DeepInfra).
- Suffix routing supported via `HF_MODEL_ID` configuration:
  - `Qwen/Qwen2.5-7B-Instruct` (Automatic routing)
  - `Qwen/Qwen2.5-7B-Instruct:fastest` (Lowest latency)
  - `Qwen/Qwen2.5-7B-Instruct:together` (Explicit provider)

### 3.3 Prompt & Schema Contract
Request JSON payload:
```json
{
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "messages": [
    {
      "role": "system",
      "content": "You are a disaster severity assessment AI for emergency dispatch coordination. Assess the incident description and determine the severity level strictly as one of: LOW, MEDIUM, HIGH, CRITICAL.\n\nSeverity Definitions:\n- LOW: Minor localized incidents, small leaks, controlled kitchen fires, trash can fires, light weather updates, no injuries, no structural risk.\n- MEDIUM: Localized damage, water logging, fallen trees blocking roads, localized power outages, rising river levels, no confirmed fatalities.\n- HIGH: Major wildfires, residential structural fire, severe flash floods, category 3+ storms, building damage, hospital evacuation, multiple injuries.\n- CRITICAL: Catastrophic mass-casualty events, structural building collapse with people trapped, super typhoons, major dam breach, lethal toxic gas cloud, imminent loss of life.\n\nReturn ONLY a valid JSON object with exactly these three keys:\n{\n  \"severity\": \"LOW\" | \"MEDIUM\" | \"HIGH\" | \"CRITICAL\",\n  \"reason\": \"Concise rationale (1-2 sentences)\",\n  \"evidence\": \"Key keywords or phrases extracted directly from the description\"\n}"
    },
    {
      "role": "user",
      "content": "Disaster Type: FLOOD\nTitle: Road inundation\nDescription: Heavy water logging along arterial road, traffic halted."
    }
  ],
  "temperature": 0.1,
  "max_tokens": 250,
  "response_format": {
    "type": "json_object"
  }
}
```

Contract Validation Rules:
1. `severity` must match exactly one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (case-insensitive normalized to uppercase).
2. Malformed JSON or missing fields result in validation rejection.
3. No artificial confidence calibration: confidence is omitted or reported as uncalibrated.
4. Model decision is advisory only — humans (Admins) retain exclusive authority to verify or dismiss incidents.

---

## 4. Resilience, Failure Handling & Security Policies

### 4.1 Secret Management
- Read `HF_TOKEN` and `HF_MODEL_ID` exclusively from system environment variables or Spring configuration (`@Value("${huggingface.api.token:${HF_TOKEN:}}")`).
- Tokens must **never** be logged, returned in API payloads, saved to git, or broadcasted to Telegram.
- In logs, masks token: `hf_****...`.

### 4.2 Timeouts & Bounded Retries
- HTTP Connect Timeout: 5 seconds.
- HTTP Read Timeout: 15 seconds.
- Retry Policy: Maximum 2 bounded retries with exponential backoff (500ms, 1500ms) only for transient errors (HTTP 429, 502, 503, 504, or SocketTimeout).
- Permanent errors (HTTP 401 Unauthorized, HTTP 400 Bad Request, HTTP 404 Model Not Found) fail fast without retrying.

### 4.3 Fallback & Incident Preservation
- If Hugging Face API call fails (timeout, quota exhausted, invalid token, provider outage):
  - The incident report is **preserved safely** in PostgreSQL.
  - The prediction status is marked as `PENDING` or `FAILED`.
  - Severity defaults to `MEDIUM` (or reporter-submitted severity if provided).
  - Never silently report false `LOW` severity during outages.

---

## 5. Execution Roadmap & Verification Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Comprehensive repository audit & migration plan | **Completed** |
| Phase 2 | Implemented `HuggingFaceInferenceClient` & `IncidentPredictionService` in Java Spring Boot | **Completed** |
| Phase 3 | Severity contract validation (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), structured JSON schema | **Completed** |
| Phase 4 | Secret management via `HF_TOKEN` / `HF_MODEL_ID` with zero hardcoding and `.env.example` | **Completed** |
| Phase 5 | Resilience: timeouts, bounded retries, rate limits, non-silent fallback | **Completed** |
| Phase 6 | Removed obsolete local ML (`ml_pipeline.py`, `python_ml_standalone.py`, `api_service.py`, `model.pkl`, `vectorizer.pkl`, `datasets/`, `DisasterMLPipeline.java`) | **Completed** |
| Phase 7 | Preserved D-Connect core workflows (merging, Telegram, FCM, Android, Supabase) | **Completed** |
| Phase 8 | Executed automated test suite (27/27 tests passed: `BUILD SUCCESS`) & secret leak audit | **Completed** |

---

## 6. Verification Results & Test Suite

### 6.1 Automated Test Execution Summary
All 27 automated tests pass successfully (`BUILD SUCCESS`):
- `HuggingFaceInferenceClientTest`:
  - `testParseLowSeverity`: Validates normalization of `LOW`.
  - `testParseMediumSeverity`: Validates normalization of case-insensitive `medium` to `MEDIUM`.
  - `testParseHighSeverity`: Validates normalization of `HIGH`.
  - `testParseCriticalSeverity`: Validates normalization of `CRITICAL`.
  - `testParseResponseWrappedInMarkdown`: Strips markdown fences ````json ... ```` safely.
  - `testRejectUnsupportedSeverity`: Rejects non-contract values (e.g. `EXTREME`).
  - `testRejectMalformedJson`: Rejects non-JSON strings.
  - `testUnconfiguredTokenThrows`: Throws descriptive `IllegalStateException` when token missing.
  - `testMaskedTokenDoesNotExposeSecret`: Masks token representation (`hf_t...cdef`).
- `IncidentPredictionServiceTest`:
  - `testSuccessfulPrediction`: Verifies end-to-end classification and audit logging in Supabase.
  - `testUnconfiguredTokenReturnsPending`: Sets status `PENDING`, preserves report.
  - `testApiFailureReturnsFailedWithoutSilentLow`: On 429/5xx, sets status `FAILED` and defaults to `MEDIUM` without silently substituting `LOW`.
  - `testDatabaseFailureDoesNotCrashFlow`: Resilient to DB issues during audit persistence.
  - `testPredictForDisasterEntity`: Links prediction audit to disaster ID.
- `IncidentPredictionControllerTest`:
  - `testPredictEndpoint`: `POST /predict` returns 200 OK with severity assessment JSON.
  - `testApiPredictEndpoint`: `POST /api/predict` returns 200 OK for API prefix consumers.
  - `testGetStatus`: `GET /predict/status` returns active status.
- `DisasterNotificationServiceTest` (3 tests passed).
- `DisasterNotificationControllerTest` (3 tests passed).
- `GeoLocationUtilTest` (4 tests passed).

### 6.2 Zero Credential Leaks Verified
A full recursive codebase scan verified that no secrets (`HF_TOKEN` or AWS credentials) are committed or hardcoded in repository files, frontend assets, Android builds, or logs.

---

## 7. Rollback & Configuration Guide

### 7.1 How to Configure HF_TOKEN
Generate a Hugging Face User Access Token:
1. Go to [Hugging Face Settings > Access Tokens](https://huggingface.co/settings/tokens).
2. Create a new token with **Inference** permissions (e.g., `Make calls to Inference Providers`).
3. Set the environment variable:
   ```bash
   export HF_TOKEN="hf_your_generated_token"
   export HF_MODEL_ID="Qwen/Qwen2.5-7B-Instruct"
   ```
4. Note: Hugging Face S3 credentials (`HFAKS...` / `s3.hf.co`) are for S3 dataset storage, whereas the Inference Router requires the User Access Token (`hf_...`).

### 7.2 Rollback Procedure
If rollback to local offline ML is ever required:
1. Restore artifacts from `scratch/legacy_ml_backup/`:
   ```bash
   cp scratch/legacy_ml_backup/model.pkl .
   cp scratch/legacy_ml_backup/vectorizer.pkl .
   cp scratch/legacy_ml_backup/api_service.py .
   cp scratch/legacy_ml_backup/ml_pipeline.py .
   cp scratch/legacy_ml_backup/python_ml_standalone.py .
   ```
2. Re-add `dconnect-ml-service` to `ecosystem.config.js`.
