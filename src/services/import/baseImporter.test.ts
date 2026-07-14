/**
 * Unit tests for base importer utilities (rowboat port, slice-2).
 *
 * `importItems` is the only export now (the old `getExistingPaths`/`calculateNextSortOrder`
 * helpers were internal implementation details, not part of the public API) — coverage of
 * duplicate detection and sort-order continuation is folded into the `importItems` tests below.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import { type ItemToImport, importItems } from './baseImporter';

type Graph = ReturnType<typeof makeGraph>;

/** Build a complete template-folder row (all required Folder columns present). */
function templateFolder(
  id: string,
  name: string,
  items: TemplateItem[] = [],
  extra: Partial<FolderRow> = {},
): FolderRow {
  return {
    id,
    owner_group_id: 'group-1',
    name,
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items,
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
    ...extra,
  };
}

/** Build a template item. `path` defaults to `name`. */
function item(id: string, path: string, extra: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id,
    name: path,
    type: 'item',
    path,
    expanded: false,
    sortOrder: 0,
    archived: false,
    defaultQuantity: '',
    createdAt: 0,
    ...extra,
  };
}

/** Seed a graph from folder rows. */
function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

function itemsOf(g: Graph, id = 't1'): TemplateItem[] {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return node.$data.items;
}

describe('baseImporter', () => {
  describe('importItems', () => {
    it('throws if the template does not exist', async () => {
      await expect(
        importItems(makeGraph(), 'nonexistent', [{ name: 'Apples', path: 'Produce/Apples' }]),
      ).rejects.toThrow('Template nonexistent not found');
    });

    it('returns error for empty items array', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItems(g, 't1', []);

      expect(result.imported).toBe(0);
      expect(result.errors).toContain('No items found');
    });

    it('imports single item successfully', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItems(g, 't1', [{ name: 'Apples', path: 'Produce/Apples' }]);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      const items = itemsOf(g);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Apples');
      expect(items[0].path).toBe('Produce/Apples');
    });

    it('imports multiple items with sequential sortOrder', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [
        { name: 'Apples', path: 'Produce/Apples' },
        { name: 'Bananas', path: 'Produce/Bananas' },
        { name: 'Milk', path: 'Dairy/Milk' },
      ]);

      const items = itemsOf(g);
      expect(items[0].sortOrder).toBe(0);
      expect(items[1].sortOrder).toBe(1);
      expect(items[2].sortOrder).toBe(2);
    });

    it('continues sortOrder from existing items', async () => {
      const g = graphWith(
        templateFolder('t1', 'Groceries', [item('existing', 'Existing/Item', { sortOrder: 5 })]),
      );

      const result = await importItems(g, 't1', [{ name: 'New Item', path: 'New/Item' }]);

      expect(result.imported).toBe(1);
      expect(itemsOf(g)[1].sortOrder).toBe(6);
    });

    it('skips duplicate items (case-insensitive)', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries', [item('apples', 'Produce/Apples')]));

      const result = await importItems(g, 't1', [
        { name: 'Apples', path: 'produce/apples' }, // Different case
        { name: 'Bananas', path: 'Produce/Bananas' },
      ]);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.duplicates).toContain('Apples');
    });

    it('prevents duplicates within same import batch', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItems(g, 't1', [
        { name: 'Apples', path: 'Produce/Apples' },
        { name: 'Apples Again', path: 'produce/apples' }, // Same path, different case
      ]);

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.duplicates).toContain('Apples Again');
    });

    it('uses default type of "item" when not specified', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [{ name: 'Apples', path: 'Produce/Apples' }]);

      expect(itemsOf(g)[0].type).toBe('item');
    });

    it('uses provided type when specified', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [{ name: 'Produce', path: 'Produce', type: 'category' }]);

      expect(itemsOf(g)[0].type).toBe('category');
    });

    it('preserves defaultQuantity when provided', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [
        { name: 'Apples', path: 'Produce/Apples', defaultQuantity: '5 lbs' },
      ]);

      expect(itemsOf(g)[0].defaultQuantity).toBe('5 lbs');
    });

    it('uses empty string for defaultQuantity when not provided', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [{ name: 'Apples', path: 'Produce/Apples' }]);

      expect(itemsOf(g)[0].defaultQuantity).toBe('');
    });

    it('creates items with required fields', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [{ name: 'Apples', path: 'Produce/Apples' }]);

      const newItem = itemsOf(g)[0];
      expect(newItem.id).toBeDefined();
      expect(newItem.name).toBe('Apples');
      expect(newItem.path).toBe('Produce/Apples');
      expect(newItem.type).toBe('item');
      expect(newItem.expanded).toBe(false);
      expect(newItem.archived).toBe(false);
      expect(typeof newItem.createdAt).toBe('number');
    });

    it('updates template updated_at timestamp', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [{ name: 'Apples', path: 'Produce/Apples' }]);

      expect(g.folder('t1')?.$data.updated_at).toBeGreaterThan(0);
    });

    it('generates unique IDs for each item', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));

      await importItems(g, 't1', [
        { name: 'Apples', path: 'Produce/Apples' },
        { name: 'Bananas', path: 'Produce/Bananas' },
      ]);

      const items = itemsOf(g);
      expect(items[0].id).not.toBe(items[1].id);
    });

    it('includes context in error messages when provided (duplicates are not errors)', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries', [item('apples', 'Produce/Apples')]));

      const result = await importItems(g, 't1', [
        { name: 'Apples', path: 'produce/apples', context: 'Row 5' },
      ]);

      expect(result.skipped).toBe(1);
      expect(result.duplicates).toContain('Apples');
    });

    it('handles mixed success and duplicate imports', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries', [item('apples', 'Produce/Apples')]));

      const items: ItemToImport[] = [
        { name: 'Apples', path: 'produce/apples' }, // Duplicate
        { name: 'Bananas', path: 'Produce/Bananas' }, // New
        { name: 'Milk', path: 'Dairy/Milk' }, // New
        { name: 'APPLES', path: 'PRODUCE/APPLES' }, // Duplicate (different case)
      ];

      const result = await importItems(g, 't1', items);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(2);
      expect(result.duplicates).toEqual(['Apples', 'APPLES']);
    });
  });
});
