/**
 * Unit tests for CSV exporter functions
 */

import { describe, expect, it } from 'vitest';
import { exportSessionToCsv, exportTemplateItemsToCsv } from './csvExporter';

// Mock template data
const createMockTemplate = (options: { datesAsStrings?: boolean } = {}) => {
  const { datesAsStrings = false } = options;
  const date = datesAsStrings ? '2024-11-01T00:00:00.000Z' : new Date('2024-11-01T00:00:00.000Z');

  return {
    $jazz: { id: 'template-1' },
    name: 'Test Template',
    items: [
      {
        id: 'item-1',
        name: 'Apples',
        type: 'item' as const,
        path: 'produce/apples',
        expanded: false,
        sortOrder: 0,
        archived: false,
        defaultQuantity: '5',
        createdAt: date,
      },
      {
        id: 'item-2',
        name: 'Bananas',
        type: 'item' as const,
        path: 'produce/bananas',
        expanded: false,
        sortOrder: 1,
        archived: false,
        defaultQuantity: '3',
        createdAt: date,
      },
      {
        id: 'category-1',
        name: 'Produce',
        type: 'category' as const,
        path: 'produce',
        expanded: true,
        sortOrder: 2,
        archived: false,
        defaultQuantity: '',
        createdAt: date,
      },
    ],
    sessions: [
      {
        $jazz: { id: 'session-1' },
        name: '[2024-11-01]',
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
  };
};

describe('csvExporter', () => {
  describe('exportTemplateItemsToCsv', () => {
    it('should export template items to CSV format', () => {
      const template = createMockTemplate();

      const result = exportTemplateItemsToCsv(template as any);

      const lines = result.split('\n');
      expect(lines[0]).toBe('name,defaultQuantity,path');
      expect(lines[1]).toBe('Apples,5,produce/apples');
      expect(lines[2]).toBe('Bananas,3,produce/bananas');
      expect(lines).toHaveLength(3); // Header + 2 items (category excluded)
    });

    it('should exclude categories from export', () => {
      const template = createMockTemplate();

      const result = exportTemplateItemsToCsv(template as any);

      expect(result).not.toContain('Produce');
      expect(result).toContain('Apples');
      expect(result).toContain('Bananas');
    });

    it('should exclude archived items', () => {
      const template = createMockTemplate();
      template.items[0].archived = true; // Archive Apples

      const result = exportTemplateItemsToCsv(template as any);

      const lines = result.split('\n');
      expect(lines).toHaveLength(2); // Header + 1 item
      expect(result).not.toContain('Apples');
      expect(result).toContain('Bananas');
    });

    it('should handle empty template', () => {
      const template = createMockTemplate();
      template.items = [];

      const result = exportTemplateItemsToCsv(template as any);

      expect(result).toBe('name,defaultQuantity,path');
    });

    it('should escape CSV special characters', () => {
      const template = createMockTemplate();
      template.items[0].name = 'Item, with comma';
      template.items[1].name = 'Item "with quotes"';

      const result = exportTemplateItemsToCsv(template as any);

      expect(result).toContain('"Item, with comma"');
      expect(result).toContain('"Item ""with quotes"""');
    });

    it('should sort items by sortOrder', () => {
      const template = createMockTemplate();
      template.items[0].sortOrder = 5;
      template.items[1].sortOrder = 1;

      const result = exportTemplateItemsToCsv(template as any);

      const lines = result.split('\n');
      expect(lines[1]).toContain('Bananas'); // sortOrder 1
      expect(lines[2]).toContain('Apples'); // sortOrder 5
    });
  });

  describe('exportSessionToCsv', () => {
    it('should export session to CSV format with Date objects', () => {
      const template = createMockTemplate({ datesAsStrings: false });

      const result = exportSessionToCsv(template as any, 'session-1');

      expect(result).toBeTruthy();
      const lines = result?.split('\n');
      expect(lines[0]).toBe('name,path,selected,checked,selectedAt,checkedAt');
      expect(lines[1]).toContain('Apples,produce/apples,true,false,2024-11-01T00:00:00.000Z,');
      expect(lines[2]).toContain(
        'Bananas,produce/bananas,true,true,2024-11-01T00:00:00.000Z,2024-11-01T00:00:00.000Z',
      );
    });

    it('should export session to CSV format with date strings', () => {
      const template = createMockTemplate({ datesAsStrings: true });

      const result = exportSessionToCsv(template as any, 'session-1');

      expect(result).toBeTruthy();
      const lines = result?.split('\n');
      expect(lines[1]).toContain('2024-11-01T00:00:00.000Z');
    });

    it('should return null for non-existent session', () => {
      const template = createMockTemplate();

      const result = exportSessionToCsv(template as any, 'non-existent-session');

      expect(result).toBeNull();
    });

    it('should handle items not in session', () => {
      const template = createMockTemplate();
      template.items.push({
        id: 'item-3',
        name: 'Oranges',
        type: 'item' as const,
        path: 'produce/oranges',
        expanded: false,
        sortOrder: 3,
        archived: false,
        defaultQuantity: '2',
        createdAt: new Date('2024-11-01T00:00:00.000Z'),
      });

      const result = exportSessionToCsv(template as any, 'session-1');

      expect(result).toContain('Oranges,produce/oranges,false,false,,');
    });

    it('should exclude categories from session export', () => {
      const template = createMockTemplate();

      const result = exportSessionToCsv(template as any, 'session-1');

      expect(result).not.toContain('Produce');
      const lines = result?.split('\n');
      expect(lines).toHaveLength(3); // Header + 2 items
    });

    it('should exclude archived items from session export', () => {
      const template = createMockTemplate();
      template.items[0].archived = true; // Archive Apples

      const result = exportSessionToCsv(template as any, 'session-1');

      const lines = result?.split('\n');
      expect(lines).toHaveLength(2); // Header + 1 item
      expect(result).not.toContain('Apples');
    });

    it('should return null if template has no sessions', () => {
      const template = createMockTemplate();
      template.sessions = undefined as any;

      const result = exportSessionToCsv(template as any, 'session-1');

      expect(result).toBeNull();
    });

    it('should handle empty itemStates', () => {
      const template = createMockTemplate();
      template.sessions[0].itemStates = {};

      const result = exportSessionToCsv(template as any, 'session-1');

      expect(result).toBeTruthy();
      const lines = result?.split('\n');
      expect(lines[1]).toContain('false,false,,');
      expect(lines[2]).toContain('false,false,,');
    });
  });
});
