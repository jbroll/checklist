/**
 * Core session service tests
 *
 * Tests for session creation, item state management, and session counts.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, FolderNode, TemplateItem } from '../schemas';
import type { SessionData } from '../schemas/tree';
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

// Mock helpers
const createMockItem = (
  id: string,
  name: string,
  type: 'item' | 'category' = 'item',
): TemplateItem =>
  ({
    id,
    name,
    type,
    path: name,
    sortOrder: 0,
    archived: false,
    expanded: type === 'category',
    defaultQuantity: '',
    createdAt: new Date(),
  }) as TemplateItem;

const createMockSession = (id: string, itemStates: Record<string, any> = {}): SessionData => ({
  id,
  itemStates,
  archived: false,
  categoryExpanded: {},
  viewMode: 'zone-in-hierarchy' as const,
  selectedCount: 0,
  checkedCount: 0,
  remainingCount: 0,
  createdAt: new Date('2024-01-15T10:00:00Z'),
  lastActivityAt: new Date('2024-01-15T12:00:00Z'),
});

const createMockTemplate = (
  id: string,
  name: string,
  items: TemplateItem[] = [],
  sessions: SessionData[] = [],
  defaultItems: Record<string, boolean> = {},
): InstanceOfSchema<typeof FolderNode> => {
  const template: any = {
    name,
    items,
    sessions,
    defaultItems,
    showZoneHeadings: false,
    archived: false,
    expanded: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-10'),
  };
  template.$jazz = {
    id,
    set: (key: string, value: any) => {
      template[key] = value;
    },
  };
  return template;
};

const createMockAccount = (
  templates: InstanceOfSchema<typeof FolderNode>[] = [],
): InstanceOfSchema<typeof Account> =>
  ({
    root: {
      folders: templates,
    },
  }) as any;

describe('sessionService - Core Functions', () => {
  describe('createSession', () => {
    it('should create a new session', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const sessionId = createSession(account, 'template-1');

      expect(sessionId).toBeDefined();
      expect(template.sessions).toHaveLength(1);
      expect(template.sessions[0].id).toBe(sessionId);
    });

    it('should initialize session with default items selected', () => {
      const items = [
        createMockItem('item-1', 'Milk'),
        createMockItem('item-2', 'Bread'),
        createMockItem('item-3', 'Eggs'),
      ];
      const defaultItems = { 'item-1': true, 'item-3': true };
      const template = createMockTemplate('template-1', 'Groceries', items, [], defaultItems);
      const account = createMockAccount([template]);

      const sessionId = createSession(account, 'template-1');

      const session = template.sessions.find((s: SessionData) => s.id === sessionId);
      expect(session?.itemStates['item-1']?.selected).toBe(true);
      expect(session?.itemStates['item-2']).toBeUndefined();
      expect(session?.itemStates['item-3']?.selected).toBe(true);
    });

    it('should not include archived items in session', () => {
      const items = [
        createMockItem('item-1', 'Milk'),
        { ...createMockItem('item-2', 'Bread'), archived: true } as TemplateItem,
      ];
      const defaultItems = { 'item-1': true, 'item-2': true };
      const template = createMockTemplate('template-1', 'Groceries', items, [], defaultItems);
      const account = createMockAccount([template]);

      const sessionId = createSession(account, 'template-1');

      const session = template.sessions.find((s: SessionData) => s.id === sessionId);
      expect(session?.itemStates['item-1']?.selected).toBe(true);
      expect(session?.itemStates['item-2']).toBeUndefined();
    });

    it('should not include categories in session counts', () => {
      const items = [
        createMockItem('cat-1', 'Dairy', 'category'),
        createMockItem('item-1', 'Milk', 'item'),
      ];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const sessionId = createSession(account, 'template-1');

      const session = template.sessions.find((s: SessionData) => s.id === sessionId);
      // Only the leaf item should be counted in remainingCount
      expect(session?.remainingCount).toBe(1);
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        createSession(account, 'nonexistent');
      }).toThrow('Template nonexistent not found');
    });

    it('should set default view mode', () => {
      const items = [createMockItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const sessionId = createSession(account, 'template-1');

      const session = template.sessions.find((s: SessionData) => s.id === sessionId);
      expect(session?.viewMode).toBe('zone-in-hierarchy');
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', 'Groceries', [], [session]);
      const account = createMockAccount([template]);

      const result = getSession(account, 'template-1', 'session-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('session-1');
    });

    it('should return null if session not found', () => {
      const template = createMockTemplate('template-1', 'Groceries', [], []);
      const account = createMockAccount([template]);

      const result = getSession(account, 'template-1', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null if template not found', () => {
      const account = createMockAccount([]);

      const result = getSession(account, 'nonexistent', 'session-1');

      expect(result).toBeNull();
    });
  });

  describe('getSessions', () => {
    it('should return all sessions from template', () => {
      const sessions = [createMockSession('session-1'), createMockSession('session-2')];
      const template = createMockTemplate('template-1', 'Groceries', [], sessions);
      const account = createMockAccount([template]);

      const result = getSessions(account, 'template-1');

      expect(result).toHaveLength(2);
    });

    it('should return empty array if no sessions exist', () => {
      const template = createMockTemplate('template-1', 'Groceries', [], []);
      const account = createMockAccount([template]);

      const result = getSessions(account, 'template-1');

      expect(result).toEqual([]);
    });

    it('should return empty array if template not found', () => {
      const account = createMockAccount([]);

      const result = getSessions(account, 'nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('Item Selected State', () => {
    let account: InstanceOfSchema<typeof Account>;
    let template: InstanceOfSchema<typeof FolderNode>;

    beforeEach(() => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
      });
      template = createMockTemplate('template-1', 'Groceries', items, [session]);
      account = createMockAccount([template]);
    });

    it('should get item selected state', () => {
      expect(getItemSelected(account, 'template-1', 'session-1', 'item-1')).toBe(true);
      expect(getItemSelected(account, 'template-1', 'session-1', 'item-2')).toBe(false);
    });

    it('should set item selected state', () => {
      setItemSelected(account, 'template-1', 'session-1', 'item-2', true);

      expect(template.sessions[0].itemStates['item-2']?.selected).toBe(true);
    });

    it('should unselect item', () => {
      setItemSelected(account, 'template-1', 'session-1', 'item-1', false);

      expect(template.sessions[0].itemStates['item-1']?.selected).toBe(false);
    });

    it('should toggle item selected state', () => {
      toggleItemSelected(account, 'template-1', 'session-1', 'item-1');

      expect(template.sessions[0].itemStates['item-1']?.selected).toBe(false);

      toggleItemSelected(account, 'template-1', 'session-1', 'item-1');

      expect(template.sessions[0].itemStates['item-1']?.selected).toBe(true);
    });

    it('should set selectedAt timestamp when selecting', () => {
      const beforeSelect = new Date();
      setItemSelected(account, 'template-1', 'session-1', 'item-2', true);

      const selectedAt = template.sessions[0].itemStates['item-2']?.selectedAt;
      expect(selectedAt).toBeDefined();
      expect(selectedAt?.getTime()).toBeGreaterThanOrEqual(beforeSelect.getTime());
    });

    it('should clear checked state when deselecting', () => {
      template.sessions[0].itemStates['item-1'].checked = true;

      setItemSelected(account, 'template-1', 'session-1', 'item-1', false);

      expect(template.sessions[0].itemStates['item-1']?.checked).toBe(false);
    });
  });

  describe('Item Checked State', () => {
    let account: InstanceOfSchema<typeof Account>;
    let template: InstanceOfSchema<typeof FolderNode>;

    beforeEach(() => {
      const items = [createMockItem('item-1', 'Milk')];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
      });
      template = createMockTemplate('template-1', 'Groceries', items, [session]);
      account = createMockAccount([template]);
    });

    it('should get item checked state', () => {
      expect(getItemChecked(account, 'template-1', 'session-1', 'item-1')).toBe(false);
    });

    it('should set item checked state', () => {
      setItemChecked(account, 'template-1', 'session-1', 'item-1', true);

      expect(template.sessions[0].itemStates['item-1']?.checked).toBe(true);
    });

    it('should toggle item checked state', () => {
      toggleItemChecked(account, 'template-1', 'session-1', 'item-1');

      expect(template.sessions[0].itemStates['item-1']?.checked).toBe(true);

      toggleItemChecked(account, 'template-1', 'session-1', 'item-1');

      expect(template.sessions[0].itemStates['item-1']?.checked).toBe(false);
    });

    it('should set checkedAt timestamp when checking', () => {
      const beforeCheck = new Date();
      setItemChecked(account, 'template-1', 'session-1', 'item-1', true);

      const checkedAt = template.sessions[0].itemStates['item-1']?.checkedAt;
      expect(checkedAt).toBeDefined();
      expect(checkedAt?.getTime()).toBeGreaterThanOrEqual(beforeCheck.getTime());
    });

    it('should clear checkedAt when unchecking', () => {
      setItemChecked(account, 'template-1', 'session-1', 'item-1', true);
      setItemChecked(account, 'template-1', 'session-1', 'item-1', false);

      expect(template.sessions[0].itemStates['item-1']?.checkedAt).toBeUndefined();
    });

    it('should throw error if item state does not exist', () => {
      expect(() => {
        setItemChecked(account, 'template-1', 'session-1', 'nonexistent', true);
      }).toThrow('Item state nonexistent not found in session');
    });
  });

  describe('updateSessionCounts', () => {
    it('should update session counts correctly', () => {
      const items = [
        createMockItem('item-1', 'Milk'),
        createMockItem('item-2', 'Bread'),
        createMockItem('item-3', 'Eggs'),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
        'item-2': { selected: true, checked: true },
      });
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      updateSessionCounts(account, 'template-1', 'session-1');

      expect(template.sessions[0].selectedCount).toBe(1); // item-1
      expect(template.sessions[0].checkedCount).toBe(1); // item-2
      expect(template.sessions[0].remainingCount).toBe(1); // item-3
    });

    it('should not count archived items', () => {
      const items = [
        createMockItem('item-1', 'Milk'),
        { ...createMockItem('item-2', 'Bread'), archived: true } as TemplateItem,
      ];
      const session = createMockSession('session-1', {});
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      updateSessionCounts(account, 'template-1', 'session-1');

      expect(template.sessions[0].remainingCount).toBe(1);
    });

    it('should not count categories', () => {
      const items = [
        createMockItem('cat-1', 'Dairy', 'category'),
        createMockItem('item-1', 'Milk', 'item'),
      ];
      const session = createMockSession('session-1', {});
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      updateSessionCounts(account, 'template-1', 'session-1');

      expect(template.sessions[0].remainingCount).toBe(1);
    });
  });

  describe('updateViewMode', () => {
    it('should update view mode to flat', () => {
      const session = createMockSession('session-1');
      const template = createMockTemplate('template-1', 'Groceries', [], [session]);
      const account = createMockAccount([template]);

      updateViewMode(account, 'template-1', 'session-1', 'flat');

      expect(template.sessions[0].viewMode).toBe('flat');
    });

    it('should update view mode to zone-in-hierarchy', () => {
      const session = { ...createMockSession('session-1'), viewMode: 'flat' as const };
      const template = createMockTemplate('template-1', 'Groceries', [], [session]);
      const account = createMockAccount([template]);

      updateViewMode(account, 'template-1', 'session-1', 'zone-in-hierarchy');

      expect(template.sessions[0].viewMode).toBe('zone-in-hierarchy');
    });

    it('should update lastActivityAt', () => {
      const session = createMockSession('session-1');
      const originalActivityAt = session.lastActivityAt;
      const template = createMockTemplate('template-1', 'Groceries', [], [session]);
      const account = createMockAccount([template]);

      updateViewMode(account, 'template-1', 'session-1', 'flat');

      expect(template.sessions[0].lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        originalActivityAt.getTime(),
      );
    });
  });

  describe('clearSessionState', () => {
    it('should clear all item states in session', () => {
      const items = [createMockItem('item-1', 'Milk'), createMockItem('item-2', 'Bread')];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: true },
        'item-2': { selected: true, checked: false },
      });
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      clearSessionState(account, 'template-1', 'session-1');

      expect(template.sessions[0].itemStates['item-1']?.selected).toBe(false);
      expect(template.sessions[0].itemStates['item-1']?.checked).toBe(false);
      expect(template.sessions[0].itemStates['item-2']?.selected).toBe(false);
      expect(template.sessions[0].itemStates['item-2']?.checked).toBe(false);
    });

    it('should update lastActivityAt', () => {
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false },
      });
      const originalActivityAt = session.lastActivityAt;
      const items = [createMockItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      clearSessionState(account, 'template-1', 'session-1');

      expect(template.sessions[0].lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        originalActivityAt.getTime(),
      );
    });
  });
});
