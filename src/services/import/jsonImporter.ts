/**
 * JSON import functionality
 *
 * Imports a full/partial backup from JSON format. Supports v2.0 (flat template-folder list)
 * and v2.1 (folder tree with identity + settings + notes + user_settings). v2.1 `ExportedData.
 * folders` carries `id`/`parentId`/`archived`/`type` so import rebuilds the tree: folder ids
 * are reused when free (remapped on conflict), parent_id links resolve through the remap, and
 * name conflicts are resolved per parent. Exported item ids are always remapped (sessions and
 * `default_items` references follow through the id map); exported session ids are reused when
 * free, remapped only on conflict.
 *
 * Takes the rowboat graph `g` + a `mintGroup`/`createdBy` pair (same contract as
 * `useCheckListHierarchy.addFolder`), and writes plain `FolderRow`s via `folderOps.addFolder`.
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
  ExportedUserSettings,
} from '../export/types';
import { itemsList, sessionsList } from '../folderListHandles';
import * as folderOps from '../folderOps';
import { ensureUserSettings } from '../subscriptionService';
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

/** Import JSON data (a full/partial backup) into the graph. */
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
  try {
    await importUserSettings(g, exportData.userSettings, ctx);
  } catch (error) {
    result.warnings.push(
      `Failed to restore user settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

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
      ...(exportedItem.notes ? { notes: exportedItem.notes } : {}),
    });

    if (exportedItem.children && exportedItem.children.length > 0) {
      items.push(...flattenExportedItemsToImport(exportedItem.children, itemPath));
    }
  }

  return items;
}

/**
 * Order exported folders parent-first so each folder's parent (when present in the export) is
 * created before it. Folders whose parent is absent are treated as roots; leftover folders
 * (malformed parent cycles) are appended as roots so the import can't stall.
 */
function orderFoldersForImport(folders: ExportedFolder[]): ExportedFolder[] {
  const childrenByParent = new Map<string | null, ExportedFolder[]>();
  for (const folder of folders) {
    const parent = typeof folder.parentId === 'string' ? folder.parentId : null;
    const bucket = childrenByParent.get(parent);
    if (bucket) {
      bucket.push(folder);
    } else {
      childrenByParent.set(parent, [folder]);
    }
  }

  const out: ExportedFolder[] = [];
  const queued = new Set<ExportedFolder>();
  const visit = (folder: ExportedFolder): void => {
    if (queued.has(folder)) return;
    queued.add(folder);
    out.push(folder);
    for (const child of childrenByParent.get(folder.id ?? '') ?? []) {
      visit(child);
    }
  };
  for (const root of childrenByParent.get(null) ?? []) {
    visit(root);
  }
  for (const folder of folders) {
    if (!queued.has(folder)) visit(folder);
  }
  return out;
}

/** Existing sibling names for `parentId`, seeded lazily and cached per import. */
function siblingNamesFor(
  g: Graph,
  parentId: string | null,
  cache: Map<string | null, Set<string>>,
): Set<string> {
  const cached = cache.get(parentId);
  if (cached) return cached;
  const names = new Set<string>();
  if (parentId === null) {
    for (const f of folderOps.topLevelFolders(g)) names.add(f.name);
  } else {
    // An import-created parent may not be readable back yet on the real IndexedDB graph, so only
    // seed from the graph for parents that pre-exist; import-created parents get their children
    // tracked via the set as they are created.
    const parent = folderOps.findById(g, parentId);
    if (parent) for (const f of folderOps.childrenOf(g, parentId)) names.add(f.name);
  }
  cache.set(parentId, names);
  return names;
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

  // Exported id -> actual row id / owner group. Kept in-memory: on the real IndexedDB graph a
  // freshly created row is not immediately readable, so parents/children created within this
  // import resolve through these maps, never through graph read-backs.
  const folderIdMap = new Map<string, string>();
  const folderGroupMap = new Map<string, string>();
  const siblingNames = new Map<string | null, Set<string>>();

  for (const exportedFolder of orderFoldersForImport(data.folders)) {
    try {
      const exportedId = exportedFolder.id;
      const exportedParentId = exportedFolder.parentId;
      // A parent created earlier in this import resolves through the id map; an exported parent
      // that already exists in the graph is honored as-is; anything else falls back to ctx.parentId.
      const parentId =
        typeof exportedParentId === 'string'
          ? (folderIdMap.get(exportedParentId) ??
            (folderOps.findById(g, exportedParentId) ? exportedParentId : (ctx.parentId ?? null)))
          : (ctx.parentId ?? null);
      const parentGroupId =
        (typeof exportedParentId === 'string' ? folderGroupMap.get(exportedParentId) : undefined) ??
        (parentId ? folderOps.findById(g, parentId)?.owner_group_id : undefined);

      const names = siblingNamesFor(g, parentId, siblingNames);
      let finalName = exportedFolder.name;
      let nameConflict = false;
      if (names.has(finalName)) {
        let counter = 1;
        while (names.has(`${exportedFolder.name} (${counter})`)) counter++;
        finalName = `${exportedFolder.name} (${counter})`;
        nameConflict = true;
      }
      names.add(finalName);

      const idMap = new Map<string, string>();
      const items = exportedFolder.items
        ? flattenHierarchicalItems(exportedFolder.items, undefined, idMap)
        : [];
      const usedSessionIds = new Set<string>();
      const sessions = (exportedFolder.sessions ?? []).map((s) =>
        importSession(s, items, idMap, usedSessionIds),
      );

      const ownerGroupId = await ctx.mintGroup(parentGroupId);
      const now = Date.now();
      // Already used by an earlier folder in this import counts as a conflict too — the graph
      // read-back alone can miss it on the real IndexedDB store (writes propagate async).
      const existing =
        exportedId && !folderIdMap.has(exportedId) ? folderOps.findById(g, exportedId) : undefined;
      const row = await folderOps.addFolder(g, {
        id: existing ? generateId() : (exportedId ?? generateId()),
        name: finalName,
        parentId,
        type: exportedFolder.type === 'folder' ? 'folder' : 'template-folder',
        ownerGroupId,
        createdBy: ctx.createdBy,
        now,
      });
      if (exportedId) {
        folderIdMap.set(exportedId, row.id);
        folderGroupMap.set(exportedId, ownerGroupId);
      }

      // Restore timestamps, archived flag, per-folder settings, and default_items (remapped).
      const restore: Record<string, unknown> = {
        created_at: new Date(exportedFolder.createdAt).getTime(),
        updated_at: new Date(exportedFolder.updatedAt).getTime(),
      };
      if (exportedFolder.archived) restore.archived = true;
      if (exportedFolder.showZoneHeadings !== undefined) {
        restore.show_zone_headings = exportedFolder.showZoneHeadings;
      }
      if (exportedFolder.autocompleteDomain !== undefined) {
        restore.autocomplete_domain = exportedFolder.autocompleteDomain;
      }
      if (exportedFolder.autoCategorizeEnabled !== undefined) {
        restore.auto_categorize_enabled = exportedFolder.autoCategorizeEnabled;
      }
      const defaultItems: Record<string, boolean> = {};
      for (const [oldItemId, enabled] of Object.entries(exportedFolder.defaultItems ?? {})) {
        const newItemId = idMap.get(oldItemId);
        if (newItemId) defaultItems[newItemId] = enabled;
      }
      if (Object.keys(defaultItems).length > 0) restore.default_items = defaultItems;
      await g.folder.update(row.id, restore);

      const itemHandle = itemsList(g, row.id);
      for (const item of items) await itemHandle.append(item);
      const sessionHandle = sessionsList(g, row.id);
      for (const session of sessions) await sessionHandle.append(session);

      foldersCreated++;
      itemsAdded += items.length;
      sessionsCreated += sessions.length;
      folderIds.push(row.id);

      if (nameConflict) {
        warnings.push(
          `Folder "${exportedFolder.name}" imported as "${finalName}" due to name conflict`,
        );
      }
    } catch (error) {
      errors.push(
        `Failed to import folder "${exportedFolder.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      ...(exportedItem.notes ? { notes: exportedItem.notes } : {}),
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
  usedSessionIds: Set<string>,
): SessionData {
  const itemStates: Record<string, ItemState> = {};

  for (const [oldItemId, exportedState] of Object.entries(exportedSession.itemStates)) {
    const newItemId = idMap.get(oldItemId);
    if (!newItemId) continue;
    itemStates[newItemId] = {
      selected: exportedState.selected,
      checked: exportedState.checked,
      selectedAt: exportedState.selectedAt
        ? new Date(exportedState.selectedAt).getTime()
        : undefined,
      checkedAt: exportedState.checkedAt ? new Date(exportedState.checkedAt).getTime() : undefined,
      ...(exportedState.notes ? { notes: exportedState.notes } : {}),
    };
  }

  const selectedCount = Object.values(itemStates).filter((s) => s.selected).length;
  const checkedCount = Object.values(itemStates).filter((s) => s.checked).length;
  const remainingCount = items.length - checkedCount;

  let id = generateId();
  if (exportedSession.id && !usedSessionIds.has(exportedSession.id)) {
    id = exportedSession.id; // reuse exported id; remap only on conflict
  }
  usedSessionIds.add(id);

  const name = exportedSession.customName === true ? exportedSession.name.trim() : '';

  return {
    id,
    ...(name ? { name } : {}),
    itemStates,
    archived: exportedSession.archived ?? false,
    viewMode: exportedSession.viewMode || 'zone-in-hierarchy',
    categoryExpanded: exportedSession.categoryExpanded ?? {},
    selectedCount,
    checkedCount,
    remainingCount,
    createdAt: new Date(exportedSession.createdAt).getTime(),
    lastActivityAt: new Date(exportedSession.lastActivityAt).getTime(),
  };
}

/** Restore or merge the exported user_settings row (preferences + view-state maps + subscription cache). */
async function importUserSettings(
  g: Graph,
  exported: ExportedUserSettings | undefined,
  ctx: JsonImportContext,
): Promise<void> {
  if (!exported) return;
  await ensureUserSettings(g, ctx.createdBy, ctx.createdBy);
  const settings = g.user_settings.all()[0]?.$data;
  if (!settings) return;
  await g.user_settings.update(settings.id, {
    default_autocomplete_domain: exported.defaultAutocompleteDomain,
    enable_auto_categorization: exported.enableAutoCategorization,
    view_folder_expanded: exported.viewFolderExpanded,
    view_template_category_expanded: exported.viewTemplateCategoryExpanded,
    view_session_category_expanded: exported.viewSessionCategoryExpanded,
    // Subscription cache restored only when present — v2.1 exports made before the cache fields
    // were added leave the row's (default) values alone.
    ...(exported.subscriptionTier !== undefined
      ? { subscription_tier: exported.subscriptionTier }
      : {}),
    ...(exported.subscriptionStatus !== undefined
      ? { subscription_status: exported.subscriptionStatus }
      : {}),
    ...(exported.subscriptionEndsAt !== undefined
      ? { subscription_ends_at: exported.subscriptionEndsAt }
      : {}),
    ...(exported.maxLists !== undefined ? { max_lists: exported.maxLists } : {}),
    ...(exported.sessionRetentionDays !== undefined
      ? { session_retention_days: exported.sessionRetentionDays }
      : {}),
    ...(exported.subscriptionSyncedAt !== undefined
      ? { subscription_synced_at: exported.subscriptionSyncedAt }
      : {}),
  });
}
