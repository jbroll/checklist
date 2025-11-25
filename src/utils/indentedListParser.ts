/**
 * Indented List Parser
 *
 * Parses hierarchical text format with indentation (tabs or spaces).
 * Auto-detects indent type and size.
 *
 * Format:
 * - Blank lines are ignored
 * - Lines starting with # are comments (ignored)
 * - Indentation creates hierarchy
 * - Items with children become categories
 * - Leaf items become items
 *
 * Example:
 * ```
 * # My List
 * Category1
 * Category2
 *   SubCategory
 *     Item1
 *     Item2
 * Category3
 *   Item3
 * ```
 */

import { PATH_SEPARATOR } from './pathUtils';

/**
 * Metadata extracted from comment headers
 *
 * Format: # key: value
 * Example:
 *   # name: My Grocery List
 *   # description: Weekly shopping template
 */
export interface ListMetadata {
  name?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface ParsedItem {
  name: string;
  type: 'category' | 'item';
  path: string;
  level: number;
}

export interface ParsedList {
  metadata: ListMetadata;
  items: ParsedItem[];
}

interface TreeNode {
  name: string;
  level: number;
  children: TreeNode[];
  path: string;
}

interface IndentConfig {
  type: 'tabs' | 'spaces';
  size: number; // For spaces: 2, 3, or 4
}

/**
 * Parse metadata from comment lines
 *
 * Extracts key-value pairs from comments in the format: # key: value
 *
 * @param lines - All lines from the text
 * @returns Metadata object with extracted key-value pairs
 */
function parseMetadata(lines: string[]): ListMetadata {
  const metadata: ListMetadata = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // Only process comment lines
    if (!trimmed.startsWith('#')) continue;

    // Remove the # and trim
    const content = trimmed.slice(1).trim();

    // Look for key: value pattern
    const colonIndex = content.indexOf(':');
    if (colonIndex > 0) {
      const key = content.slice(0, colonIndex).trim().toLowerCase();
      const value = content.slice(colonIndex + 1).trim();

      if (key && value) {
        metadata[key] = value;
      }
    }
  }

  return metadata;
}

/**
 * Parse indented list text into hierarchical items with metadata
 *
 * @param text - Text content with indentation
 * @returns Parsed list with metadata and items
 */
export function parseIndentedListWithMetadata(text: string): ParsedList {
  const lines = text.split(/\r?\n/);

  // Extract metadata from comments
  const metadata = parseMetadata(lines);

  // Filter and clean lines for items
  const cleanedLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      const trimmed = line.trim();
      // Skip blank lines and comments
      return trimmed.length > 0 && !trimmed.startsWith('#');
    })
    .map(({ line, index }) => ({
      text: line.trimEnd(), // Keep leading whitespace, trim trailing
      lineNumber: index + 1,
    }));

  if (cleanedLines.length === 0) {
    return { metadata, items: [] };
  }

  // Detect indentation config
  const indentConfig = detectIndentation(cleanedLines.map((l) => l.text));

  // Build tree structure
  const tree = buildTree(cleanedLines, indentConfig);

  // Flatten tree to items with paths and types
  return { metadata, items: flattenTree(tree) };
}

/**
 * Parse indented list text into hierarchical items
 *
 * @param text - Text content with indentation
 * @returns Array of parsed items with paths and types
 */
export function parseIndentedList(text: string): ParsedItem[] {
  return parseIndentedListWithMetadata(text).items;
}

/**
 * Detect indentation type (tabs or spaces) and size
 *
 * @param lines - Array of lines (with leading whitespace preserved)
 * @returns Indent configuration
 */
function detectIndentation(lines: string[]): IndentConfig {
  // Find lines with indentation
  const indentedLines = lines.filter((line) => /^[\t ]/.test(line));

  if (indentedLines.length === 0) {
    // No indentation found, default to 2 spaces
    return { type: 'spaces', size: 2 };
  }

  // Check if tabs are used
  const hasTab = indentedLines.some((line) => line.startsWith('\t'));

  if (hasTab) {
    return { type: 'tabs', size: 1 };
  }

  // Detect space indent size by finding smallest non-zero indent
  const indentSizes = indentedLines
    .map((line) => {
      const match = line.match(/^( +)/);
      return match ? match[1].length : 0;
    })
    .filter((size) => size > 0);

  if (indentSizes.length === 0) {
    return { type: 'spaces', size: 2 };
  }

  // Use the minimum indent as the base unit - any amount of leading space counts
  const size = Math.min(...indentSizes);

  return { type: 'spaces', size };
}

/**
 * Calculate indentation level for a line
 *
 * @param line - Line with leading whitespace
 * @param config - Indent configuration
 * @returns Indentation level (0 = root)
 */
function getIndentLevel(line: string, config: IndentConfig): number {
  if (config.type === 'tabs') {
    // Count leading tabs (convert spaces to tabs for mixed indent)
    const normalized = line.replace(/^( {2,4})/g, (match) =>
      '\t'.repeat(Math.floor(match.length / 4)),
    );
    const match = normalized.match(/^(\t*)/);
    return match ? match[1].length : 0;
  }

  // Count leading spaces
  const match = line.match(/^( *)/);
  const spaceCount = match ? match[1].length : 0;
  return Math.floor(spaceCount / config.size);
}

/**
 * Build tree structure from lines
 *
 * @param lines - Array of cleaned lines with line numbers
 * @param config - Indent configuration
 * @returns Tree nodes
 */
function buildTree(
  lines: { text: string; lineNumber: number }[],
  config: IndentConfig,
): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: TreeNode[] = [];

  for (const { text } of lines) {
    const level = getIndentLevel(text, config);
    const name = text.trim();

    if (name.length === 0) continue;

    const node: TreeNode = {
      name,
      level,
      children: [],
      path: '', // Will be set later
    };

    // Pop stack until we find the parent level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    // Add to parent or root
    if (stack.length === 0) {
      root.push(node);
    } else {
      const parent = stack[stack.length - 1];
      parent.children.push(node);
    }

    stack.push(node);
  }

  return root;
}

/**
 * Flatten tree to items with paths and types
 *
 * @param nodes - Tree nodes
 * @param parentPath - Parent path (for recursion)
 * @returns Array of parsed items
 */
function flattenTree(nodes: TreeNode[], parentPath = ''): ParsedItem[] {
  const items: ParsedItem[] = [];

  for (const node of nodes) {
    // Generate path - use name as-is without normalization
    const path = parentPath ? `${parentPath}${PATH_SEPARATOR}${node.name}` : node.name;

    // Determine type: category if has children, item if leaf
    const type = node.children.length > 0 ? 'category' : 'item';

    items.push({
      name: node.name,
      type,
      path,
      level: node.level,
    });

    // Recurse for children
    if (node.children.length > 0) {
      items.push(...flattenTree(node.children, path));
    }
  }

  return items;
}

/**
 * Check if text content appears to be indented format
 *
 * @param text - Text content
 * @returns True if content has indentation
 */
export function isIndentedFormat(text: string): boolean {
  const lines = text.split(/\r?\n/);

  // Look for lines with leading whitespace (tabs or spaces)
  const hasIndentation = lines.some((line) => {
    const trimmed = line.trim();
    // Skip blank lines and comments
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      return false;
    }
    // Check if line has leading whitespace
    return /^[\t ]/.test(line);
  });

  return hasIndentation;
}
