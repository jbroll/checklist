/**
 * Unit tests for TXT exporter functions
 */

import { describe, expect, it } from 'vitest';
import { PATH_SEPARATOR } from '@/utils/pathUtils';
import { exportSessionToText, exportTemplateItemsToText } from './txtExporter';

// Mock template data
const createMockTemplate = (options: { withCategories?: boolean } = {}) => {
  const { withCategories = false } = options;
  const date = new Date('2024-11-01T00:00:00.000Z');

  const items = [
    {
      id: 'item-1',
      name: 'Apples',
      type: 'item' as const,
      path: `produce${PATH_SEPARATOR}apples`,
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
      path: `produce${PATH_SEPARATOR}bananas`,
      expanded: false,
      sortOrder: 1,
      archived: false,
      defaultQuantity: '3',
      createdAt: date,
    },
  ];

  if (withCategories) {
    items.push({
      id: 'category-1',
      name: 'Produce',
      type: 'category' as const,
      path: 'produce',
      expanded: true,
      sortOrder: 2,
      archived: false,
      defaultQuantity: '',
      createdAt: date,
    });
  }

  return {
    $jazz: { id: 'template-1' },
    name: 'Test Template',
    items,
    sessions: [
      {
        id: 'session-1',
        archived: false,
        viewMode: 'flat' as const,
        itemStates: {
          'item-1': {
            selected: true,
            checked: false,
          },
          'item-2': {
            selected: true,
            checked: true,
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

describe('txtExporter', () => {
  describe('exportTemplateItemsToText', () => {
    it('should export items in flat format when no categories exist', () => {
      const template = createMockTemplate({ withCategories: false });

      const result = exportTemplateItemsToText(template as any);

      expect(result).toBe('Apples\nBananas');
    });

    it('should export items in hierarchical format when categories exist', () => {
      const template = createMockTemplate({ withCategories: true });
      // Update item paths to be hierarchical
      template.items[0].path = `produce${PATH_SEPARATOR}apples`;
      template.items[1].path = `produce${PATH_SEPARATOR}bananas`;
      template.items[2].path = 'produce';

      const result = exportTemplateItemsToText(template as any);

      // Should use indented format
      expect(result).toContain('Produce');
      expect(result).toContain('Apples');
      expect(result).toContain('Bananas');
    });

    it('should handle empty template', () => {
      const template = createMockTemplate();
      template.items = [];

      const result = exportTemplateItemsToText(template as any);

      expect(result).toBe('');
    });

    it('should exclude archived items', () => {
      const template = createMockTemplate();
      template.items[0].archived = true; // Archive Apples

      const result = exportTemplateItemsToText(template as any);

      expect(result).toBe('Bananas');
    });

    it('should sort items by sortOrder', () => {
      const template = createMockTemplate();
      template.items[0].sortOrder = 5;
      template.items[1].sortOrder = 1;

      const result = exportTemplateItemsToText(template as any);

      const lines = result.split('\n');
      expect(lines[0]).toBe('Bananas'); // sortOrder 1
      expect(lines[1]).toBe('Apples'); // sortOrder 5
    });

    it('should handle hierarchical structure with proper indentation', () => {
      const template = createMockTemplate({ withCategories: true });
      template.items = [
        {
          id: 'cat-1',
          name: 'Produce',
          type: 'category' as const,
          path: 'produce',
          expanded: true,
          sortOrder: 0,
          archived: false,
          defaultQuantity: '',
          createdAt: new Date(),
        },
        {
          id: 'item-1',
          name: 'Apples',
          type: 'item' as const,
          path: `produce${PATH_SEPARATOR}apples`,
          expanded: false,
          sortOrder: 1,
          archived: false,
          defaultQuantity: '5',
          createdAt: new Date(),
        },
        {
          id: 'cat-2',
          name: 'Dairy',
          type: 'category' as const,
          path: 'dairy',
          expanded: true,
          sortOrder: 2,
          archived: false,
          defaultQuantity: '',
          createdAt: new Date(),
        },
        {
          id: 'item-2',
          name: 'Milk',
          type: 'item' as const,
          path: `dairy${PATH_SEPARATOR}milk`,
          expanded: false,
          sortOrder: 3,
          archived: false,
          defaultQuantity: '1',
          createdAt: new Date(),
        },
      ];

      const result = exportTemplateItemsToText(template as any);

      expect(result).toContain('Produce\n  Apples');
      expect(result).toContain('Dairy\n  Milk');
    });
  });

  describe('exportSessionToText', () => {
    it('should export session with checkmarks', () => {
      const template = createMockTemplate();

      const result = exportSessionToText(template as any, 'session-1');

      expect(result).toBeTruthy();
      expect(result).toContain('  Apples'); // Not purchased (space)
      expect(result).toContain('✓ Bananas'); // Purchased (checkmark)
    });

    it('should return null for non-existent session', () => {
      const template = createMockTemplate();

      const result = exportSessionToText(template as any, 'non-existent-session');

      expect(result).toBeNull();
    });

    it('should handle items not in session', () => {
      const template = createMockTemplate();
      template.items.push({
        id: 'item-3',
        name: 'Oranges',
        type: 'item' as const,
        path: `produce${PATH_SEPARATOR}oranges`,
        expanded: false,
        sortOrder: 3,
        archived: false,
        defaultQuantity: '2',
        createdAt: new Date('2024-11-01T00:00:00.000Z'),
      });

      const result = exportSessionToText(template as any, 'session-1');

      expect(result).toContain('  Oranges'); // Not checked
    });

    it('should exclude archived items', () => {
      const template = createMockTemplate();
      template.items[0].archived = true; // Archive Apples

      const result = exportSessionToText(template as any, 'session-1');

      expect(result).not.toContain('Apples');
      expect(result).toContain('Bananas');
    });

    it('should return null if template has no sessions', () => {
      const template = createMockTemplate();
      template.sessions = [];

      const result = exportSessionToText(template as any, 'session-1');

      expect(result).toBeNull();
    });

    it('should sort items by sortOrder', () => {
      const template = createMockTemplate();
      template.items[0].sortOrder = 5;
      template.items[1].sortOrder = 1;

      const result = exportSessionToText(template as any, 'session-1');

      const lines = result?.split('\n');
      expect(lines[0]).toContain('Bananas'); // sortOrder 1
      expect(lines[1]).toContain('Apples'); // sortOrder 5
    });

    it('should include both categories and items', () => {
      const template = createMockTemplate({ withCategories: true });

      const result = exportSessionToText(template as any, 'session-1');

      expect(result).toContain('Produce');
      expect(result).toContain('Apples');
      expect(result).toContain('Bananas');
    });

    it('should handle empty itemStates', () => {
      const template = createMockTemplate();
      template.sessions[0].itemStates = {};

      const result = exportSessionToText(template as any, 'session-1');

      expect(result).toBeTruthy();
      // All items should have no checkmarks
      const lines = result?.split('\n');
      for (const line of lines) {
        expect(line.startsWith(' ')).toBe(true);
      }
    });
  });
});
