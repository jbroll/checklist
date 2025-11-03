/**
 * TXT Importer
 *
 * Imports template items from plain text format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { TemplateItem } from '../../schemas';
import { parseTextList } from '../../utils/csvParser';
import { normalizePathSegment } from '../../utils/pathUtils';

export interface TxtImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: string[];
}

/**
 * Import template items from plain text
 *
 * Format: One item name per line
 *
 * All imported items are created as leaf items (type='item').
 * Items are created at top level with path generated from name.
 *
 * @param textContent - Plain text content
 * @param folder - Folder to import items into
 * @param account - User's GroceriesAccount (for ownership)
 * @returns Import result with statistics
 */
export function importItemsFromText(
  textContent: string,
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof GroceriesAccount>,
): TxtImportResult {
  const result: TxtImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: [],
  };

  // Parse text into lines
  const itemNames = parseTextList(textContent);

  if (itemNames.length === 0) {
    result.errors.push('No items found in file');
    return result;
  }

  // Get existing item paths (case-insensitive)
  const existingPaths = new Set<string>();
  if (folder.items) {
    for (const item of folder.items) {
      if (item && !item.archived) {
        existingPaths.add(item.path.toLowerCase());
      }
    }
  }

  // Calculate next sort order
  let nextSortOrder = 0;
  if (folder.items) {
    for (const item of folder.items) {
      if (item && item.sortOrder >= nextSortOrder) {
        nextSortOrder = item.sortOrder + 1;
      }
    }
  }

  // Import each item
  for (const name of itemNames) {
    // Generate path from name
    const path = normalizePathSegment(name);

    // Skip if already exists at this path
    if (existingPaths.has(path.toLowerCase())) {
      result.skipped++;
      result.duplicates.push(name);
      continue;
    }

    try {
      // Create new template item (always type='item' for text imports)
      const newItem = TemplateItem.create(
        {
          name,
          type: 'item',
          path,
          expanded: false,
          sortOrder: nextSortOrder++,
          archived: false,
          defaultQuantity: '',
          icon: '📦',
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
      result.errors.push(`Failed to import "${name}": ${String(error)}`);
    }
  }

  // Update folder timestamp
  folder.$jazz.set('updatedAt', new Date());

  return result;
}
