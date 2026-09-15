import { describe, expect, it } from 'vitest';
import { countFolders, serializeFolder, type LoadedFolder } from '../src/serialize.js';

const d = (s: string) => new Date(s);

const template: LoadedFolder = {
  id: 'f1',
  name: 'Groceries',
  type: 'template-folder',
  sharingMode: 'shared',
  archived: true,
  archivedAt: d('2026-01-03T00:00:00.000Z'),
  createdBy: 'co_zOwner',
  createdAt: d('2026-01-01T00:00:00.000Z'),
  updatedAt: d('2026-01-02T00:00:00.000Z'),
  items: [
    { id: 'i1', name: 'Milk', type: 'item', path: 'Milk', expanded: false, sortOrder: 1, archived: false, defaultQuantity: '1', notes: 'whole', createdAt: '2026-01-01T00:00:01.000Z' },
  ],
  sessions: [
    {
      id: 's1',
      itemStates: { i1: { selected: true, checked: true, selectedAt: '2026-01-04T00:00:00.000Z', checkedAt: Date.parse('2026-01-04T00:01:00.000Z'), notes: 'got 2' } },
      archived: true,
      categoryExpanded: {},
      viewMode: 'flat',
      selectedCount: 1,
      checkedCount: 1,
      remainingCount: 0,
      createdAt: '2026-01-04T00:00:00.000Z',
      lastActivityAt: d('2026-01-04T00:01:00.000Z'),
    },
  ],
  defaultItems: { i1: true },
  showZoneHeadings: true,
  autocompleteDomain: 'grocery',
  autoCategorizeEnabled: false,
};

describe('serializeFolder', () => {
  it('converts dates to ISO and keeps notes, archivedAt and ownership', () => {
    const out = serializeFolder(template, 'parent1', [], 'co_zOwner', 'co_zGroup', [{ accountId: 'co_zOther', role: 'reader' }]);
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(out.archivedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(out.items?.[0]).toMatchObject({ notes: 'whole', createdAt: '2026-01-01T00:00:01.000Z' });
    expect(out.sessions?.[0].itemStates.i1).toEqual({ selected: true, checked: true, selectedAt: '2026-01-04T00:00:00.000Z', checkedAt: '2026-01-04T00:01:00.000Z', notes: 'got 2' });
    expect(out).toMatchObject({ parentId: 'parent1', ownerAccountId: 'co_zOwner', groupId: 'co_zGroup', sharingMode: 'shared' });
  });

  it('names the itemStates path of an unsupported date', () => {
    const bad = structuredClone(template);
    (bad.sessions![0].itemStates.i1 as { checkedAt: unknown }).checkedAt = null;
    expect(() => serializeFolder(bad, null, [], 'a', 'g', [])).toThrow('folder f1 sessions[0].itemStates["i1"].checkedAt: unsupported date value of type object');
  });

  it('omits optionals that were never set', () => {
    const bare: LoadedFolder = { id: 'f2', name: 'Box', type: 'folder', sharingMode: 'private', createdBy: 'a', createdAt: d('2026-01-01T00:00:00.000Z'), updatedAt: d('2026-01-01T00:00:00.000Z') };
    const out = serializeFolder(bare, null, ['c1', 'c2'], 'a', 'g', []);
    expect(Object.keys(out).sort()).toEqual(['childIds', 'createdAt', 'createdBy', 'groupId', 'id', 'members', 'name', 'ownerAccountId', 'parentId', 'sharingMode', 'type', 'updatedAt'].sort());
    expect(out.childIds).toEqual(['c1', 'c2']);
  });

  it('omits type, sharingMode and createdBy for a folder created before those fields existed', () => {
    const legacy: LoadedFolder = {
      id: 'f3',
      name: 'ToDo',
      createdAt: d('2026-01-01T00:00:00.000Z'),
      updatedAt: d('2026-01-01T00:00:00.000Z'),
      items: [],
    };
    const out = serializeFolder(legacy, null, [], 'a', 'g', []);
    expect(out).not.toHaveProperty('type');
    expect(out).not.toHaveProperty('sharingMode');
    expect(out).not.toHaveProperty('createdBy');
  });
});

describe('countFolders', () => {
  it('sums items and sessions, treating missing lists as empty', () => {
    const a = serializeFolder(template, null, [], 'a', 'g', []);
    const b = serializeFolder({ id: 'f2', name: 'Box', type: 'folder', sharingMode: 'private', createdBy: 'a', createdAt: d('2026-01-01T00:00:00.000Z'), updatedAt: d('2026-01-01T00:00:00.000Z') }, null, [], 'a', 'g', []);
    expect(countFolders([a, b])).toEqual({ folders: 2, items: 1, sessions: 1 });
  });
});
