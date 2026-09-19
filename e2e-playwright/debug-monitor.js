/**
 * Playwright Multi-Tab Live Debugging & Monitoring System
 * 
 * Features:
 * 1. Session setup and storageState reuse (`auth.json`)
 * 2. Multi-tab monitoring (Frontend, Analytics, Disasters Feed, Resource Pool)
 * 3. Real-time console error interception and network latency logging
 * 4. Automated UI sanity check and diagnostics reporting
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authPath = path.join(__dirname, 'auth.json');
const appUrl = process.env.APP_URL || 'http://localhost:8000';

async function runDebugMonitor() {
  console.log('\n===============================================================');
  console.log('  🛡️  D-CONNECT DISASTER MANAGEMENT: PLAYWRIGHT DEBUG MONITOR  ');
  console.log('===============================================================\n');

  const browser = await chromium.launch({
    headless: true, // Set to false for interactive browser visual mode
    slowMo: 50
  });

  let context;
  if (fs.existsSync(authPath)) {
    console.log(`🔑 [Auth]: Reusing saved storageState session from ${authPath}`);
    context = await browser.newContext({ storageState: authPath });
  } else {
    console.log('⚠️ [Auth]: No storageState found. Running initial login to generate session...');
    context = await browser.newContext();
    const loginPage = await context.newPage();
    await loginPage.goto(appUrl);
    
    // Select Admin Tab
    await loginPage.click('#loginRoleTabs button:has-text("Admin")');
    await loginPage.fill('#landingLoginPhone', '9999999999');
    await loginPage.fill('#landingLoginPassword', 'Admin@123');
    
    const [response] = await Promise.all([
      loginPage.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200),
      loginPage.click('#landingLoginBtn')
    ]);
    
    const resData = await response.json();
    console.log(`✅ [Auth]: Authenticated as ${resData.data.name} (${resData.data.role})`);
    
    await context.storageState({ path: authPath });
    console.log(`💾 [Auth]: Saved storageState to ${authPath}`);
    await loginPage.close();
  }

  // --- Attach Diagnostic Listeners Helper ---
  function attachListeners(page, tabLabel) {
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.error(`🔴 [${tabLabel} Console ERROR]: ${text}`);
      } else if (type === 'warn') {
        console.warn(`🟡 [${tabLabel} Console WARN]: ${text}`);
      }
    });

    page.on('requestfailed', req => {
      console.error(`❌ [${tabLabel} Network FAILED]: ${req.method()} ${req.url()} (${req.failure()?.errorText})`);
    });

    page.on('response', resp => {
      if (resp.status() >= 400) {
        console.warn(`⚠️ [${tabLabel} HTTP ${resp.status()}]: ${resp.url()}`);
      }
    });
  }

  // =========================================================================
  // TASK 2: MULTI-TAB MONITORING
  // =========================================================================
  console.log('\n🌐 [Multi-Tab]: Initializing 4-tab monitoring suite...\n');

  // TAB 1: Main Application Frontend
  const tab1 = await context.newPage();
  attachListeners(tab1, 'Tab 1 - Frontend App');
  console.log(`🚀 [Tab 1]: Navigating to Frontend Dashboard -> ${appUrl}`);
  await tab1.goto(appUrl, { waitUntil: 'networkidle' });
  const userGreeting = await tab1.locator('#userNameDisplay').textContent().catch(() => 'N/A');
  console.log(`   └─ Dashboard Status: Active | Logged-in User: ${userGreeting.trim()}`);

  // TAB 2: Backend Analytics & KPI API
  const tab2 = await context.newPage();
  attachListeners(tab2, 'Tab 2 - Analytics API');
  console.log(`📊 [Tab 2]: Polling Analytics API -> ${appUrl}/api/admin/analytics`);
  const analyticsRes = await tab2.goto(`${appUrl}/api/admin/analytics`);
  const analyticsData = JSON.parse(await analyticsRes.text());
  console.log(`   └─ Status: ${analyticsRes.status()} | Active Incidents: ${analyticsData.data?.activeDisasters} | Resources: ${analyticsData.data?.totalResources}`);

  // TAB 3: Supabase / Disasters Data Feed
  const tab3 = await context.newPage();
  attachListeners(tab3, 'Tab 3 - Disasters API');
  console.log(`📍 [Tab 3]: Inspecting Disasters Feed -> ${appUrl}/api/disasters`);
  const disastersRes = await tab3.goto(`${appUrl}/api/disasters`);
  const disastersData = JSON.parse(await disastersRes.text());
  console.log(`   └─ Status: ${disastersRes.status()} | Total Incidents In System: ${disastersData.data?.length || 0}`);

  // TAB 4: Live Emergency Resource Inventory
  const tab4 = await context.newPage();
  attachListeners(tab4, 'Tab 4 - Resources API');
  console.log(`📦 [Tab 4]: Checking Resource Pool -> ${appUrl}/api/resources`);
  const resourcesRes = await tab4.goto(`${appUrl}/api/resources`);
  const resourcesData = JSON.parse(await resourcesRes.text());
  console.log(`   └─ Status: ${resourcesRes.status()} | Stock Item Types: ${resourcesData.data?.length || 0}`);

  // Programmatic Switching Test
  console.log('\n🔄 [Tab Switch]: Programmatically switching active focus between tabs...');
  await tab1.bringToFront();
  console.log('   └─ Active: Tab 1 (Frontend)');
  await tab2.bringToFront();
  console.log('   └─ Active: Tab 2 (Analytics)');
  await tab1.bringToFront();
  console.log('   └─ Active: Tab 1 (Frontend)');

  console.log('\n===============================================================');
  console.log('  ✅ PLAYWRIGHT DIAGNOSTICS & MULTI-TAB MONITORING COMPLETED   ');
  console.log('===============================================================\n');

  await browser.close();
}

runDebugMonitor().catch(err => {
  console.error('💥 Fatal error in Playwright Debug Monitor:', err);
  process.exit(1);
});
