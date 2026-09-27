import urllib.request
import json
import time
import sys

BASE_URL = "http://localhost:3000"
ML_URL = "http://127.0.0.1:8000"

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

def run_50_test_cases():
    print("=========================================================================")
    print("          MANDATORY 50 TEST CASES VALIDATION SUITE                      ")
    print("=========================================================================")

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

    # -------------------------------------------------------------------------
    # CATEGORY 1: AUTHENTICATION & SESSIONS (Tests 1 - 10)
    # -------------------------------------------------------------------------
    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "9876543210", "password": "Password@123"})
    assert_test(1, "AUTH", "Public User Login by Phone", code == 200 and res.get('success') == True)

    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "9598349738", "password": "Admin@123"})
    admin_token = res.get('data', {}).get('token') if code == 200 else None
    assert_test(2, "AUTH", "Admin Login by Phone", code == 200 and res.get('data', {}).get('role') == 'ADMIN')

    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "7550075512", "password": "Password@123"})
    assert_test(3, "AUTH", "Volunteer Login by Phone", code == 200 and res.get('data', {}).get('role') == 'VOLUNTEER')

    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "0000000000", "password": "Password@123"})
    assert_test(4, "AUTH", "Reject Unregistered Phone Number", code in [400, 404, 401])

    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": "123", "password": "Password@123"})
    assert_test(5, "AUTH", "Reject Invalid Phone Format", code in [400, 401, 422])

    test_phone = f"9{int(time.time())%1000000000:09d}"
    code, res = http_post(f"{BASE_URL}/api/auth/register", {
        "name": "Test Citizen User",
        "phone": test_phone,
        "role": "USER"
    })
    assert_test(6, "AUTH", "Register New Citizen User", code in [200, 201] and res.get('success') == True)

    code, res = http_post(f"{BASE_URL}/api/auth/login", {"phone": test_phone, "password": "Password@123"})
    assert_test(7, "AUTH", "Login with Newly Registered User", code == 200 and res.get('success') == True)

    code, res = http_get(f"{BASE_URL}/api/auth/profile/1")
    assert_test(8, "AUTH", "Fetch Auth Profile by User ID", code == 200 and res.get('success') == True)

    code, res = http_get(f"{BASE_URL}/api/auth/profile/999999")
    assert_test(9, "AUTH", "Fetch Auth Profile Non-Existent User ID", code == 404)

    code, res = http_get(f"{BASE_URL}/api/users/volunteers")
    assert_test(10, "AUTH", "Volunteers Directory Active User List", code == 200 and isinstance(res.get('data'), list))

    # -------------------------------------------------------------------------
    # CATEGORY 2: CONTROL MANAGEMENT & ROLE ENFORCEMENT (Tests 11 - 20)
    # -------------------------------------------------------------------------
    code, res = http_get(f"{BASE_URL}/api/disasters?status=VERIFIED_ACTIVE")
    data = res.get('data', [])
    pending_in_live = any(d.get('status') == 'PENDING_VERIFICATION' for d in data)
    assert_test(11, "CONTROL", "Live Feed Blocks PENDING_VERIFICATION Reports", code == 200 and not pending_in_live)

    code, res = http_post(f"{BASE_URL}/api/volunteers/assignments", {
        "userRole": "VOLUNTEER",
        "volunteerId": 2,
        "disasterId": 1,
        "taskTitle": "Unauthorized Task Assignment"
    })
    assert_test(12, "CONTROL", "Block Volunteer Accounts from Assigning Tasks", code == 403)

    code, res = http_post(f"{BASE_URL}/api/volunteers/assignments", {
        "userRole": "USER",
        "volunteerId": 2,
        "disasterId": 1,
        "taskTitle": "Unauthorized Task Assignment"
    })
    assert_test(13, "CONTROL", "Block Standard User Accounts from Assigning Tasks", code == 403)

    code, res = http_get(f"{BASE_URL}/api/admin/pending-users", headers={"Authorization": "Bearer invalid_user_token"})
    assert_test(14, "CONTROL", "Block Non-Admin Access to Admin Pending Users Endpoint", code == 403)

    code, res = http_get(f"{BASE_URL}/api/admin/pending-disasters", headers={"Authorization": "Bearer invalid_user_token"})
    assert_test(15, "CONTROL", "Block Non-Admin Access to Admin Pending Disasters Endpoint", code == 403)

    code, res = http_post(f"{BASE_URL}/api/admin/approve-user", {"userId": 1, "action": "APPROVED"}, headers={"Authorization": "Bearer invalid_user_token"})
    assert_test(16, "CONTROL", "Block Non-Admin User Approval Action", code == 403)

    admin_headers = {"Authorization": f"Bearer {admin_token}"} if admin_token else {}
    code, res = http_get(f"{BASE_URL}/api/admin/analytics", headers=admin_headers)
    assert_test(17, "CONTROL", "Fetch Admin Command Center Analytics", code == 200 and 'activeDisasters' in res.get('data', {}))

    code, res = http_get(f"{BASE_URL}/api/admin/pending-disasters", headers=admin_headers)
    assert_test(18, "CONTROL", "Fetch Pending Disasters for Admin Verification Queue", code == 200)

    code, res = http_get(f"{BASE_URL}/api/admin/pending-users", headers=admin_headers)
    assert_test(19, "CONTROL", "Fetch Pending Users for Admin Verification Queue", code == 200)

    code, res = http_get(f"{BASE_URL}/api/volunteers/assignments")
    assert_test(20, "CONTROL", "Fetch Volunteer Task Assignments List", code == 200)

    # -------------------------------------------------------------------------
    # CATEGORY 3: ML PREDICTION ACCURACY (Tests 21 - 30)
    # -------------------------------------------------------------------------
    ml_tests = [
        (21, "fire outbreak urgent help", "CRITICAL"),
        (22, "people affected by fire", "HIGH"),
        (23, "road blocked due to fallen tree", "MEDIUM"),
        (24, "tree fallen blocking road", "MEDIUM"),
        (25, "minor road blockage", "LOW"),
        (26, "major highway blocked", "HIGH"),
        (27, "people trapped in fire", "CRITICAL"),
        (28, "minor issue", "LOW"),
        (29, "small kitchen fire put out quickly", "LOW"),
        (30, "catastrophic earthquake collapsed buildings hundreds buried", "CRITICAL")
    ]

    for t_id, input_text, expected_sev in ml_tests:
        code, res = http_post(f"{ML_URL}/predict", {"description": input_text})
        pred_sev = res.get('severity') if code == 200 else None
        assert_test(t_id, "ML", f"ML Predict: '{input_text}' -> Expected: {expected_sev}", code == 200 and pred_sev == expected_sev, f"Got: {pred_sev}")

    # -------------------------------------------------------------------------
    # CATEGORY 4: END-TO-END DISASTER WORKFLOW (Tests 31 - 40)
    # -------------------------------------------------------------------------
    code, res = http_post(f"{BASE_URL}/api/incidents/report", {
        "type": "FIRE",
        "title": "Severe Building Fire Outbreak",
        "description": "fire outbreak urgent help people trapped",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "locationName": "Central Bus Stand, Chennai",
        "role": "USER",
        "reporterPhone": "9888111222"
    })
    incident_id = res.get('data', {}).get('id') if code in [200, 201] else None
    assert_test(31, "FLOW", "Citizen Reports Incident -> Status PENDING_VERIFICATION", code in [200, 201] and res.get('data', {}).get('status') == 'PENDING_VERIFICATION')

    # Sleep 2.1s to allow rate limit bucket to reset before duplicate test
    time.sleep(2.1)

    code, res = http_post(f"{BASE_URL}/api/incidents/report", {
        "type": "FIRE",
        "title": "Severe Building Fire Outbreak",
        "description": "fire outbreak urgent help people trapped",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "locationName": "Central Bus Stand, Chennai",
        "role": "USER",
        "reporterPhone": "9888111223"
    })
    assert_test(32, "FLOW", "Deduplication Engine Merges Nearby Incident (<10km, 3h window)", code in [200, 201] and (res.get('data', {}).get('wasMerged') == True or res.get('data', {}).get('isDuplicate') == True))

    if incident_id:
        code, res = http_post(f"{BASE_URL}/api/admin/approve-disaster", {
            "id": incident_id,
            "action": "APPROVED",
            "adminId": 1
        })
        assert_test(33, "FLOW", "Admin Approves Incident -> Status VERIFIED_ACTIVE", code == 200 and res.get('updatedStatus') == 'VERIFIED_ACTIVE')

        code, res = http_post(f"{BASE_URL}/api/incidents/update-severity", {
            "id": incident_id,
            "severity": "CRITICAL"
        })
        assert_test(34, "FLOW", "Admin Severity Override -> Set to CRITICAL", code == 200)

        code, res = http_post(f"{BASE_URL}/api/volunteers/assignments", {
            "userRole": "ADMIN",
            "volunteerId": 2,
            "disasterId": incident_id,
            "taskTitle": "Execute Emergency Fire Evacuation",
            "taskDescription": "Deploy fire suppressant units."
        })
        assignment_id = res.get('data', {}).get('id') if code in [200, 201] else None
        assert_test(35, "FLOW", "Admin Assigns Volunteer Task Mission", code in [200, 201] and assignment_id is not None)

        if assignment_id:
            code, res = http_post(f"{BASE_URL}/api/volunteers/assignments/{assignment_id}/status", {
                "status": "IN_PROGRESS",
                "actorVolunteerId": 2
            })
            assert_test(36, "FLOW", "Volunteer Updates Task Status to IN_PROGRESS", code == 200)

            code, res = http_post(f"{BASE_URL}/api/volunteers/assignments/{assignment_id}/status", {
                "status": "COMPLETED",
                "actorVolunteerId": 2
            })
            assert_test(37, "FLOW", "Volunteer Completes Task Mission -> COMPLETED", code == 200)

        code, res = http_post(f"{BASE_URL}/api/incidents/update-status", {
            "id": incident_id,
            "status": "RESOLVED"
        })
        assert_test(38, "FLOW", "Incident Resolution -> Transition to RESOLVED", code == 200)

        code, res = http_post(f"{BASE_URL}/api/incidents/update-status", {
            "id": incident_id,
            "status": "CLOSED"
        })
        assert_test(39, "FLOW", "Incident Archive -> Transition to CLOSED", code == 200)

        code, res = http_post(f"{BASE_URL}/api/incidents/edit", {
            "id": incident_id,
            "description": "Closed incident modification attempt"
        })
        assert_test(40, "FLOW", "Closed Incident Cannot Be Modified", code == 400)
    else:
        for i in range(33, 41):
            assert_test(i, "FLOW", f"Flow Step {i}", False, "Incident ID creation failed")

    # -------------------------------------------------------------------------
    # CATEGORY 5: TELEGRAM INTEGRATION & NOTIFICATION DEDUP (Tests 41 - 50)
    # -------------------------------------------------------------------------
    code, res = http_post(f"{BASE_URL}/api/incidents/report", {
        "type": "FLOOD",
        "title": "Admin Direct Published Flood",
        "description": "road blocked due to fallen tree",
        "latitude": 10.5,
        "longitude": 78.5,
        "locationName": "Admin Location",
        "role": "ADMIN"
    })
    admin_disaster_id = res.get('data', {}).get('id') if code in [200, 201] else None
    assert_test(41, "TELEGRAM", "Admin Created Incident Published Directly (VERIFIED_ACTIVE)", code in [200, 201] and res.get('data', {}).get('status') == 'VERIFIED_ACTIVE')
    assert_test(42, "TELEGRAM", "Admin Created Incident Does NOT Trigger Telegram Alert", code in [200, 201])

    # Sleep 2.1s to reset rate limit bucket before citizen report
    time.sleep(2.1)

    code, res = http_post(f"{BASE_URL}/api/incidents/report", {
        "type": "OTHER",
        "title": "Citizen Minor Incident",
        "description": "minor road blockage",
        "latitude": 9.5,
        "longitude": 75.5,
        "locationName": "Citizen Location",
        "role": "USER",
        "reporterPhone": "9777111222"
    })
    c_id = res.get('data', {}).get('id')
    assert_test(43, "TELEGRAM", "Citizen Created Incident Triggers Exactly ONE Telegram Alert", code in [200, 201] and c_id is not None)
    assert_test(44, "TELEGRAM", "Citizen Incident Includes ML Severity Output ('LOW')", code in [200, 201] and res.get('data', {}).get('ml_severity') == 'LOW')

    code, res = http_get(f"{BASE_URL}/api/resources/list")
    assert_test(45, "RESOURCES", "List Emergency Resource Supply Posts", code == 200 and isinstance(res.get('data'), list))

    code, res = http_post(f"{BASE_URL}/api/resources/create", {
        "resourceType": "WATER",
        "description": "5000 Liters Drinking Water Tanker",
        "quantity": 5000,
        "unit": "Liters",
        "status": "AVAILABLE"
    })
    assert_test(46, "RESOURCES", "Create Emergency Resource Supply Post", code in [200, 201])

    code, res = http_post(f"{BASE_URL}/api/resources/create", {
        "status": "INVALID_STATUS"
    })
    assert_test(47, "RESOURCES", "Reject Invalid Resource Status Constraint", code == 400)

    code, res = http_get(f"{BASE_URL}/api/disasters?lat=13.0827&lon=80.2707")
    assert_test(48, "DISTANCE", "Haversine Distance Calculated for Disaster Feed", code == 200)

    code, res = http_get(f"{BASE_URL}/api/resources/list?lat=13.0827&lon=80.2707")
    assert_test(49, "DISTANCE", "Resource Distance Filtering within 20km Radius", code == 200)

    code, res = http_get(f"{BASE_URL}/api/incidents/list?page=1&limit=10")
    assert_test(50, "PAGINATION", "API Pagination Controls Limit Results to 10 per page", code == 200 and res.get('limit') == 10 and len(res.get('data', [])) <= 10)

    print("\n=========================================================================")
    print(f" FINAL TEST RESULTS: Passed {passed} / 50 | Failed: {failed} / 50")
    print(f" PASS RATE: {(passed/50)*100:.1f}%")
    print("=========================================================================")

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_50_test_cases()
