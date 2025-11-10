/**
 * Unit tests for JSON exporter functions
 */

import { describe, expect, it } from 'vitest';
import { exportAllFolders, exportTemplate, toJsonString } from './jsonExporter';
import type { ExportedData } from './types';

// Mock Jazz data structures
const createMockAccount = (options: { withTemplates?: boolean; datesAsStrings?: boolean }) => {
  const { withTemplates = true, datesAsStrings = false } = options;
  const date = datesAsStrings ? '2024-11-01T00:00:00.000Z' : new Date('2024-11-01T00:00:00.000Z');

  const mockTemplate = withTemplates
    ? {
        $jazz: { id: 'template-1' },
        name: 'Test Template',
        items: [
          {
            id: 'item-1',
            name: 'Test Item',
            type: 'item' as const,
            path: 'test-item',
            expanded: false,
            sortOrder: 0,
            archived: false,
            defaultQuantity: '1',
            color: '#000000',
            createdAt: date,
          },
        ],
        sessions: [
          {
            $jazz: { id: 'session-1' },
            name: '[2024-11-01]',
            status: 'active' as const,
            archived: false,
            viewMode: 'flat' as const,
            itemStates: {
              'item-1': {
                selected: true,
                checked: false,
                selectedAt: date,
              },
            },
            categoryExpanded: {},
            selectedCount: 1,
            checkedCount: 0,
            remainingCount: 1,
            startedAt: date,
            lastActivityAt: date,
          },
        ],
        currentSessionId: 'session-1',
        showZoneHeadings: false,
        createdAt: date,
        updatedAt: date,
      }
    : null;

  return {
    root: {
      templates: withTemplates && mockTemplate ? [mockTemplate] : [],
      directory:
        withTemplates && mockTemplate
          ? [
              {
                id: 'dir-1',
                name: 'Test Template',
                type: 'template-ref' as const,
                path: '/test-template',
                expanded: false,
                archived: false,
                templateId: 'template-1',
                createdAt: date,
                updatedAt: date,
              },
            ]
          : [],
    },
  };
};

describe('jsonExporter', () => {
  describe('toJsonString', () => {
    it('should convert exported data to JSON string with pretty formatting', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      // Should be pretty-printed with indentation
      expect(result).toContain('\n');
      expect(result).toContain('  '); // Indentation
      expect(result).toContain('"version": "1.0"');
    });

    it('should convert exported data to compact JSON string', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      // Should be compact (no unnecessary whitespace)
      expect(result).not.toContain('\n  ');
      expect(result).toContain('{"version":"1.0"');
    });

    it('should handle complex nested data structures', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            path: '/test-folder',
            items: [
              {
                name: 'Test Item',
                category: 'produce',
                sortOrder: 0,
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"Test Folder"');
      expect(result).toContain('"Test Item"');
      expect(result).toContain('"produce"');
    });

    it('should preserve date strings in ISO format', () => {
      const dateStr = '2024-11-01T12:00:00.000Z';
      const data: ExportedData = {
        version: '1.0',
        exportDate: dateStr,
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      expect(result).toContain(dateStr);
    });

    it('should handle empty folders array', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"folders": []');
    });

    it('should handle optional fields correctly', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            path: '/test',
            items: [
              {
                name: 'Item',
                category: 'other',
                sortOrder: 0,
                // defaultQuantity is optional and not provided
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = toJsonString(data, false);

      // Should not include undefined optional fields
      expect(JSON.parse(result)).toBeDefined();
      expect(result).toContain('"name":"Item"');
    });
  });

  describe('exportAllFolders', () => {
    it('should export all folders with Date objects', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });

      const result = exportAllFolders(account as any);

      expect(result.version).toBe('1.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Template');
      expect(result.folders[0].path).toBe('/test-template');
      expect(result.folders[0].items).toHaveLength(1);
      expect(result.folders[0].sessions).toHaveLength(1);
    });

    it('should export all folders with date strings (Jazz deserialization)', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: true });

      const result = exportAllFolders(account as any);

      expect(result.version).toBe('1.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].createdAt).toBe('2024-11-01T00:00:00.000Z');
      expect(result.folders[0].items?.[0].createdAt).toBe('2024-11-01T00:00:00.000Z');
      expect(result.folders[0].sessions?.[0].startedAt).toBe('2024-11-01T00:00:00.000Z');
    });

    it('should handle empty templates list', () => {
      const account = createMockAccount({ withTemplates: false });

      const result = exportAllFolders(account as any);

      expect(result.version).toBe('1.0');
      expect(result.folders).toHaveLength(0);
    });

    it('should skip archived items', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });
      // Add archived item
      account.root.templates[0].items.push({
        id: 'item-2',
        name: 'Archived Item',
        type: 'item' as const,
        path: 'archived-item',
        expanded: false,
        sortOrder: 1,
        archived: true, // This should be skipped
        defaultQuantity: '1',
        color: '#000000',
        createdAt: new Date('2024-11-01T00:00:00.000Z'),
      });

      const result = exportAllFolders(account as any);

      expect(result.folders[0].items).toHaveLength(1);
      expect(result.folders[0].items?.[0].name).toBe('Test Item');
    });

    it('should export session item states with dates', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });

      const result = exportAllFolders(account as any);

      const session = result.folders[0].sessions?.[0];
      expect(session).toBeDefined();
      expect(session?.itemStates['item-1']).toEqual({
        inCart: true,
        purchased: false,
        addedToCartAt: '2024-11-01T00:00:00.000Z',
      });
    });
  });

  describe('exportTemplate', () => {
    it('should export a single template with Date objects', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });
      const template = account.root.templates[0];

      const result = exportTemplate(template as any, '/test-template');

      expect(result.version).toBe('1.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Template');
      expect(result.folders[0].path).toBe('/test-template');
    });

    it('should export a single template with date strings', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: true });
      const template = account.root.templates[0];

      const result = exportTemplate(template as any, '/test-template');

      expect(result.version).toBe('1.0');
      expect(result.folders[0].createdAt).toBe('2024-11-01T00:00:00.000Z');
      expect(result.folders[0].updatedAt).toBe('2024-11-01T00:00:00.000Z');
    });

    it('should include currentSessionId if present', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });
      const template = account.root.templates[0];

      const result = exportTemplate(template as any, '/test-template');

      expect(result.folders[0].currentSessionId).toBe('session-1');
    });

    it('should handle template without items or sessions', () => {
      const template = {
        $jazz: { id: 'template-2' },
        name: 'Empty Template',
        items: [],
        sessions: [],
        currentSessionId: '',
        showZoneHeadings: false,
        createdAt: new Date('2024-11-01T00:00:00.000Z'),
        updatedAt: new Date('2024-11-01T00:00:00.000Z'),
      };

      const result = exportTemplate(template as any, '/empty-template');

      expect(result.folders[0].items).toEqual([]);
      expect(result.folders[0].sessions).toEqual([]);
      expect(result.folders[0].currentSessionId).toBeUndefined();
    });
  });
});
