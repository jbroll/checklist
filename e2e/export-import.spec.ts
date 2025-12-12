/**
 * E2E tests for Export/Import functionality
 *
 * Tests the complete user flows for exporting and importing grocery data.
 */

import { expect, test } from '@playwright/test';

test.describe('Export Functionality', () => {
  test('should open export dialog and show options', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open More options dropdown and click Export
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /export/i }).click();

    // Check dialog is visible with new title and description
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /^export$/i })).toBeVisible();
    await expect(dialog.getByText(/export to json for backup or transfer/i)).toBeVisible();
  });

  test('should close export dialog on cancel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /export/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should have export button enabled', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /export/i }).click();

    // Export & Download button should be enabled for top-level export
    const exportButton = page.getByRole('button', { name: /export & download/i });
    await expect(exportButton).toBeEnabled();
  });
});

test.describe('Import Functionality', () => {
  test('should open import dialog and show upload area', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open More options dropdown and click Import
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();

    // Check dialog is visible with new title and description
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /^import$/i })).toBeVisible();
    await expect(dialog.getByText(/auto-detects json.*or txt\/csv/i)).toBeVisible();

    // Check for upload elements
    await expect(dialog.getByText(/drop json, txt, csv file here or/i)).toBeVisible();
    await expect(dialog.getByText(/browse files/i)).toBeVisible();
  });

  test('should show file size and type restrictions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/json, txt, csv files, up to 10mb/i)).toBeVisible();
  });

  test('should close import dialog on cancel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should have import button disabled when no file is selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();

    // Import button should be disabled
    const importButton = page.getByRole('button', { name: /^import$/i }).last();
    await expect(importButton).toBeDisabled();
  });
});

test.describe('Export/Import Dialog Interactions', () => {
  test('should close export dialog when pressing Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /export/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close import dialog when pressing Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should not open both dialogs at the same time', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open Export dialog
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /export/i }).click();
    await expect(page.getByRole('heading', { name: /^export$/i })).toBeVisible();

    // Close it
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Open Import dialog
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();
    await expect(page.getByRole('heading', { name: /^import$/i })).toBeVisible();

    // Should only see import dialog, not export
    await expect(page.getByRole('heading', { name: /^export$/i })).not.toBeVisible();
  });
});
