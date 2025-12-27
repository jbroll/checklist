/**
 * Template Service
 *
 * Manages template folders and their items.
 * Templates are now FolderNode CoValues in the hierarchical structure.
 * Handles hierarchical item structure using paths.
 * All Jazz database access for templates and items goes through this service.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { generateId } from '../lib/utils';
import type { Account, FolderNode, TemplateItem } from '../schemas';
import { createChildPath, getParentPath, PATH_SEPARATOR } from '../utils/pathUtils';
import * as folderService from './folderService';

// ============================================================================
// Internal Helper Functions
// ============================================================================

type Template = InstanceOfSchema<typeof FolderNode>;

/**
 * Get template by ID, throws if not found
 */
function requireTemplate(account: InstanceOfSchema<typeof Account>, templateId: string): Template {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);
  return template;
}

/**
 * Find item index in template, throws if not found
 */
function requireItemIndex(template: Template, itemId: string): number {
  const index = template.items.findIndex((i: TemplateItem) => i.id === itemId);
  if (index === -1) throw new Error(`Item ${itemId} not found in template`);
  return index;
}

/**
 * Check for duplicate path, throws if exists
 */
function assertNoDuplicatePath(template: Template, path: string, excludeItemId?: string): void {
  const existingItem = template.items.find(
    (i: TemplateItem) => i.path === path && !i.archived && i.id !== excludeItemId,
  );
  if (existingItem) {
    throw new Error(`Item already exists at path: ${path}`);
  }
}

/**
 * Update template's updatedAt timestamp
 */
function touchTemplate(template: Template): void {
  template.$jazz.set('updatedAt', new Date());
}

// ============================================================================
// Template Operations
// ============================================================================

/**
 * Get template by ID
 */
export function getTemplate(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): Template | null {
  const templates = folderService.getAllTemplateFolders(account, true);
  return templates.find((t) => t?.$jazz.id === templateId) || null;
}

/**
 * Get all templates
 */
export function getAllTemplates(account: InstanceOfSchema<typeof Account>): Array<Template> {
  return folderService.getAllTemplateFolders(account, false);
}

/**
 * Check if template exists
 */
export function templateExists(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): boolean {
  return getTemplate(account, templateId) != null;
}

// ============================================================================
// Item Operations
// ============================================================================

/**
 * Updates all descendant paths when a category's path changes
 */
function updateDescendantPaths(
  items: TemplateItem[],
  oldParentPath: string,
  newParentPath: string,
): TemplateItem[] {
  return items.map((item) => {
    if (item.path.startsWith(`${oldParentPath}${PATH_SEPARATOR}`)) {
      const relativePath = item.path.substring(oldParentPath.length + 1);
      const newDescendantPath = `${newParentPath}${PATH_SEPARATOR}${relativePath}`;
      return { ...item, path: newDescendantPath };
    }
    return item;
  });
}

/**
 * Internal helper to create a template item (category or item)
 */
function createTemplateItem(
  template: Template,
  type: 'category' | 'item',
  name: string,
  parentPath?: string,
  options?: { defaultQuantity?: string; sortOrder?: number; addToDefaults?: boolean },
): string {
  const path = createChildPath(parentPath, name);
  assertNoDuplicatePath(template, path);

  const newItem: TemplateItem = {
    id: generateId(),
    name,
    type,
    path,
    expanded: type === 'category', // Categories start expanded, items don't
    sortOrder: options?.sortOrder ?? template.items.length,
    archived: false,
    defaultQuantity: options?.defaultQuantity || '',
    createdAt: new Date(),
  };

  template.$jazz.set('items', [...template.items, newItem]);

  // Auto-add new items to defaults if requested
  if (options?.addToDefaults) {
    const defaultItems = { ...(template.defaultItems || {}), [newItem.id]: true };
    template.$jazz.set('defaultItems', defaultItems);
  }

  touchTemplate(template);
  return newItem.id;
}

/**
 * Create a new category in a template
 */
export function createCategory(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  name: string,
  parentPath?: string,
  sortOrder?: number,
): string {
  const template = requireTemplate(account, templateId);
  return createTemplateItem(template, 'category', name, parentPath, { sortOrder });
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
  sortOrder?: number,
): string {
  const template = requireTemplate(account, templateId);
  return createTemplateItem(template, 'item', name, parentPath, {
    defaultQuantity,
    sortOrder,
    addToDefaults: true,
  });
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

  return template.items.find((i: TemplateItem) => i.id === itemId) || null;
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

  return template.items.filter((i: TemplateItem) => !i.archived);
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

  return template.items.filter((i: TemplateItem) => !i.archived && i.type === 'item');
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
  const template = requireTemplate(account, templateId);
  const itemIndex = requireItemIndex(template, itemId);

  const item = template.items[itemIndex];
  const oldPath = item.path;
  const parentPath = getParentPath(oldPath);
  const newPath = createChildPath(parentPath, newName);

  if (oldPath !== newPath) {
    assertNoDuplicatePath(template, newPath, itemId);
  }

  let updatedItems = [...template.items];
  updatedItems[itemIndex] = { ...item, name: newName, path: newPath };

  if (item.type === 'category') {
    updatedItems = updateDescendantPaths(updatedItems, oldPath, newPath);
  }

  template.$jazz.set('items', updatedItems);
  touchTemplate(template);
}

/**
 * Update notes for an item or category
 */
export function updateItemNotes(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  notes: string,
): void {
  const template = requireTemplate(account, templateId);
  const itemIndex = requireItemIndex(template, itemId);

  const updatedItems = [...template.items];
  updatedItems[itemIndex] = { ...template.items[itemIndex], notes: notes || undefined };

  template.$jazz.set('items', updatedItems);
  touchTemplate(template);
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
  const template = requireTemplate(account, templateId);
  const item = template.items.find((i: TemplateItem) => i.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in template`);

  const categoryPrefix = item.type === 'category' ? `${item.path}${PATH_SEPARATOR}` : null;

  const updatedItems = template.items.map((i: TemplateItem) => {
    if (i.id === itemId || (categoryPrefix && i.path.startsWith(categoryPrefix))) {
      return { ...i, archived: true };
    }
    return i;
  });

  template.$jazz.set('items', updatedItems);
  touchTemplate(template);
}

/**
 * Move an item to a different parent category
 * Updates the path and all descendant paths if it's a category
 * Optionally updates sortOrder in the same operation
 */
export function moveItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  newParentPath: string | undefined,
  sortOrder?: number,
): void {
  const template = requireTemplate(account, templateId);
  const itemIndex = requireItemIndex(template, itemId);

  const item = template.items[itemIndex];
  const oldPath = item.path;
  const newPath = createChildPath(newParentPath, item.name);

  if (oldPath === newPath && sortOrder === undefined) return;

  if (oldPath !== newPath) {
    assertNoDuplicatePath(template, newPath, itemId);
  }

  let updatedItems = [...template.items];
  updatedItems[itemIndex] = {
    ...item,
    path: newPath,
    ...(sortOrder !== undefined && { sortOrder }),
  };

  if (item.type === 'category') {
    updatedItems = updateDescendantPaths(updatedItems, oldPath, newPath);
  }

  template.$jazz.set('items', updatedItems);
  touchTemplate(template);
}

/**
 * Get category expanded state
 */
export function getCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
): boolean {
  const template = requireTemplate(account, templateId);
  const item = template.items.find((i: TemplateItem) => i.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in template`);
  if (item.type !== 'category') throw new Error(`Item ${itemId} is not a category`);
  return item.expanded;
}

/**
 * Set category expanded state explicitly
 */
export function setCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  expanded: boolean,
): void {
  const template = requireTemplate(account, templateId);
  const itemIndex = requireItemIndex(template, itemId);
  const item = template.items[itemIndex];
  if (item.type !== 'category') throw new Error(`Item ${itemId} is not a category`);

  const updatedItems = [...template.items];
  updatedItems[itemIndex] = { ...item, expanded };

  template.$jazz.set('items', updatedItems);
  touchTemplate(template);
}

/**
 * Toggle category expanded state (convenience function)
 */
export function toggleCategoryExpanded(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
): void {
  const currentState = getCategoryExpanded(account, templateId, itemId);
  setCategoryExpanded(account, templateId, itemId, !currentState);
}

/**
 * Reorder an item by changing its sortOrder (fractional indexing)
 */
export function reorderItem(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  newSortOrder: number,
): void {
  const template = requireTemplate(account, templateId);
  const itemIndex = requireItemIndex(template, itemId);

  const updatedItems = [...template.items];
  updatedItems[itemIndex] = { ...updatedItems[itemIndex], sortOrder: newSortOrder };

  template.$jazz.set('items', updatedItems);
  touchTemplate(template);
}

// ============================================================================
// Insertion Helper Functions
// ============================================================================

/**
 * Calculate insertion parameters based on a selected item
 * Returns parentPath and sortOrder for inserting a new item
 */
export function calculateInsertionPoint(
  template: InstanceOfSchema<typeof FolderNode>,
  selectedItemId: string | null,
): { parentPath: string | undefined; sortOrder: number } {
  const items = template.items?.filter((item: TemplateItem) => !item.archived) || [];

  // If nothing selected, insert at top of root
  if (!selectedItemId) {
    const rootItems = items.filter((item: TemplateItem) => {
      const parentPath = getParentPath(item.path);
      return parentPath === undefined;
    });

    if (rootItems.length === 0) {
      return { parentPath: undefined, sortOrder: 0 };
    }

    const minSortOrder = Math.min(...rootItems.map((item: TemplateItem) => item.sortOrder));
    return { parentPath: undefined, sortOrder: minSortOrder - 1 };
  }

  // Find the selected item
  const selectedItem = items.find((item: TemplateItem) => item.id === selectedItemId);
  if (!selectedItem) {
    // Fall back to root if selected item not found
    return { parentPath: undefined, sortOrder: 0 };
  }

  // If selected item is a category, insert at top of that category
  if (selectedItem.type === 'category') {
    const categoryPath = selectedItem.path;
    const childrenInCategory = items.filter((item: TemplateItem) => {
      const parentPath = getParentPath(item.path);
      return parentPath === categoryPath;
    });

    if (childrenInCategory.length === 0) {
      return { parentPath: categoryPath, sortOrder: 0 };
    }

    const minSortOrder = Math.min(
      ...childrenInCategory.map((item: TemplateItem) => item.sortOrder),
    );
    return { parentPath: categoryPath, sortOrder: minSortOrder - 1 };
  }

  // If selected item is a regular item, insert after it in the same parent
  const parentPath = getParentPath(selectedItem.path);
  const siblings = items.filter((item: TemplateItem) => {
    const itemParentPath = getParentPath(item.path);
    return itemParentPath === parentPath;
  });

  // Sort siblings by sortOrder
  siblings.sort((a: TemplateItem, b: TemplateItem) => a.sortOrder - b.sortOrder);

  // Find the position of the selected item
  const selectedIndex = siblings.findIndex((item: TemplateItem) => item.id === selectedItemId);
  if (selectedIndex === -1) {
    // Fall back to end of siblings
    const maxSortOrder = Math.max(...siblings.map((item: TemplateItem) => item.sortOrder));
    return { parentPath, sortOrder: maxSortOrder + 1 };
  }

  // Calculate sortOrder to insert after selected item
  if (selectedIndex === siblings.length - 1) {
    // Selected item is last, insert after it
    return { parentPath, sortOrder: selectedItem.sortOrder + 1 };
  }

  // Insert between selected item and next item
  const nextItem = siblings[selectedIndex + 1];
  const sortOrder = (selectedItem.sortOrder + nextItem.sortOrder) / 2;
  return { parentPath, sortOrder };
}

// ============================================================================
// Default Items Operations
// ============================================================================

/**
 * Set whether an item is a default item (selected when creating new sessions)
 */
export function setItemDefault(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
  isDefault: boolean,
): void {
  const template = requireTemplate(account, templateId);
  const defaultItems = { ...(template.defaultItems || {}) };

  if (isDefault) {
    defaultItems[itemId] = true;
  } else {
    delete defaultItems[itemId];
  }

  template.$jazz.set('defaultItems', defaultItems);
  touchTemplate(template);
}

/**
 * Toggle item's default state
 */
export function toggleItemDefault(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemId: string,
): void {
  const template = requireTemplate(account, templateId);
  const isCurrentlyDefault = template.defaultItems?.[itemId] ?? false;
  setItemDefault(account, templateId, itemId, !isCurrentlyDefault);
}

/**
 * Batch set default items
 */
export function batchSetItemsDefault(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemIds: string[],
  isDefault: boolean,
): void {
  const template = requireTemplate(account, templateId);
  const defaultItems = { ...(template.defaultItems || {}) };

  for (const itemId of itemIds) {
    if (isDefault) {
      defaultItems[itemId] = true;
    } else {
      delete defaultItems[itemId];
    }
  }

  template.$jazz.set('defaultItems', defaultItems);
  touchTemplate(template);
}

/**
 * Invert default state for items
 */
export function invertItemsDefault(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  itemIds: string[],
): void {
  const template = requireTemplate(account, templateId);
  const defaultItems = { ...(template.defaultItems || {}) };

  for (const itemId of itemIds) {
    if (defaultItems[itemId]) {
      delete defaultItems[itemId];
    } else {
      defaultItems[itemId] = true;
    }
  }

  template.$jazz.set('defaultItems', defaultItems);
  touchTemplate(template);
}
