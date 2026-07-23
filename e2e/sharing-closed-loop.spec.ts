/**
 * Sharing closed loop on the hosted data plane, with no mail infrastructure: A invites B by
 * address and hands over the copy-link, B signs up as that address and accepts, and B's own
 * synced tree then shows A's folder. That last assertion is the point — it can only pass if the
 * grant reached hosted rowboat's RBAC and widened B's read scope, which is the whole of
 * sub-project E. The GreenMail `invite` project still covers the email delivery path, but it
 * self-excludes without mail env, so this is what the default gate runs.
 */
import { type Browser, expect, test } from '@playwright/test';
import { uniqueFolderName } from './helpers/folder-name';
import { createFolder, openShareDialog } from './helpers/invite-helper';
import { signUpAndSignIn, uniqueAuthedEmail } from './helpers/rowboat-auth';

const PASSWORD = 'Checklist-Sharing-Test-2026!';
const A_EMAIL = uniqueAuthedEmail('share-a');
const B_EMAIL = uniqueAuthedEmail('share-b');
const FOLDER = uniqueFolderName('Shared Folder');

test.setTimeout(180_000);

async function freshPage(browser: Browser) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return { ctx, page };
}

test('an invited user accepts and sees the shared folder', async ({ browser }) => {
  // A stays signed in through B's acceptance. The folder ROW rides the 5s background sync loop
  // (SYNC_INTERVAL_MS in src/lib/rowboat.tsx) — only the group mint is synchronous — so tearing A's
  // context down the instant the invite is generated can close the tab before the row is ever
  // pushed, leaving B with read scope on an empty group. Keeping A online (as a real sharer would
  // be) lets that loop flush the row while B's poll below waits. Both contexts close in the finally.
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  try {
    // --- A: create a folder and an invite for B's address.
    await signUpAndSignIn(a.page, { email: A_EMAIL, password: PASSWORD, name: 'Share Owner' });
    await createFolder(a.page, FOLDER);
    await openShareDialog(a.page, FOLDER);

    const dialog = a.page.getByRole('dialog');
    // The recipient field is type="text" (it also accepts phone numbers) — matching on
    // type="email" finds nothing and hangs until the test times out.
    await dialog.getByPlaceholder('colleague@example.com').fill(B_EMAIL);
    await a.page.getByLabel('Permission').selectOption('writer');
    await a.page.getByRole('button', { name: 'Copy link' }).click();

    const linkInput = a.page.locator('input[value*="/invite/"]');
    await expect(linkInput).toBeVisible({ timeout: 20000 });
    const shareUrl = await linkInput.inputValue();
    expect(shareUrl).toContain('/invite/');

    // The agent holds admin on this group but must never surface as a collaborator.
    await expect(dialog.getByText(/agent:/i)).toHaveCount(0);

    // --- B: sign up as the invited address, accept, and see the folder.
    await signUpAndSignIn(b.page, { email: B_EMAIL, password: PASSWORD, name: 'Share Recipient' });
    await expect(b.page.getByText(FOLDER)).toHaveCount(0);

    await b.page.goto(new URL(shareUrl).pathname);
    await b.page.locator('button:has-text("Accept Invite")').click();

    await expect(b.page.getByText(FOLDER).first()).toBeVisible({ timeout: 30000 });
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});
