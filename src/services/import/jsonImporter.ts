/**
 * JSON import functionality
 *
 * Imports folder structures with all template items and session history from JSON format.
 * Supports v2.0 (hierarchical with IDs) format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, type DirectoryEntry, Session, Template } from '../../schemas';
import type { ItemState, TemplateItem } from '../../schemas/tree';
import { createChildPath } from '../../utils/pathUtils';
import type {
  ExportedData,
  ExportedFolder,
  ExportedSession,
  ExportedTemplateItem,
} from '../export/types';
import { resolvePathConflict } from './conflictResolver';
import type { ImportResult } from './types';
import { findDirectoryEntryByPath, validateJsonData } from './validators';

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
      const { template, directoryEntry, stats } = await importFolder(exportedFolder, account);

      // Add template to root
      account.root.templates.$jazz.push(template);

      // Add directory entry to root
      const updatedDirectory = [...account.root.directory, directoryEntry];
      account.root.$jazz.set('directory', updatedDirectory);

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
 * @returns Created template, directory entry, and stats
 */
async function importFolder(
  exportedFolder: ExportedFolder,
  account: InstanceOfSchema<typeof Account>,
): Promise<{
  template: InstanceOfSchema<typeof Template>;
  directoryEntry: DirectoryEntry;
  stats: { itemsAdded: number; sessionsCreated: number; pathConflict: boolean };
}> {
  // Check for path conflict in directory
  const existingEntry = findDirectoryEntryByPath(exportedFolder.path, account);
  let finalPath = exportedFolder.path;
  let finalName = exportedFolder.name;
  let pathConflict = false;

  if (existingEntry) {
    const resolved = resolvePathConflict(exportedFolder.path, exportedFolder.name, account);
    finalPath = resolved.path;
    finalName = resolved.name;
    pathConflict = true;
  }

  // All templates support items and sessions
  return importTemplateFolder(exportedFolder, finalPath, finalName, account, pathConflict);
}

/**
 * Flatten hierarchical items to path-based items
 *
 * @param exportedItems - Hierarchical exported items
 * @param parentPath - Parent path for context
 * @param idMap - Map to track old ID → new ID for session state mapping
 * @returns Flattened array of TemplateItems with paths
 */
function flattenHierarchicalItems(
  exportedItems: ExportedTemplateItem[],
  parentPath: string | undefined,
  idMap: Map<string, string>,
): TemplateItem[] {
  const items: TemplateItem[] = [];
  let sortOrderCounter = 0;

  for (const exportedItem of exportedItems) {
    // Generate new ID for this item
    const newId = crypto.randomUUID();

    // Track ID mapping for session states (if export has ID)
    if (exportedItem.id) {
      idMap.set(exportedItem.id, newId);
    }

    // Reconstruct path from hierarchy
    const itemPath = createChildPath(
      parentPath,
      exportedItem.name.toLowerCase().replace(/\s+/g, '-'),
    );

    const item: TemplateItem = {
      id: newId,
      name: exportedItem.name,
      type: exportedItem.type,
      path: itemPath,
      expanded: exportedItem.expanded ?? false,
      sortOrder: exportedItem.sortOrder ?? sortOrderCounter++,
      archived: false,
      defaultQuantity: exportedItem.defaultQuantity || '',
      color: exportedItem.color || '#6b7280',
      createdAt: new Date(exportedItem.createdAt),
    };

    items.push(item);

    // Recursively flatten children
    if (exportedItem.children && exportedItem.children.length > 0) {
      const childItems = flattenHierarchicalItems(exportedItem.children, itemPath, idMap);
      items.push(...childItems);
    }
  }

  return items;
}

/**
 * Import a template folder with items and sessions
 *
 * @param exportedFolder - Exported template folder data
 * @param path - Final path (after conflict resolution)
 * @param name - Final name (after conflict resolution)
 * @param account - User's account
 * @param pathConflict - Whether path was changed
 * @returns Created template, directory entry, and stats
 */
async function importTemplateFolder(
  exportedFolder: ExportedFolder,
  path: string,
  name: string,
  account: InstanceOfSchema<typeof Account>,
  pathConflict: boolean,
): Promise<{
  template: InstanceOfSchema<typeof Template>;
  directoryEntry: DirectoryEntry;
  stats: { itemsAdded: number; sessionsCreated: number; pathConflict: boolean };
}> {
  // Import template items as plain objects
  const items: TemplateItem[] = [];
  const idMap = new Map<string, string>(); // Maps old exported IDs to new IDs

  if (exportedFolder.items) {
    // Flatten hierarchical format
    const flattenedItems = flattenHierarchicalItems(exportedFolder.items, undefined, idMap);
    items.push(...flattenedItems);
  }

  // Create template (path and archived are now in DirectoryEntry, not Template)
  const template = Template.create(
    {
      name,
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
      const session = importSession(exportedSession, items, account, idMap);
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

  // Create directory entry for this template
  const now = new Date();
  const directoryEntry: DirectoryEntry = {
    id: crypto.randomUUID(),
    name,
    type: 'template-ref',
    path,
    expanded: false,
    archived: false,
    templateId: template.$jazz?.id,
    createdAt: now,
    updatedAt: now,
  };

  return {
    template,
    directoryEntry,
    stats: {
      itemsAdded: items.length,
      sessionsCreated: sessions.length,
      pathConflict,
    },
  };
}

/**
 * Import a session
 *
 * @param exportedSession - Exported session data
 * @param items - Array of template items
 * @param account - User's account
 * @param idMap - Map of old exported IDs to new IDs
 * @returns Created session
 */
function importSession(
  exportedSession: ExportedSession,
  items: TemplateItem[],
  account: InstanceOfSchema<typeof Account>,
  idMap: Map<string, string>,
): InstanceOfSchema<typeof Session> {
  // Reconstruct item states with new item IDs as plain objects
  const itemStates: Record<string, ItemState> = {};

  // Map exported item states to new item IDs
  for (const [oldItemId, exportedState] of Object.entries(exportedSession.itemStates)) {
    // Use idMap to find the new ID
    const newItemId = idMap.get(oldItemId);

    if (newItemId) {
      const itemState: ItemState = {
        selected: exportedState.selected,
        checked: exportedState.checked,
        selectedAt: exportedState.selectedAt ? new Date(exportedState.selectedAt) : undefined,
        checkedAt: exportedState.checkedAt ? new Date(exportedState.checkedAt) : undefined,
      };

      itemStates[newItemId] = itemState;
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
