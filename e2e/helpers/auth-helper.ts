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
  if (await isSignedIn(page)) return;
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
  // EmailAuthDialog reloads the page on success; wait for the app shell.
  await page.waitForLoadState('networkidle');
}

/** True when the authenticated app shell is mounted (no "Sign In", tree ready). */
export async function isSignedIn(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const signInVisible = await page
      .getByRole('button', { name: /sign in/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (!signInVisible) {
      const ready = await page
        .getByRole('button', { name: /new folder|new list|add folder/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (ready) return true;
    }
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  return false;
}

/** Wait for the authenticated home tree to be interactive, with reload-retry. */
export async function waitForHomeReady(page: Page): Promise<void> {
  if (await isSignedIn(page)) return;
  throw new Error('Home not ready / not signed in after reload retries');
}
