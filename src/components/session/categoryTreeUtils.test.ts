/**
 * Unit tests for categoryTreeUtils
 */

import { describe, expect, it } from 'vitest';
import type { TemplateItem } from '@/schema';
import type { CategoryNode } from './categoryTreeBuilder';
import { areAllItemsSelected, collectAllItemIds, getSelectionState } from './categoryTreeUtils';

// Mock helpers
const createMockItem = (id: string, name: string): TemplateItem =>
  ({
    id,
    name,
    type: 'item',
    path: name,
    sortOrder: 0,
    archived: false,
    expanded: false,
    defaultQuantity: '',
    createdAt: new Date(),
  }) as TemplateItem;

const createMockCategoryNode = (
  items: TemplateItem[] = [],
  children: CategoryNode[] = [],
): CategoryNode => ({
  path: 'test-category',
  name: 'Test Category',
  items,
  children,
  expanded: true,
  depth: 0,
});

describe('categoryTreeUtils', () => {
  describe('collectAllItemIds', () => {
    it('should return empty array for null category', () => {
      const result = collectAllItemIds(null);
      expect(result).toEqual([]);
    });

    it('should return item IDs from direct items list', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const result = collectAllItemIds(null, items);
      expect(result).toEqual(['item-1', 'item-2']);
    });

    it('should return item IDs from category items', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);

      const result = collectAllItemIds(category);

      expect(result).toEqual(['item-1', 'item-2']);
    });

    it('should recursively collect IDs from children', () => {
      const childItems = [createMockItem('item-2', 'Cheese')];
      const childCategory = createMockCategoryNode(childItems);

      const parentItems = [createMockItem('item-1', 'Milk')];
      const parentCategory = createMockCategoryNode(parentItems, [childCategory]);

      const result = collectAllItemIds(parentCategory);

      expect(result).toContain('item-1');
      expect(result).toContain('item-2');
      expect(result).toHaveLength(2);
    });

    it('should handle deeply nested categories', () => {
      const level3Items = [createMockItem('item-3', 'Eggs')];
      const level3 = createMockCategoryNode(level3Items);

      const level2Items = [createMockItem('item-2', 'Bread')];
      const level2 = createMockCategoryNode(level2Items, [level3]);

      const level1Items = [createMockItem('item-1', 'Milk')];
      const level1 = createMockCategoryNode(level1Items, [level2]);

      const result = collectAllItemIds(level1);

      expect(result).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('should handle multiple children at same level', () => {
      const child1 = createMockCategoryNode([createMockItem('item-1', 'Milk')]);
      const child2 = createMockCategoryNode([createMockItem('item-2', 'Bread')]);
      const child3 = createMockCategoryNode([createMockItem('item-3', 'Eggs')]);

      const parent = createMockCategoryNode([], [child1, child2, child3]);

      const result = collectAllItemIds(parent);

      expect(result).toHaveLength(3);
      expect(result).toContain('item-1');
      expect(result).toContain('item-2');
      expect(result).toContain('item-3');
    });
  });

  describe('areAllItemsSelected', () => {
    it('should return false for empty category', () => {
      const category = createMockCategoryNode([]);
      const itemStates = {};

      const result = areAllItemsSelected(category, itemStates);

      expect(result).toBe(false);
    });

    it('should return false for null category with no items', () => {
      const result = areAllItemsSelected(null, {});
      expect(result).toBe(false);
    });

    it('should return true when all items are selected', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {
        'item-1': { selected: true },
        'item-2': { selected: true },
      };

      const result = areAllItemsSelected(category, itemStates);

      expect(result).toBe(true);
    });

    it('should return false when some items are not selected', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {
        'item-1': { selected: true },
        'item-2': { selected: false },
      };

      const result = areAllItemsSelected(category, itemStates);

      expect(result).toBe(false);
    });

    it('should return false when item has no state', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {
        'item-1': { selected: true },
      };

      const result = areAllItemsSelected(category, itemStates);

      expect(result).toBe(false);
    });

    it('should work with flat items list', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const itemStates = {
        'item-1': { selected: true },
        'item-2': { selected: true },
      };

      const result = areAllItemsSelected(null, itemStates, items);

      expect(result).toBe(true);
    });

    it('should check nested children', () => {
      const childItems = [createMockItem('item-2', 'Cheese')];
      const childCategory = createMockCategoryNode(childItems);

      const parentItems = [createMockItem('item-1', 'Milk')];
      const parentCategory = createMockCategoryNode(parentItems, [childCategory]);

      const allSelected = {
        'item-1': { selected: true },
        'item-2': { selected: true },
      };

      expect(areAllItemsSelected(parentCategory, allSelected)).toBe(true);

      const partiallySelected = {
        'item-1': { selected: true },
        'item-2': { selected: false },
      };

      expect(areAllItemsSelected(parentCategory, partiallySelected)).toBe(false);
    });
  });

  describe('getSelectionState', () => {
    it('should return "none" for empty category', () => {
      const category = createMockCategoryNode([]);
      const itemStates = {};

      const result = getSelectionState(category, itemStates);

      expect(result).toBe('none');
    });

    it('should return "none" for null category with no items', () => {
      const result = getSelectionState(null, {});
      expect(result).toBe('none');
    });

    it('should return "all" when all items selected', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {
        'item-1': { selected: true },
        'item-2': { selected: true },
      };

      const result = getSelectionState(category, itemStates);

      expect(result).toBe('all');
    });

    it('should return "none" when no items selected', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {
        'item-1': { selected: false },
        'item-2': { selected: false },
      };

      const result = getSelectionState(category, itemStates);

      expect(result).toBe('none');
    });

    it('should return "some" when some items selected', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {
        'item-1': { selected: true },
        'item-2': { selected: false },
      };

      const result = getSelectionState(category, itemStates);

      expect(result).toBe('some');
    });

    it('should return "none" when items have no state', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const category = createMockCategoryNode(items);
      const itemStates = {};

      const result = getSelectionState(category, itemStates);

      expect(result).toBe('none');
    });

    it('should work with flat items list', () => {
      const items = [
        createMockItem('item-1', 'Milk'),
        createMockItem('item-2', 'Bread'),
        createMockItem('item-3', 'Eggs'),
      ];

      expect(getSelectionState(null, { 'item-1': { selected: true } }, items)).toBe('some');

      expect(
        getSelectionState(
          null,
          {
            'item-1': { selected: true },
            'item-2': { selected: true },
            'item-3': { selected: true },
          },
          items,
        ),
      ).toBe('all');

      expect(getSelectionState(null, {}, items)).toBe('none');
    });

    it('should consider nested children in selection state', () => {
      const childItems = [createMockItem('item-2', 'Cheese')];
      const childCategory = createMockCategoryNode(childItems);

      const parentItems = [createMockItem('item-1', 'Milk')];
      const parentCategory = createMockCategoryNode(parentItems, [childCategory]);

      // All selected
      expect(
        getSelectionState(parentCategory, {
          'item-1': { selected: true },
          'item-2': { selected: true },
        }),
      ).toBe('all');

      // Parent selected, child not
      expect(
        getSelectionState(parentCategory, {
          'item-1': { selected: true },
          'item-2': { selected: false },
        }),
      ).toBe('some');

      // None selected
      expect(
        getSelectionState(parentCategory, {
          'item-1': { selected: false },
          'item-2': { selected: false },
        }),
      ).toBe('none');
    });
  });
});
