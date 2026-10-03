import { reactiveArrayStore, relational } from '@jbroll/rowboat-schema';
import { describe, expect, it } from 'vitest';
import { schema } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import {
  buildQuickErrandsFolder,
  seedDefaultFolders,
  shouldSeedDefaultFolders,
} from '../defaultData';

function makeGraph() {
  return relational(schema, reactiveArrayStore());
}

describe('defaultData', () => {
  it('buildQuickErrandsFolder creates a template folder with 6 pre-selected items', () => {
    const row = buildQuickErrandsFolder('qe1', 'g1', 'user-1', 1_000);
    expect(row.name).toBe('Quick Errands');
    expect(row.type).toBe('template-folder');
    expect(row.parent_id).toBeNull();
    expect(row.items).toHaveLength(6);
    expect(row.items.map((i) => i.name)).toEqual([
      'Bank',
      'Dry cleaning',
      'Grocery store',
      'Post office',
      'Gas station',
      'Pharmacy',
    ]);
    // Every item is top-level (path === name), sequentially ordered, and pre-selected.
    row.items.forEach((item, index) => {
      expect(item.path).toBe(item.name);
      expect(item.sortOrder).toBe(index);
      expect(row.default_items[item.id]).toBe(true);
    });
    expect(Object.keys(row.default_items)).toHaveLength(6);
  });

  it('seedDefaultFolders creates Quick Errands when the tree is empty', async () => {
    const g = makeGraph();
    expect(g.folder.all()).toHaveLength(0);

    await seedDefaultFolders(g, 'g1', 'user-1');

    const rows = g.folder.all();
    expect(rows).toHaveLength(1);
    const seeded = parseFolderRow(rows[0].$data);
    expect(seeded.name).toBe('Quick Errands');
    expect(seeded.items).toHaveLength(6);
  });

  it('seedDefaultFolders is a no-op when a folder already exists', async () => {
    const g = makeGraph();
    await seedDefaultFolders(g, 'g1', 'user-1');
    await seedDefaultFolders(g, 'g1', 'user-1');
    expect(g.folder.all()).toHaveLength(1);
  });

  it('seedDefaultFolders does not create a folder for anonymous users', async () => {
    const g = makeGraph();
    expect(g.folder.all()).toHaveLength(0);

    await seedDefaultFolders(g, 'g1', 'anon', true);

    expect(g.folder.all()).toHaveLength(0);
  });

  it('shouldSeedDefaultFolders is false for anonymous users even with zero folders', () => {
    expect(shouldSeedDefaultFolders({ isAnonymous: true, totalFolderCount: 0 })).toBe(false);
    expect(shouldSeedDefaultFolders({ isAnonymous: true, totalFolderCount: 5 })).toBe(false);
  });

  it('shouldSeedDefaultFolders is true for a fresh account with zero folder rows', () => {
    expect(shouldSeedDefaultFolders({ isAnonymous: false, totalFolderCount: 0 })).toBe(true);
  });

  it('shouldSeedDefaultFolders is false when the account already holds folders', () => {
    expect(shouldSeedDefaultFolders({ isAnonymous: false, totalFolderCount: 1 })).toBe(false);
    expect(shouldSeedDefaultFolders({ isAnonymous: false, totalFolderCount: 3 })).toBe(false);
  });

  it('shouldSeedDefaultFolders counts tombstoned (soft-deleted) rows — a user who deleted everything is not re-seeded', () => {
    // totalFolderCount includes `__deleted` tombstones, so a store whose only folder rows are
    // tombstones must not seed again.
    expect(shouldSeedDefaultFolders({ isAnonymous: false, totalFolderCount: 2 })).toBe(false);
  });

  it('seedDefaultFolders uses a deterministic folder id per account so concurrent devices converge', async () => {
    const g1 = makeGraph();
    const g2 = makeGraph();
    await seedDefaultFolders(g1, 'g1', 'user-1');
    await seedDefaultFolders(g2, 'g2', 'user-1');
    const id1 = parseFolderRow(g1.folder.all()[0].$data).id;
    const id2 = parseFolderRow(g2.folder.all()[0].$data).id;
    expect(id1).toBe(id2);
  });

  it('seedDefaultFolders uses deterministic item ids per account so concurrent seeds merge', async () => {
    const g1 = makeGraph();
    const g2 = makeGraph();
    await seedDefaultFolders(g1, 'g1', 'user-1');
    await seedDefaultFolders(g2, 'g2', 'user-1');
    const items1 = parseFolderRow(g1.folder.all()[0].$data).items.map((i) => i.id);
    const items2 = parseFolderRow(g2.folder.all()[0].$data).items.map((i) => i.id);
    expect(items1).toEqual(items2);
  });

  it('seedDefaultFolders isolates seeds between accounts', async () => {
    const g1 = makeGraph();
    const g2 = makeGraph();
    await seedDefaultFolders(g1, 'g1', 'user-1');
    await seedDefaultFolders(g2, 'g2', 'user-2');
    const id1 = parseFolderRow(g1.folder.all()[0].$data).id;
    const id2 = parseFolderRow(g2.folder.all()[0].$data).id;
    expect(id1).not.toBe(id2);
  });
});
