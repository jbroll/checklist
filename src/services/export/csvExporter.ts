/**
 * CSV Exporter
 *
 * Exports template items and sessions to CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode } from '../../schemas';

/**
 * Escape CSV field value
 * Wraps in quotes if contains comma, quote, or newline
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export template items to CSV format
 *
 * Format: name,category,sortOrder,defaultQuantity
 *
 * @param folder - Folder to export items from
 * @returns CSV string with header row
 */
export function exportTemplateItemsToCsv(folder: InstanceOfSchema<typeof FolderNode>): string {
  const lines: string[] = [];

  // Header row
  lines.push('name,category,sortOrder,defaultQuantity');

  if (!folder.items || folder.items.length === 0) {
    return lines.join('\n');
  }

  // Get non-archived items, sorted by sortOrder
  const items = Array.from(folder.items)
    .filter((item) => item && !item.archived)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return a.sortOrder - b.sortOrder;
    });

  // Add data rows
  for (const item of items) {
    if (!item) continue;

    const name = escapeCsvField(item.name);
    const category = item.category;
    const sortOrder = item.sortOrder.toString();
    const defaultQuantity = item.defaultQuantity || '';

    lines.push(`${name},${category},${sortOrder},${defaultQuantity}`);
  }

  return lines.join('\n');
}

/**
 * Export session to CSV format
 *
 * Format: name,category,inCart,purchased,addedToCartAt,purchasedAt
 *
 * @param folder - Folder containing the session
 * @param sessionId - ID of the session to export
 * @returns CSV string with header row, or null if session not found
 */
export function exportSessionToCsv(
  folder: InstanceOfSchema<typeof FolderNode>,
  sessionId: string,
): string | null {
  if (!folder.sessions) {
    return null;
  }

  const session = Array.from(folder.sessions).find((s) => s?.$jazz.id === sessionId);
  if (!session) {
    return null;
  }

  const lines: string[] = [];

  // Header row
  lines.push('name,category,inCart,purchased,addedToCartAt,purchasedAt');

  if (!folder.items) {
    return lines.join('\n');
  }

  // Get all items from the template, sorted by sortOrder
  const items = Array.from(folder.items)
    .filter((item) => item && !item.archived)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return a.sortOrder - b.sortOrder;
    });

  // Add data rows
  for (const item of items) {
    if (!item) continue;

    const itemId = item.$jazz.id;
    const itemState = session.itemStates?.[itemId];

    const name = escapeCsvField(item.name);
    const category = item.category;
    const inCart = itemState?.inCart ? 'true' : 'false';
    const purchased = itemState?.purchased ? 'true' : 'false';
    const addedToCartAt = itemState?.addedToCartAt?.toISOString() || '';
    const purchasedAt = itemState?.purchasedAt?.toISOString() || '';

    lines.push(`${name},${category},${inCart},${purchased},${addedToCartAt},${purchasedAt}`);
  }

  return lines.join('\n');
}
