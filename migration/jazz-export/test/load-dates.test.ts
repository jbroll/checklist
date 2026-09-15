import { co, Group } from 'jazz-tools';
import type { Account } from 'jazz-tools';
import { createJazzTestAccount, setupJazzTestSync } from 'jazz-tools/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadTree } from '../src/load.js';
import { FolderNode, ListsRoot } from '../src/schema.js';

const created = new Date('2026-01-01T00:00:00.000Z');
const selected = new Date('2026-01-02T00:00:00.000Z');
const checked = new Date('2026-01-03T00:00:00.000Z');

function item(createdAt: unknown) {
  return { id: 'i1', name: 'Milk', type: 'item', path: 'Milk', expanded: false, sortOrder: 0, archived: false, defaultQuantity: '', createdAt };
}

function session(createdAt: unknown, lastActivityAt: unknown, selectedAt: unknown, checkedAt: unknown) {
  return {
    id: 's1',
    itemStates: { i1: { selected: true, checked: true, selectedAt, checkedAt } },
    archived: false,
    categoryExpanded: {},
    viewMode: 'flat',
    selectedCount: 1,
    checkedCount: 1,
    remainingCount: 0,
    createdAt,
    lastActivityAt,
  };
}

// The prod export loads from a sync server, so the folder is written by one account and read by another.
describe('loadTree date fields written on another node', () => {
  let reader: Account;
  let writer: Account;
  let shared: Group;

  beforeEach(async () => {
    await setupJazzTestSync();
    reader = await createJazzTestAccount({ isCurrentActiveAccount: true });
    writer = await createJazzTestAccount();
    shared = Group.create({ owner: writer });
    shared.addMember(reader, 'reader');
  });

  async function exportFolder(fields: Record<string, unknown>) {
    const node = FolderNode.create(
      {
        name: 'T',
        type: 'template-folder',
        sharingMode: 'shared',
        createdBy: writer.$jazz.id,
        createdAt: created,
        updatedAt: created,
        archivedAt: checked,
        owner: writer,
        items: [item(created)],
        sessions: [session(created, checked, selected, checked)],
      },
      { owner: shared },
    );
    for (const [key, value] of Object.entries(fields)) node.$jazz.raw.set(key, value);
    await node.$jazz.waitForSync();
    await shared.$jazz.waitForSync();

    const root = ListsRoot.create({ folders: co.list(FolderNode).create([node], { owner: reader }) }, { owner: reader });
    reader.$jazz.set('root', root);
    const out = await loadTree(reader, 'user-1');
    return { id: node.$jazz.id as string, folder: out.folders[0] };
  }

  function expectDates(folder: Awaited<ReturnType<typeof exportFolder>>['folder']) {
    expect(folder.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(folder.archivedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(folder.items?.[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(folder.sessions?.[0]).toMatchObject({ createdAt: '2026-01-01T00:00:00.000Z', lastActivityAt: '2026-01-03T00:00:00.000Z' });
    expect(folder.sessions?.[0].itemStates.i1).toMatchObject({ selectedAt: '2026-01-02T00:00:00.000Z', checkedAt: '2026-01-03T00:00:00.000Z' });
  }

  it('exports Date values written through the schema', async () => {
    expectDates((await exportFolder({})).folder);
  });

  it('exports dates stored raw as ISO strings', async () => {
    const { folder } = await exportFolder({
      createdAt: created.toISOString(),
      items: [item(created.toISOString())],
      sessions: [session(created.toISOString(), checked.toISOString(), selected.toISOString(), checked.toISOString())],
    });
    expectDates(folder);
  });

  it('exports dates stored raw as epoch milliseconds', async () => {
    const { folder } = await exportFolder({
      createdAt: created.getTime(),
      items: [item(created.getTime())],
      sessions: [session(created.getTime(), checked.getTime(), selected.getTime(), checked.getTime())],
    });
    expectDates(folder);
  });

  it('names the field path, not the value, for an unsupported date', async () => {
    const err = await exportFolder({ items: [item(created.getTime()), { ...item(true), id: 'i2' }] }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^folder co_\w+ items\[1\]\.createdAt: unsupported date value of type boolean$/);
  });

  it('rejects an invalid date string without echoing it', async () => {
    const err = await exportFolder({ sessions: [session(created.toISOString(), 'not-a-date', undefined, undefined)] }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^folder co_\w+ sessions\[0\]\.lastActivityAt: invalid date value of type string$/);
  });
});
