/**
 * TXT Importer
 *
 * Imports template items from plain text format.
 * Supports two formats:
 * 1. Flat list (one item per line)
 * 2. Indented list (hierarchical with tabs/spaces)
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { parseTextList } from '../../utils/csvParser';
import { isIndentedFormat, parseIndentedList } from '../../utils/indentedListParser';
import { normalizePathSegment } from '../../utils/pathUtils';
import { type BaseImportResult, importItems } from './baseImporter';

export type TxtImportResult = BaseImportResult;

/**
 * Import template items from plain text
 *
 * Auto-detects format:
 * - Flat format: One item name per line (all items at root level)
 * - Indented format: Hierarchical structure with tabs/spaces
 *
 * For flat format:
 * - All imported items are created as leaf items (type='item')
 * - Items are created at top level with path generated from name
 *
 * For indented format:
 * - Items with children become categories (type='category')
 * - Leaf items become items (type='item')
 * - Paths are generated from hierarchy
 *
 * @param textContent - Plain text content
 * @param folder - Folder to import items into
 * @param account - User's Account (for ownership)
 * @returns Import result with statistics
 */
export function importItemsFromText(
  textContent: string,
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): TxtImportResult {
  // Detect format
  if (isIndentedFormat(textContent)) {
    // Parse indented format
    const parsedItems = parseIndentedList(textContent);

    // Convert to import format (name, path, type)
    const itemsToImport = parsedItems.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type,
    }));

    // Use base importer to handle the actual import
    return importItems(itemsToImport, folder, account);
  }

  // Parse flat format (original behavior)
  const itemNames = parseTextList(textContent);

  // Convert names to items with paths
  const itemsToImport = itemNames.map((name) => ({
    name,
    path: normalizePathSegment(name),
  }));

  // Use base importer to handle the actual import
  return importItems(itemsToImport, folder, account);
}
