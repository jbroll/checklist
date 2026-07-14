/**
 * Base importer utilities (rowboat port, slice-2).
 *
 * Shared logic for CSV and TXT importers. Ported off Jazz: takes the rowboat graph `g` and a
 * `templateId` instead of a Jazz `Account`/`FolderNode` — items are appended to the template
 * folder row's `items` json column via `g.folder.update`, matching `templateService.ts`.
 *
 * NO FALLBACKS: a missing template is a hard error (thrown) — callers only reach this after
 * opening the import dialog for a template that exists in the graph.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { generateId } from '../../lib/utils';
import type { schema, TemplateItem } from '../../schema/folder';
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
 *
 * @param g - The rowboat graph
 * @param templateId - Template folder to import into
 * @param items - Items to import
 * @returns Import result with statistics
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
    await g.folder.update(templateId, {
      items: [...template.items, ...newItems],
      updated_at: now,
    });
  }

  return result;
}
