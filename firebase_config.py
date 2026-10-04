"""
Production-Grade Firebase Cloud Messaging (FCM) System
D-Connect Disaster Management System (Python Backend)
Project ID: disasterconnect-b1861
"""

import os
import json
import logging
import sqlite3
import warnings
from typing import List, Dict, Optional

import firebase_admin
from firebase_admin import credentials, messaging, exceptions

# Suppress minor requests / deprecation warnings for clean output
warnings.filterwarnings("ignore", category=UserWarning)

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("FCM_Service")

# ==============================================================================
# STEP 1: SERVICE ACCOUNT CREDENTIALS CONFIGURATION
# ==============================================================================

SERVICE_ACCOUNT_PATH = os.path.join(os.path.dirname(__file__), "firebase_service_account.json")

def load_credentials_dict() -> Dict:
    """Loads service account credentials from ENV variable or local json file."""
    env_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    cred_dict = None
    if env_json:
        logger.info("Loading Firebase credentials from ENV FIREBASE_SERVICE_ACCOUNT_JSON...")
        cred_dict = json.loads(env_json)
    elif os.path.exists(SERVICE_ACCOUNT_PATH):
        logger.info("Loading Firebase credentials from file: %s...", SERVICE_ACCOUNT_PATH)
        with open(SERVICE_ACCOUNT_PATH, "r", encoding="utf-8") as f:
            cred_dict = json.load(f)
    else:
        raise FileNotFoundError(
            f"Firebase credentials not found. Please provide ENV FIREBASE_SERVICE_ACCOUNT_JSON "
            f"or place service account json at '{SERVICE_ACCOUNT_PATH}'"
        )

    if cred_dict and "private_key" in cred_dict and isinstance(cred_dict["private_key"], str):
        cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")

    return cred_dict

# ==============================================================================
# STEP 2: INITIALIZE FIREBASE ADMIN SDK (Idempotent)
# ==============================================================================

def initialize_firebase():
    """Initializes the Firebase Admin SDK securely using credentials Certificate."""
    if not firebase_admin._apps:
        try:
            cred_dict = load_credentials_dict()
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            logger.info("[SUCCESS] Firebase Admin SDK initialized successfully for project: %s", cred_dict.get("project_id"))
        except Exception as e:
            logger.error("[ERROR] Failed to initialize Firebase Admin SDK: %s", str(e), exc_info=True)
            raise e

# Auto-initialize on module load
initialize_firebase()

# ==============================================================================
# DATABASE STORAGE (Multi-device FCM token management)
# ==============================================================================

DB_PATH = os.path.join(os.path.dirname(__file__), "fcm_tokens.db")

def init_db():
    """Initializes SQLite database table for multi-device user token storage."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                fcm_token TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, device_id)
            )
        """)
        conn.commit()

init_db()

def save_fcm_token(user_id: str, device_id: str, fcm_token: str):
    """Saves or updates FCM token mapped to user_id and device_id."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_devices (user_id, device_id, fcm_token)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, device_id) DO UPDATE SET
                fcm_token = excluded.fcm_token,
                created_at = CURRENT_TIMESTAMP
        """, (str(user_id), str(device_id), str(fcm_token)))
        conn.commit()
        logger.info("[DB] Saved FCM Token for User ID '%s' on Device '%s'", user_id, device_id)

def get_tokens_for_user(user_id: str) -> List[str]:
    """Retrieves all active FCM tokens for a user across multiple devices."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT fcm_token FROM user_devices WHERE user_id = ?", (str(user_id),))
        rows = cursor.fetchall()
        return [r[0] for r in rows]

def get_all_stored_tokens() -> List[str]:
    """Retrieves all stored FCM tokens in the system."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT fcm_token FROM user_devices")
        rows = cursor.fetchall()
        return [r[0] for r in rows]

def remove_invalid_token(fcm_token: str):
    """Purges invalid or unregistered FCM token from database automatically."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_devices WHERE fcm_token = ?", (str(fcm_token),))
        conn.commit()
        logger.warning("[CLEANUP] Automatically purged stale/invalid FCM token: %s...", fcm_token[:15])

# ==============================================================================
# STEP 3: SEND NOTIFICATION FUNCTION
# ==============================================================================

def send_notification(token: str, title: str, body: str, data: Optional[Dict[str, str]] = None) -> Optional[str]:
    """
    Sends high-priority FCM notification to a target device token.
    Configured for high visibility even when app is closed or backgrounded.
    """
    if not token or not isinstance(token, str):
        logger.warning("[WARN] Invalid token passed to send_notification: %s", token)
        return None

    try:
        data_payload = data if data else {}
        data_payload.setdefault("click_action", "OPEN_DISASTER_ALERT")

        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data_payload,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id="disaster_alerts_channel",
                    sound="default",
                    click_action="OPEN_DISASTER_ALERT"
                )
            ),
            token=token,
        )

        response = messaging.send(message)
        logger.info("[SUCCESS] Sent FCM notification to token %s... | Message ID: %s", token[:15], response)
        return response

    except messaging.UnregisteredError:
        logger.error("[FCM ERROR] Token is unregistered/expired: %s... Purging from DB.", token[:15])
        remove_invalid_token(token)
        return None
    except exceptions.InvalidArgumentError as e:
        logger.error("[FCM ERROR] Invalid FCM token format: %s... Error: %s. Purging from DB.", token[:15], str(e))
        remove_invalid_token(token)
        return None
    except messaging.SenderIdMismatchError as e:
        logger.error("[FCM ERROR] Sender ID mismatch for token: %s... Error: %s", token[:15], str(e))
        return None
    except exceptions.FirebaseError as e:
        logger.error("[FCM ERROR] Firebase API Error for token %s... Error: %s", token[:15], str(e))
        return None
    except Exception as e:
        logger.error("[UNEXPECTED ERROR] Failed to send FCM notification to token %s... Error: %s", token[:15], str(e))
        return None

# ==============================================================================
# STEP 4 & 6: TEST FUNCTION & DEBUGGING
# ==============================================================================

def send_test_to_all(tokens: List[str]):
    """Iterates through a list of tokens, logs details, and sends test notification."""
    logger.info("[BATCH] Starting batch test push notification dispatch to %d token(s)...", len(tokens))
    
    for idx, token in enumerate(tokens, 1):
        print(f"\n--- [Token {idx}/{len(tokens)}] ---")
        print(f"Target FCM Token: {token}")
        
        response = send_notification(token, "Hi", "FCM working test message")
        if response:
            print(f"Status: DELIVERED | Response ID: {response}")
        else:
            print(f"Status: FAILED / PURGED")

# ==============================================================================
# STEP 7: REGISTRATION / LOGIN HOOK (IMMEDIATE "HI" PUSH)
# ==============================================================================

def register_user_device_and_welcome(user_id: str, device_id: str, token: str):
    """
    On user register/login:
    1. Save token to DB mapped to user_id + device_id.
    2. Immediately dispatch "Hi" test push notification.
    """
    logger.info("[REGISTER] Processing device registration for User '%s' on Device '%s'", user_id, device_id)
    save_fcm_token(user_id, device_id, token)

    # Immediately send "Hi" test notification
    logger.info("[WELCOME] Triggering immediate welcome test notification to registered device...")
    res = send_notification(
        token=token,
        title="Hi",
        body="FCM working test message",
        data={"type": "WELCOME_TEST", "userId": str(user_id)}
    )
    return res

# ==============================================================================
# CLI TEST DRIVER
# ==============================================================================

if __name__ == "__main__":
    print("\n=======================================================")
    print("D-CONNECT FIREBASE CLOUD MESSAGING (FCM) PYTHON SUITE")
    print("=======================================================\n")

    # Example 1: Register a test device
    sample_user = "user_101"
    sample_device = "android_pixel_7"
    sample_token = "mock_fcm_token_sample_string_for_testing_1234567890_abc"

    print("1. Testing User Device Registration & Immediate Welcome Push:")
    register_user_device_and_welcome(sample_user, sample_device, sample_token)

    # Example 2: Batch send test
    print("\n2. Testing send_test_to_all on stored tokens:")
    stored_tokens = get_all_stored_tokens()
    send_test_to_all(stored_tokens)
