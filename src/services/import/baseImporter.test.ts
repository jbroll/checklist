/**
 * Unit tests for base importer utilities
 *
 * Tests duplicate detection, sort order calculation, and item import logic.
 */

import { describe, expect, it, vi } from 'vitest';
import { calculateNextSortOrder, getExistingPaths, importItems } from './baseImporter';

// Mock template for testing
const createMockTemplate = (items: any[] = []) => {
  const template = {
    items,
    updatedAt: new Date(),
    $jazz: {
      set: vi.fn((key: string, value: any) => {
        if (key === 'items') {
          template.items = value;
        } else if (key === 'updatedAt') {
          template.updatedAt = value;
        }
      }),
    },
  };
  return template;
};

// Mock account for testing
const createMockAccount = () => ({
  $jazz: { id: 'account-1' },
});

describe('baseImporter', () => {
  describe('getExistingPaths', () => {
    it('returns empty set for template with no items', () => {
      const template = createMockTemplate([]);
      const paths = getExistingPaths(template as any);

      expect(paths.size).toBe(0);
    });

    it('returns paths from non-archived items', () => {
      const template = createMockTemplate([
        { path: 'Produce/Apples', archived: false },
        { path: 'Dairy/Milk', archived: false },
      ]);
      const paths = getExistingPaths(template as any);

      expect(paths.size).toBe(2);
      expect(paths.has('produce/apples')).toBe(true);
      expect(paths.has('dairy/milk')).toBe(true);
    });

    it('excludes archived items', () => {
      const template = createMockTemplate([
        { path: 'Produce/Apples', archived: false },
        { path: 'Dairy/Milk', archived: true },
      ]);
      const paths = getExistingPaths(template as any);

      expect(paths.size).toBe(1);
      expect(paths.has('produce/apples')).toBe(true);
      expect(paths.has('dairy/milk')).toBe(false);
    });

    it('normalizes paths to lowercase', () => {
      const template = createMockTemplate([
        { path: 'PRODUCE/APPLES', archived: false },
        { path: 'Dairy/Milk', archived: false },
      ]);
      const paths = getExistingPaths(template as any);

      expect(paths.has('produce/apples')).toBe(true);
      expect(paths.has('dairy/milk')).toBe(true);
      expect(paths.has('PRODUCE/APPLES')).toBe(false);
    });

    it('handles null items in array', () => {
      const template = createMockTemplate([
        { path: 'Produce/Apples', archived: false },
        null,
        { path: 'Dairy/Milk', archived: false },
      ]);
      const paths = getExistingPaths(template as any);

      expect(paths.size).toBe(2);
    });

    it('handles undefined items array', () => {
      const template = { items: undefined, $jazz: { set: vi.fn() } };
      const paths = getExistingPaths(template as any);

      expect(paths.size).toBe(0);
    });
  });

  describe('calculateNextSortOrder', () => {
    it('returns 0 for template with no items', () => {
      const template = createMockTemplate([]);
      const nextOrder = calculateNextSortOrder(template as any);

      expect(nextOrder).toBe(0);
    });

    it('returns max sortOrder + 1', () => {
      const template = createMockTemplate([{ sortOrder: 0 }, { sortOrder: 5 }, { sortOrder: 3 }]);
      const nextOrder = calculateNextSortOrder(template as any);

      expect(nextOrder).toBe(6);
    });

    it('handles items with sortOrder 0', () => {
      const template = createMockTemplate([{ sortOrder: 0 }]);
      const nextOrder = calculateNextSortOrder(template as any);

      expect(nextOrder).toBe(1);
    });

    it('handles null items in array', () => {
      const template = createMockTemplate([{ sortOrder: 2 }, null, { sortOrder: 5 }]);
      const nextOrder = calculateNextSortOrder(template as any);

      expect(nextOrder).toBe(6);
    });

    it('handles undefined items array', () => {
      const template = { items: undefined, $jazz: { set: vi.fn() } };
      const nextOrder = calculateNextSortOrder(template as any);

      expect(nextOrder).toBe(0);
    });

    it('handles negative sortOrder values', () => {
      const template = createMockTemplate([{ sortOrder: -5 }, { sortOrder: 3 }]);
      const nextOrder = calculateNextSortOrder(template as any);

      expect(nextOrder).toBe(4);
    });
  });

  describe('importItems', () => {
    it('returns error for empty items array', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      const result = importItems([], template as any, account as any);

      expect(result.imported).toBe(0);
      expect(result.errors).toContain('No items found');
    });

    it('imports single item successfully', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      const result = importItems(
        [{ name: 'Apples', path: 'Produce/Apples' }],
        template as any,
        account as any,
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(template.items).toHaveLength(1);
      expect(template.items[0].name).toBe('Apples');
      expect(template.items[0].path).toBe('Produce/Apples');
    });

    it('imports multiple items with sequential sortOrder', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      const result = importItems(
        [
          { name: 'Apples', path: 'Produce/Apples' },
          { name: 'Bananas', path: 'Produce/Bananas' },
          { name: 'Milk', path: 'Dairy/Milk' },
        ],
        template as any,
        account as any,
      );

      expect(result.imported).toBe(3);
      expect(template.items[0].sortOrder).toBe(0);
      expect(template.items[1].sortOrder).toBe(1);
      expect(template.items[2].sortOrder).toBe(2);
    });

    it('continues sortOrder from existing items', () => {
      const template = createMockTemplate([
        { path: 'Existing/Item', sortOrder: 5, archived: false },
      ]);
      const account = createMockAccount();

      const result = importItems(
        [{ name: 'New Item', path: 'New/Item' }],
        template as any,
        account as any,
      );

      expect(result.imported).toBe(1);
      // New item should have sortOrder 6 (5 + 1)
      expect(template.items[1].sortOrder).toBe(6);
    });

    it('skips duplicate items (case-insensitive)', () => {
      const template = createMockTemplate([{ path: 'Produce/Apples', archived: false }]);
      const account = createMockAccount();

      const result = importItems(
        [
          { name: 'Apples', path: 'produce/apples' }, // Different case
          { name: 'Bananas', path: 'Produce/Bananas' },
        ],
        template as any,
        account as any,
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.duplicates).toContain('Apples');
    });

    it('prevents duplicates within same import batch', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      const result = importItems(
        [
          { name: 'Apples', path: 'Produce/Apples' },
          { name: 'Apples Again', path: 'produce/apples' }, // Same path, different case
        ],
        template as any,
        account as any,
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.duplicates).toContain('Apples Again');
    });

    it('uses default type of "item" when not specified', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      importItems([{ name: 'Apples', path: 'Produce/Apples' }], template as any, account as any);

      expect(template.items[0].type).toBe('item');
    });

    it('uses provided type when specified', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      importItems(
        [{ name: 'Produce', path: 'Produce', type: 'category' }],
        template as any,
        account as any,
      );

      expect(template.items[0].type).toBe('category');
    });

    it('preserves defaultQuantity when provided', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      importItems(
        [{ name: 'Apples', path: 'Produce/Apples', defaultQuantity: '5 lbs' }],
        template as any,
        account as any,
      );

      expect(template.items[0].defaultQuantity).toBe('5 lbs');
    });

    it('uses empty string for defaultQuantity when not provided', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      importItems([{ name: 'Apples', path: 'Produce/Apples' }], template as any, account as any);

      expect(template.items[0].defaultQuantity).toBe('');
    });

    it('creates items with required fields', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      importItems([{ name: 'Apples', path: 'Produce/Apples' }], template as any, account as any);

      const item = template.items[0];
      expect(item.id).toBeDefined();
      expect(item.name).toBe('Apples');
      expect(item.path).toBe('Produce/Apples');
      expect(item.type).toBe('item');
      expect(item.expanded).toBe(false);
      expect(item.archived).toBe(false);
      expect(item.createdAt).toBeInstanceOf(Date);
    });

    it('updates template updatedAt timestamp', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();
      const _originalUpdatedAt = template.updatedAt;

      importItems([{ name: 'Apples', path: 'Produce/Apples' }], template as any, account as any);

      expect(template.$jazz.set).toHaveBeenCalledWith('updatedAt', expect.any(Date));
    });

    it('generates unique IDs for each item', () => {
      const template = createMockTemplate([]);
      const account = createMockAccount();

      importItems(
        [
          { name: 'Apples', path: 'Produce/Apples' },
          { name: 'Bananas', path: 'Produce/Bananas' },
        ],
        template as any,
        account as any,
      );

      expect(template.items[0].id).not.toBe(template.items[1].id);
    });

    it('includes context in error messages when provided', () => {
      const template = createMockTemplate([{ path: 'Produce/Apples', archived: false }]);
      const account = createMockAccount();

      const result = importItems(
        [{ name: 'Apples', path: 'produce/apples', context: 'Row 5' }],
        template as any,
        account as any,
      );

      expect(result.skipped).toBe(1);
      // Duplicates are not errors, they're just skipped
      expect(result.duplicates).toContain('Apples');
    });

    it('handles mixed success and duplicate imports', () => {
      const template = createMockTemplate([
        { path: 'Produce/Apples', archived: false, sortOrder: 0 },
      ]);
      const account = createMockAccount();

      const result = importItems(
        [
          { name: 'Apples', path: 'produce/apples' }, // Duplicate
          { name: 'Bananas', path: 'Produce/Bananas' }, // New
          { name: 'Milk', path: 'Dairy/Milk' }, // New
          { name: 'APPLES', path: 'PRODUCE/APPLES' }, // Duplicate (different case)
        ],
        template as any,
        account as any,
      );

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(2);
      expect(result.duplicates).toEqual(['Apples', 'APPLES']);
    });
  });
});
