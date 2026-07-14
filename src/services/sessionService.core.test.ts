/**
 * Core session service tests (rowboat port, slice-2).
 *
 * Sessions live in a template-folder row's `sessions` json column; tests run against an
 * in-memory `makeGraph()` graph — no Jazz, no React. All timestamps are epoch-ms NUMBERS.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, ItemState, SessionData, TemplateItem } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import {
  clearSessionState,
  createSession,
  getItemChecked,
  getItemSelected,
  getSession,
  getSessions,
  setItemChecked,
  setItemSelected,
  toggleItemChecked,
  toggleItemSelected,
  updateSessionCounts,
  updateViewMode,
} from './sessionService';

type Graph = ReturnType<typeof makeGraph>;

/** Build a template item. `path` defaults to `name`; categories default to expanded. */
const item = (id: string, name: string, type: 'item' | 'category' = 'item'): TemplateItem => ({
  id,
  name,
  type,
  path: name,
  sortOrder: 0,
  archived: false,
  expanded: type === 'category',
  defaultQuantity: '',
  createdAt: 0,
});

/** Build a session (all epoch-ms number timestamps). */
const session = (id: string, itemStates: Record<string, ItemState> = {}): SessionData => ({
  id,
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

/** Build a complete template-folder row (all required Folder columns present). */
const templateFolder = (
  id: string,
  name: string,
  items: TemplateItem[] = [],
  sessions: SessionData[] = [],
  defaultItems: Record<string, boolean> = {},
): FolderRow => ({
  id,
  owner_group_id: 'group-1',
  name,
  type: 'template-folder',
  parent_id: null,
  sharing_mode: 'private',
  archived: false,
  expanded: true,
  created_by: 'user-1',
  created_at: 0,
  updated_at: 0,
  items,
  sessions,
  default_items: defaultItems,
  show_zone_headings: false,
  auto_categorize_enabled: false,
  autocomplete_domain: 'none',
});

const graphWith = (...folders: FolderRow[]): Graph => makeGraph({ folder: folders });

/** Read a template's sessions, hard-erroring if the folder is missing. */
const sessionsOf = (g: Graph, id = 'template-1'): SessionData[] => {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return node.$data.sessions;
};

describe('sessionService - Core Functions', () => {
  describe('createSession', () => {
    it('should create a new session', async () => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread')];
      const g = graphWith(templateFolder('template-1', 'Groceries', items));

      const sessionId = await createSession(g, 'template-1');

      expect(sessionId).toBeDefined();
      const sessions = sessionsOf(g);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
    });

    it('should initialize session with default items selected', async () => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread'), item('item-3', 'Eggs')];
      const defaultItems = { 'item-1': true, 'item-3': true };
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [], defaultItems));

      const sessionId = await createSession(g, 'template-1');

      const s = sessionsOf(g).find((x) => x.id === sessionId);
      expect(s?.itemStates['item-1']?.selected).toBe(true);
      expect(s?.itemStates['item-2']).toBeUndefined();
      expect(s?.itemStates['item-3']?.selected).toBe(true);
    });

    it('should not include archived items in session', async () => {
      const items = [item('item-1', 'Milk'), { ...item('item-2', 'Bread'), archived: true }];
      const defaultItems = { 'item-1': true, 'item-2': true };
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [], defaultItems));

      const sessionId = await createSession(g, 'template-1');

      const s = sessionsOf(g).find((x) => x.id === sessionId);
      expect(s?.itemStates['item-1']?.selected).toBe(true);
      expect(s?.itemStates['item-2']).toBeUndefined();
    });

    it('should not include categories in session counts', async () => {
      const items = [item('cat-1', 'Dairy', 'category'), item('item-1', 'Milk', 'item')];
      const g = graphWith(templateFolder('template-1', 'Groceries', items));

      const sessionId = await createSession(g, 'template-1');

      const s = sessionsOf(g).find((x) => x.id === sessionId);
      // Only the leaf item should be counted in remainingCount
      expect(s?.remainingCount).toBe(1);
    });

    it('should throw error if template not found', async () => {
      const g = graphWith();

      await expect(createSession(g, 'nonexistent')).rejects.toThrow(
        'Template nonexistent not found',
      );
    });

    it('should create the first session when sessions array starts empty', async () => {
      const items = [item('item-1', 'Milk')];
      const g = graphWith(templateFolder('template-1', 'Groceries', items));

      const sessionId = await createSession(g, 'template-1');

      expect(sessionId).toBeDefined();
      expect(sessionsOf(g)).toHaveLength(1);
    });

    it('should set default view mode', async () => {
      const items = [item('item-1', 'Milk')];
      const g = graphWith(templateFolder('template-1', 'Groceries', items));

      const sessionId = await createSession(g, 'template-1');

      const s = sessionsOf(g).find((x) => x.id === sessionId);
      expect(s?.viewMode).toBe('zone-in-hierarchy');
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const g = graphWith(templateFolder('template-1', 'Groceries', [], [session('session-1')]));

      const result = getSession(g, 'template-1', 'session-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('session-1');
    });

    it('should return null if session not found', () => {
      const g = graphWith(templateFolder('template-1', 'Groceries'));

      expect(getSession(g, 'template-1', 'nonexistent')).toBeNull();
    });

    it('should return null if template not found', () => {
      const g = graphWith();

      expect(getSession(g, 'nonexistent', 'session-1')).toBeNull();
    });
  });

  describe('getSessions', () => {
    it('should return all sessions from template', () => {
      const sessions = [session('session-1'), session('session-2')];
      const g = graphWith(templateFolder('template-1', 'Groceries', [], sessions));

      expect(getSessions(g, 'template-1')).toHaveLength(2);
    });

    it('should return empty array if no sessions exist', () => {
      const g = graphWith(templateFolder('template-1', 'Groceries'));

      expect(getSessions(g, 'template-1')).toEqual([]);
    });

    it('should return empty array if template not found', () => {
      const g = graphWith();

      expect(getSessions(g, 'nonexistent')).toEqual([]);
    });
  });

  describe('Item Selected State', () => {
    const seed = (): Graph => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread')];
      const s = session('session-1', {
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });
      return graphWith(templateFolder('template-1', 'Groceries', items, [s]));
    };

    it('should get item selected state', () => {
      const g = seed();
      expect(getItemSelected(g, 'template-1', 'session-1', 'item-1')).toBe(true);
      expect(getItemSelected(g, 'template-1', 'session-1', 'item-2')).toBe(false);
    });

    it('should set item selected state', async () => {
      const g = seed();
      await setItemSelected(g, 'template-1', 'session-1', 'item-2', true);

      expect(sessionsOf(g)[0].itemStates['item-2']?.selected).toBe(true);
    });

    it('should unselect item', async () => {
      const g = seed();
      await setItemSelected(g, 'template-1', 'session-1', 'item-1', false);

      expect(sessionsOf(g)[0].itemStates['item-1']?.selected).toBe(false);
    });

    it('should toggle item selected state', async () => {
      const g = seed();
      await toggleItemSelected(g, 'template-1', 'session-1', 'item-1');
      expect(sessionsOf(g)[0].itemStates['item-1']?.selected).toBe(false);

      await toggleItemSelected(g, 'template-1', 'session-1', 'item-1');
      expect(sessionsOf(g)[0].itemStates['item-1']?.selected).toBe(true);
    });

    it('should set selectedAt timestamp when selecting', async () => {
      const g = seed();
      const beforeSelect = Date.now();
      await setItemSelected(g, 'template-1', 'session-1', 'item-2', true);

      const selectedAt = sessionsOf(g)[0].itemStates['item-2']?.selectedAt;
      expect(selectedAt).toBeDefined();
      expect(selectedAt as number).toBeGreaterThanOrEqual(beforeSelect);
    });

    it('should clear checked state when deselecting', async () => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread')];
      const s = session('session-1', {
        'item-1': { selected: true, checked: true, selectedAt: 1_700_000_000_000 },
      });
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [s]));

      await setItemSelected(g, 'template-1', 'session-1', 'item-1', false);

      expect(sessionsOf(g)[0].itemStates['item-1']?.checked).toBe(false);
    });

    it('should update createdAt on first item selection', async () => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread')];
      // Session with no selected items and an old createdAt.
      const emptySession = { ...session('session-empty', {}), createdAt: 1 };
      const g = graphWith(templateFolder('template-empty', 'Empty', items, [emptySession]));

      const beforeSelect = Date.now();
      await setItemSelected(g, 'template-empty', 'session-empty', 'item-1', true);

      // createdAt should be updated to now (first selection)
      expect(sessionsOf(g, 'template-empty')[0].createdAt).toBeGreaterThanOrEqual(beforeSelect);
    });

    it('should not change createdAt on subsequent selections', async () => {
      const g = seed();
      const originalCreatedAt = sessionsOf(g)[0].createdAt;

      await setItemSelected(g, 'template-1', 'session-1', 'item-2', true);

      expect(sessionsOf(g)[0].createdAt).toBe(originalCreatedAt);
    });

    it('should skip update when deselecting non-existent item', async () => {
      const g = seed();
      const originalKeys = Object.keys(sessionsOf(g)[0].itemStates);

      // Deselecting an item that doesn't exist should be a no-op
      await setItemSelected(g, 'template-1', 'session-1', 'nonexistent', false);

      expect(Object.keys(sessionsOf(g)[0].itemStates)).toEqual(originalKeys);
    });
  });

  describe('Item Checked State', () => {
    const seed = (): Graph => {
      const items = [item('item-1', 'Milk')];
      const s = session('session-1', {
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });
      return graphWith(templateFolder('template-1', 'Groceries', items, [s]));
    };

    it('should get item checked state', () => {
      const g = seed();
      expect(getItemChecked(g, 'template-1', 'session-1', 'item-1')).toBe(false);
    });

    it('should set item checked state', async () => {
      const g = seed();
      await setItemChecked(g, 'template-1', 'session-1', 'item-1', true);

      expect(sessionsOf(g)[0].itemStates['item-1']?.checked).toBe(true);
    });

    it('should toggle item checked state', async () => {
      const g = seed();
      await toggleItemChecked(g, 'template-1', 'session-1', 'item-1');
      expect(sessionsOf(g)[0].itemStates['item-1']?.checked).toBe(true);

      await toggleItemChecked(g, 'template-1', 'session-1', 'item-1');
      expect(sessionsOf(g)[0].itemStates['item-1']?.checked).toBe(false);
    });

    it('should set checkedAt timestamp when checking', async () => {
      const g = seed();
      const beforeCheck = Date.now();
      await setItemChecked(g, 'template-1', 'session-1', 'item-1', true);

      const checkedAt = sessionsOf(g)[0].itemStates['item-1']?.checkedAt;
      expect(checkedAt).toBeDefined();
      expect(checkedAt as number).toBeGreaterThanOrEqual(beforeCheck);
    });

    it('should clear checkedAt when unchecking', async () => {
      const g = seed();
      await setItemChecked(g, 'template-1', 'session-1', 'item-1', true);
      await setItemChecked(g, 'template-1', 'session-1', 'item-1', false);

      expect(sessionsOf(g)[0].itemStates['item-1']?.checkedAt).toBeUndefined();
    });

    it('should throw error if item state does not exist', async () => {
      const g = seed();
      await expect(
        setItemChecked(g, 'template-1', 'session-1', 'nonexistent', true),
      ).rejects.toThrow('Item state nonexistent not found in session');
    });
  });

  describe('updateSessionCounts', () => {
    it('should update session counts correctly', async () => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread'), item('item-3', 'Eggs')];
      const s = session('session-1', {
        'item-1': { selected: true, checked: false },
        'item-2': { selected: true, checked: true },
      });
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [s]));

      await updateSessionCounts(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].selectedCount).toBe(1); // item-1
      expect(sessionsOf(g)[0].checkedCount).toBe(1); // item-2
      expect(sessionsOf(g)[0].remainingCount).toBe(1); // item-3
    });

    it('should not count archived items', async () => {
      const items = [item('item-1', 'Milk'), { ...item('item-2', 'Bread'), archived: true }];
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [session('session-1')]));

      await updateSessionCounts(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].remainingCount).toBe(1);
    });

    it('should not count categories', async () => {
      const items = [item('cat-1', 'Dairy', 'category'), item('item-1', 'Milk', 'item')];
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [session('session-1')]));

      await updateSessionCounts(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].remainingCount).toBe(1);
    });
  });

  describe('updateViewMode', () => {
    it('should update view mode to flat', async () => {
      const g = graphWith(templateFolder('template-1', 'Groceries', [], [session('session-1')]));

      await updateViewMode(g, 'template-1', 'session-1', 'flat');

      expect(sessionsOf(g)[0].viewMode).toBe('flat');
    });

    it('should update view mode to zone-in-hierarchy', async () => {
      const s = { ...session('session-1'), viewMode: 'flat' as const };
      const g = graphWith(templateFolder('template-1', 'Groceries', [], [s]));

      await updateViewMode(g, 'template-1', 'session-1', 'zone-in-hierarchy');

      expect(sessionsOf(g)[0].viewMode).toBe('zone-in-hierarchy');
    });

    it('should update lastActivityAt', async () => {
      const s = { ...session('session-1'), lastActivityAt: 1 };
      const g = graphWith(templateFolder('template-1', 'Groceries', [], [s]));

      const before = Date.now();
      await updateViewMode(g, 'template-1', 'session-1', 'flat');

      expect(sessionsOf(g)[0].lastActivityAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('clearSessionState', () => {
    it('should clear all item states in session', async () => {
      const items = [item('item-1', 'Milk'), item('item-2', 'Bread')];
      const s = session('session-1', {
        'item-1': { selected: true, checked: true },
        'item-2': { selected: true, checked: false },
      });
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [s]));

      await clearSessionState(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].itemStates['item-1']?.selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-1']?.checked).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2']?.selected).toBe(false);
      expect(sessionsOf(g)[0].itemStates['item-2']?.checked).toBe(false);
    });

    it('should update lastActivityAt', async () => {
      const items = [item('item-1', 'Milk')];
      const s = {
        ...session('session-1', { 'item-1': { selected: true, checked: false } }),
        lastActivityAt: 1,
      };
      const g = graphWith(templateFolder('template-1', 'Groceries', items, [s]));

      const before = Date.now();
      await clearSessionState(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].lastActivityAt).toBeGreaterThanOrEqual(before);
    });
  });
});
