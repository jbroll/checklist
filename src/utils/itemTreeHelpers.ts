import type { InstanceOfSchema } from 'jazz-tools';
import type { TemplateItem } from '@/schemas';
import { getParentPath } from './pathUtils';

/**
 * Tree structure for template items (categories and items)
 */
export interface ItemTreeNode {
  item: InstanceOfSchema<typeof TemplateItem>;
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
  items: readonly (InstanceOfSchema<typeof TemplateItem> | null)[],
): ItemTreeNode[] {
  // Filter out null items and archived items
  const validItems = items.filter((item): item is InstanceOfSchema<typeof TemplateItem> => {
    return item !== null && !item.archived;
  });

  // Build a map of path → item for quick lookup
  const itemMap = new Map<string, InstanceOfSchema<typeof TemplateItem>>();
  for (const item of validItems) {
    itemMap.set(item.path, item);
  }

  // Build the tree structure
  const rootNodes: ItemTreeNode[] = [];
  const nodeMap = new Map<string, ItemTreeNode>();

  // Sort items by sortOrder and path for consistent rendering
  const sortedItems = [...validItems].sort((a, b) => {
    // First compare by parent path to group siblings
    const parentA = getParentPath(a.path) || '';
    const parentB = getParentPath(b.path) || '';
    if (parentA !== parentB) {
      return parentA.localeCompare(parentB);
    }
    // Then by sortOrder
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    // Finally by name
    return a.name.localeCompare(b.name);
  });

  // Create tree nodes
  for (const item of sortedItems) {
    const node: ItemTreeNode = {
      item,
      children: [],
    };
    nodeMap.set(item.path, node);

    const parentPath = getParentPath(item.path);
    if (!parentPath) {
      // Root level item
      rootNodes.push(node);
    } else {
      // Child item - add to parent's children
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Parent doesn't exist in the tree yet (might come later in iteration)
        // Add to root for now, will be reorganized if parent appears
        rootNodes.push(node);
      }
    }
  }

  // Sort root nodes by sortOrder
  rootNodes.sort((a, b) => {
    if (a.item.sortOrder !== b.item.sortOrder) {
      return a.item.sortOrder - b.item.sortOrder;
    }
    return a.item.name.localeCompare(b.item.name);
  });

  return rootNodes;
}

/**
 * Flattens a tree back into a list, maintaining hierarchical order
 */
export function flattenItemTree(nodes: ItemTreeNode[]): InstanceOfSchema<typeof TemplateItem>[] {
  const result: InstanceOfSchema<typeof TemplateItem>[] = [];

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
  items: readonly (InstanceOfSchema<typeof TemplateItem> | null)[],
  categoryPath: string,
): InstanceOfSchema<typeof TemplateItem>[] {
  return items.filter((item): item is InstanceOfSchema<typeof TemplateItem> => {
    if (!item || item.archived) return false;
    return item.path.startsWith(`${categoryPath}/`);
  });
}

/**
 * Gets only the direct children of a category (not grandchildren)
 */
export function getDirectChildren(
  items: readonly (InstanceOfSchema<typeof TemplateItem> | null)[],
  categoryPath: string | undefined,
): InstanceOfSchema<typeof TemplateItem>[] {
  return items.filter((item): item is InstanceOfSchema<typeof TemplateItem> => {
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
