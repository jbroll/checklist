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

import { normalizePathSegment } from './pathUtils';

export interface ParsedItem {
  name: string;
  type: 'category' | 'item';
  path: string;
  level: number;
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
 * Parse indented list text into hierarchical items
 *
 * @param text - Text content with indentation
 * @returns Array of parsed items with paths and types
 */
export function parseIndentedList(text: string): ParsedItem[] {
  // Split into lines
  const lines = text.split(/\r?\n/);

  // Filter and clean lines
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
    return [];
  }

  // Detect indentation config
  const indentConfig = detectIndentation(cleanedLines.map((l) => l.text));

  // Build tree structure
  const tree = buildTree(cleanedLines, indentConfig);

  // Flatten tree to items with paths and types
  return flattenTree(tree);
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

  // Find GCD of all indent sizes to determine base indent
  const gcd = indentSizes.reduce((a, b) => {
    while (b !== 0) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  });

  // Clamp to reasonable values (2, 3, or 4)
  let size = gcd;
  if (size < 2) size = 2;
  if (size > 4) size = 4;

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
    // Generate path
    const segment = normalizePathSegment(node.name);
    const path = parentPath ? `${parentPath}/${segment}` : segment;

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
