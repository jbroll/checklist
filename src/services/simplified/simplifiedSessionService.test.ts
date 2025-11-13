import type { InstanceOfSchema } from 'jazz-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Session, Template } from '@/schemas';
import * as sessionService from '@/services/sessionService';
import { getOrCreateCurrentSession } from './simplifiedSessionService';

// Mock sessionService
vi.mock('@/services/sessionService');

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

const createMockAccount = (): InstanceOfSchema<typeof Account> => {
  return {
    root: {
      templates: [],
      directory: [],
    },
  } as any;
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
  template.sessions.push = (newSession: any) => {
    Array.prototype.push.call(sessionsArray, newSession);
    return sessionsArray.length;
  };

  return template as InstanceOfSchema<typeof Template>;
};

describe('Simplified Session Service', () => {
  let mockAccount: InstanceOfSchema<typeof Account>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount = createMockAccount();
  });

  describe('getOrCreateCurrentSession', () => {
    it('should return existing latest session when sessions exist', () => {
      // Create sessions with different timestamps
      const oldSession = createMockSession('session-old', false, new Date('2024-01-01'));
      const newSession = createMockSession('session-new', false, new Date('2024-01-02'));
      const template = createMockTemplate([oldSession, newSession]);

      // Mock sessionService.getSessions to return our sessions
      vi.mocked(sessionService.getSessions).mockReturnValue([oldSession, newSession]);

      const sessionId = getOrCreateCurrentSession(mockAccount, template);

      expect(sessionId).toBe('session-new');
      expect(sessionService.getSessions).toHaveBeenCalledWith(mockAccount, 'template-1');
    });

    it('should skip archived sessions and return latest active session', () => {
      const activeSession = createMockSession('session-active', false, new Date('2024-01-01'));
      const archivedSession = createMockSession('session-archived', true, new Date('2024-01-02'));
      const template = createMockTemplate([activeSession, archivedSession]);

      // Mock sessionService.getSessions to return our sessions
      vi.mocked(sessionService.getSessions).mockReturnValue([activeSession, archivedSession]);

      const sessionId = getOrCreateCurrentSession(mockAccount, template);

      expect(sessionId).toBe('session-active');
    });

    it('should create new session when no active sessions exist', () => {
      const template = createMockTemplate([]);

      // Mock sessionService.getSessions to return empty array
      vi.mocked(sessionService.getSessions).mockReturnValue([]);
      // Mock sessionService.createSession to return new session ID
      vi.mocked(sessionService.createSession).mockReturnValue('new-session-id');

      const sessionId = getOrCreateCurrentSession(mockAccount, template);

      expect(sessionId).toBe('new-session-id');
      expect(sessionService.createSession).toHaveBeenCalledWith(mockAccount, 'template-1');
    });

    it('should create new session when all sessions are archived', () => {
      const archivedSession = createMockSession('session-archived', true, new Date());
      const template = createMockTemplate([archivedSession]);

      // Mock sessionService.getSessions to return archived session
      vi.mocked(sessionService.getSessions).mockReturnValue([archivedSession]);
      // Mock sessionService.createSession to return new session ID
      vi.mocked(sessionService.createSession).mockReturnValue('new-session-id');

      const sessionId = getOrCreateCurrentSession(mockAccount, template);

      expect(sessionId).toBe('new-session-id');
      expect(sessionService.createSession).toHaveBeenCalledWith(mockAccount, 'template-1');
    });

    it('should set currentSessionId on template when creating new session', () => {
      const template = createMockTemplate([]);

      // Mock sessionService.getSessions to return empty array
      vi.mocked(sessionService.getSessions).mockReturnValue([]);
      // Mock sessionService.createSession to return new session ID
      vi.mocked(sessionService.createSession).mockReturnValue('new-session-id');

      const sessionId = getOrCreateCurrentSession(mockAccount, template);

      expect(sessionId).toBe('new-session-id');
      expect(sessionService.createSession).toHaveBeenCalledWith(mockAccount, 'template-1');
    });
  });
});
