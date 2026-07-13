import { reactiveArrayStore, relational } from '@jbroll/rowboat-schema';
import { describe, expect, it } from 'vitest';
import { schema } from '@/schema/folder';
import {
  addFolder,
  childrenOf,
  deleteNode,
  findById,
  generateUniqueName,
  moveNode,
  renameNode,
  setArchived,
  topLevelFolders,
} from '../folderOps';

function makeGraph() {
  return relational(schema, reactiveArrayStore());
}

let nextId = 0;
function id() {
  nextId += 1;
  return `f${nextId}`;
}

const OWNER_GROUP = 'group-1';
const CREATED_BY = 'user-1';
const NOW = 1_000_000;

describe('folderOps', () => {
  it('addFolder creates a top-level folder', async () => {
    const g = makeGraph();
    const fid = id();
    const row = await addFolder(g, {
      id: fid,
      name: 'Groceries',
      parentId: null,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    expect(row.id).toBe(fid);
    expect(row.parent_id).toBeNull();
    expect(row.name).toBe('Groceries');
    expect(g.folder(fid)?.$data.name).toBe('Groceries');
  });

  it('addFolder creates a child folder with parent_id set', async () => {
    const g = makeGraph();
    const parentId = id();
    await addFolder(g, {
      id: parentId,
      name: 'Parent',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    const childId = id();
    const child = await addFolder(g, {
      id: childId,
      name: 'Child',
      parentId,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    expect(child.parent_id).toBe(parentId);
    expect(childrenOf(g, parentId).map((f) => f.id)).toEqual([childId]);
  });

  it('renameNode updates name and updated_at', async () => {
    const g = makeGraph();
    const fid = id();
    await addFolder(g, {
      id: fid,
      name: 'Old',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    await renameNode(g, fid, 'New', NOW + 1);

    const row = findById(g, fid);
    expect(row?.name).toBe('New');
    expect(row?.updated_at).toBe(NOW + 1);
  });

  it('setArchived toggles the archived flag', async () => {
    const g = makeGraph();
    const fid = id();
    await addFolder(g, {
      id: fid,
      name: 'Archivable',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    await setArchived(g, fid, true, NOW + 1);
    expect(findById(g, fid)?.archived).toBe(true);

    await setArchived(g, fid, false, NOW + 2);
    expect(findById(g, fid)?.archived).toBe(false);
  });

  it('generateUniqueName dedupes against siblings', async () => {
    const g = makeGraph();
    const parentId = id();
    await addFolder(g, {
      id: parentId,
      name: 'Parent',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: id(),
      name: 'List',
      parentId,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: id(),
      name: 'List (2)',
      parentId,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    expect(generateUniqueName(g, 'List', parentId)).toBe('List (3)');
    expect(generateUniqueName(g, 'Fresh', parentId)).toBe('Fresh');
  });

  it('moveNode reparents a node', async () => {
    const g = makeGraph();
    const parentA = id();
    const parentB = id();
    const childId = id();
    await addFolder(g, {
      id: parentA,
      name: 'A',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: parentB,
      name: 'B',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: childId,
      name: 'Child',
      parentId: parentA,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    await moveNode(g, childId, parentB, NOW + 5);

    expect(findById(g, childId)?.parent_id).toBe(parentB);
    expect(findById(g, childId)?.updated_at).toBe(NOW + 5);
    expect(childrenOf(g, parentA)).toEqual([]);
    expect(childrenOf(g, parentB).map((f) => f.id)).toEqual([childId]);
  });

  it('moveNode throws on a cycle (moving a node into its own child)', async () => {
    const g = makeGraph();
    const parentId = id();
    const childId = id();
    await addFolder(g, {
      id: parentId,
      name: 'Parent',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: childId,
      name: 'Child',
      parentId,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    await expect(moveNode(g, parentId, childId, NOW + 1)).rejects.toThrow();
  });

  it('deleteNode removes a node and its subtree', async () => {
    const g = makeGraph();
    const parentId = id();
    const childId = id();
    const grandchildId = id();
    await addFolder(g, {
      id: parentId,
      name: 'Parent',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: childId,
      name: 'Child',
      parentId,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: grandchildId,
      name: 'Grandchild',
      parentId: childId,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    await deleteNode(g, parentId);

    expect(findById(g, parentId)).toBeUndefined();
    expect(findById(g, childId)).toBeUndefined();
    expect(findById(g, grandchildId)).toBeUndefined();
  });

  it('deleteNode hard-errors on a missing node', async () => {
    const g = makeGraph();
    await expect(deleteNode(g, 'nonexistent')).rejects.toThrow();
  });

  it('topLevelFolders / childrenOf read correctly', async () => {
    const g = makeGraph();
    const rootA = id();
    const rootB = id();
    const child = id();
    await addFolder(g, {
      id: rootA,
      name: 'RootA',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: rootB,
      name: 'RootB',
      parentId: null,
      type: 'folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });
    await addFolder(g, {
      id: child,
      name: 'Child',
      parentId: rootA,
      type: 'template-folder',
      ownerGroupId: OWNER_GROUP,
      createdBy: CREATED_BY,
      now: NOW,
    });

    expect(
      topLevelFolders(g)
        .map((f) => f.id)
        .sort(),
    ).toEqual([rootA, rootB].sort());
    expect(childrenOf(g, rootA).map((f) => f.id)).toEqual([child]);
    expect(childrenOf(g, rootB)).toEqual([]);
  });
});
