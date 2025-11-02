/**
 * Item Service
 *
 * Pure functions for template item operations (CRUD).
 * All Jazz database access for items goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Category, GroceriesAccount, TemplateItem } from '../schemas';
import { TemplateItem as TemplateItemSchema } from '../schemas';
import { getFolder } from './folderService';

/**
 * Create a new template item in a folder
 */
export function createItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  name: string,
  category: Category,
  defaultQuantity?: string,
): string {
  const folder = getFolder(account, folderId);
  if (!folder) throw new Error(`Folder ${folderId} not found`);
  if (!folder.items) throw new Error(`Folder ${folderId} has no items list`);

  const newItem = TemplateItemSchema.create(
    {
      name,
      category,
      sortOrder: folder.items.length,
      archived: false,
      defaultQuantity: defaultQuantity || '',
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
 * Get all non-archived items from a folder
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
 * Rename an item
 */
export function renameItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
  newName: string,
): void {
  const item = getItem(account, folderId, itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  item.$jazz.set('name', newName);
  item.$jazz.set('updatedAt', new Date());

  const folder = getFolder(account, folderId);
  if (folder) {
    folder.$jazz.set('updatedAt', new Date());
  }
}

/**
 * Archive (soft delete) an item
 */
export function archiveItem(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
): void {
  const item = getItem(account, folderId, itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  item.$jazz.set('archived', true);
  item.$jazz.set('updatedAt', new Date());

  const folder = getFolder(account, folderId);
  if (folder) {
    folder.$jazz.set('updatedAt', new Date());
  }
}

/**
 * Update item category
 */
export function updateItemCategory(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  itemId: string,
  category: Category,
): void {
  const item = getItem(account, folderId, itemId);
  if (!item) throw new Error(`Item ${itemId} not found in folder ${folderId}`);

  item.$jazz.set('category', category);
  item.$jazz.set('updatedAt', new Date());

  const folder = getFolder(account, folderId);
  if (folder) {
    folder.$jazz.set('updatedAt', new Date());
  }
}
