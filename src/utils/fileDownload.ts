/**
 * File download utilities
 *
 * Browser-based file download helpers for exporting data.
 */

/**
 * Download a file to the user's device
 *
 * Creates a blob from the content and triggers a browser download.
 *
 * @param content - File content as string
 * @param filename - Suggested filename
 * @param mimeType - MIME type (e.g., 'application/json', 'text/plain')
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  // Create blob from content
  const blob = new Blob([content], { type: mimeType });

  // Create object URL
  const url = URL.createObjectURL(blob);

  // Create temporary link element
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL
  URL.revokeObjectURL(url);
}

/**
 * Download JSON data
 *
 * @param data - Data to export (will be stringified)
 * @param filename - Suggested filename (should end with .json)
 */
export function downloadJson(data: unknown, filename: string): void {
  const content = JSON.stringify(data, null, 2);
  downloadFile(content, filename, 'application/json');
}

/**
 * Download plain text
 *
 * @param content - Text content
 * @param filename - Suggested filename (should end with .txt)
 */
export function downloadText(content: string, filename: string): void {
  downloadFile(content, filename, 'text/plain');
}

/**
 * Download CSV data
 *
 * @param content - CSV content
 * @param filename - Suggested filename (should end with .csv)
 */
export function downloadCsv(content: string, filename: string): void {
  downloadFile(content, filename, 'text/csv');
}
