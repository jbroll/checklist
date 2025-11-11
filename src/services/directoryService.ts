/**
 * Directory Service
 *
 * Manages directory entries (like filesystem dentries).
 * Directory entries are lightweight and contain either:
 * - Organizational folders (type='folder')
 * - Template references (type='template-ref' with templateId)
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { generateId } from '../lib/utils';
import { type Account, type DirectoryEntry, Template } from '../schemas';
import { calculateDescendantPaths, calculateNewPath, PATH_SEPARATOR } from '../utils/pathUtils';

/**
 * Create a new directory entry (folder or template-ref)
 */
export function createDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  name: string,
  isTemplate: boolean,
  parentPath?: string | null,
): { entryId: string; templateId?: string; path: string } {
  if (!account.root) throw new Error('Account root not initialized');

  // Use name as-is without normalization
  const normalizedName = name.trim();
  const path = parentPath ? `${parentPath}${PATH_SEPARATOR}${normalizedName}` : normalizedName;

  const now = new Date();
  const entryId = generateId();

  if (isTemplate) {
    // Create template "inode"
    const template = Template.create(
      {
        name,
        items: [],
        sessions: [],
        currentSessionId: undefined,
        showZoneHeadings: false,
        owner: account,
        createdAt: now,
        updatedAt: now,
      },
      { owner: account },
    );

    account.root.templates.$jazz.push(template);

    // Create template-ref entry in directory
    const entry: DirectoryEntry = {
      id: entryId,
      name,
      type: 'template-ref',
      path,
      expanded: false,
      archived: false,
      templateId: template.$jazz.id,
      createdAt: now,
      updatedAt: now,
    };

    account.root.$jazz.set('directory', [...account.root.directory, entry]);

    return { entryId, templateId: template.$jazz.id, path };
  } else {
    // Create organizational folder entry
    const entry: DirectoryEntry = {
      id: entryId,
      name,
      type: 'folder',
      path,
      expanded: true,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    account.root.$jazz.set('directory', [...account.root.directory, entry]);

    return { entryId, path };
  }
}

/**
 * Get directory entry by ID
 */
export function getDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
): DirectoryEntry | null {
  if (!account.root?.directory) return null;
  return account.root.directory.find((e) => e.id === entryId) || null;
}

/**
 * Get all directory entries (filter by archived status)
 */
export function getAllDirectoryEntries(
  account: InstanceOfSchema<typeof Account>,
  showArchived = false,
): DirectoryEntry[] {
  if (!account.root?.directory) return [];
  // Show all entries (both archived and active) when showArchived=true, only active when false
  return account.root.directory.filter((e) => showArchived || !e.archived);
}

/**
 * Get template-ref entries only
 */
export function getTemplateRefEntries(account: InstanceOfSchema<typeof Account>): DirectoryEntry[] {
  return getAllDirectoryEntries(account).filter((e) => e.type === 'template-ref');
}

/**
 * Rename a directory entry
 */
export function renameDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
  newName: string,
): void {
  if (!account.root?.directory) throw new Error('Directory not initialized');

  const entryIndex = account.root.directory.findIndex((e) => e.id === entryId);
  if (entryIndex === -1) throw new Error(`Entry ${entryId} not found`);

  const entry = account.root.directory[entryIndex];
  const updatedEntries = [...account.root.directory];

  // Update name
  updatedEntries[entryIndex] = {
    ...entry,
    name: newName,
    updatedAt: new Date(),
  };

  account.root.$jazz.set('directory', updatedEntries);

  // If it's a template-ref, also update the template name
  if (entry.type === 'template-ref' && entry.templateId) {
    const template = account.root.templates?.find((t) => t?.$jazz.id === entry.templateId);
    if (template) {
      template.$jazz.set('name', newName);
      template.$jazz.set('updatedAt', new Date());
    }
  }
}

/**
 * Archive (soft delete) a directory entry
 * If archiving a folder, also archives all child entries under that folder's path
 */
export function archiveDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
): void {
  if (!account.root?.directory) throw new Error('Directory not initialized');

  const now = new Date();
  const entry = account.root.directory.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);

  const updatedEntries = account.root.directory.map((e) => {
    // Archive the entry itself
    if (e.id === entryId) {
      return { ...e, archived: true, updatedAt: now };
    }
    // Archive all entries whose paths start with this folder's path (if it's a folder)
    if (entry.type === 'folder' && e.path.startsWith(`${entry.path}${PATH_SEPARATOR}`)) {
      return { ...e, archived: true, updatedAt: now };
    }
    return e;
  });

  account.root.$jazz.set('directory', updatedEntries);

  // Note: We don't delete the template "inode" - it could be unarchived later
}

/**
 * Unarchive (restore) a directory entry
 * If unarchiving a folder, also unarchives all child entries under that folder's path
 */
export function unarchiveDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
): void {
  if (!account.root?.directory) throw new Error('Directory not initialized');

  const now = new Date();
  const entry = account.root.directory.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);

  const updatedEntries = account.root.directory.map((e) => {
    // Unarchive the entry itself
    if (e.id === entryId) {
      return { ...e, archived: false, updatedAt: now };
    }
    // Unarchive all entries whose paths start with this folder's path (if it's a folder)
    if (entry.type === 'folder' && e.path.startsWith(`${entry.path}${PATH_SEPARATOR}`)) {
      return { ...e, archived: false, updatedAt: now };
    }
    return e;
  });

  account.root.$jazz.set('directory', updatedEntries);
}

/**
 * Permanently delete a directory entry and its associated template
 *
 * This function permanently removes:
 * - The directory entry from the directory list
 * - The template "inode" from the templates list (if template-ref)
 * - All sessions within the template (cleaned up by Jazz when template is removed)
 * - All child entries if deleting a folder (recursive)
 *
 * Note: Jazz handles cascading cleanup of nested CoValues (sessions)
 * when the parent CoValue (template) is removed from a CoList.
 */
export function deleteDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
): void {
  if (!account.root?.directory) throw new Error('Directory not initialized');

  const entry = account.root.directory.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);

  // If it's a folder, recursively delete all children first
  if (entry.type === 'folder') {
    const childEntries = account.root.directory.filter((e) =>
      e.path.startsWith(`${entry.path}${PATH_SEPARATOR}`),
    );
    for (const child of childEntries) {
      // Recursively delete each child (which will handle their children too)
      deleteDirectoryEntry(account, child.id);
    }
  }

  // Remove from directory
  const updatedEntries = account.root.directory.filter((e) => e.id !== entryId);
  account.root.$jazz.set('directory', updatedEntries);

  // If it's a template-ref, remove the template "inode" from templates list
  if (entry.type === 'template-ref' && entry.templateId && account.root.templates) {
    const templateIndex = account.root.templates.findIndex((t) => t?.$jazz.id === entry.templateId);
    if (templateIndex !== -1) {
      const template = account.root.templates[templateIndex];

      // Clear sessions list before removing template (explicit cleanup)
      // This ensures all session CoValues are properly dereferenced
      if (template?.sessions) {
        // Remove all sessions from the list
        while (template.sessions.length > 0) {
          template.sessions.$jazz.splice(0, 1);
        }
      }

      // Remove template from the list
      // Jazz will handle cleanup of the template CoValue and any remaining nested data
      account.root.templates.$jazz.splice(templateIndex, 1);
    }
  }
}

/**
 * Toggle expanded state of a directory entry
 */
export function toggleEntryExpanded(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
): void {
  if (!account.root?.directory) return;

  const updatedEntries = account.root.directory.map((e) =>
    e.id === entryId ? { ...e, expanded: !e.expanded, updatedAt: new Date() } : e,
  );

  account.root.$jazz.set('directory', updatedEntries);
}

/**
 * Move a directory entry to a new parent location
 */
export function moveDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
  newParentPath: string | undefined,
): void {
  if (!account.root?.directory) throw new Error('Directory not initialized');

  const entry = account.root.directory.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);

  const oldPath = entry.path;

  // Use pure function to calculate new path and validate
  const pathResult = calculateNewPath(entry.name, oldPath, newParentPath);

  if (!pathResult.isValid) {
    if (pathResult.error === 'Already at this location') {
      return;
    }
    throw new Error(pathResult.error);
  }

  const newPath = pathResult.newPath;

  // Update the moved entry's path
  let updatedEntries = account.root.directory.map((e) =>
    e.id === entryId ? { ...e, path: newPath, updatedAt: new Date() } : e,
  );

  // Calculate and update descendant paths
  const allPaths = account.root.directory.map((e) => ({ id: e.id, path: e.path }));
  const descendantUpdates = calculateDescendantPaths(oldPath, newPath, allPaths);

  for (const update of descendantUpdates) {
    updatedEntries = updatedEntries.map((e) =>
      e.id === update.id ? { ...e, path: update.newPath, updatedAt: new Date() } : e,
    );
  }

  account.root.$jazz.set('directory', updatedEntries);
}

/**
 * Reorder a directory entry to a new position in the array
 * Uses array position to determine visual order
 */
export function reorderDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
  newIndex: number,
): void {
  if (!account.root) throw new Error('Account root not initialized');

  const directory = [...account.root.directory];
  const oldIndex = directory.findIndex((e) => e.id === entryId);

  if (oldIndex === -1) {
    throw new Error(`Entry ${entryId} not found`);
  }

  // Remove from old position
  const [entry] = directory.splice(oldIndex, 1);

  // Insert at new position
  directory.splice(newIndex, 0, entry);

  // Update directory array
  account.root.$jazz.set('directory', directory);
}

/**
 * Check if directory entry exists (and is not archived)
 */
export function entryExists(account: InstanceOfSchema<typeof Account>, entryId: string): boolean {
  const entry = getDirectoryEntry(account, entryId);
  return entry != null && !entry.archived;
}
