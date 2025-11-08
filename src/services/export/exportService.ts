/**
 * Main export service
 *
 * Orchestrates all export operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { exportSessionToCsv, exportTemplateItemsToCsv } from './csvExporter';
import { exportAllFolders, exportFolder, toJsonString } from './jsonExporter';
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
   * @param scope - What to export (all folders or single folder)
   * @returns Export data structure
   */
  static exportToJson(account: InstanceOfSchema<typeof Account>, scope: ExportScope): ExportedData {
    if (scope.type === 'all-folders') {
      return exportAllFolders(account);
    }

    // Single folder export
    if (!scope.folderId) {
      throw new Error('Folder ID required for single-folder export');
    }

    const folder = ExportService.findFolderById(account, scope.folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${scope.folderId}`);
    }

    return exportFolder(folder);
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
   * @param folderId - ID of the folder to export
   * @returns Plain text string with one item per line
   */
  static exportTemplateItemsToText(
    account: InstanceOfSchema<typeof Account>,
    folderId: string,
  ): string {
    const folder = ExportService.findFolderById(account, folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    return exportTemplateItemsToText(folder);
  }

  /**
   * Export template items to CSV format
   *
   * @param account - User's Account
   * @param folderId - ID of the folder to export
   * @returns CSV string with header row
   */
  static exportTemplateItemsToCsv(
    account: InstanceOfSchema<typeof Account>,
    folderId: string,
  ): string {
    const folder = ExportService.findFolderById(account, folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    return exportTemplateItemsToCsv(folder);
  }

  /**
   * Export session to TXT format
   *
   * @param account - User's Account
   * @param folderId - ID of the folder containing the session
   * @param sessionId - ID of the session to export
   * @returns Plain text string with checkmarks
   */
  static exportSessionToText(
    account: InstanceOfSchema<typeof Account>,
    folderId: string,
    sessionId: string,
  ): string {
    const folder = ExportService.findFolderById(account, folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    const result = exportSessionToText(folder, sessionId);
    if (!result) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return result;
  }

  /**
   * Export session to CSV format
   *
   * @param account - User's Account
   * @param folderId - ID of the folder containing the session
   * @param sessionId - ID of the session to export
   * @returns CSV string with header row
   */
  static exportSessionToCsv(
    account: InstanceOfSchema<typeof Account>,
    folderId: string,
    sessionId: string,
  ): string {
    const folder = ExportService.findFolderById(account, folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    const result = exportSessionToCsv(folder, sessionId);
    if (!result) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return result;
  }

  /**
   * Find a folder by its Jazz ID
   *
   * @param account - User's Account
   * @param folderId - Jazz ID of the folder
   * @returns FolderNode or null if not found
   */
  private static findFolderById(
    account: InstanceOfSchema<typeof Account>,
    folderId: string,
  ): InstanceOfSchema<typeof FolderNode> | null {
    if (!account.root?.nodes) {
      return null;
    }

    for (const node of account.root.nodes) {
      if (node && node.$jazz?.id === folderId) {
        return node;
      }
    }

    return null;
  }
}
