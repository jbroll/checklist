/**
 * Unit tests for import validators
 */

import { describe, expect, it } from 'vitest';
import type { ExportedData } from '../export/types';
import { validateJsonData } from './validators';

// Mock GroceriesAccount for testing
const createMockAccount = (existingPaths: string[] = []) => {
  return {
    root: {
      nodes: existingPaths.map((path) => ({
        path,
        name: path.replace('/', ''),
      })),
    },
  } as any;
};

describe('validators', () => {
  describe('validateJsonData', () => {
    const validData: ExportedData = {
      version: '1.0',
      exportDate: '2024-11-01T00:00:00.000Z',
      appVersion: '1.0.0',
      folders: [],
    };

    it('should validate correct JSON data structure', () => {
      const account = createMockAccount();
      const result = validateJsonData(validData, account);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-object data', () => {
      const account = createMockAccount();
      const result = validateJsonData('just a string', account);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be an object');
    });

    it('should reject data without version field', () => {
      const account = createMockAccount();
      const invalidData = {
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('should reject data without exportDate field', () => {
      const account = createMockAccount();
      const invalidData = {
        version: '1.0',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: exportDate');
    });

    it('should reject data without folders field', () => {
      const account = createMockAccount();
      const invalidData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: folders');
    });

    it('should reject data with folders not being an array', () => {
      const account = createMockAccount();
      const invalidData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: 'not-an-array',
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('must be an array'))).toBe(true);
    });

    it('should validate data with valid folders', () => {
      const account = createMockAccount();
      const dataWithFolders: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            path: '/test-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(dataWithFolders, account);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject folder without required name field', () => {
      const account = createMockAccount();
      const invalidData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            type: 'template-folder',
            path: '/test',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('name'))).toBe(true);
    });

    it('should reject folder with invalid type', () => {
      const account = createMockAccount();
      const invalidData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'invalid-type',
            path: '/test',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('type'))).toBe(true);
    });

    it('should validate folder with valid items', () => {
      const account = createMockAccount();
      const dataWithItems: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            path: '/test-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [
              {
                name: 'Apple',
                type: 'item',
                path: 'apple',
                expanded: false,
                sortOrder: 0,
                icon: '🍎',
                color: '#ff0000',
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(dataWithItems, account);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject item with invalid type', () => {
      const account = createMockAccount();
      const invalidData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            path: '/test',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [
              {
                name: 'Item',
                type: 'invalid-type',
                path: 'item',
                sortOrder: 0,
                icon: '📦',
                color: '#000000',
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(invalidData, account);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('type'))).toBe(true);
    });

    it('should accept optional defaultQuantity field', () => {
      const account = createMockAccount();
      const dataWithQuantity: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            path: '/test',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [
              {
                name: 'Item',
                type: 'item',
                path: 'item',
                expanded: false,
                sortOrder: 0,
                defaultQuantity: '2 lbs',
                icon: '📦',
                color: '#6b7280',
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(dataWithQuantity, account);

      expect(result.isValid).toBe(true);
    });

    it('should warn about missing appVersion', () => {
      const account = createMockAccount();
      const dataWithoutAppVersion = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        folders: [],
      };

      const result = validateJsonData(dataWithoutAppVersion, account);

      expect(result.warnings.some((w) => w.includes('appVersion'))).toBe(true);
    });

    it('should detect duplicate folders by path', () => {
      const account = createMockAccount(['/grocery-list']);
      const dataWithDuplicate: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Grocery List',
            type: 'template-folder',
            path: '/grocery-list',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(dataWithDuplicate, account);

      expect(result.isValid).toBe(true); // Still valid, just has duplicates
      expect(result.stats.duplicateFolders).toBe(1);
    });
  });
});
