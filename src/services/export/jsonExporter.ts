/**
 * JSON export functionality.
 *
 * Exports the full folder tree (organizational + template folders, archived included) with
 * items, session history, per-folder settings, and the user_settings row to JSON format.
 * Version 2.1: hierarchical structure, neutral terminology, round-trip fidelity.
 *
 * Backup policy (v2.1): archived folders and organizational folders ARE exported, with their
 * `archived` flags and `parent_id` links, so an export/import round trip is a true backup.
 * Pre-v2.1 behavior skipped archived subtrees and dropped org folders.
 *
 * Reads the rowboat relational graph. `exportAllFolders(g)` walks the folder tree (top-level
 * folders + descendants, archived subtrees included) and exports every folder. Timestamps
 * live in the folder row's json columns as epoch-ms NUMBERS; `buildItemTree`/`generateSessionName`
 * and the exported-format mappers consume `Date`, so numbers are converted to `Date`
 * (`toDatedItem`/`toDatedSession`) before those run. NO FALLBACKS for a missing date.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import packageJson from '../../../package.json';
import { generateSessionName } from '../../lib/utils';
import type { FolderRow, SessionData, schema, TemplateItem } from '../../schema/folder';
import { parseFolderRow } from '../../schema/folderData';
import { parseUserSettingsRow } from '../../schema/userSettingsData';
import { buildItemTree, type ItemTreeNode } from '../../utils/itemTreeHelpers';
import type {
  ExportedData,
  ExportedFolder,
  ExportedItemState,
  ExportedSession,
  ExportedTemplateItem,
  ExportedUserSettings,
} from './types';

type Graph = RelationalGraph<typeof schema>;

/** A "template" is a folder row of `type: 'template-folder'`. */
function isTemplateFolder(row: FolderRow): boolean {
  return row.type === 'template-folder';
}

/** Date-carrying views of the rowboat rows, so `buildItemTree` + the mappers can `.toISOString()`. */
type DatedItem = Omit<TemplateItem, 'createdAt'> & { createdAt: Date };
type DatedItemState = {
  selected: boolean;
  checked: boolean;
  selectedAt?: Date;
  checkedAt?: Date;
  notes?: string;
};
type DatedSession = Omit<SessionData, 'createdAt' | 'lastActivityAt' | 'itemStates'> & {
  createdAt: Date;
  lastActivityAt: Date;
  itemStates: Record<string, DatedItemState>;
};

/** Convert a rowboat template item (epoch-ms createdAt) to the Date-carrying shape. */
function toDatedItem(item: TemplateItem): DatedItem {
  return { ...item, createdAt: new Date(item.createdAt) };
}

/** Convert a rowboat session (epoch-ms timestamps) to the Date-carrying shape. */
function toDatedSession(session: SessionData): DatedSession {
  const itemStates: DatedSession['itemStates'] = {};
  for (const [itemId, state] of Object.entries(session.itemStates)) {
    itemStates[itemId] = {
      selected: state.selected,
      checked: state.checked,
      ...(state.selectedAt != null ? { selectedAt: new Date(state.selectedAt) } : {}),
      ...(state.checkedAt != null ? { checkedAt: new Date(state.checkedAt) } : {}),
      ...(state.notes != null ? { notes: state.notes } : {}),
    };
  }
  return {
    id: session.id,
    itemStates,
    archived: session.archived,
    categoryExpanded: session.categoryExpanded,
    viewMode: session.viewMode,
    selectedCount: session.selectedCount,
    checkedCount: session.checkedCount,
    remainingCount: session.remainingCount,
    createdAt: new Date(session.createdAt),
    lastActivityAt: new Date(session.lastActivityAt),
  };
}

/**
 * Collect every folder in the graph — organizational and template, archived and live — walking
 * top-level folders and their descendants. Dangling rows (parent_id referencing a missing folder)
 * are emitted as roots.
 */
function collectFolders(g: Graph): FolderRow[] {
  const rows = g.folder.all().map((node) => parseFolderRow(node.$data));
  const childrenByParent = new Map<string | null, FolderRow[]>();
  for (const row of rows) {
    const bucket = childrenByParent.get(row.parent_id);
    if (bucket) {
      bucket.push(row);
    } else {
      childrenByParent.set(row.parent_id, [row]);
    }
  }

  const out: FolderRow[] = [];
  const seen = new Set<string>();
  const visit = (row: FolderRow): void => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
    for (const child of childrenByParent.get(row.id) ?? []) {
      visit(child);
    }
  };
  for (const root of childrenByParent.get(null) ?? []) {
    visit(root);
  }
  for (const row of rows) {
    if (!seen.has(row.id)) visit(row);
  }
  return out;
}

/**
 * Export all folders from the graph (full backup: org + template, archived included), plus the
 * user_settings row when one exists.
 */
export function exportAllFolders(g: Graph): ExportedData {
  const userSettings = exportUserSettings(g);
  return {
    version: '2.1',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders: collectFolders(g).map(exportFolder),
    ...(userSettings ? { userSettings } : {}),
  };
}

/**
 * Export a single template folder row (single-template scope — not a full backup, so the
 * user_settings row is not included; an unresolvable parentId is left for import to fall back on).
 */
export function exportTemplate(folder: FolderRow): ExportedData {
  return {
    version: '2.1',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders: [exportFolder(folder)],
  };
}

/**
 * Convert a folder row to exported format. v2.1 carries identity (`id`/`parentId`), the
 * `archived` flag, `type` (organizational rows included), and the per-folder settings so a
 * round trip rebuilds the tree and restores everything.
 */
function exportFolder(folder: FolderRow): ExportedFolder {
  return {
    id: folder.id,
    name: folder.name,
    type: isTemplateFolder(folder) ? 'template-folder' : 'folder',
    parentId: folder.parent_id,
    archived: folder.archived,
    items: isTemplateFolder(folder) ? exportTemplateItems(folder.items) : undefined,
    sessions: isTemplateFolder(folder) ? exportSessions(folder.sessions) : undefined,
    defaultItems: folder.default_items,
    showZoneHeadings: folder.show_zone_headings,
    autocompleteDomain: folder.autocomplete_domain,
    autoCategorizeEnabled: folder.auto_categorize_enabled,
    createdAt: new Date(folder.created_at).toISOString(),
    updatedAt: new Date(folder.updated_at).toISOString(),
    // NOTE: currentSessionId removed from schema — tracked locally per-device.
  };
}

/**
 * Export template items in hierarchical structure (v2.1).
 *
 * Uses `buildItemTree()` to convert flat path-keyed items to a nested structure.
 */
function exportTemplateItems(items: TemplateItem[]): ExportedTemplateItem[] {
  const itemTree = buildItemTree(items.map(toDatedItem));
  return itemTree.map((node) => convertTreeNodeToExport(node));
}

/** Recursively convert an ItemTreeNode to an ExportedTemplateItem. */
function convertTreeNodeToExport(node: ItemTreeNode<DatedItem>): ExportedTemplateItem {
  const { item, children } = node;

  const exportedItem: ExportedTemplateItem = {
    id: item.id, // required for session state references
    name: item.name,
    type: item.type,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.createdAt.toISOString(), // plain items have no separate updatedAt
  };

  if (item.expanded) {
    exportedItem.expanded = item.expanded;
  }
  if (item.defaultQuantity) {
    exportedItem.defaultQuantity = item.defaultQuantity;
  }
  if (item.notes) {
    exportedItem.notes = item.notes;
  }

  if (item.type === 'category' && children.length > 0) {
    exportedItem.children = children.map((child) => convertTreeNodeToExport(child));
  }

  return exportedItem;
}

/**
 * Export sessions with neutral terminology (v2.1).
 */
function exportSessions(sessions: SessionData[]): ExportedSession[] {
  const datedSessions = sessions.map(toDatedSession);

  return datedSessions.map((session) => {
    const itemStates: Record<string, ExportedItemState> = {};

    for (const [itemId, state] of Object.entries(session.itemStates)) {
      const exportedState: ExportedItemState = {
        selected: state.selected,
        checked: state.checked,
      };
      if (state.selectedAt) {
        exportedState.selectedAt = state.selectedAt.toISOString();
      }
      if (state.checkedAt) {
        exportedState.checkedAt = state.checkedAt.toISOString();
      }
      if (state.notes) {
        exportedState.notes = state.notes;
      }
      itemStates[itemId] = exportedState;
    }

    return {
      id: session.id,
      name: generateSessionName(session.createdAt, datedSessions),
      archived: session.archived,
      viewMode: session.viewMode,
      categoryExpanded: session.categoryExpanded,
      itemStates,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    };
  });
}

/**
 * Export the user_settings singleton (preferences + view-state maps). Subscription-cache
 * columns are deliberately excluded — the backend is their source of truth and refreshes them
 * on sync. Returns undefined when no row exists (brand-new user).
 */
function exportUserSettings(g: Graph): ExportedUserSettings | undefined {
  const node = g.user_settings.all()[0];
  if (!node) return undefined;
  const settings = parseUserSettingsRow(node.$data);
  return {
    defaultAutocompleteDomain: settings.default_autocomplete_domain,
    enableAutoCategorization: settings.enable_auto_categorization,
    viewFolderExpanded: settings.view_folder_expanded,
    viewTemplateCategoryExpanded: settings.view_template_category_expanded,
    viewSessionCategoryExpanded: settings.view_session_category_expanded,
  };
}

/**
 * Convert export data to a JSON string.
 *
 */
export function toJsonString(data: ExportedData, pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}
