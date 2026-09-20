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

async function runMergeTests() {
  console.log('🧪 Starting Smart Disaster Merging System Tests...\n');
  let testCount = 0;
  let passedCount = 0;

  const latBase = 30.0 + Math.random() * 5.0;
  const lonBase = 90.0 + Math.random() * 5.0;

  // TEST 1: Create a PENDING_VERIFICATION incident
  testCount++;
  console.log('TEST 1: Create a PENDING_VERIFICATION incident');
  const pendingRes = await makeRequest('POST', '/api/incidents/create', {
    type: 'EARTHQUAKE',
    title: 'Pending Quake Incident',
    description: 'Initial report pending verification.',
    latitude: latBase,
    longitude: lonBase,
    locationName: 'Quake Zone Site 1'
  });

  const pendingId = pendingRes.body.data ? pendingRes.body.data.id : null;
  if (pendingRes.status === 201 && pendingId) {
    console.log(`✅ Passed: Created pending incident #${pendingId} with status '${pendingRes.body.data.status}'.`);
    passedCount++;
  } else {
    console.error(`❌ Failed to create pending incident.`, pendingRes.body);
  }

  // TEST 2: Attempt report at same location while first incident is PENDING_VERIFICATION (Must NOT merge with PENDING_VERIFICATION)
  testCount++;
  console.log('\nTEST 2: Report at same location while first incident is PENDING_VERIFICATION (Must NOT merge)');
  const report2Res = await makeRequest('POST', '/api/incidents/create', {
    type: 'EARTHQUAKE',
    title: 'Secondary Quake Report',
    description: 'Second report near site 1.',
    latitude: latBase + 0.01,
    longitude: lonBase + 0.01,
    locationName: 'Quake Zone Site 1 Near'
  });

  const isMergedWithPending = report2Res.body.data && report2Res.body.data.wasMerged && report2Res.body.data.id === pendingId;
  if (!isMergedWithPending) {
    console.log(`✅ Passed: New report did NOT merge with PENDING_VERIFICATION incident #${pendingId} (Correctly created separate entry #${report2Res.body.data ? report2Res.body.data.id : 'N/A'}).`);
    passedCount++;
  } else {
    console.error(`❌ Failed: Report incorrectly merged with PENDING_VERIFICATION incident #${pendingId}.`);
  }

  // TEST 3: Admin verifies incident #1 (PENDING_VERIFICATION -> VERIFIED_ACTIVE)
  testCount++;
  console.log('\nTEST 3: Verify incident #1 (Status -> VERIFIED_ACTIVE)');
  const verifyRes = await makeRequest('POST', '/api/incidents/update', {
    id: pendingId,
    status: 'VERIFIED_ACTIVE'
  });

  if (verifyRes.status === 200 && verifyRes.body.data && verifyRes.body.data.status === 'VERIFIED_ACTIVE') {
    console.log(`✅ Passed: Incident #${pendingId} status is now VERIFIED_ACTIVE.`);
    passedCount++;
  } else {
    console.error(`❌ Failed to update status to VERIFIED_ACTIVE.`, verifyRes.body);
  }

  // TEST 4: Report at same location while incident #1 is VERIFIED_ACTIVE (Must MERGE with VERIFIED_ACTIVE)
  testCount++;
  console.log('\nTEST 4: Report at same location while incident #1 is VERIFIED_ACTIVE (Must MERGE)');
  const report3Res = await makeRequest('POST', '/api/incidents/create', {
    type: 'EARTHQUAKE',
    title: 'Third Quake Report',
    description: 'Third report near active quake site 1.',
    latitude: latBase + 0.02,
    longitude: lonBase + 0.02,
    locationName: 'Quake Zone Site 1 Proximity'
  });

  const isMergedWithActive = report3Res.body.data && report3Res.body.data.wasMerged && report3Res.body.data.id === pendingId;
  const msgHasFormat = report3Res.body.message && report3Res.body.message.includes(`Merged with existing incident ID: ${pendingId}`);

  if (isMergedWithActive && msgHasFormat) {
    console.log(`✅ Passed: Merged cleanly into active incident #${pendingId} (Message: '${report3Res.body.message}', reportCount: ${report3Res.body.data.reportCount}).`);
    passedCount++;
  } else {
    console.error(`❌ Failed: Expected merge into VERIFIED_ACTIVE incident #${pendingId}. Got message: '${report3Res.body.message}'`);
  }

  // TEST 5: Close incident #1 (VERIFIED_ACTIVE -> RESOLVED -> CLOSED)
  testCount++;
  console.log('\nTEST 5: Close incident #1 (Status -> CLOSED)');
  await makeRequest('POST', '/api/incidents/update', { id: pendingId, status: 'IN_PROGRESS' });
  await makeRequest('POST', '/api/incidents/update', { id: pendingId, status: 'RESOLVED' });
  const closeRes = await makeRequest('POST', '/api/incidents/update', { id: pendingId, status: 'CLOSED' });

  if (closeRes.status === 200) {
    console.log(`✅ Passed: Incident #${pendingId} status updated to CLOSED.`);
    passedCount++;
  } else {
    console.error(`❌ Failed to close incident #${pendingId}.`, closeRes.body);
  }

  // TEST 6: Report at same location after incident #1 is CLOSED (Must NOT merge with CLOSED)
  testCount++;
  console.log('\nTEST 6: Report at same location after incident #1 is CLOSED (Must NOT merge)');
  const report4Res = await makeRequest('POST', '/api/incidents/create', {
    type: 'EARTHQUAKE',
    title: 'Post-Close Quake Report',
    description: 'Report submitted after incident 1 closed.',
    latitude: latBase + 0.015,
    longitude: lonBase + 0.015,
    locationName: 'Quake Zone Site 1 After Close'
  });

  const isMergedWithClosed = report4Res.body.data && report4Res.body.data.wasMerged && report4Res.body.data.id === pendingId;
  if (!isMergedWithClosed) {
    console.log(`✅ Passed: New report did NOT merge with CLOSED incident #${pendingId} (Created separate entry #${report4Res.body.data ? report4Res.body.data.id : 'N/A'}).`);
    passedCount++;
  } else {
    console.error(`❌ Failed: Report incorrectly merged with CLOSED incident #${pendingId}.`);
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

runMergeTests().catch(err => {
  console.error('Fatal error running merge tests:', err);
  process.exit(1);
});
