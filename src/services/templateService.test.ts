/**
 * Unit tests for templateService (rowboat port, slice-2).
 *
 * A template is a folder row of `type: 'template-folder'`; its items live in the row's `items`
 * json column. Tests run against an in-memory `makeGraph()` graph — no Jazz, no React.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import { PATH_SEPARATOR } from '../utils/pathUtils';
import * as templateService from './templateService';

type Graph = ReturnType<typeof makeGraph>;

/** Build a complete template-folder row (all required Folder columns present). */
function templateFolder(
  id: string,
  name: string,
  items: TemplateItem[] = [],
  extra: Partial<FolderRow> = {},
): FolderRow {
  return {
    id,
    owner_group_id: 'group-1',
    name,
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items,
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
    ...extra,
  };
}

/** Build a template item. `path` defaults to `name`; categories default to expanded. */
function item(
  id: string,
  name: string,
  type: 'category' | 'item' = 'item',
  path?: string,
  sortOrder = 0,
): TemplateItem {
  return {
    id,
    name,
    type,
    path: path ?? name,
    expanded: type === 'category',
    sortOrder,
    archived: false,
    defaultQuantity: '',
    createdAt: 0,
  };
}

/** Seed a graph from folder rows. */
function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

/** Read a template's items, hard-erroring if the folder is missing. */
function itemsOf(g: Graph, id = 't1'): TemplateItem[] {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return parseFolderRow(node.$data).items;
}

/** Read a template's default_items map, hard-erroring if the folder is missing. */
function defaultsOf(g: Graph, id = 't1'): Record<string, boolean> {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return parseFolderRow(node.$data).default_items;
}

describe('templateService', () => {
  describe('getTemplate', () => {
    it('should return template by ID', () => {
      const g = graphWith(
        templateFolder('t1', 'Grocery List'),
        templateFolder('t2', 'Shopping List'),
      );

      const result = templateService.getTemplate(g, 't1');

      expect(result?.id).toBe('t1');
      expect(result?.name).toBe('Grocery List');
    });

    it('should return null if template not found', () => {
      const g = graphWith(templateFolder('t1', 'Grocery List'));
      expect(templateService.getTemplate(g, 'nonexistent-id')).toBeNull();
    });

    it('should return null if graph is empty', () => {
      const g = makeGraph();
      expect(templateService.getTemplate(g, 'any-id')).toBeNull();
    });

    it('should return null for a folder that is not a template folder', () => {
      const g = graphWith(templateFolder('f1', 'Org Folder', [], { type: 'folder' }));
      expect(templateService.getTemplate(g, 'f1')).toBeNull();
    });

    it('should handle multiple templates and return correct one', () => {
      const g = graphWith(
        templateFolder('t1', 'List 1'),
        templateFolder('t2', 'List 2'),
        templateFolder('t3', 'List 3'),
        templateFolder('t4', 'List 4'),
      );

      const result = templateService.getTemplate(g, 't3');

      expect(result?.name).toBe('List 3');
      expect(result?.id).toBe('t3');
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const g = graphWith(
        templateFolder('t1', 'Grocery List'),
        templateFolder('t2', 'Shopping List'),
      );

      const result = templateService.getAllTemplates(g);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toEqual(['Grocery List', 'Shopping List']);
    });

    it('should return empty array if no templates exist', () => {
      expect(templateService.getAllTemplates(makeGraph())).toEqual([]);
    });

    it('should filter out archived templates and non-template folders', () => {
      const g = graphWith(
        templateFolder('t1', 'Live'),
        templateFolder('t2', 'Archived', [], { archived: true }),
        templateFolder('f1', 'Org Folder', [], { type: 'folder' }),
      );

      const result = templateService.getAllTemplates(g);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Live');
    });
  });

  describe('templateExists', () => {
    it('should return true if template exists', () => {
      const g = graphWith(templateFolder('t1', 'Grocery List'));
      expect(templateService.templateExists(g, 't1')).toBe(true);
    });

    it('should return false if template does not exist', () => {
      const g = graphWith(templateFolder('t1', 'Grocery List'));
      expect(templateService.templateExists(g, 'nonexistent-id')).toBe(false);
    });

    it('should return false on an empty graph', () => {
      expect(templateService.templateExists(makeGraph(), 'any-id')).toBe(false);
    });

    it('should return false for a non-template folder', () => {
      const g = graphWith(templateFolder('f1', 'Org Folder', [], { type: 'folder' }));
      expect(templateService.templateExists(g, 'f1')).toBe(false);
    });

    it('should work correctly with multiple templates', () => {
      const g = graphWith(
        templateFolder('t1', 'List 1'),
        templateFolder('t2', 'List 2'),
        templateFolder('t3', 'List 3'),
      );

      expect(templateService.templateExists(g, 't1')).toBe(true);
      expect(templateService.templateExists(g, 't2')).toBe(true);
      expect(templateService.templateExists(g, 't3')).toBe(true);
      expect(templateService.templateExists(g, 't4')).toBe(false);
    });
  });

  describe('Item Operations', () => {
    describe('getItem', () => {
      it('should return item by ID', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk'), item('item-2', 'Bread')]),
        );

        const result = templateService.getItem(g, 't1', 'item-1');

        expect(result).toBeDefined();
        expect(result?.name).toBe('Milk');
      });

      it('should return null if item not found', () => {
        const g = graphWith(templateFolder('t1', 'Groceries', [item('item-1', 'Milk')]));
        expect(templateService.getItem(g, 't1', 'nonexistent')).toBeNull();
      });

      it('should return null if template not found', () => {
        expect(templateService.getItem(makeGraph(), 'nonexistent', 'item-1')).toBeNull();
      });
    });

    describe('getItems', () => {
      it('should return all non-archived items', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('item-1', 'Milk'),
            item('item-2', 'Bread'),
            { ...item('item-3', 'Archived'), archived: true },
          ]),
        );

        const result = templateService.getItems(g, 't1');

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.name)).toEqual(['Milk', 'Bread']);
      });

      it('should return empty array if template not found', () => {
        expect(templateService.getItems(makeGraph(), 'nonexistent')).toEqual([]);
      });
    });

    describe('getLeafItems', () => {
      it('should return only leaf items (not categories)', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'dairy'),
            item('item-1', 'Milk', 'item', 'dairy/milk'),
            item('item-2', 'Bread', 'item', 'bakery/bread'),
          ]),
        );

        const result = templateService.getLeafItems(g, 't1');

        expect(result).toHaveLength(2);
        expect(result.every((i) => i.type === 'item')).toBe(true);
      });

      it('should return empty array if template not found', () => {
        expect(templateService.getLeafItems(makeGraph(), 'nonexistent')).toEqual([]);
      });
    });

    describe('createCategory', () => {
      it('should create a new category', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const categoryId = await templateService.createCategory(g, 't1', 'Dairy');

        expect(categoryId).toBeDefined();
        const items = itemsOf(g);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe('Dairy');
        expect(items[0].type).toBe('category');
      });

      it('should create category with parent path', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('cat-1', 'Food', 'category', 'Food')]),
        );

        const categoryId = await templateService.createCategory(g, 't1', 'Dairy', 'Food');

        const items = itemsOf(g);
        expect(items).toHaveLength(2);
        const newItem = items.find((i) => i.id === categoryId);
        expect(newItem?.path).toBe(`Food${PATH_SEPARATOR}Dairy`);
      });

      it('should throw error if template not found', async () => {
        await expect(
          templateService.createCategory(makeGraph(), 'nonexistent', 'Dairy'),
        ).rejects.toThrow('Template nonexistent not found');
      });

      it('should throw error for duplicate path', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('cat-1', 'Dairy', 'category', 'Dairy')]),
        );

        await expect(templateService.createCategory(g, 't1', 'Dairy')).rejects.toThrow(
          'Item already exists at path: Dairy',
        );
      });
    });

    describe('createItem', () => {
      it('should create a new item', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const itemId = await templateService.createItem(g, 't1', 'Milk');

        expect(itemId).toBeDefined();
        const items = itemsOf(g);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe('Milk');
        expect(items[0].type).toBe('item');
      });

      it('should create item with parent path', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('cat-1', 'Dairy', 'category', 'Dairy')]),
        );

        const itemId = await templateService.createItem(g, 't1', 'Milk', 'Dairy');

        const newItem = itemsOf(g).find((i) => i.id === itemId);
        expect(newItem?.path).toBe(`Dairy${PATH_SEPARATOR}Milk`);
      });

      it('should create item with default quantity', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const itemId = await templateService.createItem(g, 't1', 'Milk', undefined, '2L');

        const newItem = itemsOf(g).find((i) => i.id === itemId);
        expect(newItem?.defaultQuantity).toBe('2L');
      });

      it('should auto-add item to defaults', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const itemId = await templateService.createItem(g, 't1', 'Milk');

        expect(defaultsOf(g)[itemId]).toBe(true);
      });
    });

    describe('renameItem', () => {
      it('should rename an item', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'Milk')]),
        );

        await templateService.renameItem(g, 't1', 'item-1', 'Whole Milk');

        const items = itemsOf(g);
        expect(items[0].name).toBe('Whole Milk');
        expect(items[0].path).toBe('Whole Milk');
      });

      it('should update descendant paths when renaming category', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'Dairy'),
            item('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
            item('item-2', 'Cheese', 'item', `Dairy${PATH_SEPARATOR}Cheese`),
          ]),
        );

        await templateService.renameItem(g, 't1', 'cat-1', 'Milk Products');

        const items = itemsOf(g);
        expect(items[0].path).toBe('Milk Products');
        expect(items[1].path).toBe(`Milk Products${PATH_SEPARATOR}Milk`);
        expect(items[2].path).toBe(`Milk Products${PATH_SEPARATOR}Cheese`);
      });

      it('should throw error if template not found', async () => {
        await expect(
          templateService.renameItem(makeGraph(), 'nonexistent', 'item-1', 'New Name'),
        ).rejects.toThrow('Template nonexistent not found');
      });

      it('should throw error if item not found', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await expect(
          templateService.renameItem(g, 't1', 'nonexistent', 'New Name'),
        ).rejects.toThrow('Item nonexistent not found in template');
      });

      it('should throw error for duplicate path after rename', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('item-1', 'Milk', 'item', 'Milk'),
            item('item-2', 'Cheese', 'item', 'Cheese'),
          ]),
        );

        await expect(templateService.renameItem(g, 't1', 'item-1', 'Cheese')).rejects.toThrow(
          'Item already exists at path: Cheese',
        );
      });
    });

    describe('updateItemNotes', () => {
      it('should update item notes', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries', [item('item-1', 'Milk')]));

        await templateService.updateItemNotes(g, 't1', 'item-1', 'Get organic');

        expect(itemsOf(g)[0].notes).toBe('Get organic');
      });

      it('should clear notes when empty string provided', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [{ ...item('item-1', 'Milk'), notes: 'Some note' }]),
        );

        await templateService.updateItemNotes(g, 't1', 'item-1', '');

        expect(itemsOf(g)[0].notes).toBeUndefined();
      });
    });

    describe('archiveItem', () => {
      it('should archive an item', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries', [item('item-1', 'Milk')]));

        await templateService.archiveItem(g, 't1', 'item-1');

        expect(itemsOf(g)[0].archived).toBe(true);
      });

      it('should archive category and all descendants', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'Dairy'),
            item('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
            item('item-2', 'Cheese', 'item', `Dairy${PATH_SEPARATOR}Cheese`),
            item('item-3', 'Bread', 'item', 'Bread'),
          ]),
        );

        await templateService.archiveItem(g, 't1', 'cat-1');

        const items = itemsOf(g);
        expect(items[0].archived).toBe(true); // Category
        expect(items[1].archived).toBe(true); // Milk
        expect(items[2].archived).toBe(true); // Cheese
        expect(items[3].archived).toBe(false); // Bread (not in category)
      });

      it('should throw error if item not found', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        await expect(templateService.archiveItem(g, 't1', 'nonexistent')).rejects.toThrow(
          'Item nonexistent not found in template',
        );
      });
    });

    describe('moveItem', () => {
      it('should move item to new parent', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'Dairy'),
            item('cat-2', 'Bakery', 'category', 'Bakery'),
            item('item-1', 'Milk', 'item', `Bakery${PATH_SEPARATOR}Milk`),
          ]),
        );

        await templateService.moveItem(g, 't1', 'item-1', 'Dairy');

        expect(itemsOf(g)[2].path).toBe(`Dairy${PATH_SEPARATOR}Milk`);
      });

      it('should move item to root', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'Dairy'),
            item('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
          ]),
        );

        await templateService.moveItem(g, 't1', 'item-1', undefined);

        expect(itemsOf(g)[1].path).toBe('Milk');
      });

      it('should update sortOrder when provided', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'Milk', 0)]),
        );

        await templateService.moveItem(g, 't1', 'item-1', undefined, 5);

        expect(itemsOf(g)[0].sortOrder).toBe(5);
      });

      it('should move category and update all descendant paths', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'Dairy'),
            item('cat-2', 'Food', 'category', 'Food'),
            item('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
          ]),
        );

        await templateService.moveItem(g, 't1', 'cat-1', 'Food');

        const items = itemsOf(g);
        expect(items[0].path).toBe(`Food${PATH_SEPARATOR}Dairy`);
        expect(items[2].path).toBe(`Food${PATH_SEPARATOR}Dairy${PATH_SEPARATOR}Milk`);
      });

      it('should not write if path and sortOrder unchanged', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'Milk', 0)]),
        );

        await templateService.moveItem(g, 't1', 'item-1', undefined);

        // Early return means no write — updated_at stays at its seeded value.
        expect(g.folder('t1')?.$data.updated_at).toBe(0);
      });
    });

    describe('Category Expansion', () => {
      it('should get category expanded state', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            { ...item('cat-1', 'Dairy', 'category', 'dairy'), expanded: true },
          ]),
        );

        expect(templateService.getCategoryExpanded(g, 't1', 'cat-1')).toBe(true);
      });

      it('should set category expanded state', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            { ...item('cat-1', 'Dairy', 'category', 'dairy'), expanded: true },
          ]),
        );

        await templateService.setCategoryExpanded(g, 't1', 'cat-1', false);

        expect(itemsOf(g)[0].expanded).toBe(false);
      });

      it('should toggle category expanded state', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            { ...item('cat-1', 'Dairy', 'category', 'dairy'), expanded: true },
          ]),
        );

        await templateService.toggleCategoryExpanded(g, 't1', 'cat-1');
        expect(itemsOf(g)[0].expanded).toBe(false);

        await templateService.toggleCategoryExpanded(g, 't1', 'cat-1');
        expect(itemsOf(g)[0].expanded).toBe(true);
      });

      it('should throw error when getting expanded state for non-category', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'milk')]),
        );

        expect(() => templateService.getCategoryExpanded(g, 't1', 'item-1')).toThrow(
          'Item item-1 is not a category',
        );
      });

      it('should throw error when setting expanded state for non-category', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'milk')]),
        );

        await expect(templateService.setCategoryExpanded(g, 't1', 'item-1', false)).rejects.toThrow(
          'Item item-1 is not a category',
        );
      });
    });

    describe('reorderItem', () => {
      it('should update item sortOrder', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'milk', 0)]),
        );

        await templateService.reorderItem(g, 't1', 'item-1', 5.5);

        expect(itemsOf(g)[0].sortOrder).toBe(5.5);
      });
    });

    describe('calculateInsertionPoint', () => {
      it('should return root with sortOrder 0 for empty template', () => {
        const g = graphWith(templateFolder('t1', 'Groceries'));

        const result = templateService.calculateInsertionPoint(g, 't1', null);

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(0);
      });

      it('should return sortOrder before first item when nothing selected', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('item-1', 'Milk', 'item', 'Milk', 5),
            item('item-2', 'Bread', 'item', 'Bread', 10),
          ]),
        );

        const result = templateService.calculateInsertionPoint(g, 't1', null);

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(4); // minSortOrder - 1
      });

      it('should return insertion at top of category when category selected', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('cat-1', 'Dairy', 'category', 'Dairy', 0),
            item('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`, 5),
          ]),
        );

        const result = templateService.calculateInsertionPoint(g, 't1', 'cat-1');

        expect(result.parentPath).toBe('Dairy');
        expect(result.sortOrder).toBe(4); // min child sortOrder - 1
      });

      it('should return insertion after selected item', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('item-1', 'Milk', 'item', 'Milk', 5),
            item('item-2', 'Bread', 'item', 'Bread', 10),
          ]),
        );

        const result = templateService.calculateInsertionPoint(g, 't1', 'item-1');

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(7.5); // (5 + 10) / 2
      });

      it('should return sortOrder after last item when last item selected', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('item-1', 'Milk', 'item', 'Milk', 5),
            item('item-2', 'Bread', 'item', 'Bread', 10),
          ]),
        );

        const result = templateService.calculateInsertionPoint(g, 't1', 'item-2');

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(11); // last sortOrder + 1
      });

      it('should fall back to root if selected item not found', () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk', 'item', 'Milk', 5)]),
        );

        const result = templateService.calculateInsertionPoint(g, 't1', 'nonexistent');

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(0);
      });
    });

    describe('Default Items Operations', () => {
      it('should set item as default', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries', [item('item-1', 'Milk')]));

        await templateService.setItemDefault(g, 't1', 'item-1', true);

        expect(defaultsOf(g)['item-1']).toBe(true);
      });

      it('should remove item from defaults', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk')], {
            default_items: { 'item-1': true },
          }),
        );

        await templateService.setItemDefault(g, 't1', 'item-1', false);

        expect(defaultsOf(g)['item-1']).toBe(false);
      });

      it('should toggle item default state', async () => {
        const g = graphWith(templateFolder('t1', 'Groceries', [item('item-1', 'Milk')]));

        await templateService.toggleItemDefault(g, 't1', 'item-1');
        expect(defaultsOf(g)['item-1']).toBe(true);

        await templateService.toggleItemDefault(g, 't1', 'item-1');
        expect(defaultsOf(g)['item-1']).toBe(false);
      });

      it('should batch set items as default', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [
            item('item-1', 'Milk'),
            item('item-2', 'Bread'),
            item('item-3', 'Eggs'),
          ]),
        );

        await templateService.batchSetItemsDefault(g, 't1', ['item-1', 'item-2'], true);

        const defaults = defaultsOf(g);
        expect(defaults['item-1']).toBe(true);
        expect(defaults['item-2']).toBe(true);
        expect(defaults['item-3']).toBeUndefined();
      });

      it('should batch remove items from defaults', async () => {
        const g = graphWith(
          templateFolder('t1', 'Groceries', [item('item-1', 'Milk'), item('item-2', 'Bread')], {
            default_items: { 'item-1': true, 'item-2': true },
          }),
        );

        await templateService.batchSetItemsDefault(g, 't1', ['item-1'], false);

        const defaults = defaultsOf(g);
        expect(defaults['item-1']).toBe(false);
        expect(defaults['item-2']).toBe(true);
      });

      it('should invert items default state', async () => {
        const g = graphWith(
          templateFolder(
            't1',
            'Groceries',
            [item('item-1', 'Milk'), item('item-2', 'Bread'), item('item-3', 'Eggs')],
            { default_items: { 'item-1': true } },
          ),
        );

        await templateService.invertItemsDefault(g, 't1', ['item-1', 'item-2', 'item-3']);

        const defaults = defaultsOf(g);
        expect(defaults['item-1']).toBe(false);
        expect(defaults['item-2']).toBe(true);
        expect(defaults['item-3']).toBe(true);
      });
    });
  });
});
