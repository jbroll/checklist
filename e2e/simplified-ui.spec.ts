/**
 * Simplified UI E2E Tests
 *
 * Tests for the new simplified shopping interface with dual-view mode.
 */

import { expect, test } from '@playwright/test';

test.describe('Simplified UI - View Mode Toggle', () => {
  test('should show Advanced View option in More menu (default is simplified)', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown
    await page.getByLabel('More options').first().click();

    // Default is simplified, so should show Advanced View option
    await expect(page.getByRole('menuitem', { name: /advanced view/i })).toBeVisible();
  });

  test('should switch to classic view when clicking menu item', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown and click Advanced View
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /advanced view/i }).click();

    // Should see Basic View menu item (now in classic mode)
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /basic view/i })).toBeVisible();
  });

  test('should persist view mode preference in localStorage', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to classic view
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /advanced view/i }).click();

    // Reload the page
    await page.reload();

    // Should still be in classic view (check for Basic View menu item)
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /basic view/i })).toBeVisible();
  });

  test('should switch back to simplified view from classic', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to classic view
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /advanced view/i }).click();

    // Verify we're in classic view (check for Basic View menu item)
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /basic view/i })).toBeVisible();

    // Click Basic View menu item
    await page.getByRole('menuitem', { name: /basic view/i }).click();

    // Should be back in simplified view (check for Advanced View menu item)
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /advanced view/i })).toBeVisible();
  });
});

test.describe('Simplified UI - Template Selection', () => {
  test('should show empty state when no templates exist', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load (default is simplified view)
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Should show TreeView empty state (already in simplified view)
    await expect(page.getByText(/no lists yet/i)).toBeVisible();
  });

  test('should navigate to session view when selecting a template', async ({ page }) => {
    await page.goto('/test'); // Use test page to set up data

    // Wait for test page to load
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a test template using the test API
    await page.evaluate(() => {
      const templateService = (window as any).testExports.templateService;
      const directoryService = (window as any).testExports.directoryService;
      const me = (window as any).testExports.account;

      // Create directory entry and template
      directoryService.createDirectoryEntry(me, 'Test List', true);
    });

    // Wait a bit for Jazz to sync the data
    await page.waitForTimeout(500);

    // Navigate to home (default is simplified view)
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Should see the template in the list (already in simplified view)
    await expect(page.getByText('Test List')).toBeVisible({ timeout: 10000 });

    // Click on the template
    await page.getByText('Test List').click();

    // Should navigate to session view
    await expect(page.getByRole('heading', { name: /test list/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible();
  });
});

test.describe('Simplified UI - Session View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a test template with items
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const folderService = (window as any).testExports.folderService;
      const me = (window as any).testExports.account;

      // Create template
      directoryService.createDirectoryEntry(me, 'Shopping List', true);

      // Get the template (get all templates and find the one we just created)
      const templates = folderService.getAllTemplates();
      const template = templates.find((t: any) => t.name === 'Shopping List');

      // Add items
      templateService.createItem(me, template.$jazz.id, 'Milk', 'item');
      templateService.createItem(me, template.$jazz.id, 'Bread', 'item');
      templateService.createItem(me, template.$jazz.id, 'Eggs', 'item');
    });

    // Wait a bit for Jazz to sync the data
    await page.waitForTimeout(500);

    // Navigate to home (default is simplified view)
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Wait for the template to appear before clicking (already in simplified view)
    await expect(page.getByText('Shopping List')).toBeVisible({ timeout: 10000 });

    // Click on the template
    await page.getByText('Shopping List').click();
  });

  test('should display session header with controls', async ({ page }) => {
    // Verify header elements - simplified SessionView has view mode toggle and add/edit buttons
    await expect(page.getByRole('heading', { name: /shopping list/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible();
    // View mode toggle button has aria-label like "Switch to Flat view" or "Switch to Zones in Categories view"
    await expect(page.getByRole('button', { name: /switch to/i })).toBeVisible();
    // Add/Edit button has aria-label "Add and edit items" when not in adding mode
    await expect(page.getByRole('button', { name: /add and edit items/i })).toBeVisible();
  });

  test('should display items', async ({ page }) => {
    // Items should be visible
    await expect(page.getByText('Milk')).toBeVisible();
    await expect(page.getByText('Bread')).toBeVisible();
    await expect(page.getByText('Eggs')).toBeVisible();
  });

  test('should navigate back to template selector when clicking Done', async ({ page }) => {
    // Click Done button
    await page.getByRole('button', { name: /done/i }).click();

    // Should return to TreeView with template visible
    await expect(page.getByText('Shopping List')).toBeVisible();
  });
});

test.describe('Simplified UI - Data Synchronization', () => {
  test('should reflect changes between simplified and classic UI', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template via test API
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const me = (window as any).testExports.account;
      directoryService.createDirectoryEntry(me, 'Shared List', true);
    });

    // Wait a bit for Jazz to sync the data
    await page.waitForTimeout(500);

    // Go to home (default is simplified view)
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Template should be visible in simplified view (wait for sync)
    await expect(page.getByText('Shared List')).toBeVisible({ timeout: 10000 });

    // Switch to classic view via menu
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /advanced view/i }).click();

    // Template should be visible in classic view
    await expect(page.getByText('Shared List')).toBeVisible();

    // Switch back to simplified view
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /basic view/i }).click();

    // Template should still be visible in simplified view
    await expect(page.getByText('Shared List')).toBeVisible();
  });
});
