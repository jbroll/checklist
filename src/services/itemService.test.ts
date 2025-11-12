/**
 * Unit tests for item service
 * Tests item operations including create, rename, delete, and expand/collapse
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateItem } from '../schemas';
import { PATH_SEPARATOR } from '../utils/pathUtils';
import * as itemService from './itemService';

// Mock Template for testing
const createMockTemplate = (id: string, items: TemplateItem[] = []) => ({
  $jazz: {
    id,
    set: vi.fn(),
  },
  name: 'Test Template',
  items,
  sessions: [],
  currentSessionId: undefined,
  showZoneHeadings: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Mock Account with templates
const createMockAccount = (templates: any[] = []) =>
  ({
    root: {
      templates,
    },
  }) as any;

// Helper to create template items
const createMockItem = (
  id: string,
  name: string,
  type: 'category' | 'item',
  path: string,
  expanded = false,
): TemplateItem => ({
  id,
  name,
  type,
  path,
  expanded,
  sortOrder: 0,
  archived: false,
  defaultQuantity: '',
  color: '#000000',
  createdAt: new Date(),
});

describe('itemService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggleCategoryExpanded', () => {
    it('should toggle category expanded state from false to true', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce', false);
      const template = createMockTemplate('template-1', [category]);
      const account = createMockAccount([template]);

      itemService.toggleCategoryExpanded(account, 'template-1', 'cat-1');

      expect(template.$jazz.set).toHaveBeenCalledWith(
        'items',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'cat-1',
            expanded: true,
          }),
        ]),
      );
      expect(template.$jazz.set).toHaveBeenCalledWith('updatedAt', expect.any(Date));
    });

    it('should toggle category expanded state from true to false', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce', true);
      const template = createMockTemplate('template-1', [category]);
      const account = createMockAccount([template]);

      itemService.toggleCategoryExpanded(account, 'template-1', 'cat-1');

      expect(template.$jazz.set).toHaveBeenCalledWith(
        'items',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'cat-1',
            expanded: false,
          }),
        ]),
      );
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        itemService.toggleCategoryExpanded(account, 'nonexistent', 'cat-1');
      }).toThrow('Template nonexistent not found');
    });

    it('should throw error if item not found', () => {
      const template = createMockTemplate('template-1', []);
      const account = createMockAccount([template]);

      expect(() => {
        itemService.toggleCategoryExpanded(account, 'template-1', 'nonexistent');
      }).toThrow('Item nonexistent not found');
    });

    it('should throw error if item is not a category', () => {
      const item = createMockItem('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      expect(() => {
        itemService.toggleCategoryExpanded(account, 'template-1', 'item-1');
      }).toThrow('Item item-1 is not a category');
    });

    it('should not affect other items when toggling', () => {
      const category1 = createMockItem('cat-1', 'Produce', 'category', 'Produce', false);
      const category2 = createMockItem('cat-2', 'Dairy', 'category', 'Dairy', true);
      const item = createMockItem('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [category1, category2, item]);
      const account = createMockAccount([template]);

      itemService.toggleCategoryExpanded(account, 'template-1', 'cat-1');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems).toHaveLength(3);
      expect(updatedItems[0].expanded).toBe(true); // cat-1 toggled
      expect(updatedItems[1].expanded).toBe(true); // cat-2 unchanged
      expect(updatedItems[2].type).toBe('item'); // item unchanged
    });

    it('should preserve all other item properties when toggling', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce', false);
      category.color = '#FF0000';
      category.sortOrder = 5;
      category.defaultQuantity = '1';
      const template = createMockTemplate('template-1', [category]);
      const account = createMockAccount([template]);

      itemService.toggleCategoryExpanded(account, 'template-1', 'cat-1');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const updatedCategory = updatedItems[0];
      expect(updatedCategory.color).toBe('#FF0000');
      expect(updatedCategory.sortOrder).toBe(5);
      expect(updatedCategory.defaultQuantity).toBe('1');
      expect(updatedCategory.name).toBe('Produce');
      expect(updatedCategory.path).toBe('Produce'); // Case preserved
    });
  });

  describe('createCategory', () => {
    it('should create a category with default values', () => {
      const template = createMockTemplate('template-1', []);
      const account = createMockAccount([template]);

      const categoryId = itemService.createCategory(account, 'template-1', 'Produce');

      expect(categoryId).toBeTruthy();
      expect(template.$jazz.set).toHaveBeenCalledWith(
        'items',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Produce',
            type: 'category',
            path: 'Produce', // Case preserved, no normalization
            expanded: true, // Categories start expanded by default
          }),
        ]),
      );
    });

    it('should create a category with custom color', () => {
      const template = createMockTemplate('template-1', []);
      const account = createMockAccount([template]);

      itemService.createCategory(account, 'template-1', 'Produce', undefined, '#FF0000');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].color).toBe('#FF0000');
    });

    it('should create a nested category under parent', () => {
      const parentCategory = createMockItem('cat-1', 'Produce', 'category', 'Produce');
      const template = createMockTemplate('template-1', [parentCategory]);
      const account = createMockAccount([template]);

      itemService.createCategory(account, 'template-1', 'Fruits', 'Produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const newCategory = updatedItems.find((i: TemplateItem) => i.name === 'Fruits');
      expect(newCategory?.path).toBe(`Produce${PATH_SEPARATOR}Fruits`);
    });
  });

  describe('createItem', () => {
    it('should create an item with default quantity', () => {
      const template = createMockTemplate('template-1', []);
      const account = createMockAccount([template]);

      const itemId = itemService.createItem(account, 'template-1', 'Apple', undefined, '1 lb');

      expect(itemId).toBeTruthy();
      expect(template.$jazz.set).toHaveBeenCalledWith(
        'items',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Apple',
            type: 'item',
            path: 'Apple', // Case preserved, no normalization
            defaultQuantity: '1 lb',
          }),
        ]),
      );
    });

    it('should create item under parent category', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce');
      const template = createMockTemplate('template-1', [category]);
      const account = createMockAccount([template]);

      itemService.createItem(account, 'template-1', 'Apple', 'Produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const newItem = updatedItems.find((i: TemplateItem) => i.name === 'Apple');
      expect(newItem?.path).toBe(`Produce${PATH_SEPARATOR}Apple`);
    });
  });

  describe('archiveItem', () => {
    it('should set archived flag to true', () => {
      const item = createMockItem('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      itemService.archiveItem(account, 'template-1', 'item-1');

      expect(template.$jazz.set).toHaveBeenCalledWith(
        'items',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'item-1',
            archived: true,
          }),
        ]),
      );
    });

    it('should archive category and all descendants', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce');
      const item = createMockItem('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [category, item]);
      const account = createMockAccount([template]);

      itemService.archiveItem(account, 'template-1', 'cat-1');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].archived).toBe(true); // category archived
      expect(updatedItems[1].archived).toBe(true); // descendant item also archived
    });
  });

  describe('renameItem', () => {
    it('should rename item and update path', () => {
      const item = createMockItem('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      itemService.renameItem(account, 'template-1', 'item-1', 'Orange');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].name).toBe('Orange');
      expect(updatedItems[0].path).toBe(`Produce${PATH_SEPARATOR}Orange`);
    });

    it('should rename category and update descendant paths', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce');
      const item = createMockItem('item-1', 'Apple', 'item', `Produce${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [category, item]);
      const account = createMockAccount([template]);

      itemService.renameItem(account, 'template-1', 'cat-1', 'Fresh Produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].name).toBe('Fresh Produce');
      expect(updatedItems[0].path).toBe('Fresh Produce');
      expect(updatedItems[1].path).toBe(`Fresh Produce${PATH_SEPARATOR}Apple`);
    });
  });

  describe('moveItem', () => {
    it('should move item to new parent path', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce');
      const item = createMockItem('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [category, item]);
      const account = createMockAccount([template]);

      itemService.moveItem(account, 'template-1', 'item-1', 'Produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const movedItem = updatedItems.find((i: TemplateItem) => i.id === 'item-1');
      expect(movedItem?.path).toBe(`Produce${PATH_SEPARATOR}Apple`);
    });

    it('should move item to root (undefined parent)', () => {
      const item = createMockItem('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      itemService.moveItem(account, 'template-1', 'item-1', undefined);

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].path).toBe('Apple');
    });

    it('should move item and update sortOrder when provided', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'Produce');
      const item = createMockItem('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`);
      item.sortOrder = 1.0;
      const template = createMockTemplate('template-1', [category, item]);
      const account = createMockAccount([template]);

      itemService.moveItem(account, 'template-1', 'item-1', 'Produce', 2.5);

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const movedItem = updatedItems.find((i: TemplateItem) => i.id === 'item-1');
      expect(movedItem?.path).toBe(`Produce${PATH_SEPARATOR}Apple`);
      expect(movedItem?.sortOrder).toBe(2.5);
    });

    it('should update only sortOrder when path unchanged', () => {
      const item = createMockItem('item-1', 'Apple', 'item', 'Apple');
      item.sortOrder = 1.0;
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      itemService.moveItem(account, 'template-1', 'item-1', undefined, 3.0);

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].path).toBe('Apple');
      expect(updatedItems[0].sortOrder).toBe(3.0);
    });

    it('should move category and update all descendant paths', () => {
      const category = createMockItem('cat-1', 'Fruits', 'category', 'Fruits');
      const item = createMockItem('item-1', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [category, item]);
      const account = createMockAccount([template]);

      itemService.moveItem(account, 'template-1', 'cat-1', 'Produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].path).toBe(`Produce${PATH_SEPARATOR}Fruits`);
      expect(updatedItems[1].path).toBe(`Produce${PATH_SEPARATOR}Fruits${PATH_SEPARATOR}Apple`);
    });

    it('should throw error for duplicate path', () => {
      const item1 = createMockItem('item-1', 'Apple', 'item', 'Apple');
      const item2 = createMockItem('item-2', 'Apple', 'item', `Fruits${PATH_SEPARATOR}Apple`);
      const template = createMockTemplate('template-1', [item1, item2]);
      const account = createMockAccount([template]);

      expect(() => {
        itemService.moveItem(account, 'template-1', 'item-2', undefined);
      }).toThrow('Item already exists at path: Apple');
    });

    it('should not modify items when path unchanged and no sortOrder', () => {
      const item = createMockItem('item-1', 'Apple', 'item', 'Apple');
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      itemService.moveItem(account, 'template-1', 'item-1', undefined);

      expect(template.$jazz.set).not.toHaveBeenCalled();
    });
  });

  describe('reorderItem', () => {
    it('should update sortOrder of an item', () => {
      const items = [
        createMockItem('1', 'Apple', 'item', 'apple'),
        createMockItem('2', 'Banana', 'item', 'banana'),
        createMockItem('3', 'Cherry', 'item', 'cherry'),
      ];
      items[0].sortOrder = 1.0;
      items[1].sortOrder = 2.0;
      items[2].sortOrder = 3.0;

      const template = createMockTemplate('template-1', items);
      const account = createMockAccount([template]);

      // Reorder Banana to position 1.5 (between Apple and Cherry)
      itemService.reorderItem(account, 'template-1', '2', 1.5);

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[1].id).toBe('2');
      expect(updatedItems[1].sortOrder).toBe(1.5);
    });

    it('should handle fractional sortOrder values', () => {
      const items = [
        createMockItem('1', 'First', 'item', 'first'),
        createMockItem('2', 'Second', 'item', 'second'),
      ];
      items[0].sortOrder = 1.0;
      items[1].sortOrder = 2.0;

      const template = createMockTemplate('template-1', items);
      const account = createMockAccount([template]);

      // Insert between with fractional value
      itemService.reorderItem(account, 'template-1', '2', 1.25);

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[1].sortOrder).toBe(1.25);
    });

    it('should throw error for nonexistent template', () => {
      const account = createMockAccount([]);

      expect(() => {
        itemService.reorderItem(account, 'nonexistent', 'item-1', 1.0);
      }).toThrow('Template nonexistent not found');
    });

    it('should throw error for nonexistent item', () => {
      const template = createMockTemplate('template-1', []);
      const account = createMockAccount([template]);

      expect(() => {
        itemService.reorderItem(account, 'template-1', 'nonexistent', 1.0);
      }).toThrow('Item nonexistent not found');
    });

    it('should handle very small fractional differences', () => {
      const items = [createMockItem('1', 'A', 'item', 'a'), createMockItem('2', 'B', 'item', 'b')];
      items[0].sortOrder = 1.0;
      items[1].sortOrder = 1.0001;

      const template = createMockTemplate('template-1', items);
      const account = createMockAccount([template]);

      // Insert with tiny fractional value
      itemService.reorderItem(account, 'template-1', '2', 1.00005);

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[1].sortOrder).toBe(1.00005);
    });
  });
});
