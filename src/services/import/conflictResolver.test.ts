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

    it('should add "-(1)" suffix to path when original path exists', () => {
      const account = createMockAccount(['/grocery-list']);
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list-(1)');
      expect(result.name).toBe('Grocery List (1)');
    });

    it('should return "-(1)" suffix even when checking for no original conflict', () => {
      // The function always appends -(1) first, then checks if that conflicts
      const account = createMockAccount(['/other-list']);
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list-(1)');
      expect(result.name).toBe('Grocery List (1)');
    });

    it('should increment number if "-(1)" path also exists', () => {
      const account = createMockAccount(['/grocery-list', '/grocery-list-(1)']);

      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list-(2)');
      expect(result.name).toBe('Grocery List (2)');
    });

    it('should handle multiple sequential conflicts', () => {
      const account = createMockAccount([
        '/grocery-list',
        '/grocery-list-(1)',
        '/grocery-list-(2)',
        '/grocery-list-(3)',
      ]);

      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list-(4)');
      expect(result.name).toBe('Grocery List (4)');
    });

    it('should handle paths with spaces', () => {
      const account = createMockAccount(['/my grocery list']);
      const result = resolvePathConflict('/my grocery list', 'My Grocery List', account);

      expect(result.path).toBe('/my grocery list-(1)');
      expect(result.name).toBe('My Grocery List (1)');
    });

    it('should handle paths with special characters', () => {
      const account = createMockAccount(['/list-#1']);
      const result = resolvePathConflict('/list-#1', 'List #1', account);

      expect(result.path).toBe('/list-#1-(1)');
      expect(result.name).toBe('List #1 (1)');
    });

    it('should handle empty nodes array', () => {
      const account = { root: { nodes: [] } } as any;
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list-(1)');
      expect(result.name).toBe('Grocery List (1)');
    });

    it('should handle null/undefined nodes gracefully', () => {
      const account = { root: { nodes: null } } as any;
      const result = resolvePathConflict('/grocery-list', 'Grocery List', account);

      expect(result.path).toBe('/grocery-list-(1)');
      expect(result.name).toBe('Grocery List (1)');
    });

    it('should handle multiple different paths sequentially', () => {
      const account = createMockAccount(['/list-1', '/list-2']);

      const result1 = resolvePathConflict('/list-1', 'List 1', account);
      expect(result1.path).toBe('/list-1-(1)');

      // Simulate adding the resolved path
      account.root.nodes.push({ path: result1.path, name: result1.name });

      const result2 = resolvePathConflict('/list-2', 'List 2', account);
      expect(result2.path).toBe('/list-2-(1)');
    });

    it('should preserve case sensitivity in names', () => {
      const account = createMockAccount(['/MyList']);
      const result = resolvePathConflict('/MyList', 'MyList', account);

      expect(result.name).toBe('MyList (1)');
    });

    it('should handle very long folder names', () => {
      const longName = 'A'.repeat(100);
      const longPath = `/${longName}`;
      const account = createMockAccount([longPath]);

      const result = resolvePathConflict(longPath, longName, account);

      expect(result.path).toBe(`${longPath}-(1)`);
      expect(result.name).toBe(`${longName} (1)`);
    });
  });
});
