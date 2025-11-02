/**
 * Folder Service
 *
 * Pure functions for folder operations (CRUD).
 * All Jazz database access for folders goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { FolderNode, type GroceriesAccount } from '../schemas';

/**
 * Create a new folder
 */
export function createFolder(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  name: string,
  isTemplate = false,
): string {
  if (!account.root) throw new Error('Account root not initialized');

  const newFolder = FolderNode.create(
    {
      name,
      type: isTemplate ? 'template-folder' : 'folder',
      path: `/${name}`,
      expanded: true,
      archived: false,
      items: [],
      sessions: [],
      currentSessionId: '',
      owner: account,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { owner: account },
  );

  account.root.nodes.$jazz.push(newFolder);
  return newFolder.$jazz.id;
}

/**
 * Get folder by ID
 */
export function getFolder(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
): InstanceOfSchema<typeof FolderNode> | null {
  if (!account.root?.nodes) return null;
  return account.root.nodes.find((n) => n?.$jazz.id === folderId) || null;
}

/**
 * Get all non-archived folders
 */
export function getAllFolders(
  account: InstanceOfSchema<typeof GroceriesAccount>,
): Array<InstanceOfSchema<typeof FolderNode>> {
  if (!account.root?.nodes) return [];
  return account.root.nodes.filter((n) => n && !n.archived) as Array<
    InstanceOfSchema<typeof FolderNode>
  >;
}

/**
 * Get all template folders (non-archived)
 */
export function getTemplateFolders(
  account: InstanceOfSchema<typeof GroceriesAccount>,
): Array<InstanceOfSchema<typeof FolderNode>> {
  return getAllFolders(account).filter((f) => f.type === 'template-folder');
}

/**
 * Rename a folder
 */
export function renameFolder(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  newName: string,
): void {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);

  folder.$jazz.set('name', newName);
  folder.$jazz.set('path', `/${newName}`);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Archive (soft delete) a folder
 */
export function archiveFolder(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
): void {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);

  folder.$jazz.set('archived', true);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Check if folder exists (and is not archived)
 */
export function folderExists(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
): boolean {
  const folder = getFolder(account, folderId);
  return folder != null && !folder.archived;
}
