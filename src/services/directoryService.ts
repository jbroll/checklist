/**
 * Directory Service
 *
 * Manages directory entries (like filesystem dentries).
 * Directory entries are lightweight and contain either:
 * - Organizational folders (type='folder')
 * - Template references (type='template-ref' with templateId)
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, type DirectoryEntry, Template } from '../schemas';
import { calculateDescendantPaths, calculateNewPath } from '../utils/pathUtils';

/**
 * Create a new directory entry (folder or template-ref)
 */
export function createDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  name: string,
  isTemplate: boolean,
  parentPath?: string | null,
): { entryId: string; templateId?: string } {
  if (!account.root) throw new Error('Account root not initialized');

  // Normalize name for path
  const normalizedName = name.trim().replace(/\s+/g, '-');
  const path = parentPath ? `${parentPath}/${normalizedName}` : normalizedName;

  const now = new Date();
  const entryId = crypto.randomUUID();

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

    return { entryId, templateId: template.$jazz.id };
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

    return { entryId };
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
 * Get all non-archived directory entries
 */
export function getAllDirectoryEntries(
  account: InstanceOfSchema<typeof Account>,
): DirectoryEntry[] {
  if (!account.root?.directory) return [];
  return account.root.directory.filter((e) => !e.archived);
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
 */
export function archiveDirectoryEntry(
  account: InstanceOfSchema<typeof Account>,
  entryId: string,
): void {
  if (!account.root?.directory) throw new Error('Directory not initialized');

  const updatedEntries = account.root.directory.map((e) =>
    e.id === entryId ? { ...e, archived: true, updatedAt: new Date() } : e,
  );

  account.root.$jazz.set('directory', updatedEntries);

  // Note: We don't delete the template "inode" - it could be unarchived later
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
 * Check if directory entry exists (and is not archived)
 */
export function entryExists(account: InstanceOfSchema<typeof Account>, entryId: string): boolean {
  const entry = getDirectoryEntry(account, entryId);
  return entry != null && !entry.archived;
}
