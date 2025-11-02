/**
 * CSV Parser Utility
 *
 * Simple CSV parser for importing data.
 * Handles quoted fields and escaped quotes.
 */

/**
 * Parse a CSV row into fields
 *
 * Handles:
 * - Quoted fields: "value"
 * - Escaped quotes: "value with ""quotes"""
 * - Commas within quoted fields: "value, with, commas"
 *
 * @param row - CSV row string
 * @returns Array of field values
 */
function parseRow(row: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < row.length) {
    const char = row[i];
    const nextChar = row[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote within quoted field
        currentField += '"';
        i += 2;
        continue;
      }
      // Toggle quote state
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    // Regular character
    currentField += char;
    i++;
  }

  // Add final field
  fields.push(currentField.trim());

  return fields;
}

/**
 * Parse CSV string into array of objects
 *
 * First row is treated as header with column names.
 * Subsequent rows are data.
 *
 * @param csvString - CSV content
 * @returns Array of objects with column names as keys
 */
export function parseCsv(csvString: string): Record<string, string>[] {
  const lines = csvString
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  // Parse header row
  const headers = parseRow(lines[0]);

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseRow(lines[i]);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = fields[j] || '';
      if (header) {
        row[header] = value;
      }
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Parse plain text list (one item per line)
 *
 * @param textString - Plain text content
 * @returns Array of non-empty lines
 */
export function parseTextList(textString: string): string[] {
  return textString
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
