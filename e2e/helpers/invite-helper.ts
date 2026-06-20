/**
 * Invite Helper — drives the authenticated Share dialog UI for invite E2E.
 *
 * Selectors follow src/components/sharing/ShareDialog.tsx (input #email,
 * select#permission, "Get Link" button, readonly shareUrl input) and the
 * folder-row menu pattern from e2e/sharing-ui.spec.ts.
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

/** Generate a real copy-link invite; returns the shareUrl. */
export async function generateInvite(
  page: Page,
  recipientEmail: string,
  permission: 'reader' | 'writer' | 'admin',
): Promise<string> {
  await page.locator('#email').fill(recipientEmail);
  await page.locator('select#permission').selectOption(permission);
  await page.getByRole('button', { name: 'Get Link' }).click();
  await expect(page.getByText(/invite link generated/i)).toBeVisible({ timeout: 20000 });
  const linkInput = page.locator('input[value*="/invite/"]');
  await expect(linkInput).toBeVisible({ timeout: 10000 });
  const url = await linkInput.inputValue();
  expect(url).toContain('/invite/');
  return url;
}

/** Revoke the pending invite for a recipient (confirm() + the X button on its row). */
export async function revokeInvite(page: Page, recipientEmail: string): Promise<void> {
  page.once('dialog', (d) => d.accept());
  const row = page.locator('div').filter({ hasText: recipientEmail }).last();
  await row.getByRole('button', { name: /revoke invite/i }).click();
  await expect(page.getByText(recipientEmail)).toHaveCount(0, { timeout: 10000 });
}

export async function assertFolderVisible(page: Page, folderName: string): Promise<void> {
  await expect(page.getByText(folderName).first()).toBeVisible({ timeout: 30000 });
}

/** Soft-delete (archive) a folder via its row menu (best-effort cleanup). */
export async function archiveFolder(page: Page, folderName: string): Promise<void> {
  const folderText = page.getByText(folderName).first();
  if (!(await folderText.isVisible().catch(() => false))) return;
  await folderText.hover();
  const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
  const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
  await menuButton.click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('menuitem', { name: /delete|archive|remove/i })
    .click()
    .catch(() => {});
}
