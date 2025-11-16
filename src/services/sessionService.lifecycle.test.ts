import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Account, FolderNode, Session } from '../schemas';
import {
  archiveSession,
  deleteSession,
  toggleCategoryExpanded,
  unarchiveSession,
} from './sessionService';

// Mock Jazz CoValues
const createMockAccount = (): InstanceOfSchema<typeof Account> => {
  return {
    root: {
      folders: [],
    },
  } as any;
};

const createMockSession = (
  sessionId: string,
  archived = false,
): InstanceOfSchema<typeof Session> => {
  const session: any = {
    itemStates: {},
    archived,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };

  session.$jazz = {
    id: sessionId,
    set: (key: string, value: any) => {
      session[key] = value;
    },
  };

  return session as InstanceOfSchema<typeof Session>;
};

const createMockTemplate = (
  sessions: InstanceOfSchema<typeof Session>[],
): InstanceOfSchema<typeof FolderNode> => {
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
    splice: (index: number, deleteCount: number) => {
      template.sessions.splice(index, deleteCount);
    },
  };

  template.sessions.$jazz = {
    splice: (index: number, deleteCount: number) => {
      template.sessions.splice(index, deleteCount);
    },
  };

  return template as InstanceOfSchema<typeof FolderNode>;
};

describe('Session Lifecycle Functions', () => {
  let account: InstanceOfSchema<typeof Account>;
  let session1: InstanceOfSchema<typeof Session>;
  let session2: InstanceOfSchema<typeof Session>;
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
      expect(session1.archived).toBe(false);

      archiveSession(account, 'template-1', 'session-1');

      expect(session1.archived).toBe(true);
      expect(session1.lastActivityAt).toBeInstanceOf(Date);
    });

    it('should update lastActivityAt when archiving', () => {
      const oldActivityTime = session1.lastActivityAt;

      // Wait a tiny bit to ensure time difference
      const _now = new Date(Date.now() + 10);
      archiveSession(account, 'template-1', 'session-1');

      expect(session1.lastActivityAt.getTime()).toBeGreaterThanOrEqual(oldActivityTime.getTime());
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
      session1.$jazz.set('archived', true);

      // Should not throw and archived should remain true
      expect(() => {
        archiveSession(account, 'template-1', 'session-1');
      }).not.toThrow();

      expect(session1.archived).toBe(true);
    });
  });

  describe('unarchiveSession', () => {
    it('should unarchive an archived session', () => {
      expect(session2.archived).toBe(true);

      unarchiveSession(account, 'template-1', 'session-2');

      expect(session2.archived).toBe(false);
      expect(session2.lastActivityAt).toBeInstanceOf(Date);
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
      session1.$jazz.set('archived', false);

      // Should not throw and archived should remain false
      expect(() => {
        unarchiveSession(account, 'template-1', 'session-1');
      }).not.toThrow();

      expect(session1.archived).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session from template', () => {
      expect(template.sessions.length).toBe(2);
      expect(template.sessions[0].$jazz.id).toBe('session-1');

      deleteSession(account, 'template-1', 'session-1');

      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0].$jazz.id).toBe('session-2');
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
      expect(template.sessions[1].$jazz.id).toBe('session-2');

      // Delete middle session
      deleteSession(account, 'template-1', 'session-2');

      expect(template.sessions.length).toBe(2);
      expect(template.sessions[0].$jazz.id).toBe('session-1');
      expect(template.sessions[1].$jazz.id).toBe('session-3');
    });
  });

  describe('toggleCategoryExpanded', () => {
    it('should expand a collapsed category', () => {
      // Default is expanded (true), so set to collapsed
      session1.categoryExpanded = { cat1: false };

      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');

      expect(session1.categoryExpanded.cat1).toBe(true);
    });

    it('should collapse an expanded category', () => {
      session1.categoryExpanded = { cat1: true };

      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');

      expect(session1.categoryExpanded.cat1).toBe(false);
    });

    it('should default to true for new categories', () => {
      session1.categoryExpanded = {};

      // Category doesn't exist, defaults to true, so toggle should set to false
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'new-cat');

      expect(session1.categoryExpanded['new-cat']).toBe(false);
    });

    it('should preserve other category states', () => {
      session1.categoryExpanded = {
        cat1: true,
        cat2: false,
        cat3: true,
      };

      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat2');

      expect(session1.categoryExpanded.cat1).toBe(true);
      expect(session1.categoryExpanded.cat2).toBe(true);
      expect(session1.categoryExpanded.cat3).toBe(true);
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
      session1.categoryExpanded = {};

      // Should not throw
      expect(() => {
        toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      }).not.toThrow();

      expect(session1.categoryExpanded.cat1).toBe(false);
    });

    it('should handle null/undefined categoryExpanded', () => {
      session1.categoryExpanded = undefined as any;

      // Should not throw
      expect(() => {
        toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      }).not.toThrow();

      expect(session1.categoryExpanded.cat1).toBe(false);
    });

    it('should handle multiple toggles', () => {
      session1.categoryExpanded = { cat1: true };

      // Toggle once
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      expect(session1.categoryExpanded.cat1).toBe(false);

      // Toggle again
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      expect(session1.categoryExpanded.cat1).toBe(true);

      // Toggle once more
      toggleCategoryExpanded(account, 'template-1', 'session-1', 'cat1');
      expect(session1.categoryExpanded.cat1).toBe(false);
    });
  });

  describe('Integration: Archive, Unarchive, Delete workflow', () => {
    it('should support full lifecycle: archive → unarchive → delete', () => {
      // Start with active session
      expect(session1.archived).toBe(false);

      // Archive it
      archiveSession(account, 'template-1', 'session-1');
      expect(session1.archived).toBe(true);

      // Unarchive it
      unarchiveSession(account, 'template-1', 'session-1');
      expect(session1.archived).toBe(false);

      // Delete it
      expect(template.sessions.length).toBe(2);
      deleteSession(account, 'template-1', 'session-1');
      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0].$jazz.id).toBe('session-2');
    });

    it('should allow deleting archived session without unarchiving', () => {
      // Session2 is already archived
      expect(session2.archived).toBe(true);
      expect(template.sessions.length).toBe(2);

      // Delete directly
      deleteSession(account, 'template-1', 'session-2');

      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0].$jazz.id).toBe('session-1');
    });
  });
});
