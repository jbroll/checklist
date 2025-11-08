/**
 * Folder Service
 *
 * Pure functions for folder operations (CRUD).
 * All Jazz database access for folders goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, FolderNode } from '../schemas';
import { calculateDescendantPaths, calculateNewPath } from '../utils/pathUtils';

/**
 * Create a new folder
 * @param account - User account
 * @param name - Folder name
 * @param isTemplate - Whether this is a template folder (leaf) or organizational folder
 * @param parentPath - Optional parent folder path (e.g., "stores" or "stores/wegmans")
 */
export function createFolder(
  account: InstanceOfSchema<typeof Account>,
  name: string,
  isTemplate = false,
  parentPath?: string | null,
): string {
  if (!account.root) throw new Error('Account root not initialized');
  if (!account.root.nodes)
    throw new Error(
      'Account root.nodes not initialized - please clear browser data and log in again',
    );

  // Normalize name for path (replace spaces with hyphens)
  const normalizedName = name.trim().replace(/\s+/g, '-');

  // Construct path based on parent
  // Pin-maker pattern: parentPath ? `${parentPath}/${normalizedName}` : normalizedName
  const path = parentPath ? `${parentPath}/${normalizedName}` : normalizedName;

  const newFolder = FolderNode.create(
    {
      name,
      type: isTemplate ? 'template-folder' : 'folder',
      path,
      // Folders start expanded, templates start collapsed
      expanded: !isTemplate,
      archived: false,
      showZoneHeadings: false, // Hide zone headings by default
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
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
): InstanceOfSchema<typeof FolderNode> | null {
  if (!account.root?.nodes) return null;
  return account.root.nodes.find((n) => n?.$jazz.id === folderId) || null;
}

/**
 * Get all non-archived folders
 */
export function getAllFolders(
  account: InstanceOfSchema<typeof Account>,
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
  account: InstanceOfSchema<typeof Account>,
): Array<InstanceOfSchema<typeof FolderNode>> {
  return getAllFolders(account).filter((f) => f.type === 'template-folder');
}

/**
 * Rename a folder
 */
export function renameFolder(
  account: InstanceOfSchema<typeof Account>,
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
export function archiveFolder(account: InstanceOfSchema<typeof Account>, folderId: string): void {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);

  folder.$jazz.set('archived', true);
  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Check if folder exists (and is not archived)
 */
export function folderExists(account: InstanceOfSchema<typeof Account>, folderId: string): boolean {
  const folder = getFolder(account, folderId);
  return folder != null && !folder.archived;
}

/**
 * Move a folder to a new parent location
 * @param account - User account
 * @param nodeToMove - The folder node to move
 * @param newParentPath - New parent path (undefined for root level)
 */
export function moveFolder(
  account: InstanceOfSchema<typeof Account>,
  nodeToMove: InstanceOfSchema<typeof FolderNode>,
  newParentPath: string | undefined,
): void {
  const oldPath = nodeToMove.path;

  console.log('📦 moveFolder called', {
    nodeName: nodeToMove.name,
    nodeType: nodeToMove.type,
    oldPath,
    newParentPath,
  });

  // Use pure function to calculate new path and validate
  const pathResult = calculateNewPath(nodeToMove.name, oldPath, newParentPath);

  if (!pathResult.isValid) {
    if (pathResult.error === 'Already at this location') {
      console.log('⏭️ Same location, skipping move');
      return;
    }
    console.error('❌', pathResult.error);
    throw new Error(pathResult.error);
  }

  const newPath = pathResult.newPath;
  console.log('✅ New path calculated:', newPath);

  // Update the moved node's path
  nodeToMove.$jazz.set('path', newPath);
  nodeToMove.$jazz.set('updatedAt', new Date());

  // Calculate descendant path updates using pure function
  const allNodes = getAllFolders(account);
  const allPaths = allNodes.map((node) => ({
    id: node.$jazz.id,
    path: node.path,
  }));

  const descendantUpdates = calculateDescendantPaths(oldPath, newPath, allPaths);

  // Apply the calculated updates
  for (const update of descendantUpdates) {
    const node = allNodes.find((n) => n.$jazz.id === update.id);
    if (node) {
      console.log(
        `🔄 Updating descendant "${node.name}": "${update.oldPath}" → "${update.newPath}"`,
      );
      node.$jazz.set('path', update.newPath);
      node.$jazz.set('updatedAt', new Date());
    }
  }

  console.log('✅ Move completed');
}
