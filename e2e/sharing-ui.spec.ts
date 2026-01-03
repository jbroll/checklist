/**
 * E2E Tests for Sharing UI
 *
 * Tests the share dialog and invite acceptance page UI.
 * Uses API mocking for reliable, fast tests.
 */

import { expect, test } from './fixtures/base';

// Mock data for tests
const mockCollaborators = [
  {
    userId: 'user-1',
    accountId: 'co_user_1',
    email: 'owner@example.com',
    name: 'Owner User',
    permission: 'admin',
    role: 'admin',
  },
  {
    userId: 'user-2',
    accountId: 'co_user_2',
    email: 'editor@example.com',
    name: 'Editor User',
    permission: 'writer',
    role: 'writer',
  },
];

const mockPendingInvites = [
  {
    token: 'pending-token-1',
    recipientEmail: 'pending1@example.com',
    permission: 'reader',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    token: 'pending-token-2',
    recipientEmail: 'pending2@example.com',
    permission: 'writer',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

test.describe('Share Dialog UI', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the collaborators and invites endpoints
    await page.route('**/api/shares/targets/*/collaborators', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ collaborators: mockCollaborators }),
      });
    });

    await page.route('**/api/shares/targets/*/invites', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invites: mockPendingInvites }),
      });
    });

    // Go to test page and create a folder
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });

    // Create a test folder (template folder has the share option)
    await page.evaluate(() => {
      return window.__testServices!.directory.create('Share Test Folder', true);
    });

    // Wait for folder to appear in UI (the /test page shows the main UI)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await page.waitForSelector('text=Share Test Folder', { timeout: 5000 });
  });

  // Helper to open share dialog - clicks the "..." menu button then "Share"
  async function openShareDialog(page: any) {
    // Find the folder text and hover to reveal menu
    const folderText = page.locator('text=Share Test Folder').first();
    await folderText.hover();

    // Find the parent row with class "group" and click the menu button
    const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
    const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
    await menuButton.click();

    // Click Share in the dropdown
    await page.getByRole('menuitem', { name: 'Share' }).click();
  }

  test('should open share dialog from folder menu', async ({ page }) => {
    await openShareDialog(page);

    // Verify dialog opens - look for the dialog title
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Share.*Share Test Folder/i })).toBeVisible();
  });

  test('should display collaborators list in share dialog', async ({ page }) => {
    await openShareDialog(page);

    // Wait for dialog and loading to complete
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('text=Collaborators (2)', { timeout: 10000 });

    // Verify collaborators are shown
    await expect(page.locator('text=Owner User')).toBeVisible();
    await expect(page.locator('text=owner@example.com')).toBeVisible();
    await expect(page.locator('text=Editor User')).toBeVisible();
    await expect(page.locator('text=editor@example.com')).toBeVisible();
  });

  test('should display pending invites in share dialog', async ({ page }) => {
    await openShareDialog(page);

    // Wait for dialog and loading to complete
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForSelector('text=Pending Invites (2)', { timeout: 10000 });

    // Verify pending invites are shown
    await expect(page.locator('text=pending1@example.com')).toBeVisible();
    await expect(page.locator('text=pending2@example.com')).toBeVisible();
  });

  test('should have disabled Get Link button when email is empty', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Find Get Link button and verify it's disabled
    const getLinkButton = page.getByRole('button', { name: 'Get Link' });
    await expect(getLinkButton).toBeDisabled();
  });

  test('should enable Get Link button when valid email is entered', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter email
    await page.locator('input#email').fill('newuser@example.com');

    // Get Link button should be enabled
    const getLinkButton = page.getByRole('button', { name: 'Get Link' });
    await expect(getLinkButton).toBeEnabled();
  });

  test('should generate invite link when clicking Get Link', async ({ page }) => {
    // Mock the invite creation endpoint
    await page.route('**/api/shares/invite', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'new-invite-token-123',
          shareUrl: 'http://localhost:5173/invite/new-invite-token-123',
          agentAccountId: null, // No agent - simplifies test
        }),
      });
    });

    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter email and click Get Link
    await page.locator('input#email').fill('newuser@example.com');
    await page.getByRole('button', { name: 'Get Link' }).click();

    // Verify success message and link display
    await expect(page.locator('text=Invite link generated!')).toBeVisible();
    await expect(page.locator('input[value*="/invite/new-invite-token-123"]')).toBeVisible();
  });

  test('should show error when invite generation fails', async ({ page }) => {
    // Mock the invite creation endpoint to fail
    await page.route('**/api/shares/invite', (route) => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'forbidden',
          message: 'You do not have permission to share this folder',
        }),
      });
    });

    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Wait for loading to complete
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 5000 }).catch(() => {});

    // Enter email and click Get Link
    await page.locator('input#email').fill('newuser@example.com');
    await page.getByRole('button', { name: 'Get Link' }).click();

    // Verify error message (with longer timeout to allow for API call)
    await expect(page.locator('text=You do not have permission to share this folder')).toBeVisible({ timeout: 10000 });
  });

  test('should have permission dropdown with reader/writer/admin options', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Find permission dropdown
    const permissionSelect = page.locator('select#permission');
    await expect(permissionSelect).toBeVisible();

    // Verify options exist (using Jazz native role names)
    await expect(permissionSelect.locator('option[value="reader"]')).toHaveText('Reader');
    await expect(permissionSelect.locator('option[value="writer"]')).toHaveText('Writer');
    await expect(permissionSelect.locator('option[value="admin"]')).toHaveText('Admin');
  });

  test('should have expiration dropdown with day options', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Find expiration dropdown
    const expirationSelect = page.locator('select#expiration');
    await expect(expirationSelect).toBeVisible();

    // Verify options exist
    await expect(expirationSelect.locator('option[value="1"]')).toHaveText('1 day');
    await expect(expirationSelect.locator('option[value="7"]')).toHaveText('7 days');
    await expect(expirationSelect.locator('option[value="30"]')).toHaveText('30 days');
    await expect(expirationSelect.locator('option[value="90"]')).toHaveText('90 days');
  });

  test('should close dialog when clicking Done', async ({ page }) => {
    await openShareDialog(page);

    // Verify dialog is open
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Done
    await page.getByRole('button', { name: 'Done' }).click();

    // Verify dialog is closed
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

test.describe('Invite Accept Page UI', () => {
  test('should show loading state initially', async ({ page }) => {
    // Delay the API response significantly to ensure loading state is visible
    await page.route('**/api/shares/validate/*', async (route) => {
      await new Promise(r => setTimeout(r, 2000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true, senderEmail: 'sender@example.com', recipientEmail: 'recipient@example.com', permission: 'writer' }),
      });
    });

    await page.goto('/invite/test-token-123');

    // Should show loading state - use a short timeout since we expect it to appear quickly
    await expect(page.locator('text=Loading invite...')).toBeVisible({ timeout: 3000 });
  });

  test('should show error for invalid token', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: false, error: 'not_found' }),
      });
    });

    await page.goto('/invite/invalid-token');

    // Should show error state
    await expect(page.locator('text=Invite Error')).toBeVisible();
    await expect(page.locator('text=This invite link is invalid or has been revoked.')).toBeVisible();
  });

  test('should show error for expired token', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: false, error: 'expired' }),
      });
    });

    await page.goto('/invite/expired-token');

    // Should show expired error
    await expect(page.locator('text=Invite Error')).toBeVisible();
    await expect(page.locator('text=This invite link has expired.')).toBeVisible();
  });

  test('should show invite details for unauthenticated user', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          senderEmail: 'alice@example.com',
          recipientEmail: 'bob@example.com',
          permission: 'writer',
        }),
      });
    });

    await page.goto('/invite/valid-token');

    // Should show invite details
    await expect(page.locator('text=Folder Invitation')).toBeVisible();
    await expect(page.locator('text=alice@example.com has invited you to collaborate')).toBeVisible();
    await expect(page.locator('text=Writer')).toBeVisible();

    // Should show accept/decline buttons
    await expect(page.locator('button:has-text("Accept Invite")')).toBeVisible();
    await expect(page.locator('button:has-text("Decline")')).toBeVisible();
  });

  test('should show sign-in options after clicking Accept for unauthenticated user', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          senderEmail: 'alice@example.com',
          recipientEmail: 'bob@example.com',
          permission: 'reader',
        }),
      });
    });

    await page.goto('/invite/valid-token');

    // Click Accept Invite
    await page.click('button:has-text("Accept Invite")');

    // Should show sign-in options
    await expect(page.locator('text=Sign In to Continue')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with Apple')).toBeVisible();
  });

  test('should show reader permission description', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          senderEmail: 'sender@example.com',
          recipientEmail: 'recipient@example.com',
          permission: 'reader',
        }),
      });
    });

    await page.goto('/invite/reader-token');

    await expect(page.locator('text=Reader')).toBeVisible();
    await expect(page.locator('text=You can view items in this folder')).toBeVisible();
  });

  test('should show writer permission description', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          senderEmail: 'sender@example.com',
          recipientEmail: 'recipient@example.com',
          permission: 'writer',
        }),
      });
    });

    await page.goto('/invite/writer-token');

    await expect(page.locator('text=Writer')).toBeVisible();
    await expect(page.locator('text=You can view and modify items in this folder')).toBeVisible();
  });

  test('should show admin permission description', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          senderEmail: 'sender@example.com',
          recipientEmail: 'recipient@example.com',
          permission: 'admin',
        }),
      });
    });

    await page.goto('/invite/admin-token');

    await expect(page.locator('text=Admin')).toBeVisible();
    await expect(page.locator('text=You have full control including sharing permissions')).toBeVisible();
  });

  test('should have Go to Dashboard button on error page', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: false, error: 'not_found' }),
      });
    });

    await page.goto('/invite/invalid-token');

    // Should have dashboard button
    const dashboardButton = page.locator('button:has-text("Go to Dashboard")');
    await expect(dashboardButton).toBeVisible();
  });

  test('should navigate to dashboard when clicking Decline', async ({ page }) => {
    await page.route('**/api/shares/validate/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          senderEmail: 'sender@example.com',
          recipientEmail: 'recipient@example.com',
          permission: 'writer',
        }),
      });
    });

    await page.goto('/invite/valid-token');

    // Click Decline
    await page.click('button:has-text("Decline")');

    // Should navigate to dashboard
    await page.waitForURL('/');
  });
});

test.describe('Share Dialog - Empty States', () => {
  test('should show empty collaborators message', async ({ page }) => {
    // Mock empty collaborators
    await page.route('**/api/shares/targets/*/collaborators', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ collaborators: [] }),
      });
    });

    await page.route('**/api/shares/targets/*/invites', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invites: [] }),
      });
    });

    // Create folder and open share dialog
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, { timeout: 10000 });
    await page.evaluate(() => window.__testServices!.directory.create('Empty Share Folder', true));

    // Wait for folder to appear
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await page.waitForSelector('text=Empty Share Folder', { timeout: 5000 });

    // Open the share dialog using the menu
    const folderText = page.locator('text=Empty Share Folder').first();
    await folderText.hover();

    // Find and click the menu button near this folder
    const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
    const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
    await menuButton.click();

    // Click Share in the dropdown
    await page.getByRole('menuitem', { name: 'Share' }).click();

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible();

    // Wait for loading to complete (spinner to disappear)
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 5000 }).catch(() => {});

    // Verify empty states
    await expect(page.locator('text=Collaborators (0)')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=No collaborators yet')).toBeVisible();
    await expect(page.locator('text=Pending Invites (0)')).toBeVisible();
    await expect(page.locator('text=No pending invites')).toBeVisible();
  });
});
