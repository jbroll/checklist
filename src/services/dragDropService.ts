/**
 * Drag and Drop Service
 *
 * Handles drag and drop operations for items and categories in templates.
 * Updates sortOrder and parent paths as needed.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, TemplateItem } from '../schemas';
import { getParentPath } from '../utils/pathUtils';
import { getTemplate, moveItem, reorderItem } from './templateService';

/**
 * Calculate the new sort order when dropping an item between two other items
 */
function calculateSortOrder(
  beforeItem: TemplateItem | null,
  afterItem: TemplateItem | null,
): number {
  if (!beforeItem && !afterItem) {
    return 0;
  }
  if (!beforeItem && afterItem) {
    // Insert at the beginning
    return afterItem.sortOrder - 1;
  }
  if (!afterItem && beforeItem) {
    // Insert at the end
    return beforeItem.sortOrder + 1;
  }
  // Insert between
  if (beforeItem && afterItem) {
    return (beforeItem.sortOrder + afterItem.sortOrder) / 2;
  }
  return 0;
}

/**
 * Get siblings of an item (items with the same parent)
 */
function getSiblings(items: TemplateItem[], parentPath: string | undefined): TemplateItem[] {
  return items.filter((item) => {
    const itemParentPath = getParentPath(item.path);
    return itemParentPath === parentPath;
  });
}

/**
 * Handle reordering an item within the same parent
 */
export function handleItemReorder(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  draggedItemId: string,
  overItemId: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const draggedItem = template.items.find((i) => i.id === draggedItemId);
  const overItem = template.items.find((i) => i.id === overItemId);

  if (!draggedItem || !overItem) {
    throw new Error('Item not found');
  }

  // Check if they have the same parent
  const draggedParent = getParentPath(draggedItem.path);
  const overParent = getParentPath(overItem.path);

  if (draggedParent !== overParent) {
    console.warn('[handleItemReorder] Items have different parents, skipping reorder');
    return;
  }

  // Get all siblings and sort by current sortOrder
  const activeItems = template.items.filter((i) => !i.archived);
  const siblings = getSiblings(activeItems, draggedParent);
  siblings.sort((a, b) => a.sortOrder - b.sortOrder);

  // Find indices
  const draggedIndex = siblings.findIndex((i) => i.id === draggedItemId);
  const overIndex = siblings.findIndex((i) => i.id === overItemId);

  if (draggedIndex === -1 || overIndex === -1) {
    throw new Error('Item not found in siblings');
  }

  // Calculate new sort order
  let newSortOrder: number;
  if (draggedIndex < overIndex) {
    // Dragging down - insert after overItem
    const afterItem = siblings[overIndex + 1] || null;
    newSortOrder = calculateSortOrder(overItem, afterItem);
  } else {
    // Dragging up - insert before overItem
    const beforeItem = siblings[overIndex - 1] || null;
    newSortOrder = calculateSortOrder(beforeItem, overItem);
  }

  reorderItem(account, templateId, draggedItemId, newSortOrder);
}

/**
 * Handle moving an item to a different parent category
 */
export function handleItemMove(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  draggedItemId: string,
  newParentPath: string | undefined,
  targetItemId?: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  const draggedItem = template.items.find((i) => i.id === draggedItemId);
  if (!draggedItem) throw new Error(`Dragged item ${draggedItemId} not found`);

  const activeItems = template.items.filter((i) => !i.archived);
  const newSiblings = getSiblings(activeItems, newParentPath);
  newSiblings.sort((a, b) => a.sortOrder - b.sortOrder);

  let newSortOrder: number;
  if (targetItemId) {
    const targetItem = newSiblings.find((i) => i.id === targetItemId);
    if (targetItem) {
      const targetIndex = newSiblings.findIndex((i) => i.id === targetItemId);
      const afterItem = newSiblings[targetIndex + 1] || null;
      newSortOrder = calculateSortOrder(targetItem, afterItem);
    } else {
      // Target not in new siblings, add to end
      newSortOrder = newSiblings.length > 0 ? newSiblings[newSiblings.length - 1].sortOrder + 1 : 0;
    }
  } else {
    // No target, add to beginning
    newSortOrder = newSiblings.length > 0 ? newSiblings[0].sortOrder - 1 : 0;
  }

  moveItem(account, templateId, draggedItemId, newParentPath, newSortOrder);
}
