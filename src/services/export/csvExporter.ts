/**
 * CSV Exporter
 *
 * Exports template items and sessions to CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode } from '../../schema';
import { toISOStringOrEmpty } from '../../utils/dateUtils';
import { getLeafItems } from '../../utils/itemTreeHelpers';
import { findSessionById } from './helpers';

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
 * @param template - FolderNode to export items from
 * @returns CSV string with header row
 */
export function exportTemplateItemsToCsv(template: InstanceOfSchema<typeof FolderNode>): string {
  const lines: string[] = [];

  // Header row
  lines.push('name,defaultQuantity,path');

  if (!template.items || template.items.length === 0) {
    return lines.join('\n');
  }

  // Get non-archived leaf items (not categories), sorted by sortOrder
  const items = getLeafItems(template.items).sort((a, b) => a.sortOrder - b.sortOrder);

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
 * Export session to CSV format (v2.0 - neutral terminology)
 *
 * Format: name,path,selected,checked,selectedAt,checkedAt
 *
 * @param template - FolderNode containing the session
 * @param sessionId - ID of the session to export
 * @returns CSV string with header row, or null if session not found
 */
export function exportSessionToCsv(
  template: InstanceOfSchema<typeof FolderNode>,
  sessionId: string,
): string | null {
  const session = findSessionById(template, sessionId);
  if (!session) return null;

  const lines: string[] = [];

  // Header row
  lines.push('name,path,selected,checked,selectedAt,checkedAt');

  if (!template.items) {
    return lines.join('\n');
  }

  // Get all leaf items (not categories) from the template, sorted by sortOrder
  const items = getLeafItems(template.items).sort((a, b) => a.sortOrder - b.sortOrder);

  // Add data rows
  for (const item of items) {
    if (!item) continue;

    const itemId = item.id;
    const itemState = session.itemStates?.[itemId];

    const name = escapeCsvField(item.name);
    const path = escapeCsvField(item.path);
    const selected = itemState?.selected ? 'true' : 'false';
    const checked = itemState?.checked ? 'true' : 'false';
    const selectedAt = toISOStringOrEmpty(itemState?.selectedAt);
    const checkedAt = toISOStringOrEmpty(itemState?.checkedAt);

    lines.push(`${name},${path},${selected},${checked},${selectedAt},${checkedAt}`);
  }

  return lines.join('\n');
}
