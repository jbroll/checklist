/**
 * Unit tests for schemas/tree.ts
 *
 * Tests the pure functions and type exports.
 * Note: Jazz CoValue behavior is tested via integration/E2E tests.
 */

import { describe, expect, it } from 'vitest';
import { FolderNode, type ItemState, type SessionData, Template, type TemplateItem } from './tree';

describe('schemas/tree', () => {
  describe('type exports', () => {
    it('should export TemplateItem type with correct shape', () => {
      const item: TemplateItem = {
        id: 'item-1',
        name: 'Test Item',
        type: 'item',
        path: 'test',
        expanded: false,
        sortOrder: 0,
        archived: false,
        defaultQuantity: '',
        createdAt: new Date(),
      };

      expect(item.id).toBe('item-1');
      expect(item.name).toBe('Test Item');
      expect(item.type).toBe('item');
      expect(item.path).toBe('test');
      expect(item.expanded).toBe(false);
      expect(item.sortOrder).toBe(0);
      expect(item.archived).toBe(false);
      expect(item.defaultQuantity).toBe('');
      expect(item.createdAt).toBeInstanceOf(Date);
    });

    it('should export TemplateItem type with optional notes', () => {
      const item: TemplateItem = {
        id: 'item-1',
        name: 'Test Item',
        type: 'item',
        path: 'test',
        expanded: false,
        sortOrder: 0,
        archived: false,
        defaultQuantity: '',
        notes: 'Some notes',
        createdAt: new Date(),
      };

      expect(item.notes).toBe('Some notes');
    });

    it('should export TemplateItem category type', () => {
      const category: TemplateItem = {
        id: 'cat-1',
        name: 'Test Category',
        type: 'category',
        path: 'category',
        expanded: true,
        sortOrder: 0,
        archived: false,
        defaultQuantity: '',
        createdAt: new Date(),
      };

      expect(category.type).toBe('category');
      expect(category.expanded).toBe(true);
    });

    it('should export ItemState type with correct shape', () => {
      const state: ItemState = {
        selected: true,
        checked: false,
      };

      expect(state.selected).toBe(true);
      expect(state.checked).toBe(false);
    });

    it('should export ItemState type with optional timestamps', () => {
      const now = new Date();
      const state: ItemState = {
        selected: true,
        checked: true,
        selectedAt: now,
        checkedAt: now,
      };

      expect(state.selectedAt).toEqual(now);
      expect(state.checkedAt).toEqual(now);
    });

    it('should export ItemState type with optional notes', () => {
      const state: ItemState = {
        selected: true,
        checked: false,
        notes: 'Session note',
      };

      expect(state.notes).toBe('Session note');
    });

    it('should export SessionData type with correct shape', () => {
      const now = new Date();
      const session: SessionData = {
        id: 'session-1',
        itemStates: {},
        archived: false,
        categoryExpanded: {},
        viewMode: 'zone-in-hierarchy',
        selectedCount: 0,
        checkedCount: 0,
        remainingCount: 0,
        createdAt: now,
        lastActivityAt: now,
      };

      expect(session.id).toBe('session-1');
      expect(session.itemStates).toEqual({});
      expect(session.archived).toBe(false);
      expect(session.viewMode).toBe('zone-in-hierarchy');
      expect(session.selectedCount).toBe(0);
      expect(session.createdAt).toEqual(now);
    });

    it('should export SessionData with flat view mode', () => {
      const now = new Date();
      const session: SessionData = {
        id: 'session-1',
        itemStates: {},
        archived: false,
        categoryExpanded: {},
        viewMode: 'flat',
        selectedCount: 0,
        checkedCount: 0,
        remainingCount: 0,
        createdAt: now,
        lastActivityAt: now,
      };

      expect(session.viewMode).toBe('flat');
    });

    it('should export SessionData with item states', () => {
      const now = new Date();
      const session: SessionData = {
        id: 'session-1',
        itemStates: {
          'item-1': { selected: true, checked: false },
          'item-2': { selected: true, checked: true, checkedAt: now },
        },
        archived: false,
        categoryExpanded: { 'cat-1': true },
        viewMode: 'zone-in-hierarchy',
        selectedCount: 2,
        checkedCount: 1,
        remainingCount: 1,
        createdAt: now,
        lastActivityAt: now,
      };

      expect(session.itemStates['item-1'].selected).toBe(true);
      expect(session.itemStates['item-2'].checked).toBe(true);
      expect(session.categoryExpanded['cat-1']).toBe(true);
      expect(session.selectedCount).toBe(2);
      expect(session.checkedCount).toBe(1);
      expect(session.remainingCount).toBe(1);
    });
  });

  describe('CoValue exports', () => {
    it('should export FolderNode schema', () => {
      expect(FolderNode).toBeDefined();
    });

    it('should export Template schema', () => {
      expect(Template).toBeDefined();
    });
  });
});
