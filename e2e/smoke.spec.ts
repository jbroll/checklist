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

  test('should display Template Editor after loading', async ({ page }) => {
    await page.goto('/');

    // Wait for the template editor heading
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show New Folder button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Check for New Folder button
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
  });

  test('should show Export and Import buttons in header', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Check for Export button
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();

    // Check for Import button
    await expect(page.getByRole('button', { name: /import/i })).toBeVisible();
  });

  test('should not crash when clicking Export button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Click Export button
    const exportButton = page.getByRole('button', { name: /^export$/i });
    await exportButton.click();

    // Should show export dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/export grocery data/i)).toBeVisible();
  });

  test('should not crash when clicking Import button', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Click Import button
    const importButton = page.getByRole('button', { name: /^import$/i });
    await importButton.click();

    // Should show import dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/import grocery data/i)).toBeVisible();
  });

  test('should close Export dialog when clicking Cancel', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Open Export dialog
    await page.getByRole('button', { name: /^export$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close Import dialog when clicking Cancel', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /template editor/i })).toBeVisible({
      timeout: 10000,
    });

    // Open Import dialog
    await page.getByRole('button', { name: /^import$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
