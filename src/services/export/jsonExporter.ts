/**
 * JSON export functionality
 *
 * Exports folder structures with all template items and session history to JSON format.
 * Version 2.0: Uses hierarchical structure and neutral terminology.
 */

import type { CoList, InstanceOfSchema } from 'jazz-tools';
import { generateSessionName } from '../../lib/utils';
import type { Account, FolderNode, Session } from '../../schemas';
import type { TemplateItem } from '../../schemas/tree';
import { buildItemTree, type ItemTreeNode } from '../../utils/itemTreeHelpers';
import * as folderService from '../folderService';
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

  // Get all template folders from the hierarchy
  const templates = folderService.getAllTemplateFolders(account, true);
  for (const template of templates) {
    if (!template) continue;
    const exportedFolder = exportTemplateNode(template);
    folders.push(exportedFolder);
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
 * @param template - The FolderNode to export
 * @returns Export data containing single template
 */
export function exportTemplate(template: InstanceOfSchema<typeof FolderNode>): ExportedData {
  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0', // TODO: Get from package.json
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

  // Convert to array for easier manipulation
  const sessionArray = Array.from(sessions);

  for (const session of sessionArray) {
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
    // Convert string dates to Date objects at the export boundary
    const createdAtRaw = session.createdAt;
    if (!createdAtRaw) {
      throw new Error('Session missing createdAt field');
    }
    const createdAt = typeof createdAtRaw === 'string' ? new Date(createdAtRaw) : createdAtRaw;

    // Convert all session dates to Date objects for the utility function
    const sessionsWithDates = sessionArray.map((s) => ({
      ...s,
      createdAt: typeof s.createdAt === 'string' ? new Date(s.createdAt) : s.createdAt,
    })) as unknown as readonly (InstanceOfSchema<typeof Session> | null)[];

    const name = generateSessionName(createdAt, sessionsWithDates);

    const exportedSession: ExportedSession = {
      name,
      archived: session.archived || false,
      viewMode: session.viewMode,
      itemStates,
      createdAt: toISOString(session.createdAt) || new Date().toISOString(),
      lastActivityAt: toISOString(session.lastActivityAt) || new Date().toISOString(),
    };

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
