/**
 * Archive UI State Tests
 *
 * The button-visibility / "Show Archived Lists" toggle tests run against the real rowboat app
 * (rendered by the /test page, which exposes window.testExports). The three service-seeded tests
 * are `test.skip` for the rowboat port — see the per-test TODO(e2e) notes: archive no longer
 * cascades to a folder's children (folderOps.setArchived is per-node, unlike the Jazz recursive
 * archive), and the directory-seeding read-back races the real IndexedDB write-propagation
 * (folderOps.addFolder resolves before g.folder(id) is readable — see its header). The delete /
 * archive cascade behaviour those tests covered is exercised headlessly by the folderOps unit
 * tests.
 */

import { expect, test } from './fixtures/base';

test.describe('Archive UI State Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });

    // Wait for the main UI to be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show New Folder/List buttons when in normal view', async ({ page }) => {
    // Verify New Folder and New List buttons are visible initially
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();
  });

  test('should show New Folder/List buttons even when archived view is enabled', async ({
    page,
  }) => {
    // Verify New Folder and New List buttons are visible initially
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();

    // Open the More options dropdown (in header)
    await page.locator('header').getByLabel('More options').click();

    // Enable "Show Archived Lists" view
    await page.getByRole('menuitemcheckbox', { name: /show archived lists/i }).click();

    // New Folder and New List buttons should still be visible
    // (users can create new items while viewing archived)
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();
  });

  test('should toggle archived lists view', async ({ page }) => {
    // Open menu and enable archived view (in header)
    await page.locator('header').getByLabel('More options').click();
    const checkbox = page.getByRole('menuitemcheckbox', { name: /show archived lists/i });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await checkbox.click();

    // Re-open menu and verify it's now checked
    await page.locator('header').getByLabel('More options').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /show archived lists/i }),
    ).toHaveAttribute('aria-checked', 'true');

    // Toggle off
    await page.getByRole('menuitemcheckbox', { name: /show archived lists/i }).click();

    // Re-open menu and verify it's unchecked
    await page.locator('header').getByLabel('More options').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /show archived lists/i }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  // TODO(e2e): directory.create seeds through folderOps.addFolder, which resolves BEFORE the row
  // is readable on the real IndexedDB-backed graph (see folderOps header) — so the immediate
  // directory.get read-backs here race the write. Delete-cascade itself is covered by the
  // folderOps unit tests. Re-enable with a reactive wait once the /test harness seeding settles.
  test('should recursively delete folder contents when deleting archived folder', async ({
    page,
  }) => {
    // Create a folder with a template inside
    const { folderId, templateId } = await page.evaluate(async () => {
      const folder = await window.__testServices!.directory.create('Parent Folder', false);
      const template = await window.__testServices!.directory.create(
        'Child Template',
        true,
        folder.path,
      );
      return { folderId: folder.entryId, templateId: template.entryId };
    });

    // Verify both exist
    let folderExists = await page.evaluate((id) => {
      const entry = window.__testServices!.directory.get(id);
      return entry !== null;
    }, folderId);
    expect(folderExists).toBe(true);

    let templateExists = await page.evaluate((id) => {
      const entry = window.__testServices!.directory.get(id);
      return entry !== null;
    }, templateId);
    expect(templateExists).toBe(true);

    // Archive the folder (should archive children too)
    await page.evaluate(async (id) => {
      await window.__testServices!.directory.archive(id);
    }, folderId);

    // Delete the folder
    await page.evaluate(async (id) => {
      await window.__testServices!.directory.delete(id);
    }, folderId);

    // Verify folder and template are both deleted
    folderExists = await page.evaluate((id) => {
      const entry = window.__testServices!.directory.get(id);
      return entry !== null;
    }, folderId);

    templateExists = await page.evaluate((id) => {
      const entry = window.__testServices!.directory.get(id);
      return entry !== null;
    }, templateId);

    expect(folderExists).toBe(false);
    expect(templateExists).toBe(false);
  });

  // folderOps.setArchived cascades to the subtree (restored Jazz parity — see folderOps.ts).
  test('should archive children when archiving parent folder', async ({ page }) => {
    // Create a folder with a template inside
    const { folderId, templateId } = await page.evaluate(async () => {
      const folder = await window.__testServices!.directory.create('Parent Folder', false);
      const template = await window.__testServices!.directory.create(
        'Child Template',
        true,
        folder.path,
      );
      return { folderId: folder.entryId, templateId: template.entryId };
    });

    // Verify both are not archived initially
    let folderEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, folderId);
    let templateEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, templateId);

    expect(folderEntry?.archived).toBe(false);
    expect(templateEntry?.archived).toBe(false);

    // Archive the parent folder
    await page.evaluate(async (id) => {
      await window.__testServices!.directory.archive(id);
    }, folderId);

    // Verify both are now archived
    folderEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, folderId);
    templateEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, templateId);

    expect(folderEntry?.archived).toBe(true);
    expect(templateEntry?.archived).toBe(true);
  });

  // Unarchiving cascades to the subtree (mirror of the archive-cascade test — see folderOps.ts).
  test('should unarchive children when unarchiving parent folder', async ({ page }) => {
    // Create a folder with a template inside, then archive the parent (cascades to the child)
    const { folderId, templateId } = await page.evaluate(async () => {
      const folder = await window.__testServices!.directory.create('Parent Folder', false);
      const template = await window.__testServices!.directory.create(
        'Child Template',
        true,
        folder.path,
      );
      await window.__testServices!.directory.archive(folder.entryId);
      return { folderId: folder.entryId, templateId: template.entryId };
    });

    // Verify both are archived
    let folderEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, folderId);
    let templateEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, templateId);

    expect(folderEntry?.archived).toBe(true);
    expect(templateEntry?.archived).toBe(true);

    // Unarchive the parent folder
    await page.evaluate(async (id) => {
      await window.__testServices!.directory.unarchive(id);
    }, folderId);

    // Verify both are now unarchived
    folderEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, folderId);
    templateEntry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, templateId);

    expect(folderEntry?.archived).toBe(false);
    expect(templateEntry?.archived).toBe(false);
  });
});
