/**
 * CSV Importer
 *
 * Imports template items and sessions from CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { TemplateItem } from '../../schemas';
import { parseCsv } from '../../utils/csvParser';
import { normalizePathSegment } from '../../utils/pathUtils';

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: string[];
}

/**
 * Import template items from CSV
 *
 * Expected CSV format (new schema):
 * name,defaultQuantity,icon,path
 *
 * All imported items are created as leaf items (type='item').
 * If path is not provided, items are created at top level.
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

    // Generate path from name if not provided
    const pathSegment = normalizePathSegment(name);
    const path = row.path?.trim() || pathSegment;

    // Skip if already exists at this path
    if (existingPaths.has(path.toLowerCase())) {
      result.skipped++;
      result.duplicates.push(name);
      continue;
    }

    try {
      // Get default quantity (optional)
      const defaultQuantity = row.defaultQuantity?.trim() || '';
      const icon = row.icon?.trim() || '📦';

      // Create new template item (always type='item' for CSV imports)
      const newItem = TemplateItem.create(
        {
          name,
          type: 'item',
          path,
          expanded: false,
          sortOrder: nextSortOrder++,
          archived: false,
          defaultQuantity,
          icon,
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
      result.errors.push(`Row ${rowNum} ("${name}"): ${String(error)}`);
    }
  }

  // Update folder timestamp
  folder.$jazz.set('updatedAt', new Date());

  return result;
}
