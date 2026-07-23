/**
 * Unit tests for templateService item operations (rowboat port, slice-2).
 *
 * Covers create/rename/archive/move/reorder/expand/notes over a template folder's `items` json
 * column. Runs against an in-memory `makeGraph()` graph — no sync, no React.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, TemplateItem } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import { PATH_SEPARATOR } from '../utils/pathUtils';
import * as templateService from './templateService';

type Graph = ReturnType<typeof makeGraph>;

/** Build a complete template-folder row (all required Folder columns present). */
function templateFolder(id: string, items: TemplateItem[] = []): FolderRow {
  return {
    id,
    owner_group_id: 'group-1',
    name: 'Test Template',
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
  };
}

/** Build a template item. */
function item(
  id: string,
  name: string,
  type: 'category' | 'item',
  path: string,
  expanded = false,
): TemplateItem {
  return {
    id,
    name,
    type,
    path,
    expanded,
    sortOrder: 0,
    archived: false,
    defaultQuantity: '',
    createdAt: 0,
  };
}

function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

/** Read a template's items, hard-erroring if the folder is missing. */
function itemsOf(g: Graph, id = 'template-1'): TemplateItem[] {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return parseFolderRow(node.$data).items;
}

describe('templateService - item operations', () => {
  describe('toggleCategoryExpanded', () => {
    it('should toggle category expanded state from false to true', async () => {
      const g = graphWith(
        templateFolder('template-1', [item('cat-1', 'Produce', 'category', 'Produce', false)]),
      );

      await templateService.toggleCategoryExpanded(g, 'template-1', 'cat-1');

      expect(itemsOf(g)[0].expanded).toBe(true);
      // A write happened: updated_at advanced off its seeded 0.
      expect(g.folder('template-1')?.$data.updated_at).toBeGreaterThan(0);
    });

    it('should toggle category expanded state from true to false', async () => {
      const g = graphWith(
        templateFolder('template-1', [item('cat-1', 'Produce', 'category', 'Produce', true)]),
      );

      await templateService.toggleCategoryExpanded(g, 'template-1', 'cat-1');

      expect(itemsOf(g)[0].expanded).toBe(false);
    });

    it('should throw error if template not found', async () => {
      await expect(
        templateService.toggleCategoryExpanded(makeGraph(), 'nonexistent', 'cat-1'),
      ).rejects.toThrow('Template nonexistent not found');
    });

    it('should throw error if item not found', async () => {
      const g = graphWith(templateFolder('template-1', []));

      await expect(
        templateService.toggleCategoryExpanded(g, 'template-1', 'nonexistent'),
      ).rejects.toThrow('Item nonexistent not found');
    });

    it('should throw error if item is not a category', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`),
        ]),
      );

      await expect(
        templateService.toggleCategoryExpanded(g, 'template-1', 'item-1'),
      ).rejects.toThrow('Item item-1 is not a category');
    });

    it('should not affect other items when toggling', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('cat-1', 'Produce', 'category', 'Produce', false),
          item('cat-2', 'Dairy', 'category', 'Dairy', true),
          item('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.toggleCategoryExpanded(g, 'template-1', 'cat-1');

      const items = itemsOf(g);
      expect(items).toHaveLength(3);
      expect(items[0].expanded).toBe(true); // cat-1 toggled
      expect(items[1].expanded).toBe(true); // cat-2 unchanged
      expect(items[2].type).toBe('item'); // item unchanged
    });

    it('should preserve all other item properties when toggling', async () => {
      const category = item('cat-1', 'Produce', 'category', 'Produce', false);
      category.sortOrder = 5;
      category.defaultQuantity = '1';
      const g = graphWith(templateFolder('template-1', [category]));

      await templateService.toggleCategoryExpanded(g, 'template-1', 'cat-1');

      const updated = itemsOf(g)[0];
      expect(updated.sortOrder).toBe(5);
      expect(updated.defaultQuantity).toBe('1');
      expect(updated.name).toBe('Produce');
      expect(updated.path).toBe('Produce'); // Case preserved
    });
  });

  describe('createCategory', () => {
    it('should create a category with default values', async () => {
      const g = graphWith(templateFolder('template-1', []));

      const categoryId = await templateService.createCategory(g, 'template-1', 'Produce');

      expect(categoryId).toBeTruthy();
      const created = itemsOf(g).find((i) => i.id === categoryId);
      expect(created?.name).toBe('Produce');
      expect(created?.type).toBe('category');
      expect(created?.path).toBe('Produce'); // Case preserved, no normalization
      expect(created?.expanded).toBe(true); // Categories start expanded by default
    });

    it('should create a nested category under parent', async () => {
      const g = graphWith(
        templateFolder('template-1', [item('cat-1', 'Produce', 'category', 'Produce')]),
      );

      await templateService.createCategory(g, 'template-1', 'Fruits', 'Produce');

      const newCategory = itemsOf(g).find((i) => i.name === 'Fruits');
      expect(newCategory?.path).toBe(`Produce${PATH_SEPARATOR}Fruits`);
    });
  });

  describe('createItem', () => {
    it('should create an item with default quantity', async () => {
      const g = graphWith(templateFolder('template-1', []));

      const itemId = await templateService.createItem(g, 'template-1', 'Apple', undefined, '1 lb');

      expect(itemId).toBeTruthy();
      const created = itemsOf(g).find((i) => i.id === itemId);
      expect(created?.name).toBe('Apple');
      expect(created?.type).toBe('item');
      expect(created?.path).toBe('Apple'); // Case preserved, no normalization
      expect(created?.defaultQuantity).toBe('1 lb');
    });

    it('should create item under parent category', async () => {
      const g = graphWith(
        templateFolder('template-1', [item('cat-1', 'Produce', 'category', 'Produce')]),
      );

      await templateService.createItem(g, 'template-1', 'Apple', 'Produce');

      const newItem = itemsOf(g).find((i) => i.name === 'Apple');
      expect(newItem?.path).toBe(`Produce${PATH_SEPARATOR}Apple`);
    });
  });

  describe('archiveItem', () => {
    it('should set archived flag to true', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.archiveItem(g, 'template-1', 'item-1');

      const archived = itemsOf(g).find((i) => i.id === 'item-1');
      expect(archived?.archived).toBe(true);
    });

    it('should archive category and all descendants', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('cat-1', 'Produce', 'category', 'Produce'),
          item('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.archiveItem(g, 'template-1', 'cat-1');

      const items = itemsOf(g);
      expect(items[0].archived).toBe(true); // category archived
      expect(items[1].archived).toBe(true); // descendant item also archived
    });
  });

  describe('renameItem', () => {
    it('should rename item and update path', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.renameItem(g, 'template-1', 'item-1', 'Orange');

      const items = itemsOf(g);
      expect(items[0].name).toBe('Orange');
      expect(items[0].path).toBe(`Produce${PATH_SEPARATOR}Orange`);
    });

    it('should rename category and update descendant paths', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('cat-1', 'Produce', 'category', 'Produce'),
          item('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.renameItem(g, 'template-1', 'cat-1', 'Fresh Produce');

      const items = itemsOf(g);
      expect(items[0].name).toBe('Fresh Produce');
      expect(items[0].path).toBe('Fresh Produce');
      expect(items[1].path).toBe(`Fresh Produce${PATH_SEPARATOR}Apple`);
    });
  });

  describe('moveItem', () => {
    it('should move item to new parent path', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('cat-1', 'Produce', 'category', 'Produce'),
          item('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.moveItem(g, 'template-1', 'item-1', 'Produce');

      const movedItem = itemsOf(g).find((i) => i.id === 'item-1');
      expect(movedItem?.path).toBe(`Produce${PATH_SEPARATOR}Apple`);
    });

    it('should move item to root (undefined parent)', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.moveItem(g, 'template-1', 'item-1', undefined);

      expect(itemsOf(g)[0].path).toBe('Apple');
    });

    it('should move item and update sortOrder when provided', async () => {
      const apple = item('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`);
      apple.sortOrder = 1.0;
      const g = graphWith(
        templateFolder('template-1', [item('cat-1', 'Produce', 'category', 'Produce'), apple]),
      );

      await templateService.moveItem(g, 'template-1', 'item-1', 'Produce', 2.5);

      const movedItem = itemsOf(g).find((i) => i.id === 'item-1');
      expect(movedItem?.path).toBe(`Produce${PATH_SEPARATOR}Apple`);
      expect(movedItem?.sortOrder).toBe(2.5);
    });

    it('should update only sortOrder when path unchanged', async () => {
      const apple = item('item-1', 'Apple', 'item', 'Apple');
      apple.sortOrder = 1.0;
      const g = graphWith(templateFolder('template-1', [apple]));

      await templateService.moveItem(g, 'template-1', 'item-1', undefined, 3.0);

      const items = itemsOf(g);
      expect(items[0].path).toBe('Apple');
      expect(items[0].sortOrder).toBe(3.0);
    });

    it('should move category and update all descendant paths', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('cat-1', 'Fruits', 'category', 'Fruits'),
          item('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`),
        ]),
      );

      await templateService.moveItem(g, 'template-1', 'cat-1', 'Produce');

      const items = itemsOf(g);
      expect(items[0].path).toBe(`Produce${PATH_SEPARATOR}Fruits`);
      expect(items[1].path).toBe(`Produce${PATH_SEPARATOR}Fruits${PATH_SEPARATOR}Apple`);
    });

    it('should throw error for duplicate path', async () => {
      const g = graphWith(
        templateFolder('template-1', [
          item('item-1', 'Apple', 'item', 'Apple'),
          item('item-2', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`),
        ]),
      );

      await expect(templateService.moveItem(g, 'template-1', 'item-2', undefined)).rejects.toThrow(
        'Item already exists at path: Apple',
      );
    });

    it('should not modify items when path unchanged and no sortOrder', async () => {
      const g = graphWith(templateFolder('template-1', [item('item-1', 'Apple', 'item', 'Apple')]));

      await templateService.moveItem(g, 'template-1', 'item-1', undefined);

      // Early return means no write — updated_at stays at its seeded value.
      expect(g.folder('template-1')?.$data.updated_at).toBe(0);
    });
  });

  describe('reorderItem', () => {
    it('should update sortOrder of an item', async () => {
      const items = [
        item('1', 'Apple', 'item', 'apple'),
        item('2', 'Banana', 'item', 'banana'),
        item('3', 'Cherry', 'item', 'cherry'),
      ];
      items[0].sortOrder = 1.0;
      items[1].sortOrder = 2.0;
      items[2].sortOrder = 3.0;
      const g = graphWith(templateFolder('template-1', items));

      // Reorder Banana to position 1.5 (between Apple and Cherry)
      await templateService.reorderItem(g, 'template-1', '2', 1.5);

      const updated = itemsOf(g);
      expect(updated[1].id).toBe('2');
      expect(updated[1].sortOrder).toBe(1.5);
    });

    it('should handle fractional sortOrder values', async () => {
      const items = [item('1', 'First', 'item', 'first'), item('2', 'Second', 'item', 'second')];
      items[0].sortOrder = 1.0;
      items[1].sortOrder = 2.0;
      const g = graphWith(templateFolder('template-1', items));

      await templateService.reorderItem(g, 'template-1', '2', 1.25);

      expect(itemsOf(g)[1].sortOrder).toBe(1.25);
    });

    it('should throw error for nonexistent template', async () => {
      await expect(
        templateService.reorderItem(makeGraph(), 'nonexistent', 'item-1', 1.0),
      ).rejects.toThrow('Template nonexistent not found');
    });

    it('should throw error for nonexistent item', async () => {
      const g = graphWith(templateFolder('template-1', []));

      await expect(
        templateService.reorderItem(g, 'template-1', 'nonexistent', 1.0),
      ).rejects.toThrow('Item nonexistent not found');
    });

    it('should handle very small fractional differences', async () => {
      const items = [item('1', 'A', 'item', 'a'), item('2', 'B', 'item', 'b')];
      items[0].sortOrder = 1.0;
      items[1].sortOrder = 1.0001;
      const g = graphWith(templateFolder('template-1', items));

      await templateService.reorderItem(g, 'template-1', '2', 1.00005);

      expect(itemsOf(g)[1].sortOrder).toBe(1.00005);
    });
  });

  describe('updateItemNotes', () => {
    it('should add notes to an item', async () => {
      const g = graphWith(templateFolder('template-1', [item('item-1', 'Milk', 'item', 'Milk')]));

      await templateService.updateItemNotes(g, 'template-1', 'item-1', 'Get organic');

      const updated = itemsOf(g).find((i) => i.id === 'item-1');
      expect(updated?.notes).toBe('Get organic');
      expect(g.folder('template-1')?.$data.updated_at).toBeGreaterThan(0);
    });

    it('should update existing notes', async () => {
      const milk = item('item-1', 'Milk', 'item', 'Milk');
      milk.notes = 'Old note';
      const g = graphWith(templateFolder('template-1', [milk]));

      await templateService.updateItemNotes(g, 'template-1', 'item-1', 'New note');

      expect(itemsOf(g)[0].notes).toBe('New note');
    });

    it('should remove notes when empty string is provided', async () => {
      const milk = item('item-1', 'Milk', 'item', 'Milk');
      milk.notes = 'Some note';
      const g = graphWith(templateFolder('template-1', [milk]));

      await templateService.updateItemNotes(g, 'template-1', 'item-1', '');

      expect(itemsOf(g)[0].notes).toBeUndefined();
    });

    it('should add notes to a category', async () => {
      const g = graphWith(
        templateFolder('template-1', [item('cat-1', 'Produce', 'category', 'Produce')]),
      );

      await templateService.updateItemNotes(
        g,
        'template-1',
        'cat-1',
        'Fresh fruits and vegetables',
      );

      expect(itemsOf(g)[0].notes).toBe('Fresh fruits and vegetables');
    });

    it('should throw error if template not found', async () => {
      await expect(
        templateService.updateItemNotes(makeGraph(), 'nonexistent', 'item-1', 'Note'),
      ).rejects.toThrow('Template nonexistent not found');
    });

    it('should throw error if item not found', async () => {
      const g = graphWith(templateFolder('template-1', []));

      await expect(
        templateService.updateItemNotes(g, 'template-1', 'nonexistent', 'Note'),
      ).rejects.toThrow('Item nonexistent not found');
    });

    it('should preserve other item properties when updating notes', async () => {
      const milk = item('item-1', 'Milk', 'item', 'Milk');
      milk.sortOrder = 5;
      milk.defaultQuantity = '2';
      const g = graphWith(templateFolder('template-1', [milk]));

      await templateService.updateItemNotes(g, 'template-1', 'item-1', 'Brand: Kirkland');

      const updated = itemsOf(g)[0];
      expect(updated.sortOrder).toBe(5);
      expect(updated.defaultQuantity).toBe('2');
      expect(updated.name).toBe('Milk');
      expect(updated.notes).toBe('Brand: Kirkland');
    });

    it('should not affect other items when updating notes', async () => {
      const bread = item('item-2', 'Bread', 'item', 'Bread');
      bread.notes = 'Whole wheat';
      const g = graphWith(
        templateFolder('template-1', [item('item-1', 'Milk', 'item', 'Milk'), bread]),
      );

      await templateService.updateItemNotes(g, 'template-1', 'item-1', 'Organic');

      const items = itemsOf(g);
      expect(items[0].notes).toBe('Organic');
      expect(items[1].notes).toBe('Whole wheat'); // unchanged
    });
  });
});
