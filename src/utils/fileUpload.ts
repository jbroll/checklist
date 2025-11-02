/**
 * File upload utilities
 *
 * Browser-based file upload helpers for importing data.
 */

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
 * Validate file type by extension
 *
 * @param file - File object
 * @param allowedExtensions - Array of allowed extensions (e.g., ['json', 'txt', 'csv'])
 * @returns true if file type is allowed
 */
export function isValidFileType(file: File, allowedExtensions: string[]): boolean {
  const fileName = file.name.toLowerCase();
  return allowedExtensions.some((ext) => fileName.endsWith(`.${ext}`));
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
