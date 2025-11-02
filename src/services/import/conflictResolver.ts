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
 * Append numbered suffix " (N)" to name and "-(N)" to path
 * where N is 1, 2, 3, etc. until a unique path is found
 *
 * Examples:
 * - "Wegmans" → "Wegmans (1)"
 * - "Wegmans (1)" exists → "Wegmans (2)"
 * - "Wegmans (2)" exists → "Wegmans (3)"
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
  // Start with suffix (1) and increment until unique
  let counter = 1;
  let newName = `${originalName} (${counter})`;
  let newPath = `${originalPath}-(${counter})`;

  while (findFolderByPath(newPath, account)) {
    counter++;
    newName = `${originalName} (${counter})`;
    newPath = `${originalPath}-(${counter})`;

    // Safety limit
    if (counter > 100) {
      throw new Error('Unable to resolve path conflict after 100 attempts');
    }
  }

  return { path: newPath, name: newName };
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
