/**
 * Playwright auth-setup — runs once before the invite suite.
 *
 * Provisions the three checklist test accounts (sign up -> verify via GreenMail
 * IMAP -> login) and persists each authenticated session to storageState so the
 * invite specs can reuse them. Mirrors wickedmap's auth.setup pattern.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test as setup } from '@playwright/test';
import {
  isSignedIn,
  loginTestUser,
  signUpTestUser,
  TEST_ACCOUNTS,
  verifyTestUserEmail,
} from './helpers/auth-helper';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.auth');

setup.describe.configure({ mode: 'serial' });
setup.setTimeout(120_000);

setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

async function setupAccount(
  page: Page,
  account: { email: string; name: string; password: string },
  stateFile: string,
) {
  // Account may already exist from a prior run — try logging in first.
  await loginTestUser(page, account.email, account.password);
  if (await isSignedIn(page)) {
    await page.context().storageState({ path: stateFile });
    return;
  }
  await signUpTestUser(page, account.email, account.password, account.name);
  await verifyTestUserEmail(page, account.email);
  await loginTestUser(page, account.email, account.password);
  expect(await isSignedIn(page)).toBe(true);
  await page.context().storageState({ path: stateFile });
}

setup('authenticate test1 (organizer)', async ({ page }) => {
  await setupAccount(page, TEST_ACCOUNTS.organizer, path.join(AUTH_DIR, 'test1.json'));
});

setup('authenticate test2 (recipient)', async ({ page }) => {
  await setupAccount(page, TEST_ACCOUNTS.recipient, path.join(AUTH_DIR, 'test2.json'));
});

setup('authenticate test3 (third party)', async ({ page }) => {
  await setupAccount(page, TEST_ACCOUNTS.thirdParty, path.join(AUTH_DIR, 'test3.json'));
});
