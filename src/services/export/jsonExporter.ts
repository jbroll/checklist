/**
 * JSON export functionality
 *
 * Exports folder structures with all template items and session history to JSON format.
 */

import type { CoList, InstanceOfSchema } from 'jazz-tools';
import type { Account, Session, Template } from '../../schemas';
import type { TemplateItem } from '../../schemas/tree';
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
    version: '1.0',
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
    version: '1.0',
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
 * Export template items from an array
 *
 * @param items - Array of TemplateItems
 * @returns Array of exported template items
 */
function exportTemplateItems(items: TemplateItem[]): ExportedTemplateItem[] {
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
      createdAt: toISOString(item.createdAt) || new Date().toISOString(),
      updatedAt: toISOString(item.createdAt) || new Date().toISOString(), // Use createdAt for both since plain items don't have updatedAt
    };

    exportedItems.push(exportedItem);
  }

  return exportedItems;
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

    // Export item states (now plain objects)
    for (const [itemId, state] of Object.entries(session.itemStates)) {
      const exportedState: ExportedItemState = {
        inCart: state.selected,
        purchased: state.checked,
      };

      const addedToCartAt = toISOString(state.selectedAt);
      if (addedToCartAt) {
        exportedState.addedToCartAt = addedToCartAt;
      }
      const purchasedAt = toISOString(state.checkedAt);
      if (purchasedAt) {
        exportedState.purchasedAt = purchasedAt;
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
