/**
 * Unit tests for import validators (rowboat port, slice-2).
 *
 * `validateJsonData(g, data)` takes the rowboat graph `g` instead of a Jazz account;
 * conflict-detection reads `folderOps.childrenOf(g, null)` (top-level folders).
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import type { ExportedData } from '../export/types';
import { validateJsonData } from './validators';

type Graph = ReturnType<typeof makeGraph>;

/** Build a top-level (organizational) folder row for duplicate-name detection tests. */
function orgFolder(id: string, name: string, extra: Partial<FolderRow> = {}): FolderRow {
  return {
    id,
    owner_group_id: 'group-1',
    name,
    type: 'folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items: [],
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
    ...extra,
  };
}

function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

describe('validators', () => {
  describe('validateJsonData', () => {
    const validData: ExportedData = {
      version: '2.0',
      exportDate: '2024-11-01T00:00:00.000Z',
      appVersion: '1.0.0',
      folders: [],
    };

    it('should validate correct JSON data structure', () => {
      const result = validateJsonData(makeGraph(), validData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-object data', () => {
      const result = validateJsonData(makeGraph(), 'just a string');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be an object');
    });

    it('should reject data without version field', () => {
      const invalidData = {
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('should reject data without exportDate field', () => {
      const invalidData = {
        version: '2.0',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: exportDate');
    });

    it('should reject data without folders field', () => {
      const invalidData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: folders');
    });

    it('should reject data with folders not being an array', () => {
      const invalidData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: 'not-an-array',
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('must be an array'))).toBe(true);
    });

    it('should validate data with valid folders', () => {
      const dataWithFolders: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(makeGraph(), dataWithFolders);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject folder without required name field', () => {
      const invalidData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            type: 'template-folder',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('name'))).toBe(true);
    });

    it('should reject folder with invalid type', () => {
      const invalidData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'invalid-type',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('type'))).toBe(true);
    });

    it('should validate folder with valid items', () => {
      const dataWithItems: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [
              {
                id: 'apple-id',
                name: 'Apple',
                type: 'item',
                expanded: false,
                sortOrder: 0,
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(makeGraph(), dataWithItems);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject item with invalid type', () => {
      const invalidData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [
              {
                id: 'item-id',
                name: 'Item',
                type: 'invalid-type',
                sortOrder: 0,
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(makeGraph(), invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes('type'))).toBe(true);
    });

    it('should accept optional defaultQuantity field', () => {
      const dataWithQuantity: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [
              {
                id: 'item-id',
                name: 'Item',
                type: 'item',
                expanded: false,
                sortOrder: 0,
                defaultQuantity: '2 lbs',
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(makeGraph(), dataWithQuantity);

      expect(result.isValid).toBe(true);
    });

    it('should warn about missing appVersion', () => {
      const dataWithoutAppVersion = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        folders: [],
      };

      const result = validateJsonData(makeGraph(), dataWithoutAppVersion);

      expect(result.warnings.some((w) => w.includes('appVersion'))).toBe(true);
    });

    it('should detect duplicate folders by name against existing top-level folders', () => {
      const g = graphWith(orgFolder('f1', 'Grocery List'));
      const dataWithDuplicate: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Grocery List',
            type: 'template-folder',
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
            items: [],
            sessions: [],
          },
        ],
      };

      const result = validateJsonData(g, dataWithDuplicate);

      expect(result.isValid).toBe(true); // Still valid, just has duplicates
      expect(result.stats.duplicateFolders).toBe(1);
    });
  });
});
