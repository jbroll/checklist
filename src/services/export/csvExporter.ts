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
 * Format: name,defaultQuantity,path
 *
 * @param folder - Folder to export items from
 * @returns CSV string with header row
 */
export function exportTemplateItemsToCsv(folder: InstanceOfSchema<typeof FolderNode>): string {
  const lines: string[] = [];

  // Header row
  lines.push('name,defaultQuantity,path');

  if (!folder.items || folder.items.length === 0) {
    return lines.join('\n');
  }

  // Get non-archived leaf items (not categories), sorted by sortOrder
  const items = Array.from(folder.items)
    .filter((item) => item && !item.archived && item.type === 'item')
    .sort((a, b) => {
      if (!a || !b) return 0;
      return a.sortOrder - b.sortOrder;
    });

  // Add data rows
  for (const item of items) {
    if (!item) continue;

    const name = escapeCsvField(item.name);
    const defaultQuantity = escapeCsvField(item.defaultQuantity || '');
    const path = escapeCsvField(item.path);

    lines.push(`${name},${defaultQuantity},${path}`);
  }

  return lines.join('\n');
}

/**
 * Export session to CSV format
 *
 * Format: name,path,inCart,purchased,addedToCartAt,purchasedAt
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
  lines.push('name,path,inCart,purchased,addedToCartAt,purchasedAt');

  if (!folder.items) {
    return lines.join('\n');
  }

  // Get all leaf items (not categories) from the template, sorted by sortOrder
  const items = Array.from(folder.items)
    .filter((item) => item && !item.archived && item.type === 'item')
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
    const path = escapeCsvField(item.path);
    const inCart = itemState?.inCart ? 'true' : 'false';
    const purchased = itemState?.purchased ? 'true' : 'false';
    const addedToCartAt = itemState?.addedToCartAt?.toISOString() || '';
    const purchasedAt = itemState?.purchasedAt?.toISOString() || '';

    lines.push(`${name},${path},${inCart},${purchased},${addedToCartAt},${purchasedAt}`);
  }

  return lines.join('\n');
}
