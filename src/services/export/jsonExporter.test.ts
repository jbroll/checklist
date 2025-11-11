/**
 * Unit tests for JSON exporter functions
 */

import { describe, expect, it } from 'vitest';
import { PATH_SEPARATOR } from '../../utils/pathUtils';
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
            createdAt: date,
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
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      // Should be pretty-printed with indentation
      expect(result).toContain('\n');
      expect(result).toContain('  '); // Indentation
      expect(result).toContain('"version": "2.0"');
    });

    it('should convert exported data to compact JSON string', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      // Should be compact (no unnecessary whitespace)
      expect(result).not.toContain('\n  ');
      expect(result).toContain('{"version":"2.0"');
    });

    it('should handle complex nested data structures', () => {
      const data: ExportedData = {
        version: '2.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            path: '/test-folder',
            items: [
              {
                id: 'item-1',
                name: 'Test Item',
                type: 'item',
                sortOrder: 0,
                color: '#000000',
                createdAt: '2024-11-01T00:00:00.000Z',
                updatedAt: '2024-11-01T00:00:00.000Z',
              },
            ],
            sessions: [],
            createdAt: '2024-11-01T00:00:00.000Z',
            updatedAt: '2024-11-01T00:00:00.000Z',
          },
        ],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"Test Folder"');
      expect(result).toContain('"Test Item"');
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

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Template');
      expect(result.folders[0].items).toHaveLength(1);
      expect(result.folders[0].sessions).toHaveLength(1);
    });

    it('should export all folders with date strings (Jazz deserialization)', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: true });

      const result = exportAllFolders(account as any);

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].createdAt).toBe('2024-11-01T00:00:00.000Z');
      expect(result.folders[0].items?.[0].createdAt).toBe('2024-11-01T00:00:00.000Z');
      expect(result.folders[0].sessions?.[0].createdAt).toBe('2024-11-01T00:00:00.000Z');
    });

    it('should handle empty templates list', () => {
      const account = createMockAccount({ withTemplates: false });

      const result = exportAllFolders(account as any);

      expect(result.version).toBe('2.0');
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
        selected: true,
        checked: false,
        selectedAt: '2024-11-01T00:00:00.000Z',
      });
    });
  });

  describe('exportTemplate', () => {
    it('should export a single template with Date objects', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });
      const template = account.root.templates[0];

      const result = exportTemplate(template as any, '/test-template');

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Template');
    });

    it('should export a single template with date strings', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: true });
      const template = account.root.templates[0];

      const result = exportTemplate(template as any, '/test-template');

      expect(result.version).toBe('2.0');
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

  describe('v2.0 hierarchical format', () => {
    it('should export items in hierarchical structure with nested children', () => {
      const date = new Date('2024-11-01T00:00:00.000Z');
      const account = {
        root: {
          templates: [
            {
              $jazz: { id: 'template-1' },
              name: 'Groceries',
              items: [
                {
                  id: 'cat-1',
                  name: 'Produce',
                  type: 'category' as const,
                  path: 'produce',
                  expanded: true,
                  sortOrder: 0,
                  archived: false,
                  defaultQuantity: '',
                  color: '#00ff00',
                  createdAt: date,
                },
                {
                  id: 'cat-2',
                  name: 'Fruits',
                  type: 'category' as const,
                  path: `produce${PATH_SEPARATOR}fruits`,
                  expanded: true,
                  sortOrder: 1,
                  archived: false,
                  defaultQuantity: '',
                  color: '#ffff00',
                  createdAt: date,
                },
                {
                  id: 'item-1',
                  name: 'Apples',
                  type: 'item' as const,
                  path: `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}apples`,
                  expanded: false,
                  sortOrder: 2,
                  archived: false,
                  defaultQuantity: '5 lbs',
                  color: '#ff0000',
                  createdAt: date,
                },
                {
                  id: 'item-2',
                  name: 'Bananas',
                  type: 'item' as const,
                  path: `produce${PATH_SEPARATOR}fruits${PATH_SEPARATOR}bananas`,
                  expanded: false,
                  sortOrder: 3,
                  archived: false,
                  defaultQuantity: '1 bunch',
                  color: '#ffff00',
                  createdAt: date,
                },
              ],
              sessions: [],
              currentSessionId: '',
              showZoneHeadings: false,
              createdAt: date,
              updatedAt: date,
            },
          ],
          directory: [
            {
              id: 'dir-1',
              name: 'Groceries',
              type: 'template-ref' as const,
              path: '/groceries',
              expanded: false,
              archived: false,
              templateId: 'template-1',
              createdAt: date,
              updatedAt: date,
            },
          ],
        },
      };

      const result = exportAllFolders(account as any);

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);

      const items = result.folders[0].items;
      expect(items).toBeDefined();
      expect(items).toHaveLength(1); // Only 1 root category

      // Check hierarchical structure
      const produce = items?.[0];
      expect(produce?.id).toBe('cat-1');
      expect(produce?.name).toBe('Produce');
      expect(produce?.type).toBe('category');
      expect(produce?.children).toBeDefined();
      expect(produce?.children).toHaveLength(1); // Fruits category

      const fruits = produce?.children?.[0];
      expect(fruits?.id).toBe('cat-2');
      expect(fruits?.name).toBe('Fruits');
      expect(fruits?.type).toBe('category');
      expect(fruits?.children).toBeDefined();
      expect(fruits?.children).toHaveLength(2); // Apples and Bananas

      const apples = fruits?.children?.[0];
      expect(apples?.id).toBe('item-1');
      expect(apples?.name).toBe('Apples');
      expect(apples?.type).toBe('item');
      expect(apples?.defaultQuantity).toBe('5 lbs');
      expect(apples?.children).toBeUndefined(); // Items don't have children

      const bananas = fruits?.children?.[1];
      expect(bananas?.id).toBe('item-2');
      expect(bananas?.name).toBe('Bananas');
      expect(bananas?.defaultQuantity).toBe('1 bunch');
    });

    it('should export session states with neutral terminology and item IDs', () => {
      const date = new Date('2024-11-01T00:00:00.000Z');
      const account = {
        root: {
          templates: [
            {
              $jazz: { id: 'template-1' },
              name: 'Shopping List',
              items: [
                {
                  id: 'item-1',
                  name: 'Milk',
                  type: 'item' as const,
                  path: 'milk',
                  expanded: false,
                  sortOrder: 0,
                  archived: false,
                  defaultQuantity: '1 gallon',
                  color: '#ffffff',
                  createdAt: date,
                },
                {
                  id: 'item-2',
                  name: 'Bread',
                  type: 'item' as const,
                  path: 'bread',
                  expanded: false,
                  sortOrder: 1,
                  archived: false,
                  defaultQuantity: '1 loaf',
                  color: '#ffeecc',
                  createdAt: date,
                },
              ],
              sessions: [
                {
                  $jazz: { id: 'session-1' },
                  archived: false,
                  viewMode: 'flat' as const,
                  itemStates: {
                    'item-1': {
                      selected: true,
                      checked: false,
                      selectedAt: date,
                    },
                    'item-2': {
                      selected: true,
                      checked: true,
                      selectedAt: date,
                      checkedAt: date,
                    },
                  },
                  categoryExpanded: {},
                  selectedCount: 2,
                  checkedCount: 1,
                  remainingCount: 1,
                  createdAt: date,
                  lastActivityAt: date,
                },
              ],
              currentSessionId: 'session-1',
              showZoneHeadings: false,
              createdAt: date,
              updatedAt: date,
            },
          ],
          directory: [
            {
              id: 'dir-1',
              name: 'Shopping List',
              type: 'template-ref' as const,
              path: '/shopping',
              expanded: false,
              archived: false,
              templateId: 'template-1',
              createdAt: date,
              updatedAt: date,
            },
          ],
        },
      };

      const result = exportAllFolders(account as any);

      const session = result.folders[0].sessions?.[0];
      expect(session).toBeDefined();

      // Check neutral terminology (not inCart/purchased)
      expect(session?.itemStates['item-1']).toEqual({
        selected: true,
        checked: false,
        selectedAt: '2024-11-01T00:00:00.000Z',
      });

      expect(session?.itemStates['item-2']).toEqual({
        selected: true,
        checked: true,
        selectedAt: '2024-11-01T00:00:00.000Z',
        checkedAt: '2024-11-01T00:00:00.000Z',
      });
    });

    it('should include item IDs in exported items for session state mapping', () => {
      const account = createMockAccount({ withTemplates: true, datesAsStrings: false });

      const result = exportAllFolders(account as any);

      const items = result.folders[0].items;
      expect(items).toBeDefined();
      expect(items?.[0].id).toBeDefined();
      expect(items?.[0].id).toBe('item-1');
    });

    it('should export multiple levels of nesting correctly', () => {
      const date = new Date('2024-11-01T00:00:00.000Z');
      const account = {
        root: {
          templates: [
            {
              $jazz: { id: 'template-1' },
              name: 'Deep Structure',
              items: [
                {
                  id: 'level-1',
                  name: 'Level 1',
                  type: 'category' as const,
                  path: 'level-1',
                  expanded: true,
                  sortOrder: 0,
                  archived: false,
                  defaultQuantity: '',
                  color: '#111111',
                  createdAt: date,
                },
                {
                  id: 'level-2',
                  name: 'Level 2',
                  type: 'category' as const,
                  path: `level-1${PATH_SEPARATOR}level-2`,
                  expanded: true,
                  sortOrder: 1,
                  archived: false,
                  defaultQuantity: '',
                  color: '#222222',
                  createdAt: date,
                },
                {
                  id: 'level-3',
                  name: 'Level 3',
                  type: 'category' as const,
                  path: `level-1${PATH_SEPARATOR}level-2${PATH_SEPARATOR}level-3`,
                  expanded: true,
                  sortOrder: 2,
                  archived: false,
                  defaultQuantity: '',
                  color: '#333333',
                  createdAt: date,
                },
                {
                  id: 'deep-item',
                  name: 'Deep Item',
                  type: 'item' as const,
                  path: `level-1${PATH_SEPARATOR}level-2${PATH_SEPARATOR}level-3${PATH_SEPARATOR}deep-item`,
                  expanded: false,
                  sortOrder: 3,
                  archived: false,
                  defaultQuantity: '1',
                  color: '#444444',
                  createdAt: date,
                },
              ],
              sessions: [],
              currentSessionId: '',
              showZoneHeadings: false,
              createdAt: date,
              updatedAt: date,
            },
          ],
          directory: [
            {
              id: 'dir-1',
              name: 'Deep Structure',
              type: 'template-ref' as const,
              path: '/deep',
              expanded: false,
              archived: false,
              templateId: 'template-1',
              createdAt: date,
              updatedAt: date,
            },
          ],
        },
      };

      const result = exportAllFolders(account as any);

      const items = result.folders[0].items;
      expect(items).toHaveLength(1); // Only 1 root

      const level1 = items?.[0];
      expect(level1?.name).toBe('Level 1');
      expect(level1?.children).toHaveLength(1);

      const level2 = level1?.children?.[0];
      expect(level2?.name).toBe('Level 2');
      expect(level2?.children).toHaveLength(1);

      const level3 = level2?.children?.[0];
      expect(level3?.name).toBe('Level 3');
      expect(level3?.children).toHaveLength(1);

      const deepItem = level3?.children?.[0];
      expect(deepItem?.name).toBe('Deep Item');
      expect(deepItem?.type).toBe('item');
      expect(deepItem?.children).toBeUndefined();
    });
  });
});
