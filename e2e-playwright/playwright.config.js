import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E & Debugging Configuration
 * Features: StorageState session reuse, multi-tab execution, console/network debugging, auto-screenshots
 */
export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false, // Run serially for stateful pipeline tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/test-results.json' }]
  ],
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:8000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  },
  projects: [
    // Setup Project: Authenticates and saves auth.json storage state
    {
      name: 'setup-auth',
      testMatch: /auth\.setup\.js/
    },
    // Main Test Suite: Reuses saved auth.json session
    {
      name: 'e2e-suite',
      dependencies: ['setup-auth'],
      testMatch: /.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'auth.json'
      }
    }
  ]
});
