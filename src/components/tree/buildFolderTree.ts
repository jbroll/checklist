import type { FolderRow } from '@/schema/folder';
import type { TreeNode } from './treeTypes';

/** Build the hierarchical tree from a flat `FolderRow[]` (reactive selector output). */
export function buildFolderTree(folders: FolderRow[], showArchived: boolean): TreeNode[] {
  const byParent = new Map<string | null, FolderRow[]>();
  for (const folder of folders) {
    if (!showArchived && folder.archived) continue;
    const key = folder.parent_id;
    const siblings = byParent.get(key) ?? [];
    siblings.push(folder);
    byParent.set(key, siblings);
  }

  function build(parentId: string | null, level: number): TreeNode[] {
    const siblings = byParent.get(parentId) ?? [];
    return siblings
      .slice()
      .sort((a, b) => a.created_at - b.created_at)
      .map((folder) => ({
        folder,
        children: build(folder.id, level + 1),
        level,
      }));
  }

  return build(null, 0);
}
