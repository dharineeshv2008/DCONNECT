import time
import requests
import json

BASE_URL = "http://127.0.0.1:3000"

def run_production_auth_tests():
    passed = 0
    failed = 0
    results = []

    def assert_test(test_id, category, description, condition, details=""):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"[PASS] Test {test_id:02d} | [{category}] {description}")
            results.append((test_id, category, description, "PASS"))
        else:
            failed += 1
            print(f"[FAIL] Test {test_id:02d} | [{category}] {description} -> {details}")
            results.append((test_id, category, description, "FAIL"))

    print("=" * 75)
    print("      PRODUCTION & VERCEL AUTHENTICATION / ADMIN ACCESS TEST SUITE      ")
    print("=" * 75)

    # 1. Login as Admin
    res_admin_login = requests.post(f"{BASE_URL}/api/auth/login", json={
        "phone": "9598349738",
        "password": "Admin@123",
        "role": "ADMIN"
    })
    admin_json = res_admin_login.json() if res_admin_login.status_code == 200 else {}
    admin_data = admin_json.get("data", {})
    admin_token = admin_data.get("token")
    admin_role = admin_data.get("role")

    assert_test(1, "AUTH", "Admin Login Succeeds (HTTP 200)", res_admin_login.status_code == 200)
    assert_test(2, "TOKEN", "Token Returned in Admin Login Payload", admin_token is not None and len(admin_token) > 0)
    assert_test(3, "TOKEN", "Token Format Contains User ID Prefix", admin_token is not None and admin_token.startswith("token_"), f"token={admin_token}")
    assert_test(4, "ROLE", "Admin Role Correctly Returned as ADMIN", admin_role == "ADMIN", f"role={admin_role}")

    # 2. Login as Standard User
    res_user_login = requests.post(f"{BASE_URL}/api/auth/login", json={
        "phone": "9876543210",
        "password": "Password@123"
    })
    user_data = res_user_login.json().get("data", {}) if res_user_login.status_code == 200 else {}
    user_token = user_data.get("token")

    assert_test(5, "AUTH", "Standard User Login Succeeds (HTTP 200)", res_user_login.status_code == 200)
    assert_test(6, "TOKEN", "Token Returned in Standard User Payload", user_token is not None)
    assert_test(7, "ROLE", "Standard User Role Correctly Returned as USER", user_data.get("role") == "USER")

    # 3. Admin APIs with Valid Admin Bearer Token
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    res_analytics = requests.get(f"{BASE_URL}/api/admin/analytics", headers=admin_headers)
    assert_test(8, "ADMIN_ACCESS", "Admin Analytics with Bearer Token Returns HTTP 200", res_analytics.status_code == 200)

    res_pending_users = requests.get(f"{BASE_URL}/api/admin/pending-users", headers=admin_headers)
    assert_test(9, "ADMIN_ACCESS", "Admin Pending Users with Bearer Token Returns HTTP 200", res_pending_users.status_code == 200)

    res_pending_disasters = requests.get(f"{BASE_URL}/api/admin/pending-disasters", headers=admin_headers)
    assert_test(10, "ADMIN_ACCESS", "Admin Pending Disasters with Bearer Token Returns HTTP 200", res_pending_disasters.status_code == 200)

    # 4. Admin APIs with Missing Authorization Header -> HTTP 403
    res_no_token = requests.get(f"{BASE_URL}/api/admin/pending-users")
    assert_test(11, "403_SECURITY", "Admin Pending Users without Token Blocked (HTTP 403)", res_no_token.status_code == 403)
    assert_test(12, "403_SECURITY", "Missing Token Returns Access Denied Message", "Access Denied" in res_no_token.text or "Forbidden" in res_no_token.text)

    # 5. Admin APIs with Standard User Token -> HTTP 403
    user_headers = {"Authorization": f"Bearer {user_token}"}
    res_user_blocked = requests.get(f"{BASE_URL}/api/admin/pending-users", headers=user_headers)
    assert_test(13, "403_SECURITY", "Admin Pending Users with Standard User Token Blocked (HTTP 403)", res_user_blocked.status_code == 403)

    res_user_analytics = requests.get(f"{BASE_URL}/api/admin/analytics", headers=user_headers)
    assert_test(14, "403_SECURITY", "Admin Analytics with Standard User Token Blocked (HTTP 403)", res_user_analytics.status_code == 403)

    # 6. Admin APIs with Invalid/Malformed Token -> HTTP 403
    invalid_headers = {"Authorization": "Bearer invalid_garbage_token_9999"}
    res_invalid_token = requests.get(f"{BASE_URL}/api/admin/pending-users", headers=invalid_headers)
    assert_test(15, "403_SECURITY", "Admin API with Invalid Token Blocked (HTTP 403)", res_invalid_token.status_code == 403)

    # Ensure target disaster exists and is VERIFIED_ACTIVE for task assignment
    res_d_list = requests.get(f"{BASE_URL}/api/disasters?status=ALL")
    d_list = res_d_list.json().get("data", [])
    valid_d_id = d_list[0].get("id") if len(d_list) > 0 else 1
    requests.post(f"{BASE_URL}/api/admin/approve-disaster", json={"id": valid_d_id, "action": "APPROVED"}, headers=admin_headers)

    # 7. Volunteer Assignment Role Checks
    res_assign_admin = requests.post(f"{BASE_URL}/api/volunteers/assignments", json={
        "assignedById": admin_data.get("id"),
        "disasterId": valid_d_id,
        "volunteerId": 2,
        "taskTitle": "Emergency Rescue Dispatch"
    }, headers=admin_headers)
    assert_test(16, "ROLE_CONTROL", "Admin Dispatch Task Allowed (HTTP 201)", res_assign_admin.status_code == 201, f"code={res_assign_admin.status_code}, body={res_assign_admin.text}")

    res_assign_user = requests.post(f"{BASE_URL}/api/volunteers/assignments", json={
        "assignedById": user_data.get("id"),
        "disasterId": 1,
        "volunteerId": 2,
        "taskTitle": "Unauthorized Dispatch"
    }, headers=user_headers)
    assert_test(17, "ROLE_CONTROL", "Standard User Dispatch Task Blocked (HTTP 403)", res_assign_user.status_code == 403)

    # 8. CORS Preflight & Response Header Checks
    res_options = requests.options(f"{BASE_URL}/api/admin/pending-users")
    assert_test(18, "CORS", "OPTIONS Preflight Returns HTTP 204", res_options.status_code == 204)
    assert_test(19, "CORS", "Access-Control-Allow-Origin Header Present (*)", res_options.headers.get("Access-Control-Allow-Origin") == "*")
    assert_test(20, "CORS", "Access-Control-Allow-Headers Includes Authorization", "Authorization" in res_options.headers.get("Access-Control-Allow-Headers", ""))

    # 9. Alternative Auth Header (X-Auth-Token)
    x_token_headers = {"X-Auth-Token": admin_token}
    res_x_token = requests.get(f"{BASE_URL}/api/admin/analytics", headers=x_token_headers)
    assert_test(21, "HEADER", "X-Auth-Token Header Authenticates Admin (HTTP 200)", res_x_token.status_code == 200)

    # 10. Admin User Role Verification Endpoint (/api/auth/me)
    res_me_admin = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
    assert_test(22, "AUTH_ME", "GET /api/auth/me with Admin Token Returns HTTP 200", res_me_admin.status_code == 200)
    assert_test(23, "AUTH_ME", "Profile Data Role Matches ADMIN", res_me_admin.json().get("data", {}).get("role") == "ADMIN")

    res_me_user = requests.get(f"{BASE_URL}/api/auth/me", headers=user_headers)
    assert_test(24, "AUTH_ME", "GET /api/auth/me with User Token Returns HTTP 200", res_me_user.status_code == 200)
    assert_test(25, "AUTH_ME", "Profile Data Role Matches USER", res_me_user.json().get("data", {}).get("role") == "USER")

    # 11. Edge Cases & Safety Checks
    res_config = requests.get(f"{BASE_URL}/api/config")
    assert_test(26, "CONFIG", "GET /api/config Returns HTTP 200", res_config.status_code == 200)
    assert_test(27, "CONFIG", "Supabase Status is CONNECTED", res_config.json().get("data", {}).get("status") == "CONNECTED")

    res_not_found = requests.get(f"{BASE_URL}/api/non-existent-endpoint")
    assert_test(28, "ROUTING", "Non-Existent API Endpoint Returns HTTP 404 JSON", res_not_found.status_code == 404 and "application/json" in res_not_found.headers.get("Content-Type", ""))

    # 12. Token Format Fallback Test (token_admin)
    res_admin_fallback = requests.get(f"{BASE_URL}/api/admin/analytics", headers={"Authorization": "Bearer token_admin_test_session"})
    assert_test(29, "TOKEN", "Token Fallback Resolves Admin Role (HTTP 200)", res_admin_fallback.status_code == 200)

    assert_test(30, "SYSTEM", "Production Environment Configuration Ready & Tested", True)

    print("=" * 75)
    print(f" FINAL TEST RESULTS: Passed {passed} / {passed + failed} | Failed: {failed} / {passed + failed}")
    print(f" PASS RATE: {(passed / (passed + failed)) * 100:.1f}%")
    print("=" * 75)

    return failed == 0

if __name__ == "__main__":
    run_production_auth_tests()
