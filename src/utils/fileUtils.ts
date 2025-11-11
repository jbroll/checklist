/**
 * File utility functions
 *
 * Helpers for file operations including export filename generation.
 */

/**
 * Builds a sanitized filename for export operations
 *
 * @param baseName - Base name for the file (will be sanitized)
 * @param format - File extension (json, csv, txt)
 * @param includeTimestamp - Whether to include YYYY-MM-DD timestamp (default: true)
 * @param prefix - Optional prefix before the base name
 * @returns Sanitized filename with format extension
 *
 * @example
 * buildExportFilename("My List", "json")
 * // Returns: "my-list-2025-01-15.json"
 *
 * @example
 * buildExportFilename("Shopping List", "csv", true, "session")
 * // Returns: "session-shopping-list-2025-01-15.csv"
 */
export function buildExportFilename(
  baseName: string,
  format: 'json' | 'csv' | 'txt',
  includeTimestamp = true,
  prefix?: string,
): string {
  // Sanitize base name (lowercase, replace non-alphanumeric with hyphens)
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Build filename parts
  const parts: string[] = [];

  if (prefix) {
    parts.push(prefix);
  }

  parts.push(sanitized);

  if (includeTimestamp) {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    parts.push(timestamp);
  }

  return `${parts.join('-')}.${format}`;
}
