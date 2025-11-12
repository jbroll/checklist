import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session, Template } from '@/schemas';
import { Session as SessionSchema } from '@/schemas';
import { clearSessionState, getOrCreateCurrentSession } from './simplifiedSessionService';

// Mock Session.create
const mockSessionCreate = (init: any, options: any) => {
  const session: any = {
    ...init,
  };

  session.$jazz = {
    id: `session-${Date.now()}`,
    set: (key: string, value: any) => {
      session[key] = value;
    },
  };

  return session as InstanceOfSchema<typeof Session>;
};

// Mock Jazz CoValues
const createMockSession = (
  sessionId: string,
  archived = false,
  createdAt = new Date(),
): InstanceOfSchema<typeof Session> => {
  const session: any = {
    itemStates: {
      'item-1': { selected: true, checked: false },
      'item-2': { selected: false, checked: true },
    },
    archived,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount: 1,
    checkedCount: 1,
    remainingCount: 2,
    createdAt,
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
): InstanceOfSchema<typeof Template> => {
  const template: any = {
    name: 'Test Template',
    items: [
      { id: 'item-1', name: 'Item 1', archived: false },
      { id: 'item-2', name: 'Item 2', archived: false },
      { id: 'item-3', name: 'Item 3', archived: true },
    ],
    sessions,
    currentSessionId: sessions[0]?.$jazz.id || '',
    owner: { id: 'owner-1' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  template.$jazz = {
    id: 'template-1',
    set: (key: string, value: any) => {
      template[key] = value;
    },
  };

  // Create sessions array with custom push that adds to the underlying array
  const sessionsArray = [...sessions];
  Object.defineProperty(template, 'sessions', {
    get: () => sessionsArray,
    set: (value) => {
      sessionsArray.length = 0;
      sessionsArray.push(...value);
    },
    configurable: true,
  });

  // Override push to actually add to the array
  template.sessions.push = function (newSession: any) {
    Array.prototype.push.call(sessionsArray, newSession);
    return sessionsArray.length;
  };

  return template as InstanceOfSchema<typeof Template>;
};

describe('Simplified Session Service', () => {
  describe('getOrCreateCurrentSession', () => {
    it('should return existing latest session when sessions exist', () => {
      // Create sessions with different timestamps
      const oldSession = createMockSession('session-old', false, new Date('2024-01-01'));
      const newSession = createMockSession('session-new', false, new Date('2024-01-02'));
      const template = createMockTemplate([oldSession, newSession]);

      const sessionId = getOrCreateCurrentSession(template);

      expect(sessionId).toBe('session-new');
    });

    it('should skip archived sessions and return latest active session', () => {
      const activeSession = createMockSession('session-active', false, new Date('2024-01-01'));
      const archivedSession = createMockSession('session-archived', true, new Date('2024-01-02'));
      const template = createMockTemplate([activeSession, archivedSession]);

      const sessionId = getOrCreateCurrentSession(template);

      expect(sessionId).toBe('session-active');
    });

    it('should create new session when no active sessions exist', () => {
      const template = createMockTemplate([]);

      // Mock Session.create
      const originalCreate = SessionSchema.create;
      SessionSchema.create = mockSessionCreate as any;

      const sessionId = getOrCreateCurrentSession(template);

      // Restore original
      SessionSchema.create = originalCreate;

      expect(sessionId).toBeDefined();
      expect(template.sessions.length).toBe(1);
      expect(template.sessions[0]?.archived).toBe(false);
      expect(template.sessions[0]?.itemStates).toEqual({});
    });

    it('should create new session when all sessions are archived', () => {
      const archivedSession = createMockSession('session-archived', true, new Date());
      const template = createMockTemplate([archivedSession]);

      // Mock Session.create
      const originalCreate = SessionSchema.create;
      SessionSchema.create = mockSessionCreate as any;

      const sessionId = getOrCreateCurrentSession(template);

      // Restore original
      SessionSchema.create = originalCreate;

      expect(sessionId).toBeDefined();
      expect(template.sessions.length).toBe(2);
      expect(template.sessions[1]?.archived).toBe(false);
    });

    it('should set currentSessionId on template when creating new session', () => {
      const template = createMockTemplate([]);

      // Mock Session.create
      const originalCreate = SessionSchema.create;
      SessionSchema.create = mockSessionCreate as any;

      getOrCreateCurrentSession(template);

      // Restore original
      SessionSchema.create = originalCreate;

      expect(template.currentSessionId).toBeDefined();
      expect(template.currentSessionId).toBe(template.sessions[0]?.$jazz.id);
    });
  });

  describe('clearSessionState', () => {
    let template: InstanceOfSchema<typeof Template>;
    let session: InstanceOfSchema<typeof Session>;

    beforeEach(() => {
      session = createMockSession('session-1', false);
      template = createMockTemplate([session]);
    });

    it('should reset all item states to unchecked and unselected', () => {
      expect(session.itemStates['item-1']).toEqual({ selected: true, checked: false });
      expect(session.itemStates['item-2']).toEqual({ selected: false, checked: true });

      clearSessionState(template, 'session-1');

      expect(session.itemStates['item-1']).toEqual({ selected: false, checked: false });
      expect(session.itemStates['item-2']).toEqual({ selected: false, checked: false });
    });

    it('should reset selectedCount and checkedCount to 0', () => {
      expect(session.selectedCount).toBe(1);
      expect(session.checkedCount).toBe(1);

      clearSessionState(template, 'session-1');

      expect(session.selectedCount).toBe(0);
      expect(session.checkedCount).toBe(0);
    });

    it('should update remainingCount to match non-archived items', () => {
      clearSessionState(template, 'session-1');

      // Template has 3 items total, 1 archived, so 2 remaining
      expect(session.remainingCount).toBe(2);
    });

    it('should update lastActivityAt timestamp', () => {
      const oldTimestamp = session.lastActivityAt;

      // Wait a tiny bit to ensure timestamp changes
      setTimeout(() => {
        clearSessionState(template, 'session-1');

        expect(session.lastActivityAt).not.toBe(oldTimestamp);
      }, 10);
    });

    it('should do nothing if session not found', () => {
      const initialItemStates = { ...session.itemStates };

      clearSessionState(template, 'non-existent-session');

      expect(session.itemStates).toEqual(initialItemStates);
    });

    it('should preserve item state structure even when empty', () => {
      // Create session with no item states
      const emptySession = createMockSession('session-empty', false);
      emptySession.itemStates = {};
      const emptyTemplate = createMockTemplate([emptySession]);

      clearSessionState(emptyTemplate, 'session-empty');

      expect(emptySession.itemStates).toEqual({});
      expect(emptySession.selectedCount).toBe(0);
      expect(emptySession.checkedCount).toBe(0);
    });
  });
});
