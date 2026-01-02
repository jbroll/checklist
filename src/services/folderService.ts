/**
 * Folder Service
 *
 * Manages hierarchical folder tree using FolderNode CoValues.
 */

import { co, Group, type InstanceOfSchema } from 'jazz-tools';
import { type Account, FolderNode } from '../schemas';
import { canCreateList, getMaxLists } from './subscriptionService';

/**
 * Error thrown when user tries to create a list but has reached their tier limit
 */
export class ListLimitExceededError extends Error {
  maxLists: number;

  constructor(maxLists: number) {
    super(`You've reached your limit of ${maxLists} lists. Upgrade to create more.`);
    this.name = 'ListLimitExceededError';
    this.maxLists = maxLists;
  }
}

/**
 * Error thrown when account root is not initialized
 */
export class AccountNotInitializedError extends Error {
  constructor() {
    super('Account root not initialized');
    this.name = 'AccountNotInitializedError';
  }
}

/**
 * Assert that account root is initialized, throw if not
 */
function assertAccountRoot(
  account: AccountType,
): asserts account is AccountType & { root: NonNullable<AccountType['root']> } {
  if (!account.root) throw new AccountNotInitializedError();
}

type FolderType = InstanceOfSchema<typeof FolderNode>;
type AccountType = InstanceOfSchema<typeof Account>;
// Jazz CoList has $jazz methods for mutations
type FolderList = FolderType[] & {
  $jazz: {
    push: (folder: FolderType) => void;
    splice: (start: number, deleteCount: number, ...items: FolderType[]) => void;
  };
};

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Get the list containing a folder (either parent's children or root folders)
 */
function getContainingList(account: AccountType, folder: FolderType): FolderList {
  return (folder.parent?.children || account.root?.folders) as FolderList;
}

/**
 * Find folder index in a list by ID
 */
function findFolderIndex(list: FolderList, folder: FolderType): number {
  return list.findIndex((f: FolderType | null) => f?.$jazz.id === folder.$jazz.id);
}

/**
 * Remove folder from its current location
 */
function removeFromCurrentLocation(account: AccountType, folder: FolderType): void {
  const list = getContainingList(account, folder);
  const index = findFolderIndex(list, folder);
  if (index !== -1) {
    list.$jazz.splice(index, 1);
  }
}

/**
 * Validate that target is not the folder itself or a descendant
 */
function validateNotCircular(folder: FolderType, target: FolderType | null | undefined): void {
  if (!target) return;
  let current: FolderType | undefined = target;
  while (current) {
    if (current.$jazz.id === folder.$jazz.id) {
      throw new Error('Cannot move folder into itself or its descendants');
    }
    current = current.parent;
  }
}

// Maximum depth for recursive folder searches to prevent stack overflow
const MAX_FOLDER_DEPTH = 20;

/**
 * Recursively find a folder by ID in a folder tree
 */
function findFolderRecursive(
  folders: FolderType[] | Iterable<FolderType | null>,
  folderId: string,
  depth = 0,
): FolderType | null {
  if (depth > MAX_FOLDER_DEPTH) {
    console.warn('[folderService] Max folder depth reached');
    return null;
  }

  for (const f of folders) {
    if (!f) continue;
    if (f.$jazz.id === folderId) return f;
    // Only recurse if children is actually iterable (not just truthy)
    if (f.children && typeof f.children[Symbol.iterator] === 'function') {
      const found = findFolderRecursive(f.children, folderId, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Collect folders recursively based on a predicate function
 *
 * @param folders - Root folder list to search
 * @param shouldInclude - Predicate to determine if folder should be included
 * @param shouldRecurse - Predicate to determine if children should be searched (default: recurse if not included)
 */
function collectFoldersByPredicate(
  folders: FolderType[] | null | undefined,
  shouldInclude: (folder: FolderType) => boolean,
  shouldRecurse?: (folder: FolderType, included: boolean) => boolean,
): FolderType[] {
  const results: FolderType[] = [];

  function collect(folderList: FolderType[] | null | undefined) {
    if (!folderList || !Array.isArray(folderList)) return;
    for (const folder of folderList) {
      if (!folder) continue;

      const included = shouldInclude(folder);
      if (included) {
        results.push(folder);
      }

      // Default: recurse if not included
      const recurse = shouldRecurse ? shouldRecurse(folder, included) : !included;
      if (recurse && folder.children && Array.isArray(folder.children)) {
        collect(folder.children);
      }
    }
  }

  collect(folders);
  return results;
}

/**
 * Update group permissions when moving between parents
 */
function updateGroupPermissions(
  folder: FolderType,
  oldParent: FolderType | undefined,
  newParent: FolderType | null | undefined,
): void {
  const folderGroup = folder.$jazz.owner as Group;

  if (oldParent) {
    const oldParentGroup = oldParent.$jazz.owner as Group;
    folderGroup.removeMember(oldParentGroup);
  }

  if (newParent) {
    const newParentGroup = newParent.$jazz.owner as Group;
    folderGroup.addMember(newParentGroup);
  }
}

/**
 * Create a group for a new folder with proper permissions
 */
function createFolderGroup(account: AccountType, parent: FolderType | null | undefined): Group {
  const folderGroup = Group.create({ owner: account });
  folderGroup.addMember(account, 'admin');

  if (parent) {
    const parentGroup = parent.$jazz.owner as Group;
    folderGroup.addMember(parentGroup);
  }

  return folderGroup;
}

/**
 * Add folder to target location
 */
function addToLocation(
  account: AccountType,
  folder: FolderType,
  parent: FolderType | null | undefined,
  index?: number,
): void {
  const targetList = parent?.children || account.root?.folders;
  if (!targetList) return;

  if (index !== undefined) {
    targetList.$jazz.splice(index, 0, folder);
  } else {
    targetList.$jazz.push(folder);
  }
}

/**
 * Format archive timestamp for folder name suffix
 */
function formatArchiveTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if folder is a template folder (has items array).
 * Note: Returns boolean (not type predicate) because FolderNode schema
 * uses optional fields rather than a true discriminated union.
 */
export function isTemplateFolder(folder: FolderType): boolean {
  return folder.items !== undefined;
}

/**
 * Check if folder is an organizational folder (has children array).
 * Note: Returns boolean (not type predicate) because FolderNode schema
 * uses optional fields rather than a true discriminated union.
 */
export function isOrganizationalFolder(folder: FolderType): boolean {
  return folder.children !== undefined;
}

// =============================================================================
// CRUD Operations
// =============================================================================

export function createFolder(
  account: AccountType,
  name: string,
  isTemplate: boolean,
  parent?: FolderType | null,
): FolderType {
  assertAccountRoot(account);

  // Check subscription limit when creating a template (list)
  if (isTemplate && !canCreateList(account)) {
    throw new ListLimitExceededError(getMaxLists(account));
  }

  const now = new Date();
  const folderGroup = createFolderGroup(account, parent);

  // Base data with jbr-jazz required fields
  const baseData = {
    name,
    type: isTemplate ? 'template-folder' : 'folder',
    sharingMode: 'private' as const,
    expanded: !isTemplate,
    archived: false,
    createdBy: account.$jazz.id,
    createdAt: now,
    updatedAt: now,
    parent: parent || undefined,
    owner: account,
  };

  const folder = isTemplate
    ? FolderNode.create(
        { ...baseData, items: [], sessions: [], showZoneHeadings: false },
        { owner: folderGroup },
      )
    : FolderNode.create(
        { ...baseData, children: co.list(FolderNode).create([], { owner: folderGroup }) },
        { owner: folderGroup },
      );

  addToLocation(account, folder, parent);
  return folder;
}

export function renameFolder(folder: FolderType, newName: string): void {
  folder.$jazz.set('name', newName);
  folder.$jazz.set('updatedAt', new Date());
}

export function archiveFolder(folder: FolderType): void {
  const now = new Date();
  const archiveSuffix = ` (archived ${formatArchiveTimestamp(now)})`;

  folder.$jazz.set('name', folder.name + archiveSuffix);
  folder.$jazz.set('archived', true);
  folder.$jazz.set('archivedAt', now);
  folder.$jazz.set('updatedAt', now);

  // Recursively archive children
  if (folder.children && Array.isArray(folder.children)) {
    for (const child of folder.children) {
      if (child && !child.archived) {
        archiveFolder(child);
      }
    }
  }
}

export function unarchiveFolder(folder: FolderType): void {
  const now = new Date();
  const archivePattern = / \(archived \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/;
  const cleanedName = folder.name.replace(archivePattern, '');

  if (cleanedName !== folder.name) {
    folder.$jazz.set('name', cleanedName);
  }

  folder.$jazz.set('archived', false);
  folder.$jazz.set('archivedAt', undefined);
  folder.$jazz.set('updatedAt', now);

  // Recursively unarchive children
  if (folder.children && Array.isArray(folder.children)) {
    for (const child of folder.children) {
      if (child?.archived) {
        unarchiveFolder(child);
      }
    }
  }
}

export function deleteFolder(account: AccountType, folder: FolderType): void {
  assertAccountRoot(account);

  // Recursively delete children first
  if (folder.children && Array.isArray(folder.children)) {
    while (folder.children.length > 0) {
      const child = folder.children[0];
      if (child) {
        deleteFolder(account, child);
      }
    }
  }

  // Clear sessions for template folders
  if (folder.sessions) {
    folder.$jazz.set('sessions', []);
  }

  removeFromCurrentLocation(account, folder);
}

// =============================================================================
// Expansion State
// =============================================================================

export function toggleFolderExpanded(folder: FolderType): void {
  folder.$jazz.set('expanded', !folder.expanded);
  folder.$jazz.set('updatedAt', new Date());
}

export function setFolderExpanded(folder: FolderType, expanded: boolean): void {
  folder.$jazz.set('expanded', expanded);
  folder.$jazz.set('updatedAt', new Date());
}

export function expandAncestorFolders(folder: FolderType): void {
  let current = folder.parent;
  while (current) {
    current.$jazz.set('expanded', true);
    current.$jazz.set('updatedAt', new Date());
    current = current.parent;
  }
}

// =============================================================================
// Movement & Reordering
// =============================================================================

/**
 * Move a folder to a new parent and optionally insert at a specific position.
 * This is the unified move function - use this for all move operations.
 */
export function moveFolderToIndex(
  account: AccountType,
  folder: FolderType,
  newParent: FolderType | null | undefined,
  newIndex: number,
): void {
  assertAccountRoot(account);

  validateNotCircular(folder, newParent);

  const currentParentId = folder.parent?.$jazz.id;
  const newParentId = newParent?.$jazz.id;
  const isChangingParent = currentParentId !== newParentId;

  if (isChangingParent) {
    updateGroupPermissions(folder, folder.parent, newParent);
    removeFromCurrentLocation(account, folder);
    addToLocation(account, folder, newParent, newIndex);
    folder.$jazz.set('parent', newParent || undefined);
  } else {
    // Same parent - reorder
    const parentList = getContainingList(account, folder);
    const oldIndex = findFolderIndex(parentList, folder);

    if (oldIndex === -1) {
      throw new Error('Folder not found in parent');
    }

    parentList.$jazz.splice(oldIndex, 1);
    const adjustedIndex = oldIndex < newIndex ? newIndex - 1 : newIndex;
    parentList.$jazz.splice(adjustedIndex, 0, folder);
  }

  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Move a folder to a new parent (appends to end of target list)
 */
export function moveFolder(
  account: AccountType,
  folder: FolderType,
  newParent?: FolderType | null,
): void {
  assertAccountRoot(account);

  validateNotCircular(folder, newParent);

  const targetList = newParent?.children || account.root.folders;
  moveFolderToIndex(account, folder, newParent, targetList.length);
}

/**
 * Reorder a folder within its current parent
 */
export function reorderFolder(account: AccountType, folder: FolderType, newIndex: number): void {
  moveFolderToIndex(account, folder, folder.parent, newIndex);
}

// =============================================================================
// Query Functions
// =============================================================================

export function getRootFolders(account: AccountType, showArchived = false): FolderType[] {
  if (!account.root?.folders) return [];
  return account.root.folders.filter((f) => showArchived || !f.archived);
}

export function getChildFolders(folder: FolderType, showArchived = false): FolderType[] {
  if (!folder.children || !Array.isArray(folder.children)) return [];
  return folder.children.filter((f: FolderType | null) => f && (showArchived || !f.archived));
}

export function getFolderPath(folder: FolderType): string[] {
  const segments: string[] = [];
  let current: FolderType | undefined = folder;

  while (current) {
    segments.unshift(current.name);
    current = current.parent;
  }

  return segments;
}

export function getFolderDisplayPath(folder: FolderType): string {
  return getFolderPath(folder).join('/');
}

export function findFolderByPath(account: AccountType, pathSegments: string[]): FolderType | null {
  if (!account.root?.folders || pathSegments.length === 0) return null;

  let current: FolderType | undefined;
  let searchList = account.root.folders;

  for (const segment of pathSegments) {
    current = searchList.find((f) => f?.name === segment);
    if (!current) return null;
    searchList = current.children || [];
  }

  return current || null;
}

/**
 * Find a folder by its Jazz ID, searching recursively through the tree
 */
export function findFolderById(account: AccountType, folderId: string): FolderType | null {
  if (!account.root?.folders || !folderId) return null;
  return findFolderRecursive(account.root.folders, folderId);
}

export function getAllTemplateFolders(account: AccountType, showArchived = false): FolderType[] {
  if (!account.root?.folders) return [];

  const foldersArray = account.root.folders ? Array.from(account.root.folders) : [];
  return collectFoldersByPredicate(
    foldersArray,
    // Include: template folders that are not archived (or all if showArchived)
    (folder) => isTemplateFolder(folder) && (showArchived || !folder.archived),
    // Recurse: into non-template folders (and non-archived ones if not showing archived)
    (folder, included) => !included && (showArchived || !folder.archived),
  );
}

export function getArchivedFolders(account: AccountType): FolderType[] {
  if (!account.root?.folders) return [];

  const foldersArray = account.root.folders ? Array.from(account.root.folders) : [];
  return collectFoldersByPredicate(
    foldersArray,
    // Include: archived folders
    (folder) => folder.archived,
    // Recurse: only into non-archived folders (don't recurse into archived folders' children)
    (_folder, included) => !included,
  );
}

// =============================================================================
// Name Utilities
// =============================================================================

export function folderNameExists(
  name: string,
  account: AccountType,
  parentFolder?: FolderType | null,
): boolean {
  const normalizedName = name.toLowerCase();
  const foldersToCheck = parentFolder?.children ?? account.root?.folders ?? [];

  for (const folder of foldersToCheck) {
    if (folder && !folder.archived && folder.name?.toLowerCase() === normalizedName) {
      return true;
    }
  }

  return false;
}

export function generateUniqueFolderName(
  baseName: string,
  account: AccountType,
  parentFolder?: FolderType | null,
): string {
  if (!folderNameExists(baseName, account, parentFolder)) {
    return baseName;
  }

  for (let suffix = 2; suffix <= 100; suffix++) {
    const candidateName = `${baseName} (${suffix})`;
    if (!folderNameExists(candidateName, account, parentFolder)) {
      return candidateName;
    }
  }

  return `${baseName} (${Date.now()})`;
}

// =============================================================================
// Bulk Operations
// =============================================================================

export function emptyTrash(account: AccountType): number {
  const archivedFolders = getArchivedFolders(account);
  let deletedCount = 0;

  for (const folder of archivedFolders.reverse()) {
    try {
      deleteFolder(account, folder);
      deletedCount++;
    } catch (error) {
      console.error('[folderService] Error deleting folder during emptyTrash:', error);
      // Continue with other deletions if one fails
    }
  }

  return deletedCount;
}

export function deleteAllUserData(account: AccountType): void {
  if (!account.root?.folders) return;

  while (account.root.folders.length > 0) {
    const folder = account.root.folders[0];
    if (folder) {
      try {
        deleteFolder(account, folder);
      } catch (error) {
        console.error('[folderService] Error during deleteAllUserData:', error);
        try {
          account.root.folders.$jazz.splice(0, 1);
        } catch (spliceError) {
          console.error('[folderService] Failed to splice folder:', spliceError);
          break;
        }
      }
    } else {
      try {
        account.root.folders.$jazz.splice(0, 1);
      } catch (error) {
        console.error('[folderService] Failed to splice null folder:', error);
        break;
      }
    }
  }
}

export function duplicateTemplate(account: AccountType, folder: FolderType): FolderType {
  assertAccountRoot(account);
  if (!isTemplateFolder(folder)) throw new Error('Can only duplicate template folders');

  const baseName = `${folder.name} (Copy)`;
  const uniqueName = generateUniqueFolderName(baseName, account, folder.parent);
  const now = new Date();
  const folderGroup = createFolderGroup(account, folder.parent);

  // Deep copy non-archived items with new IDs
  const copiedItems = (folder.items || [])
    .filter((item: { archived?: boolean } | null) => item && !item.archived)
    .map((item: NonNullable<(typeof folder.items)[number]>) => ({
      ...item,
      id: crypto.randomUUID(),
      createdAt: now,
    }));

  const duplicatedFolder = FolderNode.create(
    {
      name: uniqueName,
      type: 'template-folder',
      sharingMode: 'private' as const,
      expanded: false,
      archived: false,
      createdBy: account.$jazz.id,
      createdAt: now,
      updatedAt: now,
      items: copiedItems,
      sessions: [],
      showZoneHeadings: folder.showZoneHeadings ?? false,
      parent: folder.parent || undefined,
      owner: account,
    },
    { owner: folderGroup },
  );

  addToLocation(account, duplicatedFolder, folder.parent);
  return duplicatedFolder;
}
