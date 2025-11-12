/**
 * Main export service
 *
 * Orchestrates all export operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, Template } from '../../schemas';
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
 * @returns Template or null if not found
 */
function findTemplateById(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): InstanceOfSchema<typeof Template> | null {
  if (!account.root?.templates) {
    return null;
  }

  for (const template of account.root.templates) {
    if (template && template.$jazz?.id === templateId) {
      return template;
    }
  }

  return null;
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

  // Find the directory entry for this template to get its path
  const dirEntry = account.root?.directory?.find(
    (entry) => entry.type === 'template-ref' && entry.templateId === scope.folderId,
  );

  if (!dirEntry) {
    throw new Error(`Directory entry not found for template: ${scope.folderId}`);
  }

  return exportTemplate(template, dirEntry.path);
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
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (scope.type === 'all-folders') {
    return `bubblelist-data-${timestamp}.${format}`;
  }

  // Single folder - use folder name
  const safeName = folderName ? folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'folder';
  return `${safeName}-${timestamp}.${format}`;
}

/**
 * Export template items to TXT format
 *
 * @param account - User's Account
 * @param templateId - ID of the template to export
 * @returns Plain text string with one item per line
 */
export function exportTemplateItemsToText(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): string {
  const template = findTemplateById(account, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return exportTemplateItemsToTextImpl(template);
}

/**
 * Export template items to CSV format
 *
 * @param account - User's Account
 * @param templateId - ID of the template to export
 * @returns CSV string with header row
 */
export function exportTemplateItemsToCsv(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): string {
  const template = findTemplateById(account, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return exportTemplateItemsToCsvImpl(template);
}

/**
 * Export session to TXT format
 *
 * @param account - User's Account
 * @param templateId - ID of the template containing the session
 * @param sessionId - ID of the session to export
 * @returns Plain text string with checkmarks
 */
export function exportSessionToText(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): string {
  const template = findTemplateById(account, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const result = exportSessionToTextImpl(template, sessionId);
  if (!result) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return result;
}

/**
 * Export session to CSV format
 *
 * @param account - User's Account
 * @param templateId - ID of the template containing the session
 * @param sessionId - ID of the session to export
 * @returns CSV string with header row
 */
export function exportSessionToCsv(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  sessionId: string,
): string {
  const template = findTemplateById(account, templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const result = exportSessionToCsvImpl(template, sessionId);
  if (!result) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return result;
}
