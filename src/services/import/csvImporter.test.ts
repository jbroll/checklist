/**
 * Unit tests for CSV import functionality (rowboat port, slice-2).
 *
 * `importItemsFromCsv(g, templateId, csvContent)` writes into a template folder row via
 * `importItems` — see `baseImporter.test.ts` for the row-builder fixtures reused here.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import { createChildPath } from '../../utils/pathUtils';
import { importItemsFromCsv } from './csvImporter';

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

function itemsOf(g: Graph, id = 't1'): TemplateItem[] {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return parseFolderRow(node.$data).items;
}

const P = createChildPath('Produce', 'Apples'); // sanity — path separator comes from createChildPath, not '/'

describe('csvImporter', () => {
  describe('importItemsFromCsv', () => {
    describe('basic CSV parsing', () => {
      it('imports simple CSV with name column only', async () => {
        const csv = `name
Apples
Bananas
Milk`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(itemsOf(g)).toHaveLength(3);
      });

      it('imports CSV with category,item format using createChildPath', async () => {
        const csv = `category,item
Produce,Apples
Produce,Bananas
Dairy,Milk
Dairy,Cheese`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(4);
        const items = itemsOf(g);
        expect(items[0].name).toBe('Apples');
        expect(items[0].path).toBe(createChildPath('Produce', 'Apples'));
        expect(items[2].name).toBe('Milk');
        expect(items[2].path).toBe(createChildPath('Dairy', 'Milk'));
      });

      it('imports CSV with all supported columns', async () => {
        const csv = `name,defaultQuantity,icon,path
Apples,5 lbs,,${P}
Bananas,1 bunch,,Produce/Bananas
Milk,1 gallon,,Dairy/Milk`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(3);
        const items = itemsOf(g);
        expect(items[0].name).toBe('Apples');
        expect(items[0].defaultQuantity).toBe('5 lbs');
        expect(items[0].path).toBe(P);
      });

      it('uses name as path when path column is empty', async () => {
        const csv = `name,path
Apples,
Bananas,Produce/Bananas`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await importItemsFromCsv(g, 't1', csv);

        const items = itemsOf(g);
        expect(items[0].path).toBe('Apples');
        expect(items[1].path).toBe('Produce/Bananas');
      });

      it('uses name as path when path column is missing', async () => {
        const csv = `name,defaultQuantity
Apples,5 lbs
Bananas,1 bunch`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await importItemsFromCsv(g, 't1', csv);

        const items = itemsOf(g);
        expect(items[0].path).toBe('Apples');
        expect(items[1].path).toBe('Bananas');
      });
    });

    describe('CSV format handling', () => {
      it('handles quoted fields with commas', async () => {
        const csv = `name,defaultQuantity
"Apples, Red",5 lbs
Bananas,1 bunch`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(2);
        expect(itemsOf(g)[0].name).toBe('Apples, Red');
      });

      it('handles escaped quotes in quoted fields', async () => {
        const csv = `name,defaultQuantity
"Apples ""Gala""",5 lbs
Bananas,1 bunch`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(2);
        expect(itemsOf(g)[0].name).toBe('Apples "Gala"');
      });

      it('handles empty lines in CSV', async () => {
        const csv = `name
Apples

Bananas

Milk`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(3);
      });

      it('trims whitespace from values', async () => {
        const csv = `name,defaultQuantity
  Apples  ,  5 lbs
Bananas,1 bunch`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await importItemsFromCsv(g, 't1', csv);

        const items = itemsOf(g);
        expect(items[0].name).toBe('Apples');
        expect(items[0].defaultQuantity).toBe('5 lbs');
      });
    });

    describe('row context tracking', () => {
      it('adds row context starting from row 2', async () => {
        // Row 1 is header, data starts at row 2
        const csv = `name
Apples
Bananas`;
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('existing', 'apples')]), // Existing item to trigger duplicate
        );

        const result = await importItemsFromCsv(g, 't1', csv);

        // First item (Apples) is duplicate, second (Bananas) imported
        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(1);
        expect(result.duplicates).toContain('Apples');
      });
    });

    describe('duplicate handling', () => {
      it('skips items with duplicate paths (case-insensitive)', async () => {
        const csv = `name,path
Apples,${P}
Red Apples,${P.toLowerCase()}`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.duplicates).toContain('Red Apples');
      });

      it('skips items that exist in template', async () => {
        const csv = `name,path
Apples,${P}
Bananas,Produce/Bananas`;
        const g = graphWith(templateFolder('t1', 'Groceries', [item('existing', P.toLowerCase())]));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
      });
    });

    describe('validation and error handling', () => {
      it('skips rows with empty name', async () => {
        const csv = `name,path
Apples,Produce/Apples
,Empty/Name
Bananas,Produce/Bananas`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(2);
        expect(itemsOf(g)).toHaveLength(2);
      });

      it('skips rows with whitespace-only name', async () => {
        const csv = `name,path
Apples,Produce/Apples
   ,Whitespace/Name
Bananas,Produce/Bananas`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(2);
      });

      it('returns error for empty CSV', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', '');

        expect(result.imported).toBe(0);
        expect(result.errors).toContain('No items found');
      });

      it('returns error for CSV with only header', async () => {
        const csv = `name,path,defaultQuantity`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(0);
        expect(result.errors).toContain('No items found');
      });

      it('returns "No items found" for a header-only trailing newline', async () => {
        const csv = `name
`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(0);
        expect(result.errors).toContain('No items found');
      });

      it('throws if the template does not exist', async () => {
        await expect(
          importItemsFromCsv(makeGraph(), 'nonexistent', 'name\nApples'),
        ).rejects.toThrow('Template nonexistent not found');
      });
    });

    describe('default values', () => {
      it('uses empty string for missing defaultQuantity', async () => {
        const csv = `name,path
Apples,Produce/Apples`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await importItemsFromCsv(g, 't1', csv);

        expect(itemsOf(g)[0].defaultQuantity).toBe('');
      });

      it('creates items as type "item" (not category)', async () => {
        const csv = `name
Apples`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await importItemsFromCsv(g, 't1', csv);

        expect(itemsOf(g)[0].type).toBe('item');
      });
    });

    describe('sortOrder', () => {
      it('assigns sequential sortOrder to imported items', async () => {
        const csv = `name
Apples
Bananas
Milk`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await importItemsFromCsv(g, 't1', csv);

        const items = itemsOf(g);
        expect(items[0].sortOrder).toBe(0);
        expect(items[1].sortOrder).toBe(1);
        expect(items[2].sortOrder).toBe(2);
      });

      it('continues sortOrder from existing items', async () => {
        const csv = `name
New Item`;
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('existing', 'existing', { sortOrder: 10 })]),
        );

        await importItemsFromCsv(g, 't1', csv);

        expect(itemsOf(g)[1].sortOrder).toBe(11);
      });
    });

    describe('extra columns handling', () => {
      it('ignores unknown columns', async () => {
        const csv = `name,unknownColumn,path
Apples,ignored,Produce/Apples`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(1);
        const newItem = itemsOf(g)[0];
        expect(newItem.name).toBe('Apples');
        expect((newItem as unknown as Record<string, unknown>).unknownColumn).toBeUndefined();
      });

      it('handles rows with fewer columns than header', async () => {
        const csv = `name,defaultQuantity,path
Apples`;
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = await importItemsFromCsv(g, 't1', csv);

        expect(result.imported).toBe(1);
        const newItem = itemsOf(g)[0];
        expect(newItem.name).toBe('Apples');
        expect(newItem.defaultQuantity).toBe('');
        // Path defaults to name when missing
        expect(newItem.path).toBe('Apples');
      });
    });
  });
});
