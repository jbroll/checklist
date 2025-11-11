import { describe, expect, it } from 'vitest';
import {
  calculateDescendantPaths,
  calculateNewPath,
  getNameFromPath,
  getParentPath,
  normalizeNameForPath,
  PATH_SEPARATOR,
} from './pathUtils';

describe('pathManipulation', () => {
  describe('calculateNewPath', () => {
    it('should calculate path for moving to root', () => {
      const result = calculateNewPath('Child', `parent${PATH_SEPARATOR}Child`, undefined);
      expect(result.isValid).toBe(true);
      expect(result.newPath).toBe('Child');
    });

    it('should calculate path for moving into folder', () => {
      const result = calculateNewPath('Child', 'Child', 'parent');
      expect(result.isValid).toBe(true);
      expect(result.newPath).toBe(`parent${PATH_SEPARATOR}Child`);
    });

    it('should prevent moving into self', () => {
      const result = calculateNewPath('Folder', 'Folder', 'Folder');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('into itself');
    });

    it('should prevent moving into descendant', () => {
      const result = calculateNewPath('Parent', 'Parent', `Parent${PATH_SEPARATOR}Child`);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('descendants');
    });

    it('should detect same location', () => {
      const result = calculateNewPath('Child', `parent${PATH_SEPARATOR}Child`, 'parent');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Already at this location');
    });

    it('should NOT normalize names with spaces', () => {
      const result = calculateNewPath('My Folder', `parent${PATH_SEPARATOR}My Folder`, undefined);
      expect(result.isValid).toBe(true);
      expect(result.newPath).toBe('My Folder'); // Spaces preserved, not converted to hyphens
    });
  });

  describe('calculateDescendantPaths', () => {
    it('should update descendants of normal folder', () => {
      const allPaths = [
        { id: '1', path: 'parent' },
        { id: '2', path: `parent${PATH_SEPARATOR}child1` },
        { id: '3', path: `parent${PATH_SEPARATOR}child2` },
        { id: '4', path: 'other' },
      ];

      const updates = calculateDescendantPaths('parent', 'newparent', allPaths);

      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual({
        id: '2',
        oldPath: `parent${PATH_SEPARATOR}child1`,
        newPath: `newparent${PATH_SEPARATOR}child1`,
      });
      expect(updates[1]).toEqual({
        id: '3',
        oldPath: `parent${PATH_SEPARATOR}child2`,
        newPath: `newparent${PATH_SEPARATOR}child2`,
      });
    });

    it('should handle deep nesting', () => {
      const allPaths = [
        { id: '1', path: 'a' },
        { id: '2', path: `a${PATH_SEPARATOR}b` },
        { id: '3', path: `a${PATH_SEPARATOR}b${PATH_SEPARATOR}c` },
        { id: '4', path: `a${PATH_SEPARATOR}b${PATH_SEPARATOR}c${PATH_SEPARATOR}d` },
      ];

      const updates = calculateDescendantPaths('a', 'x', allPaths);

      expect(updates).toHaveLength(3);
      expect(updates.find((u) => u.id === '2')?.newPath).toBe(`x${PATH_SEPARATOR}b`);
      expect(updates.find((u) => u.id === '3')?.newPath).toBe(
        `x${PATH_SEPARATOR}b${PATH_SEPARATOR}c`,
      );
      expect(updates.find((u) => u.id === '4')?.newPath).toBe(
        `x${PATH_SEPARATOR}b${PATH_SEPARATOR}c${PATH_SEPARATOR}d`,
      );
    });
  });

  describe('getParentPath', () => {
    it('should return parent for nested path', () => {
      expect(getParentPath(`parent${PATH_SEPARATOR}child`)).toBe('parent');
      expect(getParentPath(`a${PATH_SEPARATOR}b${PATH_SEPARATOR}c`)).toBe(`a${PATH_SEPARATOR}b`);
    });

    it('should return undefined for root level', () => {
      expect(getParentPath('root')).toBeUndefined();
    });
  });

  describe('getNameFromPath', () => {
    it('should extract name from path', () => {
      expect(getNameFromPath(`parent${PATH_SEPARATOR}child`)).toBe('child');
      expect(getNameFromPath(`a${PATH_SEPARATOR}b${PATH_SEPARATOR}c`)).toBe('c');
    });

    it('should return whole string for root level', () => {
      expect(getNameFromPath('root')).toBe('root');
    });
  });

  describe('normalizeNameForPath', () => {
    it('should NOT replace spaces with hyphens (deprecated)', () => {
      expect(normalizeNameForPath('My Folder')).toBe('My Folder');
      expect(normalizeNameForPath('  Multiple  Spaces  ')).toBe('Multiple  Spaces'); // Only trims outer whitespace
    });

    it('should only trim outer whitespace', () => {
      expect(normalizeNameForPath('  folder  ')).toBe('folder');
    });
  });
});
