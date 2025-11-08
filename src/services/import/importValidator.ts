/**
 * Import file validation utilities
 *
 * Provides centralized file validation logic for import operations.
 */

import { isValidFileSize, isValidFileType } from '../../utils/fileUpload';

/** Maximum file size for imports: 10MB */
export const MAX_FILE_SIZE_MB = 10;

/**
 * Validates an import file for size and type constraints
 *
 * @param file - File to validate
 * @param expectedTypes - Array of expected file extensions (e.g., ['txt'], ['csv', 'txt'])
 * @param maxSizeMB - Maximum file size in MB (defaults to MAX_FILE_SIZE_MB)
 * @throws Error if validation fails
 */
export function validateImportFile(
  file: File,
  expectedTypes: string[],
  maxSizeMB: number = MAX_FILE_SIZE_MB,
): void {
  // Validate file size
  if (!isValidFileSize(file, maxSizeMB)) {
    throw new Error(`File too large. Maximum size: ${maxSizeMB}MB`);
  }

  // Validate file type
  if (!isValidFileType(file, expectedTypes)) {
    const extensions = expectedTypes.map((ext) => `.${ext}`).join(' or ');
    throw new Error(`Invalid file type. Expected: ${extensions}`);
  }
}
