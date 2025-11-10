/**
 * TXT Exporter
 *
 * Exports template items and sessions to plain text format.
 * Supports two formats:
 * 1. Flat format: One item per line (when no categories exist)
 * 2. Indented format: Hierarchical structure with 2-space indentation
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Template } from '../../schemas';
import type { TemplateItem } from '../../schemas/tree';

interface TreeNode {
  item: TemplateItem;
  children: TreeNode[];
}

/**
 * Export template items to plain text format
 *
 * Auto-detects format:
 * - If categories exist: exports hierarchical indented format
 * - If no categories: exports flat format (one item per line)
 *
 * @param template - Template to export items from
 * @returns Plain text string
 */
export function exportTemplateItemsToText(template: InstanceOfSchema<typeof Template>): string {
  if (!template.items || template.items.length === 0) {
    return '';
  }

  // Get non-archived items, sorted by sortOrder
  const items = template.items
    .filter((item) => item && !item.archived)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return a.sortOrder - b.sortOrder;
    });

  // Check if any categories exist
  const hasCategories = items.some((item) => item?.type === 'category');

  if (hasCategories) {
    // Export hierarchical format
    return exportHierarchical(items);
  }

  // Export flat format (original behavior)
  const lines = items.map((item) => item?.name || '').filter((name) => name.length > 0);
  return lines.join('\n');
}

/**
 * Export items in hierarchical indented format
 *
 * @param items - Sorted items to export
 * @returns Indented text string
 */
function exportHierarchical(items: TemplateItem[]): string {
  // Build tree structure from flat items
  const tree = buildTreeFromPaths(items);

  // Generate indented text
  return treeToIndentedText(tree);
}

/**
 * Build tree structure from flat items using paths
 *
 * @param items - Flat array of items with paths
 * @returns Tree nodes
 */
function buildTreeFromPaths(items: TemplateItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Create nodes for all items
  for (const item of items) {
    if (!item) continue;

    const node: TreeNode = {
      item,
      children: [],
    };

    nodeMap.set(item.path, node);
  }

  // Build parent-child relationships
  for (const item of items) {
    if (!item) continue;

    const node = nodeMap.get(item.path);
    if (!node) continue;

    // Find parent by checking if path is a child of another path
    const pathParts = item.path.split('/');
    if (pathParts.length === 1) {
      // Root level item
      root.push(node);
    } else {
      // Find parent
      const parentPath = pathParts.slice(0, -1).join('/');
      const parent = nodeMap.get(parentPath);

      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found, add to root
        root.push(node);
      }
    }
  }

  return root;
}

/**
 * Convert tree to indented text
 *
 * @param nodes - Tree nodes
 * @param indent - Current indentation level
 * @returns Indented text string
 */
function treeToIndentedText(nodes: TreeNode[], indent = 0): string {
  const lines: string[] = [];
  const indentStr = '  '.repeat(indent); // 2 spaces per level

  for (const node of nodes) {
    // Add current item
    lines.push(`${indentStr}${node.item.name}`);

    // Add children recursively
    if (node.children.length > 0) {
      lines.push(treeToIndentedText(node.children, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Export session to plain text format with checkmarks
 *
 * Format:
 * ✓ Item Name (purchased)
 *   Item Name (not purchased)
 *
 * @param template - Template containing the session
 * @param sessionId - ID of the session to export
 * @returns Plain text string with checkmarks
 */
export function exportSessionToText(
  template: InstanceOfSchema<typeof Template>,
  sessionId: string,
): string | null {
  if (!template.sessions) {
    return null;
  }

  const session = Array.from(template.sessions).find((s) => s?.$jazz.id === sessionId);
  if (!session) {
    return null;
  }

  const lines: string[] = [];

  // Get all items from the template
  if (template.items) {
    const items = template.items
      .filter((item) => item && !item.archived)
      .sort((a, b) => {
        if (!a || !b) return 0;
        return a.sortOrder - b.sortOrder;
      });

    for (const item of items) {
      if (!item) continue;

      const itemId = item.id;
      const itemState = session.itemStates?.[itemId];

      // Check if item was purchased
      const isPurchased = itemState?.checked || false;
      const checkmark = isPurchased ? '✓' : ' ';

      lines.push(`${checkmark} ${item.name}`);
    }
  }

  return lines.join('\n');
}
