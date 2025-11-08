/**
 * Base importer utilities
 *
 * Shared logic for CSV and TXT importers to reduce duplication.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { TemplateItem } from '../../schemas';

export interface BaseImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: string[];
}

export interface ItemToImport {
  name: string;
  path: string;
  type?: 'category' | 'item'; // Optional: defaults to 'item' for backward compatibility
  defaultQuantity?: string;
  /** Optional context for error messages (e.g., "Row 5") */
  context?: string;
}

/**
 * Get existing item paths from folder (case-insensitive)
 *
 * @param folder - Folder to check
 * @returns Set of existing paths (lowercase)
 */
export function getExistingPaths(folder: InstanceOfSchema<typeof FolderNode>): Set<string> {
  const existingPaths = new Set<string>();

  if (folder.items) {
    for (const item of folder.items) {
      if (item && !item.archived) {
        existingPaths.add(item.path.toLowerCase());
      }
    }
  }

  return existingPaths;
}

/**
 * Calculate next available sort order for items in folder
 *
 * @param folder - Folder to check
 * @returns Next available sort order
 */
export function calculateNextSortOrder(folder: InstanceOfSchema<typeof FolderNode>): number {
  let nextSortOrder = 0;

  if (folder.items) {
    for (const item of folder.items) {
      if (item && item.sortOrder >= nextSortOrder) {
        nextSortOrder = item.sortOrder + 1;
      }
    }
  }

  return nextSortOrder;
}

/**
 * Import multiple items into a folder
 *
 * Handles duplicate detection, item creation, and error tracking.
 *
 * @param items - Items to import
 * @param folder - Folder to import into
 * @param account - User account (for ownership)
 * @returns Import result with statistics
 */
export function importItems(
  items: ItemToImport[],
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): BaseImportResult {
  const result: BaseImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: [],
  };

  if (items.length === 0) {
    result.errors.push('No items found');
    return result;
  }

  // Get existing paths and next sort order
  const existingPaths = getExistingPaths(folder);
  let nextSortOrder = calculateNextSortOrder(folder);

  // Import each item
  for (const item of items) {
    const { name, path, type = 'item', defaultQuantity = '', context } = item;

    // Skip if already exists at this path
    if (existingPaths.has(path.toLowerCase())) {
      result.skipped++;
      result.duplicates.push(name);
      continue;
    }

    try {
      // Create new template item
      const newItem = TemplateItem.create(
        {
          name,
          type, // Use provided type or default to 'item'
          path,
          expanded: false,
          sortOrder: nextSortOrder++,
          archived: false,
          defaultQuantity,
          color: '#6b7280',
          addedBy: account,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { owner: account },
      );

      // Add to folder
      folder.items?.$jazz.push(newItem);
      result.imported++;

      // Add to existing paths to prevent duplicates within import
      existingPaths.add(path.toLowerCase());
    } catch (error) {
      const errorContext = context ? `${context} ` : '';
      result.errors.push(`${errorContext}Failed to import "${name}": ${String(error)}`);
    }
  }

  // Update folder timestamp
  folder.$jazz.set('updatedAt', new Date());

  return result;
}
