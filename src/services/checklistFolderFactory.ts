/**
 * CheckList Folder Factory
 *
 * CheckList-specific folder creation and manipulation functions.
 * Generic hierarchy operations should use @jbr-jazz/hierarchy-shared directly.
 */

import { createNodeGroup } from '@jbr-jazz/hierarchy-shared';
import { co, type Group, type InstanceOfSchema } from 'jazz-tools';
import { type Account, FolderNode } from '../schemas';
import { canCreateList, getMaxLists } from './subscriptionService';

/**
 * Create a Group for a new folder using the Group-per-node pattern from jbr-jazz
 */
function createFolderGroup(account: AccountType, parent: FolderType | null | undefined): Group {
  return createNodeGroup({
    account,
    parentNode: parent ?? undefined,
  });
}

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

type FolderType = InstanceOfSchema<typeof FolderNode>;
type AccountType = InstanceOfSchema<typeof Account>;
type FolderList = FolderType[] & {
  $jazz: {
    push: (folder: FolderType) => void;
    splice: (start: number, deleteCount: number, ...items: FolderType[]) => void;
  };
};

/**
 * Assert that account root is initialized, throw if not
 */
function assertAccountRoot(
  account: AccountType,
): asserts account is AccountType & { root: NonNullable<AccountType['root']> } {
  if (!account.root) throw new AccountNotInitializedError();
}

/**
 * Add folder to target location
 */
function addToLocation(
  account: AccountType,
  folder: FolderType,
  parent: FolderType | null | undefined,
): void {
  const targetList = parent?.children || account.root?.folders;
  if (!targetList) return;
  targetList.$jazz.push(folder);
}

/**
 * Check if folder is a template folder (has items array)
 */
export function isTemplateFolder(folder: FolderType): boolean {
  return folder.items !== undefined;
}

/**
 * Check if folder is an organizational folder (has children array)
 */
export function isOrganizationalFolder(folder: FolderType): boolean {
  return folder.children !== undefined;
}

/**
 * Create a new CheckList folder (template or organizational)
 *
 * Includes subscription limit checking for template folders.
 * Uses the Group-per-node pattern from @jbr-jazz/hierarchy-shared.
 */
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

/**
 * Delete a CheckList folder
 *
 * Clears sessions for template folders before deletion.
 * Uses hierarchy-shared deleteNode internally.
 */
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

  // Remove from parent's list
  const list = (folder.parent?.children || account.root?.folders) as FolderList | undefined;
  if (!list) return;

  const index = [...list].findIndex((f) => f?.$jazz.id === folder.$jazz.id);
  if (index !== -1) {
    list.$jazz.splice(index, 1);
  }
}

/**
 * Duplicate a template folder with all its items
 */
export function duplicateTemplate(account: AccountType, folder: FolderType): FolderType {
  assertAccountRoot(account);
  if (!isTemplateFolder(folder)) throw new Error('Can only duplicate template folders');

  const baseName = `${folder.name} (Copy)`;
  const now = new Date();
  const folderGroup = createFolderGroup(account, folder.parent);

  // Generate unique name
  let uniqueName = baseName;
  const foldersToCheck = folder.parent?.children ?? account.root?.folders ?? [];
  const existingNames = new Set(
    [...foldersToCheck]
      .filter((f): f is FolderType => f != null && !f.archived)
      .map((f) => f.name.toLowerCase()),
  );

  if (existingNames.has(uniqueName.toLowerCase())) {
    for (let suffix = 2; suffix <= 100; suffix++) {
      const candidate = `${baseName} (${suffix})`;
      if (!existingNames.has(candidate.toLowerCase())) {
        uniqueName = candidate;
        break;
      }
    }
  }

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

/**
 * Get all root-level folders
 */
export function getRootFolders(account: AccountType, showArchived = false): FolderType[] {
  if (!account.root?.folders) return [];
  return [...account.root.folders].filter(
    (f): f is FolderType => f != null && (showArchived || !f.archived),
  );
}

/**
 * Get child folders of a folder
 */
export function getChildFolders(folder: FolderType, showArchived = false): FolderType[] {
  if (!folder.children || !Array.isArray(folder.children)) return [];
  return [...folder.children].filter(
    (f): f is FolderType => f != null && (showArchived || !f.archived),
  );
}

/**
 * Find folder by path segments
 */
export function findFolderByPath(account: AccountType, pathSegments: string[]): FolderType | null {
  if (!account.root?.folders || pathSegments.length === 0) return null;

  let current: FolderType | undefined;
  let searchList = [...account.root.folders].filter((f): f is FolderType => f != null);

  for (const segment of pathSegments) {
    current = searchList.find((f) => f?.name === segment);
    if (!current) return null;
    searchList = current.children
      ? [...current.children].filter((f): f is FolderType => f != null)
      : [];
  }

  return current || null;
}

/**
 * Get all template folders (recursive)
 */
export function getAllTemplateFolders(account: AccountType, showArchived = false): FolderType[] {
  if (!account.root?.folders) return [];

  const results: FolderType[] = [];

  function collect(folders: FolderType[]) {
    for (const folder of folders) {
      if (!folder) continue;
      if (folder.archived && !showArchived) continue;

      if (isTemplateFolder(folder)) {
        results.push(folder);
      } else if (folder.children) {
        collect([...folder.children].filter((f): f is FolderType => f != null));
      }
    }
  }

  collect([...account.root.folders].filter((f): f is FolderType => f != null));
  return results;
}

/**
 * Delete all user data (for account deletion)
 */
export function deleteAllUserData(account: AccountType): void {
  if (!account.root?.folders) return;

  while (account.root.folders.length > 0) {
    const folder = account.root.folders[0];
    if (folder) {
      try {
        deleteFolder(account, folder);
      } catch (error) {
        console.error('[checklistFolderFactory] Error during deleteAllUserData:', error);
        try {
          account.root.folders.$jazz.splice(0, 1);
        } catch (spliceError) {
          console.error('[checklistFolderFactory] Failed to splice folder:', spliceError);
          break;
        }
      }
    } else {
      try {
        account.root.folders.$jazz.splice(0, 1);
      } catch (error) {
        console.error('[checklistFolderFactory] Failed to splice null folder:', error);
        break;
      }
    }
  }
}
