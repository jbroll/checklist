/**
 * E2E Tests for Sharing UI
 *
 * "Share Dialog UI" / "Share Dialog - Empty States": FolderNodeView's per-folder row menu now has
 * a "Share" item (src/components/tree/FolderNodeView.tsx) that opens `ShareDialog`
 * (src/components/sharing/ShareDialog.tsx, pre-existing + unit-tested, works against rowboat's
 * `useSharing`). These tests are un-skipped, seeded via `window.__testServices` (the
 * `window.testExports` alias — see src/services/testHelpers.ts), with two stale-selector/copy
 * fixes made against the real component (not guessed): the recipient `<Input>` is `type="text"`
 * (not `type="email"`), and the empty-state copy doesn't match what `ShareDialog` actually renders
 * for zero collaborators/invites (no "(0)" suffix, and the "Pending Invites" section is omitted
 * entirely when there are no invites, not shown with a "No pending invites" message) — both fixed
 * to match the real markup.
 *
 * "Invite Accept Page UI" is rewritten for rowboat's model (see the describe block's own header):
 * the ported InviteAcceptPage is CLIENT-GATED (anon → "Sign In to Continue", never validates) and
 * rowboat's validate collapses every failure to `{ valid: false }` (no-leak design), returning
 * `{ valid: true, inviterEmail, role }` on success. The tests authenticate via the
 * CHECKLIST_TEST_AUTH signup path (rowboat-auth.ts) and mock validate in that shape.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/base';
import { signUpAndSignIn, uniqueAuthedEmail } from './helpers/rowboat-auth';

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

    // Verify collaborators are shown. ShareDialog renders `name ?? email ?? accountId`
    // per collaborator (the name wins when present), so assert the names — the emails
    // are only surfaced for nameless collaborators.
    await expect(page.locator('text=Owner User')).toBeVisible();
    await expect(page.locator('text=Editor User')).toBeVisible();
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

  test('should have disabled delivery buttons when email is empty', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Both delivery actions are visible but disabled until a recipient is entered.
    // Headless Chromium has no Web Share, so the primary button is "Email invite".
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Email invite' })).toBeDisabled();
  });

  test('should enable delivery buttons when valid email is entered', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter email
    await page.getByRole('dialog').getByPlaceholder('colleague@example.com').fill('newuser@example.com');

    // Delivery buttons should be enabled
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Email invite' })).toBeEnabled();
  });

  test('should generate invite link when clicking Email invite', async ({ page }) => {
    // Mock the invite creation endpoint
    await page.route('**/api/shares/invite', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'new-invite-token-123',
          shareUrl: 'http://localhost:5173/invite/new-invite-token-123',
          agentAccountId: null, // No agent - simplifies test
          emailSent: true, // useSharing's CreateInviteResult trusts this verbatim from the response
        }),
      });
    });

    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Enter email and click Email invite (desktop primary action)
    await page.getByRole('dialog').getByPlaceholder('colleague@example.com').fill('newuser@example.com');
    await page.getByRole('button', { name: 'Email invite' }).click();

    // Verify confirmation message and link display
    await expect(page.locator('text=Invite emailed to newuser@example.com')).toBeVisible();
    await expect(page.locator('input[value*="/invite/new-invite-token-123"]')).toBeVisible();
  });

  test('should show error when invite generation fails', async ({ page }) => {
    // Mock the invite creation endpoint to fail
    await page.route('**/api/shares/invite', (route) => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        // useSharing surfaces the response's `error` field as the thrown Error.message,
        // which ShareDialog renders as the form error — put the human sentence there
        // (rowboat's error contract, not Jazz's `{error, message}` split).
        body: JSON.stringify({
          error: 'You do not have permission to share this folder',
        }),
      });
    });

    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Wait for loading to complete
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 5000 }).catch(() => {});

    // Enter email and click Email invite (desktop primary action)
    await page.getByRole('dialog').getByPlaceholder('colleague@example.com').fill('newuser@example.com');
    await page.getByRole('button', { name: 'Email invite' }).click();

    // Verify error message (with longer timeout to allow for API call)
    await expect(page.locator('text=You do not have permission to share this folder')).toBeVisible({ timeout: 10000 });
  });

  test('should have permission dropdown with reader/writer/admin options', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Find permission dropdown (id is a React useId() value; locate by label)
    const permissionSelect = page.getByLabel('Permission');
    await expect(permissionSelect).toBeVisible();

    // Verify options exist (using Jazz native role names)
    await expect(permissionSelect.locator('option[value="reader"]')).toHaveText('Reader');
    await expect(permissionSelect.locator('option[value="writer"]')).toHaveText('Writer');
    await expect(permissionSelect.locator('option[value="admin"]')).toHaveText('Admin');
  });

  test('should have expiration dropdown with day options', async ({ page }) => {
    await openShareDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Find expiration dropdown (aria-label="Expires")
    const expirationSelect = page.getByLabel('Expires');
    await expect(expirationSelect).toBeVisible();

    // Verify options exist (expirations=[1,7,14,30])
    await expect(expirationSelect.locator('option[value="1"]')).toHaveText('1 day');
    await expect(expirationSelect.locator('option[value="7"]')).toHaveText('7 days');
    await expect(expirationSelect.locator('option[value="14"]')).toHaveText('14 days');
    await expect(expirationSelect.locator('option[value="30"]')).toHaveText('30 days');
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
  // The ported InviteAcceptPage is CLIENT-GATED and reads through rowboat's `useSharing`:
  //  - An anonymous visitor sees "Sign In to Continue" and validate is NEVER called, so nothing
  //    about the invite is disclosed.
  //  - Only an authenticated user validates. rowboat's server deliberately collapses every
  //    validate failure (invalid / revoked / expired / not-yours) to `{ valid: false }` — a
  //    no-leak-to-non-owners design — and returns `{ valid: true, inviterEmail, role }` on success.
  //    Email-mismatch is surfaced only at ACCEPT time (a 403), never from validate.
  // So these tests authenticate via the CHECKLIST_TEST_AUTH signup path (rowboat-auth.ts) and mock
  // validate in rowboat's shape. They assert rowboat's (coarser, more private) behavior, not the
  // Jazz per-error-code screens the originals encoded.

  const PASSWORD = 'Checklist-Invite-Test-2026!';

  function authenticate(page: Page, prefix: string): Promise<void> {
    return signUpAndSignIn(page, {
      email: uniqueAuthedEmail(prefix),
      password: PASSWORD,
      name: 'Invite Tester',
    });
  }

  function mockValidate(page: Page, body: Record<string, unknown>): Promise<void> {
    return page.route('**/api/shares/validate/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
    );
  }

  test('shows the sign-in gate (and no invite details) to an unauthenticated visitor', async ({
    page,
  }) => {
    // Anonymous: the page shows the sign-in prompt WITHOUT calling validate, so nothing about the
    // invite (sender, role, or even that the token resolves) is disclosed.
    await page.goto('/invite/some-token');

    await expect(page.locator('text=Sign In to Continue')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with Apple')).toBeVisible();

    await expect(page.locator('text=Folder Invitation')).toHaveCount(0);
    await expect(page.locator('text=has invited you to collaborate')).toHaveCount(0);
    await expect(page.locator('button:has-text("Accept Invite")')).toHaveCount(0);
  });

  test('shows the loading state while validating', async ({ page }) => {
    await authenticate(page, 'invite-loading');
    await page.route('**/api/shares/validate/*', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ valid: true, inviterEmail: 'sender@example.com', role: 'writer' }),
      });
    });

    await page.goto('/invite/loading-token');

    await expect(page.locator('text=Loading invite...')).toBeVisible({ timeout: 3000 });
  });

  test('shows invite details for a valid invite', async ({ page }) => {
    await authenticate(page, 'invite-valid');
    await mockValidate(page, { valid: true, inviterEmail: 'alice@example.com', role: 'writer' });

    await page.goto('/invite/valid-token');

    await expect(page.locator('text=Folder Invitation')).toBeVisible();
    await expect(
      page.locator('text=alice@example.com has invited you to collaborate'),
    ).toBeVisible();
    await expect(page.locator('text=Writer')).toBeVisible();
    await expect(page.locator('button:has-text("Accept Invite")')).toBeVisible();
    await expect(page.locator('button:has-text("Decline")')).toBeVisible();
  });

  test('shows a generic error for an invalid, revoked, or expired invite', async ({ page }) => {
    // rowboat's validate returns `{ valid: false }` for ANY unusable token, so there is one
    // generic message — the Jazz per-code copy ("invalid or revoked" / "has expired") is gone.
    await authenticate(page, 'invite-invalid');
    await mockValidate(page, { valid: false });

    await page.goto('/invite/invalid-token');

    await expect(page.locator('text=Invite Error')).toBeVisible();
    await expect(page.locator('text=This invite link is no longer valid.')).toBeVisible();
  });

  test('does not disclose the invite to an authenticated non-recipient', async ({ page }) => {
    // A signed-in user who is not the recipient gets `{ valid: false }` (no sender/role leaked),
    // rendering the generic error screen — never the sender or invite details.
    await authenticate(page, 'invite-nonrecipient');
    await mockValidate(page, { valid: false });

    await page.goto('/invite/not-yours-token');

    await expect(page.locator('text=Invite Error')).toBeVisible();
    await expect(page.locator('text=has invited you to collaborate')).toHaveCount(0);
    await expect(page.locator('text=Folder Invitation')).toHaveCount(0);
    await expect(page.locator('button:has-text("Accept Invite")')).toHaveCount(0);
  });

  for (const { role, label, description } of [
    { role: 'reader', label: 'Reader', description: 'You can view items in this folder' },
    {
      role: 'writer',
      label: 'Writer',
      description: 'You can view and modify items in this folder',
    },
    {
      role: 'admin',
      label: 'Admin',
      description: 'You have full control including sharing permissions',
    },
  ]) {
    test(`shows the ${role} permission description`, async ({ page }) => {
      await authenticate(page, `invite-${role}`);
      await mockValidate(page, { valid: true, inviterEmail: 'sender@example.com', role });

      await page.goto(`/invite/${role}-token`);

      await expect(page.locator(`text=${label}`).first()).toBeVisible();
      await expect(page.locator(`text=${description}`)).toBeVisible();
    });
  }

  test('shows the Go to Dashboard button on the error page', async ({ page }) => {
    await authenticate(page, 'invite-error-dash');
    await mockValidate(page, { valid: false });

    await page.goto('/invite/invalid-token');

    await expect(page.locator('button:has-text("Go to Dashboard")')).toBeVisible();
  });

  test('navigates to the dashboard when clicking Decline', async ({ page }) => {
    await authenticate(page, 'invite-decline');
    await mockValidate(page, { valid: true, inviterEmail: 'sender@example.com', role: 'writer' });

    await page.goto('/invite/valid-token');
    await page.click('button:has-text("Decline")');

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

    // Verify empty states. ShareDialog only appends "(N)" to the "Collaborators" heading when
    // N > 0 (`collaborators.length > 0 && \`(${collaborators.length})\``), so the zero case
    // renders the bare word. The "Pending Invites" section is gated the same way but on the
    // OUTER block, so at zero invites the whole section — heading and any "no invites" copy — is
    // absent from the DOM entirely (there is no "No pending invites" message to show).
    await expect(page.getByText('Collaborators', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=No collaborators yet')).toBeVisible();
    await expect(page.getByText(/Pending Invites/)).toHaveCount(0);
  });
});
