/**
 * Base Playwright test fixture
 *
 * Injects __PLAYWRIGHT__ flag to enable test helpers in the app.
 */

import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject Playwright flag before navigating to any page
    await page.addInitScript(() => {
      (window as any).__PLAYWRIGHT__ = true;
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';
