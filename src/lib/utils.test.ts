/**
 * Unit tests for utility functions
 *
 * Tests date formatting, ID generation, and session name generation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cn,
  formatRelativeTime,
  formatSessionDate,
  generateId,
  generateSessionName,
  hasMultipleSessionsOnSameDay,
} from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    });

    it('merges tailwind classes correctly', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
    });

    it('handles array of classes', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });

    it('handles undefined and null', () => {
      expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
    });
  });

  describe('formatRelativeTime', () => {
    let mockNow: Date;

    beforeEach(() => {
      mockNow = new Date('2024-06-15T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "just now" for recent times', () => {
      const date = new Date('2024-06-15T11:59:30.000Z'); // 30 seconds ago
      expect(formatRelativeTime(date)).toBe('just now');
    });

    it('returns "1 minute ago" for 60 seconds', () => {
      const date = new Date('2024-06-15T11:59:00.000Z'); // 1 minute ago
      expect(formatRelativeTime(date)).toBe('1 minute ago');
    });

    it('returns "X minutes ago" for less than an hour', () => {
      const date = new Date('2024-06-15T11:30:00.000Z'); // 30 minutes ago
      expect(formatRelativeTime(date)).toBe('30 minutes ago');
    });

    it('returns "1 hour ago" for 60 minutes', () => {
      const date = new Date('2024-06-15T11:00:00.000Z'); // 1 hour ago
      expect(formatRelativeTime(date)).toBe('1 hour ago');
    });

    it('returns "X hours ago" for less than a day', () => {
      const date = new Date('2024-06-15T06:00:00.000Z'); // 6 hours ago
      expect(formatRelativeTime(date)).toBe('6 hours ago');
    });

    it('returns "1 day ago" for 24 hours', () => {
      const date = new Date('2024-06-14T12:00:00.000Z'); // 1 day ago
      expect(formatRelativeTime(date)).toBe('1 day ago');
    });

    it('returns "X days ago" for less than a week', () => {
      const date = new Date('2024-06-12T12:00:00.000Z'); // 3 days ago
      expect(formatRelativeTime(date)).toBe('3 days ago');
    });

    it('returns formatted date for more than a week', () => {
      const date = new Date('2024-06-01T12:00:00.000Z'); // 14 days ago
      const result = formatRelativeTime(date);
      // Should be a locale date string, not relative
      expect(result).not.toContain('ago');
    });
  });

  describe('formatSessionDate', () => {
    let mockNow: Date;

    beforeEach(() => {
      // Use a specific local time to avoid timezone issues
      mockNow = new Date(2024, 5, 15, 14, 30, 0); // June 15, 2024, 2:30 PM local
      vi.useFakeTimers();
      vi.setSystemTime(mockNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('today', () => {
      it('returns "today" for midnight with showTime=false', () => {
        // Use local midnight
        const date = new Date(2024, 5, 15, 0, 0, 0);
        expect(formatSessionDate(date, false)).toBe('today');
      });

      it('returns "today" for midnight with showTime=true', () => {
        // Use local midnight
        const date = new Date(2024, 5, 15, 0, 0, 0);
        expect(formatSessionDate(date, true)).toBe('today');
      });

      it('returns "today @time" for non-midnight with showTime=true', () => {
        const date = new Date(2024, 5, 15, 14, 30, 0);
        const result = formatSessionDate(date, true);
        expect(result).toMatch(/^today @\d+:\d+ (am|pm)$/);
      });

      it('returns "today" for non-midnight with showTime=false', () => {
        const date = new Date(2024, 5, 15, 14, 30, 0);
        expect(formatSessionDate(date, false)).toBe('today');
      });
    });

    describe('yesterday', () => {
      it('returns "yesterday" with showTime=false', () => {
        const date = new Date('2024-06-14T10:00:00.000Z');
        expect(formatSessionDate(date, false)).toBe('yesterday');
      });

      it('returns "yesterday @time" with showTime=true', () => {
        const date = new Date('2024-06-14T10:00:00.000Z');
        const result = formatSessionDate(date, true);
        expect(result).toMatch(/^yesterday @\d+:\d+ (am|pm)$/);
      });
    });

    describe('within last year', () => {
      it('returns MM/DD format with showTime=false', () => {
        const date = new Date('2024-05-20T10:00:00.000Z');
        expect(formatSessionDate(date, false)).toBe('5/20');
      });

      it('returns MM/DD @time with showTime=true', () => {
        const date = new Date('2024-05-20T10:00:00.000Z');
        const result = formatSessionDate(date, true);
        expect(result).toMatch(/^5\/20 @\d+:\d+ (am|pm)$/);
      });
    });

    describe('older than a year', () => {
      it('returns full date format', () => {
        const date = new Date('2023-01-15T10:00:00.000Z');
        const result = formatSessionDate(date, false);
        expect(result).toMatch(/\d+\/\d+\/\d+/);
      });
    });

    it('handles date string input (date-string deserialization)', () => {
      const dateString = '2024-06-15T14:30:00.000Z';
      const result = formatSessionDate(new Date(dateString), true);
      expect(result).toMatch(/^today @\d+:\d+ (am|pm)$/);
    });
  });

  describe('generateSessionName', () => {
    it('returns YYYY-MM-DD format without sessions list', () => {
      const date = new Date('2024-06-15T10:30:00.000Z');
      expect(generateSessionName(date)).toBe('2024-06-15');
    });

    it('returns YYYY-MM-DD format with single session on day', () => {
      const date = new Date('2024-06-15T10:30:00.000Z');
      const sessions = [{ id: '1', createdAt: new Date('2024-06-15T10:30:00.000Z') }];
      expect(generateSessionName(date, sessions as any)).toBe('2024-06-15');
    });

    it('returns YYYY-MM-DD HH:MM format with multiple sessions on same day', () => {
      // Use local dates to avoid timezone issues
      const date = new Date(2024, 5, 15, 10, 30, 0); // June 15, 2024 10:30 AM local
      const sessions = [
        { id: '1', createdAt: new Date(2024, 5, 15, 10, 30, 0) },
        { id: '2', createdAt: new Date(2024, 5, 15, 14, 0, 0) },
      ];
      expect(generateSessionName(date, sessions as any)).toBe('2024-06-15 10:30');
    });

    it('handles null sessions in array', () => {
      const date = new Date('2024-06-15T10:30:00.000Z');
      const sessions = [{ id: '1', createdAt: new Date('2024-06-15T10:30:00.000Z') }, null];
      expect(generateSessionName(date, sessions as any)).toBe('2024-06-15');
    });

    it('returns date-only format when other sessions are on different days', () => {
      const date = new Date('2024-06-15T10:30:00.000Z');
      const sessions = [
        { id: '1', createdAt: new Date('2024-06-15T10:30:00.000Z') },
        { id: '2', createdAt: new Date('2024-06-14T14:00:00.000Z') }, // Different day
      ];
      expect(generateSessionName(date, sessions as any)).toBe('2024-06-15');
    });
  });

  describe('hasMultipleSessionsOnSameDay', () => {
    it('returns false for null session', () => {
      const sessions = [{ id: '1', createdAt: new Date() }];
      expect(hasMultipleSessionsOnSameDay(null, sessions as any)).toBe(false);
    });

    it('returns false for empty sessions array', () => {
      const session = { id: '1', createdAt: new Date() };
      expect(hasMultipleSessionsOnSameDay(session as any, [])).toBe(false);
    });

    it('returns false for single session', () => {
      const session = { id: '1', createdAt: new Date('2024-06-15T10:00:00.000Z') };
      const sessions = [session];
      expect(hasMultipleSessionsOnSameDay(session as any, sessions as any)).toBe(false);
    });

    it('returns true for multiple sessions on same day', () => {
      const session1 = { id: '1', createdAt: new Date('2024-06-15T10:00:00.000Z') };
      const session2 = { id: '2', createdAt: new Date('2024-06-15T14:00:00.000Z') };
      const sessions = [session1, session2];
      expect(hasMultipleSessionsOnSameDay(session1 as any, sessions as any)).toBe(true);
    });

    it('returns false for sessions on different days', () => {
      const session1 = { id: '1', createdAt: new Date('2024-06-15T10:00:00.000Z') };
      const session2 = { id: '2', createdAt: new Date('2024-06-14T14:00:00.000Z') };
      const sessions = [session1, session2];
      expect(hasMultipleSessionsOnSameDay(session1 as any, sessions as any)).toBe(false);
    });

    it('handles null sessions in array', () => {
      const session = { id: '1', createdAt: new Date('2024-06-15T10:00:00.000Z') };
      const sessions = [
        session,
        null,
        { id: '2', createdAt: new Date('2024-06-15T12:00:00.000Z') },
      ];
      expect(hasMultipleSessionsOnSameDay(session as any, sessions as any)).toBe(true);
    });

    it('handles date string input (date-string deserialization)', () => {
      const session = { id: '1', createdAt: '2024-06-15T10:00:00.000Z' };
      const sessions = [session, { id: '2', createdAt: '2024-06-15T14:00:00.000Z' }];
      expect(hasMultipleSessionsOnSameDay(session as any, sessions as any)).toBe(true);
    });
  });

  describe('generateId', () => {
    it('generates a 10-character ID', () => {
      const id = generateId();
      expect(id).toHaveLength(10);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });

    it('generates URL-safe characters', () => {
      const id = generateId();
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});
