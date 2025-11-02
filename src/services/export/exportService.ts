/**
 * Main export service
 *
 * Orchestrates all export operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { exportAllFolders, exportFolder, toJsonString } from './jsonExporter';
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
   * @param account - User's GroceriesAccount
   * @param scope - What to export (all folders or single folder)
   * @returns Export data structure
   */
  static exportToJson(
    account: InstanceOfSchema<typeof GroceriesAccount>,
    scope: ExportScope,
  ): ExportedData {
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
   * @param account - User's GroceriesAccount
   * @param scope - What to export
   * @param pretty - Whether to pretty-print (default: true)
   * @returns JSON string
   */
  static exportToJsonString(
    account: InstanceOfSchema<typeof GroceriesAccount>,
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
   * Find a folder by its Jazz ID
   *
   * @param account - User's GroceriesAccount
   * @param folderId - Jazz ID of the folder
   * @returns FolderNode or null if not found
   */
  private static findFolderById(
    account: InstanceOfSchema<typeof GroceriesAccount>,
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
