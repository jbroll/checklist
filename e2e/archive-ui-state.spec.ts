/**
 * Archive UI State Tests
 *
 * Tests the UI state interactions with archived items:
 * - Button visibility based on archived view state
 * - Recursive deletion of archived folders
 *
 * Note: These tests focus on service-level behavior rather than UI interactions,
 * since testing selection state would require complex UI interactions.
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

    // Open the More options dropdown
    await page.getByLabel('More options').click();

    // Enable "Show Archived Lists" view
    await page.getByRole('menuitemcheckbox', { name: /show archived lists/i }).click();

    // New Folder and New List buttons should still be visible
    // (users can create new items while viewing archived)
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();
  });

  test('should toggle archived lists view', async ({ page }) => {
    // Open menu and enable archived view
    await page.getByLabel('More options').click();
    const checkbox = page.getByRole('menuitemcheckbox', { name: /show archived lists/i });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await checkbox.click();

    // Re-open menu and verify it's now checked
    await page.getByLabel('More options').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /show archived lists/i }),
    ).toHaveAttribute('aria-checked', 'true');

    // Toggle off
    await page.getByRole('menuitemcheckbox', { name: /show archived lists/i }).click();

    // Re-open menu and verify it's unchecked
    await page.getByLabel('More options').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /show archived lists/i }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('should recursively delete folder contents when deleting archived folder', async ({
    page,
  }) => {
    // Create a folder with a template inside
    const { folderId, templateId } = await page.evaluate(() => {
      const folder = window.__testServices!.directory.create('Parent Folder', false);
      const template = window.__testServices!.directory.create('Child Template', true, folder.path);
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
    await page.evaluate((id) => {
      window.__testServices!.directory.archive(id);
    }, folderId);

    // Delete the folder
    await page.evaluate((id) => {
      window.__testServices!.directory.delete(id);
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

  test('should archive children when archiving parent folder', async ({ page }) => {
    // Create a folder with a template inside
    const { folderId, templateId } = await page.evaluate(() => {
      const folder = window.__testServices!.directory.create('Parent Folder', false);
      const template = window.__testServices!.directory.create('Child Template', true, folder.path);
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
    await page.evaluate((id) => {
      window.__testServices!.directory.archive(id);
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

  test('should unarchive children when unarchiving parent folder', async ({ page }) => {
    // Create a folder with a template inside, then archive both
    const { folderId, templateId } = await page.evaluate(() => {
      const folder = window.__testServices!.directory.create('Parent Folder', false);
      const template = window.__testServices!.directory.create('Child Template', true, folder.path);
      window.__testServices!.directory.archive(folder.entryId);
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
    await page.evaluate((id) => {
      window.__testServices!.directory.unarchive(id);
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
