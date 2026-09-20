const { supabaseDb, seedSampleDataDevOnly } = require('../supabaseClient');
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

async function testNoAutoDisasterCreation() {
  console.log('🧪 Starting Duplicate & Auto-Creation Prevention Verification Test...\n');

  // TEST 1: Check initial disaster count
  const initialDisasters = await supabaseDb.getAllDisasters('ALL');
  const initialCount = initialDisasters.length;
  console.log(`Initial total disasters in database: ${initialCount}`);

  // TEST 2: Trigger dev seeding helper in non-dev environment (Should be skipped completely)
  console.log('\n--- Test 2: Triggering dev-only seeding in default environment ---');
  await seedSampleDataDevOnly();
  const countAfterSeedAttempt = (await supabaseDb.getAllDisasters('ALL')).length;
  if (countAfterSeedAttempt !== initialCount) {
    throw new Error('FAILED! Dev seeding executed in non-development environment and inserted fake disasters.');
  }
  console.log('✅ Test 2 Passed: Dev seeding correctly skipped in production environment.');

  // TEST 3: Create resource without disaster_id (Should NOT create a fake disaster record)
  console.log('\n--- Test 3: Creating emergency resource without disaster_id ---');
  const newRes = await supabaseDb.createResource({
    resourceType: 'WATER',
    description: 'Auto-creation test mineral water bottles',
    quantity: 100,
    unit: 'bottles',
    status: 'AVAILABLE'
  });
  const countAfterResourceCreation = (await supabaseDb.getAllDisasters('ALL')).length;
  console.log(`Resource Created ID: #${newRes ? newRes.id : 'N/A'}`);
  console.log(`Total disasters after resource creation: ${countAfterResourceCreation}`);

  if (countAfterResourceCreation > initialCount) {
    throw new Error('FAILED! Creating a resource automatically inserted a fake disaster into the database!');
  }
  console.log('✅ Test 3 Passed: Resource creation did NOT create any fake disaster record.');

  // TEST 4: Duplicate incident creation within 10km (Should merge and NOT create duplicate disaster row)
  console.log('\n--- Test 4: Submitting duplicate incident report within 10km radius ---');
  // Use coordinates near downtown flood (13.0827, 80.2707)
  const dupReq = {
    method: 'POST',
    body: {
      type: 'FLOOD',
      title: 'Duplicate Test Flash Flood',
      description: 'Secondary report for existing flood location',
      latitude: 13.0830,
      longitude: 80.2710
    }
  };
  const dupRes = createMockRes();
  await createIncidentApi(dupReq, dupRes);
  const dupResp = dupRes.getResponse();
  console.log('Duplicate Incident API Status:', dupResp.statusCode);
  console.log('Duplicate Incident API Body:', dupResp.body);

  const countAfterDupAttempt = (await supabaseDb.getAllDisasters('ALL')).length;
  console.log(`Total disasters count after duplicate submit: ${countAfterDupAttempt}`);

  if (countAfterDupAttempt > countAfterResourceCreation) {
    throw new Error('FAILED! A duplicate disaster record was created within 10km of an existing active incident!');
  }
  if (!dupResp.body.data || !dupResp.body.data.wasMerged) {
    throw new Error('FAILED! Duplicate report was not marked as merged.');
  }
  console.log('✅ Test 4 Passed: Duplicate report within 10km was merged into existing incident without creating a fake duplicate row.');

  console.log('\n🎉 ALL DUPLICATE & AUTO-CREATION PREVENTION TESTS PASSED SUCCESSFULLY!');
}

testNoAutoDisasterCreation().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
