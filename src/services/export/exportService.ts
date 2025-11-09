/**
 * Main export service
 *
 * Orchestrates all export operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, Template } from '../../schemas';
import { exportSessionToCsv, exportTemplateItemsToCsv } from './csvExporter';
import { exportAllFolders, exportTemplate, toJsonString } from './jsonExporter';
import { exportSessionToText, exportTemplateItemsToText } from './txtExporter';
import type { ExportedData, ExportScope } from './types';

/**
 * Export Service
 *
 * Provides methods for exporting grocery data in various formats.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Service class pattern
export class ExportService {
  /**
   * Export folders to JSON based on scope
   *
   * @param account - User's Account
   * @param scope - What to export (all folders or single template)
   * @returns Export data structure
   */
  static exportToJson(account: InstanceOfSchema<typeof Account>, scope: ExportScope): ExportedData {
    if (scope.type === 'all-folders') {
      return exportAllFolders(account);
    }

    // Single template export
    if (!scope.folderId) {
      throw new Error('Template ID required for single-template export');
    }

    const template = ExportService.findTemplateById(account, scope.folderId);
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
  static exportToJsonString(
    account: InstanceOfSchema<typeof Account>,
    scope: ExportScope,
    pretty = true,
  ): string {
    const data = ExportService.exportToJson(account, scope);
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
  static generateFilename(
    scope: ExportScope,
    format: 'json' | 'txt' | 'csv',
    folderName?: string,
  ): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (scope.type === 'all-folders') {
      return `grocery-data-${timestamp}.${format}`;
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
  static exportTemplateItemsToText(
    account: InstanceOfSchema<typeof Account>,
    templateId: string,
  ): string {
    const template = ExportService.findTemplateById(account, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return exportTemplateItemsToText(template);
  }

  /**
   * Export template items to CSV format
   *
   * @param account - User's Account
   * @param templateId - ID of the template to export
   * @returns CSV string with header row
   */
  static exportTemplateItemsToCsv(
    account: InstanceOfSchema<typeof Account>,
    templateId: string,
  ): string {
    const template = ExportService.findTemplateById(account, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return exportTemplateItemsToCsv(template);
  }

  /**
   * Export session to TXT format
   *
   * @param account - User's Account
   * @param templateId - ID of the template containing the session
   * @param sessionId - ID of the session to export
   * @returns Plain text string with checkmarks
   */
  static exportSessionToText(
    account: InstanceOfSchema<typeof Account>,
    templateId: string,
    sessionId: string,
  ): string {
    const template = ExportService.findTemplateById(account, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const result = exportSessionToText(template, sessionId);
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
  static exportSessionToCsv(
    account: InstanceOfSchema<typeof Account>,
    templateId: string,
    sessionId: string,
  ): string {
    const template = ExportService.findTemplateById(account, templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const result = exportSessionToCsv(template, sessionId);
    if (!result) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return result;
  }

  /**
   * Find a template by its Jazz ID
   *
   * @param account - User's Account
   * @param templateId - Jazz ID of the template
   * @returns Template or null if not found
   */
  private static findTemplateById(
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
}
