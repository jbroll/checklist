import type { TemplateItem } from '@/schemas';

export interface CategoryNode {
  name: string;
  path: string;
  items: TemplateItem[];
  children: CategoryNode[];
  depth: number;
  sortOrder?: number; // For sorting categories
}

/**
 * Builds a multi-level category tree structure from a flat list of items
 *
 * @param items - Leaf items (type='item') to organize into categories
 * @param allTemplateItems - All template items including categories for sortOrder lookup
 */
export function buildCategoryTree(
  items: TemplateItem[],
  allTemplateItems?: TemplateItem[],
): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>();
  const rootCategories: CategoryNode[] = [];

  // Create a lookup map for category TemplateItems
  const categoryLookup = new Map<string, TemplateItem>();
  if (allTemplateItems) {
    for (const item of allTemplateItems) {
      if (item.type === 'category') {
        categoryLookup.set(item.path, item);
      }
    }
  }

  // First pass: Create all category nodes
  items.forEach((item) => {
    const pathParts = item.path.split('/');

    // Create category nodes for all levels (excluding the item itself)
    for (let i = 1; i < pathParts.length; i++) {
      const categoryPath = pathParts.slice(0, i).join('/');

      if (!categoryMap.has(categoryPath)) {
        const categoryName = pathParts[i - 1];
        const categoryItem = categoryLookup.get(categoryPath);

        categoryMap.set(categoryPath, {
          name: categoryItem?.name || categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
          path: categoryPath,
          items: [],
          children: [],
          depth: i - 1,
          sortOrder: categoryItem?.sortOrder,
        });
      }
    }

    // Add item to its immediate parent category
    const parentPath = pathParts.slice(0, -1).join('/');
    if (parentPath) {
      categoryMap.get(parentPath)?.items.push(item);
    }
  });

  // Second pass: Build hierarchy by connecting parents and children
  categoryMap.forEach((category, path) => {
    const pathParts = path.split('/');

    if (pathParts.length === 1) {
      // Top-level category
      rootCategories.push(category);
    } else {
      // Nested category - find parent and add as child
      const parentPath = pathParts.slice(0, -1).join('/');
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

  return sortCategoryTree(rootCategories);
}
