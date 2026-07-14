/**
 * Unit tests for the main import service (rowboat port, slice-2).
 *
 * NOTE (scope): `importSessionFromCsvFile` / session-CSV import is REMOVED — dead code that was
 * never wired into `ImportDialog`/`useImportDialog` even pre-port. Its old test coverage is
 * dropped, not preserved. New template creation goes through `folderOps.addFolder` +
 * `folderOps.generateUniqueName` instead of the old `checklistFolderFactory`.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import * as folderOps from '../folderOps';
import {
  importAsNewTemplate,
  importFromFile,
  importItemsFromCsvFile,
  importItemsFromJsonFile,
  importItemsFromTxtFile,
} from './importService';
import type { JsonImportContext } from './jsonImporter';

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

function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

function itemsOf(g: Graph, id: string): TemplateItem[] {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return node.$data.items;
}

function ctx(overrides: Partial<JsonImportContext> = {}): JsonImportContext {
  return {
    createdBy: 'user-1',
    mintGroup: async () => 'group-new',
    ...overrides,
  };
}

function createFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('importService', () => {
  describe('importItemsFromTxtFile', () => {
    it('imports items from a valid txt file', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const file = createFile('list.txt', 'Apples\nBananas');

      const result = await importItemsFromTxtFile(g, 't1', file);

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(itemsOf(g, 't1')).toHaveLength(2);
    });

    it('returns error for invalid extension without throwing', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const file = createFile('list.json', 'Apples');

      const result = await importItemsFromTxtFile(g, 't1', file);

      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('Invalid file type');
      expect(result.metadata).toEqual({});
    });
  });

  describe('importItemsFromJsonFile', () => {
    it('imports items from a valid json file', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const items = [
        {
          id: 'item-1',
          name: 'Eggs',
          type: 'item',
          sortOrder: 0,
          createdAt: '2024-11-01T00:00:00.000Z',
          updatedAt: '2024-11-01T00:00:00.000Z',
        },
      ];
      const file = createFile('items.json', JSON.stringify(items));

      const result = await importItemsFromJsonFile(g, 't1', file);

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for invalid extension without throwing', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const file = createFile('items.txt', '[]');

      const result = await importItemsFromJsonFile(g, 't1', file);

      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('Invalid file type');
    });
  });

  describe('importItemsFromCsvFile', () => {
    it('imports items from a valid csv file', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const file = createFile('items.csv', 'name\nApples\nBananas');

      const result = await importItemsFromCsvFile(g, 't1', file);

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for invalid extension without throwing', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const file = createFile('items.json', 'name\nApples');

      const result = await importItemsFromCsvFile(g, 't1', file);

      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('Invalid file type');
    });
  });

  describe('importFromFile', () => {
    it('auto-detects JSON file type and delegates to importJson', async () => {
      const g = makeGraph();
      const exportData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Groceries',
            type: 'template-folder',
            items: [],
            sessions: [],
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ],
      };
      const file = createFile('data.json', JSON.stringify(exportData));

      const result = await importFromFile(g, file, ctx());

      expect(result.success).toBe(true);
      expect(result.stats.foldersCreated).toBe(1);
    });

    it('directs TXT files to importAsNewTemplate instead of importing directly', async () => {
      const g = makeGraph();
      const file = createFile('items.txt', 'Item1\nItem2');

      const result = await importFromFile(g, file, ctx());

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Use importAsNewTemplate()');
    });

    it('directs CSV files to importAsNewTemplate instead of importing directly', async () => {
      const g = makeGraph();
      const file = createFile('data.csv', 'name\nItem1');

      const result = await importFromFile(g, file, ctx());

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Use importAsNewTemplate()');
    });

    it('uses explicit fileType override to skip extension-based detection', async () => {
      const g = makeGraph();
      const exportData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };
      // No extension at all — detectFileType() would return null and importFromFile would
      // short-circuit with "Unable to determine file type" before ever validating the file.
      // Passing fileType explicitly skips that step (validateImportFile below still checks the
      // real extension against ['json'], so the filename must end in .json to pass).
      const file = createFile('data.json', JSON.stringify(exportData));

      const result = await importFromFile(g, file, ctx(), 'json');

      expect(result.success).toBe(true);
    });

    it('returns error when file type cannot be detected', async () => {
      const g = makeGraph();
      const file = createFile('data.xyz', 'content');

      const result = await importFromFile(g, file, ctx());

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Unable to determine file type');
    });
  });

  describe('importAsNewTemplate', () => {
    it('uses metadata name when present in TXT file', async () => {
      const g = makeGraph();
      const fileContent = `
# name: My Custom List
# description: Test description

Item1
Item2
      `.trim();
      const file = createFile('some-filename.txt', fileContent);

      const result = await importAsNewTemplate(g, file, undefined, 'txt', ctx());

      expect(result.success).toBe(true);
      const created = folderOps.topLevelFolders(g);
      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('My Custom List');
    });

    it('uses provided templateName over metadata name', async () => {
      const g = makeGraph();
      const fileContent = `
# name: Metadata Name

Item1
      `.trim();
      const file = createFile('filename.txt', fileContent);

      await importAsNewTemplate(g, file, 'Explicit Name', 'txt', ctx());

      const created = folderOps.topLevelFolders(g);
      expect(created[0].name).toBe('Explicit Name');
    });

    it('falls back to filename when no metadata and no explicit name', async () => {
      const g = makeGraph();
      const fileContent = `
Item1
Item2
      `.trim();
      const file = createFile('my-shopping-list.txt', fileContent);

      await importAsNewTemplate(g, file, undefined, 'txt', ctx());

      const created = folderOps.topLevelFolders(g);
      expect(created[0].name).toBe('my-shopping-list');
    });

    it('does not use metadata for CSV files (falls back to filename)', async () => {
      const g = makeGraph();
      const fileContent = `name,category
Item1,Cat1
Item2,Cat2`;
      const file = createFile('data.csv', fileContent);

      await importAsNewTemplate(g, file, undefined, 'csv', ctx());

      const created = folderOps.topLevelFolders(g);
      expect(created[0].name).toBe('data');
    });

    it('dedupes the new template name against existing siblings', async () => {
      const g = graphWith(templateFolder('t1', 'my-list'));
      const file = createFile('my-list.txt', 'Item1');

      const result = await importAsNewTemplate(g, file, undefined, 'txt', ctx());

      expect(result.success).toBe(true);
      const created = folderOps.topLevelFolders(g).find((f) => f.id !== 't1');
      expect(created?.name).toBe('my-list (2)');
    });

    it('returns error and creates nothing when the file fails validation', async () => {
      const g = makeGraph();
      const file = createFile('test.invalid', 'content');

      const result = await importAsNewTemplate(g, file, 'Test', 'txt', ctx());

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid file type');
      expect(folderOps.topLevelFolders(g)).toHaveLength(0);
    });

    it('cleans up the created template if the import yields zero items and errors', async () => {
      const g = makeGraph();
      // Empty CSV (header only) -> "No items found" error, 0 imported.
      const file = createFile('empty.csv', 'name,path');

      const result = await importAsNewTemplate(g, file, 'Empty', 'csv', ctx());

      expect(result.success).toBe(false);
      expect(folderOps.topLevelFolders(g)).toHaveLength(0);
    });

    it('succeeds with 0 items imported for a single-line TXT file (no error)', async () => {
      const g = makeGraph();
      const file = createFile('single.txt', 'Item1');

      const result = await importAsNewTemplate(g, file, 'Single', 'txt', ctx());

      expect(result.success).toBe(true);
      expect(result.stats.itemsAdded).toBe(1);
    });

    it('sets defaultItems for all imported leaf items', async () => {
      const g = makeGraph();
      const file = createFile('groceries.txt', 'Butter\nMilk\nBread\nEggs');

      const result = await importAsNewTemplate(g, file, 'Groceries', 'txt', ctx());

      expect(result.success).toBe(true);
      expect(result.stats.itemsAdded).toBe(4);
      const created = folderOps.topLevelFolders(g)[0];
      const items = itemsOf(g, created.id);
      const defaults = g.folder(created.id)?.$data.default_items ?? {};
      expect(Object.keys(defaults)).toHaveLength(4);
      for (const item of items) {
        expect(defaults[item.id]).toBe(true);
      }
    });

    it('only sets defaultItems for items, not categories', async () => {
      const g = makeGraph();
      // TXT with indentation creates both category and item nodes
      const file = createFile('groceries.txt', 'Dairy\n  Butter\n  Milk');

      const result = await importAsNewTemplate(g, file, 'Groceries', 'txt', ctx());

      expect(result.success).toBe(true);
      const created = folderOps.topLevelFolders(g)[0];
      const items = itemsOf(g, created.id);
      // 3 items total: 1 category (Dairy) + 2 items (Butter, Milk)
      expect(items).toHaveLength(3);

      const defaults = g.folder(created.id)?.$data.default_items ?? {};
      expect(Object.keys(defaults)).toHaveLength(2);
      for (const item of items) {
        if (item.type === 'item') {
          expect(defaults[item.id]).toBe(true);
        } else {
          expect(defaults[item.id]).toBeUndefined();
        }
      }
    });

    it('reports duplicate-item warning for CSV imports with duplicate rows', async () => {
      const g = makeGraph();
      const file = createFile('data.csv', 'name,category\nItem1,Cat1\nItem1,Cat1');

      const result = await importAsNewTemplate(g, file, 'Test', 'csv', ctx());

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('duplicate'))).toBe(true);
    });

    it('enables auto_categorize_enabled when options.autoCategorize is set', async () => {
      const g = makeGraph();
      const file = createFile('list.txt', 'Item1');

      await importAsNewTemplate(g, file, 'Test', 'txt', ctx(), { autoCategorize: true });

      const created = folderOps.topLevelFolders(g)[0];
      expect(created.auto_categorize_enabled).toBe(true);
    });

    it('creates the template under ctx.parentId when provided', async () => {
      const g = graphWith(templateFolder('parent-1', 'Parent'));
      const file = createFile('list.txt', 'Item1');

      await importAsNewTemplate(g, file, 'Child', 'txt', ctx({ parentId: 'parent-1' }));

      const created = folderOps.childrenOf(g, 'parent-1');
      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('Child');
    });
  });
});
