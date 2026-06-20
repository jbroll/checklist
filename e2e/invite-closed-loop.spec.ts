/**
 * Real closed-loop invite E2E (two real authenticated accounts + real backend +
 * real Jazz). Organizer (test1, default storageState) generates real invites;
 * the recipient (test2) and a third party (test3) exercise the accept page.
 *
 * Requires the auth-setup project (e2e/.auth/test*.json) + GreenMail mail infra.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { TEST_ACCOUNTS, waitForHomeReady } from './helpers/auth-helper';
import {
  archiveFolder,
  assertFolderVisible,
  createFolder,
  generateInvite,
  openShareDialog,
  revokeInvite,
} from './helpers/invite-helper';
import { uniqueFolderName } from './helpers/folder-name';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.auth');
const FOLDER = uniqueFolderName('Invite Test Folder');
const REVOKE_FOLDER = uniqueFolderName('Invite Revoke Folder');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let shareUrl: string | undefined;
let revokeUrl: string | undefined;

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test1.json') });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await waitForHomeReady(page);
    await archiveFolder(page, FOLDER);
    await archiveFolder(page, REVOKE_FOLDER);
  } catch {
    // best-effort cleanup
  } finally {
    await ctx.close();
  }
});

test.describe('Invite closed loop', () => {
  test('organizer creates a folder and generates a real invite', async ({ page }) => {
    await page.goto('/');
    await waitForHomeReady(page);
    await createFolder(page, FOLDER);
    await openShareDialog(page, FOLDER);
    shareUrl = await generateInvite(page, TEST_ACCOUNTS.recipient.email, 'writer');
    expect(shareUrl).toContain('/invite/');
  });

  test('recipient sees the real validated invite details', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test2.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      // Real backend validation + real recipient session -> the "valid" state.
      await expect(page.getByText(/has invited you to collaborate/i)).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByText(TEST_ACCOUNTS.organizer.email)).toBeVisible();
      await expect(page.getByRole('button', { name: /accept invite/i })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('unauthenticated visitor sees invite details + sign-in prompt', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    // Empty storage = truly signed out (a bare context would inherit test1's session).
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/has invited you to collaborate/i)).toBeVisible({
        timeout: 20000,
      });
      await page.getByRole('button', { name: /accept invite/i }).click();
      await expect(page.getByText(/sign in to continue/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/continue with google/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('wrong account (test3) sees the email-mismatch state', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test3.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/wrong account/i)).toBeVisible({ timeout: 20000 });
    } finally {
      await ctx.close();
    }
  });

  test('revoked invite shows an error to the recipient', async ({ page }) => {
    await page.goto('/');
    await waitForHomeReady(page);
    await createFolder(page, REVOKE_FOLDER);
    await openShareDialog(page, REVOKE_FOLDER);
    revokeUrl = await generateInvite(page, TEST_ACCOUNTS.recipient.email, 'reader');
    await revokeInvite(page, TEST_ACCOUNTS.recipient.email);

    const ctx = await page.context().browser()!.newContext({
      storageState: path.join(AUTH_DIR, 'test2.json'),
    });
    const rp = await ctx.newPage();
    try {
      await rp.goto(revokeUrl!);
      await rp.waitForLoadState('networkidle');
      await expect(rp.getByRole('heading', { name: /invite error/i })).toBeVisible({
        timeout: 20000,
      });
    } finally {
      await ctx.close();
    }
  });

  test('recipient accepts and gains folder access', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test2.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/has invited you to collaborate/i)).toBeVisible({
        timeout: 20000,
      });
      await page.getByRole('button', { name: /accept invite/i }).click();
      await expect(page.getByText(/access granted/i)).toBeVisible({ timeout: 20000 });
      await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
      await waitForHomeReady(page);
      await assertFolderVisible(page, FOLDER);
    } finally {
      await ctx.close();
    }
  });
});
