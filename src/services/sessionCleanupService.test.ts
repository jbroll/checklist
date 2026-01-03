/**
 * Unit tests for session cleanup service
 *
 * Tests automatic session archival based on subscription tier retention.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupExpiredSessions,
  getExpiredSessionCount,
  shouldRunCleanup,
} from './sessionCleanupService';

// Mock templates to return from walkTree
let mockTemplateFolders: any[] = [];

// Create a mock account that provides folders for the service to traverse
function createMockAccount(): any {
  return {
    root: {
      folders: mockTemplateFolders,
    },
  };
}

// Mock dependencies
vi.mock('@jbr-jazz/hierarchy-shared', () => ({
  walkTree: vi.fn((folders: any[], visitor: (node: any) => any) => {
    for (const folder of folders) {
      if (!folder) continue;
      visitor(folder);
    }
    return false;
  }),
}));

vi.mock('../hooks', () => ({
  isTemplateFolder: vi.fn(() => true),
}));

vi.mock('./subscriptionService', () => ({
  getSessionRetentionDays: vi.fn(),
}));

vi.mock('../lib/brand', () => ({
  storageKey: vi.fn((key: string) => `test_${key}`),
}));

import { getSessionRetentionDays } from './subscriptionService';

const mockGetSessionRetentionDays = getSessionRetentionDays as ReturnType<typeof vi.fn>;

describe('sessionCleanupService', () => {
  const originalLocalStorage = window.localStorage;
  let localStorageData: Record<string, string>;

  beforeEach(() => {
    localStorageData = {};
    mockTemplateFolders = [];

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageData[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageData[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageData[key];
        }),
        clear: vi.fn(() => {
          localStorageData = {};
        }),
      },
      writable: true,
      configurable: true,
    });

    // Reset mocks
    mockGetSessionRetentionDays.mockReset();

    // Silence console.log
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('shouldRunCleanup', () => {
    it('returns true when no cleanup has ever run', () => {
      expect(shouldRunCleanup()).toBe(true);
    });

    it('returns true when last cleanup was more than 24 hours ago', () => {
      const moreThan24HoursAgo = Date.now() - 25 * 60 * 60 * 1000;
      localStorageData.test_session_cleanup_last = moreThan24HoursAgo.toString();

      expect(shouldRunCleanup()).toBe(true);
    });

    it('returns false when last cleanup was less than 24 hours ago', () => {
      const lessThan24HoursAgo = Date.now() - 12 * 60 * 60 * 1000;
      localStorageData.test_session_cleanup_last = lessThan24HoursAgo.toString();

      expect(shouldRunCleanup()).toBe(false);
    });

    it('returns false when cleanup just ran', () => {
      localStorageData.test_session_cleanup_last = Date.now().toString();

      expect(shouldRunCleanup()).toBe(false);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('returns 0 and marks run when retention is unlimited (-1)', () => {
      mockGetSessionRetentionDays.mockReturnValue(-1);

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(0);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('archives sessions older than retention period', () => {
      mockGetSessionRetentionDays.mockReturnValue(30); // 30 days

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45); // 45 days ago

      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 15); // 15 days ago

      const oldSession = {
        archived: false,
        createdAt: oldDate,
        $jazz: { set: vi.fn() },
      };

      const newSession = {
        archived: false,
        createdAt: newDate,
        $jazz: { set: vi.fn() },
      };

      const template = {
        sessions: [oldSession, newSession],
      };

      mockTemplateFolders = [template];

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(1);
      expect(oldSession.$jazz.set).toHaveBeenCalledWith('archived', true);
      expect(oldSession.$jazz.set).toHaveBeenCalledWith('archivedAt', expect.any(Date));
      expect(newSession.$jazz.set).not.toHaveBeenCalled();
    });

    it('skips already archived sessions', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      const session = {
        archived: true, // Already archived
        createdAt: oldDate,
        $jazz: { set: vi.fn() },
      };

      mockTemplateFolders = [{ sessions: [session] }];

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(0);
      expect(session.$jazz.set).not.toHaveBeenCalled();
    });

    it('handles templates with no sessions', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);
      mockTemplateFolders = [{ sessions: null }, { sessions: undefined }];

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(0);
    });

    it('handles null sessions in array', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      const validSession = {
        archived: false,
        createdAt: oldDate,
        $jazz: { set: vi.fn() },
      };

      mockTemplateFolders = [{ sessions: [null, validSession, null] }];

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(1);
    });

    it('handles createdAt as ISO string', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      const session = {
        archived: false,
        createdAt: oldDate.toISOString(), // String instead of Date
        $jazz: { set: vi.fn() },
      };

      mockTemplateFolders = [{ sessions: [session] }];

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(1);
    });

    it('processes multiple templates', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      const session1 = {
        archived: false,
        createdAt: oldDate,
        $jazz: { set: vi.fn() },
      };

      const session2 = {
        archived: false,
        createdAt: oldDate,
        $jazz: { set: vi.fn() },
      };

      mockTemplateFolders = [{ sessions: [session1] }, { sessions: [session2] }];

      const result = cleanupExpiredSessions(createMockAccount());

      expect(result).toBe(2);
    });

    it('marks cleanup run time in localStorage', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);
      mockTemplateFolders = [];

      cleanupExpiredSessions(createMockAccount());

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'test_session_cleanup_last',
        expect.any(String),
      );
    });
  });

  describe('getExpiredSessionCount', () => {
    it('returns 0 when retention is unlimited', () => {
      mockGetSessionRetentionDays.mockReturnValue(-1);

      const result = getExpiredSessionCount(createMockAccount());

      expect(result).toBe(0);
    });

    it('counts expired but not archived sessions', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 15);

      mockTemplateFolders = [
        {
          sessions: [
            { archived: false, createdAt: oldDate }, // Expired
            { archived: false, createdAt: newDate }, // Not expired
            { archived: true, createdAt: oldDate }, // Archived (skipped)
          ],
        },
      ];

      const result = getExpiredSessionCount(createMockAccount());

      expect(result).toBe(1);
    });

    it('handles templates with no sessions', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);
      mockTemplateFolders = [{ sessions: null }];

      const result = getExpiredSessionCount(createMockAccount());

      expect(result).toBe(0);
    });

    it('handles null sessions in array', () => {
      mockGetSessionRetentionDays.mockReturnValue(30);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      mockTemplateFolders = [{ sessions: [null, { archived: false, createdAt: oldDate }, null] }];

      const result = getExpiredSessionCount(createMockAccount());

      expect(result).toBe(1);
    });
  });
});
