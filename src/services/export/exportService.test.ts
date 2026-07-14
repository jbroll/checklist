/**
 * Unit tests for exportService
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { describe, expect, it } from 'vitest';
import type { Account, FolderNode, TemplateItem } from '../../schema';
import type { SessionData } from '../../schema/tree';
import {
  exportSessionToCsv,
  exportSessionToText,
  exportTemplateItemsToCsv,
  exportTemplateItemsToText,
  exportToJson,
  exportToJsonString,
  generateFilename,
} from './exportService';

// Mock helpers
const createMockTemplateItem = (
  id: string,
  name: string,
  type: 'item' | 'category' = 'item',
  path?: string,
  sortOrder = 0,
): TemplateItem =>
  ({
    id,
    name,
    type,
    path: path ?? name.toLowerCase(),
    sortOrder,
    archived: false,
    expanded: type === 'category',
    defaultQuantity: '',
    createdAt: new Date('2024-01-01'),
  }) as TemplateItem;

const createMockSession = (id: string, itemStates: Record<string, any> = {}): SessionData => ({
  id,
  itemStates,
  archived: false,
  categoryExpanded: {},
  viewMode: 'zone-in-hierarchy' as const,
  selectedCount: 0,
  checkedCount: 0,
  remainingCount: 0,
  createdAt: new Date('2024-01-15T10:00:00Z'),
  lastActivityAt: new Date('2024-01-15T12:00:00Z'),
});

const createMockTemplate = (
  id: string,
  name: string,
  items: TemplateItem[] = [],
  sessions: SessionData[] = [],
): InstanceOfSchema<typeof FolderNode> => {
  const template: any = {
    name,
    items,
    sessions,
    showZoneHeadings: false,
    archived: false,
    expanded: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-10'),
    $jazz: { id },
  };
  return template;
};

const createMockAccount = (
  templates: InstanceOfSchema<typeof FolderNode>[] = [],
): InstanceOfSchema<typeof Account> =>
  ({
    root: {
      folders: templates,
    },
  }) as any;

// TODO(slice-2): export still reads a Jazz Account/FolderNode; skip-pending until export
// lands on rowboat (see docs/superpowers/d-t4-report.md).
describe.skip('exportService', () => {
  describe('generateFilename', () => {
    it('should generate filename for all-folders export with JSON format', () => {
      const scope = { type: 'all-folders' as const };
      const filename = generateFilename(scope, 'json');

      // Should match pattern: checklist-data-YYYY-MM-DD.json
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

      // Should sanitize folder name and include it
      expect(filename).toMatch(/^shopping-list-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should sanitize folder names with special characters', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json', 'My Folder #1!');

      // Should replace non-alphanumeric characters with hyphens (# becomes - and ! becomes -)
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
      const items = [
        createMockTemplateItem('item-1', 'Milk'),
        createMockTemplateItem('item-2', 'Bread'),
      ];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportToJson(account, { type: 'all-folders' });

      expect(result.version).toBe('2.0');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Groceries');
      expect(result.exportDate).toBeDefined();
      expect(result.appVersion).toBeDefined();
    });

    it('should export single folder by ID', () => {
      const items = [createMockTemplateItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportToJson(account, { type: 'single-folder', folderId: 'template-1' });

      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Groceries');
    });

    it('should throw error for single-folder export without folderId', () => {
      const account = createMockAccount([]);

      expect(() => {
        exportToJson(account, { type: 'single-folder' } as any);
      }).toThrow('Template ID required for single-template export');
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        exportToJson(account, { type: 'single-folder', folderId: 'nonexistent' });
      }).toThrow('Template not found: nonexistent');
    });

    it('should export empty folders array when no templates exist', () => {
      const account = createMockAccount([]);

      const result = exportToJson(account, { type: 'all-folders' });

      expect(result.folders).toHaveLength(0);
    });

    it('should export template with hierarchical items', () => {
      const items = [
        createMockTemplateItem('cat-1', 'Dairy', 'category', 'dairy', 0),
        createMockTemplateItem('item-1', 'Milk', 'item', 'dairy/milk', 1),
        createMockTemplateItem('item-2', 'Cheese', 'item', 'dairy/cheese', 2),
      ];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportToJson(account, { type: 'all-folders' });

      expect(result.folders[0].items).toBeDefined();
      // Items should be exported in hierarchical structure
      expect(result.folders[0].items?.length).toBeGreaterThan(0);
    });

    it('should export template with sessions', () => {
      const items = [createMockTemplateItem('item-1', 'Milk')];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: false, selectedAt: new Date() },
      });
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      const result = exportToJson(account, { type: 'all-folders' });

      expect(result.folders[0].sessions).toBeDefined();
      expect(result.folders[0].sessions).toHaveLength(1);
    });
  });

  describe('exportToJsonString', () => {
    it('should export to pretty-printed JSON by default', () => {
      const items = [createMockTemplateItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportToJsonString(account, { type: 'all-folders' });

      expect(result).toContain('\n');
      expect(result).toContain('  '); // Indentation
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('2.0');
    });

    it('should export to compact JSON when pretty=false', () => {
      const items = [createMockTemplateItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportToJsonString(account, { type: 'all-folders' }, false);

      // Compact JSON should not have indentation newlines
      expect(result.split('\n')).toHaveLength(1);
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('2.0');
    });
  });

  describe('exportTemplateItemsToText', () => {
    it('should export items to plain text', () => {
      const items = [
        createMockTemplateItem('item-1', 'Milk', 'item', 'milk', 0),
        createMockTemplateItem('item-2', 'Bread', 'item', 'bread', 1),
      ];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportTemplateItemsToText(account, 'template-1');

      expect(result).toContain('Milk');
      expect(result).toContain('Bread');
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        exportTemplateItemsToText(account, 'nonexistent');
      }).toThrow('Template not found: nonexistent');
    });

    it('should export hierarchical items with indentation', () => {
      const items = [
        createMockTemplateItem('cat-1', 'Dairy', 'category', 'dairy', 0),
        createMockTemplateItem('item-1', 'Milk', 'item', 'dairy/milk', 1),
      ];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportTemplateItemsToText(account, 'template-1');

      expect(result).toContain('Dairy');
      expect(result).toContain('Milk');
    });
  });

  describe('exportTemplateItemsToCsv', () => {
    it('should export items to CSV format', () => {
      const items = [
        createMockTemplateItem('item-1', 'Milk', 'item', 'dairy/milk', 0),
        createMockTemplateItem('item-2', 'Bread', 'item', 'bakery/bread', 1),
      ];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      const result = exportTemplateItemsToCsv(account, 'template-1');

      expect(result).toContain('name,defaultQuantity,path');
      expect(result).toContain('Milk');
      expect(result).toContain('Bread');
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        exportTemplateItemsToCsv(account, 'nonexistent');
      }).toThrow('Template not found: nonexistent');
    });
  });

  describe('exportSessionToText', () => {
    it('should export session with checkmarks', () => {
      const items = [
        createMockTemplateItem('item-1', 'Milk', 'item', 'milk', 0),
        createMockTemplateItem('item-2', 'Bread', 'item', 'bread', 1),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: true },
        'item-2': { selected: true, checked: false },
      });
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      const result = exportSessionToText(account, 'template-1', 'session-1');

      expect(result).toContain('✓ Milk');
      expect(result).toContain('  Bread');
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        exportSessionToText(account, 'nonexistent', 'session-1');
      }).toThrow('Template not found: nonexistent');
    });

    it('should throw error if session not found', () => {
      const items = [createMockTemplateItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      expect(() => {
        exportSessionToText(account, 'template-1', 'nonexistent');
      }).toThrow('Session not found: nonexistent');
    });
  });

  describe('exportSessionToCsv', () => {
    it('should export session to CSV format', () => {
      const items = [
        createMockTemplateItem('item-1', 'Milk', 'item', 'dairy/milk', 0),
        createMockTemplateItem('item-2', 'Bread', 'item', 'bakery/bread', 1),
      ];
      const session = createMockSession('session-1', {
        'item-1': { selected: true, checked: true, selectedAt: new Date(), checkedAt: new Date() },
        'item-2': { selected: true, checked: false, selectedAt: new Date() },
      });
      const template = createMockTemplate('template-1', 'Groceries', items, [session]);
      const account = createMockAccount([template]);

      const result = exportSessionToCsv(account, 'template-1', 'session-1');

      expect(result).toContain('name,path,selected,checked,selectedAt,checkedAt');
      expect(result).toContain('Milk');
      expect(result).toContain('true,true'); // selected and checked
      expect(result).toContain('true,false'); // selected but not checked
    });

    it('should throw error if template not found', () => {
      const account = createMockAccount([]);

      expect(() => {
        exportSessionToCsv(account, 'nonexistent', 'session-1');
      }).toThrow('Template not found: nonexistent');
    });

    it('should throw error if session not found', () => {
      const items = [createMockTemplateItem('item-1', 'Milk')];
      const template = createMockTemplate('template-1', 'Groceries', items, []);
      const account = createMockAccount([template]);

      expect(() => {
        exportSessionToCsv(account, 'template-1', 'nonexistent');
      }).toThrow('Session not found: nonexistent');
    });
  });
});
