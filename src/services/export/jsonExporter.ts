/**
 * JSON export functionality
 *
 * Exports folder structures with all template items and session history to JSON format.
 * Version 2.0: Uses hierarchical structure and neutral terminology.
 */

import { walkTree } from '@jbr-jazz/hierarchy-shared';
import type { InstanceOfSchema } from 'jazz-tools';
import packageJson from '../../../package.json';
import { isTemplateFolder } from '../../hooks';
import { generateSessionName } from '../../lib/utils';
import type { Account, FolderNode, SessionData } from '../../schema';
import type { TemplateItem } from '../../schema/tree';
import { toISOString } from '../../utils/dateUtils';
import { buildItemTree, type ItemTreeNode } from '../../utils/itemTreeHelpers';
import type {
  ExportedData,
  ExportedFolder,
  ExportedItemState,
  ExportedSession,
  ExportedTemplateItem,
} from './types';

/**
 * Export all folders from a user's account
 *
 * @param account - The user's Account
 * @returns Complete export data structure
 */
export function exportAllFolders(account: InstanceOfSchema<typeof Account>): ExportedData {
  const folders: ExportedFolder[] = [];

  // Get all template folders from the hierarchy using walkTree
  if (account?.root?.folders) {
    walkTree([...account.root.folders] as InstanceOfSchema<typeof FolderNode>[], (node) => {
      if (node.archived) return 'skip';
      if (isTemplateFolder(node)) {
        folders.push(exportTemplateNode(node));
      }
    });
  }

  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders,
  };
}

/**
 * Export a single template
 *
 * @param template - The FolderNode to export
 * @returns Export data containing single template
 */
export function exportTemplate(template: InstanceOfSchema<typeof FolderNode>): ExportedData {
  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders: [exportTemplateNode(template)],
  };
}

/**
 * Convert a FolderNode to exported format
 *
 * @param template - The FolderNode to convert
 * @returns Exported folder structure
 */
function exportTemplateNode(template: InstanceOfSchema<typeof FolderNode>): ExportedFolder {
  const baseFolder: ExportedFolder = {
    name: template.name,
    type: 'template-folder', // All templates are template-folders in the export format
    createdAt: toISOString(template.createdAt) || new Date().toISOString(),
    updatedAt: toISOString(template.updatedAt) || new Date().toISOString(),
  };

  // Add template data
  if (template.items && template.sessions) {
    baseFolder.items = exportTemplateItems(template.items);
    baseFolder.sessions = exportSessions(template.sessions);
    // NOTE: currentSessionId removed from schema - it's tracked locally per-device
    // Left in export format for backwards compatibility with old exports
  }

  return baseFolder;
}

/**
 * Export template items in hierarchical structure (v2.0)
 *
 * Uses buildItemTree() to convert flat items to hierarchical structure.
 *
 * @param items - Array of TemplateItems (flat with paths)
 * @returns Hierarchical array of exported template items
 */
function exportTemplateItems(items: TemplateItem[]): ExportedTemplateItem[] {
  // Build hierarchical tree from flat items (reuses existing code!)
  const itemTree = buildItemTree(items);

  // Convert tree nodes to export format
  return itemTree.map((node) => convertTreeNodeToExport(node));
}

/**
 * Recursively convert ItemTreeNode to ExportedTemplateItem
 *
 * @param node - ItemTreeNode from buildItemTree()
 * @returns ExportedTemplateItem with nested children
 */
function convertTreeNodeToExport(node: ItemTreeNode): ExportedTemplateItem {
  const { item, children } = node;

  const exportedItem: ExportedTemplateItem = {
    id: item.id, // Required for session state references
    name: item.name,
    type: item.type,
    sortOrder: item.sortOrder,
    createdAt: toISOString(item.createdAt) || new Date().toISOString(),
    updatedAt: toISOString(item.createdAt) || new Date().toISOString(), // Use createdAt for both since plain items don't have updatedAt
  };

  // Add optional fields
  if (item.expanded) {
    exportedItem.expanded = item.expanded;
  }
  if (item.defaultQuantity) {
    exportedItem.defaultQuantity = item.defaultQuantity;
  }

  // Recursively add children for categories
  if (item.type === 'category' && children.length > 0) {
    exportedItem.children = children.map((child) => convertTreeNodeToExport(child));
  }

  return exportedItem;
}

/**
 * Export shopping sessions from a CoList
 *
 * @param sessions - CoList of Sessions
 * @returns Array of exported sessions
 */
function exportSessions(sessions: SessionData[]): ExportedSession[] {
  // Convert to array once for easier manipulation
  const sessionArray = Array.from(sessions);

  // Pre-compute sessions with normalized dates (O(n) instead of O(n²))
  const sessionsWithDates = sessionArray.map((s) => ({
    ...s,
    createdAt: typeof s.createdAt === 'string' ? new Date(s.createdAt) : s.createdAt,
  })) as readonly (SessionData | null)[];

  return sessionArray.map((session) => {
    const itemStates: Record<string, ExportedItemState> = {};

    // Export item states with neutral terminology (v2.0)
    for (const [itemId, state] of Object.entries(session.itemStates)) {
      const exportedState: ExportedItemState = {
        selected: state.selected,
        checked: state.checked,
      };

      const selectedAt = toISOString(state.selectedAt);
      if (selectedAt) {
        exportedState.selectedAt = selectedAt;
      }
      const checkedAt = toISOString(state.checkedAt);
      if (checkedAt) {
        exportedState.checkedAt = checkedAt;
      }

      itemStates[itemId] = exportedState;
    }

    // Generate name from createdAt
    const createdAtRaw = session.createdAt;
    if (!createdAtRaw) {
      throw new Error('Session missing createdAt field');
    }
    const createdAt = typeof createdAtRaw === 'string' ? new Date(createdAtRaw) : createdAtRaw;
    const name = generateSessionName(createdAt, sessionsWithDates);

    return {
      name,
      archived: session.archived || false,
      viewMode: session.viewMode,
      itemStates,
      createdAt: toISOString(session.createdAt) || new Date().toISOString(),
      lastActivityAt: toISOString(session.lastActivityAt) || new Date().toISOString(),
    };
  });
}

/**
 * Convert export data to JSON string
 *
 * @param data - Export data structure
 * @param pretty - Whether to pretty-print the JSON (default: true)
 * @returns JSON string
 */
export function toJsonString(data: ExportedData, pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}
