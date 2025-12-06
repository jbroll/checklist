/**
 * Unit tests for conflict resolution
 */

import { describe, expect, it } from 'vitest';
import { itemNameConflicts, resolveItemNameConflict } from './conflictResolver';

describe('conflictResolver', () => {
  describe('itemNameConflicts', () => {
    it('should return true for exact match', () => {
      const existingNames = ['Apples', 'Bananas', 'Oranges'];
      expect(itemNameConflicts('Apples', existingNames)).toBe(true);
    });

    it('should return true for case-insensitive match', () => {
      const existingNames = ['Apples', 'Bananas', 'Oranges'];
      expect(itemNameConflicts('apples', existingNames)).toBe(true);
      expect(itemNameConflicts('APPLES', existingNames)).toBe(true);
      expect(itemNameConflicts('ApPlEs', existingNames)).toBe(true);
    });

    it('should return true for names with extra whitespace', () => {
      const existingNames = ['Apples', 'Bananas'];
      expect(itemNameConflicts(' Apples ', existingNames)).toBe(true);
      expect(itemNameConflicts('  Bananas  ', existingNames)).toBe(true);
    });

    it('should return false for non-conflicting names', () => {
      const existingNames = ['Apples', 'Bananas'];
      expect(itemNameConflicts('Oranges', existingNames)).toBe(false);
      expect(itemNameConflicts('Grapes', existingNames)).toBe(false);
    });

    it('should return false for empty existing names array', () => {
      expect(itemNameConflicts('Apples', [])).toBe(false);
    });

    it('should handle names with special characters', () => {
      const existingNames = ['Bread & Butter', 'Coffee (Dark)', 'Milk - 2%'];
      expect(itemNameConflicts('Bread & Butter', existingNames)).toBe(true);
      expect(itemNameConflicts('Coffee (Dark)', existingNames)).toBe(true);
      expect(itemNameConflicts('Milk - 2%', existingNames)).toBe(true);
    });
  });

  describe('resolveItemNameConflict', () => {
    it('should return original name if no conflict exists', () => {
      const existingNames = ['Apples', 'Bananas'];
      const result = resolveItemNameConflict('Oranges', existingNames);
      expect(result).toBe('Oranges');
    });

    it('should append (2) suffix for first conflict', () => {
      const existingNames = ['Apples', 'Bananas'];
      const result = resolveItemNameConflict('Apples', existingNames);
      expect(result).toBe('Apples (2)');
    });

    it('should increment suffix number if (2) also exists', () => {
      const existingNames = ['Apples', 'Apples (2)'];
      const result = resolveItemNameConflict('Apples', existingNames);
      expect(result).toBe('Apples (3)');
    });

    it('should handle multiple sequential conflicts', () => {
      const existingNames = ['Apples', 'Apples (2)', 'Apples (3)', 'Apples (4)'];
      const result = resolveItemNameConflict('Apples', existingNames);
      expect(result).toBe('Apples (5)');
    });

    it('should handle gaps in numbered sequence', () => {
      // Missing (3), should use it
      const existingNames = ['Apples', 'Apples (2)', 'Apples (4)'];
      const result = resolveItemNameConflict('Apples', existingNames);
      expect(result).toBe('Apples (3)');
    });

    it('should handle case-insensitive conflicts', () => {
      const existingNames = ['Apples'];
      const result = resolveItemNameConflict('apples', existingNames);
      expect(result).toBe('apples (2)');
    });

    it('should preserve original capitalization in resolved name', () => {
      const existingNames = ['Apples'];
      const result = resolveItemNameConflict('APPLES', existingNames);
      expect(result).toBe('APPLES (2)');
    });

    it('should handle names with existing parentheses', () => {
      const existingNames = ['Coffee (Dark)'];
      const result = resolveItemNameConflict('Coffee (Dark)', existingNames);
      expect(result).toBe('Coffee (Dark) (2)');
    });

    it('should handle names with numbers', () => {
      const existingNames = ['Item 1'];
      const result = resolveItemNameConflict('Item 1', existingNames);
      expect(result).toBe('Item 1 (2)');
    });

    it('should handle very long names', () => {
      const longName = 'A'.repeat(100);
      const existingNames = [longName];
      const result = resolveItemNameConflict(longName, existingNames);
      expect(result).toBe(`${longName} (2)`);
    });

    it('should handle empty string names', () => {
      const existingNames = [''];
      const result = resolveItemNameConflict('', existingNames);
      expect(result).toBe(' (2)');
    });

    it('should handle special characters in names', () => {
      const existingNames = ['Milk - 2%'];
      const result = resolveItemNameConflict('Milk - 2%', existingNames);
      expect(result).toBe('Milk - 2% (2)');
    });

    it('should handle unicode characters', () => {
      const existingNames = ['Café ☕'];
      const result = resolveItemNameConflict('Café ☕', existingNames);
      expect(result).toBe('Café ☕ (2)');
    });

    it('should be consistent across multiple resolutions', () => {
      let existingNames = ['Apples'];

      const result1 = resolveItemNameConflict('Apples', existingNames);
      expect(result1).toBe('Apples (2)');

      existingNames = [...existingNames, result1];
      const result2 = resolveItemNameConflict('Apples', existingNames);
      expect(result2).toBe('Apples (3)');

      existingNames = [...existingNames, result2];
      const result3 = resolveItemNameConflict('Apples', existingNames);
      expect(result3).toBe('Apples (4)');
    });
  });
});
