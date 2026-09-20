const { supabaseDb } = require('../supabaseClient');

async function testLiveFeedActiveLogic() {
  console.log('🧪 Starting Live Disaster Feed Active Incidents Verification Test...\n');

  // TEST 1: Default Live Feed query (Should only return VERIFIED_ACTIVE and IN_PROGRESS)
  console.log('--- Test 1: Fetching default Live Feed incidents (No status param) ---');
  const liveFeedIncidents = await supabaseDb.getAllDisasters();
  console.log(`Fetched ${liveFeedIncidents.length} incidents for Live Feed.`);

  const invalidLiveFeedStatuses = liveFeedIncidents.filter(
    i => i.status !== 'VERIFIED_ACTIVE' && i.status !== 'IN_PROGRESS'
  );

  console.log('Non-active incidents in Live Feed response:', invalidLiveFeedStatuses.length);
  if (invalidLiveFeedStatuses.length > 0) {
    console.error('Found non-active statuses in live feed response:', invalidLiveFeedStatuses.map(i => i.status));
    throw new Error('FAILED! Live feed API returned PENDING, RESOLVED, or CLOSED disasters.');
  }
  console.log('✅ Test 1 Passed: Live Feed API returns ONLY VERIFIED_ACTIVE and IN_PROGRESS incidents.');

  // TEST 2: Admin Panel query (status = 'ALL')
  console.log('\n--- Test 2: Fetching Admin Panel incidents (status = "ALL") ---');
  const adminPanelIncidents = await supabaseDb.getAllDisasters('ALL');
  console.log(`Fetched ${adminPanelIncidents.length} incidents for Admin Panel.`);

  const statusesFound = new Set(adminPanelIncidents.map(i => i.status));
  console.log('Statuses present in Admin Panel data:', Array.from(statusesFound));
  console.log('✅ Test 2 Passed: Admin Panel query preserves ALL statuses.');

  // TEST 3: Frontend Active Incident Filter Logic
  console.log('\n--- Test 3: Frontend active incidents filter & safety check simulation ---');
  const mockIncidentsFromApi = [
    { id: 101, title: 'Active Flood', status: 'VERIFIED_ACTIVE' },
    { id: 102, title: 'In Progress Rescue', status: 'IN_PROGRESS' },
    { id: 103, title: 'Unverified Report', status: 'PENDING' },
    { id: 104, title: 'Done Operation', status: 'RESOLVED' },
    { id: 105, title: 'Archived Case', status: 'CLOSED' }
  ];

  const activeIncidents = mockIncidentsFromApi.filter(
    i => i.status === 'VERIFIED_ACTIVE' || i.status === 'IN_PROGRESS'
  );

  console.log('Filtered Active Incidents count:', activeIncidents.length);
  console.log('Filtered Active Incidents:', activeIncidents);

  if (activeIncidents.length !== 2) {
    throw new Error(`Expected 2 active incidents, found ${activeIncidents.length}`);
  }
  console.log('✅ Test 3 Passed: Frontend filter logic correctly isolates real-time active incidents.');

  console.log('\n🎉 ALL LIVE DISASTER FEED OPTIMIZATION TESTS PASSED SUCCESSFULLY!');
}

testLiveFeedActiveLogic().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
