/**
 * Unit tests for the JSON exporter (rowboat port, slice-2).
 *
 * A template is a folder row of `type: 'template-folder'`; its items/sessions live in the row's
 * `items`/`sessions` json columns, with epoch-ms NUMBER timestamps. Tests seed an in-memory
 * `makeGraph()` graph — no Jazz — and assert on the exported ISO-string shape.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, ItemState, SessionData, TemplateItem } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import { PATH_SEPARATOR } from '../../utils/pathUtils';
import { exportAllFolders, exportTemplate, toJsonString } from './jsonExporter';
import type { ExportedData } from './types';

type Graph = ReturnType<typeof makeGraph>;

/** Epoch-ms for the ISO string the old Jazz mocks used. */
const NOV_1 = new Date('2024-11-01T00:00:00.000Z').getTime();
const NOV_1_ISO = '2024-11-01T00:00:00.000Z';

/** Build a complete template-folder row (all required Folder columns present). */
function templateFolder(
  id: string,
  name: string,
  items: TemplateItem[] = [],
  sessions: SessionData[] = [],
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
    created_at: NOV_1,
    updated_at: NOV_1,
    items,
    sessions,
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
    ...extra,
  };
}

/** Build a template item. `path` defaults to `name`; categories default to expanded. */
function item(
  id: string,
  name: string,
  type: 'category' | 'item' = 'item',
  path?: string,
  sortOrder = 0,
  extra: Partial<TemplateItem> = {},
): TemplateItem {
  return {
    id,
    name,
    type,
    path: path ?? name,
    expanded: type === 'category',
    sortOrder,
    archived: false,
    defaultQuantity: '',
    createdAt: NOV_1,
    ...extra,
  };
}

/** Build a session. */
function session(
  id: string,
  itemStates: Record<string, ItemState> = {},
  extra: Partial<SessionData> = {},
): SessionData {
  return {
    id,
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'flat',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: NOV_1,
    lastActivityAt: NOV_1,
    ...extra,
  };
}

function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

describe('jsonExporter', () => {
  describe('toJsonString', () => {
    it('should convert exported data to JSON string with pretty formatting', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: NOV_1_ISO,
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('\n');
      expect(result).toContain('  '); // indentation
      expect(result).toContain('"version": "2.0"');
    });

    it('should convert exported data to compact JSON string', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: NOV_1_ISO,
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      expect(result).not.toContain('\n  ');
      expect(result).toContain('{"version":"2.0"');
    });

    it('should handle complex nested data structures', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: NOV_1_ISO,
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            items: [
              {
                id: 'item-1',
                name: 'Test Item',
                type: 'item',
                sortOrder: 0,
                createdAt: NOV_1_ISO,
                updatedAt: NOV_1_ISO,
              },
            ],
            sessions: [],
            createdAt: NOV_1_ISO,
            updatedAt: NOV_1_ISO,
          },
        ],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"Test Folder"');
      expect(result).toContain('"Test Item"');
    });

    it('should preserve date strings in ISO format', () => {
      const dateStr = '2024-11-01T12:00:00.000Z';
      const data: ExportedData = {
        version: '2.0',
        exportDate: dateStr,
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      expect(result).toContain(dateStr);
    });

    it('should handle empty folders array', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: NOV_1_ISO,
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"folders": []');
    });

    it('should omit undefined optional fields', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: NOV_1_ISO,
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            items: [
              {
                id: 'item-1',
                name: 'Item',
                type: 'item',
                sortOrder: 0,
                createdAt: NOV_1_ISO,
                updatedAt: NOV_1_ISO,
                // defaultQuantity is optional and not provided
              },
            ],
            sessions: [],
            createdAt: NOV_1_ISO,
            updatedAt: NOV_1_ISO,
          },
        ],
      };

      const result = toJsonString(data, false);

      expect(JSON.parse(result)).toBeDefined();
      expect(result).toContain('"name":"Item"');
      expect(result).not.toContain('defaultQuantity');
    });
  });

  describe('exportAllFolders', () => {
    it('should export all template folders with their items and sessions', () => {
      const g = graphWith(
        templateFolder(
          't1',
          'Test Template',
          [item('item-1', 'Test Item', 'item', 'test-item', 0, { defaultQuantity: '1' })],
          [session('session-1', { 'item-1': { selected: true, checked: false } })],
        ),
      );

      const result = exportAllFolders(g);

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Template');
      expect(result.folders[0].items).toHaveLength(1);
      expect(result.folders[0].sessions).toHaveLength(1);
    });

    it('should export epoch-ms timestamps as ISO strings', () => {
      const g = graphWith(
        templateFolder(
          't1',
          'Test Template',
          [item('item-1', 'Test Item')],
          [session('session-1')],
        ),
      );

      const result = exportAllFolders(g);

      expect(result.folders[0].createdAt).toBe(NOV_1_ISO);
      expect(result.folders[0].updatedAt).toBe(NOV_1_ISO);
      expect(result.folders[0].items?.[0].createdAt).toBe(NOV_1_ISO);
      expect(result.folders[0].sessions?.[0].createdAt).toBe(NOV_1_ISO);
    });

    it('should handle an empty graph', () => {
      const result = exportAllFolders(makeGraph());

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(0);
    });

    it('should skip archived items', () => {
      const g = graphWith(
        templateFolder('t1', 'Test Template', [
          item('item-1', 'Test Item'),
          item('item-2', 'Archived Item', 'item', 'archived-item', 1, { archived: true }),
        ]),
      );

      const result = exportAllFolders(g);

      expect(result.folders[0].items).toHaveLength(1);
      expect(result.folders[0].items?.[0].name).toBe('Test Item');
    });

    it('should skip archived template folders and their subtrees', () => {
      const g = graphWith(
        templateFolder('t1', 'Live'),
        templateFolder('t2', 'Archived', [], [], { archived: true }),
        templateFolder('org', 'Org', [], [], { type: 'folder' }),
        // a template nested under an archived organizational folder must be skipped
        templateFolder('archived-org', 'Archived Org', [], [], {
          type: 'folder',
          archived: true,
        }),
        templateFolder('t3', 'Hidden Under Archived', [], [], { parent_id: 'archived-org' }),
      );

      const result = exportAllFolders(g);

      expect(result.folders.map((f) => f.name)).toEqual(['Live']);
    });

    it('should not export organizational folders', () => {
      const g = graphWith(templateFolder('org', 'Org Folder', [], [], { type: 'folder' }));

      const result = exportAllFolders(g);

      expect(result.folders).toHaveLength(0);
    });

    it('should export session item states with ISO dates', () => {
      const g = graphWith(
        templateFolder(
          't1',
          'Test Template',
          [item('item-1', 'Test Item')],
          [
            session('session-1', {
              'item-1': { selected: true, checked: false, selectedAt: NOV_1 },
            }),
          ],
        ),
      );

      const result = exportAllFolders(g);

      const exported = result.folders[0].sessions?.[0];
      expect(exported).toBeDefined();
      expect(exported?.itemStates['item-1']).toEqual({
        selected: true,
        checked: false,
        selectedAt: NOV_1_ISO,
      });
    });
  });

  describe('exportTemplate', () => {
    it('should export a single template folder', () => {
      const folder = templateFolder('t1', 'Test Template', [item('item-1', 'Test Item')]);

      const result = exportTemplate(folder);

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Template');
    });

    it('should export timestamps as ISO strings', () => {
      const folder = templateFolder('t1', 'Test Template');

      const result = exportTemplate(folder);

      expect(result.folders[0].createdAt).toBe(NOV_1_ISO);
      expect(result.folders[0].updatedAt).toBe(NOV_1_ISO);
    });

    it('should not include currentSessionId (removed from schema)', () => {
      const folder = templateFolder('t1', 'Test Template');

      const result = exportTemplate(folder);

      expect(result.folders[0].currentSessionId).toBeUndefined();
    });

    it('should handle a template without items or sessions', () => {
      const folder = templateFolder('t2', 'Empty Template');

      const result = exportTemplate(folder);

      expect(result.folders[0].items).toEqual([]);
      expect(result.folders[0].sessions).toEqual([]);
      expect(result.folders[0].currentSessionId).toBeUndefined();
    });
  });

  describe('v2.0 hierarchical format', () => {
    it('should export items in hierarchical structure with nested children', () => {
      const g = graphWith(
        templateFolder('t1', 'Groceries', [
          item('cat-1', 'Produce', 'category', 'produce', 0),
          item('cat-2', 'Fruits', 'category', `produce${PATH_SEPARATOR}fruits`, 1),
          item(
            'item-1',
            'Apples',
            'item',
            `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples`,
            2,
            {
              defaultQuantity: '5 lbs',
            },
          ),
          item(
            'item-2',
            'Bananas',
            'item',
            `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}bananas`,
            3,
            { defaultQuantity: '1 bunch' },
          ),
        ]),
      );

      const result = exportAllFolders(g);

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);

      const items = result.folders[0].items;
      expect(items).toBeDefined();
      expect(items).toHaveLength(1); // only 1 root category

      const produce = items?.[0];
      expect(produce?.id).toBe('cat-1');
      expect(produce?.name).toBe('Produce');
      expect(produce?.type).toBe('category');
      expect(produce?.children).toHaveLength(1); // Fruits

      const fruits = produce?.children?.[0];
      expect(fruits?.id).toBe('cat-2');
      expect(fruits?.name).toBe('Fruits');
      expect(fruits?.type).toBe('category');
      expect(fruits?.children).toHaveLength(2); // Apples and Bananas

      const apples = fruits?.children?.[0];
      expect(apples?.id).toBe('item-1');
      expect(apples?.name).toBe('Apples');
      expect(apples?.type).toBe('item');
      expect(apples?.defaultQuantity).toBe('5 lbs');
      expect(apples?.children).toBeUndefined(); // items have no children

      const bananas = fruits?.children?.[1];
      expect(bananas?.id).toBe('item-2');
      expect(bananas?.name).toBe('Bananas');
      expect(bananas?.defaultQuantity).toBe('1 bunch');
    });

    it('should export session states with neutral terminology and item IDs', () => {
      const g = graphWith(
        templateFolder(
          't1',
          'Shopping List',
          [
            item('item-1', 'Milk', 'item', 'milk', 0, { defaultQuantity: '1 gallon' }),
            item('item-2', 'Bread', 'item', 'bread', 1, { defaultQuantity: '1 loaf' }),
          ],
          [
            session('session-1', {
              'item-1': { selected: true, checked: false, selectedAt: NOV_1 },
              'item-2': { selected: true, checked: true, selectedAt: NOV_1, checkedAt: NOV_1 },
            }),
          ],
        ),
      );

      const result = exportAllFolders(g);

      const exported = result.folders[0].sessions?.[0];
      expect(exported).toBeDefined();

      expect(exported?.itemStates['item-1']).toEqual({
        selected: true,
        checked: false,
        selectedAt: NOV_1_ISO,
      });

      expect(exported?.itemStates['item-2']).toEqual({
        selected: true,
        checked: true,
        selectedAt: NOV_1_ISO,
        checkedAt: NOV_1_ISO,
      });
    });

    it('should include item IDs in exported items for session state mapping', () => {
      const g = graphWith(templateFolder('t1', 'Test Template', [item('item-1', 'Test Item')]));

      const result = exportAllFolders(g);

      const items = result.folders[0].items;
      expect(items?.[0].id).toBe('item-1');
    });

    it('should export multiple levels of nesting correctly', () => {
      const g = graphWith(
        templateFolder('t1', 'Deep Structure', [
          item('level-1', 'Level 1', 'category', 'level-1', 0),
          item('level-2', 'Level 2', 'category', `level-1${PATH_SEPARATOR}level-2`, 1),
          item(
            'level-3',
            'Level 3',
            'category',
            `level-1${PATH_SEPARATOR}level-2${PATH_SEPARATOR}level-3`,
            2,
          ),
          item(
            'deep-item',
            'Deep Item',
            'item',
            `level-1${PATH_SEPARATOR}level-2${PATH_SEPARATOR}level-3${PATH_SEPARATOR}deep-item`,
            3,
            { defaultQuantity: '1' },
          ),
        ]),
      );

      const result = exportAllFolders(g);

      const items = result.folders[0].items;
      expect(items).toHaveLength(1);

      const level1 = items?.[0];
      expect(level1?.name).toBe('Level 1');
      expect(level1?.children).toHaveLength(1);

      const level2 = level1?.children?.[0];
      expect(level2?.name).toBe('Level 2');
      expect(level2?.children).toHaveLength(1);

      const level3 = level2?.children?.[0];
      expect(level3?.name).toBe('Level 3');
      expect(level3?.children).toHaveLength(1);

      const deepItem = level3?.children?.[0];
      expect(deepItem?.name).toBe('Deep Item');
      expect(deepItem?.type).toBe('item');
      expect(deepItem?.children).toBeUndefined();
    });
  });
});
