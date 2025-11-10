/**
 * Item Service
 *
 * Pure functions for template item operations (CRUD).
 * Handles hierarchical item structure using paths.
 * All Jazz database access for items goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { generateId } from '../lib/utils';
import type { Account, TemplateItem } from '../schemas';
import { createChildPath, getParentPath, normalizePathSegment } from '../utils/pathUtils';
import { getTemplate } from './templateService';

/**
 * Updates all descendant paths when a category's path changes
 */
function updateDescendantPaths(
  items: TemplateItem[],
  oldParentPath: string,
  newParentPath: string,
): TemplateItem[] {
  return items.map((item) => {
    if (item.path.startsWith(`${oldParentPath}/`)) {
      const relativePath = item.path.substring(oldParentPath.length + 1);
      const newDescendantPath = `${newParentPath}/${relativePath}`;
      return { ...item, path: newDescendantPath };
    }
    return item;
  });
}

/**
 * Create a new category in a template
 */
export function createCategory(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  name: string,
  parentPath?: string,
  color?: string,
): string {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  // Generate path from name
  const pathSegment = normalizePathSegment(name);
  const path = createChildPath(parentPath, pathSegment);

  // Check for duplicates at the same level
  const existingItem = template.items.find((i) => i.path === path);
  if (existingItem) {
    throw new Error(`Category already exists at path: ${path}`);
  }

  const newCategory: TemplateItem = {
    id: generateId(),
    name,
    type: 'category',
    path,
    expanded: true, // Categories start expanded
    sortOrder: template.items.length,
    archived: false,
    defaultQuantity: '',
    color: color || '#6b7280',
    createdAt: new Date(),
  };

  template.$jazz.set('items', [...template.items, newCategory]);
  template.$jazz.set('updatedAt', new Date());

  return newCategory.id;
}

/**
 * Create a new item in a template
 */
export function createItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  name: string,
  parentPath?: string,
  defaultQuantity?: string,
  color?: string,
): string {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  // Generate path from name
  const pathSegment = normalizePathSegment(name);
  const path = createChildPath(parentPath, pathSegment);

  // Check for duplicates at the same level
  const existingItem = template.items.find((i) => i.path === path);
  if (existingItem) {
    throw new Error(`Item already exists at path: ${path}`);
  }

  const newItem: TemplateItem = {
    id: generateId(),
    name,
    type: 'item',
    path,
    expanded: false, // Items don't expand
    sortOrder: template.items.length,
    archived: false,
    defaultQuantity: defaultQuantity || '',
    color: color || '#6b7280',
    createdAt: new Date(),
  };

  template.$jazz.set('items', [...template.items, newItem]);
  template.$jazz.set('updatedAt', new Date());

  return newItem.id;
}

/**
 * Get item by ID from a template
 */
export function getItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
): TemplateItem | null {
  const template = getTemplate(account, templateId);
  if (!template) return null;

  return template.items.find((i) => i.id === itemId) || null;
}

/**
 * Get all non-archived items from a template (both categories and leaf items)
 */
export function getItems(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): TemplateItem[] {
  const template = getTemplate(account, templateId);
  if (!template) return [];

  return template.items.filter((i) => !i.archived);
}

/**
 * Get only leaf items (not categories) from a template
 */
export function getLeafItems(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): TemplateItem[] {
  const template = getTemplate(account, templateId);
  if (!template) return [];

  return template.items.filter((i) => !i.archived && i.type === 'item');
}

/**
 * Rename an item or category
 * Updates the path and all descendant paths if it's a category
 */
export function renameItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  newName: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const itemIndex = template.items.findIndex((i) => i.id === itemId);
  if (itemIndex === -1) throw new Error(`Item ${itemId} not found in template ${templateId}`);

  const item = template.items[itemIndex];
  const oldPath = item.path;
  const parentPath = getParentPath(oldPath);
  const newPathSegment = normalizePathSegment(newName);
  const newPath = createChildPath(parentPath, newPathSegment);

  // Check for duplicates
  if (oldPath !== newPath) {
    const existingItem = template.items.find((i) => i.path === newPath);
    if (existingItem) {
      throw new Error(`Item already exists at path: ${newPath}`);
    }
  }

  let updatedItems = [...template.items];

  // Update item name and path
  updatedItems[itemIndex] = {
    ...item,
    name: newName,
    path: newPath,
  };

  // If this is a category, update all descendant paths
  if (item.type === 'category') {
    updatedItems = updateDescendantPaths(updatedItems, oldPath, newPath);
  }

  template.$jazz.set('items', updatedItems);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Archive (soft delete) an item or category
 * If it's a category, also archives all descendants
 */
export function archiveItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const item = template.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in template ${templateId}`);

  let updatedItems = template.items.map((i) => {
    if (i.id === itemId) {
      return { ...i, archived: true };
    }
    return i;
  });

  // If this is a category, archive all descendants
  if (item.type === 'category') {
    updatedItems = updatedItems.map((i) => {
      if (i.path.startsWith(`${item.path}/`)) {
        return { ...i, archived: true };
      }
      return i;
    });
  }

  template.$jazz.set('items', updatedItems);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Move an item to a different parent category
 * Updates the path and all descendant paths if it's a category
 */
export function moveItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  newParentPath: string | undefined,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const itemIndex = template.items.findIndex((i) => i.id === itemId);
  if (itemIndex === -1) throw new Error(`Item ${itemId} not found in template ${templateId}`);

  const item = template.items[itemIndex];
  const oldPath = item.path;
  const pathSegment = normalizePathSegment(item.name);
  const newPath = createChildPath(newParentPath, pathSegment);

  // Don't move if it's the same location
  if (oldPath === newPath) return;

  // Check for duplicates
  const existingItem = template.items.find((i) => i.path === newPath);
  if (existingItem) {
    throw new Error(`Item already exists at path: ${newPath}`);
  }

  let updatedItems = [...template.items];

  // Update item path
  updatedItems[itemIndex] = {
    ...item,
    path: newPath,
  };

  // If this is a category, update all descendant paths
  if (item.type === 'category') {
    updatedItems = updateDescendantPaths(updatedItems, oldPath, newPath);
  }

  template.$jazz.set('items', updatedItems);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Update item color
 */
export function updateItemColor(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  color: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const itemIndex = template.items.findIndex((i) => i.id === itemId);
  if (itemIndex === -1) throw new Error(`Item ${itemId} not found in template ${templateId}`);

  const updatedItems = [...template.items];
  updatedItems[itemIndex] = {
    ...updatedItems[itemIndex],
    color,
  };

  template.$jazz.set('items', updatedItems);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Toggle category expanded state
 */
export function toggleCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const itemIndex = template.items.findIndex((i) => i.id === itemId);
  if (itemIndex === -1) throw new Error(`Item ${itemId} not found in template ${templateId}`);

  const item = template.items[itemIndex];
  if (item.type !== 'category') throw new Error(`Item ${itemId} is not a category`);

  const updatedItems = [...template.items];
  updatedItems[itemIndex] = {
    ...item,
    expanded: !item.expanded,
  };

  template.$jazz.set('items', updatedItems);
  template.$jazz.set('updatedAt', new Date());
}
