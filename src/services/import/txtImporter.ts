/**
 * TXT Importer
 *
 * Imports template items from plain text format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { parseTextList } from '../../utils/csvParser';
import { normalizePathSegment } from '../../utils/pathUtils';
import { type BaseImportResult, importItems } from './baseImporter';

export type TxtImportResult = BaseImportResult;

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
 * @param account - User's Account (for ownership)
 * @returns Import result with statistics
 */
export function importItemsFromText(
  textContent: string,
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): TxtImportResult {
  // Parse text into lines
  const itemNames = parseTextList(textContent);

  // Convert names to items with paths
  const itemsToImport = itemNames.map((name) => ({
    name,
    path: normalizePathSegment(name),
  }));

  // Use base importer to handle the actual import
  return importItems(itemsToImport, folder, account);
}
