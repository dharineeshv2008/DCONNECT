const http = require('http');

const BASE_URL = 'http://localhost:8000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Disaster Workflow, Role Control, and Transition Tests...\n');
  let testCount = 0;
  let passedCount = 0;

  // TEST 1: Incident creation defaults to PENDING_VERIFICATION
  testCount++;
  console.log('TEST 1: Disaster submission initial status check');
  const uniqueLat = 25.0 + Math.random() * 5.0;
  const uniqueLon = 85.0 + Math.random() * 5.0;
  const createRes = await makeRequest('POST', '/api/incidents/create', {
    type: 'FLOOD',
    title: 'Test Workflow Flood Incident',
    description: 'Testing workflow verification and locking.',
    latitude: uniqueLat,
    longitude: uniqueLon,
    locationName: 'Workflow Fresh Test Site'
  });

  if (createRes.status === 201 && createRes.body.data && createRes.body.data.status === 'PENDING_VERIFICATION') {
    console.log(`✅ Passed: Incident #${createRes.body.data.id} created with initial status 'PENDING_VERIFICATION'.`);
    passedCount++;
  } else {
    console.error(`❌ Failed: Expected status 201 & PENDING_VERIFICATION, got HTTP ${createRes.status}`, createRes.body);
  }

  const incidentId = createRes.body.data ? createRes.body.data.id : null;

  // TEST 2: Live Feed visibility check (PENDING_VERIFICATION must be HIDDEN from live feed)
  testCount++;
  console.log('\nTEST 2: Live feed visibility check (PENDING_VERIFICATION items must be excluded)');
  const listRes = await makeRequest('GET', '/api/incidents/list');
  const liveList = listRes.body.data || [];
  const foundPendingInFeed = liveList.some(i => i.id === incidentId);

  if (listRes.status === 200 && !foundPendingInFeed) {
    console.log(`✅ Passed: Incident #${incidentId} is correctly hidden from public Live Disaster Feed while pending verification.`);
    passedCount++;
  } else {
    console.error(`❌ Failed: Pending incident #${incidentId} appeared in Live Feed list.`);
  }

  // TEST 3: Invalid status transition check (PENDING_VERIFICATION -> RESOLVED directly should fail)
  if (incidentId) {
    testCount++;
    console.log('\nTEST 3: Invalid status transition rejection (PENDING_VERIFICATION -> RESOLVED)');
    const invalidTransRes = await makeRequest('POST', '/api/incidents/update', {
      id: incidentId,
      status: 'RESOLVED'
    });

    if (invalidTransRes.status === 400 && (invalidTransRes.body.error === 'Invalid State Transition' || invalidTransRes.body.message.includes('Cannot transition'))) {
      console.log(`✅ Passed: Invalid transition blocked with HTTP 400 ('${invalidTransRes.body.message}')`);
      passedCount++;
    } else {
      console.error(`❌ Failed: Expected HTTP 400 for invalid transition, got HTTP ${invalidTransRes.status}`, invalidTransRes.body);
    }
  }

  // TEST 4: Admin approval (PENDING_VERIFICATION -> VERIFIED_ACTIVE)
  if (incidentId) {
    testCount++;
    console.log('\nTEST 4: Admin Verify & Publish (PENDING_VERIFICATION -> VERIFIED_ACTIVE)');
    const approveRes = await makeRequest('POST', '/api/incidents/update', {
      id: incidentId,
      status: 'VERIFIED_ACTIVE'
    });

    if (approveRes.status === 200 && approveRes.body.data && approveRes.body.data.status === 'VERIFIED_ACTIVE') {
      console.log(`✅ Passed: Incident #${incidentId} status updated to VERIFIED_ACTIVE.`);
      passedCount++;
    } else {
      console.error(`❌ Failed: Expected VERIFIED_ACTIVE, got HTTP ${approveRes.status}`, approveRes.body);
    }
  }

  // TEST 5: Verify incident now appears in Live Feed
  if (incidentId) {
    testCount++;
    console.log('\nTEST 5: Post-approval Live Feed visibility check');
    const updatedListRes = await makeRequest('GET', '/api/incidents/list');
    const updatedLiveList = updatedListRes.body.data || [];
    const foundVerifiedInFeed = updatedLiveList.some(i => i.id === incidentId);

    if (updatedListRes.status === 200 && foundVerifiedInFeed) {
      console.log(`✅ Passed: Verified incident #${incidentId} is now visible in public Live Disaster Feed.`);
      passedCount++;
    } else {
      console.error(`❌ Failed: Verified incident #${incidentId} is missing from Live Feed list.`);
    }
  }

  // TEST 6: Role-based Task Assignment restriction (USER role blocked with 403)
  if (incidentId) {
    testCount++;
    console.log('\nTEST 6: Task Assignment Role Restriction (USER role must be blocked with 403)');
    const userAssignRes = await makeRequest('POST', '/api/volunteers/assignments', {
      disasterId: incidentId,
      volunteerId: 1,
      taskTitle: 'Unauthorized Citizen Assignment',
      taskDescription: 'Attempting to assign task as regular citizen',
      userRole: 'USER'
    });

    if (userAssignRes.status === 403 && userAssignRes.body.message === 'Not allowed to assign tasks') {
      console.log(`✅ Passed: USER role blocked from assigning tasks with HTTP 403.`);
      passedCount++;
    } else {
      console.error(`❌ Failed: Expected HTTP 403 for USER role task assignment, got HTTP ${userAssignRes.status}`, userAssignRes.body);
    }
  }

  // TEST 7: Role-based Task Assignment allowed for ADMIN role (201)
  if (incidentId) {
    testCount++;
    console.log('\nTEST 7: Task Assignment allowed for ADMIN role');
    const adminAssignRes = await makeRequest('POST', '/api/volunteers/assignments', {
      disasterId: incidentId,
      volunteerId: 1,
      taskTitle: 'Water Supply Rescue Mission',
      taskDescription: 'Distribute emergency relief packs',
      userRole: 'ADMIN'
    });

    if (adminAssignRes.status === 201 && adminAssignRes.body.success) {
      console.log(`✅ Passed: Task successfully assigned by ADMIN user.`);
      passedCount++;
    } else {
      console.error(`❌ Failed: Expected HTTP 201 for ADMIN assignment, got HTTP ${adminAssignRes.status}`, adminAssignRes.body);
    }
  }

  // TEST 8: Valid status transition sequence (VERIFIED_ACTIVE -> IN_PROGRESS -> RESOLVED -> CLOSED)
  if (incidentId) {
    testCount++;
    console.log('\nTEST 8: Valid status transitions sequence');
    const step1 = await makeRequest('POST', '/api/incidents/update', { id: incidentId, status: 'IN_PROGRESS' });
    const step2 = await makeRequest('POST', '/api/incidents/update', { id: incidentId, status: 'RESOLVED' });
    const step3 = await makeRequest('POST', '/api/incidents/update', { id: incidentId, status: 'CLOSED' });

    if (step1.status === 200 && step2.status === 200 && step3.status === 200) {
      console.log(`✅ Passed: Sequential status transitions (VERIFIED_ACTIVE -> IN_PROGRESS -> RESOLVED -> CLOSED) succeeded.`);
      passedCount++;
    } else {
      console.error(`❌ Failed: State transition sequence failed. Steps: step1=${step1.status}, step2=${step2.status}, step3=${step3.status}`);
    }
  }

  // TEST 9: Admin Rejection Flow (Status becomes CANCELLED_BY_ADMIN, NOT CLOSED)
  testCount++;
  console.log('\nTEST 9: Admin Rejection sets status to CANCELLED_BY_ADMIN');
  const incident2Res = await makeRequest('POST', '/api/incidents/create', {
    type: 'FIRE',
    title: 'Test False Alarm Fire',
    description: 'Report to be rejected by admin.',
    latitude: 35.0 + Math.random() * 5.0,
    longitude: 95.0 + Math.random() * 5.0,
    locationName: 'Test Location Fire'
  });

  const incident2Id = incident2Res.body.data ? incident2Res.body.data.id : null;
  if (incident2Id) {
    const rejectRes = await makeRequest('POST', '/api/incidents/update', {
      id: incident2Id,
      status: 'CANCELLED_BY_ADMIN'
    });

    if (rejectRes.status === 200 && rejectRes.body.data && rejectRes.body.data.status === 'CANCELLED_BY_ADMIN') {
      console.log(`✅ Passed: Rejected incident #${incident2Id} updated status to CANCELLED_BY_ADMIN.`);
      passedCount++;
    } else {
      console.error(`❌ Failed: Expected CANCELLED_BY_ADMIN, got HTTP ${rejectRes.status}`, rejectRes.body);
    }
  }

  console.log(`\n==================================================`);
  console.log(`SUMMARY: ${passedCount}/${testCount} test cases passed.`);
  console.log(`==================================================`);

  if (passedCount === testCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
