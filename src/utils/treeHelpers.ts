import type { InstanceOfSchema } from 'jazz-tools';
import type { Template } from '@/schemas';
import type { DerivedFolder } from '@/services/templateService';

export interface TreeNode {
  folder: DerivedFolder;
  children: TreeNode[];
}

/**
 * Build hierarchical tree structure from derived folders
 * Converts DerivedFolder[] to TreeNode[] for compatibility
 */
export function buildTreeStructure(
  derivedFolders: DerivedFolder[],
): TreeNode[] {
  return derivedFolders.map((folder) => ({
    folder,
    children: buildTreeStructure(folder.children),
  }));
}

/**
 * Build tree structure from flat template list (legacy support)
 * For new code, use templateService.buildFolderTree() instead
 */
export function buildTreeFromTemplates(
  templates: readonly (InstanceOfSchema<typeof Template> | null)[],
  folderExpanded: Record<string, boolean> = {},
): TreeNode[] {
  const validTemplates = templates.filter(
    (t): t is InstanceOfSchema<typeof Template> =>
      t != null && !!t.name && !!t.path && !t.archived,
  );

  // Extract all unique folder paths
  const folderPaths = new Set<string>();
  for (const template of validTemplates) {
    const parts = template.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join('/'));
    }
  }

  // Build folder map
  const folderMap = new Map<string, DerivedFolder>();
  for (const path of folderPaths) {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    folderMap.set(path, {
      path,
      name,
      expanded: folderExpanded[path] ?? true,
      children: [],
      templates: [],
    });
  }

  // Build hierarchy
  const rootFolders: DerivedFolder[] = [];
  for (const [path, folder] of folderMap) {
    const parts = path.split('/');
    if (parts.length === 1) {
      rootFolders.push(folder);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = folderMap.get(parentPath);
      if (parent) {
        parent.children.push(folder);
      }
    }
  }

  // Add templates to folders
  for (const template of validTemplates) {
    const parts = template.path.split('/');
    if (parts.length > 1) {
      const folderPath = parts.slice(0, -1).join('/');
      const folder = folderMap.get(folderPath);
      if (folder) {
        folder.templates.push(template);
      }
    }
  }

  return buildTreeStructure(rootFolders);
}
