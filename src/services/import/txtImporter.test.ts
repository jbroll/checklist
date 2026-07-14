/**
 * Unit tests for TXT import functionality (rowboat port, slice-2).
 *
 * `importItemsFromText(g, templateId, textContent)` — see `baseImporter.test.ts` for the
 * template-folder/item row-builder fixtures reused here. `parseTextMetadata` is unchanged.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import { PATH_SEPARATOR } from '../../utils/pathUtils';
import { importItemsFromText, parseTextMetadata } from './txtImporter';

type Graph = ReturnType<typeof makeGraph>;

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

function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

describe('txtImporter', () => {
  describe('parseTextMetadata', () => {
    it('extracts name from metadata comment', () => {
      const text = `
# name: My Grocery List
# description: Weekly shopping

Produce
  Apples
  Bananas
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('My Grocery List');
      expect(metadata.description).toBe('Weekly shopping');
    });

    it('returns empty metadata for plain comments', () => {
      const text = `
# Just a comment
Item1
Item2
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBeUndefined();
      expect(Object.keys(metadata)).toHaveLength(0);
    });

    it('handles flat list with metadata', () => {
      const text = `
# name: Simple List

Item1
Item2
Item3
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('Simple List');
    });

    it('normalizes keys to lowercase', () => {
      const text = `
# NAME: Test List
# Description: Test

Item1
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('Test List');
      expect(metadata.description).toBe('Test');
    });

    it('handles colons in values', () => {
      const text = `
# name: List: With Colon
# time: 10:30

Item1
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('List: With Colon');
      expect(metadata.time).toBe('10:30');
    });
  });

  describe('importItemsFromText', () => {
    it('throws if the template does not exist', async () => {
      await expect(importItemsFromText(makeGraph(), 'nonexistent', 'Item1')).rejects.toThrow(
        'Template nonexistent not found',
      );
    });

    it('returns metadata with import result for indented format', async () => {
      const text = `
# name: Test Groceries
# description: A test list

Produce
  Apples
  Bananas
      `.trim();

      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItemsFromText(g, 't1', text);

      expect(result.metadata.name).toBe('Test Groceries');
      expect(result.metadata.description).toBe('A test list');
      expect(result.imported).toBe(3); // Produce, Apples, Bananas
    });

    it('returns metadata with import result for flat format', async () => {
      // Note: flat format doesn't filter comments, so they get imported as items
      // The metadata is still extracted, but the # lines become items too
      const text = `
# name: Flat List

Item1
Item2
Item3
      `.trim();

      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItemsFromText(g, 't1', text);

      expect(result.metadata.name).toBe('Flat List');
      // Flat format includes the comment line as an item (4 total)
      expect(result.imported).toBe(4);
    });

    it('returns empty metadata when no metadata comments', async () => {
      const text = `
Item1
Item2
      `.trim();

      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItemsFromText(g, 't1', text);

      expect(result.metadata).toEqual({});
      expect(result.imported).toBe(2);
    });

    it('skips duplicate items in indented format', async () => {
      const text = `
# name: Duplicate Test

Category
  Item1
  Item2
      `.trim();

      const g = graphWith(
        templateFolder('t1', 'Groceries', [item('existing', `Category${PATH_SEPARATOR}Item1`)]),
      );

      const result = await importItemsFromText(g, 't1', text);

      expect(result.imported).toBe(2); // Category and Item2
      expect(result.skipped).toBe(1); // Item1 was duplicate
      expect(result.duplicates).toContain('Item1');
    });

    it('handles hierarchical items correctly', async () => {
      const text = `
# name: Hierarchical Test

Category1
  Item1
  Item2
Category2
  SubCategory
    Item3
      `.trim();

      const g = graphWith(templateFolder('t1', 'Groceries'));

      const result = await importItemsFromText(g, 't1', text);

      expect(result.imported).toBe(6);
      expect(result.metadata.name).toBe('Hierarchical Test');
    });
  });
});
