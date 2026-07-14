/**
 * Main export service (rowboat port, slice-2).
 *
 * Orchestrates all export operations (JSON, TXT, CSV). Ported off Jazz: every entry point takes
 * the rowboat relational graph `g` and resolves a template folder by id from it. The TXT/CSV
 * exporters still consume a folder-shaped value structurally (they read `.items`/`.sessions`),
 * so a `FolderRow` is handed straight to them.
 *
 * NO FALLBACKS: a missing (or archived, or non-template) folder is a thrown hard error.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { FolderRow, schema } from '../../schema/folder';
import { getDateStampForFilename } from '../../utils/dateUtils';
import {
  exportSessionToCsv as exportSessionToCsvImpl,
  exportTemplateItemsToCsv as exportTemplateItemsToCsvImpl,
} from './csvExporter';
import { exportAllFolders, exportTemplate, toJsonString } from './jsonExporter';
import {
  exportSessionToText as exportSessionToTextImpl,
  exportTemplateItemsToText as exportTemplateItemsToTextImpl,
} from './txtExporter';
import type { ExportedData, ExportScope } from './types';

type Graph = RelationalGraph<typeof schema>;

/** A "template" is a folder row of `type: 'template-folder'`. */
function isTemplateFolder(row: FolderRow): boolean {
  return row.type === 'template-folder';
}

/**
 * The TXT/CSV exporters are still Jazz-typed and read item/session timestamps as `Date`s (e.g.
 * `csvExporter` calls `toISOStringOrEmpty(itemState.selectedAt)`). Rowboat stores those as
 * epoch-ms NUMBERS, so convert them to `Date`s before handing the folder to those Impls. Own
 * timestamps (item/session createdAt) are required columns — NO FALLBACKS for a missing date.
 */
function toDatedFolder(row: FolderRow): FolderRow {
  const items = row.items.map((i) => ({ ...i, createdAt: new Date(i.createdAt) }));
  const sessions = row.sessions.map((s) => {
    const itemStates: Record<string, unknown> = {};
    for (const [itemId, state] of Object.entries(s.itemStates)) {
      itemStates[itemId] = {
        ...state,
        ...(state.selectedAt != null ? { selectedAt: new Date(state.selectedAt) } : {}),
        ...(state.checkedAt != null ? { checkedAt: new Date(state.checkedAt) } : {}),
      };
    }
    return {
      ...s,
      itemStates,
      createdAt: new Date(s.createdAt),
      lastActivityAt: new Date(s.lastActivityAt),
    };
  });
  // The Impls accept `any` (their FolderNode schema is typed `any`); this dated view is
  // structurally what they read. Cast back to FolderRow for the local call sites' types.
  return { ...row, items, sessions } as unknown as FolderRow;
}

/**
 * Find a non-archived template folder row by id. Returns null if the folder is absent, archived,
 * or not a template folder (matches the old `walkTree` skip-archived behaviour).
 */
function findTemplateRow(g: Graph, templateId: string): FolderRow | null {
  const node = g.folder(templateId);
  if (!node) return null;
  const row = node.$data;
  if (!isTemplateFolder(row) || row.archived) return null;
  return row;
}

/** Find a template folder row by id or throw if not found. */
function getTemplateOrThrow(g: Graph, templateId: string): FolderRow {
  const template = findTemplateRow(g, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template;
}

/**
 * Export folders to JSON based on scope.
 *
 * @param g - The rowboat relational graph
 * @param scope - What to export (all folders or single template)
 * @returns Export data structure
 */
export function exportToJson(g: Graph, scope: ExportScope): ExportedData {
  if (scope.type === 'all-folders') {
    return exportAllFolders(g);
  }

  if (!scope.folderId) {
    throw new Error('Template ID required for single-template export');
  }

  const template = findTemplateRow(g, scope.folderId);
  if (!template) {
    throw new Error(`Template not found: ${scope.folderId}`);
  }

  return exportTemplate(template);
}

/**
 * Export to a JSON string.
 *
 * @param g - The rowboat relational graph
 * @param scope - What to export
 * @param pretty - Whether to pretty-print (default: true)
 * @returns JSON string
 */
export function exportToJsonString(g: Graph, scope: ExportScope, pretty = true): string {
  return toJsonString(exportToJson(g, scope), pretty);
}

/**
 * Generate a filename for an export.
 *
 * @param scope - Export scope
 * @param format - Export format
 * @param folderName - Folder name (for single-folder exports)
 * @returns Suggested filename
 */
export function generateFilename(
  scope: ExportScope,
  format: 'json' | 'txt' | 'csv',
  folderName?: string,
): string {
  const timestamp = getDateStampForFilename();

  if (scope.type === 'all-folders') {
    return `checklist-data-${timestamp}.${format}`;
  }

  const safeName = folderName ? folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'folder';
  return `${safeName}-${timestamp}.${format}`;
}

/** Export template items to TXT format. */
export function exportTemplateItemsToText(g: Graph, templateId: string): string {
  return exportTemplateItemsToTextImpl(toDatedFolder(getTemplateOrThrow(g, templateId)));
}

/** Export template items to CSV format. */
export function exportTemplateItemsToCsv(g: Graph, templateId: string): string {
  return exportTemplateItemsToCsvImpl(toDatedFolder(getTemplateOrThrow(g, templateId)));
}

/** Export a session to TXT format. */
export function exportSessionToText(g: Graph, templateId: string, sessionId: string): string {
  const folder = toDatedFolder(getTemplateOrThrow(g, templateId));
  const result = exportSessionToTextImpl(folder, sessionId);
  if (result === null) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return result;
}

/** Export a session to CSV format. */
export function exportSessionToCsv(g: Graph, templateId: string, sessionId: string): string {
  const folder = toDatedFolder(getTemplateOrThrow(g, templateId));
  const result = exportSessionToCsvImpl(folder, sessionId);
  if (result === null) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return result;
}
