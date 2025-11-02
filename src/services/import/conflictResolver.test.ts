/**
 * Unit tests for conflict resolution
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePathConflict } from './conflictResolver';

// Mock GroceriesAccount type for testing
const createMockAccount = (existingPaths: string[]) => {
  return {
    root: {
      nodes: existingPaths.map((path) => ({
        path,
        name: path.replace('/', ''),
      })),
    },
  } as any;
};

describe('conflictResolver', () => {
  describe('resolvePathConflict', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should add "/imported" suffix to path when original path exists', () => {
      const account = createMockAccount(['/grocery-list']);
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list/imported');
      expect(result.name).toBe('Grocery List (imported)');
    });

    it('should return "/imported" suffix even when checking for no original conflict', () => {
      // The function always appends /imported first, then checks if that conflicts
      const account = createMockAccount(['/other-list']);
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list/imported');
      expect(result.name).toBe('Grocery List (imported)');
    });

    it('should add timestamp if "/imported" path also exists', () => {
      const account = createMockAccount(['/grocery-list', '/grocery-list/imported']);

      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      // Should contain timestamp in both path and name
      expect(result.path).toMatch(/^\/grocery-list\/imported-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/);
      expect(result.name).toMatch(/^Grocery List \(imported \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/);
    });

    it('should handle paths with spaces', () => {
      const account = createMockAccount(['/my grocery list']);
      const result = resolvePathConflict('/my grocery list', 'My Grocery List', account);

      expect(result.path).toBe('/my grocery list/imported');
      expect(result.name).toBe('My Grocery List (imported)');
    });

    it('should handle paths with special characters', () => {
      const account = createMockAccount(['/list-#1']);
      const result = resolvePathConflict('/list-#1', 'List #1', account);

      expect(result.path).toBe('/list-#1/imported');
      expect(result.name).toBe('List #1 (imported)');
    });

    it('should handle empty nodes array', () => {
      const account = { root: { nodes: [] } } as any;
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list/imported');
      expect(result.name).toBe('Grocery List (imported)');
    });

    it('should handle null/undefined nodes gracefully', () => {
      const account = { root: { nodes: null } } as any;
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list/imported');
      expect(result.name).toBe('Grocery List (imported)');
    });

    it('should handle multiple conflicts sequentially', () => {
      const account = createMockAccount(['/list-1', '/list-2']);

      const result1 = resolvePathConflict('/list-1', 'List 1', account);
      expect(result1.path).toBe('/list-1/imported');

      // Simulate adding the resolved path
      account.root.nodes.push({ path: result1.path, name: result1.name });

      const result2 = resolvePathConflict('/list-2', 'List 2', account);
      expect(result2.path).toBe('/list-2/imported');
    });

    it('should preserve case sensitivity in names', () => {
      const account = createMockAccount(['/MyList']);
      const result = resolvePathConflict('/MyList', 'MyList', account);

      expect(result.name).toBe('MyList (imported)');
    });

    it('should handle very long folder names', () => {
      const longName = 'A'.repeat(100);
      const longPath = `/${longName}`;
      const account = createMockAccount([longPath]);

      const result = resolvePathConflict(longPath, longName, account);

      expect(result.path).toBe(`${longPath}/imported`);
      expect(result.name).toBe(`${longName} (imported)`);
    });
  });
});
