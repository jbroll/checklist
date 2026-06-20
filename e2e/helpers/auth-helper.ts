/**
 * Auth Helper — email/password test account signup, verification (via GreenMail
 * IMAP), and login for Playwright E2E invite tests.
 *
 * UI flow (src/components/AuthGate.tsx, SignInDialog.tsx, EmailAuthDialog.tsx):
 * the "Sign In" button opens SignInDialog (Google/Apple/Continue with Email);
 * "Continue with Email" opens EmailAuthDialog (signin mode) which links to
 * "Create account". After a successful sign-in the dialog reloads the page.
 */
import type { Page } from '@playwright/test';
import { extractVerificationLink, waitForEmail } from './imap-helper';

const TEST_PASSWORD = 'CheckList-Test-2026!';

export const TEST_ACCOUNTS = {
  organizer: {
    email: 'checklist-test1@checklist.rkroll.com',
    name: 'Test Organizer',
    password: TEST_PASSWORD,
  },
  recipient: {
    email: 'checklist-test2@checklist.rkroll.com',
    name: 'Test Recipient',
    password: TEST_PASSWORD,
  },
  thirdParty: {
    email: 'checklist-test3@checklist.rkroll.com',
    name: 'Test Third Party',
    password: TEST_PASSWORD,
  },
} as const;

export type TestAccountRole = keyof typeof TEST_ACCOUNTS;

/** Open SignInDialog, then the EmailAuthDialog (signin mode). */
async function openEmailAuthDialog(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click({ timeout: 15000 });
  await page.getByRole('button', { name: /continue with email/i }).click({ timeout: 10000 });
  await page.getByRole('heading', { name: /sign in with email/i }).waitFor({ timeout: 10000 });
}

export async function signUpTestUser(
  page: Page,
  email: string,
  password: string,
  name: string,
): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openEmailAuthDialog(page);
  // signin -> "Create account"
  await page.getByRole('button', { name: /create account/i }).click();
  await page.getByRole('heading', { name: /create account/i }).waitFor({ timeout: 5000 });
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(password);
  await page
    .getByRole('button', { name: /create account/i })
    .last()
    .click();
  // "Check Your Email" confirmation (best-effort — backend may be slow).
  await page
    .getByText(/check your email/i)
    .waitFor({ timeout: 10000 })
    .catch(() => {});
}

export async function verifyTestUserEmail(page: Page, email: string): Promise<void> {
  const verificationEmail = await waitForEmail('verify', email, { timeoutMs: 45000 });
  const link = extractVerificationLink(verificationEmail.body);
  if (!link) {
    throw new Error(
      `No verification link in email to ${email}:\n${verificationEmail.body.slice(0, 500)}`,
    );
  }
  await page.goto(link);
  await page.waitForLoadState('networkidle');
}

export async function loginTestUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Quick check: if the "Sign In" button isn't present, we're already signed in.
  const signInBtn = page.getByRole('button', { name: /sign in/i }).first();
  if (!(await signInBtn.isVisible().catch(() => false))) return;
  // After the verify redirect, EmailAuthDialog may already be open (signin mode).
  const emailField = page.locator('#signin-email');
  if (!(await emailField.isVisible().catch(() => false))) {
    await openEmailAuthDialog(page);
  }
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page
    .getByRole('button', { name: /^sign in$/i })
    .last()
    .click();
  // EmailAuthDialog reloads the page on success; the authenticated app shell +
  // Jazz account take a moment to settle. isSignedIn() polls for that state.
}

/**
 * True when the authenticated app shell is mounted: the "CheckList" header
 * heading is present AND the "Sign In" button is absent (it only renders when
 * unauthenticated). Polls with reload-retry to absorb the post-login reload and
 * the known Jazz cold-load race.
 */
export async function isSignedIn(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const shell = await page
        .getByRole('heading', { name: /^checklist$/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (shell) {
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

/** Wait for the authenticated home tree to be interactive, with reload-retry. */
export async function waitForHomeReady(page: Page): Promise<void> {
  if (await isSignedIn(page)) return;
  throw new Error('Home not ready / not signed in after reload retries');
}
