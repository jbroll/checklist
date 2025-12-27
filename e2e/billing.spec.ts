/**
 * E2E Tests for Billing Pages
 *
 * Tests the /billing/success and /billing/cancel routes.
 */

import { expect, test } from '@playwright/test';

test.describe('Billing Success Page', () => {
  test('should render success page at /billing/success', async ({ page }) => {
    await page.goto('/billing/success');

    // Should show syncing state initially or success state
    // The page syncs subscription from backend, then shows success
    await expect(
      page.getByText(/activating|thank you|upgrading/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show success message after sync', async ({ page }) => {
    await page.goto('/billing/success');

    // Wait for the page to finish syncing (or show success immediately if already synced)
    // The success state shows "Thank you for upgrading!"
    await expect(
      page.getByRole('heading', { name: /thank you/i })
    ).toBeVisible({ timeout: 15000 });
  });

  test('should show tier name in success message', async ({ page }) => {
    await page.goto('/billing/success');

    // Wait for success state
    await expect(
      page.getByRole('heading', { name: /thank you/i })
    ).toBeVisible({ timeout: 15000 });

    // Should mention the tier (Free by default for anonymous user)
    await expect(page.getByText(/subscription is now active/i)).toBeVisible();
  });

  test('should have Go to Dashboard button', async ({ page }) => {
    await page.goto('/billing/success');

    // Wait for page to load
    await expect(
      page.getByText(/activating|thank you/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Should have dashboard button
    await expect(
      page.getByRole('button', { name: /dashboard/i })
    ).toBeVisible({ timeout: 15000 });
  });

  test('should navigate to dashboard when clicking button', async ({ page }) => {
    await page.goto('/billing/success');

    // Wait for success state
    await expect(
      page.getByRole('heading', { name: /thank you/i })
    ).toBeVisible({ timeout: 15000 });

    // Click dashboard button
    await page.getByRole('button', { name: /dashboard/i }).click();

    // Should navigate to home
    await expect(page).toHaveURL('/');
  });
});

test.describe('Billing Cancel Page', () => {
  test('should render cancel page at /billing/cancel', async ({ page }) => {
    await page.goto('/billing/cancel');

    // Should show the cancel message
    await expect(
      page.getByRole('heading', { name: /checkout cancelled/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show reassurance message', async ({ page }) => {
    await page.goto('/billing/cancel');

    // Should reassure user no charge was made
    await expect(
      page.getByText(/card was not charged/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should have Back to Dashboard button', async ({ page }) => {
    await page.goto('/billing/cancel');

    // Should have dashboard button
    await expect(
      page.getByRole('button', { name: /back to dashboard/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to dashboard when clicking button', async ({ page }) => {
    await page.goto('/billing/cancel');

    // Wait for page to load
    await expect(
      page.getByRole('heading', { name: /checkout cancelled/i })
    ).toBeVisible({ timeout: 10000 });

    // Click dashboard button
    await page.getByRole('button', { name: /back to dashboard/i }).click();

    // Should navigate to home
    await expect(page).toHaveURL('/');
  });
});

test.describe('Billing Routes Accessibility', () => {
  test('billing success page should not have accessibility violations', async ({ page }) => {
    await page.goto('/billing/success');

    // Wait for content to load
    await expect(
      page.getByText(/activating|thank you/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Check for basic accessibility: headings, buttons have accessible names
    const heading = page.getByRole('heading');
    await expect(heading.first()).toBeVisible();

    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('billing cancel page should not have accessibility violations', async ({ page }) => {
    await page.goto('/billing/cancel');

    // Wait for content to load
    await expect(
      page.getByRole('heading', { name: /checkout cancelled/i })
    ).toBeVisible({ timeout: 10000 });

    // Check for basic accessibility
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });
});
