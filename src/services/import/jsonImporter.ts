/**
 * JSON import functionality
 *
 * Imports folder structures with all template items and session history from JSON format.
 */


import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, Template, Session } from '../../schemas';
import type { ItemState, TemplateItem } from '../../schemas/tree';
import type { ExportedData, ExportedFolder, ExportedSession } from '../export/types';
import { resolvePathConflict } from './conflictResolver';
import type { ImportResult } from './types';
import { findTemplateByPath, validateJsonData } from './validators';

/**
 * Import JSON data into user's account
 *
 * @param jsonString - JSON string to import
 * @param account - User's Account
 * @returns Import result with success/failure info
 */
export async function importJson(
  jsonString: string,
  account: InstanceOfSchema<typeof Account>,
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
 * @param account - User's Account
 * @returns Import result
 */
async function importFolders(
  data: ExportedData,
  account: InstanceOfSchema<typeof Account>,
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
      const { template, stats } = await importFolder(exportedFolder, account);

      // Add to root
      account.root.templates.$jazz.push(template);

      // Track stats
      foldersCreated++;
      itemsAdded += stats.itemsAdded;
      sessionsCreated += stats.sessionsCreated;

      if (template.$jazz?.id) {
        folderIds.push(template.$jazz.id);
      }

      if (stats.pathConflict) {
        warnings.push(
          `Template "${exportedFolder.name}" imported as "${template.name}" due to path conflict`,
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
 * @returns Created template and stats
 */
async function importFolder(
  exportedFolder: ExportedFolder,
  account: InstanceOfSchema<typeof Account>,
): Promise<{
  template: InstanceOfSchema<typeof Template>;
  stats: { itemsAdded: number; sessionsCreated: number; pathConflict: boolean };
}> {
  // Check for path conflict
  const existingTemplate = findTemplateByPath(exportedFolder.path, account);
  let finalPath = exportedFolder.path;
  let finalName = exportedFolder.name;
  let pathConflict = false;

  if (existingTemplate) {
    const resolved = resolvePathConflict(exportedFolder.path, exportedFolder.name, account);
    finalPath = resolved.path;
    finalName = resolved.name;
    pathConflict = true;
  }

  // All templates support items and sessions
  return importTemplateFolder(exportedFolder, finalPath, finalName, account, pathConflict);
}

/**
 * Import a template folder with items and sessions
 *
 * @param exportedFolder - Exported template folder data
 * @param path - Final path (after conflict resolution)
 * @param name - Final name (after conflict resolution)
 * @param account - User's account
 * @param pathConflict - Whether path was changed
 * @returns Created template and stats
 */
async function importTemplateFolder(
  exportedFolder: ExportedFolder,
  path: string,
  name: string,
  account: InstanceOfSchema<typeof Account>,
  pathConflict: boolean,
): Promise<{
  template: InstanceOfSchema<typeof Template>;
  stats: { itemsAdded: number; sessionsCreated: number; pathConflict: boolean };
}> {
  // Import template items as plain objects
  const items: TemplateItem[] = [];

  if (exportedFolder.items) {
    for (const exportedItem of exportedFolder.items) {
      const item: TemplateItem = {
        id: crypto.randomUUID(),
        name: exportedItem.name,
        type: exportedItem.type,
        path: exportedItem.path,
        expanded: exportedItem.expanded ?? false,
        sortOrder: exportedItem.sortOrder,
        archived: false,
        defaultQuantity: exportedItem.defaultQuantity || '',
        color: exportedItem.color || '#6b7280',
        createdAt: new Date(exportedItem.createdAt),
      };

      items.push(item);
    }
  }

  // Create template
  const template = Template.create(
    {
      name,
      path,
      archived: false,
      items,
      sessions: [],
      currentSessionId: undefined,
      showZoneHeadings: false, // Hide zone headings by default
      owner: account,
      createdAt: new Date(exportedFolder.createdAt),
      updatedAt: new Date(exportedFolder.updatedAt),
    },
    { owner: account },
  );

  // Import sessions
  const sessions: InstanceOfSchema<typeof Session>[] = [];

  if (exportedFolder.sessions) {
    for (const exportedSession of exportedFolder.sessions) {
      const session = importSession(exportedSession, items, account);
      sessions.push(session);
    }
  }

  // Add sessions to template
  if (template.sessions) {
    for (const session of sessions) {
      template.sessions.$jazz.push(session);
    }
  }

  // Set current session if it was active
  if (exportedFolder.currentSessionId && sessions.length > 0) {
    // Find the session that was current (use first active session)
    const activeSession = sessions.find((s) => s.status === 'active');
    if (activeSession?.$jazz?.id) {
      template.$jazz.set('currentSessionId', activeSession.$jazz.id);
    }
  }

  return {
    template,
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
 * @param items - Array of template items
 * @param account - User's account
 * @returns Created session
 */
function importSession(
  exportedSession: ExportedSession,
  items: TemplateItem[],
  account: InstanceOfSchema<typeof Account>,
): InstanceOfSchema<typeof Session> {
  // Reconstruct item states with new item IDs as plain objects
  const itemStates: Record<string, ItemState> = {};

  // Create a map of old exported items by sortOrder to match with new items
  const exportedItemsBySort = new Map<number, string>();

  // Try to map exported states to new item IDs by matching sortOrder
  for (const [itemId, state] of Object.entries(exportedSession.itemStates)) {
    exportedItemsBySort.set(itemId.length, itemId); // Basic heuristic
  }

  // For each item in the template, try to find matching state from export
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.id) continue;

    // Try to find the corresponding exported state
    // Match by index position (best we can do without original IDs)
    const exportedStatesArray = Object.values(exportedSession.itemStates);
    const correspondingState = exportedStatesArray[i];

    if (correspondingState) {
      const itemState: ItemState = {
        selected: correspondingState.inCart,
        checked: correspondingState.purchased,
        selectedAt: correspondingState.addedToCartAt ? new Date(correspondingState.addedToCartAt) : undefined,
        checkedAt: correspondingState.purchasedAt ? new Date(correspondingState.purchasedAt) : undefined,
      };

      itemStates[item.id] = itemState;
    }
  }

  // Calculate counts
  const selectedCount = Object.values(itemStates).filter((s) => s.selected).length;
  const checkedCount = Object.values(itemStates).filter((s) => s.checked).length;
  const remainingCount = items.length - checkedCount;

  // Create session
  const session = Session.create(
    {
      name: exportedSession.name,
      itemStates,
      status: exportedSession.status,
      archived: exportedSession.archived ?? false,
      viewMode: exportedSession.viewMode || 'hierarchy-in-zones',
      categoryExpanded: {},
      selectedCount,
      checkedCount,
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
