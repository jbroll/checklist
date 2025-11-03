/**
 * Session Importer
 *
 * Imports shopping sessions from CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { ItemState, ShoppingSession } from '../../schemas/tree';
import { parseCsv } from '../../utils/csvParser';

export interface SessionImportResult {
  imported: boolean;
  matched: number;
  unmatched: number;
  errors: string[];
  unmatchedItems: string[];
  sessionId?: string;
}

export interface SessionImportOptions {
  sessionName?: string;
  addMissingItems?: boolean;
}

/**
 * Import session from CSV
 *
 * Expected CSV format:
 * name,category,inCart,purchased,addedToCartAt,purchasedAt
 *
 * Matches items by name (case-insensitive) to template items.
 * Creates a new session with the imported state.
 *
 * @param csvContent - CSV content string
 * @param folder - Folder to import session into
 * @param account - User's GroceriesAccount (for ownership)
 * @param options - Import options (session name, add missing items)
 * @returns Import result with statistics
 */
export function importSessionFromCsv(
  csvContent: string,
  folder: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof GroceriesAccount>,
  options: SessionImportOptions = {},
): SessionImportResult {
  const result: SessionImportResult = {
    imported: false,
    matched: 0,
    unmatched: 0,
    errors: [],
    unmatchedItems: [],
  };

  // Validate folder type
  if (folder.type !== 'template-folder' || !folder.items || !folder.sessions) {
    result.errors.push('Can only import sessions into template folders');
    return result;
  }

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

  // Create lookup map for template items (by lowercase name)
  const templateItemsByName = new Map<
    string,
    InstanceOfSchema<typeof import('../../schemas/tree').TemplateItem>
  >();
  for (const item of folder.items) {
    if (item && !item.archived) {
      templateItemsByName.set(item.name.toLowerCase(), item);
    }
  }

  // Process CSV rows and create item states
  const itemStatesRecord: Record<string, InstanceOfSchema<typeof ItemState>> = {};
  let totalInCart = 0;
  let totalPurchased = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is header

    // Validate required fields
    if (!row || !row.name || row.name.trim().length === 0) {
      result.errors.push(`Row ${rowNum}: Missing item name`);
      continue;
    }

    const itemName = row.name.trim();

    // Try to match item by name (case-insensitive)
    const templateItem = templateItemsByName.get(itemName.toLowerCase());

    if (!templateItem) {
      result.unmatched++;
      result.unmatchedItems.push(itemName);
      continue;
    }

    // Parse state fields
    const inCart = row.inCart?.toLowerCase() === 'true';
    const purchased = row.purchased?.toLowerCase() === 'true';

    // Parse timestamps if provided
    let addedToCartAt: Date | undefined;
    let purchasedAt: Date | undefined;

    if (row.addedToCartAt && row.addedToCartAt.trim().length > 0) {
      try {
        addedToCartAt = new Date(row.addedToCartAt);
        if (Number.isNaN(addedToCartAt.getTime())) {
          addedToCartAt = undefined;
        }
      } catch {
        // Invalid date, skip
      }
    }

    if (row.purchasedAt && row.purchasedAt.trim().length > 0) {
      try {
        purchasedAt = new Date(row.purchasedAt);
        if (Number.isNaN(purchasedAt.getTime())) {
          purchasedAt = undefined;
        }
      } catch {
        // Invalid date, skip
      }
    }

    try {
      // Create ItemState
      const itemState = ItemState.create(
        {
          itemId: templateItem.$jazz.id,
          inCart,
          purchased,
          addedToCartAt,
          purchasedAt,
        },
        { owner: account },
      );

      itemStatesRecord[templateItem.$jazz.id] = itemState;
      result.matched++;

      // Update counts
      if (inCart) totalInCart++;
      if (purchased) totalPurchased++;
    } catch (error) {
      result.errors.push(`Row ${rowNum} ("${itemName}"): ${String(error)}`);
    }
  }

  // If no items matched, return error
  if (result.matched === 0) {
    result.errors.push('No items could be matched to template items');
    return result;
  }

  // Determine session name
  const sessionName = options.sessionName || `[${new Date().toISOString().split('T')[0]}]`;

  // Determine session status
  const totalItems = result.matched;
  const remainingCount = totalItems - totalPurchased;
  const status: 'active' | 'completed' | 'abandoned' =
    totalPurchased === totalItems ? 'completed' : 'active';

  // Create shopping session
  try {
    const session = ShoppingSession.create(
      {
        name: sessionName,
        templateFolderId: folder.$jazz?.id || '',
        itemStates: itemStatesRecord,
        status,
        viewMode: 'hierarchy-in-zones', // Default view mode
        categoryExpanded: {},
        inCartCount: totalInCart,
        completedCount: totalPurchased,
        remainingCount,
        owner: account,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        completedAt: status === 'completed' ? new Date() : undefined,
      },
      { owner: account },
    );

    // Add session to folder
    folder.sessions?.$jazz.push(session);

    // Update folder timestamp
    folder.$jazz.set('updatedAt', new Date());

    result.imported = true;
    result.sessionId = session.$jazz.id;
  } catch (error) {
    result.errors.push(`Failed to create session: ${String(error)}`);
    return result;
  }

  return result;
}
