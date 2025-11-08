/**
 * Main import service
 *
 * Orchestrates all import operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { readFileAsText } from '../../utils/fileUpload';
import { type CsvImportResult, importItemsFromCsv } from './csvImporter';
import { MAX_FILE_SIZE_MB, validateImportFile } from './importValidator';
import { importJson } from './jsonImporter';
import { createErrorResult, createSuccessResult } from './resultHelpers';
import {
  importSessionFromCsv,
  type SessionImportOptions,
  type SessionImportResult,
} from './sessionImporter';
import { importItemsFromText, type TxtImportResult } from './txtImporter';
import type { ImportFileType, ImportResult } from './types';

/**
 * Import Service
 *
 * Provides methods for importing grocery data in various formats.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Service class pattern
export class ImportService {
  /**
   * Import data from a file
   *
   * @param file - File object from input or drag-and-drop
   * @param account - User's Account
   * @param fileType - Expected file type (optional, auto-detected from extension)
   * @returns Import result with success/failure info
   */
  static async importFromFile(
    file: File,
    account: InstanceOfSchema<typeof Account>,
    fileType?: ImportFileType,
  ): Promise<ImportResult> {
    // Determine file type
    const detectedType = fileType || ImportService.detectFileType(file);
    if (!detectedType) {
      return createErrorResult('Unable to determine file type. Expected .json, .txt, or .csv');
    }

    // Validate file
    const validExtensions = ImportService.getValidExtensions(detectedType);
    try {
      validateImportFile(file, validExtensions, MAX_FILE_SIZE_MB);
    } catch (error) {
      return createErrorResult(error instanceof Error ? error : 'Validation failed');
    }

    // Read file content
    let content: string;
    try {
      content = await readFileAsText(file);
    } catch (error) {
      return createErrorResult(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Import based on type
    switch (detectedType) {
      case 'json':
        return await importJson(content, account);

      case 'txt':
        // TODO: Phase 2 - Template list import from TXT
        return createErrorResult('TXT import not yet implemented');

      case 'csv':
        // TODO: Phase 2/3 - Template list or session import from CSV
        return createErrorResult('CSV import not yet implemented');

      default:
        return createErrorResult(`Unsupported file type: ${detectedType}`);
    }
  }

  /**
   * Detect file type from filename
   *
   * @param file - File object
   * @returns Detected file type or null
   */
  private static detectFileType(file: File): ImportFileType | null {
    const filename = file.name.toLowerCase();

    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.txt')) return 'txt';
    if (filename.endsWith('.csv')) return 'csv';

    return null;
  }

  /**
   * Import template items from TXT file
   *
   * @param file - TXT file with one item per line
   * @param folder - Folder to import items into
   * @param account - User's Account
   * @returns Import result with statistics
   */
  static async importItemsFromTxtFile(
    file: File,
    folder: InstanceOfSchema<typeof FolderNode>,
    account: InstanceOfSchema<typeof Account>,
  ): Promise<TxtImportResult> {
    // Validate file
    try {
      validateImportFile(file, ['txt'], MAX_FILE_SIZE_MB);
    } catch (error) {
      return {
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        duplicates: [],
      };
    }

    // Read file content
    const content = await readFileAsText(file);

    // Import items
    return importItemsFromText(content, folder, account);
  }

  /**
   * Import template items from CSV file
   *
   * @param file - CSV file with header row
   * @param folder - Folder to import items into
   * @param account - User's Account
   * @returns Import result with statistics
   */
  static async importItemsFromCsvFile(
    file: File,
    folder: InstanceOfSchema<typeof FolderNode>,
    account: InstanceOfSchema<typeof Account>,
  ): Promise<CsvImportResult> {
    // Validate file
    try {
      validateImportFile(file, ['csv'], MAX_FILE_SIZE_MB);
    } catch (error) {
      return {
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        duplicates: [],
      };
    }

    // Read file content
    const content = await readFileAsText(file);

    // Import items
    return importItemsFromCsv(content, folder, account);
  }

  /**
   * Import session from CSV file
   *
   * @param file - CSV file with session data
   * @param folder - Folder to import session into
   * @param account - User's Account
   * @param options - Import options (session name, add missing items)
   * @returns Import result with statistics
   */
  static async importSessionFromCsvFile(
    file: File,
    folder: InstanceOfSchema<typeof FolderNode>,
    account: InstanceOfSchema<typeof Account>,
    options: SessionImportOptions = {},
  ): Promise<SessionImportResult> {
    // Validate file
    try {
      validateImportFile(file, ['csv'], MAX_FILE_SIZE_MB);
    } catch (error) {
      return {
        imported: false,
        matched: 0,
        unmatched: 0,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        unmatchedItems: [],
      };
    }

    // Read file content
    const content = await readFileAsText(file);

    // Import session
    return importSessionFromCsv(content, folder, account, options);
  }

  /**
   * Import TXT/CSV file as a new template folder at root
   *
   * Creates a new template folder with the given name and imports all items into it.
   *
   * @param file - TXT or CSV file with items
   * @param account - User's Account
   * @param templateName - Name for the new template folder
   * @param fileType - File type ('txt' or 'csv')
   * @returns Import result with statistics
   */
  static async importAsNewTemplate(
    file: File,
    account: InstanceOfSchema<typeof Account>,
    templateName: string,
    fileType: 'txt' | 'csv',
  ): Promise<ImportResult> {
    // Validate file
    try {
      validateImportFile(file, [fileType], MAX_FILE_SIZE_MB);
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
        stats: {},
      };
    }

    // Read file content
    const content = await readFileAsText(file);

    // Create new template folder at root
    const { FolderNode } = await import('../../schemas/tree');

    const newFolder = FolderNode.create(
      {
        name: templateName,
        type: 'template-folder',
        path: `/${templateName}`,
        expanded: true,
        archived: false,
        showZoneHeadings: false, // Hide zone headings by default
        items: [],
        sessions: [],
        currentSessionId: '',
        owner: account,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { owner: account },
    );

    // Import items into the new folder
    let importResult: TxtImportResult | CsvImportResult;
    if (fileType === 'txt') {
      importResult = importItemsFromText(content, newFolder, account);
    } else {
      importResult = importItemsFromCsv(content, newFolder, account);
    }

    // Check if import succeeded
    if (importResult.errors.length > 0 && importResult.imported === 0) {
      return createErrorResult(importResult.errors[0]);
    }

    // Add folder to root
    if (!account.root) {
      return createErrorResult('Account root not found');
    }

    account.root.nodes.$jazz.push(newFolder);

    return createSuccessResult(
      {
        foldersCreated: 1,
        itemsAdded: importResult.imported,
        itemsSkipped: importResult.skipped,
      },
      importResult.duplicates.length > 0 ? ['Some duplicate items were skipped'] : [],
    );
  }

  /**
   * Get valid file extensions for a file type
   *
   * @param fileType - File type
   * @returns Array of valid extensions
   */
  private static getValidExtensions(fileType: ImportFileType): string[] {
    switch (fileType) {
      case 'json':
        return ['json'];
      case 'txt':
        return ['txt'];
      case 'csv':
        return ['csv'];
      default:
        return [];
    }
  }
}
