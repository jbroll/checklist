/**
 * Session Importer
 *
 * Imports shopping sessions from CSV format.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { generateId } from '../../lib/utils';
import type { Account, FolderNode, SessionData } from '../../schemas';
import type { ItemState } from '../../schemas/tree';
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
 * @param template - FolderNode to import session into
 * @param account - User's Account (for ownership)
 * @param options - Import options (session name, add missing items)
 * @returns Import result with statistics
 */
export function importSessionFromCsv(
  csvContent: string,
  template: InstanceOfSchema<typeof FolderNode>,
  _account: InstanceOfSchema<typeof Account>,
  _options: SessionImportOptions = {},
): SessionImportResult {
  const result: SessionImportResult = {
    imported: false,
    matched: 0,
    unmatched: 0,
    errors: [],
    unmatchedItems: [],
  };

  // Validate template has items and sessions
  if (!template.items || !template.sessions) {
    result.errors.push('Can only import sessions into templates with items');
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
  const templateItemsByName = new Map<string, { id: string; name: string }>();
  for (const item of template.items) {
    if (item && !item.archived) {
      templateItemsByName.set(item.name.toLowerCase(), item);
    }
  }

  // Process CSV rows and create item states
  const itemStatesRecord: Record<string, ItemState> = {};
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
      // Create ItemState as plain object
      const itemState: ItemState = {
        selected: inCart,
        checked: purchased,
        selectedAt: addedToCartAt,
        checkedAt: purchasedAt,
      };

      itemStatesRecord[templateItem.id] = itemState;
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

  // Calculate counts
  const totalItems = result.matched;
  const remainingCount = totalItems - totalPurchased;

  const now = new Date();

  // Create shopping session
  try {
    const session: SessionData = {
      id: generateId(),
      itemStates: itemStatesRecord,
      archived: false,
      viewMode: 'zone-in-hierarchy', // Default view mode
      categoryExpanded: {},
      selectedCount: totalInCart,
      checkedCount: totalPurchased,
      remainingCount,
      createdAt: now,
      lastActivityAt: now,
    };

    // Add session to template
    const updatedSessions = [...(template.sessions || []), session];
    template.$jazz.set('sessions', updatedSessions);

    // Update template timestamp
    template.$jazz.set('updatedAt', new Date());

    result.imported = true;
    result.sessionId = session.id;
  } catch (error) {
    result.errors.push(`Failed to create session: ${String(error)}`);
    return result;
  }

  return result;
}
