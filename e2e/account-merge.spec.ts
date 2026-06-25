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
 * Account merge is DESTRUCTIVE: finalize permanently repoints A's login at B's
 * Jazz account, so the same pair can only be merged once. We therefore provision
 * FRESH, unique accounts on every run (sign up -> verify via GreenMail IMAP),
 * exactly like the invite suite provisions accounts — never reusing the shared
 * test1/test2 accounts, which a prior merge would have fused.
 *
 * Requires GreenMail mail infra (same as the invite closed-loop suite). When
 * IMAP_HOST is absent the `merge` project self-excludes from playwright.config.
 *
 * Run on the gpu (GreenMail is local):
 *   SMTP_HOST=127.0.0.1 SMTP_PORT=3025 SMTP_USER=greenmail SMTP_PASS=greenmail \
 *   IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USERNAME=greenmail IMAP_PASSWORD=greenmail \
 *   IMAP_PER_RECIPIENT=1 npm run test:e2e:merge
 */

import { type Browser, expect, test } from '@playwright/test';
import {
  isSignedIn,
  loginTestUser,
  signUpTestUser,
  TEST_PASSWORD_EXPORT,
  uniqueTestEmail,
  verifyTestUserEmail,
  waitForHomeReady,
} from './helpers/auth-helper';
import { assertFolderVisibleWithReload, createFolder } from './helpers/invite-helper';
import { uniqueFolderName } from './helpers/folder-name';

// Fresh, unique accounts per run so the destructive merge never poisons reruns.
const PASSWORD = TEST_PASSWORD_EXPORT;
const A_EMAIL = uniqueTestEmail('merge-a');
const B_EMAIL = uniqueTestEmail('merge-b');

// Folders — one per account, both must appear in B's tree after merge.
const FOLDER_A = uniqueFolderName('Merge-A Folder');
const FOLDER_B = uniqueFolderName('Merge-B Folder');

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

/** Sign up + verify a fresh account in its own context, then discard the page. */
async function provisionAccount(browser: Browser, email: string, name: string): Promise<void> {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  try {
    await signUpTestUser(page, email, PASSWORD, name);
    await verifyTestUserEmail(page, email);
  } finally {
    await ctx.close();
  }
}

test.beforeAll(async ({ browser }) => {
  // Provision both throwaway accounts (serial — GreenMail per-recipient mailbox).
  await provisionAccount(browser, A_EMAIL, 'Merge Source A');
  await provisionAccount(browser, B_EMAIL, 'Merge Target B');
});

test.describe('Account merge closed loop', () => {
  test('A (source) creates a folder', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await loginTestUser(page, A_EMAIL, PASSWORD);
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
    // Fresh context with no stored session — we drive all sign-ins manually so
    // localStorage is preserved across the sign-out/sign-in transitions.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));

    try {
      // --- Phase 1: Sign in as B, create B's folder --------------------------
      await loginTestUser(page, B_EMAIL, PASSWORD);
      await expect(async () => {
        expect(await isSignedIn(page)).toBe(true);
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
      await expect(page.getByRole('heading', { name: /combine another account/i })).toBeVisible({
        timeout: 20000,
      });

      // --- Phase 3: Click "Combine another account" → flow starts merge -------
      // Calls startMerge(), saves state to localStorage, signs out B, then
      // renders the "Sign in as the other account" screen.
      await page.getByTestId('merge-start').click();
      await expect(page.getByRole('heading', { name: /sign in as the other account/i })).toBeVisible(
        { timeout: 30000 },
      );

      // --- Phase 4: Sign in as A (source account) ----------------------------
      await page.getByTestId('merge-login-email').fill(A_EMAIL);
      await page.getByTestId('merge-login-password').fill(PASSWORD);
      await page.getByTestId('merge-login-submit').click();

      // A signs in → flow runs shareTopLevelFoldersTo + prepareMerge, signs A
      // out, shows the "Sign back into your main account" screen.
      await expect(
        page.getByRole('heading', { name: /sign back into your main account/i }),
      ).toBeVisible({ timeout: 60000 });

      // --- Phase 5: Sign in as B (target account) ----------------------------
      await page.getByTestId('merge-login-email').fill(B_EMAIL);
      await page.getByTestId('merge-login-password').fill(PASSWORD);
      await page.getByTestId('merge-login-submit').click();

      // B signs in → flow verifies identity, adoptFolders, finalizeMerge.
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
   * A fresh login with A's (source) credentials now opens B's (target) Jazz
   * account. finalizeMerge repointed A's BetterAuth user at B's accountID +
   * encryptedCredentials, so signing in as A must land on the merged data —
   * both FOLDER_A and FOLDER_B visible.
   */
  test('A signs in fresh and lands on the merged (target) data', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await loginTestUser(page, A_EMAIL, PASSWORD);
      await waitForHomeReady(page);
      // A's login now resolves to B's Jazz account, which owns both folders.
      await assertFolderVisibleWithReload(page, FOLDER_B);
      await assertFolderVisibleWithReload(page, FOLDER_A);
    } finally {
      await ctx.close();
    }
  });
});
