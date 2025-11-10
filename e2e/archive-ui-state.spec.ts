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

import { expect, test } from '@playwright/test';

test.describe('Archive UI State Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });

    // Wait for the main UI to be visible
    await expect(page.getByRole('heading', { name: /bubblelist/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show New Folder/List buttons when in normal view', async ({ page }) => {
    // Verify New Folder and New List buttons are visible initially
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();
  });

  test('should hide New Folder/List buttons when in archived view', async ({ page }) => {
    // Verify New Folder and New List buttons are visible initially
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();

    // Open the More options dropdown
    await page.getByLabel('More options').click();

    // Enable "Archived" view
    await page.getByRole('menuitemcheckbox', { name: /archived/i }).click();

    // New Folder and New List buttons should be hidden
    await expect(page.getByRole('button', { name: /new folder/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).not.toBeVisible();
  });

  test('should restore New Folder/List buttons when disabling archived view', async ({ page }) => {
    // Enable archived view
    await page.getByLabel('More options').click();
    await page.getByRole('menuitemcheckbox', { name: /archived/i }).click();

    // Verify buttons are hidden
    await expect(page.getByRole('button', { name: /new folder/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).not.toBeVisible();

    // Disable archived view
    await page.getByLabel('More options').click();
    await page.getByRole('menuitemcheckbox', { name: /archived/i }).click();

    // Buttons should be visible again
    await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();
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
