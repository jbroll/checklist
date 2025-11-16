/**
 * Folder Service
 *
 * Manages hierarchical folder tree using FolderNode CoValues.
 * Replaces the old path-based directory service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { co } from 'jazz-tools';
import { type Account, FolderNode, Session } from '../schemas';

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

  if (isTemplate) {
    // Create template folder
    const sessions = co.list(Session).create([], { owner: account });

    const folder = FolderNode.create(
      {
        name,
        expanded: false,
        archived: false,
        items: [],
        sessions,
        showZoneHeadings: false,
        parent: parent || undefined,
        owner: account,
        createdAt: now,
        updatedAt: now,
      },
      { owner: account },
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
    const children = co.list(FolderNode).create([], { owner: account });

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
      { owner: account },
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
  return folder.children.filter((f) => showArchived || !f.archived);
}

/**
 * Rename a folder
 */
export function renameFolder(
  folder: InstanceOfSchema<typeof FolderNode>,
  newName: string,
): void {
  folder.$jazz.set('name', newName);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Archive (soft delete) a folder
 * Recursively archives all children
 */
export function archiveFolder(folder: InstanceOfSchema<typeof FolderNode>): void {
  const now = new Date();

  folder.$jazz.set('archived', true);
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
 */
export function unarchiveFolder(folder: InstanceOfSchema<typeof FolderNode>): void {
  const now = new Date();

  folder.$jazz.set('archived', false);
  folder.$jazz.set('updatedAt', now);

  // Recursively unarchive children (for organizational folders)
  if (folder.children) {
    for (const child of folder.children) {
      if (child && child.archived) {
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

  // For template folders, clean up sessions
  if (folder.sessions) {
    while (folder.sessions.length > 0) {
      folder.sessions.$jazz.splice(0, 1);
    }
  }

  // Remove from parent or root
  if (folder.parent?.children) {
    const index = folder.parent.children.findIndex((f) => f?.$jazz.id === folder.$jazz.id);
    if (index !== -1) {
      folder.parent.children.$jazz.splice(index, 1);
    }
  } else {
    const index = account.root.folders.findIndex((f) => f?.$jazz.id === folder.$jazz.id);
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

  // Remove from old parent
  if (folder.parent?.children) {
    const index = folder.parent.children.findIndex((f) => f?.$jazz.id === folder.$jazz.id);
    if (index !== -1) {
      folder.parent.children.$jazz.splice(index, 1);
    }
  } else {
    const index = account.root.folders.findIndex((f) => f?.$jazz.id === folder.$jazz.id);
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
  const oldIndex = parentList.findIndex((f) => f?.$jazz.id === folder.$jazz.id);

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

  collectTemplates(account.root.folders);
  return templates;
}
