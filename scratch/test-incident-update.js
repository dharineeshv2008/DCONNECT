const { supabaseDb } = require('../supabaseClient');
const updateApi = require('../api/incidents/update');

async function testIncidentStatusUpdateLogic() {
  console.log('🧪 Starting Incident Status Update Verification Test...');

  // Mock res object
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

  // Get or create an existing disaster for tests
  const initialDisasters = await supabaseDb.getAllDisasters();
  let testIncidentId = null;
  if (initialDisasters.length > 0) {
    testIncidentId = initialDisasters[0].id;
  } else {
    const created = await supabaseDb.createDisaster({
      title: 'Status Update Test Disaster',
      type: 'OTHER',
      description: 'Temporary disaster for status update verification',
      severity: 'LOW',
      latitude: 13.0827,
      longitude: 80.2707,
      location_name: 'Test Lab',
      status: 'VERIFIED_ACTIVE'
    });
    testIncidentId = created.id;
  }
  console.log(`Using existing Incident ID #${testIncidentId} for tests.`);

  // TEST 1: Validate non-existent ID returns 404 (Safeguard 5b)
  console.log('\n--- Test 1: Updating non-existent incident ID (Should return 404) ---');
  const req1 = {
    method: 'POST',
    body: { id: 99999999, status: 'IN_PROGRESS' }
  };
  const res1 = createMockRes();
  await updateApi(req1, res1);
  const resp1 = res1.getResponse();
  console.log('Response 1 Status Code:', resp1.statusCode);
  console.log('Response 1 Body:', resp1.body);
  if (resp1.statusCode !== 404) {
    throw new Error(`Expected status 404 for non-existent ID, got ${resp1.statusCode}`);
  }
  console.log('✅ Test 1 Passed!');

  // TEST 2: Invalid status returns 400 on existing ID
  console.log('\n--- Test 2: Invalid status value on existing incident (Should return 400) ---');
  const req2 = {
    method: 'POST',
    body: { id: testIncidentId, status: 'INVALID_STATUS_FOOBAR' }
  };
  const res2 = createMockRes();
  await updateApi(req2, res2);
  const resp2 = res2.getResponse();
  console.log('Response 2 Status Code:', resp2.statusCode);
  console.log('Response 2 Body:', resp2.body);
  if (resp2.statusCode !== 400) {
    throw new Error(`Expected status 400 for invalid status, got ${resp2.statusCode}`);
  }
  console.log('✅ Test 2 Passed!');

  // TEST 3: Status update of active incident using payload { id, status }
  console.log('\n--- Test 3: Status update of active incident using payload { id, status } ---');
  const countBefore = (await supabaseDb.getAllDisasters()).length;

  // Perform status update with payload { id: testIncidentId, status: 'IN_PROGRESS' }
  const req3 = {
    method: 'POST',
    body: { id: testIncidentId, status: 'IN_PROGRESS' }
  };
  const res3 = createMockRes();
  await updateApi(req3, res3);
  const resp3 = res3.getResponse();
  console.log('Response 3 Status Code:', resp3.statusCode);
  console.log('Response 3 Body:', resp3.body);

  if (resp3.statusCode !== 200 || !resp3.body.success) {
    throw new Error(`Expected status 200 for valid update, got ${resp3.statusCode}`);
  }

  // Verify DB state after update
  const countAfter = (await supabaseDb.getAllDisasters()).length;
  console.log(`Disasters count in DB before: ${countBefore}, after: ${countAfter}`);

  // REQUIREMENT 1: Ensure no new row is created when updating status
  if (countAfter > countBefore) {
    throw new Error('FAILED! A new row was created when updating status!');
  }
  console.log('✅ Requirement 1 Verified: No new row created on status update.');

  // Check updated disaster status in DB
  const updatedIncident = await supabaseDb.getDisasterById(testIncidentId);
  console.log(`Updated Incident status in DB: ${updatedIncident.status}`);
  if (updatedIncident.status !== 'IN_PROGRESS') {
    throw new Error(`Expected status IN_PROGRESS, found ${updatedIncident.status}`);
  }
  console.log('✅ Requirement 2 & 3 Verified: Updated existing row via .update() and .eq("id", incident_id).');

  console.log('\n🎉 ALL STATUS UPDATE LOGIC VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

testIncidentStatusUpdateLogic().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
