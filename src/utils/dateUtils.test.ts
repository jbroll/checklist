/**
 * Unit tests for dateUtils
 */

import { describe, expect, it } from 'vitest';
import { formatTime, getDateStampForFilename, toISOString, toISOStringOrEmpty } from './dateUtils';

describe('dateUtils', () => {
  describe('toISOString', () => {
    it('returns undefined for undefined input', () => {
      expect(toISOString(undefined)).toBeUndefined();
    });

    it('returns the string as-is for string input', () => {
      const isoString = '2025-12-30T10:30:00.000Z';
      expect(toISOString(isoString)).toBe(isoString);
    });

    it('converts Date object to ISO string', () => {
      const date = new Date('2025-12-30T10:30:00.000Z');
      expect(toISOString(date)).toBe('2025-12-30T10:30:00.000Z');
    });

    it('handles Date objects with different times', () => {
      const date = new Date('2025-06-15T23:59:59.999Z');
      expect(toISOString(date)).toBe('2025-06-15T23:59:59.999Z');
    });
  });

  describe('toISOStringOrEmpty', () => {
    it('returns empty string for undefined input', () => {
      expect(toISOStringOrEmpty(undefined)).toBe('');
    });

    it('returns the string as-is for string input', () => {
      const isoString = '2025-12-30T10:30:00.000Z';
      expect(toISOStringOrEmpty(isoString)).toBe(isoString);
    });

    it('converts Date object to ISO string', () => {
      const date = new Date('2025-12-30T10:30:00.000Z');
      expect(toISOStringOrEmpty(date)).toBe('2025-12-30T10:30:00.000Z');
    });

    it('handles empty string input', () => {
      expect(toISOStringOrEmpty('')).toBe('');
    });
  });

  describe('formatTime', () => {
    it('formats morning time with am', () => {
      const date = new Date('2025-12-30T09:30:00');
      expect(formatTime(date)).toMatch(/9:30\s*am/i);
    });

    it('formats afternoon time with pm', () => {
      const date = new Date('2025-12-30T14:45:00');
      expect(formatTime(date)).toMatch(/2:45\s*pm/i);
    });

    it('formats noon as 12 pm', () => {
      const date = new Date('2025-12-30T12:00:00');
      expect(formatTime(date)).toMatch(/12:00\s*pm/i);
    });

    it('formats midnight as 12 am', () => {
      const date = new Date('2025-12-30T00:00:00');
      expect(formatTime(date)).toMatch(/12:00\s*am/i);
    });

    it('returns lowercase am/pm', () => {
      const date = new Date('2025-12-30T15:30:00');
      const result = formatTime(date);
      expect(result).not.toMatch(/[AP]M/);
      expect(result.toLowerCase()).toBe(result);
    });

    it('pads minutes with leading zero', () => {
      const date = new Date('2025-12-30T10:05:00');
      expect(formatTime(date)).toMatch(/10:05/);
    });
  });

  describe('getDateStampForFilename', () => {
    it('returns date in YYYY-MM-DD format', () => {
      const date = new Date('2025-12-30T10:30:00.000Z');
      expect(getDateStampForFilename(date)).toBe('2025-12-30');
    });

    it('pads month with leading zero', () => {
      const date = new Date('2025-06-15T10:30:00.000Z');
      expect(getDateStampForFilename(date)).toBe('2025-06-15');
    });

    it('pads day with leading zero', () => {
      const date = new Date('2025-12-05T10:30:00.000Z');
      expect(getDateStampForFilename(date)).toBe('2025-12-05');
    });

    it('defaults to current date when no argument provided', () => {
      const result = getDateStampForFilename();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('handles year boundary dates', () => {
      const date = new Date('2025-01-01T00:00:00.000Z');
      expect(getDateStampForFilename(date)).toBe('2025-01-01');
    });

    it('handles end of year dates', () => {
      const date = new Date('2025-12-31T23:59:59.999Z');
      expect(getDateStampForFilename(date)).toBe('2025-12-31');
    });
  });
});
