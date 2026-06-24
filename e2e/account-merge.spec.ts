/**
 * Real closed-loop account-merge E2E (two real authenticated accounts + real
 * backend + real Jazz). Account B (target/main) absorbs Account A (source)
 * through the "Combine another account" flow in settings.
 *
 * Scope: FULL two-login closed-loop merge.
 *   - A and B each have a unique folder created before the merge.
 *   - B drives /?merge=start → entry → starts merge → signs out.
 *   - A signs in, shares folders → prepares merge → signs out.
 *   - B signs back in → adopts A's folders → finalize → success screen.
 *   - Assert B's tree shows BOTH folders.
 *   - Finally, sign in with A's credentials in a fresh context and assert it now
 *     lands on B's (merged) data — proving the source login repoints at the
 *     target Jazz account.
 *
 * Requires the auth-setup project (e2e/.auth/test{1,2}.json) + GreenMail mail
 * infra (same as the invite closed-loop suite). When IMAP_HOST is absent the
 * project self-excludes from playwright.config.ts.
 *
 * Run on the gpu (GreenMail is local):
 *   SMTP_HOST=127.0.0.1 SMTP_PORT=3025 SMTP_USER=greenmail SMTP_PASS=greenmail \
 *   IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USERNAME=greenmail IMAP_PASSWORD=greenmail \
 *   IMAP_PER_RECIPIENT=1 npm run test:e2e:merge
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { TEST_ACCOUNTS, loginTestUser, waitForHomeReady } from './helpers/auth-helper';
import {
  archiveFolder,
  assertFolderVisibleWithReload,
  createFolder,
} from './helpers/invite-helper';
import { uniqueFolderName } from './helpers/folder-name';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.auth');

// Folders — one per account, both must appear in B's tree after merge.
const FOLDER_A = uniqueFolderName('Merge-A Folder');
const FOLDER_B = uniqueFolderName('Merge-B Folder');

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

// Cleanup: archive both folders from B's perspective (post-merge B owns both).
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test2.json') });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await waitForHomeReady(page);
    await archiveFolder(page, FOLDER_A);
    await archiveFolder(page, FOLDER_B);
  } catch {
    // best-effort cleanup
  } finally {
    await ctx.close();
  }
});

test.describe('Account merge closed loop', () => {
  /**
   * Step 1: Account A (test1) creates its folder and saves the session.
   * Step 2: Account B (test2) creates its folder, then starts the merge flow.
   * Steps 3-5: Drive the merge through three sign-in transitions in a single
   * persistent browser context that retains localStorage across navigations.
   */

  test('A (source) creates a folder', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test1.json') });
    const page = await ctx.newPage();
    try {
      await page.goto('/');
      await waitForHomeReady(page);
      await createFolder(page, FOLDER_A);
      // Let FOLDER_A fully sync to the server before closing this context, so the
      // later share step (run as A) can find and re-share it.
      await page.waitForTimeout(4000);
    } finally {
      await ctx.close();
    }
  });

  test('B (target) creates a folder, starts merge, signs in as A, completes merge, sees both folders', async ({
    browser,
  }) => {
    // Use a fresh context with no stored session — we drive all sign-ins manually
    // so localStorage is preserved across the sign-out/sign-in transitions.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();

    try {
      // --- Phase 1: Sign in as B, create B's folder --------------------------
      await loginTestUser(page, TEST_ACCOUNTS.recipient.email, TEST_ACCOUNTS.recipient.password);
      await expect(async () => {
        const signedIn = await page
          .getByRole('heading', { name: /^checklist$/i })
          .first()
          .isVisible()
          .catch(() => false);
        expect(signedIn).toBe(true);
      }).toPass({ timeout: 30000 });
      await waitForHomeReady(page);
      await createFolder(page, FOLDER_B);
      // Let FOLDER_B fully sync to the server before the merge signs B out — a
      // CoValue created moments before signOut may not have reached the sync
      // server, and B's post-merge cold-load would then miss it.
      await page.waitForTimeout(4000);

      // --- Phase 2: Navigate to merge entry page -----------------------------
      // /?merge=start triggers MergeAccountFlow with no localStorage state → 'entry'
      await page.goto('/?merge=start');
      await page.waitForLoadState('networkidle');
      // Wait for the entry state: "Combine Another Account" heading
      await expect(page.getByRole('heading', { name: /combine another account/i })).toBeVisible({
        timeout: 20000,
      });

      // --- Phase 3: Click "Combine another account" → flow starts merge -------
      // This calls startMerge(), saves state to localStorage, signs out B,
      // then renders the "Sign in as the other account" screen.
      await page.getByTestId('merge-start').click();
      // After signOut the page may reload. Wait for the awaiting-source-login UI.
      await expect(page.getByRole('heading', { name: /sign in as the other account/i })).toBeVisible(
        { timeout: 30000 },
      );

      // --- Phase 4: Sign in as A (source account) ----------------------------
      // Fill the email+password form in the MergeAccountFlow to sign in as A.
      // The form uses MergeAccountFlow's own inline inputs (not SignInDialog).
      await page.getByTestId('merge-login-email').fill(TEST_ACCOUNTS.organizer.email);
      await page.getByTestId('merge-login-password').fill(TEST_ACCOUNTS.organizer.password);
      await page.getByTestId('merge-login-submit').click();

      // After A signs in, the flow processes: shareTopLevelFoldersTo + prepareMerge,
      // then signs A out and shows the "Sign back into your main account" screen.
      await expect(
        page.getByRole('heading', { name: /sign back into your main account/i }),
      ).toBeVisible({ timeout: 60000 });

      // --- Phase 5: Sign in as B (target account) ----------------------------
      await page.getByTestId('merge-login-email').fill(TEST_ACCOUNTS.recipient.email);
      await page.getByTestId('merge-login-password').fill(TEST_ACCOUNTS.recipient.password);
      await page.getByTestId('merge-login-submit').click();

      // After B signs in, the flow verifies identity, adoptFolders, finalizeMerge.
      await expect(page.getByRole('heading', { name: /merge complete/i })).toBeVisible({
        timeout: 60000,
      });

      // --- Phase 6: Navigate home and assert both folders are visible ---------
      await page.getByRole('link', { name: /go to app/i }).click();
      await page.waitForURL('/', { timeout: 15000 });
      await waitForHomeReady(page);

      // Both B's original folder AND A's adopted folder must appear in B's tree.
      // Reload-retry absorbs Jazz adoption sync lag.
      await assertFolderVisibleWithReload(page, FOLDER_B);
      await assertFolderVisibleWithReload(page, FOLDER_A);
    } finally {
      await ctx.close();
    }
  });

  /**
   * Step 5: a fresh login with A's (source) credentials now opens B's (target)
   * Jazz account. finalizeMerge repointed A's BetterAuth user at B's accountID +
   * encryptedCredentials, so signing in as A must land on the merged data —
   * both FOLDER_A and FOLDER_B visible.
   */
  test('A signs in fresh and lands on the merged (target) data', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await loginTestUser(page, TEST_ACCOUNTS.organizer.email, TEST_ACCOUNTS.organizer.password);
      await waitForHomeReady(page);
      // A's login now resolves to B's Jazz account, which owns both folders.
      await assertFolderVisibleWithReload(page, FOLDER_B);
      await assertFolderVisibleWithReload(page, FOLDER_A);
    } finally {
      await ctx.close();
    }
  });
});
