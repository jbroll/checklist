import type { TemplateItem } from '@/schemas';
import { getParentPath } from './pathUtils';

/**
 * Tree structure for template items (categories and items)
 */
export interface ItemTreeNode {
  item: TemplateItem;
  children: ItemTreeNode[];
}

/**
 * Builds a hierarchical tree structure from a flat list of template items
 * Similar to buildTreeStructure but for items instead of folders
 *
 * @param items - Flat list of template items (both categories and leaf items)
 * @returns Array of root-level tree nodes
 */
export function buildItemTree(
  items: readonly (TemplateItem | null | undefined)[],
): ItemTreeNode[] {
  // Helper to sort items by sortOrder and name
  const sortItems = (a: TemplateItem, b: TemplateItem) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  };

  // Single-pass: filter, build map, and group by parent
  const nodeMap = new Map<string, ItemTreeNode>();
  const childrenByParent = new Map<string | undefined, ItemTreeNode[]>();

  for (const item of items) {
    // Filter out null and archived items
    if (!item || item.archived) continue;

    const node: ItemTreeNode = {
      item,
      children: [],
    };
    nodeMap.set(item.path, node);

    const parentPath = getParentPath(item.path);
    if (!childrenByParent.has(parentPath)) {
      childrenByParent.set(parentPath, []);
    }
    childrenByParent.get(parentPath)?.push(node);
  }

  // Recursively build and sort children
  const buildChildren = (parentPath: string | undefined): ItemTreeNode[] => {
    const children = childrenByParent.get(parentPath) || [];
    const sorted = children.sort((a, b) => sortItems(a.item, b.item));

    // Recursively build children for categories
    for (const node of sorted) {
      if (node.item.type === 'category') {
        node.children = buildChildren(node.item.path);
      }
    }

    return sorted;
  };

  return buildChildren(undefined); // Start with root nodes
}

/**
 * Flattens a tree back into a list, maintaining hierarchical order
 */
export function flattenItemTree(nodes: ItemTreeNode[]): TemplateItem[] {
  const result: TemplateItem[] = [];

  function traverse(node: ItemTreeNode) {
    result.push(node.item);
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

/**
 * Gets all descendant items (children, grandchildren, etc.) of a category
 */
export function getDescendantItems(
  items: readonly (TemplateItem | null | undefined)[],
  categoryPath: string,
): TemplateItem[] {
  return items.filter((item): item is TemplateItem => {
    if (!item || item.archived) return false;
    return item.path.startsWith(`${categoryPath}/`);
  });
}

/**
 * Gets only the direct children of a category (not grandchildren)
 */
export function getDirectChildren(
  items: readonly (TemplateItem | null | undefined)[],
  categoryPath: string | undefined,
): TemplateItem[] {
  return items.filter((item): item is TemplateItem => {
    if (!item || item.archived) return false;
    const itemParent = getParentPath(item.path);
    return itemParent === categoryPath;
  });
}

/**
 * Gets the category path from an item path
 * @example getCategoryPath("produce/fruits/apples") => "produce/fruits"
 */
export function getCategoryPath(itemPath: string): string | undefined {
  return getParentPath(itemPath);
}
