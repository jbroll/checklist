/**
 * Authed folders e2e — distinct from smoke.spec.ts's anonymous-mode smoke: this signs up a
 * real email/password account (via CHECKLIST_TEST_AUTH, see e2e/helpers/rowboat-auth.ts),
 * creates a folder as that authenticated user, reloads, and asserts the folder persisted —
 * i.e. it round-tripped through the rowboat backend (server-synced), not just localStorage.
 *
 * Since the C+D cutover that round-trip is CROSS-ORIGIN: the browser mints its scope group at
 * hosted rowboat's <base>/groups and syncs to <base>/{sync,pull} under a Bearer JWT, with the
 * CheckList backend serving no data plane at all. The assertions at the end are what make this a
 * cutover test rather than a persistence test — a regression that quietly re-homed sync on
 * CheckList's own origin would still persist the folder, and would still pass without them.
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
  const syncRequests: { url: string; hasBearer: boolean }[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/sync')) {
      syncRequests.push({
        url: r.url(),
        hasBearer: (r.headers().authorization ?? '').startsWith('Bearer '),
      });
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

  // The cutover assertion: sync left CheckList's origin for rowboat's, carrying a Bearer JWT.
  expect(syncRequests.length).toBeGreaterThan(0);
  expect(syncRequests.every((r) => r.hasBearer)).toBe(true);
  expect(syncRequests.every((r) => r.url.includes('/db/'))).toBe(true);
  expect(syncRequests.some((r) => r.url.startsWith('http://localhost:3020/'))).toBe(true);
});
