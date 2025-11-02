/**
 * TXT Importer
 *
 * Imports template items from plain text format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { autoCategorize, TemplateItem } from '../../schemas';
import { parseTextList } from '../../utils/csvParser';

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

  // Get existing item names (case-insensitive)
  const existingNames = new Set<string>();
  if (folder.items) {
    for (const item of folder.items) {
      if (item && !item.archived) {
        existingNames.add(item.name.toLowerCase());
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
    // Skip if already exists
    if (existingNames.has(name.toLowerCase())) {
      result.skipped++;
      result.duplicates.push(name);
      continue;
    }

    try {
      // Auto-categorize based on name
      const category = autoCategorize(name);

      // Create new template item
      const newItem = TemplateItem.create(
        {
          name,
          category,
          sortOrder: nextSortOrder++,
          archived: false,
          defaultQuantity: '',
          addedBy: account,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { owner: account },
      );

      // Add to folder
      // @ts-expect-error - Jazz v0.18.x TypeScript inference issue with CoList push
      folder.items?.push(newItem);
      result.imported++;

      // Add to existing names to prevent duplicates within import
      existingNames.add(name.toLowerCase());
    } catch (error) {
      result.errors.push(`Failed to import "${name}": ${String(error)}`);
    }
  }

  // Update folder timestamp
  folder.$jazz.set('updatedAt', new Date());

  return result;
}
