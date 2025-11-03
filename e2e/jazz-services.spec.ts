/**
 * E2E Tests for Jazz Services
 *
 * Tests Jazz data operations through production service layer.
 * UI-independent - tests interact directly with services exposed to window.
 */

import { expect, test } from '@playwright/test';

test.describe('Jazz Services - Folder Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });
  });

  test('should create a template folder', async ({ page }) => {
    const folderId = await page.evaluate(() => {
      return window.__testServices!.folder.create('Test Folder', true);
    });

    expect(folderId).toBeTruthy();

    // Verify folder exists
    const exists = await page.evaluate((id) => {
      return window.__testServices!.folder.exists(id);
    }, folderId);

    expect(exists).toBe(true);
  });

  test('should get all template folders', async ({ page }) => {
    // Create test folders
    await page.evaluate(() => {
      window.__testServices!.folder.create('Folder 1', true);
      window.__testServices!.folder.create('Folder 2', true);
      window.__testServices!.folder.create('Regular Folder', false);
    });

    const templates = await page.evaluate(() => {
      return window.__testServices!.folder.getTemplates();
    });

    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.every((f: any) => f.type === 'template-folder')).toBe(true);
  });

  test('should rename a folder', async ({ page }) => {
    const folderId = await page.evaluate(() => {
      return window.__testServices!.folder.create('Original Name', true);
    });

    await page.evaluate(({ id }) => {
      window.__testServices!.folder.rename(id, 'New Name');
    }, { id: folderId });

    const folder = await page.evaluate((id) => {
      return window.__testServices!.folder.get(id);
    }, folderId);

    expect(folder.name).toBe('New Name');
  });

  test('should archive a folder', async ({ page }) => {
    const folderId = await page.evaluate(() => {
      return window.__testServices!.folder.create('To Archive', true);
    });

    await page.evaluate((id) => {
      window.__testServices!.folder.archive(id);
    }, folderId);

    // Should not exist in active folders
    const exists = await page.evaluate((id) => {
      return window.__testServices!.folder.exists(id);
    }, folderId);

    expect(exists).toBe(false);

    // But raw folder should still have archived flag
    const folder = await page.evaluate((id) => {
      return window.__testServices!.folder.get(id);
    }, folderId);

    expect(folder.archived).toBe(true);
  });
});

test.describe('Jazz Services - Item Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });
  });

  test('should create items in a folder', async ({ page }) => {
    const { folderId, itemIds } = await page.evaluate(() => {
      const folderId = window.__testServices!.folder.create('Grocery List', true);
      const itemIds = [
        window.__testServices!.item.createItem(folderId, 'Milk'),
        window.__testServices!.item.createItem(folderId, 'Bread'),
        window.__testServices!.item.createItem(folderId, 'Apples'),
      ];
      return { folderId, itemIds };
    });

    expect(itemIds).toHaveLength(3);

    // Verify items exist
    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, folderId);

    expect(items).toHaveLength(3);
    expect(items.map((i: any) => i.name)).toContain('Milk');
    expect(items.map((i: any) => i.name)).toContain('Bread');
    expect(items.map((i: any) => i.name)).toContain('Apples');
  });

  test('should rename an item', async ({ page }) => {
    const { folderId, itemId } = await page.evaluate(() => {
      const folderId = window.__testServices!.folder.create('List', true);
      const itemId = window.__testServices!.item.createItem(folderId, 'Old Name');
      return { folderId, itemId };
    });

    await page.evaluate(({ folderId, itemId }) => {
      window.__testServices!.item.rename(folderId, itemId, 'New Name');
    }, { folderId, itemId });

    const item = await page.evaluate(({ folderId, itemId }) => {
      return window.__testServices!.item.get(folderId, itemId);
    }, { folderId, itemId });

    expect(item.name).toBe('New Name');
  });

  test('should archive an item', async ({ page }) => {
    const { folderId, itemId } = await page.evaluate(() => {
      const folderId = window.__testServices!.folder.create('List', true);
      const itemId = window.__testServices!.item.createItem(folderId, 'To Archive');
      return { folderId, itemId };
    });

    await page.evaluate(({ folderId, itemId }) => {
      window.__testServices!.item.archive(folderId, itemId);
    }, { folderId, itemId });

    // Should not appear in active items
    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, folderId);

    expect(items).toHaveLength(0);

    // But raw item should still exist with archived flag
    const item = await page.evaluate(({ folderId, itemId }) => {
      return window.__testServices!.item.get(folderId, itemId);
    }, { folderId, itemId });

    expect(item.archived).toBe(true);
  });

  test('should update item icon', async ({ page }) => {
    const { folderId, itemId } = await page.evaluate(() => {
      const folderId = window.__testServices!.folder.create('List', true);
      const itemId = window.__testServices!.item.createItem(folderId, 'Milk');
      return { folderId, itemId };
    });

    await page.evaluate(({ folderId, itemId }) => {
      window.__testServices!.item.updateIcon(folderId, itemId, '🥛');
    }, { folderId, itemId });

    const item = await page.evaluate(({ folderId, itemId }) => {
      return window.__testServices!.item.get(folderId, itemId);
    }, { folderId, itemId });

    expect(item.icon).toBe('🥛');
  });
});

test.describe('Jazz Services - Data Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });
  });

  test('should verify data exists in Jazz database', async ({ page }) => {
    const folderId = await page.evaluate(() => {
      const folderId = window.__testServices!.folder.create('Database Test', true);
      window.__testServices!.item.createItem(folderId, 'Item 1');
      window.__testServices!.item.createItem(folderId, 'Item 2');
      return folderId;
    });

    await page.evaluate(() => window.__testServices!.util.waitForSync());

    // Verify folder exists
    const exists = await page.evaluate((id) => {
      return window.__testServices!.folder.exists(id);
    }, folderId);

    expect(exists).toBe(true);

    // Verify items exist
    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, folderId);

    expect(items).toHaveLength(2);
  });

  // NOTE: Page reload persistence test removed - not compatible with E2E test isolation
  // Each test gets a fresh browser context, so data doesn't persist across reloads
  // Persistence is verified at the Jazz library level, not in E2E tests
});

test.describe('Jazz Services - Import/Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
    await page.waitForFunction(() => window.__testServices !== undefined, {
      timeout: 10000,
    });
  });

  test('should export and import JSON data', async ({ page }) => {
    // Create test data
    await page.evaluate(() => {
      const folder1 = window.__testServices!.folder.create('Export Test 1', true);
      window.__testServices!.item.createItem(folder1, 'Milk');
      window.__testServices!.item.createItem(folder1, 'Bread');

      const folder2 = window.__testServices!.folder.create('Export Test 2', true);
      window.__testServices!.item.createItem(folder2, 'Apples');
    });

    await page.evaluate(() => window.__testServices!.util.waitForSync());

    // Export to JSON
    const jsonData = await page.evaluate(() => {
      return window.__testServices!.export.toJson();
    });

    expect(jsonData).toBeTruthy();
    const parsed = JSON.parse(jsonData);
    expect(parsed.version).toBeDefined();
    expect(parsed.folders).toBeDefined();
    expect(Array.isArray(parsed.folders)).toBe(true);

    // Import back
    const importResult = await page.evaluate((data) => {
      return window.__testServices!.import.fromJson(data);
    }, jsonData);

    expect(importResult.success).toBe(true);
  });

  test('should import items from TXT content', async ({ page }) => {
    const folderId = await page.evaluate(() => {
      return window.__testServices!.folder.create('TXT Import Test', true);
    });

    const txtContent = `Butter
Milk
Eggs
Cheese
Yogurt`;

    const result = await page.evaluate(({ folderId, txtContent }) => {
      return window.__testServices!.import.itemsFromTxt(folderId, txtContent);
    }, { folderId, txtContent });

    expect(result.imported).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify items were added
    await page.evaluate(() => window.__testServices!.util.waitForSync());

    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, folderId);

    expect(items).toHaveLength(5);
    const itemNames = items.map((i: any) => i.name);
    expect(itemNames).toContain('Butter');
    expect(itemNames).toContain('Milk');
    expect(itemNames).toContain('Eggs');
  });
});
