/**
 * Unit tests for exportService (rowboat port, slice-2).
 *
 * Every entry point takes the rowboat graph `g` and resolves a template folder by id from it.
 * Tests seed an in-memory `makeGraph()` graph — no sync.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow, ItemState, SessionData, TemplateItem } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import {
  exportSessionToCsv,
  exportSessionToText,
  exportTemplateItemsToCsv,
  exportTemplateItemsToText,
  exportToJson,
  exportToJsonString,
  generateFilename,
} from './exportService';

type Graph = ReturnType<typeof makeGraph>;

const JAN_1 = new Date('2024-01-01T00:00:00.000Z').getTime();

function templateItem(
  id: string,
  name: string,
  type: 'item' | 'category' = 'item',
  path?: string,
  sortOrder = 0,
): TemplateItem {
  return {
    id,
    name,
    type,
    path: path ?? name.toLowerCase(),
    sortOrder,
    archived: false,
    expanded: type === 'category',
    defaultQuantity: '',
    createdAt: JAN_1,
  };
}

function templateSession(id: string, itemStates: Record<string, ItemState> = {}): SessionData {
  return {
    id,
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'zone-in-hierarchy',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: JAN_1,
    lastActivityAt: JAN_1,
  };
}

function templateFolder(
  id: string,
  name: string,
  items: TemplateItem[] = [],
  sessions: SessionData[] = [],
): FolderRow {
  return {
    id,
    owner_group_id: 'group-1',
    name,
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: JAN_1,
    updated_at: JAN_1,
    items,
    sessions,
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  };
}

function graphWith(...folders: FolderRow[]): Graph {
  return makeGraph({ folder: folders });
}

describe('exportService', () => {
  describe('generateFilename', () => {
    it('should generate filename for all-folders export with JSON format', () => {
      const scope = { type: 'all-folders' as const };
      const filename = generateFilename(scope, 'json');

      expect(filename).toMatch(/^checklist-data-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should generate filename for all-folders export with different formats', () => {
      const scope = { type: 'all-folders' as const };

      expect(generateFilename(scope, 'txt')).toMatch(/\.txt$/);
      expect(generateFilename(scope, 'csv')).toMatch(/\.csv$/);
    });

    it('should generate filename for single-folder export with folder name', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json', 'Shopping List');

      expect(filename).toMatch(/^shopping-list-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should sanitize folder names with special characters', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json', 'My Folder #1!');

      expect(filename).toMatch(/^my-folder--1--\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should use default folder name when folderName is not provided', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json');

      expect(filename).toMatch(/^folder-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should include current date in YYYY-MM-DD format', () => {
      const scope = { type: 'all-folders' as const };
      const filename = generateFilename(scope, 'json');
      const today = new Date().toISOString().split('T')[0];

      expect(filename).toContain(today);
    });
  });

  describe('exportToJson', () => {
    it('should export all folders', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [
          templateItem('item-1', 'Milk'),
          templateItem('item-2', 'Bread'),
        ]),
      );

      const result = exportToJson(g, { type: 'all-folders' });

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Groceries');
      expect(result.exportDate).toBeDefined();
      expect(result.appVersion).toBeDefined();
    });

    it('should export single folder by ID', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [templateItem('item-1', 'Milk')]),
      );

      const result = exportToJson(g, { type: 'single-folder', folderId: 'template-1' });

      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Groceries');
    });

    it('should throw error for single-folder export without folderId', () => {
      const g = makeGraph();

      expect(() => {
        exportToJson(g, { type: 'single-folder' });
      }).toThrow('Template ID required for single-template export');
    });

    it('should throw error if template not found', () => {
      const g = makeGraph();

      expect(() => {
        exportToJson(g, { type: 'single-folder', folderId: 'nonexistent' });
      }).toThrow('Template not found: nonexistent');
    });

    it('should export empty folders array when no templates exist', () => {
      const g = makeGraph();

      const result = exportToJson(g, { type: 'all-folders' });

      expect(result.folders).toHaveLength(0);
    });

    it('should export template with hierarchical items', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [
          templateItem('cat-1', 'Dairy', 'category', 'dairy', 0),
          templateItem('item-1', 'Milk', 'item', 'dairy/milk', 1),
          templateItem('item-2', 'Cheese', 'item', 'dairy/cheese', 2),
        ]),
      );

      const result = exportToJson(g, { type: 'all-folders' });

      expect(result.folders[0].items).toBeDefined();
      expect(result.folders[0].items?.length).toBeGreaterThan(0);
    });

    it('should export template with sessions', () => {
      const g = graphWith(
        templateFolder(
          'template-1',
          'Groceries',
          [templateItem('item-1', 'Milk')],
          [
            templateSession('session-1', {
              'item-1': { selected: true, checked: false, selectedAt: JAN_1 },
            }),
          ],
        ),
      );

      const result = exportToJson(g, { type: 'all-folders' });

      expect(result.folders[0].sessions).toBeDefined();
      expect(result.folders[0].sessions).toHaveLength(1);
    });
  });

  describe('exportToJsonString', () => {
    it('should export to pretty-printed JSON by default', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [templateItem('item-1', 'Milk')]),
      );

      const result = exportToJsonString(g, { type: 'all-folders' });

      expect(result).toContain('\n');
      expect(result).toContain('  '); // indentation
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('2.0');
    });

    it('should export to compact JSON when pretty=false', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [templateItem('item-1', 'Milk')]),
      );

      const result = exportToJsonString(g, { type: 'all-folders' }, false);

      expect(result.split('\n')).toHaveLength(1);
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('2.0');
    });
  });

  describe('exportTemplateItemsToText', () => {
    it('should export items to plain text', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [
          templateItem('item-1', 'Milk', 'item', 'milk', 0),
          templateItem('item-2', 'Bread', 'item', 'bread', 1),
        ]),
      );

      const result = exportTemplateItemsToText(g, 'template-1');

      expect(result).toContain('Milk');
      expect(result).toContain('Bread');
    });

    it('should throw error if template not found', () => {
      const g = makeGraph();

      expect(() => {
        exportTemplateItemsToText(g, 'nonexistent');
      }).toThrow('Template not found: nonexistent');
    });

    it('should export hierarchical items with indentation', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [
          templateItem('cat-1', 'Dairy', 'category', 'dairy', 0),
          templateItem('item-1', 'Milk', 'item', 'dairy/milk', 1),
        ]),
      );

      const result = exportTemplateItemsToText(g, 'template-1');

      expect(result).toContain('Dairy');
      expect(result).toContain('Milk');
    });
  });

  describe('exportTemplateItemsToCsv', () => {
    it('should export items to CSV format', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [
          templateItem('item-1', 'Milk', 'item', 'dairy/milk', 0),
          templateItem('item-2', 'Bread', 'item', 'bakery/bread', 1),
        ]),
      );

      const result = exportTemplateItemsToCsv(g, 'template-1');

      expect(result).toContain('name,defaultQuantity,path');
      expect(result).toContain('Milk');
      expect(result).toContain('Bread');
    });

    it('should throw error if template not found', () => {
      const g = makeGraph();

      expect(() => {
        exportTemplateItemsToCsv(g, 'nonexistent');
      }).toThrow('Template not found: nonexistent');
    });
  });

  describe('exportSessionToText', () => {
    it('should export session with checkmarks', () => {
      const g = graphWith(
        templateFolder(
          'template-1',
          'Groceries',
          [
            templateItem('item-1', 'Milk', 'item', 'milk', 0),
            templateItem('item-2', 'Bread', 'item', 'bread', 1),
          ],
          [
            templateSession('session-1', {
              'item-1': { selected: true, checked: true },
              'item-2': { selected: true, checked: false },
            }),
          ],
        ),
      );

      const result = exportSessionToText(g, 'template-1', 'session-1');

      expect(result).toContain('✓ Milk');
      expect(result).toContain('  Bread');
    });

    it('should throw error if template not found', () => {
      const g = makeGraph();

      expect(() => {
        exportSessionToText(g, 'nonexistent', 'session-1');
      }).toThrow('Template not found: nonexistent');
    });

    it('should throw error if session not found', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [templateItem('item-1', 'Milk')]),
      );

      expect(() => {
        exportSessionToText(g, 'template-1', 'nonexistent');
      }).toThrow('Session not found: nonexistent');
    });
  });

  describe('exportSessionToCsv', () => {
    it('should export session to CSV format', () => {
      const g = graphWith(
        templateFolder(
          'template-1',
          'Groceries',
          [
            templateItem('item-1', 'Milk', 'item', 'dairy/milk', 0),
            templateItem('item-2', 'Bread', 'item', 'bakery/bread', 1),
          ],
          [
            templateSession('session-1', {
              'item-1': { selected: true, checked: true, selectedAt: JAN_1, checkedAt: JAN_1 },
              'item-2': { selected: true, checked: false, selectedAt: JAN_1 },
            }),
          ],
        ),
      );

      const result = exportSessionToCsv(g, 'template-1', 'session-1');

      expect(result).toContain('name,path,selected,checked,selectedAt,checkedAt');
      expect(result).toContain('Milk');
      expect(result).toContain('true,true'); // selected and checked
      expect(result).toContain('true,false'); // selected but not checked
    });

    it('should throw error if template not found', () => {
      const g = makeGraph();

      expect(() => {
        exportSessionToCsv(g, 'nonexistent', 'session-1');
      }).toThrow('Template not found: nonexistent');
    });

    it('should throw error if session not found', () => {
      const g = graphWith(
        templateFolder('template-1', 'Groceries', [templateItem('item-1', 'Milk')]),
      );

      expect(() => {
        exportSessionToCsv(g, 'template-1', 'nonexistent');
      }).toThrow('Session not found: nonexistent');
    });
  });
});
