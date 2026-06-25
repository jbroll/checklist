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

it('shareTopLevelFoldersTo grants agent admin on each group-owned folder and returns ids', async () => {
  const addMember = vi.fn();
  const group = {
    // group.members is an array — signals this is a group-owned folder
    members: [],
    addMember,
    removeMember: vi.fn(),
    $jazz: { waitForSync: vi.fn().mockResolvedValue(undefined), loadedAs: {} },
  };
  const mkRef = (id: string, archived = false) => ({ archived, $jazz: { id } });
  const account = {
    $jazz: { ensureLoaded: vi.fn().mockResolvedValue(undefined) },
    root: { folders: [mkRef('co_f1'), mkRef('co_f2'), mkRef('co_f3', true)] },
  } as never;

  // Mock the agent-id fetch (GET /api/account/merge/agent)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ agentAccountId: 'co_agent' }),
  }) as never;

  // shareTopLevelFoldersTo re-loads each folder fresh so its owner Group is usable.
  vi.spyOn(FolderNode, 'load').mockImplementation(
    async (id: never) => ({ archived: false, $jazz: { id, owner: group } }) as never,
  );
  // Account.load is called to load the AGENT account (not the target directly).
  vi.spyOn(Account, 'load').mockResolvedValue({ id: 'co_agent' } as never);

  const ids = await shareTopLevelFoldersTo(account, 'co_target');
  expect(ids).toEqual(['co_f1', 'co_f2']); // archived folder skipped
  // The AGENT (not the target) is added as admin to each group-owned folder
  expect(addMember).toHaveBeenCalledTimes(2);
  expect(addMember).toHaveBeenCalledWith(expect.anything(), 'admin');
});

it('shareTopLevelFoldersTo skips account-owned folders (no members array)', async () => {
  const addMember = vi.fn();
  // account-owned: owner has no `members` array
  const accountOwner = {
    $jazz: { waitForSync: vi.fn().mockResolvedValue(undefined), loadedAs: {} },
  };
  const groupOwner = {
    members: [],
    addMember,
    $jazz: { waitForSync: vi.fn().mockResolvedValue(undefined), loadedAs: {} },
  };
  const mkRef = (id: string) => ({ archived: false, $jazz: { id } });
  const account = {
    $jazz: { ensureLoaded: vi.fn().mockResolvedValue(undefined) },
    root: { folders: [mkRef('co_acct_owned'), mkRef('co_group_owned')] },
  } as never;

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ agentAccountId: 'co_agent' }),
  }) as never;

  vi.spyOn(FolderNode, 'load').mockImplementation(async (id: never) => {
    // co_acct_owned has an account-owner (no members array)
    const owner = id === 'co_acct_owned' ? accountOwner : groupOwner;
    return { archived: false, $jazz: { id, owner } } as never;
  });
  vi.spyOn(Account, 'load').mockResolvedValue({ id: 'co_agent' } as never);

  const ids = await shareTopLevelFoldersTo(account, 'co_target');
  // Only group-owned folder should be returned
  expect(ids).toEqual(['co_group_owned']);
  expect(addMember).toHaveBeenCalledTimes(1);
});

it('shareTopLevelFoldersTo returns empty list when no agent configured', async () => {
  const account = {
    $jazz: { ensureLoaded: vi.fn().mockResolvedValue(undefined) },
    root: { folders: [] },
  } as never;

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ agentAccountId: null }),
  }) as never;

  const ids = await shareTopLevelFoldersTo(account, 'co_target');
  expect(ids).toEqual([]);
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
    root: { folders: { $jazz: { push }, some: vi.fn().mockReturnValue(false) } },
  } as never;

  await adoptFolders(account, ['co_f1'], 'co_source_jazz_id');

  expect(FolderNode.load).toHaveBeenCalledWith(
    'co_f1',
    expect.objectContaining({ loadAs: expect.anything() }),
  );
  expect(push).toHaveBeenCalledWith(loadedFolder);
});
