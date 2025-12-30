/**
 * Unit tests for file utility functions
 *
 * Tests filename generation and sanitization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExportFilename } from './fileUtils';

describe('fileUtils', () => {
  describe('buildExportFilename', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-15T10:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('basic filename generation', () => {
      it('generates filename with timestamp', () => {
        const result = buildExportFilename('My List', 'json');
        expect(result).toBe('my-list-2025-06-15.json');
      });

      it('generates filename without timestamp', () => {
        const result = buildExportFilename('My List', 'json', false);
        expect(result).toBe('my-list.json');
      });

      it('generates filename with prefix', () => {
        const result = buildExportFilename('Shopping List', 'csv', true, 'session');
        expect(result).toBe('session-shopping-list-2025-06-15.csv');
      });

      it('generates filename with prefix but no timestamp', () => {
        const result = buildExportFilename('Shopping List', 'csv', false, 'session');
        expect(result).toBe('session-shopping-list.csv');
      });
    });

    describe('file format extensions', () => {
      it('adds .json extension', () => {
        const result = buildExportFilename('data', 'json', false);
        expect(result).toBe('data.json');
      });

      it('adds .csv extension', () => {
        const result = buildExportFilename('data', 'csv', false);
        expect(result).toBe('data.csv');
      });

      it('adds .txt extension', () => {
        const result = buildExportFilename('data', 'txt', false);
        expect(result).toBe('data.txt');
      });
    });

    describe('name sanitization', () => {
      it('converts to lowercase', () => {
        const result = buildExportFilename('MY LIST', 'json', false);
        expect(result).toBe('my-list.json');
      });

      it('replaces spaces with hyphens', () => {
        const result = buildExportFilename('grocery list items', 'json', false);
        expect(result).toBe('grocery-list-items.json');
      });

      it('replaces special characters with hyphens', () => {
        const result = buildExportFilename("John's List!", 'json', false);
        expect(result).toBe('john-s-list-.json');
      });

      it('replaces multiple special characters', () => {
        const result = buildExportFilename('List @ Home #1', 'json', false);
        expect(result).toBe('list---home--1.json');
      });

      it('handles unicode characters', () => {
        const result = buildExportFilename('Listedesachats', 'json', false);
        expect(result).toBe('listedesachats.json');
      });

      it('preserves existing hyphens', () => {
        const result = buildExportFilename('my-list', 'json', false);
        expect(result).toBe('my-list.json');
      });

      it('preserves numbers', () => {
        const result = buildExportFilename('List 2025', 'json', false);
        expect(result).toBe('list-2025.json');
      });

      it('handles empty name', () => {
        const result = buildExportFilename('', 'json', false);
        expect(result).toBe('.json');
      });

      it('handles name with only special characters', () => {
        const result = buildExportFilename('!@#$%', 'json', false);
        expect(result).toBe('-----.json');
      });
    });

    describe('edge cases', () => {
      it('handles very long names', () => {
        const longName = 'a'.repeat(200);
        const result = buildExportFilename(longName, 'json', false);
        expect(result).toBe(`${'a'.repeat(200)}.json`);
      });

      it('handles name with leading/trailing spaces', () => {
        const result = buildExportFilename('  My List  ', 'json', false);
        expect(result).toBe('--my-list--.json');
      });

      it('handles mixed case with numbers', () => {
        const result = buildExportFilename('List2024Q1', 'json', false);
        expect(result).toBe('list2024q1.json');
      });
    });
  });
});
