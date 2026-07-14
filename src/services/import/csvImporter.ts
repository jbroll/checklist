/**
 * CSV Importer (rowboat port, slice-2)
 *
 * Imports template items from CSV format.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '../../schema/folder';
import { parseCsv } from '../../utils/csvParser';
import { createChildPath } from '../../utils/pathUtils';
import { type BaseImportResult, importItems } from './baseImporter';

type Graph = RelationalGraph<typeof schema>;

export type CsvImportResult = BaseImportResult;

/**
 * Import template items from CSV
 *
 * Expected CSV format:
 * category,item
 *
 * All imported items are created as leaf items (type='item').
 * Items with the same category are grouped together.
 *
 * @param g - The rowboat graph
 * @param templateId - Template folder to import items into
 * @param csvContent - CSV content string
 * @returns Import result with statistics
 */
export async function importItemsFromCsv(
  g: Graph,
  templateId: string,
  csvContent: string,
): Promise<CsvImportResult> {
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

    // Support both formats: category,item (new) and name,path (legacy)
    const itemName = row.item?.trim() || row.name?.trim();
    const category = row.category?.trim();
    const explicitPath = row.path?.trim();

    // Validate required fields
    if (!row || !itemName || itemName.length === 0) {
      continue; // Skip invalid rows
    }

    // Build path: explicit path > category/item > item name
    let path: string;
    if (explicitPath) {
      path = explicitPath;
    } else if (category) {
      path = createChildPath(category, itemName);
    } else {
      path = itemName;
    }

    itemsToImport.push({
      name: itemName,
      path,
      defaultQuantity: row.defaultQuantity?.trim() || '',
      context: `Row ${rowNum}`,
    });
  }

  // Use base importer to handle the actual import
  return importItems(g, templateId, itemsToImport);
}
