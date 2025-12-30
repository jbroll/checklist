/**
 * Unit tests for useSessionItems hook
 *
 * Tests item filtering, partitioning, and sorting logic.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSessionItems } from './useSessionItems';

describe('useSessionItems', () => {
  const createMockItem = (
    overrides: Partial<{
      id: string;
      name: string;
      type: 'item' | 'category';
      archived: boolean;
      sortOrder: number;
      path: string;
    }> = {},
  ) => ({
    id: overrides.id ?? 'item-1',
    name: overrides.name ?? 'Test Item',
    type: overrides.type ?? 'item',
    archived: overrides.archived ?? false,
    sortOrder: overrides.sortOrder ?? 0,
    path: overrides.path ?? 'item-1',
  });

  describe('activeItems filtering', () => {
    it('returns empty arrays when template is null', () => {
      const { result } = renderHook(() =>
        useSessionItems({
          template: null,
          session: null,
        }),
      );

      expect(result.current.activeItems).toEqual([]);
      expect(result.current.availableItems).toEqual([]);
      expect(result.current.selectedItems).toEqual([]);
      expect(result.current.checkedItems).toEqual([]);
    });

    it('returns empty arrays when template has no items', () => {
      const { result } = renderHook(() =>
        useSessionItems({
          template: { items: [] } as any,
          session: null,
        }),
      );

      expect(result.current.activeItems).toEqual([]);
    });

    it('filters out archived items', () => {
      const items = [
        createMockItem({ id: '1', name: 'Active', archived: false }),
        createMockItem({ id: '2', name: 'Archived', archived: true }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: null,
        }),
      );

      expect(result.current.activeItems).toHaveLength(1);
      expect(result.current.activeItems[0].name).toBe('Active');
    });

    it('filters out category items', () => {
      const items = [
        createMockItem({ id: '1', name: 'Item', type: 'item' }),
        createMockItem({ id: '2', name: 'Category', type: 'category' }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: null,
        }),
      );

      expect(result.current.activeItems).toHaveLength(1);
      expect(result.current.activeItems[0].name).toBe('Item');
    });

    it('filters out null items', () => {
      const items = [
        createMockItem({ id: '1', name: 'Valid' }),
        null,
        createMockItem({ id: '2', name: 'Also Valid' }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: null,
        }),
      );

      expect(result.current.activeItems).toHaveLength(2);
    });
  });

  describe('item partitioning with session', () => {
    const items = [
      createMockItem({ id: '1', name: 'Item A', sortOrder: 1 }),
      createMockItem({ id: '2', name: 'Item B', sortOrder: 2 }),
      createMockItem({ id: '3', name: 'Item C', sortOrder: 3 }),
    ];

    it('puts all items in available when no session state', () => {
      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: { itemStates: {} },
        }),
      );

      expect(result.current.availableItems).toHaveLength(3);
      expect(result.current.selectedItems).toHaveLength(0);
      expect(result.current.checkedItems).toHaveLength(0);
    });

    it('adds selected items to both available and selected zones', () => {
      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: {
            itemStates: {
              '1': { selected: true },
              '2': { selected: false },
            },
          },
        }),
      );

      expect(result.current.availableItems).toHaveLength(3);
      expect(result.current.selectedItems).toHaveLength(1);
      expect(result.current.selectedItems[0].id).toBe('1');
      expect(result.current.checkedItems).toHaveLength(0);
    });

    it('adds checked items to both available and checked zones', () => {
      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: {
            itemStates: {
              '1': { checked: true },
              '2': { selected: true },
            },
          },
        }),
      );

      expect(result.current.availableItems).toHaveLength(3);
      expect(result.current.selectedItems).toHaveLength(1);
      expect(result.current.selectedItems[0].id).toBe('2');
      expect(result.current.checkedItems).toHaveLength(1);
      expect(result.current.checkedItems[0].id).toBe('1');
    });

    it('checked takes priority over selected', () => {
      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: {
            itemStates: {
              '1': { selected: true, checked: true },
            },
          },
        }),
      );

      expect(result.current.selectedItems).toHaveLength(0);
      expect(result.current.checkedItems).toHaveLength(1);
    });
  });

  describe('sorting', () => {
    it('sorts items by sortOrder', () => {
      const items = [
        createMockItem({ id: '3', name: 'Third', sortOrder: 30 }),
        createMockItem({ id: '1', name: 'First', sortOrder: 10 }),
        createMockItem({ id: '2', name: 'Second', sortOrder: 20 }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: { itemStates: {} },
        }),
      );

      expect(result.current.availableItems[0].id).toBe('1');
      expect(result.current.availableItems[1].id).toBe('2');
      expect(result.current.availableItems[2].id).toBe('3');
    });

    it('uses name as tiebreaker for equal sortOrder', () => {
      const items = [
        createMockItem({ id: '1', name: 'Banana', sortOrder: 10 }),
        createMockItem({ id: '2', name: 'Apple', sortOrder: 10 }),
        createMockItem({ id: '3', name: 'Cherry', sortOrder: 10 }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: { itemStates: {} },
        }),
      );

      expect(result.current.availableItems[0].name).toBe('Apple');
      expect(result.current.availableItems[1].name).toBe('Banana');
      expect(result.current.availableItems[2].name).toBe('Cherry');
    });

    it('sorts selected items separately', () => {
      const items = [
        createMockItem({ id: '3', name: 'Third', sortOrder: 30 }),
        createMockItem({ id: '1', name: 'First', sortOrder: 10 }),
        createMockItem({ id: '2', name: 'Second', sortOrder: 20 }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: {
            itemStates: {
              '3': { selected: true },
              '1': { selected: true },
            },
          },
        }),
      );

      expect(result.current.selectedItems).toHaveLength(2);
      expect(result.current.selectedItems[0].id).toBe('1');
      expect(result.current.selectedItems[1].id).toBe('3');
    });

    it('sorts checked items separately', () => {
      const items = [
        createMockItem({ id: '3', name: 'Third', sortOrder: 30 }),
        createMockItem({ id: '1', name: 'First', sortOrder: 10 }),
        createMockItem({ id: '2', name: 'Second', sortOrder: 20 }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: {
            itemStates: {
              '3': { checked: true },
              '2': { checked: true },
            },
          },
        }),
      );

      expect(result.current.checkedItems).toHaveLength(2);
      expect(result.current.checkedItems[0].id).toBe('2');
      expect(result.current.checkedItems[1].id).toBe('3');
    });
  });

  describe('null session handling', () => {
    it('returns all active items but no partitioned lists when session is null', () => {
      const items = [
        createMockItem({ id: '1', name: 'Item 1' }),
        createMockItem({ id: '2', name: 'Item 2' }),
      ];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: null,
        }),
      );

      expect(result.current.activeItems).toHaveLength(2);
      expect(result.current.availableItems).toHaveLength(0);
      expect(result.current.selectedItems).toHaveLength(0);
      expect(result.current.checkedItems).toHaveLength(0);
    });
  });

  describe('null itemStates handling', () => {
    it('treats null itemStates same as empty object', () => {
      const items = [createMockItem({ id: '1', name: 'Item 1' })];

      const { result } = renderHook(() =>
        useSessionItems({
          template: { items } as any,
          session: { itemStates: null } as any,
        }),
      );

      expect(result.current.availableItems).toHaveLength(1);
      expect(result.current.selectedItems).toHaveLength(0);
      expect(result.current.checkedItems).toHaveLength(0);
    });
  });

  describe('memoization', () => {
    it('returns same reference when inputs unchanged', () => {
      const items = [createMockItem({ id: '1' })];
      const template = { items } as any;
      const session = { itemStates: {} };

      const { result, rerender } = renderHook(() => useSessionItems({ template, session }));

      const firstResult = result.current;

      rerender();

      expect(result.current.activeItems).toBe(firstResult.activeItems);
      expect(result.current.availableItems).toBe(firstResult.availableItems);
    });
  });
});
