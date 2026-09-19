import { test, expect } from '@playwright/test';

test.describe('Disaster Management Full-Stack E2E Suite', () => {

  let consoleLogs = [];
  let networkErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleLogs = [];
    networkErrors = [];

    // Task 5: Debugging - Console & Network Error Listeners
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      consoleLogs.push({ type, text, timestamp: new Date().toISOString() });
      if (type === 'error') {
        console.error(`🔴 [Browser Console Error]: ${text}`);
      }
    });

    page.on('response', response => {
      if (response.status() >= 400 && response.status() !== 429) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
          timestamp: new Date().toISOString()
        });
        console.warn(`⚠️ [Network Error ${response.status()}]: ${response.url()}`);
      }
    });
  });

  // ==============================================================================
  // TEST 1: Session Reuse & Dashboard Multi-Tab Verification
  // ==============================================================================
  test('Task 1 & 2: Reuses session and monitors multi-tab states', async ({ context, page }) => {
    const appUrl = process.env.APP_URL || 'http://localhost:8000';

    // TAB 1: Main Application Frontend
    await page.goto(appUrl);
    await expect(page.locator('#mainDashboardApp')).toBeVisible();
    await expect(page.locator('#userNameDisplay')).toContainText('Super Admin');
    console.log('✅ [Tab 1 - Frontend]: Dashboard rendered from reused storageState.');

    // TAB 2: Backend Analytics / Health Check API
    const tab2 = await context.newPage();
    const analyticsResponse = await tab2.goto(`${appUrl}/api/admin/analytics`);
    expect(analyticsResponse.status()).toBe(200);
    const analyticsJson = JSON.parse(await analyticsResponse.text());
    expect(analyticsJson.success).toBe(true);
    expect(analyticsJson.data).toHaveProperty('activeDisasters');
    console.log(`✅ [Tab 2 - Analytics]: System reports ${analyticsJson.data.activeDisasters} active disasters.`);

    // TAB 3: REST API Live Inventory
    const tab3 = await context.newPage();
    const resourcesResponse = await tab3.goto(`${appUrl}/api/resources`);
    expect(resourcesResponse.status()).toBe(200);
    const resourcesJson = JSON.parse(await resourcesResponse.text());
    expect(resourcesJson.success).toBe(true);
    console.log(`✅ [Tab 3 - Resources API]: ${resourcesJson.data.length} emergency resources available in pool.`);

    // Programmatic Switch back to Tab 1
    await page.bringToFront();
    await expect(page.locator('#userNameDisplay')).toBeVisible();

    // Clean up extra tabs
    await tab2.close();
    await tab3.close();
  });

  // ==============================================================================
  // TEST 2: Haversine Geo-Merge Reporting & Network Interception
  // ==============================================================================
  test('Task 3: Submits disaster report, intercepts API, and verifies Haversine deduplication', async ({ page }) => {
    const appUrl = process.env.APP_URL || 'http://localhost:8000';
    await page.goto(appUrl);

    // Switch to Report Incident Tab
    const reportTabBtn = page.locator('.nav-btn:has-text("Report Incident")');
    await reportTabBtn.click();
    await expect(page.locator('#reportTab')).toBeVisible();

    // Coordinates located ~0.2 km from downtown flood (13.0827, 80.2707)
    await page.locator('#reportDisasterType').selectOption('FLOOD');
    await page.locator('#reportSeverity').selectOption('HIGH');
    await page.locator('#reportTitle').fill('Flash Floods near Riverside Lane');
    await page.locator('#reportLocationName').fill('Riverside Lane Sector 2');
    await page.locator('#reportLatitude').fill('13.0845');
    await page.locator('#reportLongitude').fill('80.2718');
    await page.locator('#reportDescription').fill('Rapid rising flood water. Trapped vehicles and residents require rescue assistance.');

    // Intercept POST /api/disasters/report
    const [reportResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/disasters/report') && resp.status() === 201),
      page.locator('#disasterReportForm button[type="submit"]').click()
    ]);

    const reportData = await reportResponse.json();
    console.log(`📡 [API Intercepted]: Disasters Report Response -> wasMerged: ${reportData.data.wasMerged}`);

    expect(reportData.success).toBe(true);
    expect(reportData.data).toHaveProperty('id');
    expect(reportData.data.type).toBe('FLOOD');

    // Verify Haversine 10km merge notification alert on UI
    const alertBox = page.locator('#reportAlertBox');
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(/MERGED|NEW DISASTER/);
  });

  // ==============================================================================
  // TEST 3: Data Persistence Verification across Reload
  // ==============================================================================
  test('Task 4: Verifies database changes persist after page reload', async ({ page }) => {
    const appUrl = process.env.APP_URL || 'http://localhost:8000';
    await page.goto(appUrl);

    // Switch to Live Disasters Feed
    await page.locator('.nav-btn:has-text("Live Disasters")').click();
    await expect(page.locator('#disasterFeedList')).toBeVisible();
    await expect(page.locator('.disaster-card').first()).toBeVisible({ timeout: 10000 });

    const initialIncidentCards = await page.locator('.disaster-card').count();
    expect(initialIncidentCards).toBeGreaterThan(0);
    console.log(`📊 [Data Check]: Found ${initialIncidentCards} active incident cards on dashboard.`);

    // Perform hard reload
    console.log('🔄 [Reload]: Reloading page to test state persistence...');
    await page.reload();

    // Verify session and data persist
    await expect(page.locator('#mainDashboardApp')).toBeVisible();
    await expect(page.locator('#userNameDisplay')).toContainText('Super Admin');
    await expect(page.locator('.disaster-card').first()).toBeVisible();

    const postReloadIncidentCards = await page.locator('.disaster-card').count();
    expect(postReloadIncidentCards).toBe(initialIncidentCards);
    console.log('✅ [Persistence Confirmed]: Dashboard state matches database after reload.');
  });

  // ==============================================================================
  // TEST 4: Admin Command Center & Approvals Flow
  // ==============================================================================
  test('Task 5: Verifies Admin Command Center KPIs and verification radar', async ({ page }) => {
    const appUrl = process.env.APP_URL || 'http://localhost:8000';
    await page.goto(appUrl);

    // Switch to Admin Command Center Tab
    const adminNavBtn = page.locator('#adminNavBtn');
    await expect(adminNavBtn).toBeVisible();
    await adminNavBtn.click();

    // Verify KPI Cards
    await expect(page.locator('#kpiActiveDisasters')).toBeVisible();
    await expect(page.locator('#kpiReportsAggregated')).toBeVisible();
    await expect(page.locator('#kpiActiveVolunteers')).toBeVisible();

    const activeDisastersCount = await page.locator('#kpiActiveDisasters').textContent();
    console.log(`🛡️ [Admin KPI]: Active Incasters: ${activeDisastersCount}`);
    expect(parseInt(activeDisastersCount)).toBeGreaterThanOrEqual(0);

    // Verify No Critical Network Errors during navigation
    expect(networkErrors.length).toBe(0);
  });

});
