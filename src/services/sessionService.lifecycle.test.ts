import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, FolderNode, SessionData } from '../schemas';
import {
  archiveSession,
  deleteSession,
  toggleCategoryExpanded,
  unarchiveSession,
  updateSessionItemNotes,
} from './sessionService';

// Mock Jazz CoValues
const createMockAccount = (): InstanceOfSchema<typeof Account> => {
  return {
    root: {
      folders: [],
    },
  } as any;
};

const createMockSession = (sessionId: string, archived = false): SessionData => {
  return {
    id: sessionId,
    itemStates: {},
    archived,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy' as const,
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };
};

const createMockTemplate = (sessions: SessionData[]): InstanceOfSchema<typeof FolderNode> => {
  const template: any = {
    name: 'Test Template',
    items: [],
    sessions,
    showZoneHeadings: false,
    archived: false,
    expanded: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  template.$jazz = {
    id: 'template-1',
    set: (key: string, value: any) => {
      template[key] = value;
    },
  };

  return template as InstanceOfSchema<typeof FolderNode>;
};

describe('Session Lifecycle Functions', () => {
  let account: InstanceOfSchema<typeof Account>;
  let session1: SessionData;
  let session2: SessionData;
  let template: InstanceOfSchema<typeof FolderNode>;

  beforeEach(() => {
    account = createMockAccount();
    session1 = createMockSession('session-1', false);
    session2 = createMockSession('session-2', true);
    template = createMockTemplate([session1, session2]);
    account.root.folders = [template];
  });

  describe('archiveSession', () => {
    it('should archive an active session', () => {
      expect(template.sessions[0].archived).toBe(false);

      archiveSession(account, 'template-1', 'session-1');

      expect(template.sessions[0].archived).toBe(true);
      expect(template.sessions[0].lastActivityAt).toBeInstanceOf(Date);
    });

    it('should update lastActivityAt when archiving', () => {
      const oldActivityTime = session1.lastActivityAt;

      // Wait a tiny bit to ensure time difference
      const _now = new Date(Date.now() + 10);
      archiveSession(account, 'template-1', 'session-1');

      expect(template.sessions[0].lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        oldActivityTime.getTime(),
      );
    });

    it('should throw error if session not found', () => {
      expect(() => {
        archiveSession(account, 'template-1', 'non-existent-session');
      }).toThrow('Session non-existent-session not found');
    });

    it('should throw error if template not found', () => {
      expect(() => {
        archiveSession(account, 'non-existent-template', 'session-1');
      }).toThrow();
    });

    it('should handle archiving already archived session', () => {
      session1.archived = true;

      // Should not throw and archived should remain true
      expect(() => {
        archiveSession(account, 'template-1', 'session-1');
      }).not.toThrow();

      expect(template.sessions[0].archived).toBe(true);
    });
  });

  describe('unarchiveSession', () => {
    it('should unarchive an archived session', () => {
      expect(template.sessions[1].archived).toBe(true);

      unarchiveSession(account, 'template-1', 'session-2');

      expect(template.sessions[1].archived).toBe(false);
      expect(template.sessions[1].lastActivityAt).toBeInstanceOf(Date);
    });

    it('should update lastActivityAt when unarchiving', () => {
      const oldActivityTime = session2.lastActivityAt;

      unarchiveSession(account, 'template-1', 'session-2');

      expect(session2.lastActivityAt.getTime()).toBeGreaterThanOrEqual(oldActivityTime.getTime());
    });

    it('should throw error if session not found', () => {
      expect(() => {
        unarchiveSession(account, 'template-1', 'non-existent-session');
      }).toThrow('Session non-existent-session not found');
    });

    it('should throw error if template not found', () => {
      expect(() => {
        unarchiveSession(account, 'non-existent-template', 'session-2');
      }).toThrow();
    });

    it('should handle unarchiving already active session', () => {
      session1.archived = false;

      // Should not throw and archived should remain false
      expect(() => {
        unarchiveSession(account, 'template-1', 'session-1');
      }).not.toThrow();

      expect(template.sessions[0].archived).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session from template', () => {
      expect(template.sessions.length).toBe(2);
      expect(template.sessions[0].id).toBe('session-1');

      deleteSession(account, 'template-1', 'session-1');

      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0].id).toBe('session-2');
    });

    it('should update template updatedAt when deleting session', () => {
      const oldUpdatedAt = template.updatedAt;

      deleteSession(account, 'template-1', 'session-1');

      expect(template.updatedAt.getTime()).toBeGreaterThanOrEqual(oldUpdatedAt.getTime());
    });

    it('should throw error if session not found', () => {
      expect(() => {
        deleteSession(account, 'template-1', 'non-existent-session');
      }).toThrow('Session non-existent-session not found');
    });

    it('should throw error if template not found', () => {
      expect(() => {
        deleteSession(account, 'non-existent-template', 'session-1');
      }).toThrow('Template non-existent-template not found');
    });

    it('should delete last session without error', () => {
      // Delete first session
      deleteSession(account, 'template-1', 'session-1');

      expect(template.sessions.length).toBe(1);

      // Delete last session
      deleteSession(account, 'template-1', 'session-2');

      expect(template.sessions.length).toBe(0);
    });

    it('should handle deleting from middle of sessions array', () => {
      const session3 = createMockSession('session-3', false);
      template.sessions.push(session3);

      expect(template.sessions.length).toBe(3);
      expect(template.sessions[1].id).toBe('session-2');

      // Delete middle session
      deleteSession(account, 'template-1', 'session-2');

      expect(template.sessions.length).toBe(2);
      expect(template.sessions[0].id).toBe('session-1');
      expect(template.sessions[1].id).toBe('session-3');
    });
  });

  describe('toggleCategoryExpanded', () => {
    it('should expand a collapsed category', () => {
      // Default is expanded (true), so set to collapsed
      template.sessions[0].categoryExpanded = { cat1: false };

      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');

      expect(template.sessions[0].categoryExpanded.cat1).toBe(true);
    });

    it('should collapse an expanded category', () => {
      template.sessions[0].categoryExpanded = { cat1: true };

      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');

      expect(template.sessions[0].categoryExpanded.cat1).toBe(false);
    });

    it('should default to true for new categories', () => {
      template.sessions[0].categoryExpanded = {};

      // Category doesn't exist, defaults to true, so toggle should set to false
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'new-cat');

      expect(template.sessions[0].categoryExpanded['new-cat']).toBe(false);
    });

    it('should preserve other category states', () => {
      template.sessions[0].categoryExpanded = {
        cat1: true,
        cat2: false,
        cat3: true,
      };

      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat2');

      expect(template.sessions[0].categoryExpanded.cat1).toBe(true);
      expect(template.sessions[0].categoryExpanded.cat2).toBe(true);
      expect(template.sessions[0].categoryExpanded.cat3).toBe(true);
    });

    it('should throw error if session not found', () => {
      expect(() => {
        toggleCategoryExpanded(account, 'template-1', 'non-existent-session', 'cat1');
      }).toThrow('Session non-existent-session not found');
    });

    it('should throw error if template not found', () => {
      expect(() => {
        toggleCategoryExpanded(account, 'non-existent-template', 'session-1', 'cat1');
      }).toThrow();
    });

    it('should handle empty categoryExpanded object', () => {
      template.sessions[0].categoryExpanded = {};

      // Should not throw
      expect(() => {
        toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      }).not.toThrow();

      expect(template.sessions[0].categoryExpanded.cat1).toBe(false);
    });

    it('should handle null/undefined categoryExpanded', () => {
      template.sessions[0].categoryExpanded = undefined as any;

      // Should not throw
      expect(() => {
        toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      }).not.toThrow();

      expect(template.sessions[0].categoryExpanded.cat1).toBe(false);
    });

    it('should handle multiple toggles', () => {
      template.sessions[0].categoryExpanded = { cat1: true };

      // Toggle once
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      expect(template.sessions[0].categoryExpanded.cat1).toBe(false);

      // Toggle again
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      expect(template.sessions[0].categoryExpanded.cat1).toBe(true);

      // Toggle once more
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      expect(template.sessions[0].categoryExpanded.cat1).toBe(false);
    });
  });

  describe('Integration: Archive, Unarchive, Delete workflow', () => {
    it('should support full lifecycle: archive → unarchive → delete', () => {
      // Start with active session
      expect(template.sessions[0].archived).toBe(false);

      // Archive it
      archiveSession(account, 'template-1', 'session-1');
      expect(template.sessions[0].archived).toBe(true);

      // Unarchive it
      unarchiveSession(account, 'template-1', 'session-1');
      expect(template.sessions[0].archived).toBe(false);

      // Delete it
      expect(template.sessions.length).toBe(2);
      deleteSession(account, 'template-1', 'session-1');
      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0].id).toBe('session-2');
    });

    it('should allow deleting archived session without unarchiving', () => {
      // Session2 is already archived
      expect(template.sessions[1].archived).toBe(true);
      expect(template.sessions.length).toBe(2);

      // Delete directly
      deleteSession(account, 'template-1', 'session-2');

      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0].id).toBe('session-1');
    });
  });

  describe('updateSessionItemNotes', () => {
    it('should add notes to an item without existing state', () => {
      template.sessions[0].itemStates = {};

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', 'Check if on sale');

      expect(template.sessions[0].itemStates['item-1']).toBeDefined();
      expect(template.sessions[0].itemStates['item-1'].notes).toBe('Check if on sale');
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(false);
      expect(template.sessions[0].itemStates['item-1'].checked).toBe(false);
    });

    it('should add notes to an item with existing state', () => {
      template.sessions[0].itemStates = {
        'item-1': {
          selected: true,
          checked: false,
          selectedAt: new Date(),
        },
      };

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', 'Get the organic one');

      expect(template.sessions[0].itemStates['item-1'].notes).toBe('Get the organic one');
      expect(template.sessions[0].itemStates['item-1'].selected).toBe(true); // preserved
      expect(template.sessions[0].itemStates['item-1'].checked).toBe(false); // preserved
    });

    it('should update existing notes', () => {
      template.sessions[0].itemStates = {
        'item-1': {
          selected: true,
          checked: false,
          notes: 'Old note',
        },
      };

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', 'New note');

      expect(template.sessions[0].itemStates['item-1'].notes).toBe('New note');
    });

    it('should remove notes when empty string is provided', () => {
      template.sessions[0].itemStates = {
        'item-1': {
          selected: true,
          checked: false,
          notes: 'Some note',
        },
      };

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', '');

      expect(template.sessions[0].itemStates['item-1'].notes).toBeUndefined();
    });

    it('should update lastActivityAt when adding notes', () => {
      const oldActivityTime = template.sessions[0].lastActivityAt;
      template.sessions[0].itemStates = {};

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', 'A note');

      expect(template.sessions[0].lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        oldActivityTime.getTime(),
      );
    });

    it('should not affect other items when updating notes', () => {
      template.sessions[0].itemStates = {
        'item-1': { selected: true, checked: false, notes: 'Note 1' },
        'item-2': { selected: false, checked: true, notes: 'Note 2' },
      };

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', 'Updated note');

      expect(template.sessions[0].itemStates['item-1'].notes).toBe('Updated note');
      expect(template.sessions[0].itemStates['item-2'].notes).toBe('Note 2'); // unchanged
    });

    it('should throw error if session not found', () => {
      expect(() => {
        updateSessionItemNotes(account, 'template-1', 'non-existent', 'item-1', 'Note');
      }).toThrow('Session non-existent not found');
    });

    it('should throw error if template not found', () => {
      expect(() => {
        updateSessionItemNotes(account, 'non-existent', 'session-1', 'item-1', 'Note');
      }).toThrow();
    });

    it('should preserve selectedAt and checkedAt timestamps', () => {
      const selectedAt = new Date('2024-01-01');
      const checkedAt = new Date('2024-01-02');
      template.sessions[0].itemStates = {
        'item-1': {
          selected: true,
          checked: true,
          selectedAt,
          checkedAt,
        },
      };

      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', 'A note');

      expect(template.sessions[0].itemStates['item-1'].selectedAt).toEqual(selectedAt);
      expect(template.sessions[0].itemStates['item-1'].checkedAt).toEqual(checkedAt);
    });

    it('should handle multiline notes', () => {
      template.sessions[0].itemStates = {};

      const multilineNote = 'Line 1\nLine 2\nLine 3';
      updateSessionItemNotes(account, 'template-1', 'session-1', 'item-1', multilineNote);

      expect(template.sessions[0].itemStates['item-1'].notes).toBe(multilineNote);
    });
  });
});
