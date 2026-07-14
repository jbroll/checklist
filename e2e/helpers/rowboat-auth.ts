/**
 * Rowboat-port auth helper — email/password signup+signin for e2e, independent of SMTP.
 *
 * Drives the app's real email/password UI (SignInDialog -> EmailAuthDialog, see
 * src/components/auth/{SignInDialog,EmailAuthDialog}.tsx). This only works because the
 * Playwright-launched dev server sets CHECKLIST_TEST_AUTH=1 (playwright.config.ts webServer.env),
 * which flips backend/src/index.ts's `requireEmailVerification` off for the test run: better-auth
 * then auto-signs-in on `signUp.email` (server sets the session cookie immediately — see
 * better-auth's sign-up route, `shouldSkipAutoSignIn = autoSignIn === false || requireEmailVerification`),
 * so no verification email round-trip (GreenMail/IMAP) is needed.
 *
 * The EmailAuthDialog's post-signup UI always shows a "Check Your Email" panel regardless of
 * whether verification is actually required (it only branches on `result.error`, not on
 * verification state) — cosmetic leftover from the always-verify pre-port flow. Since the
 * session cookie is already set at that point, this helper reloads the page rather than trying
 * to dismiss that panel, which deterministically picks up the authenticated session on the next
 * render (mirrors how EmailAuthDialog's own sign-in success path reloads).
 */
import type { Page } from '@playwright/test';

export interface SignUpCredentials {
  email: string;
  password: string;
  name?: string;
}

let emailCounter = 0;
/** Collision-safe email for a per-test, throwaway account (no mailbox needed — CHECKLIST_TEST_AUTH). */
export function uniqueAuthedEmail(prefix: string): string {
  emailCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${emailCounter}-${rand}@example.test`;
}

async function openEmailSignUpForm(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click({ timeout: 15000 });
  await page.getByRole('button', { name: /continue with email/i }).click({ timeout: 10000 });
  await page.getByRole('heading', { name: /sign in with email/i }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /create account/i }).click();
  await page.getByRole('heading', { name: /create account/i }).waitFor({ timeout: 5000 });
}

/**
 * Sign up a fresh email/password account through the real UI and land on the authenticated app
 * shell. Requires the backend to be running with CHECKLIST_TEST_AUTH=1 (no verification gate).
 */
export async function signUpAndSignIn(page: Page, creds: SignUpCredentials): Promise<void> {
  const { email, password, name } = creds;

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openEmailSignUpForm(page);

  await page.locator('#signup-name').fill(name ?? email.split('@')[0]);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(password);
  await page
    .getByRole('button', { name: /create account/i })
    .last()
    .click();

  // Sign-up already established the session server-side (autoSignIn, verification off).
  // Do NOT reload here: reloading while the client-side Dexie/rowboat store is mid-transition
  // from the anonymous local db to the authenticated one throws a permanent
  // Dexie `DatabaseClosedError` for the rest of the page's life (observed empirically — every
  // subsequent syncWithServer call fails). The app's own session hook is reactive: once
  // useSession() resolves, AuthGate swaps the anonymous tree (which includes this dialog) for
  // the authenticated shell on its own, so just wait for that.
  await waitForAuthedShell(page);
}

/**
 * True when the authenticated app shell is mounted: the app header is present AND the
 * "Sign In" button is absent (it only renders when unauthenticated). Polls with reload-retry
 * to absorb the post-signup reload and sync-loop cold start.
 */
export async function isAuthed(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const header = await page.getByRole('heading', { level: 1 }).first().isVisible().catch(() => false);
      if (header) {
        const signInVisible = await page
          .getByRole('button', { name: /sign in/i })
          .first()
          .isVisible()
          .catch(() => false);
        if (!signInVisible) return true;
      }
      await page.waitForTimeout(500);
    }
    await page.reload();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
  return false;
}

export async function waitForAuthedShell(page: Page): Promise<void> {
  if (await isAuthed(page)) return;
  throw new Error('Authenticated app shell not ready after reload retries');
}
