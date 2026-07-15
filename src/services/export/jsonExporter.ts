/**
 * JSON export functionality.
 *
 * Exports folder structures with all template items and session history to JSON format.
 * Version 2.0: hierarchical structure and neutral terminology.
 *
 * Reads the rowboat relational graph. `exportAllFolders(g)` walks the folder tree (top-level
 * folders + descendants, skipping archived subtrees) and exports every template folder. Timestamps
 * live in the folder row's json columns as epoch-ms NUMBERS; `buildItemTree`/`generateSessionName`
 * and the exported-format mappers consume `Date`, so numbers are converted to `Date`
 * (`toDatedItem`/`toDatedSession`) before those run. NO FALLBACKS for a missing date.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import packageJson from '../../../package.json';
import { generateSessionName } from '../../lib/utils';
import type { FolderRow, SessionData, schema, TemplateItem } from '../../schema/folder';
import { parseFolderRow } from '../../schema/folderData';
import { buildItemTree, type ItemTreeNode } from '../../utils/itemTreeHelpers';
import type {
  ExportedData,
  ExportedFolder,
  ExportedItemState,
  ExportedSession,
  ExportedTemplateItem,
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
 * Collect every non-archived template folder in the graph, walking top-level folders and their
 * descendants. An archived folder is skipped along with its whole subtree.
 */
function collectTemplateFolders(g: Graph): FolderRow[] {
  const childrenByParent = new Map<string | null, FolderRow[]>();
  for (const node of g.folder.all()) {
    const row = parseFolderRow(node.$data);
    const bucket = childrenByParent.get(row.parent_id);
    if (bucket) {
      bucket.push(row);
    } else {
      childrenByParent.set(row.parent_id, [row]);
    }
  }

  const out: FolderRow[] = [];
  const visit = (row: FolderRow): void => {
    if (row.archived) return; // skip node + subtree
    if (isTemplateFolder(row)) out.push(row);
    for (const child of childrenByParent.get(row.id) ?? []) {
      visit(child);
    }
  };
  for (const root of childrenByParent.get(null) ?? []) {
    visit(root);
  }
  return out;
}

/**
 * Export all template folders from the graph.
 *
 */
export function exportAllFolders(g: Graph): ExportedData {
  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders: collectTemplateFolders(g).map(exportTemplateFolder),
  };
}

/**
 * Export a single template folder row.
 *
 */
export function exportTemplate(folder: FolderRow): ExportedData {
  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders: [exportTemplateFolder(folder)],
  };
}

/**
 * Convert a template folder row to exported format.
 */
function exportTemplateFolder(folder: FolderRow): ExportedFolder {
  return {
    name: folder.name,
    type: 'template-folder', // all templates are template-folders in the export format
    items: exportTemplateItems(folder.items),
    sessions: exportSessions(folder.sessions),
    createdAt: new Date(folder.created_at).toISOString(),
    updatedAt: new Date(folder.updated_at).toISOString(),
    // NOTE: currentSessionId removed from schema — tracked locally per-device.
  };
}

/**
 * Export template items in hierarchical structure (v2.0).
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

  if (item.type === 'category' && children.length > 0) {
    exportedItem.children = children.map((child) => convertTreeNodeToExport(child));
  }

  return exportedItem;
}

/**
 * Export sessions with neutral terminology (v2.0).
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
      itemStates[itemId] = exportedState;
    }

    return {
      name: generateSessionName(session.createdAt, datedSessions),
      archived: session.archived,
      viewMode: session.viewMode,
      itemStates,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    };
  });
}

/**
 * Convert export data to a JSON string.
 *
 */
export function toJsonString(data: ExportedData, pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}
