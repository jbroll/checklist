import type { InstanceOfSchema } from 'jazz-tools';
import type { DirectoryEntry, Template } from '@/schemas';

/**
 * TreeNode representing a directory entry with its children
 */
export interface TreeNode {
  entry: DirectoryEntry;
  template?: InstanceOfSchema<typeof Template>; // Only for template-ref entries
  children: TreeNode[];
}

/**
 * Build hierarchical tree structure from directory entries
 *
 * @param directory - Flat array of directory entries
 * @param templates - Array of templates (for looking up template data)
 * @returns Hierarchical tree of TreeNodes
 */
export function buildTreeFromDirectory(
  directory: DirectoryEntry[],
  templates: readonly (InstanceOfSchema<typeof Template> | null)[],
): TreeNode[] {
  // Filter out archived entries
  const activeEntries = directory.filter((entry) => !entry.archived);

  // Build a map of entries by path for quick lookup
  const entryMap = new Map<string, DirectoryEntry>();
  for (const entry of activeEntries) {
    entryMap.set(entry.path, entry);
  }

  // Build a map of templates by ID for quick lookup
  const templateMap = new Map<string, InstanceOfSchema<typeof Template>>();
  for (const template of templates) {
    if (template?.$jazz?.id) {
      templateMap.set(template.$jazz.id, template);
    }
  }

  // Build tree structure
  const rootNodes: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Create nodes for all entries
  for (const entry of activeEntries) {
    const node: TreeNode = {
      entry,
      template:
        entry.type === 'template-ref' && entry.templateId
          ? templateMap.get(entry.templateId)
          : undefined,
      children: [],
    };
    nodeMap.set(entry.path, node);
  }

  // Build parent-child relationships
  for (const entry of activeEntries) {
    const node = nodeMap.get(entry.path);
    if (!node) continue;

    const parts = entry.path.split('/');
    if (parts.length === 1) {
      // Root level entry
      rootNodes.push(node);
    } else {
      // Child entry - find parent
      const parentPath = parts.slice(0, -1).join('/');
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Parent doesn't exist - treat as root
        rootNodes.push(node);
      }
    }
  }

  return rootNodes;
}

/**
 * Legacy support: Build tree from templates (deprecated)
 * This is kept for backward compatibility but should not be used in new code.
 * Use buildTreeFromDirectory instead.
 *
 * @deprecated Use buildTreeFromDirectory with directory entries instead
 */
export function buildTreeFromTemplates(
  _templates: readonly (InstanceOfSchema<typeof Template> | null)[],
  _folderExpanded: Record<string, boolean> = {},
): TreeNode[] {
  // This function is deprecated and should not be used
  // Return empty array as a placeholder
  console.warn('buildTreeFromTemplates is deprecated. Use buildTreeFromDirectory instead.');
  return [];
}
