import urllib.request
import json
import time

BASE_URL = "http://localhost:3000"

def http_post(url, payload, headers=None):
    if headers is None: headers = {}
    headers['Content-Type'] = 'application/json'
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return response.getcode(), json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, {}
    except Exception as e:
        return 500, {'error': str(e)}

def http_get(url, headers=None):
    if headers is None: headers = {}
    req = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req) as response:
            return response.getcode(), json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, {}
    except Exception as e:
        return 500, {'error': str(e)}

def test_reset_and_auth():
    print("=========================================================================")
    print("        MASTER RESET & AUTH STABILIZATION VERIFICATION SUITE             ")
    print("=========================================================================")

    # 1. Admin Login
    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "9598349738", "password": "Admin@123"})
    assert code == 200 and res.get('success') == True, f"Admin login failed: {res}"
    admin_token = res['data']['token']
    print("[PASS] 1. Admin Login Successful")

    # 2. Trigger System Reset via API
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    code, res = http_post(f"{BASE_URL}/api/admin/reset-system", {}, headers=admin_headers)
    assert code == 200 and "completed successfully" in res.get('message', ''), f"System reset failed: {res}"
    print(f"[PASS] 2. System Reset Triggered & Executed -> {res.get('message')}")

    # 3. Non-Admin Access Blocked from Reset
    code, res = http_post(f"{BASE_URL}/api/admin/reset-system", {})
    assert code == 403, f"Unauthenticated reset should be blocked with 403, got {code}"
    print("[PASS] 3. Non-Admin Access Blocked from Reset (HTTP 403)")

    # 4. Register new user with space in phone
    raw_phone = " 9777123456 "
    code, res = http_post(f"{BASE_URL}/api/auth/register", {
        "name": "Normalized User",
        "phone": raw_phone,
        "password": "Password@123",
        "role": "USER"
    })
    assert code in [200, 201] and res.get('success') == True, f"Registration failed: {res}"
    print("[PASS] 4. User Registration with Whitespace Phone Succeeded")

    # 5. Login with normalized phone
    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "9777123456", "password": "Password@123"})
    assert code == 200 and res.get('success') == True, f"Login failed: {res}"
    print("[PASS] 5. Login with Normalized Phone Succeeded")

    # 6. Reject Wrong Password
    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "9777123456", "password": "WrongPassword"})
    assert code == 401, f"Wrong password should return 401, got {code}"
    print("[PASS] 6. Wrong Password Rejected (HTTP 401)")

    # 7. Duplicate Phone Registration Blocked
    code, res = http_post(f"{BASE_URL}/api/auth/register", {
        "name": "Duplicate User",
        "phone": "9777123456",
        "password": "Password@123",
        "role": "USER"
    })
    assert code == 409, f"Duplicate phone should return 409 Conflict, got {code}"
    print("[PASS] 7. Duplicate Phone Registration Blocked (HTTP 409)")

    print("=========================================================================")
    print(" ALL MASTER RESET & AUTH TESTS PASSED 100% SUCCESSFULLY!                ")
    print("=========================================================================")

if __name__ == "__main__":
    test_reset_and_auth()
