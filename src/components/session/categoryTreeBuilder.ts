import type { TemplateItem } from '@/schemas';

export interface CategoryNode {
  name: string;
  path: string;
  items: TemplateItem[];
  children: CategoryNode[];
  depth: number;
}

/**
 * Builds a multi-level category tree structure from a flat list of items
 */
export function buildCategoryTree(items: TemplateItem[]): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>();
  const rootCategories: CategoryNode[] = [];

  // First pass: Create all category nodes
  items.forEach((item) => {
    const pathParts = item.path.split('/');

    // Create category nodes for all levels (excluding the item itself)
    for (let i = 1; i < pathParts.length; i++) {
      const categoryPath = pathParts.slice(0, i).join('/');

      if (!categoryMap.has(categoryPath)) {
        const categoryName = pathParts[i - 1];
        categoryMap.set(categoryPath, {
          name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
          path: categoryPath,
          items: [],
          children: [],
          depth: i - 1,
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

  // Sort categories and items alphabetically
  const sortCategoryTree = (categories: CategoryNode[]): CategoryNode[] => {
    return categories
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => ({
        ...category,
        items: category.items.sort((a, b) => a.name.localeCompare(b.name)),
        children: sortCategoryTree(category.children),
      }));
  };

  return sortCategoryTree(rootCategories);
}
