import { describe, expect, it } from 'vitest';
import {
  calculateDescendantPaths,
  calculateNewPath,
  getNameFromPath,
  getParentPath,
  normalizeNameForPath,
} from './pathManipulation';

describe('pathManipulation', () => {
  describe('calculateNewPath', () => {
    it('should calculate path for moving to root', () => {
      const result = calculateNewPath('Child', 'parent/Child', undefined);
      expect(result.isValid).toBe(true);
      expect(result.newPath).toBe('Child');
    });

    it('should calculate path for moving into folder', () => {
      const result = calculateNewPath('Child', 'Child', 'parent');
      expect(result.isValid).toBe(true);
      expect(result.newPath).toBe('parent/Child');
    });

    it('should prevent moving into self', () => {
      const result = calculateNewPath('Folder', 'Folder', 'Folder');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('into itself');
    });

    it('should prevent moving into descendant', () => {
      const result = calculateNewPath('Parent', 'Parent', 'Parent/Child');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('descendants');
    });

    it('should detect same location', () => {
      const result = calculateNewPath('Child', 'parent/Child', 'parent');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Already at this location');
    });

    it('should normalize names with spaces', () => {
      const result = calculateNewPath('My Folder', 'parent/My Folder', undefined);
      expect(result.isValid).toBe(true);
      expect(result.newPath).toBe('My-Folder');
    });
  });

  describe('calculateDescendantPaths', () => {
    it('should update descendants of normal folder', () => {
      const allPaths = [
        { id: '1', path: 'parent' },
        { id: '2', path: 'parent/child1' },
        { id: '3', path: 'parent/child2' },
        { id: '4', path: 'other' },
      ];

      const updates = calculateDescendantPaths('parent', 'newparent', allPaths);

      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual({
        id: '2',
        oldPath: 'parent/child1',
        newPath: 'newparent/child1',
      });
      expect(updates[1]).toEqual({
        id: '3',
        oldPath: 'parent/child2',
        newPath: 'newparent/child2',
      });
    });

    it('should handle deep nesting', () => {
      const allPaths = [
        { id: '1', path: 'a' },
        { id: '2', path: 'a/b' },
        { id: '3', path: 'a/b/c' },
        { id: '4', path: 'a/b/c/d' },
      ];

      const updates = calculateDescendantPaths('a', 'x', allPaths);

      expect(updates).toHaveLength(3);
      expect(updates.find((u) => u.id === '2')?.newPath).toBe('x/b');
      expect(updates.find((u) => u.id === '3')?.newPath).toBe('x/b/c');
      expect(updates.find((u) => u.id === '4')?.newPath).toBe('x/b/c/d');
    });
  });

  describe('getParentPath', () => {
    it('should return parent for nested path', () => {
      expect(getParentPath('parent/child')).toBe('parent');
      expect(getParentPath('a/b/c')).toBe('a/b');
    });

    it('should return undefined for root level', () => {
      expect(getParentPath('root')).toBeUndefined();
    });
  });

  describe('getNameFromPath', () => {
    it('should extract name from path', () => {
      expect(getNameFromPath('parent/child')).toBe('child');
      expect(getNameFromPath('a/b/c')).toBe('c');
    });

    it('should return whole string for root level', () => {
      expect(getNameFromPath('root')).toBe('root');
    });
  });

  describe('normalizeNameForPath', () => {
    it('should replace spaces with hyphens', () => {
      expect(normalizeNameForPath('My Folder')).toBe('My-Folder');
      expect(normalizeNameForPath('  Multiple  Spaces  ')).toBe('Multiple-Spaces');
    });

    it('should trim whitespace', () => {
      expect(normalizeNameForPath('  folder  ')).toBe('folder');
    });
  });
});
