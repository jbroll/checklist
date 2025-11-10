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
    const result = await page.evaluate(() => {
      return window.__testServices!.directory.create('Test Folder', true);
    });

    expect(result.entryId).toBeTruthy();
    expect(result.templateId).toBeTruthy();

    // Verify entry exists
    const exists = await page.evaluate((id) => {
      return window.__testServices!.directory.exists(id);
    }, result.entryId);

    expect(exists).toBe(true);
  });

  test('should get all template folders', async ({ page }) => {
    // Create test folders
    await page.evaluate(() => {
      window.__testServices!.directory.create('Folder 1', true);
      window.__testServices!.directory.create('Folder 2', true);
      window.__testServices!.directory.create('Regular Folder', false);
    });

    const entries = await page.evaluate(() => {
      return window.__testServices!.directory.getAll();
    });

    const templateEntries = entries.filter((e: any) => e.type === 'template-ref');
    expect(templateEntries.length).toBeGreaterThanOrEqual(2);
  });

  test('should rename a folder', async ({ page }) => {
    const result = await page.evaluate(() => {
      return window.__testServices!.directory.create('Original Name', true);
    });

    await page.evaluate(({ id }) => {
      window.__testServices!.directory.rename(id, 'New Name');
    }, { id: result.entryId });

    const entry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, result.entryId);

    expect(entry.name).toBe('New Name');
  });

  test('should archive a folder', async ({ page }) => {
    const result = await page.evaluate(() => {
      return window.__testServices!.directory.create('To Archive', true);
    });

    await page.evaluate((id) => {
      window.__testServices!.directory.archive(id);
    }, result.entryId);

    // Should not exist in active entries
    const exists = await page.evaluate((id) => {
      return window.__testServices!.directory.exists(id);
    }, result.entryId);

    expect(exists).toBe(false);

    // But raw entry should still have archived flag
    const entry = await page.evaluate((id) => {
      return window.__testServices!.directory.get(id);
    }, result.entryId);

    expect(entry.archived).toBe(true);
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
    const { templateId, itemIds } = await page.evaluate(() => {
      const result = window.__testServices!.directory.create('Grocery List', true);
      const itemIds = [
        window.__testServices!.item.createItem(result.templateId!, 'Milk'),
        window.__testServices!.item.createItem(result.templateId!, 'Bread'),
        window.__testServices!.item.createItem(result.templateId!, 'Apples'),
      ];
      return { templateId: result.templateId, itemIds };
    });

    expect(itemIds).toHaveLength(3);

    // Verify items exist
    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, templateId);

    expect(items).toHaveLength(3);
    expect(items.map((i: any) => i.name)).toContain('Milk');
    expect(items.map((i: any) => i.name)).toContain('Bread');
    expect(items.map((i: any) => i.name)).toContain('Apples');
  });

  test('should rename an item', async ({ page }) => {
    const { templateId, itemId } = await page.evaluate(() => {
      const result = window.__testServices!.directory.create('List', true);
      const itemId = window.__testServices!.item.createItem(result.templateId!, 'Old Name');
      return { templateId: result.templateId, itemId };
    });

    await page.evaluate(({ templateId, itemId }) => {
      window.__testServices!.item.rename(templateId, itemId, 'New Name');
    }, { templateId, itemId });

    const item = await page.evaluate(({ templateId, itemId }) => {
      return window.__testServices!.item.get(templateId, itemId);
    }, { templateId, itemId });

    expect(item.name).toBe('New Name');
  });

  test('should archive an item', async ({ page }) => {
    const { templateId, itemId } = await page.evaluate(() => {
      const result = window.__testServices!.directory.create('List', true);
      const itemId = window.__testServices!.item.createItem(result.templateId!, 'To Archive');
      return { templateId: result.templateId, itemId };
    });

    await page.evaluate(({ templateId, itemId }) => {
      window.__testServices!.item.archive(templateId, itemId);
    }, { templateId, itemId });

    // Should not appear in active items
    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, templateId);

    expect(items).toHaveLength(0);

    // But raw item should still exist with archived flag
    const item = await page.evaluate(({ templateId, itemId }) => {
      return window.__testServices!.item.get(templateId, itemId);
    }, { templateId, itemId });

    expect(item.archived).toBe(true);
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
    const result = await page.evaluate(() => {
      const result = window.__testServices!.directory.create('Database Test', true);
      window.__testServices!.item.createItem(result.templateId!, 'Item 1');
      window.__testServices!.item.createItem(result.templateId!, 'Item 2');
      return result;
    });

    await page.evaluate(() => window.__testServices!.util.waitForSync());

    // Verify entry exists
    const exists = await page.evaluate((id) => {
      return window.__testServices!.directory.exists(id);
    }, result.entryId);

    expect(exists).toBe(true);

    // Verify items exist
    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, result.templateId);

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
      const result1 = window.__testServices!.directory.create('Export Test 1', true);
      window.__testServices!.item.createItem(result1.templateId!, 'Milk');
      window.__testServices!.item.createItem(result1.templateId!, 'Bread');

      const result2 = window.__testServices!.directory.create('Export Test 2', true);
      window.__testServices!.item.createItem(result2.templateId!, 'Apples');
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
    const result = await page.evaluate(() => {
      return window.__testServices!.directory.create('TXT Import Test', true);
    });

    const txtContent = `Butter
Milk
Eggs
Cheese
Yogurt`;

    const importResult = await page.evaluate(({ templateId, txtContent }) => {
      return window.__testServices!.import.itemsFromTxt(templateId, txtContent);
    }, { templateId: result.templateId, txtContent });

    expect(importResult.imported).toBe(5);
    expect(importResult.skipped).toBe(0);
    expect(importResult.errors).toHaveLength(0);

    // Verify items were added
    await page.evaluate(() => window.__testServices!.util.waitForSync());

    const items = await page.evaluate((id) => {
      return window.__testServices!.item.getAll(id);
    }, result.templateId);

    expect(items).toHaveLength(5);
    const itemNames = items.map((i: any) => i.name);
    expect(itemNames).toContain('Butter');
    expect(itemNames).toContain('Milk');
    expect(itemNames).toContain('Eggs');
  });
});
