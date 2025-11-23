/**
 * JSON import functionality
 *
 * Imports folder structures with all template items and session history from JSON format.
 * Supports v2.0 (hierarchical with IDs) format.
 */

import { Group, type InstanceOfSchema } from 'jazz-tools';
import { generateId } from '../../lib/utils';
import { type Account, FolderNode, type SessionData } from '../../schemas';
import type { ItemState, TemplateItem } from '../../schemas/tree';
import { createChildPath } from '../../utils/pathUtils';
import type {
  ExportedData,
  ExportedFolder,
  ExportedSession,
  ExportedTemplateItem,
} from '../export/types';
import type { ImportResult } from './types';
import { validateJsonData } from './validators';

/**
 * Import JSON data into user's account
 *
 * @param jsonString - JSON string to import
 * @param account - User's Account
 * @param parentFolder - Optional parent folder (if not provided, imports to root)
 * @returns Import result with success/failure info
 */
export async function importJson(
  jsonString: string,
  account: InstanceOfSchema<typeof Account>,
  parentFolder?: InstanceOfSchema<typeof FolderNode>,
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
  const result = await importFolders(exportData, account, parentFolder);

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
 * @param parentFolder - Optional parent folder
 * @returns Import result
 */
async function importFolders(
  data: ExportedData,
  account: InstanceOfSchema<typeof Account>,
  parentFolder?: InstanceOfSchema<typeof FolderNode>,
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
      const { folder, stats } = await importFolder(exportedFolder, account, parentFolder);

      // Add folder to hierarchy
      if (parentFolder?.children) {
        parentFolder.children.$jazz.push(folder);
      } else if (account.root.folders) {
        account.root.folders.$jazz.push(folder);
      }

      // Track stats
      foldersCreated++;
      itemsAdded += stats.itemsAdded;
      sessionsCreated += stats.sessionsCreated;

      if (folder.$jazz?.id) {
        folderIds.push(folder.$jazz.id);
      }

      if (stats.nameConflict) {
        warnings.push(
          `Template "${exportedFolder.name}" imported as "${folder.name}" due to name conflict`,
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
 * @param parentFolder - Optional parent folder
 * @returns Created folder and stats
 */
async function importFolder(
  exportedFolder: ExportedFolder,
  account: InstanceOfSchema<typeof Account>,
  parentFolder?: InstanceOfSchema<typeof FolderNode>,
): Promise<{
  folder: InstanceOfSchema<typeof FolderNode>;
  stats: { itemsAdded: number; sessionsCreated: number; nameConflict: boolean };
}> {
  // Check for name conflict in target parent's children
  const siblings = parentFolder?.children || account.root?.folders || [];
  let finalName = exportedFolder.name;
  let nameConflict = false;

  // Check if name already exists in siblings
  const existingFolder = Array.from(siblings).find(
    (f: InstanceOfSchema<typeof FolderNode> | null) => f?.name === finalName,
  );
  if (existingFolder) {
    // Append a number to make it unique
    let counter = 1;
    while (
      Array.from(siblings).some(
        (f: InstanceOfSchema<typeof FolderNode> | null) =>
          f?.name === `${exportedFolder.name} (${counter})`,
      )
    ) {
      counter++;
    }
    finalName = `${exportedFolder.name} (${counter})`;
    nameConflict = true;
  }

  // All templates support items and sessions
  return importTemplateFolder(exportedFolder, finalName, account, parentFolder, nameConflict);
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
    // Generate new ID for this item (using nanoid for compact IDs)
    const newId = generateId();

    // Track ID mapping for session states (if export has ID)
    if (exportedItem.id) {
      idMap.set(exportedItem.id, newId);
    }

    // Reconstruct path from hierarchy - use name as-is without normalization
    const itemPath = createChildPath(parentPath, exportedItem.name);

    const item: TemplateItem = {
      id: newId,
      name: exportedItem.name,
      type: exportedItem.type,
      path: itemPath,
      expanded: exportedItem.expanded ?? false,
      sortOrder: exportedItem.sortOrder ?? sortOrderCounter++,
      archived: false,
      defaultQuantity: exportedItem.defaultQuantity || '',
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
 * @param name - Final name (after conflict resolution)
 * @param account - User's account
 * @param parentFolder - Optional parent folder
 * @param nameConflict - Whether name was changed
 * @returns Created folder and stats
 */
async function importTemplateFolder(
  exportedFolder: ExportedFolder,
  name: string,
  account: InstanceOfSchema<typeof Account>,
  parentFolder?: InstanceOfSchema<typeof FolderNode>,
  nameConflict = false,
): Promise<{
  folder: InstanceOfSchema<typeof FolderNode>;
  stats: { itemsAdded: number; sessionsCreated: number; nameConflict: boolean };
}> {
  // Import template items as plain objects
  const items: TemplateItem[] = [];
  const idMap = new Map<string, string>(); // Maps old exported IDs to new IDs

  if (exportedFolder.items) {
    // Flatten hierarchical format
    const flattenedItems = flattenHierarchicalItems(exportedFolder.items, undefined, idMap);
    items.push(...flattenedItems);
  }

  // Create sessions array (plain objects, not CoList)
  const sessionsList: SessionData[] = [];

  // Import sessions
  if (exportedFolder.sessions) {
    for (const exportedSession of exportedFolder.sessions) {
      const session = importSession(exportedSession, items, idMap);
      sessionsList.push(session);
    }
  }

  // Create a new group for this folder to enable sharing
  const folderGroup = Group.create({ owner: account });

  // Add creator explicitly to members for consistency
  // (group owner has implicit admin rights, but adding explicitly makes UI/logic simpler)
  folderGroup.addMember(account, 'admin');

  // Create FolderNode for template
  const folder = FolderNode.create(
    {
      name,
      expanded: false,
      archived: false,
      items,
      sessions: sessionsList,
      showZoneHeadings: false, // Hide zone headings by default
      parent: parentFolder,
      owner: account,
      createdAt: new Date(exportedFolder.createdAt),
      updatedAt: new Date(exportedFolder.updatedAt),
    },
    { owner: folderGroup },
  );

  return {
    folder,
    stats: {
      itemsAdded: items.length,
      sessionsCreated: sessionsList.length,
      nameConflict,
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
  idMap: Map<string, string>,
): SessionData {
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

  // Create session (plain object, not CoValue)
  const session: SessionData = {
    id: generateId(),
    itemStates,
    archived: exportedSession.archived ?? false,
    viewMode: exportedSession.viewMode || 'zone-in-hierarchy',
    categoryExpanded: {},
    selectedCount,
    checkedCount,
    remainingCount,
    createdAt: new Date(exportedSession.createdAt),
    lastActivityAt: new Date(exportedSession.lastActivityAt),
  };

  return session;
}
