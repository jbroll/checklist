import type { TemplateItem } from '@/schemas';
import { PATH_SEPARATOR } from '@/utils/pathUtils';

export interface CategoryNode {
  name: string;
  path: string;
  items: TemplateItem[]; // Direct child items (not in subcategories)
  children: CategoryNode[]; // Child categories
  depth: number;
  sortOrder?: number; // For sorting categories
}

/**
 * Builds a multi-level category tree structure from a flat list of items
 *
 * Items and categories are mixed together at each level based on their paths.
 * Root-level items (with no path separator) are returned as categories with no children.
 *
 * @param items - Leaf items (type='item') to organize into categories
 * @param allTemplateItems - All template items including categories for full hierarchy
 * @returns Array of category nodes (includes both actual categories and root items)
 */
export function buildCategoryTree(
  items: TemplateItem[],
  allTemplateItems?: TemplateItem[],
): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>();
  const rootNodes: CategoryNode[] = [];

  // First pass: Create ALL category nodes from allTemplateItems (if provided)
  // This ensures categories without leaf items are still shown
  if (allTemplateItems) {
    for (const item of allTemplateItems) {
      if (item.type === 'category') {
        const pathParts = item.path.split(PATH_SEPARATOR);
        categoryMap.set(item.path, {
          name: item.name,
          path: item.path,
          items: [],
          children: [],
          depth: pathParts.length - 1,
          sortOrder: item.sortOrder,
        });
      }
    }
  }

  // Second pass: Process items and create category nodes from paths
  items.forEach((item) => {
    const pathParts = item.path.split(PATH_SEPARATOR);

    if (pathParts.length === 1) {
      // Root-level item - create a pseudo-category node for it
      if (!categoryMap.has(item.path)) {
        categoryMap.set(item.path, {
          name: item.name,
          path: item.path,
          items: [item], // The item is its own content
          children: [],
          depth: 0,
          sortOrder: item.sortOrder,
        });
      }
    } else {
      // Nested item - create category nodes for all parent levels
      for (let i = 1; i < pathParts.length; i++) {
        const categoryPath = pathParts.slice(0, i).join(PATH_SEPARATOR);

        if (!categoryMap.has(categoryPath)) {
          const categoryName = pathParts[i - 1];

          categoryMap.set(categoryPath, {
            name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
            path: categoryPath,
            items: [],
            children: [],
            depth: i - 1,
            sortOrder: undefined,
          });
        }
      }

      // Add item to its immediate parent category
      const parentPath = pathParts.slice(0, -1).join(PATH_SEPARATOR);
      categoryMap.get(parentPath)?.items.push(item);
    }
  });

  // Third pass: Build hierarchy by connecting parents and children
  categoryMap.forEach((category, path) => {
    const pathParts = path.split(PATH_SEPARATOR);

    if (pathParts.length === 1) {
      // Top-level node (category or root item)
      rootNodes.push(category);
    } else {
      // Nested category - find parent and add as child
      const parentPath = pathParts.slice(0, -1).join(PATH_SEPARATOR);
      const parent = categoryMap.get(parentPath);
      if (parent) {
        parent.children.push(category);
      }
    }
  });

  // Sort items by sortOrder (with name as fallback)
  const sortItems = (a: TemplateItem, b: TemplateItem) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  };

  // Sort categories by their sortOrder (from actual category TemplateItems)
  const sortCategoryTree = (categories: CategoryNode[]): CategoryNode[] => {
    return categories
      .sort((a, b) => {
        // Primary: Sort by category sortOrder if available
        if (a.sortOrder !== undefined && b.sortOrder !== undefined && a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        // Fallback: Sort by first item's sortOrder
        const aFirstItem = a.items[0];
        const bFirstItem = b.items[0];
        if (aFirstItem && bFirstItem && aFirstItem.sortOrder !== bFirstItem.sortOrder) {
          return aFirstItem.sortOrder - bFirstItem.sortOrder;
        }
        // Final fallback: Sort by name
        return a.name.localeCompare(b.name);
      })
      .map((category) => ({
        ...category,
        items: category.items.sort(sortItems),
        children: sortCategoryTree(category.children),
      }));
  };

  return sortCategoryTree(rootNodes);
}
