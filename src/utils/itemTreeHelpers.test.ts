/**
 * Unit tests for itemTreeHelpers
 *
 * Tests tree building and path-based item filtering functions
 */

import { describe, expect, it } from 'vitest';
import {
  buildItemTree,
  flattenItemTree,
  getCategoryPath,
  getDescendantItems,
  getDirectChildren,
} from './itemTreeHelpers';
import { PATH_SEPARATOR } from './pathUtils';

// Helper to create mock template items
function createItem(
  name: string,
  path: string,
  type: 'item' | 'category' = 'item',
  sortOrder = 0,
): any {
  return {
    id: `item-${path.split(PATH_SEPARATOR).join('-')}`,
    name,
    path,
    type,
    sortOrder,
    archived: false,
    expanded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('itemTreeHelpers', () => {
  describe('buildItemTree', () => {
    it('builds a tree from flat items', () => {
      const items = [
        createItem('Produce', 'produce', 'category', 0),
        createItem('Apples', `produce${PATH_SEPARATOR}apples`, 'item', 0),
        createItem('Bananas', `produce${PATH_SEPARATOR}bananas`, 'item', 1),
        createItem('Dairy', 'dairy', 'category', 1),
        createItem('Milk', `dairy${PATH_SEPARATOR}milk`, 'item', 0),
      ];

      const tree = buildItemTree(items);

      expect(tree).toHaveLength(2);
      expect(tree[0].item.name).toBe('Produce');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].item.name).toBe('Apples');
      expect(tree[0].children[1].item.name).toBe('Bananas');
      expect(tree[1].item.name).toBe('Dairy');
      expect(tree[1].children).toHaveLength(1);
    });

    it('handles nested categories', () => {
      const items = [
        createItem('Produce', 'produce', 'category', 0),
        createItem('Fruits', `produce${PATH_SEPARATOR}fruits`, 'category', 0),
        createItem('Apples', `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples`, 'item', 0),
      ];

      const tree = buildItemTree(items);

      expect(tree).toHaveLength(1);
      expect(tree[0].item.name).toBe('Produce');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].item.name).toBe('Fruits');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].item.name).toBe('Apples');
    });

    it('filters out null and archived items', () => {
      const items = [
        createItem('Active', 'active', 'item'),
        null,
        undefined,
        { ...createItem('Archived', 'archived', 'item'), archived: true },
      ];

      const tree = buildItemTree(items);

      expect(tree).toHaveLength(1);
      expect(tree[0].item.name).toBe('Active');
    });

    it('sorts by sortOrder then name', () => {
      const items = [
        createItem('Zebra', 'zebra', 'item', 1),
        createItem('Apple', 'apple', 'item', 0),
        createItem('Banana', 'banana', 'item', 0),
      ];

      const tree = buildItemTree(items);

      expect(tree[0].item.name).toBe('Apple');
      expect(tree[1].item.name).toBe('Banana');
      expect(tree[2].item.name).toBe('Zebra');
    });
  });

  describe('flattenItemTree', () => {
    it('flattens a tree maintaining hierarchical order', () => {
      const items = [
        createItem('Produce', 'produce', 'category', 0),
        createItem('Apples', `produce${PATH_SEPARATOR}apples`, 'item', 0),
        createItem('Dairy', 'dairy', 'category', 1),
      ];

      const tree = buildItemTree(items);
      const flat = flattenItemTree(tree);

      expect(flat).toHaveLength(3);
      expect(flat[0].name).toBe('Produce');
      expect(flat[1].name).toBe('Apples');
      expect(flat[2].name).toBe('Dairy');
    });
  });

  describe('getDescendantItems', () => {
    it('gets all descendants of a category', () => {
      const items = [
        createItem('Produce', 'produce', 'category'),
        createItem('Fruits', `produce${PATH_SEPARATOR}fruits`, 'category'),
        createItem('Apples', `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples`, 'item'),
        createItem('Bananas', `produce${PATH_SEPARATOR}bananas`, 'item'),
        createItem('Dairy', 'dairy', 'category'),
      ];

      const descendants = getDescendantItems(items, 'produce');

      expect(descendants).toHaveLength(3);
      expect(descendants.map((d) => d.name)).toContain('Fruits');
      expect(descendants.map((d) => d.name)).toContain('Apples');
      expect(descendants.map((d) => d.name)).toContain('Bananas');
    });

    it('does not match items with similar path prefixes', () => {
      // This test verifies the PATH_SEPARATOR bug fix
      // Without proper separator, "produce-organic" would match "produce" prefix
      const items = [
        createItem('Produce', 'produce', 'category'),
        createItem('Apples', `produce${PATH_SEPARATOR}apples`, 'item'),
        createItem('Produce Organic', 'produce-organic', 'category'),
        createItem('Organic Apples', `produce-organic${PATH_SEPARATOR}apples`, 'item'),
      ];

      const descendants = getDescendantItems(items, 'produce');

      // Should only get items under "produce", not "produce-organic"
      expect(descendants).toHaveLength(1);
      expect(descendants[0].name).toBe('Apples');
    });

    it('excludes archived items', () => {
      const items = [
        createItem('Active', `cat${PATH_SEPARATOR}active`, 'item'),
        { ...createItem('Archived', `cat${PATH_SEPARATOR}archived`, 'item'), archived: true },
      ];

      const descendants = getDescendantItems(items, 'cat');

      expect(descendants).toHaveLength(1);
      expect(descendants[0].name).toBe('Active');
    });

    it('handles empty results', () => {
      const items = [createItem('Other', 'other', 'item')];

      const descendants = getDescendantItems(items, 'nonexistent');

      expect(descendants).toHaveLength(0);
    });
  });

  describe('getDirectChildren', () => {
    it('gets only direct children, not grandchildren', () => {
      const items = [
        createItem('Produce', 'produce', 'category'),
        createItem('Fruits', `produce${PATH_SEPARATOR}fruits`, 'category'),
        createItem('Apples', `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples`, 'item'),
        createItem('Milk', `produce${PATH_SEPARATOR}milk`, 'item'),
      ];

      const children = getDirectChildren(items, 'produce');

      expect(children).toHaveLength(2);
      expect(children.map((c) => c.name)).toContain('Fruits');
      expect(children.map((c) => c.name)).toContain('Milk');
      expect(children.map((c) => c.name)).not.toContain('Apples');
    });

    it('gets root items when parent is undefined', () => {
      const items = [
        createItem('Root1', 'root1', 'item'),
        createItem('Root2', 'root2', 'item'),
        createItem('Child', `root1${PATH_SEPARATOR}child`, 'item'),
      ];

      const children = getDirectChildren(items, undefined);

      expect(children).toHaveLength(2);
      expect(children.map((c) => c.name)).toContain('Root1');
      expect(children.map((c) => c.name)).toContain('Root2');
    });

    it('excludes archived items', () => {
      const items = [
        createItem('Active', `cat${PATH_SEPARATOR}active`, 'item'),
        { ...createItem('Archived', `cat${PATH_SEPARATOR}archived`, 'item'), archived: true },
      ];

      const children = getDirectChildren(items, 'cat');

      expect(children).toHaveLength(1);
      expect(children[0].name).toBe('Active');
    });
  });

  describe('getCategoryPath', () => {
    it('returns parent path for nested items', () => {
      expect(getCategoryPath(`produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples`)).toBe(
        `produce${PATH_SEPARATOR}fruits`,
      );
    });

    it('returns parent for direct children', () => {
      expect(getCategoryPath(`produce${PATH_SEPARATOR}apples`)).toBe('produce');
    });

    it('returns undefined for root items', () => {
      expect(getCategoryPath('produce')).toBeUndefined();
    });
  });
});
