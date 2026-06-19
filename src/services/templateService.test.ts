/**
 * Unit tests for template service
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { TemplateItem } from '../schema';
import { PATH_SEPARATOR } from '../utils/pathUtils';
import * as templateService from './templateService';

// Mock Template (FolderNode with items) for testing
const createMockTemplate = (id: string, name: string, items: TemplateItem[] = []) => {
  const template: any = {
    name,
    items,
    sessions: [],
    showZoneHeadings: false,
    archived: false,
    expanded: true,
    defaultItems: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  template.$jazz = {
    id,
    set: (key: string, value: any) => {
      template[key] = value;
    },
  };
  return template;
};

// Create mock template item
const createMockItem = (
  id: string,
  name: string,
  type: 'item' | 'category' = 'item',
  path?: string,
  sortOrder = 0,
): TemplateItem =>
  ({
    id,
    name,
    type,
    path: path ?? name.toLowerCase(),
    sortOrder,
    archived: false,
    expanded: type === 'category',
    defaultQuantity: '',
    createdAt: new Date(),
  }) as TemplateItem;

// Mock Account with folders (templates are FolderNodes now)
const createMockAccount = (folders: any[] = []) =>
  ({
    root: {
      folders,
    },
  }) as any;

describe('templateService', () => {
  beforeEach(() => {
    // Reset any state between tests
  });

  describe('getTemplate', () => {
    it('should return template by ID', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');
      const template2 = createMockTemplate('template-2', 'Shopping List');

      const account = createMockAccount([template1, template2]);
      const result = templateService.getTemplate(account, 'template-1');

      expect(result).toEqual(template1);
      expect(result?.name).toBe('Grocery List');
    });

    it('should return null if template not found', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');

      const account = createMockAccount([template1]);
      const result = templateService.getTemplate(account, 'nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null if templates array is empty', () => {
      const account = createMockAccount([]);
      const result = templateService.getTemplate(account, 'any-id');

      expect(result).toBeNull();
    });

    it('should return null if root.templates is undefined', () => {
      const account = { root: {} } as any;
      const result = templateService.getTemplate(account, 'any-id');

      expect(result).toBeNull();
    });

    it('should return null if root is undefined', () => {
      const account = {} as any;
      const result = templateService.getTemplate(account, 'any-id');

      expect(result).toBeNull();
    });

    it('should handle multiple templates and return correct one', () => {
      const templates = [
        createMockTemplate('template-1', 'List 1'),
        createMockTemplate('template-2', 'List 2'),
        createMockTemplate('template-3', 'List 3'),
        createMockTemplate('template-4', 'List 4'),
      ];

      const account = createMockAccount(templates);
      const result = templateService.getTemplate(account, 'template-3');

      expect(result?.name).toBe('List 3');
      expect(result?.$jazz.id).toBe('template-3');
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');
      const template2 = createMockTemplate('template-2', 'Shopping List');

      const account = createMockAccount([template1, template2]);
      const result = templateService.getAllTemplates(account);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Grocery List');
      expect(result[1].name).toBe('Shopping List');
    });

    it('should return empty array if no templates exist', () => {
      const account = createMockAccount([]);
      const result = templateService.getAllTemplates(account);

      expect(result).toEqual([]);
    });

    it('should return empty array if root.templates is undefined', () => {
      const account = { root: {} } as any;
      const result = templateService.getAllTemplates(account);

      expect(result).toEqual([]);
    });

    it('should return empty array if root is undefined', () => {
      const account = {} as any;
      const result = templateService.getAllTemplates(account);

      expect(result).toEqual([]);
    });

    it('should filter out null templates', () => {
      const template1 = createMockTemplate('template-1', 'List 1');
      const template2 = null;
      const template3 = createMockTemplate('template-3', 'List 3');

      const account = createMockAccount([template1, template2, template3]);
      const result = templateService.getAllTemplates(account);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('List 1');
      expect(result[1].name).toBe('List 3');
    });

    it('should filter out undefined templates', () => {
      const template1 = createMockTemplate('template-1', 'List 1');
      const template2 = undefined;
      const template3 = createMockTemplate('template-3', 'List 3');

      const account = createMockAccount([template1, template2, template3]);
      const result = templateService.getAllTemplates(account);

      expect(result).toHaveLength(2);
    });
  });

  describe('templateExists', () => {
    it('should return true if template exists', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');
      const template2 = createMockTemplate('template-2', 'Shopping List');

      const account = createMockAccount([template1, template2]);
      const result = templateService.templateExists(account, 'template-1');

      expect(result).toBe(true);
    });

    it('should return false if template does not exist', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');

      const account = createMockAccount([template1]);
      const result = templateService.templateExists(account, 'nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return false if templates array is empty', () => {
      const account = createMockAccount([]);
      const result = templateService.templateExists(account, 'any-id');

      expect(result).toBe(false);
    });

    it('should return false if root.templates is undefined', () => {
      const account = { root: {} } as any;
      const result = templateService.templateExists(account, 'any-id');

      expect(result).toBe(false);
    });

    it('should return false if root is undefined', () => {
      const account = {} as any;
      const result = templateService.templateExists(account, 'any-id');

      expect(result).toBe(false);
    });

    it('should work correctly with multiple templates', () => {
      const templates = [
        createMockTemplate('template-1', 'List 1'),
        createMockTemplate('template-2', 'List 2'),
        createMockTemplate('template-3', 'List 3'),
      ];

      const account = createMockAccount(templates);

      expect(templateService.templateExists(account, 'template-1')).toBe(true);
      expect(templateService.templateExists(account, 'template-2')).toBe(true);
      expect(templateService.templateExists(account, 'template-3')).toBe(true);
      expect(templateService.templateExists(account, 'template-4')).toBe(false);
    });

    it('should handle null template in array', () => {
      const template1 = createMockTemplate('template-1', 'List 1');
      const template2 = null;

      const account = createMockAccount([template1, template2]);

      expect(templateService.templateExists(account, 'template-1')).toBe(true);
      expect(templateService.templateExists(account, 'template-2')).toBe(false);
    });
  });

  describe('Item Operations', () => {
    describe('getItem', () => {
      it('should return item by ID', () => {
        const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const result = templateService.getItem(account, 'template-1', 'item-1');

        expect(result).toBeDefined();
        expect(result?.name).toBe('Milk');
      });

      it('should return null if item not found', () => {
        const items = [createMockItem('item-1', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const result = templateService.getItem(account, 'template-1', 'nonexistent');

        expect(result).toBeNull();
      });

      it('should return null if template not found', () => {
        const account = createMockAccount([]);

        const result = templateService.getItem(account, 'nonexistent', 'item-1');

        expect(result).toBeNull();
      });
    });

    describe('getItems', () => {
      it('should return all non-archived items', () => {
        const items = [
          createMockItem('item-1', 'Milk'),
          createMockItem('item-2', 'Bread'),
          { ...createMockItem('item-3', 'Archived'), archived: true } as TemplateItem,
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const result = templateService.getItems(account, 'template-1');

        expect(result).toHaveLength(2);
        expect(result.map((i) => i.name)).toEqual(['Milk', 'Bread']);
      });

      it('should return empty array if template not found', () => {
        const account = createMockAccount([]);

        const result = templateService.getItems(account, 'nonexistent');

        expect(result).toEqual([]);
      });
    });

    describe('getLeafItems', () => {
      it('should return only leaf items (not categories)', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
          createMockItem('item-1', 'Milk', 'item', 'dairy/milk'),
          createMockItem('item-2', 'Bread', 'item', 'bakery/bread'),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const result = templateService.getLeafItems(account, 'template-1');

        expect(result).toHaveLength(2);
        expect(result.every((i) => i.type === 'item')).toBe(true);
      });

      it('should return empty array if template not found', () => {
        const account = createMockAccount([]);

        const result = templateService.getLeafItems(account, 'nonexistent');

        expect(result).toEqual([]);
      });
    });

    describe('createCategory', () => {
      it('should create a new category', () => {
        const template = createMockTemplate('template-1', 'Groceries');
        const account = createMockAccount([template]);

        const categoryId = templateService.createCategory(account, 'template-1', 'Dairy');

        expect(categoryId).toBeDefined();
        expect(template.items).toHaveLength(1);
        expect(template.items[0].name).toBe('Dairy');
        expect(template.items[0].type).toBe('category');
      });

      it('should create category with parent path', () => {
        const items = [createMockItem('cat-1', 'Food', 'category', 'Food')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const categoryId = templateService.createCategory(account, 'template-1', 'Dairy', 'Food');

        expect(categoryId).toBeDefined();
        expect(template.items).toHaveLength(2);
        const newItem = template.items.find((i: TemplateItem) => i.id === categoryId);
        expect(newItem?.path).toBe(`Food${PATH_SEPARATOR}Dairy`);
      });

      it('should throw error if template not found', () => {
        const account = createMockAccount([]);

        expect(() => {
          templateService.createCategory(account, 'nonexistent', 'Dairy');
        }).toThrow('Template nonexistent not found');
      });

      it('should throw error for duplicate path', () => {
        const items = [createMockItem('cat-1', 'Dairy', 'category', 'Dairy')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        expect(() => {
          templateService.createCategory(account, 'template-1', 'Dairy');
        }).toThrow('Item already exists at path: Dairy');
      });
    });

    describe('createItem', () => {
      it('should create a new item', () => {
        const template = createMockTemplate('template-1', 'Groceries');
        const account = createMockAccount([template]);

        const itemId = templateService.createItem(account, 'template-1', 'Milk');

        expect(itemId).toBeDefined();
        expect(template.items).toHaveLength(1);
        expect(template.items[0].name).toBe('Milk');
        expect(template.items[0].type).toBe('item');
      });

      it('should create item with parent path', () => {
        const items = [createMockItem('cat-1', 'Dairy', 'category', 'Dairy')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const itemId = templateService.createItem(account, 'template-1', 'Milk', 'Dairy');

        expect(itemId).toBeDefined();
        const newItem = template.items.find((i: TemplateItem) => i.id === itemId);
        expect(newItem?.path).toBe(`Dairy${PATH_SEPARATOR}Milk`);
      });

      it('should create item with default quantity', () => {
        const template = createMockTemplate('template-1', 'Groceries');
        const account = createMockAccount([template]);

        const itemId = templateService.createItem(account, 'template-1', 'Milk', undefined, '2L');

        const newItem = template.items.find((i: TemplateItem) => i.id === itemId);
        expect(newItem?.defaultQuantity).toBe('2L');
      });

      it('should auto-add item to defaults', () => {
        const template = createMockTemplate('template-1', 'Groceries');
        const account = createMockAccount([template]);

        const itemId = templateService.createItem(account, 'template-1', 'Milk');

        expect(template.defaultItems[itemId]).toBe(true);
      });
    });

    describe('renameItem', () => {
      it('should rename an item', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.renameItem(account, 'template-1', 'item-1', 'Whole Milk');

        expect(template.items[0].name).toBe('Whole Milk');
        expect(template.items[0].path).toBe('Whole Milk');
      });

      it('should update descendant paths when renaming category', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'Dairy'),
          createMockItem('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
          createMockItem('item-2', 'Cheese', 'item', `Dairy${PATH_SEPARATOR}Cheese`),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.renameItem(account, 'template-1', 'cat-1', 'Milk Products');

        expect(template.items[0].path).toBe('Milk Products');
        expect(template.items[1].path).toBe(`Milk Products${PATH_SEPARATOR}Milk`);
        expect(template.items[2].path).toBe(`Milk Products${PATH_SEPARATOR}Cheese`);
      });

      it('should throw error if template not found', () => {
        const account = createMockAccount([]);

        expect(() => {
          templateService.renameItem(account, 'nonexistent', 'item-1', 'New Name');
        }).toThrow('Template nonexistent not found');
      });

      it('should throw error if item not found', () => {
        const template = createMockTemplate('template-1', 'Groceries');
        const account = createMockAccount([template]);

        expect(() => {
          templateService.renameItem(account, 'template-1', 'nonexistent', 'New Name');
        }).toThrow('Item nonexistent not found in template');
      });

      it('should throw error for duplicate path after rename', () => {
        const items = [
          createMockItem('item-1', 'Milk', 'item', 'Milk'),
          createMockItem('item-2', 'Cheese', 'item', 'Cheese'),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        expect(() => {
          templateService.renameItem(account, 'template-1', 'item-1', 'Cheese');
        }).toThrow('Item already exists at path: Cheese');
      });
    });

    describe('updateItemNotes', () => {
      it('should update item notes', () => {
        const items = [createMockItem('item-1', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.updateItemNotes(account, 'template-1', 'item-1', 'Get organic');

        expect(template.items[0].notes).toBe('Get organic');
      });

      it('should clear notes when empty string provided', () => {
        const items = [{ ...createMockItem('item-1', 'Milk'), notes: 'Some note' } as TemplateItem];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.updateItemNotes(account, 'template-1', 'item-1', '');

        expect(template.items[0].notes).toBeUndefined();
      });
    });

    describe('archiveItem', () => {
      it('should archive an item', () => {
        const items = [createMockItem('item-1', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.archiveItem(account, 'template-1', 'item-1');

        expect(template.items[0].archived).toBe(true);
      });

      it('should archive category and all descendants', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'Dairy'),
          createMockItem('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
          createMockItem('item-2', 'Cheese', 'item', `Dairy${PATH_SEPARATOR}Cheese`),
          createMockItem('item-3', 'Bread', 'item', 'Bread'),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.archiveItem(account, 'template-1', 'cat-1');

        expect(template.items[0].archived).toBe(true); // Category
        expect(template.items[1].archived).toBe(true); // Milk
        expect(template.items[2].archived).toBe(true); // Cheese
        expect(template.items[3].archived).toBe(false); // Bread (not in category)
      });

      it('should throw error if item not found', () => {
        const template = createMockTemplate('template-1', 'Groceries');
        const account = createMockAccount([template]);

        expect(() => {
          templateService.archiveItem(account, 'template-1', 'nonexistent');
        }).toThrow('Item nonexistent not found in template');
      });
    });

    describe('moveItem', () => {
      it('should move item to new parent', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'Dairy'),
          createMockItem('cat-2', 'Bakery', 'category', 'Bakery'),
          createMockItem('item-1', 'Milk', 'item', `Bakery${PATH_SEPARATOR}Milk`),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.moveItem(account, 'template-1', 'item-1', 'Dairy');

        expect(template.items[2].path).toBe(`Dairy${PATH_SEPARATOR}Milk`);
      });

      it('should move item to root', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'Dairy'),
          createMockItem('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.moveItem(account, 'template-1', 'item-1', undefined);

        expect(template.items[1].path).toBe('Milk');
      });

      it('should update sortOrder when provided', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'Milk', 0)];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.moveItem(account, 'template-1', 'item-1', undefined, 5);

        expect(template.items[0].sortOrder).toBe(5);
      });

      it('should move category and update all descendant paths', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'Dairy'),
          createMockItem('cat-2', 'Food', 'category', 'Food'),
          createMockItem('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.moveItem(account, 'template-1', 'cat-1', 'Food');

        expect(template.items[0].path).toBe(`Food${PATH_SEPARATOR}Dairy`);
        expect(template.items[2].path).toBe(`Food${PATH_SEPARATOR}Dairy${PATH_SEPARATOR}Milk`);
      });

      it('should not update if path and sortOrder unchanged', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'Milk', 0)];
        const originalUpdatedAt = new Date('2024-01-01');
        const template = createMockTemplate('template-1', 'Groceries', items);
        template.updatedAt = originalUpdatedAt;
        const account = createMockAccount([template]);

        templateService.moveItem(account, 'template-1', 'item-1', undefined);

        // Template should not be updated if no changes
        expect(template.updatedAt).toEqual(originalUpdatedAt);
      });
    });

    describe('Category Expansion', () => {
      it('should get category expanded state', () => {
        const items = [
          {
            ...createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
            expanded: true,
          } as TemplateItem,
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        const result = templateService.getCategoryExpanded(account, 'template-1', 'cat-1');

        expect(result).toBe(true);
      });

      it('should set category expanded state', () => {
        const items = [
          {
            ...createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
            expanded: true,
          } as TemplateItem,
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.setCategoryExpanded(account, 'template-1', 'cat-1', false);

        expect(template.items[0].expanded).toBe(false);
      });

      it('should toggle category expanded state', () => {
        const items = [
          {
            ...createMockItem('cat-1', 'Dairy', 'category', 'dairy'),
            expanded: true,
          } as TemplateItem,
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.toggleCategoryExpanded(account, 'template-1', 'cat-1');

        expect(template.items[0].expanded).toBe(false);

        templateService.toggleCategoryExpanded(account, 'template-1', 'cat-1');

        expect(template.items[0].expanded).toBe(true);
      });

      it('should throw error when getting expanded state for non-category', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        expect(() => {
          templateService.getCategoryExpanded(account, 'template-1', 'item-1');
        }).toThrow('Item item-1 is not a category');
      });

      it('should throw error when setting expanded state for non-category', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        expect(() => {
          templateService.setCategoryExpanded(account, 'template-1', 'item-1', false);
        }).toThrow('Item item-1 is not a category');
      });
    });

    describe('reorderItem', () => {
      it('should update item sortOrder', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'milk', 0)];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.reorderItem(account, 'template-1', 'item-1', 5.5);

        expect(template.items[0].sortOrder).toBe(5.5);
      });
    });

    describe('calculateInsertionPoint', () => {
      it('should return root with sortOrder 0 for empty template', () => {
        const template = createMockTemplate('template-1', 'Groceries');

        const result = templateService.calculateInsertionPoint(template, null);

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(0);
      });

      it('should return sortOrder before first item when nothing selected', () => {
        const items = [
          createMockItem('item-1', 'Milk', 'item', 'Milk', 5),
          createMockItem('item-2', 'Bread', 'item', 'Bread', 10),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);

        const result = templateService.calculateInsertionPoint(template, null);

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(4); // minSortOrder - 1
      });

      it('should return insertion at top of category when category selected', () => {
        const items = [
          createMockItem('cat-1', 'Dairy', 'category', 'Dairy', 0),
          createMockItem('item-1', 'Milk', 'item', `Dairy${PATH_SEPARATOR}Milk`, 5),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);

        const result = templateService.calculateInsertionPoint(template, 'cat-1');

        expect(result.parentPath).toBe('Dairy');
        expect(result.sortOrder).toBe(4); // min child sortOrder - 1
      });

      it('should return insertion after selected item', () => {
        const items = [
          createMockItem('item-1', 'Milk', 'item', 'Milk', 5),
          createMockItem('item-2', 'Bread', 'item', 'Bread', 10),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);

        const result = templateService.calculateInsertionPoint(template, 'item-1');

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(7.5); // (5 + 10) / 2
      });

      it('should return sortOrder after last item when last item selected', () => {
        const items = [
          createMockItem('item-1', 'Milk', 'item', 'Milk', 5),
          createMockItem('item-2', 'Bread', 'item', 'Bread', 10),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);

        const result = templateService.calculateInsertionPoint(template, 'item-2');

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(11); // last sortOrder + 1
      });

      it('should fall back to root if selected item not found', () => {
        const items = [createMockItem('item-1', 'Milk', 'item', 'Milk', 5)];
        const template = createMockTemplate('template-1', 'Groceries', items);

        const result = templateService.calculateInsertionPoint(template, 'nonexistent');

        expect(result.parentPath).toBeUndefined();
        expect(result.sortOrder).toBe(0);
      });
    });

    describe('Default Items Operations', () => {
      it('should set item as default', () => {
        const items = [createMockItem('item-1', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.setItemDefault(account, 'template-1', 'item-1', true);

        expect(template.defaultItems['item-1']).toBe(true);
      });

      it('should remove item from defaults', () => {
        const items = [createMockItem('item-1', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        template.defaultItems = { 'item-1': true };
        const account = createMockAccount([template]);

        templateService.setItemDefault(account, 'template-1', 'item-1', false);

        expect(template.defaultItems['item-1']).toBeUndefined();
      });

      it('should toggle item default state', () => {
        const items = [createMockItem('item-1', 'Milk')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.toggleItemDefault(account, 'template-1', 'item-1');
        expect(template.defaultItems['item-1']).toBe(true);

        templateService.toggleItemDefault(account, 'template-1', 'item-1');
        expect(template.defaultItems['item-1']).toBeUndefined();
      });

      it('should batch set items as default', () => {
        const items = [
          createMockItem('item-1', 'Milk'),
          createMockItem('item-2', 'Bread'),
          createMockItem('item-3', 'Eggs'),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        const account = createMockAccount([template]);

        templateService.batchSetItemsDefault(account, 'template-1', ['item-1', 'item-2'], true);

        expect(template.defaultItems['item-1']).toBe(true);
        expect(template.defaultItems['item-2']).toBe(true);
        expect(template.defaultItems['item-3']).toBeUndefined();
      });

      it('should batch remove items from defaults', () => {
        const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
        const template = createMockTemplate('template-1', 'Groceries', items);
        template.defaultItems = { 'item-1': true, 'item-2': true };
        const account = createMockAccount([template]);

        templateService.batchSetItemsDefault(account, 'template-1', ['item-1'], false);

        expect(template.defaultItems['item-1']).toBeUndefined();
        expect(template.defaultItems['item-2']).toBe(true);
      });

      it('should invert items default state', () => {
        const items = [
          createMockItem('item-1', 'Milk'),
          createMockItem('item-2', 'Bread'),
          createMockItem('item-3', 'Eggs'),
        ];
        const template = createMockTemplate('template-1', 'Groceries', items);
        template.defaultItems = { 'item-1': true };
        const account = createMockAccount([template]);

        templateService.invertItemsDefault(account, 'template-1', ['item-1', 'item-2', 'item-3']);

        expect(template.defaultItems['item-1']).toBeUndefined();
        expect(template.defaultItems['item-2']).toBe(true);
        expect(template.defaultItems['item-3']).toBe(true);
      });
    });
  });
});
