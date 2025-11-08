/**
 * CSV Importer
 *
 * Imports template items and sessions from CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { parseCsv } from '../../utils/csvParser';
import { normalizePathSegment } from '../../utils/pathUtils';
import { type BaseImportResult, importItems } from './baseImporter';

export type CsvImportResult = BaseImportResult;

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
 * @param account - User's Account (for ownership)
 * @returns Import result with statistics
 */
export function importItemsFromCsv(
  csvContent: string,
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): CsvImportResult {
  // Parse CSV
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(csvContent);
  } catch (error) {
    return {
      imported: 0,
      skipped: 0,
      errors: [`Failed to parse CSV: ${String(error)}`],
      duplicates: [],
    };
  }

  // Convert CSV rows to items
  const itemsToImport = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is header, and humans count from 1

    // Validate required fields
    if (!row || !row.name || row.name.trim().length === 0) {
      continue; // Skip invalid rows - let base importer handle the empty check
    }

    const name = row.name.trim();
    const pathSegment = normalizePathSegment(name);
    const path = row.path?.trim() || pathSegment;
    const defaultQuantity = row.defaultQuantity?.trim() || '';

    itemsToImport.push({
      name,
      path,
      defaultQuantity,
      context: `Row ${rowNum}`,
    });
  }

  // Use base importer to handle the actual import
  return importItems(itemsToImport, folder, account);
}
