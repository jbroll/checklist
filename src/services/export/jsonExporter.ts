/**
 * JSON export functionality
 *
 * Exports folder structures with all template items and session history to JSON format.
 * Version 2.0: Uses hierarchical structure and neutral terminology.
 */

import type { CoList, InstanceOfSchema } from 'jazz-tools';
import type { Account, Session, Template } from '../../schemas';
import type { TemplateItem } from '../../schemas/tree';
import { buildItemTree, type ItemTreeNode } from '../../utils/itemTreeHelpers';
import type {
  ExportedData,
  ExportedFolder,
  ExportedItemState,
  ExportedSession,
  ExportedTemplateItem,
} from './types';

/**
 * Safely convert a Date or date string to ISO string
 * Handles both Date objects and ISO date strings from Jazz deserialization
 *
 * @param date - Date object or ISO date string
 * @returns ISO date string
 */
function toISOString(date: Date | string | undefined): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

/**
 * Export all folders from a user's account
 *
 * @param account - The user's Account
 * @returns Complete export data structure
 */
export function exportAllFolders(account: InstanceOfSchema<typeof Account>): ExportedData {
  const folders: ExportedFolder[] = [];

  // Export all templates from the root, looking up paths from directory
  if (account.root?.templates && account.root?.directory) {
    for (const template of account.root.templates) {
      if (!template) continue;

      // Find the directory entry for this template to get its path
      const dirEntry = account.root.directory.find(
        (entry) => entry.type === 'template-ref' && entry.templateId === template.$jazz?.id,
      );

      if (dirEntry) {
        const exportedFolder = exportTemplateNode(template, dirEntry.path);
        folders.push(exportedFolder);
      }
    }
  }

  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0', // TODO: Get from package.json
    folders,
  };
}

/**
 * Export a single template
 *
 * @param template - The Template to export
 * @param path - The directory path for this template
 * @returns Export data containing single template
 */
export function exportTemplate(
  template: InstanceOfSchema<typeof Template>,
  path: string,
): ExportedData {
  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0', // TODO: Get from package.json
    folders: [exportTemplateNode(template, path)],
  };
}

/**
 * Convert a Template to exported format
 *
 * @param template - The Template to convert
 * @param path - The directory path for this template (from directory entry)
 * @returns Exported folder structure
 */
function exportTemplateNode(
  template: InstanceOfSchema<typeof Template>,
  path: string,
): ExportedFolder {
  const baseFolder: ExportedFolder = {
    name: template.name,
    path,
    type: 'template-folder', // All templates are template-folders in the export format
    createdAt: toISOString(template.createdAt) || new Date().toISOString(),
    updatedAt: toISOString(template.updatedAt) || new Date().toISOString(),
  };

  // Add template data
  if (template.items && template.sessions) {
    baseFolder.items = exportTemplateItems(template.items);
    baseFolder.sessions = exportSessions(template.sessions);
    // Only include currentSessionId if it's not empty
    if (template.currentSessionId && template.currentSessionId !== '') {
      baseFolder.currentSessionId = template.currentSessionId;
    }
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
    color: item.color,
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
function exportSessions(sessions: CoList<InstanceOfSchema<typeof Session>>): ExportedSession[] {
  const exportedSessions: ExportedSession[] = [];

  for (const session of sessions) {
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

    const exportedSession: ExportedSession = {
      name: session.name,
      status: session.status,
      archived: session.archived || false,
      viewMode: session.viewMode,
      itemStates,
      startedAt: toISOString(session.startedAt) || new Date().toISOString(),
      lastActivityAt: toISOString(session.lastActivityAt) || new Date().toISOString(),
    };

    const completedAt = toISOString(session.completedAt);
    if (completedAt) {
      exportedSession.completedAt = completedAt;
    }

    exportedSessions.push(exportedSession);
  }

  return exportedSessions;
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
