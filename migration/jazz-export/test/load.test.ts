import { co, Group } from 'jazz-tools';
import type { Account } from 'jazz-tools';
import { createJazzTestAccount, setupJazzTestSync } from 'jazz-tools/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadTree } from '../src/load.js';
import { FolderNode, ListsRoot, ReadOnlyAccount, UserSettings, ViewState } from '../src/schema.js';

const now = new Date('2026-01-01T00:00:00.000Z');

function folder(
  owner: Account | Group,
  ownerAccount: Account,
  name: string,
  type: 'folder' | 'template-folder',
  extra: Record<string, unknown> = {},
) {
  return FolderNode.create(
    {
      name,
      type,
      sharingMode: 'private',
      expanded: false,
      archived: false,
      createdBy: ownerAccount.$jazz.id,
      createdAt: now,
      updatedAt: now,
      owner: ownerAccount,
      ...extra,
    },
    { owner },
  );
}

describe('loadTree', () => {
  let me: Account;
  let other: Account;

  beforeEach(async () => {
    await setupJazzTestSync();
    me = await createJazzTestAccount({ isCurrentActiveAccount: true });
    other = await createJazzTestAccount();
  });

  it('walks nested, duplicated and foreign-owned folders from the root', async () => {
    const C = folder(me, me, 'C', 'template-folder', { items: [], sessions: [] });
    const B = folder(me, me, 'B', 'folder', { children: co.list(FolderNode).create([C], { owner: me }) });
    const A = folder(me, me, 'A', 'folder', { children: co.list(FolderNode).create([B], { owner: me }) });
    const T = folder(me, me, 'T', 'template-folder', {
      items: [
        { id: 'i1', name: 'Milk', type: 'item', path: 'Milk', expanded: false, sortOrder: 0, archived: false, defaultQuantity: '', createdAt: now },
        { id: 'i2', name: 'Eggs', type: 'item', path: 'Eggs', expanded: false, sortOrder: 1, archived: false, defaultQuantity: '12', createdAt: now },
      ],
      sessions: [
        {
          id: 's1',
          itemStates: { i1: { selected: true, checked: false, selectedAt: now, notes: 'oat' } },
          archived: false,
          categoryExpanded: {},
          viewMode: 'flat',
          selectedCount: 1,
          checkedCount: 0,
          remainingCount: 1,
          createdAt: now,
          lastActivityAt: now,
        },
      ],
    });

    const shared = Group.create({ owner: other });
    shared.addMember(me, 'writer');
    const S = folder(shared, other, 'S', 'folder');
    await S.$jazz.waitForSync();
    await shared.$jazz.waitForSync();

    const root = ListsRoot.create(
      {
        folders: co.list(FolderNode).create([A, T], { owner: me }),
        viewState: ViewState.create(
          { folderExpanded: { [T.$jazz.id]: true }, templateCategoryExpanded: {}, sessionCategoryExpanded: {} },
          { owner: me },
        ),
        userSettings: UserSettings.create({ enableAutoCategorization: false }, { owner: me }),
      },
      { owner: me },
    );
    root.folders.$jazz.push(T);
    root.folders.$jazz.push(S);
    me.$jazz.set('root', root);

    const out = await loadTree(me, 'user-1');

    expect(out.userId).toBe('user-1');
    expect(out.rootFolderIds).toEqual([A.$jazz.id, T.$jazz.id, T.$jazz.id, S.$jazz.id]);
    expect(out.folders.map((f) => f.id).sort()).toEqual([A, B, C, S, T].map((f) => f.$jazz.id).sort());
    expect(out.folders.find((f) => f.id === C.$jazz.id)?.parentId).toBe(B.$jazz.id);
    expect(out.folders.find((f) => f.id === A.$jazz.id)?.childIds).toEqual([B.$jazz.id]);
    expect(out.folders.find((f) => f.id === S.$jazz.id)?.ownerAccountId).toBe(other.$jazz.id);
    expect(out.folders.find((f) => f.id === S.$jazz.id)?.groupId).toBe(shared.$jazz.id);
    expect(out.folders.find((f) => f.id === T.$jazz.id)?.ownerAccountId).toBe(me.$jazz.id);
    expect(out.folders.find((f) => f.id === T.$jazz.id)?.sessions?.[0].itemStates).toBeDefined();
    expect(out.folders.find((f) => f.id === T.$jazz.id)?.sessions?.[0].itemStates.i1.notes).toBe('oat');
    expect(out.folders.find((f) => f.id === T.$jazz.id)?.items).toHaveLength(2);
    expect(out.userSettings).toEqual({ enableAutoCategorization: false });
    expect(out.viewState?.folderExpanded).toEqual({ [T.$jazz.id]: true });
    expect(out.accountId).toBe(me.$jazz.id);
  });

  it('ReadOnlyAccount login migration does not recreate a missing profile inbox', async () => {
    const profile = me.$jazz.localNode.expectCoValueLoaded(me.$jazz.raw.get('profile')!).getCurrentContent() as unknown as {
      get(key: string): unknown;
      delete(key: string): void;
    };
    profile.delete('inbox');
    expect(profile.get('inbox')).toBeUndefined();

    await ReadOnlyAccount.fromRaw(me.$jazz.raw).applyMigration();
    expect(profile.get('inbox')).toBeUndefined();

    await (me.constructor as typeof Account).fromRaw(me.$jazz.raw).applyMigration();
    expect(profile.get('inbox')).toBeDefined();
  });

  it('throws when the account has no root', async () => {
    await expect(loadTree(other, 'user-2')).rejects.toThrow('account has no root');
  });
});
