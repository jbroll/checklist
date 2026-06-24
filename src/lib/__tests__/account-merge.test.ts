import { Account } from 'jazz-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeMerge, prepareMerge, startMerge } from '../account-merge';

afterEach(() => vi.restoreAllMocks());

describe('merge API helpers', () => {
  it('startMerge posts and returns nonce + targetJazzId', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ nonce: 'n1', targetJazzId: 'co_t' }),
    }) as never;
    const out = await startMerge();
    expect(out).toEqual({ nonce: 'n1', targetJazzId: 'co_t' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/account/merge/start',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('prepareMerge throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'nope' }),
    }) as never;
    await expect(prepareMerge('n1', ['co_f1'])).rejects.toThrow('nope');
  });

  it('finalizeMerge resolves on ok', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) }) as never;
    await expect(finalizeMerge('n1')).resolves.toBeUndefined();
  });
});

import { FolderNode } from '@/schema/tree';
import { adoptFolders, shareTopLevelFoldersTo } from '../account-merge';

it('shareTopLevelFoldersTo adds target to each folder group and returns ids', async () => {
  const addMember = vi.fn();
  const group = {
    members: [],
    addMember,
    removeMember: vi.fn(),
    $jazz: { waitForSync: vi.fn().mockResolvedValue(undefined), loadedAs: {} },
  };
  const mkFolder = (id: string, archived = false) => ({ archived, $jazz: { id, owner: group } });
  const account = {
    root: { folders: [mkFolder('co_f1'), mkFolder('co_f2'), mkFolder('co_f3', true)] },
  } as never;

  vi.spyOn(Account, 'load').mockResolvedValue({ id: 'co_target' } as never);

  const ids = await shareTopLevelFoldersTo(account, 'co_target');
  expect(ids).toEqual(['co_f1', 'co_f2']); // archived folder skipped
  expect(addMember).toHaveBeenCalledTimes(2);
  expect(addMember).toHaveBeenCalledWith(expect.anything(), 'admin');
});

it('adoptFolders loads folders and pushes them into account.root.folders', async () => {
  const push = vi.fn();
  const removeMember = vi.fn();
  const loadedFolder = {
    archived: false,
    $jazz: {
      id: 'co_f1',
      owner: {
        members: [],
        removeMember,
        $jazz: { loadedAs: {} },
      },
    },
  };

  vi.spyOn(FolderNode, 'load').mockResolvedValue(loadedFolder as never);
  vi.spyOn(Account, 'load').mockResolvedValue({ id: 'co_source' } as never);

  const account = {
    root: { folders: { push, some: vi.fn().mockReturnValue(false) } },
  } as never;

  await adoptFolders(account, ['co_f1'], 'co_source_jazz_id');

  expect(FolderNode.load).toHaveBeenCalledWith(
    'co_f1',
    expect.objectContaining({ loadAs: expect.anything() }),
  );
  expect(push).toHaveBeenCalledWith(loadedFolder);
});
