import { reactiveArrayStore, relational } from '@jbroll/rowboat-schema';
import { describe, expect, it } from 'vitest';
import { schema } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { buildQuickErrandsFolder, seedDefaultFolders } from '../defaultData';

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
});
