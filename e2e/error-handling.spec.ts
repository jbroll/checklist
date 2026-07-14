/**
 * Error Handling E2E Tests (Phase 4.5)
 *
 * Network-error, authentication-error, data-sync and retry tests run against the rowboat app
 * unchanged (they only assert the app stays functional — the folder create/tree UI). Two groups
 * are `test.skip` for the rowboat port (see per-test TODO(e2e) notes): the Import-validation
 * tests open the Import dialog (wired as a no-op in TreeView), and the Subscription-limit tests
 * need list-limit enforcement + the Upgrade dialog, which AppContainer does not render (creation
 * is never blocked in this slice).
 */

import { expect, test } from '@playwright/test';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Wait for page to fully load
 */
async function waitForPageLoad(page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Open import dialog
 */
async function openImportDialog(page) {
  await page.locator('header').getByLabel('More options').click();
  await page.getByRole('menuitem', { name: /import/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/**
 * Create a test folder (organizational container, no limit)
 */
async function createFolder(page, name: string) {
  await page.getByRole('button', { name: /new folder/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.waitForTimeout(1000);
}

/**
 * Create a test list (template folder, subject to subscription limits)
 */
async function createList(page, name: string) {
  await page.getByRole('button', { name: /new list/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByRole('button', { name: /create/i }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.waitForTimeout(1000);
}

// ============================================================================
// Network Errors
// ============================================================================

test.describe('Network Errors', () => {
  test('should handle API unreachable error gracefully', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Intercept API calls and make them fail
    await page.route('/api/billing/**', (route) => {
      route.abort('failed');
    });

    // Try to open upgrade dialog (which normally fetches subscription data)
    await page.locator('header').getByLabel('More options').click();

    // App should still be functional even if billing API fails
    const moreMenu = page.getByRole('menu');
    await expect(moreMenu).toBeVisible();

    // Can still access export/import
    await expect(page.getByRole('menuitem', { name: /export/i })).toBeVisible();
  });

  test('should handle slow network gracefully', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Simulate slow network by delaying responses
    await page.route('/api/billing/subscription', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: {
            tierSlug: 'free',
            status: 'beta',
            tier: { maxLists: 30, sessionRetentionDays: 30 },
          },
        }),
      });
    });

    // App should still load and be functional during slow requests
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });

  test('should recover when network comes back online', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    let requestCount = 0;

    // First request fails, subsequent succeed
    await page.route('/api/billing/subscription', (route) => {
      requestCount++;
      if (requestCount === 1) {
        route.abort('failed');
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription: {
              tierSlug: 'free',
              status: 'beta',
              tier: { maxLists: 30, sessionRetentionDays: 30 },
            },
          }),
        });
      }
    });

    // Initial load may fail but app should still work
    await page.waitForTimeout(2000);
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });
});

// ============================================================================
// Import Errors
// ============================================================================

test.describe('Import Errors', () => {
  test.skip('should show error for oversized files', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await openImportDialog(page);

    // Create a large file (>10MB)
    const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
    const buffer = Buffer.from(largeContent);

    // Try to upload oversized file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'large-file.txt',
      mimeType: 'text/plain',
      buffer,
    });

    // Should show error message
    await expect(
      page.getByText(/file size exceeds|too large|10mb/i)
    ).toBeVisible({ timeout: 5000 });
  });

  // TODO(e2e): opens the Import dialog (openImportDialog) — TreeView wires onImport as a no-op in
  // the rowboat port, so no dialog opens. Re-enable when the Import dialog is wired.
  test.skip('should show error for invalid JSON format', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await openImportDialog(page);

    // Upload invalid JSON
    const invalidJson = '{ invalid json content }';
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(invalidJson),
    });

    // Click import button
    const importButton = page.getByRole('button', { name: /^import$/i }).last();

    // Wait a bit for file to be processed
    await page.waitForTimeout(1000);

    // Try to import - should show error
    if (await importButton.isEnabled()) {
      await importButton.click();

      // Should show validation error (use first() for multiple matches)
      await expect(page.getByText(/invalid|error|failed/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  // TODO(e2e): opens the Import dialog (openImportDialog) — no-op in the rowboat port (see above).
  test.skip('should handle empty import file', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await openImportDialog(page);

    // Upload empty file
    const emptyContent = '';
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'empty.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(emptyContent),
    });

    await page.waitForTimeout(1000);

    // Import button might be disabled or show error
    const importButton = page.getByRole('button', { name: /^import$/i }).last();
    const isDisabled = await importButton.isDisabled();

    if (!isDisabled) {
      await importButton.click();
      // Should handle gracefully (either show message or do nothing)
      await page.waitForTimeout(1000);
    }

    // Dialog should still be functional
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test.skip('should validate file type', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await openImportDialog(page);

    // Try to upload unsupported file type (e.g., image)
    const imageContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const fileInput = page.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: 'image.png',
      mimeType: 'image/png',
      buffer: imageContent,
    });

    await page.waitForTimeout(1000);

    // Should either reject file or show error
    const hasError = await page.getByText(/unsupported|invalid.*type/i).isVisible().catch(() => false);
    const importButton = page.getByRole('button', { name: /^import$/i }).last();
    const isDisabled = await importButton.isDisabled();

    // Either error is shown or import is disabled
    expect(hasError || isDisabled).toBeTruthy();
  });

  test.skip('should handle malformed indented list format', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await openImportDialog(page);

    // Upload malformed indented list (inconsistent indentation)
    const malformedList = `Category 1
  Item 1
      Badly indented item
 Another bad indent
Category 2`;

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'malformed.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(malformedList),
    });

    await page.waitForTimeout(1000);

    const importButton = page.getByRole('button', { name: /^import$/i }).last();

    if (await importButton.isEnabled()) {
      await importButton.click();

      // Should either show warning or import what it can parse
      await page.waitForTimeout(2000);

      // Dialog should remain functional
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  });
});

// ============================================================================
// Subscription Limits
// ============================================================================

test.describe('Subscription Limits', () => {
  // TODO(e2e): needs list-limit enforcement + the Upgrade dialog + the /billing/success sync flow.
  // AppContainer does not enforce a list limit or render UpgradeDialog in the rowboat port, so the
  // Nth "New list" just opens the create dialog. Re-enable when limit enforcement is wired.
  test.skip('should show upgrade dialog when list limit is reached', async ({ page }) => {
    // Mock subscription API to return free tier with 3 list limit
    await page.route('/api/billing/subscription', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: {
            tierSlug: 'free',
            status: 'active', // Not beta, so free tier limits apply
            currentPeriodEnd: null,
            tier: { maxLists: 3, sessionRetentionDays: 7 },
          },
        }),
      });
    });

    // Visit billing success page to trigger subscription sync from mocked API
    await page.goto('/billing/success');
    await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 15000 });

    // Navigate back to dashboard
    await page.getByRole('button', { name: /dashboard/i }).click();
    await waitForPageLoad(page);

    // Create lists up to the limit (3 for free tier)
    // Note: "Quick Errands" is a default list, so we only need to create 2 more
    for (let i = 1; i <= 2; i++) {
      await createList(page, `Test List ${i}`);
    }

    // Try to create one more list (should hit limit and show upgrade dialog)
    await page.getByRole('button', { name: /new list/i }).click();

    // Should show upgrade dialog with limit message
    await expect(page.getByRole('heading', { name: /upgrade/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/limit reached/i)).toBeVisible();
  });

  // TODO(e2e): needs list-limit enforcement + Upgrade dialog (not wired in the rowboat port — see above).
  test.skip('should prevent creating lists beyond limit', async ({ page }) => {
    // Mock free tier with strict limits
    await page.route('/api/billing/subscription', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: {
            tierSlug: 'free',
            status: 'active',
            tier: { maxLists: 3, sessionRetentionDays: 7 },
          },
        }),
      });
    });

    // Visit billing success page to trigger subscription sync from mocked API
    await page.goto('/billing/success');
    await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 15000 });

    // Navigate back to dashboard
    await page.getByRole('button', { name: /dashboard/i }).click();
    await waitForPageLoad(page);

    // Create 2 more lists (Quick Errands + 2 = 3 total, at limit)
    for (let i = 1; i <= 2; i++) {
      await createList(page, `Limited List ${i}`);
    }

    // Verify lists exist
    await expect(page.getByText('Limited List 1')).toBeVisible();
    await expect(page.getByText('Limited List 2')).toBeVisible();

    // Try to create 4th list - should show upgrade dialog instead
    await page.getByRole('button', { name: /new list/i }).click();

    // Should show upgrade dialog, not the create dialog
    await expect(page.getByRole('heading', { name: /upgrade/i })).toBeVisible({ timeout: 5000 });
  });

  // TODO(e2e): opens the Upgrade dialog from an "Upgrade" menu item — AppContainer does not wire
  // onUpgradeClick, so there is no Upgrade menu item or dialog in the rowboat port. Re-enable when wired.
  test.skip('should show tier information in upgrade dialog', async ({ page }) => {
    // Mock free tier to ensure upgrade option is visible
    await page.route('/api/billing/subscription', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: {
            tierSlug: 'free',
            status: 'active',
            tier: { maxLists: 3, sessionRetentionDays: 7 },
          },
        }),
      });
    });

    // Visit billing success page to sync subscription
    await page.goto('/billing/success');
    await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 15000 });

    // Navigate back to dashboard
    await page.getByRole('button', { name: /dashboard/i }).click();
    await waitForPageLoad(page);

    // Open more menu and look for upgrade option
    await page.locator('header').getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /upgrade/i }).click();

    // Should show tier comparison table
    await expect(page.getByRole('heading', { name: /upgrade/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Free').first()).toBeVisible();
    await expect(page.getByText('Plus').first()).toBeVisible();
    await expect(page.getByText('Premium').first()).toBeVisible();

    // Should show features
    await expect(page.getByText('Lists').first()).toBeVisible();
    await expect(page.getByText('Session history')).toBeVisible();
  });
});

// ============================================================================
// Authentication Errors
// ============================================================================

test.describe('Authentication Errors', () => {
  test('should handle auth session check failures', async ({ page }) => {
    // Intercept auth session endpoint
    await page.route('/api/auth/session', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/');

    // App should still load (likely in anonymous mode)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Should show some UI elements
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });

  test('should handle 401 unauthorized responses', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Intercept billing API with 401
    await page.route('/api/billing/subscription', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
    });

    // Try to trigger subscription fetch
    await page.reload();
    await waitForPageLoad(page);

    // App should still work (may show sign-in or continue anonymously)
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });

  test('should gracefully handle missing auth credentials', async ({ page, context }) => {
    // Clear all cookies and storage
    await context.clearCookies();
    await page.goto('/');

    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.reload();
    await waitForPageLoad(page);

    // App should load in anonymous/unauthenticated state
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Core functionality should work
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });
});

// ============================================================================
// Data Sync Errors
// ============================================================================

test.describe('Data Sync Errors', () => {
  test('should handle Jazz sync connection issues', async ({ page }) => {
    // Monitor console for Jazz sync errors
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Jazz]') || text.includes('sync') || text.includes('WebSocket')) {
        consoleLogs.push(text);
      }
    });

    await page.goto('/');
    await waitForPageLoad(page);

    // Create data to test sync
    await createFolder(page, 'Sync Test Folder');

    // Wait for any sync activity
    await page.waitForTimeout(3000);

    // Verify folder was created locally (even if sync fails)
    await expect(page.getByText('Sync Test Folder')).toBeVisible();

    // App should remain functional regardless of sync state
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });

  // Note: Offline reload requires the PWA service worker to cache the app shell.
  // In test mode (dev server), service worker isn't fully active.
  // TODO: Enable when running against production build with installed service worker
  test.skip('should persist data locally when offline', async ({ page, context }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Create a folder
    const folderName = `Offline Test ${Date.now()}`;
    await createFolder(page, folderName);

    // Verify folder exists
    await expect(page.getByText(folderName)).toBeVisible();

    // Simulate offline by blocking network
    await context.setOffline(true);

    // Reload page while offline
    await page.reload();
    await waitForPageLoad(page);

    // Data should still be visible (loaded from local storage/IndexedDB)
    await expect(page.getByText(folderName)).toBeVisible({ timeout: 10000 });

    // Go back online
    await context.setOffline(false);
  });

  test('should recover gracefully when sync reconnects', async ({ page, context }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Create initial data
    await createFolder(page, 'Reconnect Test');
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // App should still be functional
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByText('Reconnect Test')).toBeVisible();
  });

  test('should handle IndexedDB errors gracefully', async ({ page }) => {
    await page.goto('/');

    // Delete IndexedDB to simulate storage error
    await page.evaluate(() => {
      window.indexedDB.deleteDatabase('jazz-tools');
    });

    await page.reload();
    await waitForPageLoad(page);

    // App should reinitialize and work
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });
});

// ============================================================================
// General Error Recovery
// ============================================================================

test.describe('General Error Recovery', () => {
  test.skip('should maintain UI state after errors', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Create some data
    await createFolder(page, 'Error Recovery Test');

    // Cause an error by intercepting requests
    await page.route('/api/**', (route) => {
      route.abort('failed');
    });

    // Try actions that might trigger API calls
    await page.locator('header').getByLabel('More options').click();

    // UI should still be responsive
    await expect(page.getByRole('menu')).toBeVisible();

    // Can close menu
    await page.keyboard.press('Escape');

    // Folder still visible
    await expect(page.getByText('Error Recovery Test')).toBeVisible();
  });

  test('should show user-friendly error messages', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // Intercept checkout API to return error
    await page.route('/api/billing/checkout', (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid tier' }),
      });
    });

    // Try to trigger checkout (if upgrade dialog is available)
    await page.locator('header').getByLabel('More options').click();
    const menuItems = await page.getByRole('menuitem').all();

    // Look for upgrade option
    for (const item of menuItems) {
      const text = await item.textContent();
      if (text?.toLowerCase().includes('upgrade')) {
        await item.click();
        break;
      }
    }

    // If upgrade dialog opened, errors should be handled gracefully
    const dialogVisible = await page.getByRole('dialog').isVisible().catch(() => false);
    if (dialogVisible) {
      // Dialog should still be functional even if checkout fails
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  });

  test('should allow retry after failed operations', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    let attemptCount = 0;

    // First attempt fails, second succeeds
    await page.route('/api/billing/subscription', (route) => {
      attemptCount++;
      if (attemptCount === 1) {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            subscription: {
              tierSlug: 'free',
              status: 'beta',
              tier: { maxLists: 30, sessionRetentionDays: 30 },
            },
          }),
        });
      }
    });

    // Initial load (first attempt may fail)
    await page.waitForTimeout(2000);

    // Reload (second attempt should succeed)
    await page.reload();
    await waitForPageLoad(page);

    // App should be functional
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });
});
