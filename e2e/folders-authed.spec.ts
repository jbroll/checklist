/**
 * Authed folders e2e — distinct from smoke.spec.ts's anonymous-mode smoke: this signs up a
 * real email/password account (via CHECKLIST_TEST_AUTH, see e2e/helpers/rowboat-auth.ts),
 * creates a folder as that authenticated user, reloads, and asserts the folder persisted —
 * i.e. it round-tripped through the rowboat backend (server-synced), not just localStorage.
 *
 * This exercises, in one pass: the root-group auto-provision at signup
 * (ensureUserRootGroup, called from createProvider on first authenticated request), the
 * folder-scope-group mint route (POST /api/folders/group), and scoped sync under a real
 * session (mountSyncRoutes' RBAC auth, not the anonymous path).
 */
import { expect, test } from '@playwright/test';
import { uniqueFolderName } from './helpers/folder-name';
import { createFolder } from './helpers/invite-helper';
import { signUpAndSignIn, uniqueAuthedEmail } from './helpers/rowboat-auth';

test('authed user creates a folder and it persists across reload', async ({ page }) => {
  page.on('console', async (m) => {
    const args = await Promise.all(
      m.args().map((a) => a.jsonValue().catch(() => '<unserializable>')),
    );
    console.log('[console]', m.type(), m.text(), JSON.stringify(args).slice(0, 1000));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
  page.on('response', async (r) => {
    if (r.url().includes('/api/')) {
      const status = r.status();
      let body = '';
      if (status >= 400) {
        body = await r.text().catch(() => '<no body>');
      }
      console.log('[response]', status, r.url(), body.slice(0, 2000));
    }
  });
  page.on('request', (r) => {
    if (r.url().includes('/api/sync')) {
      console.log('[request]', r.method(), r.url(), (r.postData() ?? '').slice(0, 2000));
    }
  });
  const email = uniqueAuthedEmail('folders-authed');
  const folderName = uniqueFolderName('Authed Folder');

  await signUpAndSignIn(page, { email, password: 'Checklist-Authed-Test-2026!', name: 'Authed Tester' });

  await createFolder(page, folderName);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(folderName).first()).toBeVisible({ timeout: 20000 });
});
