/**
 * Tests for auto-categorization feature
 *
 * Tests the flow from autocomplete suggestion through to item creation:
 * 1. Path creation logic is correct
 * 2. categoryInfo structure is correct
 * 3. Category finding/creation logic works
 * 4. Item is placed under the correct category path
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDomainCache,
  getCategory,
  loadDomainFromData,
  searchDomain,
} from '@/lib/categorization/domainLoader';
import type { DictionaryFile } from '@/lib/categorization/types';
import { createChildPath, PATH_SEPARATOR } from '@/utils/pathUtils';

// Mock dictionary data for testing
const mockDictionary: DictionaryFile = {
  domain: 'grocery',
  version: '1.0.0',
  generatedAt: '2025-01-01',
  source: 'test',
  license: 'test',
  categories: [
    { id: 'baby', name: 'Baby', sortOrder: 1 },
    { id: 'produce', name: 'Produce', sortOrder: 2 },
    { id: 'dairy', name: 'Dairy', sortOrder: 3 },
  ],
  items: [
    { name: 'babyfood', category: 'baby', aliases: ['baby food'] },
    { name: 'infant formula', category: 'baby' },
    { name: 'apple', category: 'produce' },
    { name: 'milk', category: 'dairy' },
  ],
};

describe('Auto-categorization flow', () => {
  beforeEach(() => {
    clearDomainCache();
    loadDomainFromData(mockDictionary);
  });

  describe('1. Domain lookup provides correct category info', () => {
    it('should return correct category info for babyfood', () => {
      // searchDomain is the underlying search without preprocessing
      const results = searchDomain('grocery', 'babyfood', 5);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      // Verify search result structure
      expect(result.item.name).toBe('babyfood');
      expect(result.item.category).toBe('baby'); // Category ID

      // Verify category lookup
      const category = getCategory('grocery', result.item.category);
      expect(category?.name).toBe('Baby'); // Category display name
    });

    it('should return correct category info for apple', () => {
      const results = searchDomain('grocery', 'apple', 5);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      expect(result.item.name).toBe('apple');
      expect(result.item.category).toBe('produce');

      const category = getCategory('grocery', result.item.category);
      expect(category?.name).toBe('Produce');
    });
  });

  describe('2. Suggestion structure for ItemInputValue', () => {
    it('should build correct categoryInfo from search result', () => {
      const results = searchDomain('grocery', 'babyfood', 5);
      const result = results[0];
      const category = getCategory('grocery', result.item.category);

      // This is what ItemInput builds from a Suggestion
      const categoryInfo = {
        category: result.item.category,
        categoryName: category?.name || result.item.category,
        subcategory: result.item.subcategory,
        subcategoryName: undefined, // No subcategory for babyfood
      };

      expect(categoryInfo.category).toBe('baby');
      expect(categoryInfo.categoryName).toBe('Baby');
      expect(categoryInfo.subcategory).toBeUndefined();
    });
  });

  describe('3. Path creation logic', () => {
    it('should create correct path for root-level category', () => {
      // When creating a category at root level with name "Baby"
      const categoryName = 'Baby';
      const categoryPath = createChildPath(undefined, categoryName);

      expect(categoryPath).toBe('Baby');
    });

    it('should create correct path for item under category', () => {
      // When creating item "babyfood" under category "Baby"
      const categoryPath = 'Baby';
      const itemPath = createChildPath(categoryPath, 'babyfood');

      expect(itemPath).toBe(`Baby${PATH_SEPARATOR}babyfood`);
    });

    it('PATH_SEPARATOR should be SOH character', () => {
      // The path separator is ASCII SOH (0x01), not "/"
      expect(PATH_SEPARATOR).toBe('\x01');
    });
  });

  describe('4. Auto-categorization logic in handleAddItem', () => {
    // Simulate the logic from TemplateItemEditor.handleAddItem
    function simulateHandleAddItem(
      itemName: string,
      categoryInfo:
        | { category: string; categoryName: string; subcategory?: string; subcategoryName?: string }
        | undefined,
      autoCategorizeEnabled: boolean,
      existingItems: Array<{ name: string; type: string; path: string }>,
    ): { categoryCreated: string | null; itemParentPath: string | undefined } {
      let parentPath: string | undefined;
      let categoryCreated: string | null = null;

      if (categoryInfo && autoCategorizeEnabled) {
        // Use the most specific category available (subcategory if exists, otherwise category)
        const categoryName = categoryInfo.subcategoryName || categoryInfo.categoryName;

        // Find existing category with this name at root level (path equals the name for root-level items)
        const existingCategory = existingItems.find(
          (item) =>
            item.type === 'category' && item.name === categoryName && item.path === categoryName,
        );

        if (existingCategory) {
          // Use existing category's path
          parentPath = existingCategory.path;
        } else {
          // Would create the category - track it
          categoryCreated = categoryName;
          // For root-level categories, path equals the category name (no sanitization)
          parentPath = categoryName;
        }
      }

      return { categoryCreated, itemParentPath: parentPath };
    }

    it('should create new category when it does not exist', () => {
      const categoryInfo = {
        category: 'baby',
        categoryName: 'Baby',
        subcategory: undefined,
        subcategoryName: undefined,
      };

      const result = simulateHandleAddItem('babyfood', categoryInfo, true, []);

      expect(result.categoryCreated).toBe('Baby');
      expect(result.itemParentPath).toBe('Baby');
    });

    it('should use existing category when it exists', () => {
      const categoryInfo = {
        category: 'baby',
        categoryName: 'Baby',
        subcategory: undefined,
        subcategoryName: undefined,
      };

      const existingItems = [{ name: 'Baby', type: 'category', path: 'Baby' }];

      const result = simulateHandleAddItem('babyfood', categoryInfo, true, existingItems);

      expect(result.categoryCreated).toBeNull();
      expect(result.itemParentPath).toBe('Baby');
    });

    it('should not categorize when auto-categorization is disabled', () => {
      const categoryInfo = {
        category: 'baby',
        categoryName: 'Baby',
        subcategory: undefined,
        subcategoryName: undefined,
      };

      const result = simulateHandleAddItem('babyfood', categoryInfo, false, []);

      expect(result.categoryCreated).toBeNull();
      expect(result.itemParentPath).toBeUndefined();
    });

    it('should not categorize when no categoryInfo provided', () => {
      const result = simulateHandleAddItem('babyfood', undefined, true, []);

      expect(result.categoryCreated).toBeNull();
      expect(result.itemParentPath).toBeUndefined();
    });
  });

  describe('5. Full item path when created with auto-categorization', () => {
    it('should create item path correctly under new category', () => {
      const categoryName = 'Baby';
      const itemName = 'babyfood';

      // Category path (root level)
      const categoryPath = createChildPath(undefined, categoryName);
      expect(categoryPath).toBe('Baby');

      // Item path (under category)
      const itemPath = createChildPath(categoryPath, itemName);
      expect(itemPath).toBe(`Baby${PATH_SEPARATOR}babyfood`);
    });

    it('should verify item path is not at root level', () => {
      const itemPath = `Baby${PATH_SEPARATOR}babyfood`;

      // Item should NOT be at root level
      expect(itemPath.includes(PATH_SEPARATOR)).toBe(true);

      // Item should have Baby as parent
      const parentPath = itemPath.substring(0, itemPath.lastIndexOf(PATH_SEPARATOR));
      expect(parentPath).toBe('Baby');
    });
  });
});

describe('templateService.createItem and createCategory', () => {
  // These tests would require mocking Jazz, but we can at least verify
  // that the path generation is correct

  it('createChildPath with parentPath should include separator', () => {
    const path = createChildPath('Baby', 'babyfood');
    expect(path).toBe(`Baby${PATH_SEPARATOR}babyfood`);
    expect(path).not.toBe('babyfood'); // Should NOT be at root
  });

  it('createChildPath without parentPath should be just the name', () => {
    const path = createChildPath(undefined, 'Baby');
    expect(path).toBe('Baby');
  });
});
