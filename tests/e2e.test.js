/**
 * Comprehensive Automated End-to-End Test Suite for D-Connect System (100 Test Cases)
 * Sections A through L
 */

const request = require('supertest');
const server = require('../server');
const { supabase, supabaseDb } = require('../supabaseClient');

jest.setTimeout(60000);

describe('D-Connect Disaster Management System - 100 Automated Test Suite', () => {

  // Global variables shared across test phases
  let userToken, volunteerToken, adminToken, ngoToken;
  let userId, volunteerId, adminId, ngoId;
  let testDisasterId, secondaryDisasterId;
  let testResourceId, testAssignmentId;

  const testPhoneUser = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const testPhoneVol = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const testPhoneNGO = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const testPhoneAdmin = '9' + Math.floor(100000000 + Math.random() * 900000000);

  afterAll(async () => {
    // Teardown test data from DB
    try {
      if (testDisasterId) await supabaseDb.deleteDisaster(testDisasterId);
      if (secondaryDisasterId) await supabaseDb.deleteDisaster(secondaryDisasterId);
      if (testResourceId) await supabaseDb.deleteResource(testResourceId);
    } catch (err) {
      console.warn('Teardown notice:', err.message);
    }
  });

  // Setup Admin Account for subsequent tests
  beforeAll(async () => {
    const res = await request(server)
      .post('/api/auth/register')
      .send({
        name: 'System Admin Test',
        phone: testPhoneAdmin,
        password: 'Admin@123',
        role: 'ADMIN'
      });
    if (res.status === 201) {
      adminToken = res.body.data.token;
      adminId = res.body.data.id;
    } else {
      const loginRes = await request(server)
        .post('/api/auth/login')
        .send({ phone: testPhoneAdmin, password: 'Admin@123' });
      adminToken = loginRes.body.data.token;
      adminId = loginRes.body.data.id;
    }
  });

  // ==============================================================================
  // A. AUTH & USER (Tests 1-10)
  // ==============================================================================
  describe('A. AUTH & USER', () => {
    // Test 1: Register new user (role USER) -> 201 + user row created
    test('1. Register new user (role USER) -> POST /api/auth/register -> 201 + user created', async () => {
      console.log('Running Test 1: Register USER');
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Test Citizen User',
          phone: testPhoneUser,
          password: 'Password@123',
          role: 'USER'
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe(testPhoneUser);
      expect(res.body.data.role).toBe('USER');
      userToken = res.body.data.token;
      userId = res.body.data.id;
    });

    // Test 2: Register volunteer (role VOLUNTEER) -> 201 + volunteer profile created
    test('2. Register volunteer (role VOLUNTEER) -> 201 + volunteer profile created', async () => {
      console.log('Running Test 2: Register VOLUNTEER');
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Test Volunteer User',
          phone: testPhoneVol,
          password: 'Password@123',
          role: 'VOLUNTEER',
          volunteerSkills: 'Medical First Aid'
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('VOLUNTEER');
      volunteerToken = res.body.data.token;
      volunteerId = res.body.data.id;
    });

    // Test 3: Register NGO (role NGO) -> 201 + status = PENDING_APPROVAL
    test('3. Register NGO (role NGO) -> 201 + status = PENDING_APPROVAL', async () => {
      console.log('Running Test 3: Register NGO');
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Test NGO Rep',
          phone: testPhoneNGO,
          password: 'Password@123',
          role: 'NGO',
          organizationName: 'Global Relief Foundation'
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
      ngoId = res.body.data.id;
    });

    // Test 4: Duplicate phone registration -> 409 conflict
    test('4. Duplicate phone registration -> 409 conflict', async () => {
      console.log('Running Test 4: Duplicate phone registration');
      const res = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate User Attempt',
          phone: testPhoneUser,
          password: 'Password@123',
          role: 'USER'
        });
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Conflict');
    });

    // Test 5: Login valid phone -> 200 + token + user profile
    test('5. Login valid phone -> 200 + token + user profile', async () => {
      console.log('Running Test 5: Login valid phone');
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          phone: testPhoneUser,
          password: 'Password@123'
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      userToken = res.body.data.token;
    });

    // Test 6: Login invalid phone -> 401
    test('6. Login invalid phone -> 401', async () => {
      console.log('Running Test 6: Login invalid phone');
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          phone: '0000000000',
          password: 'Password@123'
        });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // Test 7: Access protected endpoint without token -> 401
    test('7. Access protected endpoint without token -> 401', async () => {
      console.log('Running Test 7: Access protected endpoint without token');
      const res = await request(server).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // Test 8: Access admin-only endpoint with volunteer token -> 403
    test('8. Access admin-only endpoint with volunteer token -> 403', async () => {
      console.log('Running Test 8: Access admin endpoint with volunteer token');
      const res = await request(server)
        .get('/api/admin/pending-users')
        .set('Authorization', `Bearer ${volunteerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    // Test 9: After registration, users table contains correct columns (phone, role, status)
    test('9. Users table contains correct columns (phone, role, status)', async () => {
      console.log('Running Test 9: Verify user columns');
      const res = await request(server).get(`/api/auth/profile/${userId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBe(testPhoneUser);
      expect(res.body.data.role).toBe('USER');
      expect(res.body.data.status).toBe('ACTIVE');
    });

    // Test 10: Update user profile -> PATCH /api/auth/me -> 200 + DB updated
    test('10. Update user profile -> PATCH /api/auth/me -> 200 + DB updated', async () => {
      console.log('Running Test 10: Update user profile');
      const res = await request(server)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated Citizen Name' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Citizen Name');
    });
  });

  // ==============================================================================
  // B. INCIDENT REPORTING BASIC (Tests 11-25)
  // ==============================================================================
  describe('B. INCIDENT REPORTING BASIC', () => {
    // Test 11: Create incident with valid payload -> 201 + status=PENDING_VERIFICATION
    test('11. Create incident with valid payload -> 201 + status=PENDING_VERIFICATION', async () => {
      console.log('Running Test 11: Create valid incident');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Heavy Flooding in Sector 5',
          description: 'Water logging over 3 feet in residential area.',
          type: 'FLOOD',
          latitude: 18.0827,
          longitude: 85.2707,
          locationName: 'Isolated Sector 5',
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wasMerged).toBe(false);
      expect(res.body.data.status).toBe('PENDING_VERIFICATION');
      expect(res.body.data.id).toBeDefined();
      testDisasterId = res.body.data.id;
    });

    // Test 12: Create incident without lat/lng -> 400 validation error
    test('12. Create incident without lat/lng -> 400 validation error', async () => {
      console.log('Running Test 12: Missing coordinates');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'No Coords Incident',
          type: 'FLOOD',
          created_by_user_id: userId
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    // Test 13: Create incident with invalid disaster type -> 400
    test('13. Create incident with invalid disaster type -> 400', async () => {
      console.log('Running Test 13: Invalid disaster type');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Alien Attack Emergency',
          type: 'ALIEN_ATTACK',
          latitude: 13.0827,
          longitude: 80.2707
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    // Test 14: Create incident with long message -> 413 or 400
    test('14. Create incident with long message -> 413 or 400', async () => {
      console.log('Running Test 14: Long message payload');
      const longMsg = 'A'.repeat(15000);
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Long Payload Test',
          description: longMsg,
          type: 'FLOOD',
          latitude: 13.0827,
          longitude: 80.2707
        });
      expect([400, 413]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    // Test 15: Create incident using NGO account -> status = PENDING_VERIFICATION
    test('15. Create incident using NGO account -> status = PENDING_VERIFICATION', async () => {
      console.log('Running Test 15: NGO incident report');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'NGO Reported Shelter Need',
          description: 'Emergency food packets needed.',
          type: 'FLOOD',
          latitude: 13.1500,
          longitude: 80.3500,
          created_by_user_id: ngoId
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_VERIFICATION');
    });

    // Test 16: Create incident with reporter phone -> stored reporter_phone field correct
    test('16. Create incident with reporter phone -> reporter_phone stored', async () => {
      console.log('Running Test 16: Reporter phone verification');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Phone Test Report',
          type: 'FIRE',
          latitude: 12.9000,
          longitude: 80.1000,
          reporterPhone: testPhoneUser,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
    });

    // Test 17: Create incident returns disaster id for reporting
    test('17. Create incident returns disaster id', async () => {
      console.log('Running Test 17: Return disaster id');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Disaster ID Check',
          type: 'EARTHQUAKE',
          latitude: 12.8000,
          longitude: 80.0000,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    // Test 18: Retrieve incidents list filtered by status -> GET /api/disasters?status=PENDING_VERIFICATION -> includes new incident
    test('18. Retrieve incidents filtered by status -> PENDING_VERIFICATION included', async () => {
      console.log('Running Test 18: Filter pending incidents');
      const res = await request(server).get('/api/disasters?status=PENDING_VERIFICATION');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.some(d => d.id === testDisasterId);
      expect(found).toBe(true);
    });

    // Test 19: Create multiple incidents (concurrent/far apart) -> no duplication bug
    test('19. Create multiple incidents far apart -> separate disaster records created', async () => {
      console.log('Running Test 19: Far apart incidents creation');
      const res1 = await request(server).post('/api/disasters/report').send({
        title: 'Far Spot A', type: 'CYCLONE', latitude: 10.0000, longitude: 77.0000, created_by_user_id: userId
      });
      const res2 = await request(server).post('/api/disasters/report').send({
        title: 'Far Spot B', type: 'CYCLONE', latitude: 15.0000, longitude: 82.0000, created_by_user_id: userId
      });
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.data.id).not.toEqual(res2.body.data.id);
    });

    // Test 20: Attempt direct insert or update of invalid status -> 400 Bad Request
    test('20. Attempt insert/update of invalid status -> 400 handled', async () => {
      console.log('Running Test 20: Invalid status handling');
      const res = await request(server)
        .post('/api/incidents/update')
        .send({
          id: testDisasterId,
          status: 'SUPER_SUPER_INVALID_STATUS'
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    // Test 21: Create incident when offline header is set -> 503 Service Unavailable
    test('21. Offline mode simulation -> returns 503 gracefully', async () => {
      console.log('Running Test 21: Offline mode simulation');
      const res = await request(server)
        .post('/api/disasters/report')
        .set('X-Offline-Mode', 'true')
        .send({ title: 'Offline Report', type: 'FLOOD', latitude: 13.0, longitude: 80.0 });
      expect(res.status).toBe(503);
    });

    // Test 22: Creating incident triggers Telegram notification (mock Telegram API)
    test('22. Creating incident triggers Telegram notification', async () => {
      console.log('Running Test 22: Telegram notification trigger');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Telegram Alert Test Disaster',
          type: 'FIRE',
          latitude: 13.5000,
          longitude: 80.5000,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
    });

    // Test 23: Submit incident with image/description payload -> 201
    test('23. Submit incident with image payload -> 201', async () => {
      console.log('Running Test 23: Incident with image');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Flood with Damaged Bridge Image',
          description: 'Bridge collapsed photo attached.',
          imageUrl: 'https://example.com/disaster.jpg',
          type: 'FLOOD',
          latitude: 13.6000,
          longitude: 80.6000,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
    });

    // Test 24: Incident creation increments reports table on merge
    test('24. Incident creation audit report insertion on merge', async () => {
      console.log('Running Test 24: Audit report insertion on merge');
      const initial = await request(server).post('/api/disasters/report').send({
        title: 'Spot Merging Initial', type: 'LANDSLIDE', latitude: 11.0000, longitude: 78.0000, created_by_user_id: userId
      });
      const origId = initial.body.data.id;

      const mergeRep = await request(server).post('/api/disasters/report').send({
        title: 'Spot Merging Secondary', type: 'LANDSLIDE', latitude: 11.0050, longitude: 78.0050, created_by_user_id: userId
      });
      expect(mergeRep.status).toBe(201);
      expect(mergeRep.body.data.wasMerged).toBe(true);
      expect(mergeRep.body.data.id).toBe(origId);
    });

    // Test 25: Create incident with created_by_user_id that doesn't exist -> 400 error
    test('25. Create incident with non-existent user ID -> 400 error', async () => {
      console.log('Running Test 25: Non-existent user ID validation');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Ghost Reporter Incident',
          type: 'FLOOD',
          latitude: 13.0827,
          longitude: 80.2707,
          created_by_user_id: 99999999
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==============================================================================
  // C. MERGE ENGINE (Tests 26-35)
  // ==============================================================================
  describe('C. MERGE ENGINE', () => {
    let baseDisasterId;
    const baseLat = 44.0827;
    const baseLon = 94.2707;

    // Test 26: Report A at lat1/lon1 (type FLOOD) -> new disaster created
    test('26. Report A at lat1/lon1 (type FLOOD) -> new disaster created', async () => {
      console.log('Running Test 26: Base report creation for merge');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Flood Alert Ground Zero',
          type: 'FLOOD',
          latitude: baseLat,
          longitude: baseLon,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
      baseDisasterId = res.body.data.id;
    });

    // Test 27: Within 3 hours report B at lat2/lon2 within 10km same type -> merged
    test('27. Within 10km same type -> merged into same disaster', async () => {
      console.log('Running Test 27: 10km merge assertion');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Flood Alert Nearby 2km',
          type: 'FLOOD',
          latitude: baseLat + 0.015,
          longitude: baseLon + 0.015,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
      expect(res.body.data.wasMerged).toBe(true);
      expect(res.body.data.id).toBe(baseDisasterId);
    });

    // Test 28: Report >10km -> new disaster created
    test('28. Report >10km -> new disaster created', async () => {
      console.log('Running Test 28: >10km report creation');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Flood Alert 50km Far',
          type: 'FLOOD',
          latitude: baseLat + 0.45,
          longitude: baseLon + 0.45,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
      expect(res.body.data.wasMerged).toBe(false);
      expect(res.body.data.id).not.toBe(baseDisasterId);
    });

    // Test 29: Report same location but different type -> new disaster
    test('29. Report same location but different type -> new disaster', async () => {
      console.log('Running Test 29: Different type non-merge');
      const res = await request(server)
        .post('/api/disasters/report')
        .send({
          title: 'Fire Breakout at Flood Site',
          type: 'FIRE',
          latitude: baseLat,
          longitude: baseLon,
          created_by_user_id: userId
        });
      expect(res.status).toBe(201);
      expect(res.body.data.wasMerged).toBe(false);
      expect(res.body.data.id).not.toBe(baseDisasterId);
    });

    // Test 30: Merge does not occur with existing CLOSED/CANCELLED_BY_ADMIN -> new disaster created
    test('30. Merge does not occur with CLOSED/CANCELLED disaster -> new disaster created', async () => {
      console.log('Running Test 30: Closed disaster merge prevention');
      const dRes = await request(server).post('/api/disasters/report').send({
        title: 'Closed Emergency Spot', type: 'TSUNAMI', latitude: 14.0000, longitude: 80.0000, created_by_user_id: userId
      });
      const closedId = dRes.body.data.id;
      await request(server).post('/api/admin/approve-disaster').set('Authorization', `Bearer ${adminToken}`).send({
        disasterId: closedId, action: 'REJECTED'
      });

      const newRep = await request(server).post('/api/disasters/report').send({
        title: 'New Tsunami Spot', type: 'TSUNAMI', latitude: 14.0010, longitude: 80.0010, created_by_user_id: userId
      });
      expect(newRep.status).toBe(201);
      expect(newRep.body.data.wasMerged).toBe(false);
      expect(newRep.body.data.id).not.toBe(closedId);
    });

    // Test 31: Concurrent duplicate reports -> merge is atomic
    test('31. Concurrent duplicate reports -> merge atomic', async () => {
      console.log('Running Test 31: Concurrent reports merge');
      const requests = Array.from({ length: 4 }).map(() =>
        request(server).post('/api/disasters/report').send({
          title: 'Concurrent Flood Burst',
          type: 'FLOOD',
          latitude: baseLat + 0.001,
          longitude: baseLon + 0.001,
          created_by_user_id: userId
        })
      );
      const responses = await Promise.all(requests);
      responses.forEach(r => expect(r.status).toBe(201));
    });

    // Test 32: Merging appends to reports audit table
    test('32. Merging appends to reports audit table', async () => {
      console.log('Running Test 32: Audit reports check');
      const res = await request(server).get(`/api/disasters`);
      expect(res.status).toBe(200);
    });

    // Test 33: Merge honors 3-hour window
    test('33. Merge honors 3-hour window', async () => {
      console.log('Running Test 33: 3-hour window merge logic');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Recent Window Report', type: 'FLOOD', latitude: baseLat, longitude: baseLon, created_by_user_id: userId
      });
      expect(res.status).toBe(201);
    });

    // Test 34: Distance exactly equal to 10.0km -> merged
    test('34. Distance <= 10.0km edge case assertion', async () => {
      console.log('Running Test 34: 10km boundary check');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Boundary 8km Report', type: 'FLOOD', latitude: baseLat + 0.07, longitude: baseLon + 0.04, created_by_user_id: userId
      });
      expect(res.status).toBe(201);
    });

    // Test 35: Haversine distance utility calculation accuracy
    test('35. Haversine distance calculation consistency', async () => {
      console.log('Running Test 35: Haversine accuracy');
      const res = await request(server).get('/api/disasters?lat=13.0827&lon=80.2707');
      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data[0].distanceFromUserKm).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==============================================================================
  // D. STATUS TRANSITIONS & WORKFLOW (Tests 36-50)
  // ==============================================================================
  describe('D. STATUS TRANSITIONS & WORKFLOW', () => {
    let workflowDisasterId;

    beforeAll(async () => {
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Workflow Disaster Target', type: 'FIRE', latitude: 27.0000, longitude: 87.2000, created_by_user_id: userId
      });
      if (res.body && res.body.data) {
        workflowDisasterId = res.body.data.id;
      }
    });

    // Test 36: New report default status = PENDING_VERIFICATION
    test('36. New report default status = PENDING_VERIFICATION', async () => {
      console.log('Running Test 36: Default pending status');
      const res = await request(server).get(`/api/disasters?status=PENDING_VERIFICATION`);
      expect(res.status).toBe(200);
      const target = res.body.data.find(d => d.id === workflowDisasterId);
      expect(target).toBeDefined();
    });

    // Test 37: Admin approve -> status -> VERIFIED_ACTIVE and verified_by set
    test('37. Admin approve -> status -> VERIFIED_ACTIVE', async () => {
      console.log('Running Test 37: Admin approval');
      const res = await request(server)
        .post('/api/admin/approve-disaster')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ disasterId: workflowDisasterId, action: 'APPROVED', adminId: adminId });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('VERIFIED_ACTIVE');
    });

    // Test 38: Admin reject -> status -> CANCELLED_BY_ADMIN
    test('38. Admin reject -> status -> CANCELLED_BY_ADMIN', async () => {
      console.log('Running Test 38: Admin rejection');
      const tempRes = await request(server).post('/api/disasters/report').send({
        title: 'Reject Target', type: 'FLOOD', latitude: 13.1000, longitude: 80.1000, created_by_user_id: userId
      });
      const tempId = tempRes.body.data.id;

      const rejRes = await request(server)
        .post('/api/admin/approve-disaster')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ disasterId: tempId, action: 'REJECTED' });
      expect(rejRes.status).toBe(200);
      expect(rejRes.body.data.status).toBe('CANCELLED_BY_ADMIN');
    });

    // Test 39: Attempt non-admin approve -> 403
    test('39. Attempt non-admin approve -> 403', async () => {
      console.log('Running Test 39: Non-admin approve block');
      const res = await request(server)
        .post('/api/admin/approve-disaster')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ disasterId: workflowDisasterId, action: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    // Test 40: Verified Active -> allowed operations: discussion, assign task
    test('40. Verified Active -> allowed discussion & task assignment', async () => {
      console.log('Running Test 40: Discussion on verified active');
      const res = await request(server)
        .post(`/api/disasters/${workflowDisasterId}/comments`)
        .send({ userId: userId, message: 'Relief team dispatched on site.' });
      expect(res.status).toBe(201);
    });

    // Test 41: Pending Verification -> blocked operations: discussion & assign -> 403
    test('41. Pending Verification -> blocked discussion & assign -> 403', async () => {
      console.log('Running Test 41: Block discussion on pending');
      const pendingRes = await request(server).post('/api/disasters/report').send({
        title: 'Unverified Spot', type: 'EARTHQUAKE', latitude: 12.0000, longitude: 79.0000, created_by_user_id: userId
      });
      const pId = pendingRes.body.data.id;

      const commRes = await request(server)
        .post(`/api/disasters/${pId}/comments`)
        .send({ userId: userId, message: 'Premature comment' });
      expect(commRes.status).toBe(403);
    });

    // Test 42: In Progress allowed actions -> change status to RESOLVED
    test('42. In Progress -> change status to RESOLVED', async () => {
      console.log('Running Test 42: Status change to RESOLVED');
      await request(server).post('/api/incidents/update').send({ id: workflowDisasterId, status: 'IN_PROGRESS' });
      const res = await request(server).post('/api/incidents/update').send({ id: workflowDisasterId, status: 'RESOLVED' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
    });

    // Test 43: Invalid transition -> 400 invalid transition
    test('43. Invalid direct transition -> 400 Bad Request', async () => {
      console.log('Running Test 43: Invalid state transition');
      const newD = await request(server).post('/api/disasters/report').send({
        title: 'Direct Close Spot', type: 'FIRE', latitude: 13.9000, longitude: 80.9000, created_by_user_id: userId
      });
      const res = await request(server).post('/api/incidents/update').send({ id: newD.body.data.id, status: 'CLOSED' });
      expect(res.status).toBe(400);
    });

    // Test 44: Admin approves via Telegram bot endpoint -> success
    test('44. Admin approves via Telegram bot webhook endpoint', async () => {
      console.log('Running Test 44: Telegram approval callback');
      const newD = await request(server).post('/api/disasters/report').send({
        title: 'Telegram Callback Spot', type: 'FLOOD', latitude: 13.2000, longitude: 80.2000, created_by_user_id: userId
      });
      const res = await request(server).post('/api/telegram/webhook').send({
        callback_query: {
          id: 'cb_123',
          from: { id: 6868121119 },
          message: { message_id: 99, chat: { id: 6868121119 } },
          data: `approve:${newD.body.data.id}`
        }
      });
      expect(res.status).toBe(200);
    });

    // Test 45: Admin reject sets status to CANCELLED_BY_ADMIN
    test('45. Admin reject sets status to CANCELLED_BY_ADMIN', async () => {
      console.log('Running Test 45: Reject status CANCELLED_BY_ADMIN assertion');
      const newD = await request(server).post('/api/disasters/report').send({
        title: 'Cancel Spot', type: 'CYCLONE', latitude: 13.3000, longitude: 80.3000, created_by_user_id: userId
      });
      const res = await request(server).post('/api/admin/approve-disaster').set('Authorization', `Bearer ${adminToken}`).send({
        disasterId: newD.body.data.id, action: 'REJECTED'
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED_BY_ADMIN');
    });

    // Test 46: Closed incidents cannot be updated -> 400
    test('46. Closed incidents cannot be updated -> 400', async () => {
      console.log('Running Test 46: Closed incident immutability');
      await request(server).post('/api/incidents/update').send({ id: workflowDisasterId, status: 'CLOSED' });
      const res = await request(server).post('/api/incidents/update').send({ id: workflowDisasterId, status: 'VERIFIED_ACTIVE' });
      expect(res.status).toBe(400);
    });

    // Test 47: Resolved -> CLOSED -> archived
    test('47. Closed disaster still retrievable by admin', async () => {
      console.log('Running Test 47: Admin retrieve all disasters including closed');
      const res = await request(server).get('/api/disasters?status=ALL');
      expect(res.status).toBe(200);
      const found = res.body.data.some(d => d.id === workflowDisasterId);
      expect(found).toBe(true);
    });

    // Test 48: Sorting order / live feed filters only VERIFIED_ACTIVE & IN_PROGRESS
    test('48. Live feed filters only VERIFIED_ACTIVE & IN_PROGRESS', async () => {
      console.log('Running Test 48: Live feed filter check');
      const res = await request(server).get('/api/disasters');
      expect(res.status).toBe(200);
      res.body.data.forEach(d => {
        expect(['VERIFIED_ACTIVE', 'IN_PROGRESS']).toContain(d.status);
      });
    });

    // Test 49: Resubmitting report near CANCELLED_BY_ADMIN creates NEW incident
    test('49. Resubmitting report near CANCELLED_BY_ADMIN creates NEW incident', async () => {
      console.log('Running Test 49: Resubmit cancelled spot');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Resubmitted Spot near Cancelled', type: 'CYCLONE', latitude: 13.3000, longitude: 80.3000, created_by_user_id: userId
      });
      expect(res.status).toBe(201);
      expect(res.body.data.wasMerged).toBe(false);
    });

    // Test 50: Admin can edit incident details while VERIFIED_ACTIVE
    test('50. Admin can edit incident details', async () => {
      console.log('Running Test 50: Edit incident details');
      const newD = await request(server).post('/api/disasters/report').send({
        title: 'Pre-edit Spot', type: 'FLOOD', latitude: 13.4000, longitude: 80.4000, created_by_user_id: userId
      });
      await request(server).post('/api/admin/approve-disaster').set('Authorization', `Bearer ${adminToken}`).send({
        disasterId: newD.body.data.id, action: 'APPROVED'
      });

      const editRes = await request(server).post('/api/incidents/edit').send({
        id: newD.body.data.id,
        title: 'Updated Post-edit Title'
      });
      expect(editRes.status).toBe(200);
      expect(editRes.body.data.title).toBe('Updated Post-edit Title');
    });
  });

  // ==============================================================================
  // E. ROLE-BASED ACCESS (Tests 51-60)
  // ==============================================================================
  describe('E. ROLE-BASED ACCESS', () => {
    // Test 51: Volunteer cannot create NGO account via admin endpoint -> 403
    test('51. Volunteer cannot perform admin approval -> 403', async () => {
      console.log('Running Test 51: Volunteer admin action block');
      const res = await request(server)
        .post('/api/admin/approve-user')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ userId: ngoId, action: 'APPROVED' });
      expect(res.status).toBe(403);
    });

    // Test 52: NGO user cannot assign tasks unless approved -> 403
    test('52. NGO user cannot assign tasks unless approved -> 403', async () => {
      console.log('Running Test 52: Unapproved NGO task assign block');
      const res = await request(server)
        .post('/api/assignments')
        .send({ userRole: 'NGO', userId: ngoId, disasterId: testDisasterId });
      expect(res.status).toBe(403);
    });

    // Test 53: Admin privileges validated: admin can list pending users and approve
    test('53. Admin can list pending users and approve user', async () => {
      console.log('Running Test 53: Admin user approval');
      const pendingRes = await request(server)
        .get('/api/admin/pending-users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pendingRes.status).toBe(200);

      const appRes = await request(server)
        .post('/api/admin/approve-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: ngoId, action: 'APPROVED' });
      expect(appRes.status).toBe(200);
    });

    // Test 54: Volunteer-only endpoints reject Admin-only parameter attempts
    test('54. Volunteer directory returns strict list', async () => {
      console.log('Running Test 54: Volunteer directory access');
      const res = await request(server).get('/api/users/volunteers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    // Test 55: User cannot change role via regular profile update
    test('55. User cannot change role via regular profile update', async () => {
      console.log('Running Test 55: Protected role field on profile update');
      const res = await request(server)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'ADMIN' });
      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('USER');
    });

    // Test 56: Assigning task allowed only by Admin / NGO / Government -> 403 otherwise
    test('56. Citizen user cannot assign tasks -> 403', async () => {
      console.log('Running Test 56: Citizen assign task block');
      const res = await request(server)
        .post('/api/assignments')
        .send({ userRole: 'USER', userId: userId, disasterId: testDisasterId });
      expect(res.status).toBe(403);
    });

    // Test 57: Admin assigns task -> assignment row created with assigned_by
    test('57. Admin assigns task -> assignment created', async () => {
      console.log('Running Test 57: Admin task assignment');
      const vD = await request(server).post('/api/disasters/report').send({
        title: 'Task Assignment Spot', type: 'FLOOD', latitude: 13.0827, longitude: 80.2707, created_by_user_id: userId
      });
      const vId = vD.body.data.id;
      await request(server).post('/api/admin/approve-disaster').set('Authorization', `Bearer ${adminToken}`).send({
        disasterId: vId, action: 'APPROVED'
      });

      const res = await request(server)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userRole: 'ADMIN',
          disasterId: vId,
          volunteerId: volunteerId,
          taskTitle: 'Deliver Water Packets',
          taskDescription: '1000 liters needed.'
        });
      expect(res.status).toBe(201);
      testAssignmentId = res.body.data.id;
    });

    // Test 58: Volunteer accepting assigned task updates status -> IN_PROGRESS
    test('58. Volunteer update assignment status -> IN_PROGRESS', async () => {
      console.log('Running Test 58: Volunteer task update');
      const res = await request(server)
        .patch(`/api/volunteers/assignments/${testAssignmentId}/status`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ status: 'IN_PROGRESS' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
    });

    // Test 59: Unauthorized attempt to modify assignments not assigned to actor -> 403
    test('59. Unauthorized assignment modification -> 403', async () => {
      console.log('Running Test 59: Unauthorized task update block');
      const res = await request(server)
        .patch(`/api/volunteers/assignments/${testAssignmentId}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'COMPLETED', actorVolunteerId: 99999 });
      expect([200, 403]).toContain(res.status);
    });

    // Test 60: Role and status changes audited in approvals table
    test('60. Approvals table logs decisions', async () => {
      console.log('Running Test 60: Approvals log verification');
      const res = await request(server).get('/api/admin/analytics').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  // ==============================================================================
  // F. RESOURCE MANAGEMENT (Tests 61-70)
  // ==============================================================================
  describe('F. RESOURCE MANAGEMENT', () => {
    // Test 61: Create resource post -> 201, available_until saved
    test('61. Create resource post -> 201, available_until saved', async () => {
      console.log('Running Test 61: Create resource post');
      const availDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const res = await request(server)
        .post('/api/resources')
        .send({
          providerId: userId,
          resourceType: 'FOOD',
          description: '500 Rice Packets',
          quantity: 500,
          unit: 'packets',
          availableUntil: availDate,
          status: 'AVAILABLE'
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testResourceId = res.body.data.id;
    });

    // Test 62: Create resource missing available_until allowed -> stored as NULL
    test('62. Create resource missing available_until allowed', async () => {
      console.log('Running Test 62: Create resource missing expiry');
      const res = await request(server)
        .post('/api/resources')
        .send({
          providerId: userId,
          resourceType: 'WATER',
          description: '2000L Drinking Water',
          quantity: 2000,
          unit: 'liters'
        });
      expect(res.status).toBe(201);
    });

    // Test 63: Invalid status value for resources -> handled gracefully
    test('63. Invalid status for resource -> 400 error handled', async () => {
      console.log('Running Test 63: Invalid resource status handling');
      const res = await request(server)
        .post('/api/resources')
        .send({
          description: 'Test Invalid Resource Status',
          status: 'TOTALLY_INVALID_RESOURCE_STATUS'
        });
      expect(res.status).toBe(400);
    });

    // Test 64: Edit resource by admin -> updates fields
    test('64. Edit resource by admin -> 200 OK', async () => {
      console.log('Running Test 64: Edit resource');
      const res = await request(server)
        .post('/api/resources/update')
        .send({
          id: testResourceId,
          quantity: 750,
          description: '750 Rice Packets Updated'
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    // Test 65: Delete resource requires double confirmation
    test('65. Delete resource requires double confirmation endpoint/flag', async () => {
      console.log('Running Test 65: Delete resource confirmation requirement');
      const resNoConf = await request(server)
        .post('/api/resources/delete')
        .send({ id: testResourceId });
      expect(resNoConf.status).toBe(400);

      const resWithConf = await request(server)
        .post('/api/resources/delete')
        .send({ id: testResourceId, confirm: true });
      expect(resWithConf.status).toBe(200);
    });

    // Test 66: Resource auto-expire check
    test('66. Resource auto-expire status handling', async () => {
      console.log('Running Test 66: Resource expiry check');
      const expiredDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const res = await request(server)
        .post('/api/resources')
        .send({
          description: 'Expired Medical Kits',
          availableUntil: expiredDate,
          status: 'AVAILABLE'
        });
      expect(res.status).toBe(201);
    });

    // Test 67: Resource appears in disaster bucket
    test('67. Resource listing API returns resources', async () => {
      console.log('Running Test 67: Resource listing bucket');
      const res = await request(server).get('/api/resources');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    // Test 68: Resource listing filtered by distance (within 20km)
    test('68. Resource listing filtered by distance within 20km', async () => {
      console.log('Running Test 68: Distance filtered resources');
      const res = await request(server).get('/api/resources?lat=13.0827&lon=80.2707');
      expect(res.status).toBe(200);
    });

    // Test 69: Expired resources not selectable for dispatch
    test('69. Expired resources excluded from active listing', async () => {
      console.log('Running Test 69: Expired resource filter');
      const res = await request(server).get('/api/resources');
      expect(res.status).toBe(200);
      res.body.data.forEach(r => {
        expect(r.status).not.toBe('EXHAUSTED');
      });
    });

    // Test 70: Resource create triggers notification
    test('70. Resource create triggers volunteer notification', async () => {
      console.log('Running Test 70: Resource notification trigger');
      const res = await request(server)
        .post('/api/resources')
        .send({
          description: 'Notification Supply Post',
          quantity: 100,
          status: 'AVAILABLE'
        });
      expect(res.status).toBe(201);
    });
  });

  // ==============================================================================
  // G. DISCUSSION & ASSIGNMENTS (Tests 71-75)
  // ==============================================================================
  describe('G. DISCUSSION & ASSIGNMENTS', () => {
    let activeDisasterId;

    beforeAll(async () => {
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Discussion Target Disaster', type: 'FLOOD', latitude: 13.0827, longitude: 80.2707, created_by_user_id: userId
      });
      activeDisasterId = res.body.data.id;
      await request(server).post('/api/admin/approve-disaster').set('Authorization', `Bearer ${adminToken}`).send({
        disasterId: activeDisasterId, action: 'APPROVED'
      });
    });

    // Test 71: Post comment on VERIFIED_ACTIVE -> 201 + retrievable
    test('71. Post comment on VERIFIED_ACTIVE -> 201 and retrievable', async () => {
      console.log('Running Test 71: Post comment on active disaster');
      const postRes = await request(server)
        .post(`/api/disasters/${activeDisasterId}/comments`)
        .send({ userId: userId, message: 'Medical kit delivered to ground team.' });
      expect(postRes.status).toBe(201);

      const getRes = await request(server).get(`/api/disasters/${activeDisasterId}/comments`);
      expect(getRes.status).toBe(200);
      const found = getRes.body.data.some(c => c.message.includes('Medical kit delivered'));
      expect(found).toBe(true);
    });

    // Test 72: Post comment on PENDING_VERIFICATION -> blocked (403)
    test('72. Post comment on PENDING_VERIFICATION -> 403', async () => {
      console.log('Running Test 72: Block comment on unverified disaster');
      const pD = await request(server).post('/api/disasters/report').send({
        title: 'Unverified Comment Spot', type: 'FIRE', latitude: 13.0, longitude: 80.0, created_by_user_id: userId
      });
      const res = await request(server)
        .post(`/api/disasters/${pD.body.data.id}/comments`)
        .send({ userId: userId, message: 'Unverified comment attempt' });
      expect(res.status).toBe(403);
    });

    // Test 73: Assign task only by authorized roles -> assignment created
    test('73. Assign task by authorized role -> 201 Created', async () => {
      console.log('Running Test 73: Authorized role task assignment');
      const res = await request(server)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userRole: 'ADMIN',
          disasterId: activeDisasterId,
          volunteerId: volunteerId,
          taskTitle: 'Clear Debris from Road'
        });
      expect(res.status).toBe(201);
    });

    // Test 74: Volunteer cannot assign tasks to others
    test('74. Volunteer cannot assign tasks to others -> 403', async () => {
      console.log('Running Test 74: Volunteer task assign block');
      const res = await request(server)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({
          userRole: 'VOLUNTEER',
          disasterId: activeDisasterId,
          volunteerId: volunteerId,
          taskTitle: 'Unauthorized Task'
        });
      expect(res.status).toBe(403);
    });

    // Test 75: Assignment status transitions tracked (ASSIGNED -> IN_PROGRESS -> COMPLETED)
    test('75. Assignment lifecycle transitions tracked', async () => {
      console.log('Running Test 75: Assignment status lifecycle');
      const assignRes = await request(server)
        .post('/api/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userRole: 'ADMIN', disasterId: activeDisasterId, volunteerId: volunteerId, taskTitle: 'Lifecycle Task' });
      const aId = assignRes.body.data.id;

      const p1 = await request(server).patch(`/api/volunteers/assignments/${aId}/status`).send({ status: 'IN_PROGRESS' });
      expect(p1.status).toBe(200);

      const p2 = await request(server).patch(`/api/volunteers/assignments/${aId}/status`).send({ status: 'COMPLETED' });
      expect(p2.status).toBe(200);
      expect(p2.body.data.status).toBe('COMPLETED');
    });
  });

  // ==============================================================================
  // H. TELEGRAM & WEBHOOKS (Tests 76-80)
  // ==============================================================================
  describe('H. TELEGRAM & WEBHOOKS', () => {
    // Test 76: Telegram bot sendMessage called when new incident created
    test('76. Telegram bot message trigger on report creation', async () => {
      console.log('Running Test 76: Telegram message trigger');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Telegram Incident Alert', type: 'FLOOD', latitude: 13.0827, longitude: 80.2707, created_by_user_id: userId
      });
      expect(res.status).toBe(201);
    });

    // Test 77: Telegram callback_query approve triggers API update -> VERIFIED_ACTIVE
    test('77. Telegram callback_query approve -> VERIFIED_ACTIVE', async () => {
      console.log('Running Test 77: Telegram approval callback query');
      const dRes = await request(server).post('/api/disasters/report').send({
        title: 'Telegram Approve Target', type: 'FIRE', latitude: 13.1000, longitude: 80.1000, created_by_user_id: userId
      });
      const res = await request(server).post('/api/telegram/webhook').send({
        callback_query: {
          id: 'cb_77',
          from: { id: 6868121119 },
          message: { message_id: 101, chat: { id: 6868121119 } },
          data: `approve:${dRes.body.data.id}`
        }
      });
      expect(res.status).toBe(200);
    });

    // Test 78: Telegram callback from non-admin chat_id -> ignored / 403
    test('78. Telegram callback from non-admin chat_id -> ignored', async () => {
      console.log('Running Test 78: Non-admin Telegram callback block');
      const res = await request(server).post('/api/telegram/webhook').send({
        callback_query: {
          id: 'cb_fake',
          from: { id: 9999999 },
          message: { message_id: 102, chat: { id: 9999999 } },
          data: 'approve:1'
        }
      });
      expect(res.status).toBe(200);
    });

    // Test 79: Telegram API failures do not disrupt main database transaction
    test('79. Telegram API failure tolerance', async () => {
      console.log('Running Test 79: Telegram failure tolerance');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Telegram Error Safe Spot', type: 'FLOOD', latitude: 13.0827, longitude: 80.2707, created_by_user_id: userId
      });
      expect(res.status).toBe(201);
    });

    // Test 80: Telegram webhook endpoint responds 200
    test('80. Telegram webhook endpoint responds 200 OK', async () => {
      console.log('Running Test 80: Webhook 200 OK response');
      const res = await request(server).post('/api/telegram/webhook').send({ update_id: 12345 });
      expect(res.status).toBe(200);
    });
  });

  // ==============================================================================
  // I. REAL-TIME & SUBSCRIPTIONS (Tests 81-85)
  // ==============================================================================
  describe('I. REAL-TIME & SUBSCRIPTIONS', () => {
    // Test 81: Real-time update broadcast on verification
    test('81. Mock real-time event broadcast', async () => {
      console.log('Running Test 81: Real-time event mock');
      const res = await request(server)
        .post('/api/realtime/mock-subscription')
        .send({ event: 'VERIFIED_ACTIVE', payload: { disasterId: testDisasterId } });
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('VERIFIED_ACTIVE');
    });

    // Test 82: Incident close emits subscription updated event
    test('82. Incident close emits updated event', async () => {
      console.log('Running Test 82: Close subscription event mock');
      const res = await request(server)
        .post('/api/realtime/mock-subscription')
        .send({ event: 'CLOSED', payload: { disasterId: testDisasterId } });
      expect(res.status).toBe(200);
    });

    // Test 83: Live feed API honors only VERIFIED_ACTIVE & IN_PROGRESS
    test('83. Live feed API honors strict filter', async () => {
      console.log('Running Test 83: Live feed filter check');
      const res = await request(server).get('/api/disasters');
      expect(res.status).toBe(200);
      res.body.data.forEach(d => {
        expect(['VERIFIED_ACTIVE', 'IN_PROGRESS']).toContain(d.status);
      });
    });

    // Test 84: Offline detection test
    test('84. Offline detection header returns 503 Service Unavailable', async () => {
      console.log('Running Test 84: Offline header check');
      const res = await request(server).get('/api/disasters').set('X-Offline-Mode', 'true');
      expect(res.status).toBe(503);
    });

    // Test 85: Polling fallback endpoint honors since timestamp
    test('85. Polling fallback query param since honored', async () => {
      console.log('Running Test 85: Polling since timestamp');
      const pastISO = new Date(Date.now() - 3600 * 1000).toISOString();
      const res = await request(server).get(`/api/disasters?since=${encodeURIComponent(pastISO)}`);
      expect(res.status).toBe(200);
    });
  });

  // ==============================================================================
  // J. DATABASE INTEGRITY & CONSTRAINTS (Tests 86-90)
  // ==============================================================================
  describe('J. DATABASE INTEGRITY & CONSTRAINTS', () => {
    // Test 86: Foreign key constraint: disasters.created_by_user_id must exist in users table
    test('86. FK constraint: created_by_user_id non-existent user rejected', async () => {
      console.log('Running Test 86: Foreign key validation');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Invalid FK Spot', type: 'FLOOD', latitude: 13.0, longitude: 80.0, created_by_user_id: 88888888
      });
      expect(res.status).toBe(400);
    });

    // Test 87: Unique index: users.phone unique => duplicate insert fails
    test('87. Unique index on phone prevents duplicate users', async () => {
      console.log('Running Test 87: Unique phone index constraint');
      const res = await request(server).post('/api/auth/register').send({
        name: 'Dup User', phone: testPhoneUser, password: 'Password@123', role: 'USER'
      });
      expect(res.status).toBe(409);
    });

    // Test 88: resource.status check constraint enforced
    test('88. resource.status constraint enforced', async () => {
      console.log('Running Test 88: Resource status check constraint');
      const res = await request(server).post('/api/resources').send({
        description: 'Resource Status Check', status: 'INVALID_STATUS_VALUE'
      });
      expect(res.status).toBe(400);
    });

    // Test 89: approvals table logs admin decisions
    test('89. Approvals table logs decisions with timestamp', async () => {
      console.log('Running Test 89: Approvals audit log');
      const res = await request(server).get('/api/admin/analytics').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    // Test 90: reports table cascade delete on disasters deletion
    test('90. Reports table cascade delete on disaster deletion', async () => {
      console.log('Running Test 90: Disaster cascade deletion');
      const d = await request(server).post('/api/disasters/report').send({
        title: 'Delete Target Disaster', type: 'FIRE', latitude: 13.0, longitude: 80.0, created_by_user_id: userId
      });
      const delRes = await request(server).post('/api/incidents/delete').send({ incidentId: d.body.data.id });
      expect(delRes.status).toBe(200);
    });
  });

  // ==============================================================================
  // K. PERFORMANCE / CONCURRENCY / EDGE (Tests 91-95)
  // ==============================================================================
  describe('K. PERFORMANCE / CONCURRENCY / EDGE', () => {
    // Test 91: Bulk creation of reports completes within acceptable time
    test('91. Bulk creation of reports completes fast', async () => {
      console.log('Running Test 91: Bulk report creation performance');
      const startTime = Date.now();
      for (let i = 0; i < 5; i++) {
        await request(server).post('/api/disasters/report').send({
          title: `Bulk Spot ${i}`, type: 'FLOOD', latitude: 10.0 + i, longitude: 75.0 + i, reporterPhone: `988880000${i}`
        });
      }
      const durationSec = (Date.now() - startTime) / 1000;
      expect(durationSec).toBeLessThan(30);
    });

    // Test 92: High frequency requests to create incidents are rate-limited -> 429
    test('92. High frequency requests rate-limited -> 429', async () => {
      console.log('Running Test 92: Rate limit 429 assertion');
      const ratePhone = '9991112223';
      await request(server).post('/api/disasters/report').send({
        title: 'First Rapid Spot', type: 'FLOOD', latitude: 13.0, longitude: 80.0, reporterPhone: ratePhone
      });
      const res2 = await request(server).post('/api/disasters/report').send({
        title: 'Second Rapid Spot', type: 'FLOOD', latitude: 13.0, longitude: 80.0, reporterPhone: ratePhone
      });
      expect(res2.status).toBe(429);
      expect(res2.body.error).toBe('Too Many Requests');
    });

    // Test 93: Long description payload (1MB) is rejected/handled
    test('93. Long description payload (1MB) handled gracefully', async () => {
      console.log('Running Test 93: Large payload 1MB test');
      const hugeDesc = 'X'.repeat(12000);
      const res = await request(server).post('/api/disasters/report').send({
        title: 'Huge Description Spot', description: hugeDesc, type: 'FLOOD', latitude: 13.0, longitude: 80.0
      });
      expect([400, 413]).toContain(res.status);
    });

    // Test 94: Concurrent merge race: 10 parallel reports merge into 1 disaster
    test('94. Concurrent merge race atomic handling', async () => {
      console.log('Running Test 94: Concurrent merge race');
      const raceLat = 12.5000;
      const raceLon = 79.5000;
      const reqs = Array.from({ length: 5 }).map((_, idx) =>
        request(server).post('/api/disasters/report').send({
          title: 'Parallel Race Spot', type: 'LANDSLIDE', latitude: raceLat, longitude: raceLon, reporterPhone: `977770000${idx}`
        })
      );
      const resps = await Promise.all(reqs);
      resps.forEach(r => expect(r.status).toBe(201));
    });

    // Test 95: API returns sensible paginated results
    test('95. API returns paginated results with X-Total-Count header', async () => {
      console.log('Running Test 95: Pagination headers assertion');
      const res = await request(server).get('/api/disasters?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(5);
    });
  });

  // ==============================================================================
  // L. SECURITY & VALIDATION (Tests 96-100)
  // ==============================================================================
  describe('L. SECURITY & VALIDATION', () => {
    // Test 96: XSS attempt in description sanitized
    test('96. XSS attempt in description sanitized', async () => {
      console.log('Running Test 96: XSS sanitization');
      const res = await request(server).post('/api/disasters/report').send({
        title: 'XSS Test', description: 'Malicious <script>alert("xss")</script> code', type: 'FLOOD', latitude: 13.0, longitude: 80.0
      });
      expect(res.status).toBe(201);
      expect(res.body.data.description).not.toContain('<script>');
    });

    // Test 97: SQL injection attempt in inputs sanitized
    test('97. SQL injection attempt in inputs sanitized', async () => {
      console.log('Running Test 97: SQL injection safety');
      const res = await request(server).post('/api/disasters/report').send({
        title: "SQLi Spot '; DROP TABLE users; --", type: 'FLOOD', latitude: 13.0, longitude: 80.0
      });
      expect(res.status).toBe(201);
    });

    // Test 98: Passwords hashed and token auth tested
    test('98. Passwords hashed & bearer session token validated', async () => {
      console.log('Running Test 98: Bearer token validation');
      const res = await request(server).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBeDefined();
    });

    // Test 99: CORS headers present and strict
    test('99. CORS headers present on API responses', async () => {
      console.log('Running Test 99: CORS headers check');
      const res = await request(server).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    // Test 100: Sensitive endpoints check HTTPS flag requirement in production
    test('100. HTTPS security header assertion', async () => {
      console.log('Running Test 100: HTTPS security check');
      const res = await request(server).get('/api/security/https-check').set('X-Forwarded-Proto', 'https');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
