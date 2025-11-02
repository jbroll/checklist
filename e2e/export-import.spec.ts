/**
 * E2E tests for Export/Import functionality
 *
 * Tests the complete user flows for exporting and importing grocery data.
 */

import { expect, test } from '@playwright/test';

test.describe('Export Functionality', () => {
  test('should open export dialog and show options', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Click Export button
    await page.getByRole('button', { name: /^export$/i }).click();

    // Check dialog is visible
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/export grocery data/i)).toBeVisible();

    // Check export scope options
    await expect(dialog.getByText(/all folders/i)).toBeVisible();
    await expect(dialog.getByText(/selected folder/i)).toBeVisible();

    // Check description text
    await expect(dialog.getByText(/all template items/i)).toBeVisible();
    await expect(dialog.getByText(/all sessions/i)).toBeVisible();
  });

  test('should have "All folders" selected by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^export$/i }).click();

    // All folders radio should be checked
    const allFoldersRadio = page.getByRole('radio', { name: /all folders/i });
    await expect(allFoldersRadio).toBeChecked();

    // Single folder radio should not be checked
    const singleFolderRadio = page.getByRole('radio', { name: /selected folder/i });
    await expect(singleFolderRadio).not.toBeChecked();
  });

  test('should switch to selected folder mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^export$/i }).click();

    // Click "Selected folder" radio
    await page.getByRole('radio', { name: /selected folder/i }).click();

    // Should show dropdown
    await expect(page.locator('select')).toBeVisible();

    // Single folder radio should now be checked
    await expect(page.getByRole('radio', { name: /selected folder/i })).toBeChecked();
  });

  test('should close export dialog on cancel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^export$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should have export button enabled when all folders is selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^export$/i }).click();

    // Export & Download button should be enabled
    const exportButton = page.getByRole('button', { name: /export & download/i });
    await expect(exportButton).toBeEnabled();
  });
});

test.describe('Import Functionality', () => {
  test('should open import dialog and show upload area', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Click Import button
    await page.getByRole('button', { name: /^import$/i }).click();

    // Check dialog is visible
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/import grocery data/i)).toBeVisible();

    // Check for upload elements
    await expect(dialog.getByText(/drop json file here/i)).toBeVisible();
    await expect(dialog.getByText(/browse files/i)).toBeVisible();

    // Check info about conflict resolution
    await expect(dialog.getByText(/duplicate folders will be renamed/i)).toBeVisible();
  });

  test('should show file size and type restrictions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^import$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/json files only/i)).toBeVisible();
    await expect(dialog.getByText(/up to 10mb/i)).toBeVisible();
  });

  test('should close import dialog on cancel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^import$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should have import button disabled when no file is selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^import$/i }).click();

    // Import button should be disabled
    const importButton = page.getByRole('button', { name: /^import$/i }).last();
    await expect(importButton).toBeDisabled();
  });
});

test.describe('Export/Import Dialog Interactions', () => {
  test('should close export dialog when pressing Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^export$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close import dialog when pressing Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /^import$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should not open both dialogs at the same time', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Open Export dialog
    await page.getByRole('button', { name: /^export$/i }).click();
    await expect(page.getByText(/export grocery data/i)).toBeVisible();

    // Close it
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Open Import dialog
    await page.getByRole('button', { name: /^import$/i }).click();
    await expect(page.getByText(/import grocery data/i)).toBeVisible();

    // Should only see import dialog, not export
    await expect(page.getByText(/export grocery data/i)).not.toBeVisible();
  });
});
