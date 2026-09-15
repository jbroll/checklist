import { describe, expect, it } from 'vitest';
import type { ExportFolder, ExportMember, ExportUser } from '../../../migration/jazz-export/src/format.js';
import { planShares, splitForeignFolders } from '../../scripts/jazz-import/shares.js';

function folder(
  id: string,
  ownerAccountId: string,
  members: ExportMember[],
  parentId: string | null = null,
  childIds: string[] = [],
): ExportFolder {
  return {
    id,
    parentId,
    childIds,
    ownerAccountId,
    groupId: `group-${id}`,
    members: [{ accountId: ownerAccountId, role: 'admin' }, ...members],
    name: id,
    type: 'folder',
    sharingMode: 'shared',
    createdBy: ownerAccountId,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function user(userId: string, accountId: string, rootFolderIds: string[], folders: ExportFolder[]): ExportUser {
  return { userId, accountId, rootFolderIds, folders, userSettings: null, viewState: null };
}

const owner = user(
  'user-a',
  'co_A',
  ['Read', 'Write', 'Admin', 'Agent', 'Odd', 'Parent', 'Shared', 'Private'],
  [
    folder('Read', 'co_A', [{ accountId: 'co_B', role: 'reader' }]),
    folder('Write', 'co_A', [{ accountId: 'co_B', role: 'writer' }]),
    folder('Admin', 'co_A', [{ accountId: 'co_C', role: 'admin' }]),
    folder('Agent', 'co_A', [{ accountId: 'co_zAgent', role: 'admin' }]),
    folder('Odd', 'co_A', [
      { accountId: 'co_B', role: 'writeOnly' },
      { accountId: 'co_C', role: 'manager' },
    ]),
    folder('Parent', 'co_A', [], null, ['Nested']),
    folder('Nested', 'co_A', [{ accountId: 'co_B', role: 'reader' }], 'Parent'),
    folder('Shared', 'co_A', [{ accountId: 'co_C', role: 'reader' }], null, ['SharedChild']),
    folder('SharedChild', 'co_A', [{ accountId: 'co_C', role: 'writer' }], 'Shared'),
    folder('Private', 'co_A', []),
  ],
);

// user-b holds a folder owned by an account that is not migrated, with an owned child under it.
const recipient = user(
  'user-b',
  'co_B',
  ['Read', 'Foreign'],
  [
    folder('Read', 'co_A', [{ accountId: 'co_B', role: 'reader' }]),
    folder('Foreign', 'co_Gone', [{ accountId: 'co_C', role: 'writer' }], null, ['UnderForeign']),
    folder('UnderForeign', 'co_B', [{ accountId: 'co_C', role: 'writer' }], 'Foreign'),
  ],
);

const third = user('user-c', 'co_C', [], []);

describe('planShares', () => {
  const plan = planShares([owner, recipient, third]);
  const grantFor = (folderId: string) => plan.grants.filter((g) => g.folderId === folderId);

  it('grants reader, writer and admin members of written folders as rowboat roles', () => {
    expect(grantFor('Read')).toEqual([{ ownerUserId: 'user-a', folderId: 'Read', recipientUserId: 'user-b', role: 'reader' }]);
    expect(grantFor('Write')).toEqual([{ ownerUserId: 'user-a', folderId: 'Write', recipientUserId: 'user-b', role: 'writer' }]);
    expect(grantFor('Admin')).toEqual([{ ownerUserId: 'user-a', folderId: 'Admin', recipientUserId: 'user-c', role: 'admin' }]);
  });

  it("skips the owner's own membership", () => {
    expect(plan.grants.some((g) => g.recipientUserId === 'user-a')).toBe(false);
    expect(grantFor('Private')).toEqual([]);
  });

  it('counts members that are not migrated users without granting them', () => {
    expect(grantFor('Agent')).toEqual([]);
    expect(plan.notCarried.nonUserMembers).toBe(1);
  });

  it('reports roles with no rowboat equivalent instead of granting them', () => {
    expect(grantFor('Odd')).toEqual([]);
    expect(plan.notCarried.unmappedRoles).toEqual([
      { folderId: 'Odd', role: 'writeOnly' },
      { folderId: 'Odd', role: 'manager' },
    ]);
  });

  it('reports a nested grant whose parent the recipient cannot see', () => {
    expect(grantFor('Nested')).toEqual([]);
    expect(plan.notCarried.nestedWithoutParent).toEqual([{ folderId: 'Nested', recipientUserId: 'user-b' }]);
  });

  it('grants a nested folder when the recipient also gets an ancestor', () => {
    expect(grantFor('Shared').map((g) => g.role)).toEqual(['reader']);
    expect(grantFor('SharedChild').map((g) => g.role)).toEqual(['writer']);
  });

  it('never grants from folders that are not written: foreign or owned under foreign', () => {
    expect(grantFor('Foreign')).toEqual([]);
    expect(grantFor('UnderForeign')).toEqual([]);
    expect(plan.grants).toHaveLength(5);
  });

  it("rejects an export whose folders carry no members", () => {
    const stale = structuredClone(owner);
    delete (stale.folders[0] as Partial<ExportFolder>).members;
    expect(() => planShares([stale])).toThrow('folder Read has no members; re-run the export');
  });
});

describe('splitForeignFolders', () => {
  it('separates foreign folders carried as a share from those not carried', () => {
    const { grants } = planShares([owner, recipient, third]);
    expect(splitForeignFolders('user-b', ['Read', 'Foreign'], grants)).toEqual({ carriedAsShare: ['Read'], notCarried: ['Foreign'] });
  });
});
