/**
 * Deployment Smoke Tests
 *
 * Tests that run against deployed environments (test/prod) without authentication.
 * Uses anonymous Jazz accounts in local-only mode.
 *
 * Run with:
 *   SMOKE_TEST=true BASE_URL=https://app.kjekit.com npx playwright test deploy-smoke
 */

import { expect, test } from '@playwright/test';

test.describe('Deployment Smoke Tests', () => {
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
  });

  test('export/import UI - dialogs open correctly', async ({ page }) => {
    // Open More options menu
    await page.getByLabel('More options').click();

    // Click Export
    await page.getByRole('menuitem', { name: /export/i }).click();

    // Export dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /export/i })).toBeVisible();

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Open Import dialog
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();

    // Import dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /import/i })).toBeVisible();

    // Close dialog
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('navigation - browser back/forward works', async ({ page }) => {
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
  });
});
