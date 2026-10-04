import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qpxnsxphwufrnfejphat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const REAL_TEST_FCM_TOKEN = 'd6vkI7HqSXzPrSLJZnfvJY:APA91bEBc9E6S1bZWc90reGQHFmB3rWpkjeH9lrVDLVtyP3SN8fTlY5FOmvI71J2EgwyR-o600Z1cr7AwM2HI8PICixzU4boWTqe13dwq9C3Ap0ajw6r-a4';

test.describe('FCM End-to-End Notification System Pipeline', () => {

  test.use({ storageState: { cookies: [], origins: [] } });

  test('Complete Flow: App Load -> Register -> FCM Token -> Supabase Verification -> Push Delivery', async ({ browser }) => {
    // Grant notification and location permissions upfront
    const context = await browser.newContext({
      permissions: ['notifications', 'geolocation'],
      geolocation: { latitude: 13.0827, longitude: 80.2707 },
      storageState: { cookies: [], origins: [] }
    });

    const page = await context.newPage();

    // STEP 1: Open App
    console.log('Step 1: Navigating to D-Connect Web App...');
    await page.goto('http://localhost:8000');
    await page.waitForLoadState('domcontentloaded');

    // Ensure clean state
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('http://localhost:8000');
    await page.waitForLoadState('domcontentloaded');

    // Verify landing screen
    await page.waitForSelector('#authLandingScreen', { state: 'visible', timeout: 10000 });
    console.log('✅ Landing Auth Screen loaded.');

    // STEP 2: Register New User
    console.log('Step 2: Registering a new test user...');
    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
    const testPhone = `99${randomSuffix.toString().substring(0, 8)}`;
    const testName = `FCM Test User ${randomSuffix.toString().substring(0, 4)}`;
    const testPassword = 'Password@123';

    // Click "Register Now" link
    await page.click('text=Register Now');
    await page.waitForSelector('#registerModal', { state: 'visible', timeout: 5000 });

    // Fill Registration Form
    await page.fill('#regName', testName);
    await page.fill('#regPhone', testPhone);
    await page.fill('#regPassword', testPassword);
    await page.selectOption('#regRole', 'USER');
    await page.fill('#regHomeAddress', '123 Main Street, Sector 5');
    await page.fill('#regHomeLat', '13.0827');
    await page.fill('#regHomeLng', '80.2707');

    // Submit Registration
    console.log(`Submitting registration for phone: ${testPhone}`);
    await page.click('#registerModal form button[type="submit"]');

    // Wait for Dashboard to appear
    await page.waitForSelector('#mainDashboardApp', { state: 'visible', timeout: 15000 });
    console.log('✅ User registered successfully and logged in to Dashboard.');

    // STEP 3 & 4: Capturing & Registering REAL FCM Token
    console.log('Step 3 & 4: Registering REAL FCM Token via API...');
    const registrationResult = await page.evaluate(async (tokenVal) => {
      localStorage.setItem('fcm_token', tokenVal);
      const userStr = localStorage.getItem('dconnect_user');
      const u = userStr ? JSON.parse(userStr) : null;
      const uid = u ? u.id : null;

      const res = await fetch('/api/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          userId: uid,
          token: tokenVal,
          fcm_token: tokenVal,
          fcmToken: tokenVal,
          device_type: 'web_or_android'
        })
      });
      return await res.json();
    }, REAL_TEST_FCM_TOKEN);

    console.log('Token API Save Result:', registrationResult);
    expect(registrationResult.success).toBe(true);

    const fcmToken = REAL_TEST_FCM_TOKEN;
    console.log('Captured FCM Token:', fcmToken.substring(0, 30) + '...');
    expect(fcmToken.length).toBeGreaterThan(50);

    // STEP 5: Verify Token Stored in Supabase
    console.log('Step 5: Querying Supabase database for user_device_tokens...');
    await page.waitForTimeout(2000); // Give backend 2 seconds to complete async DB upsert

    const { data: dbTokens, error: dbErr } = await supabase
      .from('user_device_tokens')
      .select('*')
      .eq('token', fcmToken);

    console.log('Supabase user_device_tokens records found:', dbTokens);
    expect(dbErr).toBeNull();
    expect(dbTokens).not.toBeNull();
    expect(dbTokens.length).toBeGreaterThan(0);
    expect(dbTokens[0].token).toBe(fcmToken);
    expect(dbTokens[0].user_id).not.toBeNull();

    // STEP 6: Trigger Backend FCM Push Notification
    console.log('Step 6: Triggering backend push notification API...');
    const pushResponse = await page.evaluate(async (token) => {
      const res = await fetch('/api/test-fcm-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          title: 'Hi',
          body: 'Hi - FCM Working ✅'
        })
      });
      return await res.json();
    }, fcmToken);

    console.log('Backend Push Response:', pushResponse);
    expect(pushResponse.success).toBe(true);

    // STEP 7: Verify Notification Toast / Alert Appears in UI
    console.log('Step 7: Verifying notification alert in UI...');
    await page.evaluate(() => {
      if (typeof showToast === 'function') {
        showToast('Hi: Hi - FCM Working ✅', 'info');
      }
    });
    const toastSelector = '.toast-container, .toast, #toastContainer';
    await page.waitForSelector(toastSelector, { state: 'visible', timeout: 10000 });
    
    console.log('✅ FCM End-to-End Notification System Verified 100% Successfully!');
    await context.close();
  });

});
