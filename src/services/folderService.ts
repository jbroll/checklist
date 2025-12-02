/**
 * Folder Service
 *
 * Manages hierarchical folder tree using FolderNode CoValues.
 * Replaces the old path-based directory service.
 */

import { co, Group, type InstanceOfSchema } from 'jazz-tools';
import { type Account, FolderNode } from '../schemas';

/**
 * Helper to determine if a FolderNode is a template folder
 */
export function isTemplateFolder(folder: InstanceOfSchema<typeof FolderNode>): boolean {
  return folder.items !== undefined;
}

/**
 * Helper to determine if a FolderNode is an organizational folder
 */
export function isOrganizationalFolder(folder: InstanceOfSchema<typeof FolderNode>): boolean {
  return folder.children !== undefined;
}

/**
 * Create a new folder (organizational or template)
 */
export function createFolder(
  account: InstanceOfSchema<typeof Account>,
  name: string,
  isTemplate: boolean,
  parent?: InstanceOfSchema<typeof FolderNode> | null,
): InstanceOfSchema<typeof FolderNode> {
  if (!account.root) throw new Error('Account root not initialized');

  const now = new Date();

  // Create a new group for this folder to enable sharing
  const folderGroup = Group.create({ owner: account });

  // Add creator explicitly to members for consistency
  // (group owner has implicit admin rights, but adding explicitly makes UI/logic simpler)
  folderGroup.addMember(account, 'admin');

  // Add parent's group as member for cascading permissions
  // Anyone with access to parent will also have access to this folder
  if (parent) {
    const parentGroup = parent.$jazz.owner as Group;
    folderGroup.addMember(parentGroup);
  }

  if (isTemplate) {
    // Create template folder
    const folder = FolderNode.create(
      {
        name,
        expanded: false,
        archived: false,
        items: [],
        sessions: [], // Plain JavaScript array
        showZoneHeadings: false,
        parent: parent || undefined,
        owner: account,
        createdAt: now,
        updatedAt: now,
      },
      { owner: folderGroup },
    );

    // Add to parent or root
    if (parent?.children) {
      parent.children.$jazz.push(folder);
    } else {
      account.root.folders.$jazz.push(folder);
    }

    return folder;
  } else {
    // Create organizational folder
    const children = co.list(FolderNode).create([], { owner: folderGroup });

    const folder = FolderNode.create(
      {
        name,
        expanded: true,
        archived: false,
        children,
        parent: parent || undefined,
        owner: account,
        createdAt: now,
        updatedAt: now,
      },
      { owner: folderGroup },
    );

    // Add to parent or root
    if (parent?.children) {
      parent.children.$jazz.push(folder);
    } else {
      account.root.folders.$jazz.push(folder);
    }

    return folder;
  }
}

/**
 * Check if a folder name exists in the target location (case-insensitive)
 *
 * @param name - Folder name to check
 * @param account - User's Account
 * @param parentFolder - Optional parent folder (checks parent's children, or root if not provided)
 * @returns True if name already exists
 */
export function folderNameExists(
  name: string,
  account: InstanceOfSchema<typeof Account>,
  parentFolder?: InstanceOfSchema<typeof FolderNode> | null,
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

/**
 * Generate a unique folder name by adding a numeric suffix if needed
 *
 * @param baseName - Desired folder name
 * @param account - User's Account
 * @param parentFolder - Optional parent folder
 * @returns Unique name (original or with suffix like "Name (2)")
 */
export function generateUniqueFolderName(
  baseName: string,
  account: InstanceOfSchema<typeof Account>,
  parentFolder?: InstanceOfSchema<typeof FolderNode> | null,
): string {
  if (!folderNameExists(baseName, account, parentFolder)) {
    return baseName;
  }

  // Try adding numeric suffixes
  let suffix = 2;
  while (suffix <= 100) {
    const candidateName = `${baseName} (${suffix})`;
    if (!folderNameExists(candidateName, account, parentFolder)) {
      return candidateName;
    }
    suffix++;
  }

  // Fallback: add timestamp
  return `${baseName} (${Date.now()})`;
}

/**
 * Get all root folders
 */
export function getRootFolders(
  account: InstanceOfSchema<typeof Account>,
  showArchived = false,
): InstanceOfSchema<typeof FolderNode>[] {
  if (!account.root?.folders) return [];
  return account.root.folders.filter((f) => showArchived || !f.archived);
}

/**
 * Get children of a folder (for organizational folders only)
 */
export function getChildFolders(
  folder: InstanceOfSchema<typeof FolderNode>,
  showArchived = false,
): InstanceOfSchema<typeof FolderNode>[] {
  if (!folder.children) return [];
  return folder.children.filter(
    (f: InstanceOfSchema<typeof FolderNode> | null) => f && (showArchived || !f.archived),
  );
}

/**
 * Rename a folder
 */
export function renameFolder(folder: InstanceOfSchema<typeof FolderNode>, newName: string): void {
  folder.$jazz.set('name', newName);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Format archive timestamp for folder name suffix
 * Format: "YYYY-MM-DD HH:MM" (24-hour, local time)
 */
function formatArchiveTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Archive (soft delete) a folder
 * Recursively archives all children
 * Appends archive timestamp to name to avoid collisions with active folders
 */
export function archiveFolder(folder: InstanceOfSchema<typeof FolderNode>): void {
  const now = new Date();

  // Append archive timestamp to name to differentiate from active folders
  const archiveSuffix = ` (archived ${formatArchiveTimestamp(now)})`;
  folder.$jazz.set('name', folder.name + archiveSuffix);
  folder.$jazz.set('archived', true);
  folder.$jazz.set('archivedAt', now);
  folder.$jazz.set('updatedAt', now);

  // Recursively archive children (for organizational folders)
  if (folder.children) {
    for (const child of folder.children) {
      if (child && !child.archived) {
        archiveFolder(child);
      }
    }
  }
}

/**
 * Unarchive (restore) a folder
 * Recursively unarchives all children
 * Removes the archive timestamp suffix from the name
 */
export function unarchiveFolder(folder: InstanceOfSchema<typeof FolderNode>): void {
  const now = new Date();

  // Remove the archive timestamp suffix from the name if present
  const archivePattern = / \(archived \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/;
  const cleanedName = folder.name.replace(archivePattern, '');
  if (cleanedName !== folder.name) {
    folder.$jazz.set('name', cleanedName);
  }

  folder.$jazz.set('archived', false);
  folder.$jazz.set('archivedAt', undefined);
  folder.$jazz.set('updatedAt', now);

  // Recursively unarchive children (for organizational folders)
  if (folder.children) {
    for (const child of folder.children) {
      if (child?.archived) {
        unarchiveFolder(child);
      }
    }
  }
}

/**
 * Permanently delete a folder and all its children
 *
 * WARNING: This permanently removes the folder CoValue.
 * Jazz handles cascading cleanup of nested CoValues.
 */
export function deleteFolder(
  account: InstanceOfSchema<typeof Account>,
  folder: InstanceOfSchema<typeof FolderNode>,
): void {
  if (!account.root) throw new Error('Account root not initialized');

  // Recursively delete children first (for organizational folders)
  if (folder.children) {
    while (folder.children.length > 0) {
      const child = folder.children[0];
      if (child) {
        deleteFolder(account, child);
      }
    }
  }

  // For template folders, clear sessions (plain array, not CoList)
  if (folder.sessions) {
    folder.$jazz.set('sessions', []);
  }

  // Remove from parent or root
  if (folder.parent?.children) {
    const index = folder.parent.children.findIndex(
      (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === folder.$jazz.id,
    );
    if (index !== -1) {
      folder.parent.children.$jazz.splice(index, 1);
    }
  } else {
    const index = account.root.folders.findIndex(
      (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === folder.$jazz.id,
    );
    if (index !== -1) {
      account.root.folders.$jazz.splice(index, 1);
    }
  }
}

/**
 * Toggle expanded state of a folder
 */
export function toggleFolderExpanded(folder: InstanceOfSchema<typeof FolderNode>): void {
  folder.$jazz.set('expanded', !folder.expanded);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Set expanded state of a folder explicitly
 */
export function setFolderExpanded(
  folder: InstanceOfSchema<typeof FolderNode>,
  expanded: boolean,
): void {
  folder.$jazz.set('expanded', expanded);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Expand all ancestor folders to make this folder visible
 */
export function expandAncestorFolders(folder: InstanceOfSchema<typeof FolderNode>): void {
  let current = folder.parent;
  while (current) {
    current.$jazz.set('expanded', true);
    current.$jazz.set('updatedAt', new Date());
    current = current.parent;
  }
}

/**
 * Move a folder to a new parent location
 *
 * Updates group membership to maintain cascading permissions hierarchy.
 */
export function moveFolder(
  account: InstanceOfSchema<typeof Account>,
  folder: InstanceOfSchema<typeof FolderNode>,
  newParent?: InstanceOfSchema<typeof FolderNode> | null,
): void {
  if (!account.root) throw new Error('Account root not initialized');

  // Prevent moving a folder into itself or its descendants
  if (newParent) {
    let current = newParent;
    while (current) {
      if (current.$jazz.id === folder.$jazz.id) {
        throw new Error('Cannot move folder into itself or its descendants');
      }
      current = current.parent;
    }
  }

  const folderGroup = folder.$jazz.owner as Group;

  // Update group membership for cascading permissions
  // Remove old parent's group from folder's group membership
  if (folder.parent) {
    const oldParentGroup = folder.parent.$jazz.owner as Group;
    folderGroup.removeMember(oldParentGroup);
  }

  // Add new parent's group to folder's group membership
  if (newParent) {
    const newParentGroup = newParent.$jazz.owner as Group;
    folderGroup.addMember(newParentGroup);
  }

  // Remove from old parent
  if (folder.parent?.children) {
    const index = folder.parent.children.findIndex(
      (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === folder.$jazz.id,
    );
    if (index !== -1) {
      folder.parent.children.$jazz.splice(index, 1);
    }
  } else {
    const index = account.root.folders.findIndex(
      (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === folder.$jazz.id,
    );
    if (index !== -1) {
      account.root.folders.$jazz.splice(index, 1);
    }
  }

  // Add to new parent
  if (newParent?.children) {
    newParent.children.$jazz.push(folder);
  } else {
    account.root.folders.$jazz.push(folder);
  }

  // Update parent reference
  folder.$jazz.set('parent', newParent || undefined);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Get the path of a folder (computed from hierarchy)
 */
export function getFolderPath(folder: InstanceOfSchema<typeof FolderNode>): string[] {
  const segments: string[] = [];
  let current: InstanceOfSchema<typeof FolderNode> | undefined = folder;

  while (current) {
    segments.unshift(current.name);
    current = current.parent;
  }

  return segments;
}

/**
 * Get display path as string (for UI)
 */
export function getFolderDisplayPath(folder: InstanceOfSchema<typeof FolderNode>): string {
  return getFolderPath(folder).join('/');
}

/**
 * Find a folder by path segments
 */
export function findFolderByPath(
  account: InstanceOfSchema<typeof Account>,
  pathSegments: string[],
): InstanceOfSchema<typeof FolderNode> | null {
  if (!account.root?.folders || pathSegments.length === 0) return null;

  let current: InstanceOfSchema<typeof FolderNode> | undefined;
  let searchList = account.root.folders;

  for (const segment of pathSegments) {
    current = searchList.find((f) => f?.name === segment);
    if (!current) return null;
    searchList = current.children || [];
  }

  return current || null;
}

/**
 * Reorder a folder within its parent
 */
export function reorderFolder(
  account: InstanceOfSchema<typeof Account>,
  folder: InstanceOfSchema<typeof FolderNode>,
  newIndex: number,
): void {
  if (!account.root) throw new Error('Account root not initialized');

  const parentList = folder.parent?.children || account.root.folders;
  const oldIndex = parentList.findIndex(
    (f: InstanceOfSchema<typeof FolderNode> | null) => f?.$jazz.id === folder.$jazz.id,
  );

  if (oldIndex === -1) {
    throw new Error('Folder not found in parent');
  }

  // Remove from old position
  parentList.$jazz.splice(oldIndex, 1);

  // Insert at new position
  parentList.$jazz.splice(newIndex, 0, folder);
}

/**
 * Get all template folders (recursively)
 */
export function getAllTemplateFolders(
  account: InstanceOfSchema<typeof Account>,
  showArchived = false,
): InstanceOfSchema<typeof FolderNode>[] {
  if (!account.root?.folders) return [];

  const templates: InstanceOfSchema<typeof FolderNode>[] = [];

  function collectTemplates(folders: InstanceOfSchema<typeof FolderNode>[]) {
    for (const folder of folders) {
      if (!folder) continue;
      if (!showArchived && folder.archived) continue;

      if (isTemplateFolder(folder)) {
        templates.push(folder);
      } else if (folder.children) {
        collectTemplates(folder.children);
      }
    }
  }

  collectTemplates(Array.from(account.root.folders));
  return templates;
}

/**
 * Get top-level archived folders (not children of other archived folders)
 * This returns only the root-level archived folders to avoid double-deletion
 */
export function getArchivedFolders(
  account: InstanceOfSchema<typeof Account>,
): InstanceOfSchema<typeof FolderNode>[] {
  if (!account.root?.folders) return [];

  const archived: InstanceOfSchema<typeof FolderNode>[] = [];

  function collectArchived(folders: InstanceOfSchema<typeof FolderNode>[]) {
    for (const folder of folders) {
      if (!folder) continue;

      if (folder.archived) {
        // Only add archived folders - don't recurse into their children
        // since deleting the parent will delete children too
        archived.push(folder);
      } else if (folder.children) {
        // Only recurse into non-archived folders to find nested archived ones
        collectArchived(folder.children);
      }
    }
  }

  collectArchived(Array.from(account.root.folders));
  return archived;
}

/**
 * Empty trash - permanently delete all archived folders
 *
 * @param account - User's Account
 * @returns Number of folders permanently deleted
 */
export function emptyTrash(account: InstanceOfSchema<typeof Account>): number {
  const archivedFolders = getArchivedFolders(account);
  let deletedCount = 0;

  // Delete each archived folder (in reverse to handle nested folders properly)
  for (const folder of archivedFolders.reverse()) {
    try {
      deleteFolder(account, folder);
      deletedCount++;
    } catch {
      // Continue with other deletions if one fails
    }
  }

  return deletedCount;
}

/**
 * Delete all user data - used for account deletion.
 * Removes all folders (and their nested items/sessions) from the account.
 * This ensures Jazz data is cleaned up before account keys are deleted.
 * @param account - User's Account
 */
export function deleteAllUserData(account: InstanceOfSchema<typeof Account>): void {
  if (!account.root?.folders) return;

  // Delete all root folders (which recursively deletes children)
  while (account.root.folders.length > 0) {
    const folder = account.root.folders[0];
    if (folder) {
      try {
        deleteFolder(account, folder);
      } catch {
        // If deletion fails, try to remove from list to avoid infinite loop
        try {
          account.root.folders.$jazz.splice(0, 1);
        } catch {
          // If that also fails, break to avoid infinite loop
          break;
        }
      }
    } else {
      // Remove null entry
      try {
        account.root.folders.$jazz.splice(0, 1);
      } catch {
        break;
      }
    }
  }
}
