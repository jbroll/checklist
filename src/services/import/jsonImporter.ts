/**
 * JSON import functionality (rowboat port, slice-2)
 *
 * Imports template folders (with items + session history) from JSON format. Supports v2.0
 * (hierarchical items with IDs) format — see `../export/jsonExporter.ts`, whose output this
 * mirrors: `ExportedData.folders` is a FLAT array of template folders (the export format never
 * nests organizational folders), so import creates one new top-level `template-folder` row per
 * entry — no folder-tree recursion needed.
 *
 * Ported off Jazz: takes the rowboat graph `g` + a `mintGroup`/`createdBy` pair (same contract
 * as `useCheckListHierarchy.addFolder`) instead of a Jazz `Account`, and writes plain `FolderRow`s
 * via `folderOps.addFolder` instead of `FolderNode.create`/`Group.create`.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { generateId } from '../../lib/utils';
import type { ItemState, SessionData, schema, TemplateItem } from '../../schema/folder';
import { createChildPath } from '../../utils/pathUtils';
import type {
  ExportedData,
  ExportedFolder,
  ExportedSession,
  ExportedTemplateItem,
} from '../export/types';
import * as folderOps from '../folderOps';
import { type BaseImportResult, type ItemToImport, importItems } from './baseImporter';
import type { ImportResult } from './types';
import { validateJsonData } from './validators';

type Graph = RelationalGraph<typeof schema>;

export interface JsonImportContext {
  /** Who newly-created folders are attributed to (`created_by`). */
  createdBy: string;
  /** Mints a fresh owner_group_id for a new folder — same contract as `useCheckListHierarchy`. */
  mintGroup: (parentGroupId?: string) => Promise<string>;
  /** Optional parent — new template folders are created under it (root if omitted). */
  parentId?: string | null;
}

/**
 * Import JSON data (a full/partial backup) into the graph.
 *
 * @param g - The rowboat graph
 * @param jsonString - JSON string to import
 * @param ctx - group-minting + attribution context
 * @returns Import result with success/failure info
 */
export async function importJson(
  g: Graph,
  jsonString: string,
  ctx: JsonImportContext,
): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch (error) {
    return {
      success: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
      stats: {},
    };
  }

  const validation = validateJsonData(g, data);
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
      stats: {},
    };
  }

  const exportData = data as ExportedData;
  const result = await importFolders(g, exportData, ctx);

  return {
    ...result,
    warnings: [...validation.warnings, ...result.warnings],
  };
}

/**
 * Import items from JSON into an existing template.
 *
 * Accepts multiple JSON formats:
 * - ExportedData (full export) - extracts items from all folders
 * - ExportedFolder (single folder) - extracts items directly
 * - ExportedTemplateItem[] (items array) - uses items directly
 *
 * @param g - The rowboat graph
 * @param templateId - Template folder to import items into
 * @param jsonString - JSON string containing items
 * @returns Import result with statistics
 */
export async function importItemsFromJson(
  g: Graph,
  templateId: string,
  jsonString: string,
): Promise<BaseImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch (error) {
    return {
      imported: 0,
      skipped: 0,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
      duplicates: [],
    };
  }

  const exportedItems = extractItemsFromJson(data);
  if (!exportedItems) {
    return {
      imported: 0,
      skipped: 0,
      errors: ['JSON does not contain recognizable item data'],
      duplicates: [],
    };
  }

  if (exportedItems.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: ['No items found in JSON'],
      duplicates: [],
    };
  }

  const itemsToImport = flattenExportedItemsToImport(exportedItems, undefined);
  return importItems(g, templateId, itemsToImport);
}

function extractItemsFromJson(data: unknown): ExportedTemplateItem[] | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if ('folders' in data && Array.isArray((data as ExportedData).folders)) {
    const exportData = data as ExportedData;
    const allItems: ExportedTemplateItem[] = [];
    for (const folder of exportData.folders) {
      if (folder.items && Array.isArray(folder.items)) {
        allItems.push(...folder.items);
      }
    }
    return allItems;
  }

  if ('name' in data && 'items' in data && Array.isArray((data as ExportedFolder).items)) {
    return (data as ExportedFolder).items || [];
  }

  if (Array.isArray(data)) {
    const isValidItemArray = data.every(
      (item) => item && typeof item === 'object' && 'name' in item && typeof item.name === 'string',
    );
    if (isValidItemArray) {
      return data as ExportedTemplateItem[];
    }
  }

  return null;
}

function flattenExportedItemsToImport(
  exportedItems: ExportedTemplateItem[],
  parentPath: string | undefined,
): ItemToImport[] {
  const items: ItemToImport[] = [];

  for (const exportedItem of exportedItems) {
    const itemPath = createChildPath(parentPath, exportedItem.name);

    items.push({
      name: exportedItem.name,
      path: itemPath,
      type: exportedItem.type || 'item',
      defaultQuantity: exportedItem.defaultQuantity || '',
    });

    if (exportedItem.children && exportedItem.children.length > 0) {
      items.push(...flattenExportedItemsToImport(exportedItem.children, itemPath));
    }
  }

  return items;
}

async function importFolders(
  g: Graph,
  data: ExportedData,
  ctx: JsonImportContext,
): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const folderIds: string[] = [];
  let foldersCreated = 0;
  let itemsAdded = 0;
  let sessionsCreated = 0;

  const parentId = ctx.parentId ?? null;
  const parentGroupId = parentId ? folderOps.findById(g, parentId)?.owner_group_id : undefined;
  const siblingNames = new Set(folderOps.childrenOf(g, parentId).map((f) => f.name));

  for (const exportedFolder of data.folders) {
    try {
      let finalName = exportedFolder.name;
      let nameConflict = false;
      if (siblingNames.has(finalName)) {
        let counter = 1;
        while (siblingNames.has(`${exportedFolder.name} (${counter})`)) counter++;
        finalName = `${exportedFolder.name} (${counter})`;
        nameConflict = true;
      }
      siblingNames.add(finalName);

      const idMap = new Map<string, string>();
      const items = exportedFolder.items
        ? flattenHierarchicalItems(exportedFolder.items, undefined, idMap)
        : [];
      const sessions = (exportedFolder.sessions ?? []).map((s) => importSession(s, items, idMap));

      const ownerGroupId = await ctx.mintGroup(parentGroupId);
      const now = Date.now();
      const row = await folderOps.addFolder(g, {
        id: generateId(),
        name: finalName,
        parentId,
        type: 'template-folder',
        ownerGroupId,
        createdBy: ctx.createdBy,
        now,
      });
      await g.folder.update(row.id, {
        items,
        sessions,
        created_at: new Date(exportedFolder.createdAt).getTime(),
        updated_at: new Date(exportedFolder.updatedAt).getTime(),
      });

      foldersCreated++;
      itemsAdded += items.length;
      sessionsCreated += sessions.length;
      folderIds.push(row.id);

      if (nameConflict) {
        warnings.push(
          `Template "${exportedFolder.name}" imported as "${finalName}" due to name conflict`,
        );
      }
    } catch (error) {
      errors.push(
        `Failed to import template "${exportedFolder.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    stats: { foldersCreated, itemsAdded, sessionsCreated },
    data: { folderIds },
  };
}

function flattenHierarchicalItems(
  exportedItems: ExportedTemplateItem[],
  parentPath: string | undefined,
  idMap: Map<string, string>,
): TemplateItem[] {
  const items: TemplateItem[] = [];
  let sortOrderCounter = 0;

  for (const exportedItem of exportedItems) {
    const newId = generateId();
    if (exportedItem.id) idMap.set(exportedItem.id, newId);

    const itemPath = createChildPath(parentPath, exportedItem.name);

    items.push({
      id: newId,
      name: exportedItem.name,
      type: exportedItem.type,
      path: itemPath,
      expanded: exportedItem.expanded ?? false,
      sortOrder: exportedItem.sortOrder ?? sortOrderCounter++,
      archived: false,
      defaultQuantity: exportedItem.defaultQuantity || '',
      createdAt: new Date(exportedItem.createdAt).getTime(),
    });

    if (exportedItem.children && exportedItem.children.length > 0) {
      items.push(...flattenHierarchicalItems(exportedItem.children, itemPath, idMap));
    }
  }

  return items;
}

function importSession(
  exportedSession: ExportedSession,
  items: TemplateItem[],
  idMap: Map<string, string>,
): SessionData {
  const itemStates: Record<string, ItemState> = {};

  for (const [oldItemId, exportedState] of Object.entries(exportedSession.itemStates)) {
    const newItemId = idMap.get(oldItemId);
    if (newItemId) {
      itemStates[newItemId] = {
        selected: exportedState.selected,
        checked: exportedState.checked,
        selectedAt: exportedState.selectedAt
          ? new Date(exportedState.selectedAt).getTime()
          : undefined,
        checkedAt: exportedState.checkedAt
          ? new Date(exportedState.checkedAt).getTime()
          : undefined,
      };
    }
  }

  const selectedCount = Object.values(itemStates).filter((s) => s.selected).length;
  const checkedCount = Object.values(itemStates).filter((s) => s.checked).length;
  const remainingCount = items.length - checkedCount;

  return {
    id: generateId(),
    itemStates,
    archived: exportedSession.archived ?? false,
    viewMode: exportedSession.viewMode || 'zone-in-hierarchy',
    categoryExpanded: {},
    selectedCount,
    checkedCount,
    remainingCount,
    createdAt: new Date(exportedSession.createdAt).getTime(),
    lastActivityAt: new Date(exportedSession.lastActivityAt).getTime(),
  };
}
