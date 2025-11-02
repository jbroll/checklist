/**
 * Conflict resolution logic
 *
 * Handles path conflicts when importing folders.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { GroceriesAccount } from '../../schemas';
// GroceriesAccount type imported via InstanceOfSchema from '../../schemas';
import { findFolderByPath } from './validators';

/**
 * Resolve path conflict by generating a unique path
 *
 * Strategy:
 * 1. First try: append " (imported)" to name and "/imported" to path
 * 2. If still conflicts: append timestamp " (imported YYYY-MM-DD HH:MM)"
 *
 * @param originalPath - Original path that conflicts
 * @param originalName - Original name
 * @param account - User's account
 * @returns Resolved path and name
 */
export function resolvePathConflict(
  originalPath: string,
  originalName: string,
  account: InstanceOfSchema<typeof GroceriesAccount>,
): { path: string; name: string } {
  // Try simple "(imported)" suffix first
  let newName = `${originalName} (imported)`;
  let newPath = `${originalPath}/imported`;

  if (!findFolderByPath(newPath, account)) {
    return { path: newPath, name: newName };
  }

  // If still conflicts, add timestamp
  const timestamp = formatTimestamp(new Date());
  newName = `${originalName} (imported ${timestamp})`;
  newPath = `${originalPath}/imported-${timestamp.replace(/[: ]/g, '-')}`;

  // This should virtually always be unique due to timestamp
  // But check anyway and add counter if needed
  let counter = 1;
  while (findFolderByPath(newPath, account)) {
    newName = `${originalName} (imported ${timestamp} ${counter})`;
    newPath = `${originalPath}/imported-${timestamp.replace(/[: ]/g, '-')}-${counter}`;
    counter++;

    // Safety limit
    if (counter > 100) {
      throw new Error('Unable to resolve path conflict after 100 attempts');
    }
  }

  return { path: newPath, name: newName };
}

/**
 * Format timestamp for conflict resolution
 *
 * @param date - Date to format
 * @returns Formatted string (YYYY-MM-DD HH:MM)
 */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Check if a name would conflict with existing items in a folder
 *
 * @param itemName - Name to check
 * @param existingNames - Array of existing item names
 * @returns true if name conflicts
 */
export function itemNameConflicts(itemName: string, existingNames: string[]): boolean {
  const normalizedName = itemName.trim().toLowerCase();
  return existingNames.some((name) => name.trim().toLowerCase() === normalizedName);
}

/**
 * Generate unique item name if conflict exists
 *
 * @param itemName - Original item name
 * @param existingNames - Array of existing item names
 * @returns Unique name (may be same as original if no conflict)
 */
export function resolveItemNameConflict(itemName: string, existingNames: string[]): string {
  if (!itemNameConflicts(itemName, existingNames)) {
    return itemName;
  }

  // Try appending numbers
  let counter = 2;
  let newName = `${itemName} (${counter})`;

  while (itemNameConflicts(newName, existingNames)) {
    counter++;
    newName = `${itemName} (${counter})`;

    // Safety limit
    if (counter > 100) {
      throw new Error('Unable to resolve item name conflict after 100 attempts');
    }
  }

  return newName;
}
