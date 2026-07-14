/**
 * Unit tests for category tree builder
 */

import { describe, expect, it } from 'vitest';
import type { TemplateItem } from '@/schema/folder';
import { PATH_SEPARATOR } from '@/utils/pathUtils';
import { buildCategoryTree } from './categoryTreeBuilder';

const createItem = (
  id: string,
  name: string,
  path: string,
  sortOrder: number,
  type: 'category' | 'item' = 'item',
): TemplateItem => ({
  id,
  name,
  type,
  path,
  expanded: false,
  sortOrder,
  archived: false,
  defaultQuantity: '',
  createdAt: Date.now(),
});

describe('buildCategoryTree', () => {
  describe('sorting by sortOrder', () => {
    it('should sort items by sortOrder within categories', () => {
      const items: TemplateItem[] = [
        createItem('1', 'Oranges', `produce${PATH_SEPARATOR}oranges`, 3.0),
        createItem('2', 'Apples', `produce${PATH_SEPARATOR}apples`, 1.0),
        createItem('3', 'Bananas', `produce${PATH_SEPARATOR}bananas`, 2.0),
      ];

      const tree = buildCategoryTree(items);

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Produce');
      expect(tree[0].items[0].name).toBe('Apples');
      expect(tree[0].items[1].name).toBe('Bananas');
      expect(tree[0].items[2].name).toBe('Oranges');
    });

    it('should sort categories by their sortOrder when provided', () => {
      const items: TemplateItem[] = [
        createItem('1', 'Milk', `dairy${PATH_SEPARATOR}milk`, 1.0),
        createItem('2', 'Apple', `produce${PATH_SEPARATOR}apple`, 1.0),
      ];

      const allTemplateItems: TemplateItem[] = [
        createItem('cat-1', 'Dairy', 'dairy', 2.0, 'category'),
        createItem('cat-2', 'Produce', 'produce', 1.0, 'category'),
        ...items,
      ];

      const tree = buildCategoryTree(items, allTemplateItems);

      expect(tree).toHaveLength(2);
      // Produce should come first (sortOrder 1.0)
      expect(tree[0].name).toBe('Produce');
      expect(tree[0].sortOrder).toBe(1.0);
      // Dairy should come second (sortOrder 2.0)
      expect(tree[1].name).toBe('Dairy');
      expect(tree[1].sortOrder).toBe(2.0);
    });

    it('should fall back to item sortOrder when category sortOrder not available', () => {
      const items: TemplateItem[] = [
        createItem('1', 'Milk', `dairy${PATH_SEPARATOR}milk`, 2.0),
        createItem('2', 'Apple', `produce${PATH_SEPARATOR}apple`, 1.0),
      ];

      // No category template items provided
      const tree = buildCategoryTree(items);

      expect(tree).toHaveLength(2);
      // Produce should come first (first item sortOrder 1.0)
      expect(tree[0].name).toBe('Produce');
      expect(tree[0].items[0].sortOrder).toBe(1.0);
      // Dairy should come second (first item sortOrder 2.0)
      expect(tree[1].name).toBe('Dairy');
      expect(tree[1].items[0].sortOrder).toBe(2.0);
    });

    it('should handle fractional sortOrder values', () => {
      const items: TemplateItem[] = [
        createItem('1', 'C', `cat${PATH_SEPARATOR}c`, 3.0),
        createItem('2', 'A', `cat${PATH_SEPARATOR}a`, 1.0),
        createItem('3', 'B', `cat${PATH_SEPARATOR}b`, 1.5),
      ];

      const tree = buildCategoryTree(items);

      expect(tree[0].items[0].name).toBe('A'); // sortOrder 1.0
      expect(tree[0].items[1].name).toBe('B'); // sortOrder 1.5
      expect(tree[0].items[2].name).toBe('C'); // sortOrder 3.0
    });
  });

  describe('hierarchical structure', () => {
    it('should build nested category structure', () => {
      const items: TemplateItem[] = [
        createItem(
          '1',
          'Gala',
          `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples${PATH_SEPARATOR}gala`,
          1.0,
        ),
        createItem(
          '2',
          'Fuji',
          `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples${PATH_SEPARATOR}fuji`,
          2.0,
        ),
      ];

      const tree = buildCategoryTree(items);

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Produce');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('Fruits');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].name).toBe('Apples');
      expect(tree[0].children[0].children[0].items).toHaveLength(2);
    });

    it('should sort nested categories by sortOrder', () => {
      const items: TemplateItem[] = [
        createItem('1', 'Orange', `produce${PATH_SEPARATOR}citrus${PATH_SEPARATOR}orange`, 1.0),
        createItem('2', 'Apple', `produce${PATH_SEPARATOR}pome${PATH_SEPARATOR}apple`, 1.0),
      ];

      const allTemplateItems: TemplateItem[] = [
        createItem('cat-1', 'Produce', 'produce', 1.0, 'category'),
        createItem('cat-2', 'Citrus', `produce${PATH_SEPARATOR}citrus`, 2.0, 'category'),
        createItem('cat-3', 'Pome', `produce${PATH_SEPARATOR}pome`, 1.0, 'category'),
        ...items,
      ];

      const tree = buildCategoryTree(items, allTemplateItems);

      // Pome (sortOrder 1.0) should come before Citrus (sortOrder 2.0)
      expect(tree[0].children[0].name).toBe('Pome');
      expect(tree[0].children[1].name).toBe('Citrus');
    });
  });

  describe('edge cases', () => {
    it('should handle empty item list', () => {
      const tree = buildCategoryTree([]);
      expect(tree).toEqual([]);
    });

    it('should handle root-level items (no categories)', () => {
      const items: TemplateItem[] = [
        createItem('1', 'Item1', 'item1', 1.0),
        createItem('2', 'Item2', 'item2', 2.0),
      ];

      const tree = buildCategoryTree(items);
      // Root items are now returned as pseudo-category nodes
      expect(tree).toHaveLength(2);
      expect(tree[0].name).toBe('Item1');
      expect(tree[0].items).toEqual([items[0]]);
      expect(tree[0].children).toEqual([]);
      expect(tree[1].name).toBe('Item2');
      expect(tree[1].items).toEqual([items[1]]);
      expect(tree[1].children).toEqual([]);
    });

    it('should use category name from template when available', () => {
      const items: TemplateItem[] = [createItem('1', 'Milk', `dairy${PATH_SEPARATOR}milk`, 1.0)];

      const allTemplateItems: TemplateItem[] = [
        createItem('cat-1', 'Fresh Dairy Products', 'dairy', 1.0, 'category'),
        ...items,
      ];

      const tree = buildCategoryTree(items, allTemplateItems);

      expect(tree[0].name).toBe('Fresh Dairy Products');
    });

    it('should capitalize inferred category names', () => {
      const items: TemplateItem[] = [
        createItem('1', 'Apple', `produce${PATH_SEPARATOR}apple`, 1.0),
      ];

      const tree = buildCategoryTree(items);

      expect(tree[0].name).toBe('Produce');
    });
  });
});
