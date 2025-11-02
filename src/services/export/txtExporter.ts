/**
 * TXT Exporter
 *
 * Exports template items and sessions to plain text format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode } from '../../schemas';

/**
 * Export template items to plain text format
 *
 * Format: One item per line, sorted by sortOrder
 *
 * @param folder - Folder to export items from
 * @returns Plain text string with one item per line
 */
export function exportTemplateItemsToText(folder: InstanceOfSchema<typeof FolderNode>): string {
  if (!folder.items || folder.items.length === 0) {
    return '';
  }

  // Get non-archived items, sorted by sortOrder
  const items = Array.from(folder.items)
    .filter((item) => item && !item.archived)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return a.sortOrder - b.sortOrder;
    });

  // Create one line per item
  const lines = items.map((item) => item?.name || '').filter((name) => name.length > 0);

  return lines.join('\n');
}

/**
 * Export session to plain text format with checkmarks
 *
 * Format:
 * ✓ Item Name (purchased)
 *   Item Name (not purchased)
 *
 * @param folder - Folder containing the session
 * @param sessionId - ID of the session to export
 * @returns Plain text string with checkmarks
 */
export function exportSessionToText(
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

  // Get all items from the template
  if (folder.items) {
    const items = Array.from(folder.items)
      .filter((item) => item && !item.archived)
      .sort((a, b) => {
        if (!a || !b) return 0;
        return a.sortOrder - b.sortOrder;
      });

    for (const item of items) {
      if (!item) continue;

      const itemId = item.$jazz.id;
      const itemState = session.itemStates?.[itemId];

      // Check if item was purchased
      const isPurchased = itemState?.purchased || false;
      const checkmark = isPurchased ? '✓' : ' ';

      lines.push(`${checkmark} ${item.name}`);
    }
  }

  return lines.join('\n');
}
