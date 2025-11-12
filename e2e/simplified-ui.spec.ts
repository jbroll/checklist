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
    await page.getByLabel('More options').click();

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
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Should see simplified template selector
    await expect(page.getByText(/select a list to start shopping/i)).toBeVisible();

    // Should see Classic View switch button
    await expect(page.getByRole('button', { name: /switch to classic view/i })).toBeVisible();
  });

  test('should persist view mode preference in localStorage', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to simplified view
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Reload the page
    await page.reload();

    // Should still be in simplified view
    await expect(page.getByText(/select a list to start shopping/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('should switch back to classic view from simplified', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    // Switch to simplified view
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Verify we're in simplified view
    await expect(page.getByText(/select a list to start shopping/i)).toBeVisible();

    // Click Switch to Classic View button
    await page.getByRole('button', { name: /switch to classic view/i }).first().click();

    // Should be back in classic view with tree structure
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
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
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Should show no lists available message
    await expect(page.getByText(/no lists available/i)).toBeVisible();
    await expect(page.getByText(/switch to classic view to create lists/i)).toBeVisible();
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

    await page.getByLabel('More options').click();
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
      const me = (window as any).testExports.account;

      // Create template
      directoryService.createDirectoryEntry(me, 'Shopping List', true);

      // Get the template
      const templates = me.root.templates;
      const template = templates[templates.length - 1];

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

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Click on the template
    await page.getByText('Shopping List').click();
  });

  test('should display session header with controls', async ({ page }) => {
    // Verify header elements
    await expect(page.getByRole('heading', { name: /shopping list/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /clear/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /flat view/i })).toBeVisible(); // Zone view is default
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add item/i })).toBeVisible();
  });

  test('should display items in zone view', async ({ page }) => {
    // Should show Available zone with items
    await expect(page.getByText(/available/i)).toBeVisible();
    await expect(page.getByText('Milk')).toBeVisible();
    await expect(page.getByText('Bread')).toBeVisible();
    await expect(page.getByText('Eggs')).toBeVisible();
  });

  test('should toggle between zone and flat views', async ({ page }) => {
    // Default is zone view
    await expect(page.getByText(/available/i)).toBeVisible();

    // Switch to flat view
    await page.getByRole('button', { name: /flat view/i }).click();

    // Zone headings should disappear
    await expect(page.getByText(/available/i)).not.toBeVisible();

    // Items should still be visible
    await expect(page.getByText('Milk')).toBeVisible();

    // Button text should change
    await expect(page.getByRole('button', { name: /zone view/i })).toBeVisible();
  });

  test('should check and uncheck items', async ({ page }) => {
    // Find checkbox for Milk item
    const milkRow = page.locator('div', { has: page.getByText('Milk') });
    const checkbox = milkRow.locator('input[type="checkbox"]');

    // Check the item
    await checkbox.click();

    // Item should move to Checked zone
    await expect(page.getByText(/checked/i)).toBeVisible();
    const checkedZone = page.locator('div', { has: page.getByText(/checked/i) });
    await expect(checkedZone.getByText('Milk')).toBeVisible();

    // Uncheck the item
    await checkbox.click();

    // Item should move back to Available zone
    await expect(page.getByText(/available/i)).toBeVisible();
    const availableZone = page.locator('div', { has: page.getByText(/available/i) });
    await expect(availableZone.getByText('Milk')).toBeVisible();
  });

  test('should clear all checkboxes', async ({ page }) => {
    // Check some items
    const milkRow = page.locator('div', { has: page.getByText('Milk') });
    await milkRow.locator('input[type="checkbox"]').click();

    const breadRow = page.locator('div', { has: page.getByText('Bread') });
    await breadRow.locator('input[type="checkbox"]').click();

    // Verify Checked zone appears
    await expect(page.getByText(/checked/i)).toBeVisible();

    // Click Clear button
    await page.getByRole('button', { name: /clear/i }).click();

    // All items should be back in Available zone
    await expect(page.getByText(/checked/i)).not.toBeVisible();
    const availableZone = page.locator('div', { has: page.getByText(/available/i) });
    await expect(availableZone.getByText('Milk')).toBeVisible();
    await expect(availableZone.getByText('Bread')).toBeVisible();
  });

  test('should show inline form when clicking Add Item', async ({ page }) => {
    // Click Add Item button
    await page.getByRole('button', { name: /add item/i }).click();

    // Inline form should appear
    await expect(page.getByPlaceholder(/enter item or category name/i)).toBeVisible();
    await expect(page.getByText(/item/i)).toBeVisible();
    await expect(page.getByText(/category/i)).toBeVisible();
  });

  test('should add item using inline form', async ({ page }) => {
    // Open inline form
    await page.getByRole('button', { name: /add item/i }).click();

    // Enter item name
    await page.getByPlaceholder(/enter item or category name/i).fill('Cheese');

    // Submit form (press Enter)
    await page.getByPlaceholder(/enter item or category name/i).press('Enter');

    // New item should appear in the list
    await expect(page.getByText('Cheese')).toBeVisible();

    // Form should still be open for rapid entry
    await expect(page.getByPlaceholder(/enter item or category name/i)).toBeVisible();
  });

  test('should close inline form when clicking close button', async ({ page }) => {
    // Open inline form
    await page.getByRole('button', { name: /add item/i }).click();

    // Verify form is visible
    await expect(page.getByPlaceholder(/enter item or category name/i)).toBeVisible();

    // Click close button (X)
    await page.getByRole('button', { name: /close/i }).first().click();

    // Form should disappear
    await expect(page.getByPlaceholder(/enter item or category name/i)).not.toBeVisible();
  });

  test('should show trash icons when add form is open', async ({ page }) => {
    // Initially, trash icons should not be visible
    await expect(page.locator('button[aria-label*="Delete"]').first()).not.toBeVisible();

    // Open add form
    await page.getByRole('button', { name: /add item/i }).click();

    // Trash icons should appear (on hover)
    const milkRow = page.locator('div', { has: page.getByText('Milk') });
    await milkRow.hover();

    // Trash icon should be visible
    await expect(page.locator('button[aria-label="Delete Milk"]')).toBeVisible();
  });

  test('should navigate back to template selector when clicking Done', async ({ page }) => {
    // Click Done button
    await page.getByRole('button', { name: /done/i }).click();

    // Should return to template selector
    await expect(page.getByText(/select a list to start shopping/i)).toBeVisible();
    await expect(page.getByText('Shopping List')).toBeVisible();
  });

  test('should maintain session state when navigating away and back', async ({ page }) => {
    // Check an item
    const milkRow = page.locator('div', { has: page.getByText('Milk') });
    await milkRow.locator('input[type="checkbox"]').click();

    // Navigate back
    await page.getByRole('button', { name: /done/i }).click();

    // Return to session
    await page.getByText('Shopping List').click();

    // Item should still be checked
    await expect(page.getByText(/checked/i)).toBeVisible();
    const checkedZone = page.locator('div', { has: page.getByText(/checked/i) });
    await expect(checkedZone.getByText('Milk')).toBeVisible();
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

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Template should be visible in simplified view
    await expect(page.getByText('Shared List')).toBeVisible();

    // Switch back to classic view
    await page.getByRole('button', { name: /switch to classic view/i }).first().click();

    // Template should be visible in classic view
    await expect(page.getByText('Shared List')).toBeVisible();
  });

  test('should persist deleted items across both UIs', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const me = (window as any).testExports.account;

      directoryService.createDirectoryEntry(me, 'Delete Test', true);
      const templates = me.root.templates;
      const template = templates[templates.length - 1];

      templateService.createItem(me, template.$jazz.id, 'Item to Delete', 'item');
    });

    // Go to simplified view
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /simplified view/i }).click();

    // Open the template
    await page.getByText('Delete Test').click();

    // Open add form to show trash icons
    await page.getByRole('button', { name: /add item/i }).click();

    // Hover over item and delete it
    const itemRow = page.locator('div', { has: page.getByText('Item to Delete') });
    await itemRow.hover();
    await page.locator('button[aria-label="Delete Item to Delete"]').click();

    // Item should disappear
    await expect(page.getByText('Item to Delete')).not.toBeVisible();

    // Go back to classic view
    await page.getByRole('button', { name: /done/i }).click();
    await page.getByRole('button', { name: /switch to classic view/i }).first().click();

    // Item should not be visible in classic view either
    await expect(page.getByText('Item to Delete')).not.toBeVisible();
  });
});
