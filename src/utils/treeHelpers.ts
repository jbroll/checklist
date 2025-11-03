import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode } from '@/schemas';
import { getParentPath } from './pathUtils';

export interface TreeNode {
  node: InstanceOfSchema<typeof FolderNode>;
  children: TreeNode[];
}

/**
 * Build hierarchical tree structure from flat path-based list of nodes
 * Simple: group by parent path and build recursively
 */
export function buildTreeStructure(
  allNodes: readonly (InstanceOfSchema<typeof FolderNode> | null)[],
): TreeNode[] {
  // Filter out null/undefined and archived nodes
  const validNodes = allNodes.filter((node) => node?.name && node.path && !node.archived);

  // Group by parent path to create hierarchy
  const nodesByParent = new Map<string | undefined, InstanceOfSchema<typeof FolderNode>[]>();

  validNodes.forEach((node) => {
    if (!node) return;
    const parentKey = getParentPath(node.path);

    if (!nodesByParent.has(parentKey)) {
      nodesByParent.set(parentKey, []);
    }
    nodesByParent.get(parentKey)?.push(node);
  });

  // Build recursive structure
  const buildChildren = (parentPath: string | undefined): TreeNode[] => {
    const children = nodesByParent.get(parentPath) || [];
    return children
      .filter((node) => node?.name)
      .map((node) => ({
        node,
        // Only folders can have children, templates are leaf nodes
        children: node.type === 'folder' ? buildChildren(node.path) : [],
      }));
  };

  return buildChildren(undefined); // Start with root nodes (no parent path)
}
