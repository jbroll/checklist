/**
 * File upload utilities
 *
 * Browser-based file upload helpers for importing data.
 */

/**
 * MIME type mapping for supported file extensions
 * Maps extensions to arrays of valid MIME types (browsers may report different types)
 */
const MIME_TYPE_MAP: Record<string, string[]> = {
  json: ['application/json', 'text/json'],
  csv: ['text/csv', 'application/csv', 'text/comma-separated-values'],
  txt: ['text/plain'],
  // Text-based files may have empty or generic MIME types
  // when uploaded via drag-and-drop or certain browsers
};

/**
 * Generic text MIME types that are acceptable for text-based files
 * Browsers sometimes report these for csv/txt/json files
 */
const GENERIC_TEXT_MIME_TYPES = [
  'text/plain',
  'application/octet-stream', // Some browsers use this for unknown types
  '', // Empty MIME type (drag-and-drop edge cases)
];

/**
 * Read a file as text
 *
 * @param file - File object from input or drag-and-drop
 * @returns Promise that resolves to file content as string
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };

    reader.onerror = () => {
      reject(new Error(`File reading error: ${reader.error?.message}`));
    };

    reader.readAsText(file);
  });
}

/**
 * Validate MIME type against expected types for an extension
 *
 * @param mimeType - The file's MIME type
 * @param extension - The expected file extension
 * @returns true if MIME type is valid for the extension
 */
export function isValidMimeType(mimeType: string, extension: string): boolean {
  const normalizedMime = mimeType.toLowerCase().trim();
  const normalizedExt = extension.toLowerCase();

  // Get expected MIME types for this extension
  const expectedMimes = MIME_TYPE_MAP[normalizedExt];

  // If extension is not in our map, only allow generic text types
  if (!expectedMimes) {
    return GENERIC_TEXT_MIME_TYPES.includes(normalizedMime);
  }

  // Check if MIME type matches expected types or generic text types
  // (browsers may report generic types for text files)
  return expectedMimes.includes(normalizedMime) || GENERIC_TEXT_MIME_TYPES.includes(normalizedMime);
}

/**
 * Validate file type by extension and MIME type
 *
 * Performs dual validation:
 * 1. Checks file extension against allowed list
 * 2. Validates MIME type matches expected type for the extension
 *
 * @param file - File object
 * @param allowedExtensions - Array of allowed extensions (e.g., ['json', 'txt', 'csv'])
 * @returns true if file type is allowed
 */
export function isValidFileType(file: File, allowedExtensions: string[]): boolean {
  const fileName = file.name.toLowerCase();

  // Find matching extension
  const matchedExt = allowedExtensions.find((ext) => fileName.endsWith(`.${ext.toLowerCase()}`));

  if (!matchedExt) {
    return false;
  }

  // Validate MIME type matches the extension
  return isValidMimeType(file.type, matchedExt);
}

/**
 * Get file extension
 *
 * @param filename - Filename or path
 * @returns Extension without dot (e.g., 'json', 'txt', 'csv')
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts[parts.length - 1]?.toLowerCase() ?? '') : '';
}

/**
 * Validate file size
 *
 * @param file - File object
 * @param maxSizeInMB - Maximum allowed size in megabytes
 * @returns true if file size is within limit
 */
export function isValidFileSize(file: File, maxSizeInMB: number): boolean {
  const maxBytes = maxSizeInMB * 1024 * 1024;
  return file.size <= maxBytes;
}

/**
 * Format file size for display
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB", "250 KB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
