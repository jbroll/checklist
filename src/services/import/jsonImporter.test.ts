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
import { parseUserSettingsRow } from '@/schema/userSettingsData';
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

/** Read a folder row, failing the test loudly if it is missing. */
function requireFolderRow(g: Graph, id: string): FolderRow {
  const row = folderOps.findById(g, id);
  if (!row) throw new Error(`folder ${id} not found after import`);
  return row;
}

/** Default group-minting/attribution context for `importJson`. */
function ctx(overrides: Partial<JsonImportContext> = {}): JsonImportContext {
  return {
    createdBy: 'user-1',
    mintGroup: async () => 'group-new',
    ...overrides,
  };
}

const NOV_1_ISO = '2024-11-01T00:00:00.000Z';

/** A v2.1 ExportedData literal. */
function v21(folders: ExportedFolder[], userSettings?: ExportedData['userSettings']): ExportedData {
  return {
    version: '2.1',
    exportDate: NOV_1_ISO,
    appVersion: '1.0.0',
    folders,
    ...(userSettings ? { userSettings } : {}),
  };
}

/** A v2.1 ExportedFolder literal. */
function v21Folder(
  id: string | undefined,
  name: string,
  type: 'folder' | 'template-folder',
  parentId: string | null | undefined,
  extra: Partial<ExportedFolder> = {},
): ExportedFolder {
  return {
    name,
    type,
    ...(id !== undefined ? { id } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    createdAt: NOV_1_ISO,
    updatedAt: NOV_1_ISO,
    ...extra,
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
      const sessions = requireFolderRow(g, folderId).sessions;
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

  describe('v2.1 import restoration', () => {
    it('rebuilds the folder tree, reusing exported folder ids and honoring parent_id', async () => {
      const exportData = v21([
        v21Folder('org-1', 'Home', 'folder', null),
        v21Folder('tpl-1', 'Groceries', 'template-folder', 'org-1'),
        v21Folder('tpl-2', 'Tools', 'template-folder', 'org-1'),
      ]);

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      expect(result.stats.foldersCreated).toBe(3);
      expect(folderOps.findById(g, 'org-1')?.type).toBe('folder');
      expect(folderOps.findById(g, 'tpl-1')?.parent_id).toBe('org-1');
      expect(folderOps.findById(g, 'tpl-2')?.parent_id).toBe('org-1');
    });

    it('remaps a conflicting exported folder id but keeps children attached', async () => {
      const g = graphWith(templateFolder('org-1', 'Existing Org', [], { type: 'folder' }));
      const exportData = v21([
        v21Folder('org-1', 'Home', 'folder', null),
        v21Folder('tpl-1', 'Groceries', 'template-folder', 'org-1'),
      ]);

      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const ids = result.data?.folderIds ?? [];
      const orgId = ids[0];
      expect(orgId).not.toBe('org-1'); // conflicting id → remapped
      expect(folderOps.findById(g, orgId)?.name).toBe('Home');
      // tpl-1 was free → id reused, parent resolves through the remap
      expect(ids[1]).toBe('tpl-1');
      expect(folderOps.findById(g, 'tpl-1')?.parent_id).toBe(orgId);
    });

    it('preserves archived flags', async () => {
      const exportData = v21([
        v21Folder('t1', 'Archived Template', 'template-folder', null, { archived: true }),
      ]);

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      expect(folderOps.findById(g, 't1')?.archived).toBe(true);
    });

    it('restores item notes', async () => {
      const exportData = v21([
        v21Folder('t1', 'Groceries', 'template-folder', null, {
          items: [
            {
              id: 'item-1',
              name: 'Apples',
              type: 'item',
              sortOrder: 0,
              notes: 'granny smith',
              createdAt: NOV_1_ISO,
              updatedAt: NOV_1_ISO,
            },
          ],
        }),
      ]);

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const items = itemsOf(g, 't1');
      expect(items).toHaveLength(1);
      expect(items[0].notes).toBe('granny smith');
    });

    it('reuses exported session ids and restores per-state notes + categoryExpanded', async () => {
      const exportData = v21([
        v21Folder('t1', 'Groceries', 'template-folder', null, {
          items: [
            {
              id: 'item-1',
              name: 'Apples',
              type: 'item',
              sortOrder: 0,
              createdAt: NOV_1_ISO,
              updatedAt: NOV_1_ISO,
            },
          ],
          sessions: [
            {
              id: 'session-9',
              name: '2024-11-01',
              archived: false,
              viewMode: 'flat',
              categoryExpanded: { 'cat-1': true },
              itemStates: {
                'item-1': { selected: true, checked: false, notes: 'bought 3' },
              },
              createdAt: NOV_1_ISO,
              lastActivityAt: NOV_1_ISO,
            },
          ],
        }),
      ]);

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const row = requireFolderRow(g, 't1');
      const sessions = row.sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session-9');
      expect(sessions[0].categoryExpanded).toEqual({ 'cat-1': true });
      const newItemId = row.items[0].id;
      expect(newItemId).not.toBe('item-1');
      expect(sessions[0].itemStates[newItemId]).toBeDefined();
      expect(sessions[0].itemStates[newItemId].notes).toBe('bought 3');
    });

    it('remaps default_items keys to the imported item ids', async () => {
      const exportData = v21([
        v21Folder('t1', 'Groceries', 'template-folder', null, {
          items: [
            {
              id: 'exported-item-1',
              name: 'Milk',
              type: 'item',
              sortOrder: 0,
              createdAt: NOV_1_ISO,
              updatedAt: NOV_1_ISO,
            },
          ],
          defaultItems: { 'exported-item-1': true },
        }),
      ]);

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const row = requireFolderRow(g, 't1');
      const newItemId = row.items[0].id;
      expect(newItemId).not.toBe('exported-item-1');
      expect(row.default_items).toEqual({ [newItemId]: true });
    });

    it('restores per-folder settings', async () => {
      const exportData = v21([
        v21Folder('t1', 'Groceries', 'template-folder', null, {
          showZoneHeadings: true,
          autocompleteDomain: 'grocery',
          autoCategorizeEnabled: true,
        }),
      ]);

      const g = makeGraph();
      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const row = requireFolderRow(g, 't1');
      expect(row.show_zone_headings).toBe(true);
      expect(row.autocomplete_domain).toBe('grocery');
      expect(row.auto_categorize_enabled).toBe(true);
    });

    it('merges exported user_settings into an existing row', async () => {
      const g = makeGraph({
        user_settings: [
          {
            id: 'user-1',
            owner_group_id: 'user-1',
            default_autocomplete_domain: 'none',
            enable_auto_categorization: false,
            subscription_tier: 'free',
            subscription_status: 'beta',
            subscription_ends_at: 0,
            max_lists: 3,
            session_retention_days: 30,
            subscription_synced_at: 0,
            view_folder_expanded: {},
            view_template_category_expanded: {},
            view_session_category_expanded: {},
          },
        ],
      });
      const exportData = v21([], {
        defaultAutocompleteDomain: 'hardware',
        enableAutoCategorization: true,
        viewFolderExpanded: { 'org-1': true },
        viewTemplateCategoryExpanded: {},
        viewSessionCategoryExpanded: {},
      });

      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const settings = parseUserSettingsRow(g.user_settings.all()[0].$data);
      expect(settings.default_autocomplete_domain).toBe('hardware');
      expect(settings.enable_auto_categorization).toBe(true);
      expect(settings.view_folder_expanded).toEqual({ 'org-1': true });
      expect(g.user_settings.all()).toHaveLength(1);
    });

    it('creates a user_settings row from the export when none exists', async () => {
      const g = makeGraph();
      const exportData = v21([], {
        defaultAutocompleteDomain: 'hardware',
        enableAutoCategorization: true,
        viewFolderExpanded: {},
        viewTemplateCategoryExpanded: {},
        viewSessionCategoryExpanded: {},
      });

      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      const settings = parseUserSettingsRow(g.user_settings.all()[0].$data);
      expect(settings.default_autocomplete_domain).toBe('hardware');
      expect(settings.enable_auto_categorization).toBe(true);
    });

    it('keeps name-conflict rename behavior, scoped per parent', async () => {
      const g = graphWith(
        templateFolder('org-1', 'Home', [], { type: 'folder' }),
        templateFolder('org-2', 'Work', [], { type: 'folder' }),
      );
      const exportData = v21([
        v21Folder('a-1', 'Groceries', 'template-folder', 'org-1'),
        v21Folder('a-2', 'Groceries', 'template-folder', 'org-2'),
      ]);

      const result = await importJson(g, JSON.stringify(exportData), ctx());

      expect(result.success).toBe(true);
      expect(folderOps.findById(g, 'a-1')?.name).toBe('Groceries');
      expect(folderOps.findById(g, 'a-2')?.name).toBe('Groceries');
      expect(folderOps.findById(g, 'a-1')?.parent_id).toBe('org-1');
      expect(folderOps.findById(g, 'a-2')?.parent_id).toBe('org-2');
    });
  });
});
