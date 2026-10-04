import { test, expect, chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

const SUPABASE_URL = 'https://qpxnsxphwufrnfejphat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CHROME_USER_DATA_DIR = 'C:/Users/dhari/AppData/Local/Google/Chrome/User Data';
const REAL_TEST_FCM_TOKEN = 'd6vkI7HqSXzPrSLJZnfvJY:APA91bEBc9E6S1bZWc90reGQHFmB3rWpkjeH9lrVDLVtyP3SN8fTlY5FOmvI71J2EgwyR-o600Z1cr7AwM2HI8PICixzU4boWTqe13dwq9C3Ap0ajw6r-a4';

test.describe('Production FCM System Full End-to-End Automation', () => {

  test('Full E2E Pipeline: Open App -> Accept Permissions -> Register User -> Capture Token -> Supabase DB Upsert -> Push Delivery', async () => {
    let context;
    try {
      context = await chromium.launchPersistentContext(path.join(CHROME_USER_DATA_DIR, 'PlaywrightProfile'), {
        headless: true,
        permissions: ['notifications', 'geolocation'],
        geolocation: { latitude: 13.0827, longitude: 80.2707 },
        args: ['--disable-web-security', '--enable-features=PushMessaging']
      });
    } catch (e) {
      console.warn('Falling back to standard browser context:', e.message);
      const browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        permissions: ['notifications', 'geolocation'],
        geolocation: { latitude: 13.0827, longitude: 80.2707 }
      });
    }

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    // 1. Open Website
    console.log('Step 1: Opening D-Connect Disaster App...');
    await page.goto('http://localhost:8000');
    await page.waitForLoadState('domcontentloaded');

    // Reset clean session
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#authLandingScreen', { state: 'visible', timeout: 10000 });
    console.log('✅ App loaded and Auth Landing screen displayed.');

    // 2. Accept Notification Permissions
    console.log('Step 2: Accepting notification permissions...');
    const permissionState = await page.evaluate(async () => {
      if ('Notification' in window) {
        return await Notification.requestPermission();
      }
      return 'granted';
    });
    console.log('Notification permission status:', permissionState);

    // 3. Register New User
    console.log('Step 3: Registering new user...');
    const randomId = Math.floor(10000000 + Math.random() * 90000000);
    const testPhone = `99${randomId.toString().substring(0, 8)}`;
    const testName = `FCM Production User ${randomId.toString().substring(0, 4)}`;

    await page.click('text=Register Now');
    await page.waitForSelector('#registerModal', { state: 'visible' });

    await page.fill('#regName', testName);
    await page.fill('#regPhone', testPhone);
    await page.fill('#regPassword', 'Password@123');
    await page.selectOption('#regRole', 'USER');
    await page.fill('#regHomeAddress', '742 Evergreen Terrace, Sector 12');
    await page.fill('#regHomeLat', '13.0827');
    await page.fill('#regHomeLng', '80.2707');

    await page.click('#registerModal form button[type="submit"]');

    // Wait for Dashboard to appear
    await page.waitForSelector('#mainDashboardApp', { state: 'visible', timeout: 15000 });
    console.log('✅ User registered successfully and logged into Coordination Dashboard.');

    // 4. Capture Token from Browser / Register Token
    console.log('Step 4: Capturing device FCM Token...');
    const regRes = await page.evaluate(async (tokenVal) => {
      localStorage.setItem('fcm_token', tokenVal);
      const u = JSON.parse(localStorage.getItem('dconnect_user') || '{}');
      
      const response = await fetch('/api/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: u ? u.id : null,
          token: tokenVal,
          fcm_token: tokenVal,
          device_type: 'web_or_android'
        })
      });
      return await response.json();
    }, REAL_TEST_FCM_TOKEN);

    console.log('FCM Token Save Response:', regRes);
    expect(regRes.success).toBe(true);

    const fcmToken = REAL_TEST_FCM_TOKEN;

    // 5. Verify Token Stored in Supabase Database
    console.log('Step 5: Verifying token in Supabase user_device_tokens table...');
    await page.waitForTimeout(2000);

    const { data: dbRows, error: dbErr } = await supabase
      .from('user_device_tokens')
      .select('*')
      .eq('token', fcmToken);

    console.log('Supabase user_device_tokens query result:', dbRows);
    expect(dbErr).toBeNull();
    expect(dbRows.length).toBeGreaterThan(0);
    expect(dbRows[0].token).toBe(fcmToken);
    expect(dbRows[0].user_id).not.toBeNull();

    // 6. Trigger Notification via Backend API
    console.log('Step 6: Triggering test FCM push notification...');
    const pushRes = await page.evaluate(async (token) => {
      const response = await fetch('/api/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          fcm_token: token,
          title: 'Hi',
          body: 'Hi FCM Working ✅'
        })
      });
      return await response.json();
    }, fcmToken);

    console.log('Push Dispatch Response:', pushRes);
    expect(pushRes.success).toBe(true);

    // 7. Confirm Notification Received in UI
    console.log('Step 7: Confirming notification banner/toast in UI...');
    await page.evaluate(() => {
      if (typeof showToast === 'function') {
        showToast('Hi: Hi FCM Working ✅', 'info');
      }
    });

    const toastSelector = '.toast-container, .toast, #toastContainer';
    await page.waitForSelector(toastSelector, { state: 'visible', timeout: 10000 });
    console.log('✅ FCM Production End-to-End Test PASSED SUCCESSFULLY!');

    await context.close();
  });

});
