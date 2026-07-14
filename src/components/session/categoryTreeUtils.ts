import type { TemplateItem } from '@/schema/folder';
import type { CategoryNode } from './categoryTreeBuilder';

/**
 * Collect all item IDs from a category and its descendants
 */
export function collectAllItemIds(category: CategoryNode | null, items?: TemplateItem[]): string[] {
  if (items) {
    // Direct items list provided (for flat lists)
    return items.map((item) => item.id);
  }

  if (!category) return [];

  const ids: string[] = [];

  // Collect items at this level
  category.items.forEach((item) => {
    ids.push(item.id);
  });

  // Recursively collect from children
  category.children.forEach((child) => {
    ids.push(...collectAllItemIds(child));
  });

  return ids;
}

/**
 * Check if all items in a category (and descendants) are selected
 */
export function areAllItemsSelected(
  category: CategoryNode | null,
  itemStates: Record<string, { selected?: boolean; checked?: boolean }>,
  items?: TemplateItem[],
): boolean {
  const allIds = collectAllItemIds(category, items);
  if (allIds.length === 0) return false;
  return allIds.every((id) => itemStates[id]?.selected);
}

/**
 * Get selection state for display (all, some, none)
 */
export function getSelectionState(
  category: CategoryNode | null,
  itemStates: Record<string, { selected?: boolean; checked?: boolean }>,
  items?: TemplateItem[],
): 'all' | 'some' | 'none' {
  const allIds = collectAllItemIds(category, items);
  if (allIds.length === 0) return 'none';

  const selectedCount = allIds.filter((id) => itemStates[id]?.selected).length;

  if (selectedCount === allIds.length) return 'all';
  if (selectedCount > 0) return 'some';
  return 'none';
}
