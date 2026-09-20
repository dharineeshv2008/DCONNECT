const { supabaseDb } = require('../supabaseClient');
const registerApi = require('../api/auth/register');
const loginApi = require('../api/auth/login');
const createIncidentApi = require('../api/incidents/create');

function createMockRes() {
  let statusCode = 200;
  let headers = {};
  let body = null;
  return {
    writeHead: (code, h) => {
      statusCode = code;
      headers = h;
    },
    end: (b) => {
      body = typeof b === 'string' ? JSON.parse(b) : b;
    },
    getResponse: () => ({ statusCode, headers, body })
  };
}

async function testFkConstraintFlow() {
  console.log('🧪 Starting Foreign Key Constraint & User Auth Verification Test...\n');

  // Generate unique test phone number (10 digits)
  const testPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const testName = 'FK Test Citizen ' + Math.floor(Math.random() * 1000);

  // TEST 1: Register New User
  console.log(`--- Test 1: Register User (${testName}, Phone: ${testPhone}) ---`);
  const regReq = {
    method: 'POST',
    body: {
      name: testName,
      phone: testPhone,
      password: 'Password@123',
      role: 'USER'
    }
  };
  const regRes = createMockRes();
  await registerApi(regReq, regRes);
  const regResp = regRes.getResponse();
  console.log('Register Response Status:', regResp.statusCode);
  console.log('Register Response Body:', regResp.body);

  if (regResp.statusCode !== 201 || !regResp.body.success || !regResp.body.data.id) {
    throw new Error('FAILED! User registration did not return a valid user ID.');
  }

  const registeredUserId = regResp.body.data.id;
  console.log(`✅ Test 1 Passed: User inserted into users table with ID #${registeredUserId}`);

  // Verify DB record for registered user
  const dbUser = await supabaseDb.getUserById(registeredUserId);
  if (!dbUser || dbUser.phone !== testPhone) {
    throw new Error(`FAILED! User ID #${registeredUserId} not found in database users table.`);
  }
  console.log(`✅ DB Check Passed: Verified user record in users table: ${dbUser.name} (${dbUser.role})`);

  // TEST 2: Login User
  console.log(`\n--- Test 2: Login User (Phone: ${testPhone}) ---`);
  const loginReq = {
    method: 'POST',
    body: {
      phone: testPhone,
      password: 'Password@123',
      role: 'USER'
    }
  };
  const loginRes = createMockRes();
  await loginApi(loginReq, loginRes);
  const loginResp = loginRes.getResponse();
  console.log('Login Response Status:', loginResp.statusCode);
  console.log('Login Response Body:', loginResp.body);

  if (loginResp.statusCode !== 200 || !loginResp.body.success || loginResp.body.data.id !== registeredUserId) {
    throw new Error('FAILED! Login did not return the correct registered user object.');
  }
  console.log('✅ Test 2 Passed: Login returned full user object with valid DB ID.');

  // TEST 3: Report Incident with Invalid User ID (Should return 401 without FK crash)
  console.log('\n--- Test 3: Report Incident with Invalid User ID #99999999 (Should return 401) ---');
  const invalidIncidentReq = {
    method: 'POST',
    body: {
      type: 'FIRE',
      title: 'FK Error Validation Test Fire',
      description: 'Testing invalid user ID rejection',
      latitude: 12.9716,
      longitude: 77.5946,
      locationName: 'Invalid User Test Spot',
      reporterId: 99999999
    }
  };
  const invalidIncidentRes = createMockRes();
  await createIncidentApi(invalidIncidentReq, invalidIncidentRes);
  const invalidIncidentResp = invalidIncidentRes.getResponse();
  console.log('Invalid User Response Status:', invalidIncidentResp.statusCode);
  console.log('Invalid User Response Body:', invalidIncidentResp.body);

  if (invalidIncidentResp.statusCode !== 401 || invalidIncidentResp.body.success !== false) {
    throw new Error(`FAILED! Expected status 401 for invalid user ID, got ${invalidIncidentResp.statusCode}`);
  }
  console.log('✅ Test 3 Passed: Invalid user ID was rejected with 401 BEFORE database insert.');

  // TEST 4: Report Incident with Valid Registered User ID (Should succeed with NO FK error)
  console.log(`\n--- Test 4: Report Incident with Valid User ID #${registeredUserId} (Should succeed) ---`);
  const validIncidentReq = {
    method: 'POST',
    body: {
      type: 'CYCLONE',
      title: 'FK Verification Emergency Incident',
      description: 'Emergency incident created by valid registered user.',
      latitude: 11.0168,
      longitude: 76.9558,
      locationName: 'Coimbatore Command Center',
      reporterId: registeredUserId
    }
  };
  const validIncidentRes = createMockRes();
  await createIncidentApi(validIncidentReq, validIncidentRes);
  const validIncidentResp = validIncidentRes.getResponse();
  console.log('Valid Incident Response Status:', validIncidentResp.statusCode);
  console.log('Valid Incident Response Body:', validIncidentResp.body);

  if (validIncidentResp.statusCode !== 201 || !validIncidentResp.body.success) {
    throw new Error(`FAILED! Disaster reporting failed with status ${validIncidentResp.statusCode}`);
  }

  const createdIncident = validIncidentResp.body.data;
  console.log(`Disaster Created ID: #${createdIncident.id}, created_by_user_id: ${createdIncident.created_by_user_id}`);

  // DB Verification of created disaster
  const dbDisaster = await supabaseDb.getDisasterById(createdIncident.id);
  if (!dbDisaster || dbDisaster.created_by_user_id !== registeredUserId) {
    throw new Error(`FAILED! Disaster created_by_user_id mismatch. Expected ${registeredUserId}, got ${dbDisaster?.created_by_user_id}`);
  }
  console.log('✅ Test 4 Passed: Disaster created cleanly using valid user ID. No foreign key error!');

  console.log('\n🎉 ALL FOREIGN KEY CONSTRAINT & AUTH TESTS PASSED SUCCESSFULLY!');
}

testFkConstraintFlow().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
