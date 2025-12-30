/**
 * Main export service
 *
 * Orchestrates all export operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { getDateStampForFilename } from '../../utils/dateUtils';
import * as folderService from '../folderService';
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

/**
 * Find a template by its Jazz ID
 *
 * @param account - User's Account
 * @param templateId - Jazz ID of the template
 * @returns FolderNode or null if not found
 */
function findTemplateById(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): InstanceOfSchema<typeof FolderNode> | null {
  const templates = folderService.getAllTemplateFolders(account);
  return templates.find((t) => t?.$jazz?.id === templateId) || null;
}

/**
 * Find a template by ID or throw if not found
 */
function getTemplateOrThrow(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): InstanceOfSchema<typeof FolderNode> {
  const template = findTemplateById(account, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template;
}

/**
 * Export folders to JSON based on scope
 *
 * @param account - User's Account
 * @param scope - What to export (all folders or single template)
 * @returns Export data structure
 */
export function exportToJson(
  account: InstanceOfSchema<typeof Account>,
  scope: ExportScope,
): ExportedData {
  if (scope.type === 'all-folders') {
    return exportAllFolders(account);
  }

  // Single template export
  if (!scope.folderId) {
    throw new Error('Template ID required for single-template export');
  }

  const template = findTemplateById(account, scope.folderId);
  if (!template) {
    throw new Error(`Template not found: ${scope.folderId}`);
  }

  return exportTemplate(template);
}

/**
 * Export to JSON string
 *
 * @param account - User's Account
 * @param scope - What to export
 * @param pretty - Whether to pretty-print (default: true)
 * @returns JSON string
 */
export function exportToJsonString(
  account: InstanceOfSchema<typeof Account>,
  scope: ExportScope,
  pretty = true,
): string {
  const data = exportToJson(account, scope);
  return toJsonString(data, pretty);
}

/**
 * Generate filename for export
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

  // Single folder - use folder name
  const safeName = folderName ? folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'folder';
  return `${safeName}-${timestamp}.${format}`;
}

/**
 * Export template items to TXT format
 */
export function exportTemplateItemsToText(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): string {
  return exportTemplateItemsToTextImpl(getTemplateOrThrow(account, templateId));
}

/**
 * Export template items to CSV format
 */
export function exportTemplateItemsToCsv(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): string {
  return exportTemplateItemsToCsvImpl(getTemplateOrThrow(account, templateId));
}

/**
 * Export session to TXT format
 */
export function exportSessionToText(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): string {
  const result = exportSessionToTextImpl(getTemplateOrThrow(account, templateId), sessionId);
  if (!result) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return result;
}

/**
 * Export session to CSV format
 */
export function exportSessionToCsv(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): string {
  const result = exportSessionToCsvImpl(getTemplateOrThrow(account, templateId), sessionId);
  if (!result) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return result;
}
