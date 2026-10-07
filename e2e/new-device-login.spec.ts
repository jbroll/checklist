/**
 * New-device login e2e — duplicate default-seed regression test.
 *
 * Reproduces the "second Quick Errands on every new-device login" report: device 1 signs
 * up (genuinely-new user gets exactly one seeded "Quick Errands" list); device 2 is a
 * fresh browser context (no storage — a new device), starts anonymous, then signs into
 * the SAME account. Expected: device 2 never seeds while anonymous, and after login the
 * account shows exactly one "Quick Errands" — the claim plus the post-login server pull
 * must not mint a second copy.
 *
 * Uses real email/password auth (CHECKLIST_TEST_AUTH=1, see e2e/helpers/rowboat-auth.ts):
 * signup on device 1, signin (same credentials) on device 2.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  openEmailSignInForm,
  signUpAndSignIn,
  uniqueAuthedEmail,
  waitForAuthedShell,
} from './helpers/rowboat-auth';

/** Sign into an EXISTING email/password account through the real UI. */
async function signInWithEmail(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openEmailSignInForm(page);
  await page.locator('#signin-email').fill(creds.email);
  await page.locator('#signin-password').fill(creds.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // Same no-reload rule as signup (see signUpAndSignIn): the session hook swaps the
  // tree reactively; reloading mid-transition wedges Dexie for the page's lifetime.
  await waitForAuthedShell(page);
}

test('second-device login keeps exactly one seeded Quick Errands list', async ({
  page,
  browser,
}) => {
  // Two sign-ins plus the settle wait run close to the default 30s under a full parallel suite.
  test.slow();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()))
      console.log('[console]', m.type(), m.text().slice(0, 500));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 500)));
  const email = uniqueAuthedEmail('new-device-login');
  const password = 'Checklist-New-Device-2026!';

  // Device 1: fresh signup. Genuinely-new user → exactly one seeded list.
  await signUpAndSignIn(page, { email, password, name: 'Device One' });
  await expect(page.getByText('Quick Errands')).toHaveCount(1, { timeout: 30000 });

  // Device 2: a brand-new browser context (no storage) = a new device.
  const device2 = await browser.newContext();
  const page2 = await device2.newPage();
  try {
    await page2.goto('/');
    await page2.waitForLoadState('networkidle');
    // Anonymous on a new device: no seeded content (anon stores are never seeded).
    await expect(page2.getByText('Quick Errands')).toHaveCount(0, { timeout: 15000 });

    // Sign into the SAME account from device 2: anon-claim + server pull must converge
    // on the one existing list, not mint a second.
    await signInWithEmail(page2, { email, password });
    await expect(page2.getByText('Quick Errands')).toHaveCount(1, { timeout: 30000 });

    // Settle: the post-login pull and any deferred seeding have landed by now; a
    // second copy arriving late still fails the test.
    await page2.waitForTimeout(5000);
    expect(await page2.getByText('Quick Errands').count()).toBe(1);
  } finally {
    await device2.close();
  }

  // Device 1 is unaffected by device 2's login.
  expect(await page.getByText('Quick Errands').count()).toBe(1);
});
