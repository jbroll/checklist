/**
 * Session lifecycle tests (rowboat port, slice-2).
 *
 * Archive, unarchive, delete, category expansion, and notes — over an in-memory `makeGraph()`
 * graph (no Jazz, no React). All timestamps are epoch-ms NUMBERS.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, ItemState, SessionData } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import {
  archiveSession,
  deleteSession,
  toggleCategoryExpanded,
  unarchiveSession,
  updateSessionItemNotes,
} from './sessionService';

type Graph = ReturnType<typeof makeGraph>;

/** Build a session (all epoch-ms number timestamps). */
const session = (sessionId: string, archived = false): SessionData => ({
  id: sessionId,
  itemStates: {},
  archived,
  categoryExpanded: {},
  viewMode: 'zone-in-hierarchy',
  selectedCount: 0,
  checkedCount: 0,
  remainingCount: 0,
  createdAt: 1_700_000_000_000,
  lastActivityAt: 1_700_000_000_000,
});

/** Build a complete template-folder row (all required Folder columns present). */
const templateFolder = (sessions: SessionData[], extra: Partial<FolderRow> = {}): FolderRow => ({
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
  items: [],
  sessions,
  default_items: {},
  show_zone_headings: false,
  auto_categorize_enabled: false,
  autocomplete_domain: 'none',
  ...extra,
});

/** Fresh graph seeded with session-1 (active) and session-2 (archived). */
const seed = (extra: Partial<FolderRow> = {}): Graph =>
  makeGraph({
    folder: [templateFolder([session('session-1', false), session('session-2', true)], extra)],
  });

/** Read a template's sessions, hard-erroring if the folder is missing. */
const sessionsOf = (g: Graph, id = 'template-1'): SessionData[] => {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return parseFolderRow(node.$data).sessions;
};

/** Read a template's `updated_at`, hard-erroring if the folder is missing. */
const updatedAtOf = (g: Graph, id = 'template-1'): number => {
  const node = g.folder(id);
  if (!node) throw new Error(`template ${id} not found`);
  return node.$data.updated_at;
};

describe('Session Lifecycle Functions', () => {
  describe('archiveSession', () => {
    it('should archive an active session', async () => {
      const g = seed();
      expect(sessionsOf(g)[0].archived).toBe(false);

      await archiveSession(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].archived).toBe(true);
      expect(sessionsOf(g)[0].lastActivityAt).toBeGreaterThan(0);
    });

    it('should update lastActivityAt when archiving', async () => {
      const g = seed();
      const oldActivityTime = sessionsOf(g)[0].lastActivityAt;

      await archiveSession(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].lastActivityAt).toBeGreaterThanOrEqual(oldActivityTime);
    });

    it('should throw error if session not found', async () => {
      const g = seed();
      await expect(archiveSession(g, 'template-1', 'non-existent-session')).rejects.toThrow(
        'Session non-existent-session not found',
      );
    });

    it('should throw error if template not found', async () => {
      const g = seed();
      await expect(archiveSession(g, 'non-existent-template', 'session-1')).rejects.toThrow();
    });

    it('should handle archiving already archived session', async () => {
      const g = seed();
      await archiveSession(g, 'template-1', 'session-2');

      expect(sessionsOf(g)[1].archived).toBe(true);
    });
  });

  describe('unarchiveSession', () => {
    it('should unarchive an archived session', async () => {
      const g = seed();
      expect(sessionsOf(g)[1].archived).toBe(true);

      await unarchiveSession(g, 'template-1', 'session-2');

      expect(sessionsOf(g)[1].archived).toBe(false);
      expect(sessionsOf(g)[1].lastActivityAt).toBeGreaterThan(0);
    });

    it('should update lastActivityAt when unarchiving', async () => {
      const g = seed();
      const oldActivityTime = sessionsOf(g)[1].lastActivityAt;

      await unarchiveSession(g, 'template-1', 'session-2');

      expect(sessionsOf(g)[1].lastActivityAt).toBeGreaterThanOrEqual(oldActivityTime);
    });

    it('should throw error if session not found', async () => {
      const g = seed();
      await expect(unarchiveSession(g, 'template-1', 'non-existent-session')).rejects.toThrow(
        'Session non-existent-session not found',
      );
    });

    it('should throw error if template not found', async () => {
      const g = seed();
      await expect(unarchiveSession(g, 'non-existent-template', 'session-2')).rejects.toThrow();
    });

    it('should handle unarchiving already active session', async () => {
      const g = seed();
      await unarchiveSession(g, 'template-1', 'session-1');

      expect(sessionsOf(g)[0].archived).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session from template', async () => {
      const g = seed();
      expect(sessionsOf(g).length).toBe(2);
      expect(sessionsOf(g)[0].id).toBe('session-1');

      await deleteSession(g, 'template-1', 'session-1');

      expect(sessionsOf(g).length).toBe(1);
      expect(sessionsOf(g)[0].id).toBe('session-2');
    });

    it('should update template updated_at when deleting session', async () => {
      const g = seed();
      const before = Date.now();

      await deleteSession(g, 'template-1', 'session-1');

      expect(updatedAtOf(g)).toBeGreaterThanOrEqual(before);
    });

    it('should throw error if session not found', async () => {
      const g = seed();
      await expect(deleteSession(g, 'template-1', 'non-existent-session')).rejects.toThrow(
        'Session non-existent-session not found',
      );
    });

    it('should throw error if template not found', async () => {
      const g = seed();
      await expect(deleteSession(g, 'non-existent-template', 'session-1')).rejects.toThrow(
        'Template non-existent-template not found',
      );
    });

    it('should delete last session without error', async () => {
      const g = seed();
      await deleteSession(g, 'template-1', 'session-1');
      expect(sessionsOf(g).length).toBe(1);

      await deleteSession(g, 'template-1', 'session-2');
      expect(sessionsOf(g).length).toBe(0);
    });

    it('should handle deleting from middle of sessions array', async () => {
      const g = makeGraph({
        folder: [
          templateFolder([
            session('session-1', false),
            session('session-2', true),
            session('session-3', false),
          ]),
        ],
      });

      expect(sessionsOf(g).length).toBe(3);
      expect(sessionsOf(g)[1].id).toBe('session-2');

      await deleteSession(g, 'template-1', 'session-2');

      expect(sessionsOf(g).length).toBe(2);
      expect(sessionsOf(g)[0].id).toBe('session-1');
      expect(sessionsOf(g)[1].id).toBe('session-3');
    });
  });

  describe('toggleCategoryExpanded', () => {
    const seedCat = (categoryExpanded: Record<string, boolean>): Graph =>
      makeGraph({
        folder: [templateFolder([{ ...session('session-1', false), categoryExpanded }])],
      });

    it('should expand a collapsed category', async () => {
      const g = seedCat({ cat1: false });

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');

      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(true);
    });

    it('should collapse an expanded category', async () => {
      const g = seedCat({ cat1: true });

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');

      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(false);
    });

    it('should default to true for new categories', async () => {
      const g = seedCat({});

      // Category doesn't exist, defaults to true, so toggle should set to false
      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'new-cat');

      expect(sessionsOf(g)[0].categoryExpanded['new-cat']).toBe(false);
    });

    it('should preserve other category states', async () => {
      const g = seedCat({ cat1: true, cat2: false, cat3: true });

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat2');

      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(true);
      expect(sessionsOf(g)[0].categoryExpanded.cat2).toBe(true);
      expect(sessionsOf(g)[0].categoryExpanded.cat3).toBe(true);
    });

    it('should throw error if session not found', async () => {
      const g = seedCat({});
      await expect(
        toggleCategoryExpanded(g, 'template-1', 'non-existent-session', 'cat1'),
      ).rejects.toThrow('Session non-existent-session not found');
    });

    it('should throw error if template not found', async () => {
      const g = seedCat({});
      await expect(
        toggleCategoryExpanded(g, 'non-existent-template', 'session-1', 'cat1'),
      ).rejects.toThrow();
    });

    it('should handle empty categoryExpanded object', async () => {
      const g = seedCat({});

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');

      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(false);
    });

    it('should handle undefined categoryExpanded', async () => {
      // Simulate an older session missing the categoryExpanded map entirely.
      const s = { ...session('session-1', false) };
      (s as { categoryExpanded?: Record<string, boolean> }).categoryExpanded = undefined;
      const g = makeGraph({ folder: [templateFolder([s])] });

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');

      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(false);
    });

    it('should handle multiple toggles', async () => {
      const g = seedCat({ cat1: true });

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');
      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(false);

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');
      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(true);

      await toggleCategoryExpanded(g, 'template-1', 'session-1', 'cat1');
      expect(sessionsOf(g)[0].categoryExpanded.cat1).toBe(false);
    });
  });

  describe('Integration: Archive, Unarchive, Delete workflow', () => {
    it('should support full lifecycle: archive → unarchive → delete', async () => {
      const g = seed();
      expect(sessionsOf(g)[0].archived).toBe(false);

      await archiveSession(g, 'template-1', 'session-1');
      expect(sessionsOf(g)[0].archived).toBe(true);

      await unarchiveSession(g, 'template-1', 'session-1');
      expect(sessionsOf(g)[0].archived).toBe(false);

      expect(sessionsOf(g).length).toBe(2);
      await deleteSession(g, 'template-1', 'session-1');
      expect(sessionsOf(g).length).toBe(1);
      expect(sessionsOf(g)[0].id).toBe('session-2');
    });

    it('should allow deleting archived session without unarchiving', async () => {
      const g = seed();
      expect(sessionsOf(g)[1].archived).toBe(true);
      expect(sessionsOf(g).length).toBe(2);

      await deleteSession(g, 'template-1', 'session-2');

      expect(sessionsOf(g).length).toBe(1);
      expect(sessionsOf(g)[0].id).toBe('session-1');
    });
  });

  describe('updateSessionItemNotes', () => {
    const seedNotes = (itemStates: Record<string, ItemState>): Graph =>
      makeGraph({
        folder: [templateFolder([{ ...session('session-1', false), itemStates }])],
      });

    it('should add notes to an item without existing state', async () => {
      const g = seedNotes({});

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', 'Check if on sale');

      const state = sessionsOf(g)[0].itemStates['item-1'];
      expect(state).toBeDefined();
      expect(state.notes).toBe('Check if on sale');
      expect(state.selected).toBe(false);
      expect(state.checked).toBe(false);
    });

    it('should add notes to an item with existing state', async () => {
      const g = seedNotes({
        'item-1': { selected: true, checked: false, selectedAt: 1_700_000_000_000 },
      });

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', 'Get the organic one');

      const state = sessionsOf(g)[0].itemStates['item-1'];
      expect(state.notes).toBe('Get the organic one');
      expect(state.selected).toBe(true); // preserved
      expect(state.checked).toBe(false); // preserved
    });

    it('should update existing notes', async () => {
      const g = seedNotes({ 'item-1': { selected: true, checked: false, notes: 'Old note' } });

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', 'New note');

      expect(sessionsOf(g)[0].itemStates['item-1'].notes).toBe('New note');
    });

    it('should remove notes when empty string is provided', async () => {
      const g = seedNotes({ 'item-1': { selected: true, checked: false, notes: 'Some note' } });

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', '');

      expect(sessionsOf(g)[0].itemStates['item-1'].notes).toBeUndefined();
    });

    it('should update lastActivityAt when adding notes', async () => {
      const g = makeGraph({
        folder: [templateFolder([{ ...session('session-1', false), lastActivityAt: 1 }])],
      });
      const before = Date.now();

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', 'A note');

      expect(sessionsOf(g)[0].lastActivityAt).toBeGreaterThanOrEqual(before);
    });

    it('should not affect other items when updating notes', async () => {
      const g = seedNotes({
        'item-1': { selected: true, checked: false, notes: 'Note 1' },
        'item-2': { selected: false, checked: true, notes: 'Note 2' },
      });

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', 'Updated note');

      expect(sessionsOf(g)[0].itemStates['item-1'].notes).toBe('Updated note');
      expect(sessionsOf(g)[0].itemStates['item-2'].notes).toBe('Note 2'); // unchanged
    });

    it('should throw error if session not found', async () => {
      const g = seedNotes({});
      await expect(
        updateSessionItemNotes(g, 'template-1', 'non-existent', 'item-1', 'Note'),
      ).rejects.toThrow('Session non-existent not found');
    });

    it('should throw error if template not found', async () => {
      const g = seedNotes({});
      await expect(
        updateSessionItemNotes(g, 'non-existent', 'session-1', 'item-1', 'Note'),
      ).rejects.toThrow();
    });

    it('should preserve selectedAt and checkedAt timestamps', async () => {
      const selectedAt = 1_704_067_200_000; // 2024-01-01
      const checkedAt = 1_704_153_600_000; // 2024-01-02
      const g = seedNotes({
        'item-1': { selected: true, checked: true, selectedAt, checkedAt },
      });

      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', 'A note');

      expect(sessionsOf(g)[0].itemStates['item-1'].selectedAt).toBe(selectedAt);
      expect(sessionsOf(g)[0].itemStates['item-1'].checkedAt).toBe(checkedAt);
    });

    it('should handle multiline notes', async () => {
      const g = seedNotes({});

      const multilineNote = 'Line 1\nLine 2\nLine 3';
      await updateSessionItemNotes(g, 'template-1', 'session-1', 'item-1', multilineNote);

      expect(sessionsOf(g)[0].itemStates['item-1'].notes).toBe(multilineNote);
    });
  });
});
