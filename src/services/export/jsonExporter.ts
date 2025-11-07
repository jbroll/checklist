/**
 * JSON export functionality
 *
 * Exports folder structures with all template items and session history to JSON format.
 */

import type { CoList, InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount, ShoppingSession, TemplateItem } from '../../schemas';
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
 * @param account - The user's GroceriesAccount
 * @returns Complete export data structure
 */
export function exportAllFolders(account: InstanceOfSchema<typeof GroceriesAccount>): ExportedData {
  const folders: ExportedFolder[] = [];

  // Export all nodes from the root
  if (account.root?.nodes) {
    for (const node of account.root.nodes) {
      const exportedFolder = exportFolderNode(node);
      folders.push(exportedFolder);
    }
  }

  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0', // TODO: Get from package.json
    folders,
  };
}

/**
 * Export a single folder
 *
 * @param folder - The FolderNode to export
 * @returns Export data containing single folder
 */
export function exportFolder(folder: InstanceOfSchema<typeof FolderNode>): ExportedData {
  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0', // TODO: Get from package.json
    folders: [exportFolderNode(folder)],
  };
}

/**
 * Convert a FolderNode to exported format
 *
 * @param node - The FolderNode to convert
 * @returns Exported folder structure
 */
function exportFolderNode(node: InstanceOfSchema<typeof FolderNode>): ExportedFolder {
  const baseFolder: ExportedFolder = {
    name: node.name,
    path: node.path,
    type: node.type,
    createdAt: node.createdAt.toISOString(), // FolderNode still uses Date objects
    updatedAt: node.updatedAt.toISOString(),
  };

  // Add template-folder specific data
  if (node.type === 'template-folder' && node.items && node.sessions) {
    baseFolder.items = exportTemplateItems(node.items);
    baseFolder.sessions = exportSessions(node.sessions);
    // Only include currentSessionId if it's not empty
    if (node.currentSessionId && node.currentSessionId !== '') {
      baseFolder.currentSessionId = node.currentSessionId;
    }
  }

  return baseFolder;
}

/**
 * Export template items from a CoList
 *
 * @param items - CoList of TemplateItems
 * @returns Array of exported template items
 */
function exportTemplateItems(
  items: CoList<InstanceOfSchema<typeof TemplateItem>>,
): ExportedTemplateItem[] {
  const exportedItems: ExportedTemplateItem[] = [];

  for (const item of items) {
    // Skip archived items (soft-deleted)
    if (item.archived) {
      continue;
    }

    const exportedItem: ExportedTemplateItem = {
      name: item.name,
      type: item.type,
      path: item.path,
      expanded: item.expanded,
      sortOrder: item.sortOrder,
      defaultQuantity: item.defaultQuantity,
      color: item.color,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };

    exportedItems.push(exportedItem);
  }

  return exportedItems;
}

/**
 * Export shopping sessions from a CoList
 *
 * @param sessions - CoList of ShoppingSessions
 * @returns Array of exported sessions
 */
function exportSessions(
  sessions: CoList<InstanceOfSchema<typeof ShoppingSession>>,
): ExportedSession[] {
  const exportedSessions: ExportedSession[] = [];

  for (const session of sessions) {
    const itemStates: Record<string, ExportedItemState> = {};

    // Export item states
    for (const [itemId, state] of Object.entries(session.itemStates)) {
      const exportedState: ExportedItemState = {
        inCart: state.inCart,
        purchased: state.purchased,
      };

      if (state.addedToCartAt !== undefined) {
        exportedState.addedToCartAt = state.addedToCartAt.toISOString();
      }
      if (state.purchasedAt !== undefined) {
        exportedState.purchasedAt = state.purchasedAt.toISOString();
      }

      itemStates[itemId] = exportedState;
    }

    const exportedSession: ExportedSession = {
      name: session.name,
      status: session.status,
      archived: session.archived || false,
      viewMode: session.viewMode,
      itemStates,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    };

    if (session.completedAt !== undefined) {
      exportedSession.completedAt = session.completedAt.toISOString();
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
