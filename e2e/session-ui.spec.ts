/**
 * Unified UI E2E Tests — shopping/session interface.
 *
 * The rowboat port now wires SessionView into the app: `AppContainer` (see
 * src/components/editor/AppContainer.tsx) creates/finds a session and renders `<SessionView>`
 * when a template row is clicked in `TreeView`. All tests below seed through the rowboat
 * `window.testExports` API (src/services/testHelpers.ts — `directory.create` for
 * folders/templates, `templateService.createItem` for template items, both g-first/async) and
 * are un-skipped.
 *
 * One test stays `test.skip`: "should show default Quick Errands list for new users" — that was
 * Jazz account-migration seeding with no rowboat equivalent; new anonymous sessions start with an
 * empty tree.
 */

import { expect, test } from './fixtures/base';

test.describe('UI - Template Selection', () => {
  test('should show default Quick Errands list for new users', async ({ page }) => {
    // A brand-new user is seeded the default "Quick Errands" list at account-init (jazz.tsx
    // RowboatBridge → defaultData.seedDefaultFolders), the rowboat equivalent of the Jazz account
    // migration's Step 6. Seeded only when there's no pre-existing user_settings row.
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Should show the default Quick Errands list
    await expect(page.getByText(/quick errands/i)).toBeVisible();
  });

  test('should navigate to session view when selecting a template', async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a test template using the test API
    await page.evaluate(async () => {
      await window.testExports!.directory.create('Test List', true);
    });

    // Wait for the template to appear before clicking
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Test List')).toBeVisible({ timeout: 10000 });

    // Click on the template
    await page.getByText('Test List').click();

    // Should navigate to session view
    await expect(page.getByRole('heading', { name: /test list/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible();
  });

  test('browser back/forward toggles tree ↔ session (D3)', async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    await page.evaluate(async () => {
      await window.testExports!.directory.create('Nav List', true);
    });
    await expect(page.getByText('Nav List')).toBeVisible({ timeout: 10000 });

    // Open the session (pushes a history entry)
    await page.getByText('Nav List').click();
    await expect(page.getByRole('heading', { name: /nav list/i })).toBeVisible({ timeout: 5000 });

    // Back → tree view (a header-only "New folder" button is present on the tree, not the session)
    await page.goBack();
    await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible({ timeout: 5000 });

    // Forward → session view again
    await page.goForward();
    await expect(page.getByRole('heading', { name: /nav list/i })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('UI - Session View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a test template with items (createItem auto-adds each item to defaults)
    await page.evaluate(async () => {
      const { g, directory, templateService } = window.testExports!;
      const { entryId: templateId } = await directory.create('Shopping List', true);
      await templateService.createItem(g, templateId, 'Milk');
      await templateService.createItem(g, templateId, 'Bread');
      await templateService.createItem(g, templateId, 'Eggs');
    });

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
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items, then clear the defaults so the session starts empty
    await page.evaluate(async () => {
      const { g, directory, templateService } = window.testExports!;
      const { entryId: templateId } = await directory.create('Empty Session List', true);
      await templateService.createItem(g, templateId, 'Apple');
      await templateService.createItem(g, templateId, 'Banana');
      await g.folder.update(templateId, { default_items: {} });
    });

    // Open the template
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Empty Session List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Empty Session List').click();

    // Should see empty state message
    await expect(page.getByText(/no items selected/i)).toBeVisible();
    await expect(page.getByText(/edit to select default items/i)).toBeVisible();
  });

  test('should enter edit mode when clicking Edit button', async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(async () => {
      const { g, directory, templateService } = window.testExports!;
      const { entryId: templateId } = await directory.create('Edit Mode List', true);
      await templateService.createItem(g, templateId, 'Item One');
      await templateService.createItem(g, templateId, 'Item Two');
    });

    // Open the template
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
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(async () => {
      const { g, directory, templateService } = window.testExports!;
      const { entryId: templateId } = await directory.create('Toggle Default List', true);
      await templateService.createItem(g, templateId, 'Toggle Item');
    });

    // Open the template
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Toggle Default List')).toBeVisible({ timeout: 10000 });
    await page.getByText('Toggle Default List').click();

    // Items should be visible (auto-added to defaults)
    await expect(page.getByText('Toggle Item')).toBeVisible();

    // Enter edit mode
    await page.getByRole('button', { name: /add and edit items/i }).click();

    // Wait for edit mode UI
    await expect(page.getByText('Default Items')).toBeVisible();

    // The batch buttons (Select All, Toggle, Deselect All — icon-only, no accessible text) live
    // in the "Default Items" zone header, as siblings of the title span; the zone's own
    // expand/collapse toggle is a SEPARATE button outside that header row (see IndentedRow), so
    // this locator only picks up the 3 batch buttons: 0=select all, 1=toggle, 2=deselect all.
    const zoneHeaderRow = page.locator('text=Default Items').locator('..').first();
    const deselectAllButton = zoneHeaderRow.locator('button').nth(2);
    await deselectAllButton.click();

    // Exit edit mode
    await page.getByRole('button', { name: 'Done' }).click();

    // Item should no longer be visible in shopping mode (not selected)
    await expect(page.getByText(/no items selected/i)).toBeVisible();
  });

  test('should show batch operation buttons in edit mode', async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items
    await page.evaluate(async () => {
      const { g, directory, templateService } = window.testExports!;
      const { entryId: templateId } = await directory.create('Batch Ops List', true);
      await templateService.createItem(g, templateId, 'Batch Item 1');
      await templateService.createItem(g, templateId, 'Batch Item 2');
    });

    // Open the template
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
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create an empty template
    await page.evaluate(async () => {
      await window.testExports!.directory.create('New Items List', true);
    });

    // Open the template
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
    await page.waitForFunction(() => window.testExports !== undefined, { timeout: 10000 });
    await expect(page.getByText(/test mode/i)).toBeVisible({ timeout: 10000 });

    // Create a template with items and specific defaults (createItem auto-adds to defaults)
    await page.evaluate(async () => {
      const { g, directory, templateService } = window.testExports!;
      const { entryId: templateId } = await directory.create('Inherit Defaults List', true);
      await templateService.createItem(g, templateId, 'Default Item A');
      await templateService.createItem(g, templateId, 'Default Item B');
    });

    // Open the template
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
