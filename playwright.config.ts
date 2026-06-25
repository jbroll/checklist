import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing
 * @see https://playwright.dev/docs/test-configuration
 *
 * Supports two modes:
 * 1. Normal mode: Starts local dev server, uses mock OAuth
 * 2. Smoke test mode (SMOKE_TEST=true): No server, no OAuth, uses BASE_URL
 *
 * The invite closed-loop (auth-setup + invite projects) needs SMTP+IMAP
 * (GreenMail) to verify real test-account signup emails. When mail env is
 * absent those projects self-exclude so normal/CI runs are unaffected.
 */

const isSmokeTest = process.env.SMOKE_TEST === 'true';
const baseURL = isSmokeTest
  ? process.env.BASE_URL || 'http://localhost:8765'
  : 'http://localhost:8765';

const hasEmailInfra = Boolean(process.env.IMAP_HOST && process.env.IMAP_USERNAME);

export default defineConfig({
  testDir: './e2e',

  // Only collect *.spec.ts. e2e/helpers/*.test.ts are pure unit tests run by
  // vitest, not Playwright. (Per-project testMatch below overrides this where
  // needed, e.g. the auth-setup project matches invite.setup.ts.)
  testMatch: '**/*.spec.ts',

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
      // Project-level testIgnore overrides the global one, so repeat the
      // deploy-smoke exclusion here. Invite + auth-setup specs run under their
      // own projects (below), so exclude them from chromium too. The merge
      // closed-loop spec also runs under its own project.
      testIgnore: isSmokeTest
        ? ['**/invite.setup.ts', '**/invite-closed-loop.spec.ts', '**/account-merge.spec.ts']
        : [
            '**/deploy-smoke.spec.ts',
            '**/invite.setup.ts',
            '**/invite-closed-loop.spec.ts',
            '**/account-merge.spec.ts',
          ],
      use: { ...devices['Desktop Chrome'] },
    },
    ...(hasEmailInfra
      ? [
          {
            name: 'auth-setup',
            testMatch: /invite\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
          },
          {
            name: 'invite',
            testMatch: /invite-closed-loop\.spec\.ts/,
            dependencies: ['auth-setup'],
            use: {
              ...devices['Desktop Chrome'],
              // Default actor = organizer (test1); recipient/third-party specs
              // open their own context with the matching storageState.
              storageState: 'e2e/.auth/test1.json',
            },
          },
          {
            name: 'merge',
            testMatch: /account-merge\.spec\.ts/,
            // No auth-setup dependency: account merge is destructive, so the spec
            // provisions its own FRESH accounts per run (beforeAll) rather than
            // reuse the shared test1/test2 sessions, which a prior merge fuses.
            use: {
              ...devices['Desktop Chrome'],
              // No default storageState — the merge spec drives all sign-ins
              // manually so that localStorage is preserved across transitions.
            },
          },
        ]
      : []),
  ],

  // Run your local dev server before starting the tests (disabled for smoke tests).
  // Playwright forwards process.env to the webServer, so the GreenMail SMTP env
  // reaches the backend and verification emails are delivered to GreenMail.
  webServer: isSmokeTest
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:8765',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
