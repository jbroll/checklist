/**
 * Main export service (rowboat port, slice-2).
 *
 * Orchestrates all export operations (JSON, TXT, CSV). Every entry point takes the rowboat
 * relational graph `g`, resolves a template folder by id, and hands the parsed `FolderRow` to the
 * format exporters.
 *
 * NO FALLBACKS: a missing (or archived, or non-template) folder is a thrown hard error.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { FolderRow, schema } from '../../schema/folder';
import { parseFolderRow } from '../../schema/folderData';
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
function isTemplateFolder(row: { type: string }): boolean {
  return row.type === 'template-folder';
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
  return parseFolderRow(row);
}

/** Find a template folder row by id or throw if not found. */
function getTemplateOrThrow(g: Graph, templateId: string): FolderRow {
  const template = findTemplateRow(g, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template;
}

/** Export folders to JSON based on scope. */
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

/** Export to a JSON string. */
export function exportToJsonString(g: Graph, scope: ExportScope, pretty = true): string {
  return toJsonString(exportToJson(g, scope), pretty);
}

/** Generate a filename for an export. */
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
  return exportTemplateItemsToTextImpl(getTemplateOrThrow(g, templateId));
}

/** Export template items to CSV format. */
export function exportTemplateItemsToCsv(g: Graph, templateId: string): string {
  return exportTemplateItemsToCsvImpl(getTemplateOrThrow(g, templateId));
}

/** Export a session to TXT format. */
export function exportSessionToText(g: Graph, templateId: string, sessionId: string): string {
  const folder = getTemplateOrThrow(g, templateId);
  const result = exportSessionToTextImpl(folder, sessionId);
  if (result === null) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return result;
}

/** Export a session to CSV format. */
export function exportSessionToCsv(g: Graph, templateId: string, sessionId: string): string {
  const folder = getTemplateOrThrow(g, templateId);
  const result = exportSessionToCsvImpl(folder, sessionId);
  if (result === null) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return result;
}
