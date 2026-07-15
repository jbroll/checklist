/**
 * Base importer utilities.
 *
 * Shared logic for CSV and TXT importers. Takes the rowboat graph `g` and a `templateId` — items
 * are appended to the template folder row's `items` json column via `g.folder.update`, matching
 * `templateService.ts`.
 *
 * NO FALLBACKS: a missing template is a hard error (thrown) — callers only reach this after
 * opening the import dialog for a template that exists in the graph.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { generateId } from '../../lib/utils';
import type { schema, TemplateItem } from '../../schema/folder';
import { itemsList } from '../folderListHandles';
import { getTemplate } from '../templateService';

type Graph = RelationalGraph<typeof schema>;

export interface BaseImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: string[];
}

export interface ItemToImport {
  name: string;
  path: string;
  type?: 'category' | 'item'; // Optional: defaults to 'item' for backward compatibility
  defaultQuantity?: string;
  /** Optional context for error messages (e.g., "Row 5") */
  context?: string;
}

/** Read the template folder row, throwing if it doesn't exist or isn't a template folder. */
function requireTemplate(g: Graph, templateId: string) {
  const template = getTemplate(g, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);
  return template;
}

/**
 * Import multiple items into a template.
 *
 * Handles duplicate detection, item creation, and error tracking.
 */
export async function importItems(
  g: Graph,
  templateId: string,
  items: ItemToImport[],
): Promise<BaseImportResult> {
  const template = requireTemplate(g, templateId);

  const result: BaseImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: [],
  };

  if (items.length === 0) {
    result.errors.push('No items found');
    return result;
  }

  // Get existing paths (case-insensitive) and next sort order
  const existingPaths = new Set(
    template.items.filter((i) => !i.archived).map((i) => i.path.toLowerCase()),
  );
  let nextSortOrder = 0;
  for (const existing of template.items) {
    if (existing.sortOrder >= nextSortOrder) nextSortOrder = existing.sortOrder + 1;
  }

  const now = Date.now();
  const newItems: TemplateItem[] = [];

  for (const item of items) {
    const { name, path, type = 'item', defaultQuantity = '', context } = item;

    // Skip if already exists at this path
    if (existingPaths.has(path.toLowerCase())) {
      result.skipped++;
      result.duplicates.push(name);
      continue;
    }

    try {
      const newItem: TemplateItem = {
        id: generateId(),
        name,
        type,
        path,
        expanded: false,
        sortOrder: nextSortOrder++,
        archived: false,
        defaultQuantity,
        createdAt: now,
      };

      newItems.push(newItem);
      result.imported++;

      // Add to existing paths to prevent duplicates within import
      existingPaths.add(path.toLowerCase());
    } catch (error) {
      const errorContext = context ? `${context} ` : '';
      result.errors.push(`${errorContext}Failed to import "${name}": ${String(error)}`);
    }
  }

  if (newItems.length > 0) {
    const list = itemsList(g, templateId);
    for (const newItem of newItems) await list.append(newItem);
  }

  return result;
}
