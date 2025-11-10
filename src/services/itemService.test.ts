/**
 * Unit tests for item service
 * Tests item operations including create, rename, delete, and expand/collapse
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateItem } from '../schemas';
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
      const category = createMockItem('cat-1', 'Produce', 'category', 'produce', false);
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
      const category = createMockItem('cat-1', 'Produce', 'category', 'produce', true);
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
      const item = createMockItem('item-1', 'Apple', 'item', 'produce/apple');
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      expect(() => {
        itemService.toggleCategoryExpanded(account, 'template-1', 'item-1');
      }).toThrow('Item item-1 is not a category');
    });

    it('should not affect other items when toggling', () => {
      const category1 = createMockItem('cat-1', 'Produce', 'category', 'produce', false);
      const category2 = createMockItem('cat-2', 'Dairy', 'category', 'dairy', true);
      const item = createMockItem('item-1', 'Apple', 'item', 'produce/apple');
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
      const category = createMockItem('cat-1', 'Produce', 'category', 'produce', false);
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
      expect(updatedCategory.path).toBe('produce');
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
            path: 'produce',
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
      const parentCategory = createMockItem('cat-1', 'Produce', 'category', 'produce');
      const template = createMockTemplate('template-1', [parentCategory]);
      const account = createMockAccount([template]);

      itemService.createCategory(account, 'template-1', 'Fruits', 'produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const newCategory = updatedItems.find((i: TemplateItem) => i.name === 'Fruits');
      expect(newCategory?.path).toBe('produce/fruits');
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
            path: 'apple',
            defaultQuantity: '1 lb',
          }),
        ]),
      );
    });

    it('should create item under parent category', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'produce');
      const template = createMockTemplate('template-1', [category]);
      const account = createMockAccount([template]);

      itemService.createItem(account, 'template-1', 'Apple', 'produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      const newItem = updatedItems.find((i: TemplateItem) => i.name === 'Apple');
      expect(newItem?.path).toBe('produce/apple');
    });
  });

  describe('archiveItem', () => {
    it('should set archived flag to true', () => {
      const item = createMockItem('item-1', 'Apple', 'item', 'produce/apple');
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
      const category = createMockItem('cat-1', 'Produce', 'category', 'produce');
      const item = createMockItem('item-1', 'Apple', 'item', 'produce/apple');
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
      const item = createMockItem('item-1', 'Apple', 'item', 'produce/apple');
      const template = createMockTemplate('template-1', [item]);
      const account = createMockAccount([template]);

      itemService.renameItem(account, 'template-1', 'item-1', 'Orange');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].name).toBe('Orange');
      expect(updatedItems[0].path).toBe('produce/orange');
    });

    it('should rename category and update descendant paths', () => {
      const category = createMockItem('cat-1', 'Produce', 'category', 'produce');
      const item = createMockItem('item-1', 'Apple', 'item', 'produce/apple');
      const template = createMockTemplate('template-1', [category, item]);
      const account = createMockAccount([template]);

      itemService.renameItem(account, 'template-1', 'cat-1', 'Fresh Produce');

      const updatedItems = (template.$jazz.set as any).mock.calls[0][1];
      expect(updatedItems[0].name).toBe('Fresh Produce');
      expect(updatedItems[0].path).toBe('fresh-produce');
      expect(updatedItems[1].path).toBe('fresh-produce/apple');
    });
  });
});
