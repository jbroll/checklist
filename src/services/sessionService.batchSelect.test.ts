/**
 * Batch selection tests (rowboat port, slice-2).
 *
 * Batch select, toggle-all, and invert-selection — over an in-memory `makeGraph()` graph
 * (no sync, no React). All timestamps are epoch-ms NUMBERS.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, ItemState, SessionData, TemplateItem } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import { batchSelectItems, invertItemSelection, toggleSelectAllItems } from './sessionService';

type Graph = ReturnType<typeof makeGraph>;

const item = (id: string, name: string, path: string, sortOrder: number): TemplateItem => ({
  id,
  name,
  type: 'item',
  path,
  sortOrder,
  archived: false,
  expanded: false,
  defaultQuantity: '',
  createdAt: 0,
});

/** Build a session (all epoch-ms number timestamps). */
const session = (itemStates: Record<string, ItemState> = {}): SessionData => ({
  id: 'session-1',
  itemStates,
  archived: false,
  categoryExpanded: {},
  viewMode: 'zone-in-hierarchy',
  selectedCount: 0,
  checkedCount: 0,
  remainingCount: 0,
  createdAt: 1_700_000_000_000,
  lastActivityAt: 1_700_000_000_000,
});

/** Build a complete template-folder row with three leaf items and one session. */
const templateFolder = (s: SessionData): FolderRow => ({
  id: 'template-1',
  owner_group_id: 'group-1',
  name: 'Test Template',
  type: 'template-folder',
  parent_id: null,
  sharing_mode: 'private',
  archived: false,
  expanded: true,
  created_by: 'user-1',
  created_at: 0,
  updated_at: 0,
  items: [
    item('item-1', 'Item 1', 'category1/item-1', 0),
    item('item-2', 'Item 2', 'category1/item-2', 1),
    item('item-3', 'Item 3', 'category2/item-3', 0),
  ],
  sessions: [s],
  default_items: {},
  show_zone_headings: false,
  auto_categorize_enabled: false,
  autocomplete_domain: 'none',
});

const seed = (itemStates: Record<string, ItemState> = {}): Graph =>
  makeGraph({ folder: [templateFolder(session(itemStates))] });

/** Read a template's sessions, hard-erroring if the folder is missing. */
const sessionsOf = (g: Graph, id = 'template-1'): SessionData[] => {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return parseFolderRow(node.$data).sessions;
};

describe('Batch Selection Functions', () => {
  describe('batchSelectItems', () => {
    it('should select multiple items when selected=true', async () => {
      const g = seed();

      await batchSelectItems(g, 'template-1', 'session-1', ['item-1', 'item-2'], true);

      expect(sessionsOf(g)[0].itemStates['item-1']).toBeDefined();
      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-1'].checked).toBe(false);

      expect(sessionsOf(g)[0].itemStates['item-2']).toBeDefined();
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-2'].checked).toBe(false);
    });

    it('should deselect multiple items when selected=false', async () => {
      const g = seed({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
        'item-2': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await batchSelectItems(g, 'template-1', 'session-1', ['item-1', 'item-2'], false);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(false);
    });

    it('should not affect items not in the batch', async () => {
      const g = seed({
        'item-3': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await batchSelectItems(g, 'template-1', 'session-1', ['item-1', 'item-2'], true);

      expect(sessionsOf(g)[0].itemStates['item-3'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
    });
  });

  describe('toggleSelectAllItems', () => {
    it('should select all when none are selected', async () => {
      const g = seed();

      await toggleSelectAllItems(g, 'template-1', 'session-1', ['item-1', 'item-2']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
    });

    it('should select all when some are selected', async () => {
      const g = seed({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await toggleSelectAllItems(g, 'template-1', 'session-1', ['item-1', 'item-2']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
    });

    it('should deselect all when all are selected', async () => {
      const g = seed({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
        'item-2': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await toggleSelectAllItems(g, 'template-1', 'session-1', ['item-1', 'item-2']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(false);
    });

    it('should handle empty item list', async () => {
      const g = seed();

      await expect(toggleSelectAllItems(g, 'template-1', 'session-1', [])).resolves.toBeUndefined();
    });
  });

  describe('invertItemSelection', () => {
    it('should invert selection for unselected items', async () => {
      const g = seed();

      await invertItemSelection(g, 'template-1', 'session-1', ['item-1', 'item-2']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
    });

    it('should invert selection for selected items', async () => {
      const g = seed({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
        'item-2': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await invertItemSelection(g, 'template-1', 'session-1', ['item-1', 'item-2']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(false);
    });

    it('should invert mixed selection states', async () => {
      const g = seed({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await invertItemSelection(g, 'template-1', 'session-1', ['item-1', 'item-2', 'item-3']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-3'].selected).toBe(true);
    });

    it('should preserve checked state when inverting from selected to unselected', async () => {
      const g = seed({
        'item-1': {
          selected: true,
          checked: true,
          selectedAt: 1_700_000_000_000,
          checkedAt: 1_700_000_000_000,
        },
      });

      await invertItemSelection(g, 'template-1', 'session-1', ['item-1']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-1'].checked).toBe(false);
    });

    it('should handle empty item list', async () => {
      const g = seed();

      await expect(invertItemSelection(g, 'template-1', 'session-1', [])).resolves.toBeUndefined();
    });

    it('should invert each item individually in mixed state', async () => {
      const g = seed({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
        'item-2': { selected: false, checked: false, selectedAt: 1_700_000_000_000 },
        'item-3': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await invertItemSelection(g, 'template-1', 'session-1', ['item-1', 'item-2', 'item-3']);

      expect(sessionsOf(g)[0].itemStates['item-1'].selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2'].selected).toBe(true);
      expect(sessionsOf(g)[0].itemStates['item-3'].selected).toBe(false);
    });
  });
});
