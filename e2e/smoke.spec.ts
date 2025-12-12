/**
 * Smoke tests - Basic functionality verification
 *
 * These tests ensure the application starts and core features work.
 */

import { expect, test } from '@playwright/test';

test.describe('Application Smoke Tests', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Should see the main heading or title
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should display app header after loading', async ({ page }) => {
    await page.goto('/');

    // Wait for the main heading (brand.headerText - "Lists" for kjekit)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show New Folder button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Check for New Folder button
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });

  test('should show Export and Import buttons in header', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown
    await page.getByLabel('More options').click();

    // Check for Export option in dropdown
    await expect(page.getByRole('menuitem', { name: /export/i })).toBeVisible();

    // Check for Import option in dropdown
    await expect(page.getByRole('menuitem', { name: /import/i })).toBeVisible();
  });

  test('should not crash when clicking Export button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown
    await page.getByLabel('More options').click();

    // Click Export menu item
    await page.getByRole('menuitem', { name: /export/i }).click();

    // Should show export dialog with new title
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^export$/i })).toBeVisible();
  });

  test('should not crash when clicking Import button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown
    await page.getByLabel('More options').click();

    // Click Import menu item
    await page.getByRole('menuitem', { name: /import/i }).click();

    // Should show import dialog with new title
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^import$/i })).toBeVisible();
  });

  test('should close Export dialog when clicking Cancel', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown and click Export
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /export/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close Import dialog when clicking Cancel', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // Open the More options dropdown and click Import
    await page.getByLabel('More options').click();
    await page.getByRole('menuitem', { name: /import/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
