/**
 * Simplified UI E2E Tests
 *
 * Tests for the new simplified shopping interface with dual-view mode.
 */

import { expect, test } from '@playwright/test';

test.describe('Simplified UI - View Mode Toggle', () => {
  test('should show Simplified View option in More menu', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown
    await page.getByLabel('More options').first().click();

    // Check for Simplified View option
    await expect(page.getByRole('menuitem', { name: /simplified view/i })).toBeVisible();
  });

  test('should switch to simplified view when clicking menu item', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown and click Simplified View
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Should see empty state message (using TreeView)
    await expect(page.getByText(/no lists yet/i)).toBeVisible();

    // Should see Classic View menu item
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /classic view/i })).toBeVisible();
  });

  test('should persist view mode preference in localStorage', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to simplified view
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Reload the page
    await page.reload();

    // Should still be in simplified view (check for Classic View menu item)
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /classic view/i })).toBeVisible();
  });

  test('should switch back to classic view from simplified', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to simplified view
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Verify we're in simplified view (check for Classic View menu item)
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /classic view/i })).toBeVisible();

    // Click Classic View menu item
    await page.getByRole('menuitem', { name: /classic view/i }).click();

    // Should be back in classic view (check for Simplified View menu item)
    await page.getByLabel('More options').first().click();
    await expect(page.getByRole('menuitem', { name: /simplified view/i })).toBeVisible();
  });
});

test.describe('Simplified UI - Template Selection', () => {
  test('should show empty state when no templates exist', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to simplified view
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Should show TreeView empty state
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

    // Navigate to home and switch to simplified view
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Should see the template in the list
    await expect(page.getByText('Test List')).toBeVisible();

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

    // Navigate to simplified view
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

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
  test('should reflect changes from classic UI in simplified UI', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template in classic UI
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const me = (window as any).testExports.account;
      directoryService.createDirectoryEntry(me, 'Shared List', true);
    });

    // Go to simplified view
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Template should be visible in simplified view
    await expect(page.getByText('Shared List')).toBeVisible();

    // Switch back to classic view via menu
    await page.getByLabel('More options').first().click();
    await page.getByRole('menuitem', { name: /classic view/i }).click();

    // Template should be visible in classic view
    await expect(page.getByText('Shared List')).toBeVisible();
  });
});
