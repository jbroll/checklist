/**
 * Invite Helper — drives the authenticated Share dialog UI for invite E2E.
 *
 * Selectors follow src/components/sharing/ShareDialog.tsx (SharePanel child):
 * - recipient: placeholder "colleague@example.com", scoped to the dialog — the input is
 *   type="text" (it also accepts phone numbers), so an input[type="email"] selector finds
 *   nothing and hangs until the test times out.
 * - permission: `getByLabel('Permission')` — id is a React useId() value.
 * - expiration: `getByLabel('Expires')` — aria-label on the select.
 * - delivery: "Email invite" / "Copy link" buttons (unchanged).
 * - shareUrl: readonly `input[value*="/invite/"]` rendered by ShareDialog
 *   after a successful invite (the `lastShareUrl` block).
 */
import { expect, type Page } from '@playwright/test';

/** Create a template folder via the authenticated app UI. */
export async function createFolder(page: Page, name: string): Promise<void> {
  await page
    .getByRole('button', { name: /new folder|add folder|new list/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('textbox').first().fill(name);
  await dialog
    .getByRole('button', { name: /create|add|save/i })
    .last()
    .click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });
}

/** Open the Share dialog from a folder's row menu. */
export async function openShareDialog(page: Page, folderName: string): Promise<void> {
  const folderText = page.getByText(folderName).first();
  await folderText.hover();
  const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
  const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Share' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
}

/**
 * Generate a real invite via the "Email invite" action (desktop primary: headless
 * Chromium has no Web Share). This both creates the invite and sends the email
 * (sendEmail=true), matching the closed-loop test's GreenMail expectation.
 * Returns the shareUrl.
 */
export async function generateInvite(
  page: Page,
  recipientEmail: string,
  permission: 'reader' | 'writer' | 'admin',
): Promise<string> {
  await page.getByRole('dialog').getByPlaceholder('colleague@example.com').fill(recipientEmail);
  await page.getByLabel('Permission').selectOption(permission);
  await page.getByRole('button', { name: 'Email invite' }).click();
  await expect(page.getByText(/invite emailed to/i)).toBeVisible({ timeout: 20000 });
  const linkInput = page.locator('input[value*="/invite/"]');
  await expect(linkInput).toBeVisible({ timeout: 10000 });
  const url = await linkInput.inputValue();
  expect(url).toContain('/invite/');
  // The backend builds the shareUrl from FRONTEND_URL (production in dev), but the
  // invite token lives in the local backend DB. Normalize the host to the current
  // origin so the recipient hits the same backend that issued the token.
  const issued = new URL(url);
  const origin = new URL(page.url()).origin;
  return `${origin}${issued.pathname}${issued.search}`;
}

/** Revoke the pending invite for a recipient (confirm() + the X "Revoke invite" button). */
export async function revokeInvite(page: Page, recipientEmail: string): Promise<void> {
  // The pending invite must be listed first (its row shows the recipient email).
  await expect(page.getByText(recipientEmail).last()).toBeVisible({ timeout: 10000 });
  page.once('dialog', (d) => d.accept()); // confirm() prompt
  // The revoke control is a button titled "Revoke invite" (one per pending invite).
  await page
    .getByRole('button', { name: /revoke invite/i })
    .first()
    .click();
  await expect(page.getByText(recipientEmail)).toHaveCount(0, { timeout: 10000 });
}

export async function assertFolderVisible(page: Page, folderName: string): Promise<void> {
  await expect(page.getByText(folderName).first()).toBeVisible({ timeout: 30000 });
}

/**
 * Assert a folder appears in the tree, reloading between polls to absorb
 * cold-load / adoption sync lag (a freshly adopted row can take a few seconds
 * to materialize and the cached tree won't repaint without a reload).
 */
export async function assertFolderVisibleWithReload(
  page: Page,
  folderName: string,
  attempts = 6,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const visible = await page
      .getByText(folderName)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (visible) return;
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  // Final hard assertion (fails with a useful message if still missing).
  await expect(page.getByText(folderName).first()).toBeVisible({ timeout: 10000 });
}

/**
 * Soft-delete (archive) a folder via its row menu. Best-effort cleanup with short
 * timeouts so a missing control never hangs the afterAll hook.
 */
export async function archiveFolder(page: Page, folderName: string): Promise<void> {
  try {
    const folderText = page.getByText(folderName).first();
    if (!(await folderText.isVisible({ timeout: 2000 }).catch(() => false))) return;
    await folderText.hover({ timeout: 3000 });
    const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
    const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
    await menuButton.click({ timeout: 3000 });
    page.once('dialog', (d) => d.accept());
    await page
      .getByRole('menuitem', { name: /delete|archive|remove/i })
      .first()
      .click({ timeout: 3000 });
  } catch {
    // best-effort cleanup — never block teardown
  }
}
