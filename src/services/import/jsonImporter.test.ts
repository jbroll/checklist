/**
 * Unit tests for JSON import functionality (rowboat port, slice-2).
 *
 * `importJson(g, jsonString, ctx)` creates new top-level `template-folder` rows via
 * `folderOps.addFolder` — `ExportedData.folders` is FLAT, so no folder-tree recursion is
 * involved. `importItemsFromJson(g, templateId, jsonString)` imports items into an existing
 * template via `importItems` (see `baseImporter.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import { PATH_SEPARATOR } from '../../utils/pathUtils';
import type { ExportedData, ExportedFolder, ExportedTemplateItem } from '../export/types';
import * as folderOps from '../folderOps';
import { importItemsFromJson, importJson, type JsonImportContext } from './jsonImporter';

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
  return parseFolderRow(node.$data).items;
}

/** Default group-minting/attribution context for `importJson`. */
function ctx(overrides: Partial<JsonImportContext> = {}): JsonImportContext {
  return {
    createdBy: 'user-1',
    mintGroup: async () => 'group-new',
    ...overrides,
  };
}

describe('jsonImporter', () => {
  describe('importJson', () => {
    it('creates a new top-level template-folder for each flat entry in folders', async () => {
      const exportData: ExportedData = {
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

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      expect(result.stats.foldersCreated).toBe(1);
      const created = folderOps.topLevelFolders(g);
      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('Groceries');
      expect(created[0].type).toBe('template-folder');
    });

    it('flattens hierarchical exported items into path-keyed TemplateItems', async () => {
      const exportData: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Groceries',
            type: 'template-folder',
            items: [
              {
                id: 'cat-1',
                name: 'Produce',
                type: 'category',
                sortOrder: 0,
                children: [
                  {
                    id: 'item-1',
                    name: 'Apples',
                    type: 'item',
                    sortOrder: 0,
                    defaultQuantity: '5 lbs',
                    createdAt: '2024-11-01T00:00:00.000Z',
                    updatedAt: '2024-11-01T00:00:00.000Z',
                  },
                ],
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ],
      };

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      expect(result.stats.itemsAdded).toBe(2);
      const folderId = result.data?.folderIds?.[0];
      expect(folderId).toBeDefined();
      const items = itemsOf(g, folderId as string);
      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('Produce');
      expect(items[0].path).toBe('Produce');
      expect(items[1].name).toBe('Apples');
      expect(items[1].path).toBe(`Produce${PATH_SEPARATOR}Apples`);
      expect(items[1].defaultQuantity).toBe('5 lbs');
    });

    it('remaps session itemStates from exported item ids to newly generated ids', async () => {
      const exportData: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Shopping List',
            type: 'template-folder',
            items: [
              {
                id: 'exported-item-1',
                name: 'Milk',
                type: 'item',
                sortOrder: 0,
                defaultQuantity: '1 gallon',
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [
              {
                name: '[2024-11-01]',
                archived: false,
                viewMode: 'flat',
                itemStates: {
                  'exported-item-1': {
                    selected: true,
                    checked: true,
                    selectedAt: '2024-11-01T10:00:00.000Z',
                    checkedAt: '2024-11-01T11:00:00.000Z',
                  },
                },
                createdAt: '2024-11-01T10:00:00.000Z',
                lastActivityAt: '2024-11-01T11:00:00.000Z',
              },
            ],
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ],
      };

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      expect(result.stats.sessionsCreated).toBe(1);
      const folderId = result.data?.folderIds?.[0] as string;
      const items = itemsOf(g, folderId);
      const newItemId = items[0].id;
      expect(newItemId).not.toBe('exported-item-1');
      const sessions = parseFolderRow(g.folder(folderId)!.$data).sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].itemStates[newItemId]).toBeDefined();
      expect(sessions[0].itemStates[newItemId].selected).toBe(true);
      expect(sessions[0].itemStates[newItemId].checked).toBe(true);
    });

    it('creates folders under ctx.parentId when provided', async () => {
      const g = graphWith(templateFolder('parent-1', 'Parent'));
      const exportData: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Weekly Shopping',
            type: 'template-folder',
            items: [],
            sessions: [],
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ],
      };

      const result = await importJson(g, JSON.stringify(exportData), ctx({ parentId: 'parent-1' }));

      expect(result.success).toBe(true);
      const folderId = result.data?.folderIds?.[0] as string;
      expect(folderOps.findById(g, folderId)?.parent_id).toBe('parent-1');
    });

    it('renames on name conflict with existing sibling and warns', async () => {
      const g = graphWith(templateFolder('t1', 'Groceries'));
      const exportData: ExportedData = {
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

      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const folderId = result.data?.folderIds?.[0] as string;
      expect(folderOps.findById(g, folderId)?.name).toBe('Groceries (1)');
      expect(result.warnings.some((w) => w.includes('name conflict'))).toBe(true);
    });

    describe('error handling', () => {
      it('should reject invalid JSON', async () => {
        const result = await importJson(makeGraph(), 'invalid json{{{', ctx());

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Invalid JSON');
      });

      it('should validate export format version', async () => {
        const invalidData = {
          version: 'unknown',
          folders: [],
        };

        const result = await importJson(makeGraph(), JSON.stringify(invalidData), ctx());

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('importItemsFromJson', () => {
    describe('format detection', () => {
      it('should import items from ExportedData (full export)', async () => {
        const exportData: ExportedData = {
          version: '2.0',
          exportDate: '2024-11-01T00:00:00.000Z',
          appVersion: '1.0.0',
          folders: [
            {
              name: 'Groceries',
              type: 'template-folder',
              items: [
                {
                  id: 'item-1',
                  name: 'Apples',
                  type: 'item',
                  sortOrder: 0,
                  createdAt: '2024-11-01T00:00:00.000Z',
                  updatedAt: '2024-11-01T00:00:00.000Z',
                },
              ],
              createdAt: '2024-11-01T00:00:00.000Z',
              updatedAt: '2024-11-01T00:00:00.000Z',
            },
          ],
        };

        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', JSON.stringify(exportData));

        expect(result.imported).toBe(1);
        expect(result.errors).toHaveLength(0);
      });

      it('should import items from ExportedFolder (single folder)', async () => {
        const folder: ExportedFolder = {
          name: 'Shopping List',
          type: 'template-folder',
          items: [
            {
              id: 'item-1',
              name: 'Milk',
              type: 'item',
              sortOrder: 0,
              createdAt: '2024-11-01T00:00:00.000Z',
              updatedAt: '2024-11-01T00:00:00.000Z',
            },
            {
              id: 'item-2',
              name: 'Bread',
              type: 'item',
              sortOrder: 1,
              createdAt: '2024-11-01T00:00:00.000Z',
              updatedAt: '2024-11-01T00:00:00.000Z',
            },
          ],
          createdAt: '2024-11-01T00:00:00.000Z',
          updatedAt: '2024-11-01T00:00:00.000Z',
        };

        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', JSON.stringify(folder));

        expect(result.imported).toBe(2);
        expect(result.errors).toHaveLength(0);
      });

      it('should import items from ExportedTemplateItem[] (items array)', async () => {
        const items: ExportedTemplateItem[] = [
          {
            id: 'item-1',
            name: 'Eggs',
            type: 'item',
            sortOrder: 0,
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
          {
            id: 'item-2',
            name: 'Butter',
            type: 'item',
            sortOrder: 1,
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ];

        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', JSON.stringify(items));

        expect(result.imported).toBe(2);
        expect(result.errors).toHaveLength(0);
      });

      it('should flatten hierarchical items', async () => {
        const items: ExportedTemplateItem[] = [
          {
            id: 'cat-1',
            name: 'Produce',
            type: 'category',
            sortOrder: 0,
            children: [
              {
                id: 'item-1',
                name: 'Apples',
                type: 'item',
                sortOrder: 0,
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ];

        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', JSON.stringify(items));

        // Should import category + item
        expect(result.imported).toBe(2);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('error handling', () => {
      it('should reject invalid JSON', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', 'not valid json{{{');

        expect(result.imported).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Invalid JSON');
      });

      it('should reject unrecognized format', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', '{"foo": "bar"}');

        expect(result.imported).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('does not contain recognizable');
      });

      it('should reject empty items array', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));
        const result = await importItemsFromJson(g, 't1', '[]');

        expect(result.imported).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('No items found');
      });

      it('throws if the template does not exist', async () => {
        const items: ExportedTemplateItem[] = [
          {
            id: 'item-1',
            name: 'Eggs',
            type: 'item',
            sortOrder: 0,
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ];

        await expect(
          importItemsFromJson(makeGraph(), 'nonexistent', JSON.stringify(items)),
        ).rejects.toThrow('Template nonexistent not found');
      });
    });
  });
});
