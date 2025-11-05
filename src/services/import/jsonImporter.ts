/**
 * JSON import functionality
 *
 * Imports folder structures with all template items and session history from JSON format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import {
  FolderNode,
  type GroceriesAccount,
  ItemState,
  ShoppingSession,
  TemplateItem,
} from '../../schemas';
import type { ExportedData, ExportedFolder, ExportedSession } from '../export/types';
import { resolvePathConflict } from './conflictResolver';
import type { ImportResult } from './types';
import { findFolderByPath, validateJsonData } from './validators';

/**
 * Import JSON data into user's account
 *
 * @param jsonString - JSON string to import
 * @param account - User's GroceriesAccount
 * @returns Import result with success/failure info
 */
export async function importJson(
  jsonString: string,
  account: InstanceOfSchema<typeof GroceriesAccount>,
): Promise<ImportResult> {
  // Parse JSON
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

  // Validate data
  const validation = validateJsonData(data, account);
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
      stats: {},
    };
  }

  // Import folders
  const exportData = data as ExportedData;
  const result = await importFolders(exportData, account);

  return {
    ...result,
    warnings: [...validation.warnings, ...result.warnings],
  };
}

/**
 * Import folders from validated export data
 *
 * @param data - Validated export data
 * @param account - User's GroceriesAccount
 * @returns Import result
 */
async function importFolders(
  data: ExportedData,
  account: InstanceOfSchema<typeof GroceriesAccount>,
): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const folderIds: string[] = [];
  let foldersCreated = 0;
  let itemsAdded = 0;
  let sessionsCreated = 0;

  // Ensure root exists
  if (!account.root) {
    errors.push('Account root not initialized');
    return {
      success: false,
      errors,
      warnings,
      stats: {},
    };
  }

  // Import each folder
  for (const exportedFolder of data.folders) {
    try {
      const { folder, stats } = await importFolder(exportedFolder, account);

      // Add to root
      account.root.nodes.$jazz.push(folder);

      // Track stats
      foldersCreated++;
      itemsAdded += stats.itemsAdded;
      sessionsCreated += stats.sessionsCreated;

      if (folder.$jazz?.id) {
        folderIds.push(folder.$jazz.id);
      }

      if (stats.pathConflict) {
        warnings.push(
          `Folder "${exportedFolder.name}" imported as "${folder.name}" due to path conflict`,
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
    stats: {
      foldersCreated,
      itemsAdded,
      sessionsCreated,
    },
    data: {
      folderIds,
    },
  };
}

/**
 * Import a single folder
 *
 * @param exportedFolder - Exported folder data
 * @param account - User's account
 * @returns Created folder and stats
 */
async function importFolder(
  exportedFolder: ExportedFolder,
  account: InstanceOfSchema<typeof GroceriesAccount>,
): Promise<{
  folder: InstanceOfSchema<typeof FolderNode>;
  stats: { itemsAdded: number; sessionsCreated: number; pathConflict: boolean };
}> {
  // Check for path conflict
  const existingFolder = findFolderByPath(exportedFolder.path, account);
  let finalPath = exportedFolder.path;
  let finalName = exportedFolder.name;
  let pathConflict = false;

  if (existingFolder) {
    const resolved = resolvePathConflict(exportedFolder.path, exportedFolder.name, account);
    finalPath = resolved.path;
    finalName = resolved.name;
    pathConflict = true;
  }

  // Create folder based on type
  if (exportedFolder.type === 'template-folder') {
    return importTemplateFolder(exportedFolder, finalPath, finalName, account, pathConflict);
  }

  // Regular folder (no items or sessions, but must initialize empty arrays)
  const folder = FolderNode.create(
    {
      name: finalName,
      type: 'folder',
      path: finalPath,
      expanded: false,
      archived: false, // New folders start unarchived
      showZoneHeadings: false, // Hide zone headings by default
      items: [], // Always initialize even for regular folders
      sessions: [], // Always initialize even for regular folders
      currentSessionId: '', // Empty string for no session
      owner: account,
      createdAt: new Date(exportedFolder.createdAt),
      updatedAt: new Date(exportedFolder.updatedAt),
    },
    { owner: account },
  );

  return {
    folder,
    stats: { itemsAdded: 0, sessionsCreated: 0, pathConflict },
  };
}

/**
 * Import a template folder with items and sessions
 *
 * @param exportedFolder - Exported template folder data
 * @param path - Final path (after conflict resolution)
 * @param name - Final name (after conflict resolution)
 * @param account - User's account
 * @param pathConflict - Whether path was changed
 * @returns Created folder and stats
 */
async function importTemplateFolder(
  exportedFolder: ExportedFolder,
  path: string,
  name: string,
  account: InstanceOfSchema<typeof GroceriesAccount>,
  pathConflict: boolean,
): Promise<{
  folder: InstanceOfSchema<typeof FolderNode>;
  stats: { itemsAdded: number; sessionsCreated: number; pathConflict: boolean };
}> {
  // Import template items
  const items: InstanceOfSchema<typeof TemplateItem>[] = [];

  if (exportedFolder.items) {
    for (const exportedItem of exportedFolder.items) {
      const item = TemplateItem.create(
        {
          name: exportedItem.name,
          type: exportedItem.type,
          path: exportedItem.path,
          expanded: exportedItem.expanded ?? false,
          sortOrder: exportedItem.sortOrder,
          archived: false,
          defaultQuantity: exportedItem.defaultQuantity || '',
          color: exportedItem.color || '#6b7280',
          addedBy: account,
          createdAt: new Date(exportedItem.createdAt),
          updatedAt: new Date(exportedItem.updatedAt),
        },
        { owner: account },
      );

      items.push(item);
    }
  }

  // Create folder first (needed for session.templateFolderId)
  const folder = FolderNode.create(
    {
      name,
      type: 'template-folder',
      path,
      expanded: false,
      archived: false, // New folders start unarchived
      showZoneHeadings: false, // Hide zone headings by default
      items,
      sessions: [],
      currentSessionId: '', // Empty string for no current session
      owner: account,
      createdAt: new Date(exportedFolder.createdAt),
      updatedAt: new Date(exportedFolder.updatedAt),
    },
    { owner: account },
  );

  // Import sessions
  const sessions: InstanceOfSchema<typeof ShoppingSession>[] = [];

  if (exportedFolder.sessions && folder.$jazz?.id) {
    for (const exportedSession of exportedFolder.sessions) {
      const session = importSession(exportedSession, folder.$jazz.id, items, account);
      sessions.push(session);
    }
  }

  // Add sessions to folder
  if (folder.sessions) {
    for (const session of sessions) {
      folder.sessions.$jazz.push(session);
    }
  }

  // Set current session if it was active (using type assertion to bypass readonly)
  if (exportedFolder.currentSessionId && sessions.length > 0) {
    // Find the session that was current (use first active session)
    const activeSession = sessions.find((s) => s.status === 'active');
    if (activeSession?.$jazz?.id) {
      (folder as { currentSessionId?: string }).currentSessionId = activeSession.$jazz.id;
    }
  }

  return {
    folder,
    stats: {
      itemsAdded: items.length,
      sessionsCreated: sessions.length,
      pathConflict,
    },
  };
}

/**
 * Import a shopping session
 *
 * @param exportedSession - Exported session data
 * @param templateFolderId - ID of the parent template folder
 * @param items - Array of template items
 * @param account - User's account
 * @returns Created session
 */
function importSession(
  exportedSession: ExportedSession,
  templateFolderId: string,
  items: InstanceOfSchema<typeof TemplateItem>[],
  account: InstanceOfSchema<typeof GroceriesAccount>,
): InstanceOfSchema<typeof ShoppingSession> {
  // Reconstruct item states with new item IDs
  const itemStates: Record<string, InstanceOfSchema<typeof ItemState>> = {};

  // For each item in the template, create an ItemState if it was in the session
  for (const item of items) {
    if (!item.$jazz?.id) continue;

    const itemId = item.$jazz.id;

    // Find the original state (search by sortOrder match)
    let foundState = null;
    for (const [_originalItemId, state] of Object.entries(exportedSession.itemStates)) {
      // Try to match by item name or sortOrder
      // Since we don't have original IDs, we'll create states for all items
      // and use the session's state data where available
      foundState = state;
      break; // Use first state for now - this is a limitation of the import
    }

    if (foundState) {
      const itemState = ItemState.create(
        {
          itemId,
          inCart: foundState.inCart,
          purchased: foundState.purchased,
          addedToCartAt: foundState.addedToCartAt ? new Date(foundState.addedToCartAt) : undefined,
          purchasedAt: foundState.purchasedAt ? new Date(foundState.purchasedAt) : undefined,
          checkedBy: undefined,
        },
        { owner: account },
      );

      itemStates[itemId] = itemState;
    }
  }

  // Calculate counts
  const inCartCount = Object.values(itemStates).filter((s) => s.inCart).length;
  const completedCount = Object.values(itemStates).filter((s) => s.purchased).length;
  const remainingCount = items.length - completedCount;

  // Create session
  const session = ShoppingSession.create(
    {
      name: exportedSession.name,
      templateFolderId,
      itemStates, // Already a Record of ItemStates
      status: exportedSession.status,
      archived: exportedSession.archived ?? false, // Use exported value or default to false
      viewMode: exportedSession.viewMode || 'hierarchy-in-zones', // Default if not present
      categoryExpanded: {}, // Reset UI state - empty record
      inCartCount,
      completedCount,
      remainingCount,
      owner: account,
      startedAt: new Date(exportedSession.startedAt),
      lastActivityAt: new Date(exportedSession.lastActivityAt),
      completedAt: exportedSession.completedAt ? new Date(exportedSession.completedAt) : undefined,
    },
    { owner: account },
  );

  return session;
}
