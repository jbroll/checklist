/**
 * Item Service
 *
 * Pure functions for template item operations (CRUD).
 * Handles hierarchical item structure using paths.
 * All Jazz database access for items goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { GroceriesAccount, TemplateItem } from '../schemas';
import { TemplateItem as TemplateItemSchema } from '../schemas';
import { createChildPath, getParentPath, normalizePathSegment } from '../utils/pathUtils';
import { getFolder } from './folderService';

/**
 * Create a new category in a template folder
 */
export function createCategory(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  name: string,
  parentPath?: string,
  color?: string,
): string {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);
  if (!folder.items) throw new Error(`Folder ${folderId} has no items list`);

  // Generate path from name
  const pathSegment = normalizePathSegment(name);
  const path = createChildPath(parentPath, pathSegment);

  // Check for duplicates at the same level
  const existingItem = folder.items.find((i) => i?.path === path);
  if (existingItem) {
    throw new Error(`Category already exists at path: ${path}`);
  }

  const newCategory = TemplateItemSchema.create(
    {
      name,
      type: 'category',
      path,
      expanded: true, // Categories start expanded
      sortOrder: folder.items.length,
      archived: false,
      defaultQuantity: '',
      color: color || '#6b7280',
      addedBy: account,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { owner: account },
  );

  folder.items.$jazz.push(newCategory);
  folder.$jazz.set('updatedAt', new Date());

  return newCategory.$jazz.id;
}

/**
 * Create a new item in a template folder
 */
export function createItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  name: string,
  parentPath?: string,
  defaultQuantity?: string,
  color?: string,
): string {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);
  if (!folder.items) throw new Error(`Folder ${folderId} has no items list`);

  // Generate path from name
  const pathSegment = normalizePathSegment(name);
  const path = createChildPath(parentPath, pathSegment);

  // Check for duplicates at the same level
  const existingItem = folder.items.find((i) => i?.path === path);
  if (existingItem) {
    throw new Error(`Item already exists at path: ${path}`);
  }

  const newItem = TemplateItemSchema.create(
    {
      name,
      type: 'item',
      path,
      expanded: false, // Items don't expand
      sortOrder: folder.items.length,
      archived: false,
      defaultQuantity: defaultQuantity || '',
      color: color || '#6b7280',
      addedBy: account,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { owner: account },
  );

  folder.items.$jazz.push(newItem);
  folder.$jazz.set('updatedAt', new Date());

  return newItem.$jazz.id;
}

/**
 * Get item by ID from a folder
 */
export function getItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
): InstanceOfSchema<typeof TemplateItem> | null {
  const folder = getFolder(account, folderId);
  if (!folder?.items) return null;

  return folder.items.find((i) => i?.$jazz.id === itemId) || null;
}

/**
 * Get all non-archived items from a folder (both categories and leaf items)
 */
export function getItems(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
): Array<InstanceOfSchema<typeof TemplateItem>> {
  const folder = getFolder(account, folderId);
  if (!folder?.items) return [];

  return folder.items.filter((i) => i && !i.archived) as Array<
    InstanceOfSchema<typeof TemplateItem>
  >;
}

/**
 * Get only leaf items (not categories) from a folder
 */
export function getLeafItems(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
): Array<InstanceOfSchema<typeof TemplateItem>> {
  const folder = getFolder(account, folderId);
  if (!folder?.items) return [];

  return folder.items.filter((i) => i && !i.archived && i.type === 'item') as Array<
    InstanceOfSchema<typeof TemplateItem>
  >;
}

/**
 * Rename an item or category
 * Updates the path and all descendant paths if it's a category
 */
export function renameItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
  newName: string,
): void {
  const folder = getFolder(account, folderId);
  if (!folder?.items) throw new Error(`Folder ${folderId} not found`);

  const item = folder.items.find((i) => i?.$jazz.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  const oldPath = item.path;
  const parentPath = getParentPath(oldPath);
  const newPathSegment = normalizePathSegment(newName);
  const newPath = createChildPath(parentPath, newPathSegment);

  // Check for duplicates
  if (oldPath !== newPath) {
    const existingItem = folder.items.find((i) => i?.path === newPath);
    if (existingItem) {
      throw new Error(`Item already exists at path: ${newPath}`);
    }
  }

  // Update item name and path
  item.$jazz.set('name', newName);
  item.$jazz.set('path', newPath);
  item.$jazz.set('updatedAt', new Date());

  // If this is a category, update all descendant paths
  if (item.type === 'category') {
    for (const descendant of folder.items) {
      if (descendant?.path.startsWith(`${oldPath}/`)) {
        const relativePath = descendant.path.substring(oldPath.length + 1);
        const newDescendantPath = `${newPath}/${relativePath}`;
        descendant.$jazz.set('path', newDescendantPath);
        descendant.$jazz.set('updatedAt', new Date());
      }
    }
  }

  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Archive (soft delete) an item or category
 * If it's a category, also archives all descendants
 */
export function archiveItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
): void {
  const folder = getFolder(account, folderId);
  if (!folder?.items) throw new Error(`Folder ${folderId} not found`);

  const item = folder.items.find((i) => i?.$jazz.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  item.$jazz.set('archived', true);
  item.$jazz.set('updatedAt', new Date());

  // If this is a category, archive all descendants
  if (item.type === 'category') {
    for (const descendant of folder.items) {
      if (descendant?.path.startsWith(`${item.path}/`)) {
        descendant.$jazz.set('archived', true);
        descendant.$jazz.set('updatedAt', new Date());
      }
    }
  }

  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Move an item to a different parent category
 * Updates the path and all descendant paths if it's a category
 */
export function moveItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
  newParentPath: string | undefined,
): void {
  const folder = getFolder(account, folderId);
  if (!folder?.items) throw new Error(`Folder ${folderId} not found`);

  const item = folder.items.find((i) => i?.$jazz.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  const oldPath = item.path;
  const pathSegment = normalizePathSegment(item.name);
  const newPath = createChildPath(newParentPath, pathSegment);

  // Don't move if it's the same location
  if (oldPath === newPath) return;

  // Check for duplicates
  const existingItem = folder.items.find((i) => i?.path === newPath);
  if (existingItem) {
    throw new Error(`Item already exists at path: ${newPath}`);
  }

  // Update item path
  item.$jazz.set('path', newPath);
  item.$jazz.set('updatedAt', new Date());

  // If this is a category, update all descendant paths
  if (item.type === 'category') {
    for (const descendant of folder.items) {
      if (descendant?.path.startsWith(`${oldPath}/`)) {
        const relativePath = descendant.path.substring(oldPath.length + 1);
        const newDescendantPath = `${newPath}/${relativePath}`;
        descendant.$jazz.set('path', newDescendantPath);
        descendant.$jazz.set('updatedAt', new Date());
      }
    }
  }

  folder.$jazz.set('updatedAt', new Date());
}

/**
 * Update item color
 */
export function updateItemColor(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
  color: string,
): void {
  const item = getItem(account, folderId, itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  item.$jazz.set('color', color);
  item.$jazz.set('updatedAt', new Date());

  const folder = getFolder(account, folderId);
  if (folder) {
    folder.$jazz.set('updatedAt', new Date());
  }
}
