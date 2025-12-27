/**
 * Unified UI E2E Tests
 *
 * Tests for the shopping interface - clicking templates opens latest session,
 * sessions are always visible in TreeView.
 */

import { expect, test } from './fixtures/base';

test.describe('UI - Template Selection', () => {
  test('should show empty state when no templates exist', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

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

    // Wait a bit for Jazz to sync the data
    await page.waitForTimeout(500);

    // Navigate to home
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Should see the template in the list
    await expect(page.getByText('Test List')).toBeVisible({ timeout: 10000 });

    // Click on the template
    await page.getByText('Test List').click();

    // Should navigate to session view
    await expect(page.getByRole('heading', { name: /test list/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible();
  });
});

test.describe('UI - Session View', () => {
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

    // Navigate to home
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Wait for the template to appear before clicking
    await expect(page.getByText('Shopping List')).toBeVisible({ timeout: 10000 });

    // Click on the template
    await page.getByText('Shopping List').click();
  });

  test('should display session header with controls', async ({ page }) => {
    // Verify header elements - SessionView has view mode toggle and add/edit buttons
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

test.describe('UI - Default Items', () => {
  test('should show empty state when no items are selected', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items but clear the defaults
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const folderService = (window as any).testExports.folderService;
      const me = (window as any).testExports.account;

      // Create template
      directoryService.createDirectoryEntry(me, 'Empty Session List', true);

      // Get the template
      const templates = folderService.getAllTemplates();
      const template = templates.find((t: any) => t.name === 'Empty Session List');

      // Add items (they'll be auto-added to defaults)
      templateService.createItem(me, template.$jazz.id, 'Apple');
      templateService.createItem(me, template.$jazz.id, 'Banana');

      // Clear the defaults so session starts empty
      template.$jazz.set('defaultItems', {});
    });

    await page.waitForTimeout(500);

    // Navigate to home and open the template
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Empty Session List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Empty Session List').click();

    // Should see empty state message
    await expect(page.getByText(/no items selected/i)).toBeVisible();
    await expect(page.getByText(/edit to select default items/i)).toBeVisible();
  });

  test('should enter edit mode when clicking Edit button', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const folderService = (window as any).testExports.folderService;
      const me = (window as any).testExports.account;

      directoryService.createDirectoryEntry(me, 'Edit Mode List', true);
      const templates = folderService.getAllTemplates();
      const template = templates.find((t: any) => t.name === 'Edit Mode List');
      templateService.createItem(me, template.$jazz.id, 'Item One');
      templateService.createItem(me, template.$jazz.id, 'Item Two');
    });

    await page.waitForTimeout(500);

    // Navigate to home and open the template
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Edit Mode List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Edit Mode List').click();

    // Click the Edit button
    await page.getByRole('button', { name: /add and edit items/i }).click();

    // Should see the Default Items zone header
    await expect(page.getByText('Default Items')).toBeVisible();

    // Should see the item input field for adding new items (placeholder is "Item name...")
    await expect(page.getByPlaceholder(/item name/i)).toBeVisible();
  });

  test('should toggle item default state in edit mode via deselect all', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const folderService = (window as any).testExports.folderService;
      const me = (window as any).testExports.account;

      directoryService.createDirectoryEntry(me, 'Toggle Default List', true);
      const templates = folderService.getAllTemplates();
      const template = templates.find((t: any) => t.name === 'Toggle Default List');
      templateService.createItem(me, template.$jazz.id, 'Toggle Item');
    });

    await page.waitForTimeout(500);

    // Navigate to home and open the template
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Toggle Default List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Toggle Default List').click();

    // Items should be visible (auto-added to defaults)
    await expect(page.getByText('Toggle Item')).toBeVisible();

    // Enter edit mode
    await page.getByRole('button', { name: /add and edit items/i }).click();

    // Wait for edit mode UI
    await expect(page.getByText('Default Items')).toBeVisible();

    // Use the Deselect All batch button (third batch button in the header)
    // The batch buttons are in a group near "Default Items"
    const batchButtonGroup = page.locator('text=Default Items').locator('..').first();
    const deselectAllButton = batchButtonGroup.locator('button').nth(2); // 0=expand, 1=select all, 2=toggle, 3=deselect
    await deselectAllButton.click();

    // Exit edit mode
    await page.getByRole('button', { name: 'Done' }).click();

    // Item should no longer be visible in shopping mode (not selected)
    await expect(page.getByText(/no items selected/i)).toBeVisible();
  });

  test('should show batch operation buttons in edit mode', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const folderService = (window as any).testExports.folderService;
      const me = (window as any).testExports.account;

      directoryService.createDirectoryEntry(me, 'Batch Ops List', true);
      const templates = folderService.getAllTemplates();
      const template = templates.find((t: any) => t.name === 'Batch Ops List');
      templateService.createItem(me, template.$jazz.id, 'Batch Item 1');
      templateService.createItem(me, template.$jazz.id, 'Batch Item 2');
    });

    await page.waitForTimeout(500);

    // Navigate to home and open the template
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Batch Ops List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Batch Ops List').click();

    // Enter edit mode
    await page.getByRole('button', { name: /add and edit items/i }).click();

    // Wait for Default Items zone to appear
    await expect(page.getByText('Default Items')).toBeVisible();

    // The batch operation buttons are in the Default Items header
    // There should be 3 batch buttons (Select All, Toggle, Deselect All)
    const defaultItemsZone = page.locator('text=Default Items').locator('..').first();
    const batchButtons = defaultItemsZone.locator('button');
    await expect(batchButtons).toHaveCount(3); // 3 batch buttons (no expand toggle since zone is always expanded)
  });

  test('should add new items as defaults', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create an empty template
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const me = (window as any).testExports.account;
      directoryService.createDirectoryEntry(me, 'New Items List', true);
    });

    await page.waitForTimeout(500);

    // Navigate to home and open the template
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('New Items List')).toBeVisible({ timeout: 10000 });
    await page.getByText('New Items List').click();

    // Should see empty state initially
    await expect(page.getByText(/no items/i)).toBeVisible();

    // Enter edit mode via the "Edit to select default items" button in empty state
    await page.getByRole('button', { name: /edit to select default items/i }).click();

    // Wait for the input field to appear (placeholder is "Item name...")
    const input = page.getByPlaceholder(/item name/i);
    await expect(input).toBeVisible();

    // Add a new item
    await input.fill('New Default Item');
    await input.press('Enter');

    // Wait for item to appear in the list
    await expect(page.getByText('New Default Item')).toBeVisible({ timeout: 10000 });

    // Exit edit mode
    await page.getByRole('button', { name: 'Done' }).click();

    // Item should be visible in shopping mode (auto-added to defaults)
    await expect(page.getByText('New Default Item')).toBeVisible();
  });

  test('should inherit defaults when creating new session', async ({ page }) => {
    await page.goto('/test');
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items and specific defaults
    await page.evaluate(() => {
      const directoryService = (window as any).testExports.directoryService;
      const templateService = (window as any).testExports.templateService;
      const folderService = (window as any).testExports.folderService;
      const me = (window as any).testExports.account;

      directoryService.createDirectoryEntry(me, 'Inherit Defaults List', true);
      const templates = folderService.getAllTemplates();
      const template = templates.find((t: any) => t.name === 'Inherit Defaults List');

      // Add items - they'll be auto-added to defaults
      templateService.createItem(me, template.$jazz.id, 'Default Item A');
      templateService.createItem(me, template.$jazz.id, 'Default Item B');
    });

    await page.waitForTimeout(500);

    // Navigate to home and open the template
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Inherit Defaults List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Inherit Defaults List').click();

    // Both items should be visible (inherited from defaults)
    await expect(page.getByText('Default Item A')).toBeVisible();
    await expect(page.getByText('Default Item B')).toBeVisible();

    // Click New button to create a new session
    await page.getByRole('button', { name: 'New' }).click();

    // Both items should still be visible (new session inherits defaults)
    await expect(page.getByText('Default Item A')).toBeVisible();
    await expect(page.getByText('Default Item B')).toBeVisible();
  });
});
