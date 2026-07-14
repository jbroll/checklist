/**
 * TXT Exporter
 *
 * Exports template items and sessions to plain text format.
 * Supports two formats:
 * 1. Flat format: One item per line (when no categories exist)
 * 2. Indented format: Hierarchical structure with 2-space indentation
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode } from '../../schema';
import type { TemplateItem } from '../../schema/tree';
import { buildItemTree, getActiveItems, type ItemTreeNode } from '../../utils/itemTreeHelpers';
import { findSessionById } from './helpers';

/**
 * Export template items to plain text format
 *
 * Auto-detects format:
 * - If categories exist: exports hierarchical indented format
 * - If no categories: exports flat format (one item per line)
 *
 * @param template - FolderNode to export items from
 * @returns Plain text string
 */
export function exportTemplateItemsToText(template: InstanceOfSchema<typeof FolderNode>): string {
  if (!template.items || template.items.length === 0) {
    return '';
  }

  // Get non-archived items, sorted by sortOrder
  const items = getActiveItems<TemplateItem>(template.items).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  // Check if any categories exist
  const hasCategories = items.some((item: TemplateItem) => item?.type === 'category');

  if (hasCategories) {
    // Export hierarchical format
    return exportHierarchical(items);
  }

  // Export flat format (original behavior)
  const lines = items
    .map((item: TemplateItem) => item?.name || '')
    .filter((name: string) => name.length > 0);
  return lines.join('\n');
}

/**
 * Export items in hierarchical indented format
 *
 * @param items - Sorted items to export
 * @returns Indented text string
 */
function exportHierarchical(items: TemplateItem[]): string {
  // Build tree structure from flat items using shared utility
  const tree = buildItemTree(items);

  // Generate indented text
  return treeToIndentedText(tree);
}

/**
 * Convert tree to indented text
 *
 * @param nodes - Tree nodes
 * @param indent - Current indentation level
 * @returns Indented text string
 */
function treeToIndentedText(nodes: ItemTreeNode[], indent = 0): string {
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
 * @param template - FolderNode containing the session
 * @param sessionId - ID of the session to export
 * @returns Plain text string with checkmarks
 */
export function exportSessionToText(
  template: InstanceOfSchema<typeof FolderNode>,
  sessionId: string,
): string | null {
  const session = findSessionById(template, sessionId);
  if (!session) return null;

  const lines: string[] = [];

  // Get all items from the template
  if (template.items) {
    const items = getActiveItems<TemplateItem>(template.items).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

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
