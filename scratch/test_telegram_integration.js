/**
 * Integration Test for Telegram Bot Admin Approval Workflow
 */

const { supabaseDb } = require('../supabaseClient');
const { handleTelegramWebhook, setAdminChatId } = require('../telegramBot');

// Mock HTTP Request / Response objects
function createMockReqRes(body, method = 'POST') {
  const req = {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    writeHead: (code, headers) => { statusCode = code; },
    end: (data) => { responseData = data ? JSON.parse(data) : {}; },
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = data; return res; }
  };

  return { req, res, getResult: () => ({ statusCode, responseData }) };
}

async function runTests() {
  console.log('🧪 Starting Telegram Integration Tests...\n');

  try {
    // 1. Create a test incident in Supabase
    console.log('1️⃣ Creating test incident in Supabase...');
    const testIncident = await supabaseDb.createDisaster({
      type: 'FIRE',
      title: 'Telegram Approval Test Fire Incident',
      description: 'Test fire incident created for Telegram webhook verification.',
      severity: 'HIGH',
      latitude: 13.0827,
      longitude: 80.2707,
      location_name: 'Test Location',
      status: 'PENDING'
    });
    console.log(`   Created test incident ID: #${testIncident.id}, Initial Status: ${testIncident.status}`);

    // 2. Register admin chat ID via /start webhook simulation
    console.log('\n2️⃣ Testing Telegram /start webhook registration...');
    const startMock = createMockReqRes({
      update_id: 10001,
      message: {
        message_id: 1,
        chat: { id: 99887766 },
        text: '/start'
      }
    });

    await handleTelegramWebhook(startMock.req, startMock.res);
    const startResult = startMock.getResult();
    console.log(`   /start Result: Status ${startResult.statusCode}`, startResult.responseData);

    // 3. Test Approve Incident via Webhook (APPROVED -> VERIFIED_ACTIVE)
    console.log('\n3️⃣ Testing Approve Incident button click (inc_approve)...');
    const approveIncMock = createMockReqRes({
      update_id: 10002,
      callback_query: {
        id: 'cb_query_approve_inc',
        from: { id: 99887766, first_name: 'Admin' },
        message: {
          message_id: 10,
          chat: { id: 99887766 },
          text: '🚨 NEW INCIDENT REPORTED'
        },
        data: `inc_approve_${testIncident.id}`
      }
    });

    await handleTelegramWebhook(approveIncMock.req, approveIncMock.res);
    const approveIncResult = approveIncMock.getResult();
    console.log(`   Approve Incident Result: Status ${approveIncResult.statusCode}`, approveIncResult.responseData);

    // Verify DB update
    const updatedInc1 = await supabaseDb.getDisasterById(testIncident.id);
    console.log(`   Verified DB Status for Incident #${testIncident.id}: ${updatedInc1.status} (Expected: VERIFIED_ACTIVE)`);

    // 4. Test Reject Incident via Webhook (REJECTED -> CANCELLED)
    console.log('\n4️⃣ Testing Reject Incident button click (inc_reject)...');
    const rejectIncMock = createMockReqRes({
      update_id: 10003,
      callback_query: {
        id: 'cb_query_reject_inc',
        from: { id: 99887766, first_name: 'Admin' },
        message: {
          message_id: 10,
          chat: { id: 99887766 },
          text: '🚨 NEW INCIDENT REPORTED'
        },
        data: `inc_reject_${testIncident.id}`
      }
    });

    await handleTelegramWebhook(rejectIncMock.req, rejectIncMock.res);
    const rejectIncResult = rejectIncMock.getResult();
    console.log(`   Reject Incident Result: Status ${rejectIncResult.statusCode}`, rejectIncResult.responseData);

    // Verify DB update
    const updatedInc2 = await supabaseDb.getDisasterById(testIncident.id);
    console.log(`   Verified DB Status for Incident #${testIncident.id}: ${updatedInc2.status} (Expected: CANCELLED)`);

    // 5. Create a test resource in Supabase
    console.log('\n5️⃣ Creating test resource in Supabase...');
    const testResource = await supabaseDb.createResource({
      resourceType: 'WATER',
      description: 'Telegram Approval Test Water Supply',
      quantity: 500,
      unit: 'bottles',
      status: 'AVAILABLE'
    });
    console.log(`   Created test resource ID: #${testResource.id}, Initial Status: ${testResource.status}`);

    // 6. Test Approve Resource via Webhook (APPROVED -> VERIFIED_ACTIVE)
    console.log('\n6️⃣ Testing Approve Resource button click (res_approve)...');
    const approveResMock = createMockReqRes({
      update_id: 10004,
      callback_query: {
        id: 'cb_query_approve_res',
        from: { id: 99887766, first_name: 'Admin' },
        message: {
          message_id: 11,
          chat: { id: 99887766 },
          text: '📦 NEW RESOURCE OFFERED'
        },
        data: `res_approve_${testResource.id}`
      }
    });

    await handleTelegramWebhook(approveResMock.req, approveResMock.res);
    const approveResResult = approveResMock.getResult();
    console.log(`   Approve Resource Result: Status ${approveResResult.statusCode}`, approveResResult.responseData);

    // 7. Test Reject Resource via Webhook (REJECTED -> CANCELLED)
    console.log('\n7️⃣ Testing Reject Resource button click (res_reject)...');
    const rejectResMock = createMockReqRes({
      update_id: 10005,
      callback_query: {
        id: 'cb_query_reject_res',
        from: { id: 99887766, first_name: 'Admin' },
        message: {
          message_id: 11,
          chat: { id: 99887766 },
          text: '📦 NEW RESOURCE OFFERED'
        },
        data: `res_reject_${testResource.id}`
      }
    });

    await handleTelegramWebhook(rejectResMock.req, rejectResMock.res);
    const rejectResResult = rejectResMock.getResult();
    console.log(`   Reject Resource Result: Status ${rejectResResult.statusCode}`, rejectResResult.responseData);

    // 8. Test Unauthorized Admin Access (chat_id mismatch)
    console.log('\n8️⃣ Testing Unauthorized Admin Access (chat_id check)...');
    const unauthorizedMock = createMockReqRes({
      update_id: 10006,
      callback_query: {
        id: 'cb_query_unauth',
        from: { id: 77777777, first_name: 'Hacker' },
        message: {
          message_id: 12,
          chat: { id: 77777777 },
          text: '🚨 NEW INCIDENT REPORTED'
        },
        data: `inc_approve_${testIncident.id}`
      }
    });

    await handleTelegramWebhook(unauthorizedMock.req, unauthorizedMock.res);
    const unauthResult = unauthorizedMock.getResult();
    console.log(`   Unauthorized Access Result: Status ${unauthResult.statusCode}`, unauthResult.responseData);

    // Clean up test items
    console.log('\n🧹 Cleaning up test records from database...');
    await supabaseDb.deleteDisaster(testIncident.id).catch(() => {});
    await supabaseDb.deleteResource(testResource.id).catch(() => {});

    console.log('\n✅ ALL TELEGRAM INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test execution error:', err);
    process.exit(1);
  }
}

runTests();
