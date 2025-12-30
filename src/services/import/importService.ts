/**
 * Main import service
 *
 * Orchestrates all import operations (JSON, TXT, CSV).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode } from '../../schemas';
import { readFileAsText } from '../../utils/fileUpload';
import * as folderService from '../folderService';
import { type CsvImportResult, importItemsFromCsv } from './csvImporter';
import { MAX_FILE_SIZE_MB, validateImportFile } from './importValidator';
import { importItemsFromJson, importJson } from './jsonImporter';
import { createErrorResult, createSuccessResult } from './resultHelpers';
import {
  importSessionFromCsv,
  type SessionImportOptions,
  type SessionImportResult,
} from './sessionImporter';
import { importItemsFromText, parseTextMetadata, type TxtImportResult } from './txtImporter';
import type { ImportFileType, ImportResult } from './types';

/**
 * Result of validating and reading a file
 */
type FileReadResult = { success: true; content: string } | { success: false; error: string };

/**
 * Validate and read a file, returning content or error
 *
 * @param file - File to validate and read
 * @param extensions - Valid file extensions
 * @returns Content string or error message
 */
async function validateAndReadFile(file: File, extensions: string[]): Promise<FileReadResult> {
  try {
    validateImportFile(file, extensions, MAX_FILE_SIZE_MB);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }

  try {
    const content = await readFileAsText(file);
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Detect file type from filename
 *
 * @param file - File object
 * @returns Detected file type or null
 */
function detectFileType(file: File): ImportFileType | null {
  const filename = file.name.toLowerCase();

  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.txt')) return 'txt';
  if (filename.endsWith('.csv')) return 'csv';

  return null;
}

/**
 * Get valid file extensions for a file type
 *
 * @param fileType - File type
 * @returns Array of valid extensions
 */
function getValidExtensions(fileType: ImportFileType): string[] {
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

/**
 * Import data from a file
 *
 * @param file - File object from input or drag-and-drop
 * @param account - User's Account
 * @param fileType - Expected file type (optional, auto-detected from extension)
 * @param parentFolder - Optional parent folder for JSON imports
 * @returns Import result with success/failure info
 */
export async function importFromFile(
  file: File,
  account: InstanceOfSchema<typeof Account>,
  fileType?: ImportFileType,
  parentFolder?: InstanceOfSchema<typeof FolderNode>,
): Promise<ImportResult> {
  // Determine file type
  const detectedType = fileType || detectFileType(file);
  if (!detectedType) {
    return createErrorResult('Unable to determine file type. Expected .json, .txt, or .csv');
  }

  // Validate file
  const validExtensions = getValidExtensions(detectedType);
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
      return await importJson(content, account, parentFolder);

    case 'txt':
      // TXT imports handled by importItemsFromTxtFile() or importAsNewTemplate()
      return createErrorResult('Use importAsNewTemplate() for TXT files');

    case 'csv':
      // CSV imports handled by importItemsFromCsvFile() or importAsNewTemplate()
      return createErrorResult('Use importAsNewTemplate() for CSV files');

    default:
      return createErrorResult(`Unsupported file type: ${detectedType}`);
  }
}

/**
 * Import template items from TXT file
 *
 * @param file - TXT file with one item per line
 * @param template - FolderNode to import items into
 * @param account - User's Account
 * @returns Import result with statistics
 */
export async function importItemsFromTxtFile(
  file: File,
  template: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): Promise<TxtImportResult> {
  const result = await validateAndReadFile(file, ['txt']);
  if (!result.success) {
    return { imported: 0, skipped: 0, errors: [result.error], duplicates: [], metadata: {} };
  }
  return importItemsFromText(result.content, template, account);
}

/**
 * Import template items from JSON file
 *
 * Accepts multiple JSON formats:
 * - Full export (ExportedData) - extracts items from all folders
 * - Single folder (ExportedFolder) - extracts items directly
 * - Items array (ExportedTemplateItem[]) - uses items directly
 *
 * @param file - JSON file with items
 * @param template - FolderNode to import items into
 * @param account - User's Account
 * @returns Import result with statistics
 */
export async function importItemsFromJsonFile(
  file: File,
  template: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): Promise<CsvImportResult> {
  const result = await validateAndReadFile(file, ['json']);
  if (!result.success) {
    return { imported: 0, skipped: 0, errors: [result.error], duplicates: [] };
  }
  return importItemsFromJson(result.content, template, account);
}

/**
 * Import template items from CSV file
 *
 * @param file - CSV file with header row
 * @param template - FolderNode to import items into
 * @param account - User's Account
 * @returns Import result with statistics
 */
export async function importItemsFromCsvFile(
  file: File,
  template: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
): Promise<CsvImportResult> {
  const result = await validateAndReadFile(file, ['csv']);
  if (!result.success) {
    return { imported: 0, skipped: 0, errors: [result.error], duplicates: [] };
  }
  return importItemsFromCsv(result.content, template, account);
}

/**
 * Import session from CSV file
 *
 * @param file - CSV file with session data
 * @param template - FolderNode to import session into
 * @param account - User's Account
 * @param options - Import options (session name, add missing items)
 * @returns Import result with statistics
 */
export async function importSessionFromCsvFile(
  file: File,
  template: InstanceOfSchema<typeof FolderNode>,
  account: InstanceOfSchema<typeof Account>,
  options: SessionImportOptions = {},
): Promise<SessionImportResult> {
  const result = await validateAndReadFile(file, ['csv']);
  if (!result.success) {
    return {
      imported: false,
      matched: 0,
      unmatched: 0,
      errors: [result.error],
      unmatchedItems: [],
    };
  }
  return importSessionFromCsv(result.content, template, account, options);
}

/**
 * Import TXT/CSV file as a new template
 *
 * Creates a new template with the given name and imports all items into it.
 * For TXT files, if the file contains a `# name:` metadata comment, it will
 * be used as the template name (unless overridden by templateName parameter).
 *
 * @param file - TXT or CSV file with items
 * @param account - User's Account
 * @param templateName - Name for the new template folder (optional for TXT files with metadata)
 * @param fileType - File type ('txt' or 'csv')
 * @param parentFolder - Optional parent folder (if not provided, creates at root)
 * @returns Import result with statistics
 */
export async function importAsNewTemplate(
  file: File,
  account: InstanceOfSchema<typeof Account>,
  templateName: string | undefined,
  fileType: 'txt' | 'csv',
  parentFolder?: InstanceOfSchema<typeof FolderNode>,
): Promise<ImportResult> {
  const result = await validateAndReadFile(file, [fileType]);
  if (!result.success) {
    return { success: false, errors: [result.error], warnings: [], stats: {} };
  }
  const content = result.content;

  // Determine the template name
  let finalTemplateName = templateName;

  // For TXT files, check for metadata name if no explicit name provided
  if (fileType === 'txt' && !finalTemplateName) {
    const metadata = parseTextMetadata(content);
    if (metadata.name) {
      finalTemplateName = metadata.name;
    }
  }

  // Fall back to filename without extension if still no name
  if (!finalTemplateName) {
    finalTemplateName = file.name.replace(/\.(txt|csv)$/i, '');
  }

  // Create new template using folderService
  const newTemplate = folderService.createFolder(account, finalTemplateName, true, parentFolder);

  if (!newTemplate) {
    return createErrorResult('Failed to create template');
  }

  // Import items into the new template
  let importResult: TxtImportResult | CsvImportResult;
  if (fileType === 'txt') {
    importResult = importItemsFromText(content, newTemplate, account);
  } else {
    importResult = importItemsFromCsv(content, newTemplate, account);
  }

  // Check if import succeeded
  if (importResult.errors.length > 0 && importResult.imported === 0) {
    return createErrorResult(importResult.errors[0]);
  }

  return createSuccessResult(
    {
      foldersCreated: 1,
      itemsAdded: importResult.imported,
      itemsSkipped: importResult.skipped,
    },
    importResult.duplicates.length > 0 ? ['Some duplicate items were skipped'] : [],
  );
}
