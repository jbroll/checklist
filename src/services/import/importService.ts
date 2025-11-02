/**
 * Main import service
 *
 * Orchestrates all import operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount } from '../../schemas';
import { isValidFileSize, isValidFileType, readFileAsText } from '../../utils/fileUpload';
import { type CsvImportResult, importItemsFromCsv } from './csvImporter';
import { importJson } from './jsonImporter';
import {
  importSessionFromCsv,
  type SessionImportOptions,
  type SessionImportResult,
} from './sessionImporter';
import { importItemsFromText, type TxtImportResult } from './txtImporter';
import type { ImportFileType, ImportResult } from './types';

// Maximum file size: 10MB
const MAX_FILE_SIZE_MB = 10;

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
   * @param account - User's GroceriesAccount
   * @param fileType - Expected file type (optional, auto-detected from extension)
   * @returns Import result with success/failure info
   */
  static async importFromFile(
    file: File,
    account: InstanceOfSchema<typeof GroceriesAccount>,
    fileType?: ImportFileType,
  ): Promise<ImportResult> {
    // Validate file size
    if (!isValidFileSize(file, MAX_FILE_SIZE_MB)) {
      return {
        success: false,
        errors: [`File size exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB`],
        warnings: [],
        stats: {},
      };
    }

    // Determine file type
    const detectedType = fileType || ImportService.detectFileType(file);
    if (!detectedType) {
      return {
        success: false,
        errors: ['Unable to determine file type. Expected .json, .txt, or .csv'],
        warnings: [],
        stats: {},
      };
    }

    // Validate file extension
    const validExtensions = ImportService.getValidExtensions(detectedType);
    if (!isValidFileType(file, validExtensions)) {
      return {
        success: false,
        errors: [
          `Invalid file type. Expected ${validExtensions.map((ext) => `.${ext}`).join(' or ')}`,
        ],
        warnings: [],
        stats: {},
      };
    }

    // Read file content
    let content: string;
    try {
      content = await readFileAsText(file);
    } catch (error) {
      return {
        success: false,
        errors: [
          `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        warnings: [],
        stats: {},
      };
    }

    // Import based on type
    switch (detectedType) {
      case 'json':
        return await importJson(content, account);

      case 'txt':
        // TODO: Phase 2 - Template list import from TXT
        return {
          success: false,
          errors: ['TXT import not yet implemented'],
          warnings: [],
          stats: {},
        };

      case 'csv':
        // TODO: Phase 2/3 - Template list or session import from CSV
        return {
          success: false,
          errors: ['CSV import not yet implemented'],
          warnings: [],
          stats: {},
        };

      default:
        return {
          success: false,
          errors: [`Unsupported file type: ${detectedType}`],
          warnings: [],
          stats: {},
        };
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
   * @param account - User's GroceriesAccount
   * @returns Import result with statistics
   */
  static async importItemsFromTxtFile(
    file: File,
    folder: InstanceOfSchema<typeof FolderNode>,
    account: InstanceOfSchema<typeof GroceriesAccount>,
  ): Promise<TxtImportResult> {
    // Validate file
    if (!isValidFileSize(file, MAX_FILE_SIZE_MB)) {
      return {
        imported: 0,
        skipped: 0,
        errors: [`File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`],
        duplicates: [],
      };
    }

    if (!isValidFileType(file, ['txt'])) {
      return {
        imported: 0,
        skipped: 0,
        errors: ['Invalid file type. Expected: .txt'],
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
   * @param account - User's GroceriesAccount
   * @returns Import result with statistics
   */
  static async importItemsFromCsvFile(
    file: File,
    folder: InstanceOfSchema<typeof FolderNode>,
    account: InstanceOfSchema<typeof GroceriesAccount>,
  ): Promise<CsvImportResult> {
    // Validate file
    if (!isValidFileSize(file, MAX_FILE_SIZE_MB)) {
      return {
        imported: 0,
        skipped: 0,
        errors: [`File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`],
        duplicates: [],
      };
    }

    if (!isValidFileType(file, ['csv'])) {
      return {
        imported: 0,
        skipped: 0,
        errors: ['Invalid file type. Expected: .csv'],
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
   * @param account - User's GroceriesAccount
   * @param options - Import options (session name, add missing items)
   * @returns Import result with statistics
   */
  static async importSessionFromCsvFile(
    file: File,
    folder: InstanceOfSchema<typeof FolderNode>,
    account: InstanceOfSchema<typeof GroceriesAccount>,
    options: SessionImportOptions = {},
  ): Promise<SessionImportResult> {
    // Validate file
    if (!isValidFileSize(file, MAX_FILE_SIZE_MB)) {
      return {
        imported: false,
        matched: 0,
        unmatched: 0,
        errors: [`File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`],
        unmatchedItems: [],
      };
    }

    if (!isValidFileType(file, ['csv'])) {
      return {
        imported: false,
        matched: 0,
        unmatched: 0,
        errors: ['Invalid file type. Expected: .csv'],
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
   * @param account - User's GroceriesAccount
   * @param templateName - Name for the new template folder
   * @param fileType - File type ('txt' or 'csv')
   * @returns Import result with statistics
   */
  static async importAsNewTemplate(
    file: File,
    account: InstanceOfSchema<typeof GroceriesAccount>,
    templateName: string,
    fileType: 'txt' | 'csv',
  ): Promise<ImportResult> {
    // Validate file
    if (!isValidFileSize(file, MAX_FILE_SIZE_MB)) {
      return {
        success: false,
        errors: [`File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`],
        warnings: [],
        stats: {},
      };
    }

    if (!isValidFileType(file, [fileType])) {
      return {
        success: false,
        errors: [`Invalid file type. Expected: .${fileType}`],
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
      return {
        success: false,
        errors: importResult.errors,
        warnings: [],
        stats: {},
      };
    }

    // Add folder to root
    if (!account.root) {
      return {
        success: false,
        errors: ['Account root not found'],
        warnings: [],
        stats: {},
      };
    }

    account.root.nodes.$jazz.push(newFolder);

    return {
      success: true,
      errors: [],
      warnings: importResult.duplicates.length > 0 ? ['Some duplicate items were skipped'] : [],
      stats: {
        foldersCreated: 1,
        itemsAdded: importResult.imported,
        itemsSkipped: importResult.skipped,
      },
    };
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
