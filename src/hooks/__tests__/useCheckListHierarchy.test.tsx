/**
 * useCheckListHierarchy — React wrapper over src/services/folderOps.ts (see that file's
 * own unit tests for the operation semantics). This file only covers the wrapper's own
 * concerns: id generation, `mintGroup` injection, and that `folders`/`allFolders` reflect
 * mutations reactively via `useSelect`.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGraph, setActiveGraph } from '@/test/rowboat';
import { useCheckListHierarchy } from '../useCheckListHierarchy';

vi.mock('@/jazz', async () => {
  const { rowboatJazzMock } = await import('@/test/rowboat');
  return rowboatJazzMock();
});

const CREATED_BY = 'user-1';

function mintGroup(): Promise<string> {
  return Promise.resolve('group-fixed');
}

describe('useCheckListHierarchy', () => {
  beforeEach(() => {
    setActiveGraph(makeGraph());
  });

  it('addFolder mints a group, creates a top-level folder, and shows up in folders', async () => {
    const { result } = renderHook(() =>
      useCheckListHierarchy({ createdBy: CREATED_BY, mintGroup }),
    );

    let created: Awaited<ReturnType<typeof result.current.addFolder>> | undefined;
    await act(async () => {
      created = await result.current.addFolder('Groceries', null, 'template-folder');
    });

    expect(created?.name).toBe('Groceries');
    expect(created?.owner_group_id).toBe('group-fixed');
    expect(created?.created_by).toBe(CREATED_BY);
    expect(result.current.folders.map((f) => f.id)).toContain(created?.id);
  });

  it('addFolder without mintGroup configured is a hard error', async () => {
    const { result } = renderHook(() => useCheckListHierarchy({ createdBy: CREATED_BY }));

    await expect(result.current.addFolder('No Group', null, 'folder')).rejects.toThrow(/mintGroup/);
  });

  it('renameNode reflects in folders', async () => {
    const { result } = renderHook(() =>
      useCheckListHierarchy({ createdBy: CREATED_BY, mintGroup }),
    );

    let id = '';
    await act(async () => {
      id = (await result.current.addFolder('Old Name', null, 'folder')).id;
    });

    await act(async () => {
      await result.current.renameNode(id, 'New Name');
    });

    expect(result.current.findById(id)?.name).toBe('New Name');
    expect(result.current.folders.find((f) => f.id === id)?.name).toBe('New Name');
  });

  it('moveNode reparents and childrenOf reflects the move', async () => {
    const { result } = renderHook(() =>
      useCheckListHierarchy({ createdBy: CREATED_BY, mintGroup }),
    );

    let parentA = '';
    let parentB = '';
    let childId = '';
    await act(async () => {
      parentA = (await result.current.addFolder('A', null, 'folder')).id;
      parentB = (await result.current.addFolder('B', null, 'folder')).id;
      childId = (await result.current.addFolder('Child', parentA, 'template-folder')).id;
    });

    await act(async () => {
      await result.current.moveNode(childId, parentB);
    });

    expect(result.current.findById(childId)?.parent_id).toBe(parentB);
    expect(result.current.childrenOf(parentA)).toEqual([]);
    expect(result.current.childrenOf(parentB).map((f) => f.id)).toEqual([childId]);
  });

  it('deleteNode removes the folder from folders', async () => {
    const { result } = renderHook(() =>
      useCheckListHierarchy({ createdBy: CREATED_BY, mintGroup }),
    );

    let id = '';
    await act(async () => {
      id = (await result.current.addFolder('Gone', null, 'folder')).id;
    });
    expect(result.current.folders.map((f) => f.id)).toContain(id);

    await act(async () => {
      await result.current.deleteNode(id);
    });

    expect(result.current.folders.map((f) => f.id)).not.toContain(id);
    expect(result.current.findById(id)).toBeUndefined();
  });

  it('archiveNode/unarchiveNode toggle archived and folders honors showArchived', async () => {
    const { result, rerender } = renderHook(
      ({ showArchived }: { showArchived: boolean }) =>
        useCheckListHierarchy({ createdBy: CREATED_BY, mintGroup, showArchived }),
      { initialProps: { showArchived: false } },
    );

    let id = '';
    await act(async () => {
      id = (await result.current.addFolder('Archivable', null, 'folder')).id;
    });

    await act(async () => {
      await result.current.archiveNode(id);
    });

    expect(result.current.findById(id)?.archived).toBe(true);
    expect(result.current.folders.map((f) => f.id)).not.toContain(id);

    rerender({ showArchived: true });
    expect(result.current.folders.map((f) => f.id)).toContain(id);

    await act(async () => {
      await result.current.unarchiveNode(id);
    });
    expect(result.current.findById(id)?.archived).toBe(false);
  });

  it('folders reflects a mutation that lands in the same millisecond as create (updated_at collision)', async () => {
    // Pin the clock so addFolder and archiveNode stamp an identical updated_at.
    // The reactive snapshot equality must still detect the archived change — this
    // is what makes the rename/archive tests above flaky when the ms happens to
    // not tick over between the two mutations.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const { result } = renderHook(() =>
        useCheckListHierarchy({ createdBy: CREATED_BY, mintGroup }),
      );

      let id = '';
      await act(async () => {
        id = (await result.current.addFolder('Same MS', null, 'folder')).id;
      });
      await act(async () => {
        await result.current.archiveNode(id);
      });

      expect(result.current.findById(id)?.archived).toBe(true);
      expect(result.current.folders.map((f) => f.id)).not.toContain(id);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
