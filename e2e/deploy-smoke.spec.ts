/**
 * Deployment Smoke Tests
 *
 * Tests that run against deployed environments (test/prod) without authentication, in
 * anonymous local-only mode. The infrastructure/health, performance, folder/list-creation, and
 * session-view/export-import tests all run against the real UI (no `window.testExports` seeding —
 * these hit a deployed environment, not the `/test` harness page) and pass now that SessionView
 * and the Export/Import dialogs are wired into AppContainer/TreeView.
 *
 * One test stays `test.skip`: "navigation - browser back/forward works" — the tree→session
 * transition is local React state, not a browser-history entry (see its inline TODO(e2e)), so
 * browser back/forward doesn't toggle between TreeView and SessionView. That's a genuine,
 * documented gap (AppContainer.tsx's own doc comment), not a wiring gap.
 *
 * Run with:
 *   npm run test:smoke:test   # Test environment
 *   npm run test:smoke:prod   # Production
 */

import { expect, test } from '@playwright/test';

// Performance thresholds
const THRESHOLDS = {
  pageLoad: 5000, // 5 seconds max for initial page load
  apiResponse: 2000, // 2 seconds max for API responses
  jazzConnect: 5000, // 5 seconds max for Jazz WebSocket
};

// Get base URL for API calls
function getApiUrl(baseUrl: string): string {
  // In deployed environments, API is at /api on the same domain
  return `${baseUrl}/api`;
}

test.describe('Infrastructure Health', () => {
  test('backend health - API returns healthy status', async ({ request, baseURL }) => {
    const apiUrl = getApiUrl(baseURL!);
    const startTime = Date.now();

    // Health endpoint is before CORS, no Origin needed
    const response = await request.get(`${apiUrl}/health`);
    const responseTime = Date.now() - startTime;

    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(THRESHOLDS.apiResponse);

    const health = await response.json();
    expect(health.status).toBe('ok');
    expect(health.timestamp).toBeTruthy();

    // @jbr-jazz/hierarchy-backend's health endpoint returns { status, timestamp }.
    console.log(`  Backend health: OK (${responseTime}ms)`);
  });

  test('auth endpoints - session endpoint responds', async ({ request, baseURL }) => {
    const apiUrl = getApiUrl(baseURL!);

    // Session endpoint requires Origin header for CORS
    const response = await request.get(`${apiUrl}/auth/get-session`, {
      headers: { Origin: baseURL! },
    });
    expect(response.status()).toBe(200);
    console.log(`  Auth session endpoint: ${response.status()}`);
  });

  test('billing endpoints - tiers endpoint responds', async ({ request, baseURL }) => {
    const apiUrl = getApiUrl(baseURL!);

    // Billing tiers endpoint requires Origin header for CORS
    const response = await request.get(`${apiUrl}/billing/tiers`, {
      headers: { Origin: baseURL! },
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.tiers).toBeDefined();
    expect(Array.isArray(data.tiers)).toBe(true);
    console.log(`  Billing endpoint: ${response.status()} (${data.tiers.length} tiers)`);
  });

  test('static assets - CSS and JS load correctly', async ({ page, baseURL }) => {
    const errors: string[] = [];
    const loadedAssets: string[] = [];

    // Listen for failed requests
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.endsWith('.js') || url.endsWith('.css') || url.includes('/assets/')) {
        errors.push(`${request.failure()?.errorText}: ${url}`);
      }
    });

    // Track loaded assets
    page.on('response', (response) => {
      const url = response.url();
      if (url.endsWith('.js') || url.endsWith('.css')) {
        if (response.status() === 200) {
          loadedAssets.push(url.split('/').pop() || url);
        }
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
    expect(loadedAssets.length).toBeGreaterThan(0);
    console.log(`  Static assets loaded: ${loadedAssets.length} files`);
  });
});

test.describe('Performance', () => {
  test('page load time - homepage loads within threshold', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(THRESHOLDS.pageLoad);
    console.log(`  Page load time: ${loadTime}ms (threshold: ${THRESHOLDS.pageLoad}ms)`);
  });

  test('core web vitals - no major performance issues', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for long tasks that block main thread
    const performanceEntries = await page.evaluate(() => {
      return {
        // Get navigation timing
        navigation: performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming,
        // Check if page is interactive
        domInteractive:
          (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
            ?.domInteractive || 0,
      };
    });

    expect(performanceEntries.navigation).toBeTruthy();
    console.log(
      `  DOM Interactive: ${Math.round(performanceEntries.domInteractive)}ms`
    );
  });
});

test.describe('Mobile Compatibility', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test('mobile viewport - app works on small screens', async ({ page }) => {
    await page.goto('/');

    // Core UI should be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Action buttons should be accessible
    await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New list' })).toBeVisible();

    // Create a list to test mobile navigation
    await page.getByRole('button', { name: 'New list' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const listName = `Mobile Test ${Date.now()}`;
    await page.getByLabel(/name/i).fill(listName);
    await page.getByRole('button', { name: /create/i }).click();

    // Navigate to list
    await page.getByText(listName).click();
    await expect(page.getByRole('heading', { name: listName })).toBeVisible({
      timeout: 5000,
    });

    console.log('  Mobile viewport: OK');
  });
});

test.describe('Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('page load - homepage loads with core UI', async ({ page }) => {
    // Verify main UI elements are present
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New list' })).toBeVisible();
    console.log('  Core UI: OK');
  });

  test('create folder - can create a new folder', async ({ page }) => {
    // Click New Folder button
    await page.getByRole('button', { name: 'New folder' }).click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter folder name
    const folderName = `Smoke Folder ${Date.now()}`;
    await page.getByLabel(/name/i).fill(folderName);

    // Submit the form
    await page.getByRole('button', { name: /create/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // New folder should appear in the tree
    await expect(page.getByText(folderName)).toBeVisible();
    console.log('  Create folder: OK');
  });

  test('create list - can create a new list', async ({ page }) => {
    // Click New List button
    await page.getByRole('button', { name: 'New list' }).click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter list name
    const listName = `Smoke List ${Date.now()}`;
    await page.getByLabel(/name/i).fill(listName);

    // Submit the form
    await page.getByRole('button', { name: /create/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // New list should appear in the tree
    await expect(page.getByText(listName)).toBeVisible();
    console.log('  Create list: OK');
  });

  test('add items - can add items to a list', async ({ page }) => {
    // Create a list first
    await page.getByRole('button', { name: 'New list' }).click();
    const listName = `Items Test ${Date.now()}`;
    await page.getByLabel(/name/i).fill(listName);
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Click on the list to open it (opens in session view)
    await page.getByText(listName).click();

    // Wait for the session view to load - look for the list title
    await expect(page.getByRole('heading', { name: listName })).toBeVisible({ timeout: 5000 });

    // Click "Edit to select default items" or the edit button to enter edit mode
    const editLink = page.getByText('Edit to select default items');
    if (await editLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editLink.click();
    } else {
      // Fall back to edit button (the + with pencil icon)
      await page.getByRole('button', { name: /edit/i }).click();
    }

    // Now should see the item input
    const addItemInput = page.getByPlaceholder('Item name...');
    await expect(addItemInput).toBeVisible({ timeout: 5000 });

    // Add an item
    const itemName = 'Test Item';
    await addItemInput.fill(itemName);
    await addItemInput.press('Enter');

    // Item should appear in the list
    await expect(page.getByText(itemName)).toBeVisible();
    console.log('  Add items: OK');
  });

  test('shopping session - can view session UI', async ({ page }) => {
    // Create a list
    await page.getByRole('button', { name: 'New list' }).click();
    const listName = `Session Test ${Date.now()}`;
    await page.getByLabel(/name/i).fill(listName);
    await page.getByRole('button', { name: /create/i }).click();

    // Open the list (opens in session view)
    await page.getByText(listName).click();

    // Verify we're in session view - should see the list title and session controls
    await expect(page.getByRole('heading', { name: listName })).toBeVisible({ timeout: 5000 });

    // Should see session-related buttons like "New" or "Done"
    const newButton = page.getByRole('button', { name: 'New' });
    const doneButton = page.getByRole('button', { name: 'Done' });
    const hasSessionControls =
      (await newButton.isVisible({ timeout: 2000 }).catch(() => false)) ||
      (await doneButton.isVisible({ timeout: 2000 }).catch(() => false));
    expect(hasSessionControls).toBe(true);
    console.log('  Shopping session: OK');
  });

  test('export/import UI - dialogs open correctly', async ({ page }) => {
    // Open More options menu
    await page.locator('header').getByLabel('More options').click();

    // Click Export
    await page.getByRole('menuitem', { name: /export/i }).click();

    // Export dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /export/i })).toBeVisible();

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Open Import dialog
    await page.locator('header').getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();

    // Import dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /import/i })).toBeVisible();

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    console.log('  Export/Import UI: OK');
  });

  // TODO(e2e): session view IS wired now, but the tree→session transition is deliberately LOCAL
  // React state (`currentSessionId` in AppContainer), not a browser-history entry — see
  // AppContainer.tsx's own doc comment: "no cross-tab/browser-back session restore yet". Clicking
  // a template never calls `history.pushState`, so `page.goBack()`/`goForward()` here would just
  // navigate whatever real browser-history entries preceded this page load, not toggle between
  // TreeView and SessionView. This is a genuine, documented gap, not a wiring gap — re-enable if
  // template→session navigation is ever given its own history entry.
  test.skip('navigation - browser back/forward works', async ({ page }) => {
    // Create a list
    await page.getByRole('button', { name: 'New list' }).click();
    const listName = `Nav Test ${Date.now()}`;
    await page.getByLabel(/name/i).fill(listName);
    await page.getByRole('button', { name: /create/i }).click();

    // Click on list to navigate to it
    await page.getByText(listName).click();

    // Wait for session view to load
    await expect(page.getByRole('heading', { name: listName })).toBeVisible({ timeout: 5000 });

    // Go back to tree view
    await page.goBack();

    // Should see the tree view with New folder/list buttons
    await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible({ timeout: 5000 });

    // Go forward
    await page.goForward();

    // Should see session view again
    await expect(page.getByRole('heading', { name: listName })).toBeVisible({ timeout: 5000 });
    console.log('  Navigation: OK');
  });
});
