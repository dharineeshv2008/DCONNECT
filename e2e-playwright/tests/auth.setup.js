import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '..', 'auth.json');


/**
 * Task 1: Session Setup & StorageState Generation
 * Performs authentication once, verifies response, and saves storageState for test reuse.
 */
setup('authenticate and save storageState', async ({ page, context }) => {
  console.log('🚀 [Setup] Initializing authentication session setup...');

  const appUrl = process.env.APP_URL || 'http://localhost:8000';
  await page.goto(appUrl);
  await expect(page).toHaveTitle(/D-Connect|Disaster Management/);

  // 1. Select Admin Role Tab
  const adminTab = page.locator('#loginRoleTabs button:has-text("Admin")');
  await adminTab.click();

  // 2. Fill Manual Phone & Password (Strict manual entry)
  const phoneInput = page.locator('#landingLoginPhone');
  const passInput = page.locator('#landingLoginPassword');
  const loginBtn = page.locator('#landingLoginBtn');

  await phoneInput.fill('9999999999');
  await passInput.fill('Admin@123');

  // Verify submit button is enabled after valid 10 digits
  await expect(loginBtn).toBeEnabled();

  // 3. Intercept and verify Auth API Response
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/auth/login') && resp.status() === 200),
    loginBtn.click()
  ]);

  const authData = await response.json();
  console.log(`✅ [Setup] Auth API Succeeded. User: ${authData.data.name}, Role: ${authData.data.role}`);
  expect(authData.success).toBeTruthy();
  expect(authData.data.role).toBe('ADMIN');

  // 4. Verify Dashboard has rendered
  await expect(page.locator('#mainDashboardApp')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#userNameDisplay')).toContainText('Super Admin');

  // 5. Save StorageState to auth.json for subsequent tests
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await context.storageState({ path: authFile });
  console.log(`💾 [Setup] Session successfully saved to: ${authFile}`);
});
