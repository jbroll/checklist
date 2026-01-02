import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing
 * @see https://playwright.dev/docs/test-configuration
 *
 * Supports two modes:
 * 1. Normal mode: Starts local dev server, uses mock OAuth
 * 2. Smoke test mode (SMOKE_TEST=true): No server, no OAuth, uses BASE_URL
 */

const isSmokeTest = process.env.SMOKE_TEST === 'true';
const baseURL = isSmokeTest
  ? process.env.BASE_URL || 'http://localhost:8765'
  : 'http://localhost:8765';

export default defineConfig({
  testDir: './e2e',

  // Ignore deploy-smoke tests in normal mode (they're for deployed environments)
  // Run them separately with: SMOKE_TEST=true npm run test:e2e
  testIgnore: isSmokeTest ? undefined : ['**/deploy-smoke.spec.ts'],

  // Global setup to start mock OAuth server (disabled for smoke tests)
  globalSetup: isSmokeTest ? undefined : './playwright-global-setup.ts',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only (and smoke tests)
  retries: process.env.CI || isSmokeTest ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use - list for simple output, no auto-serve
  reporter: 'list',

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL,

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run your local dev server before starting the tests (disabled for smoke tests)
  webServer: isSmokeTest
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:8765',
        reuseExistingServer: false,
        timeout: 120000,
      },
});
