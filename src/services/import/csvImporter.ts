/**
 * CSV Importer
 *
 * Imports template items and sessions from CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { autoCategorize, type Category, TemplateItem } from '../../schemas';
import { parseCsv } from '../../utils/csvParser';

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: string[];
}

/**
 * Validate category value
 */
function isValidCategory(value: string): value is Category {
  const validCategories: Category[] = [
    'produce',
    'dairy',
    'meat',
    'pantry',
    'frozen',
    'household',
    'bakery',
    'beverages',
    'other',
  ];
  return validCategories.includes(value as Category);
}

/**
 * Import template items from CSV
 *
 * Expected CSV format:
 * name,category,sortOrder,defaultQuantity
 *
 * If category is missing or invalid, auto-categorize by name.
 * If sortOrder is missing or invalid, assign sequentially.
 *
 * @param csvContent - CSV content string
 * @param folder - Folder to import items into
 * @param account - User's GroceriesAccount (for ownership)
 * @returns Import result with statistics
 */
export function importItemsFromCsv(
  csvContent: string,
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof GroceriesAccount>,
): CsvImportResult {
  const result: CsvImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: [],
  };

  // Parse CSV
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(csvContent);
  } catch (error) {
    result.errors.push(`Failed to parse CSV: ${String(error)}`);
    return result;
  }

  if (rows.length === 0) {
    result.errors.push('No items found in CSV file');
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

  // Import each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is header, and humans count from 1

    // Validate required fields
    if (!row || !row.name || row.name.trim().length === 0) {
      result.errors.push(`Row ${rowNum}: Missing item name`);
      continue;
    }

    const name = row.name.trim();

    // Skip if already exists
    if (existingNames.has(name.toLowerCase())) {
      result.skipped++;
      result.duplicates.push(name);
      continue;
    }

    try {
      // Get or auto-categorize
      let category: Category;
      if (row.category && isValidCategory(row.category)) {
        category = row.category as Category;
      } else {
        category = autoCategorize(name);
      }

      // Get sort order or use next sequential
      let sortOrder: number;
      if (row.sortOrder) {
        const parsed = Number.parseInt(row.sortOrder, 10);
        sortOrder = Number.isNaN(parsed) ? nextSortOrder++ : parsed;
      } else {
        sortOrder = nextSortOrder++;
      }

      // Get default quantity (optional)
      const defaultQuantity = row.defaultQuantity?.trim() || '';

      // Create new template item
      const newItem = TemplateItem.create(
        {
          name,
          category,
          sortOrder,
          archived: false,
          defaultQuantity,
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
      result.errors.push(`Row ${rowNum} ("${name}"): ${String(error)}`);
    }
  }

  // Update folder timestamp
  folder.$jazz.set('updatedAt', new Date());

  return result;
}
