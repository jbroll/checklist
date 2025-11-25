/**
 * Unit tests for TXT import functionality
 *
 * Tests metadata parsing and import result structure.
 */

import { describe, expect, it } from 'vitest';
import { PATH_SEPARATOR } from '../../utils/pathUtils';
import { importItemsFromText, parseTextMetadata } from './txtImporter';

// Mock template for testing (minimal structure)
const createMockTemplate = () => ({
  items: [] as any[],
  $jazz: {
    set: (_key: string, _value: any) => {},
  },
});

// Mock account for testing
const createMockAccount = () => ({
  $jazz: { id: 'account-1' },
});

describe('txtImporter', () => {
  describe('parseTextMetadata', () => {
    it('extracts name from metadata comment', () => {
      const text = `
# name: My Grocery List
# description: Weekly shopping

Produce
  Apples
  Bananas
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('My Grocery List');
      expect(metadata.description).toBe('Weekly shopping');
    });

    it('returns empty metadata for plain comments', () => {
      const text = `
# Just a comment
Item1
Item2
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBeUndefined();
      expect(Object.keys(metadata)).toHaveLength(0);
    });

    it('handles flat list with metadata', () => {
      const text = `
# name: Simple List

Item1
Item2
Item3
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('Simple List');
    });

    it('normalizes keys to lowercase', () => {
      const text = `
# NAME: Test List
# Description: Test

Item1
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('Test List');
      expect(metadata.description).toBe('Test');
    });

    it('handles colons in values', () => {
      const text = `
# name: List: With Colon
# time: 10:30

Item1
      `.trim();

      const metadata = parseTextMetadata(text);

      expect(metadata.name).toBe('List: With Colon');
      expect(metadata.time).toBe('10:30');
    });
  });

  describe('importItemsFromText', () => {
    it('returns metadata with import result for indented format', () => {
      const text = `
# name: Test Groceries
# description: A test list

Produce
  Apples
  Bananas
      `.trim();

      const template = createMockTemplate();
      const account = createMockAccount();

      const result = importItemsFromText(text, template as any, account as any);

      expect(result.metadata.name).toBe('Test Groceries');
      expect(result.metadata.description).toBe('A test list');
      expect(result.imported).toBe(3); // Produce, Apples, Bananas
    });

    it('returns metadata with import result for flat format', () => {
      // Note: flat format doesn't filter comments, so they get imported as items
      // The metadata is still extracted, but the # lines become items too
      const text = `
# name: Flat List

Item1
Item2
Item3
      `.trim();

      const template = createMockTemplate();
      const account = createMockAccount();

      const result = importItemsFromText(text, template as any, account as any);

      expect(result.metadata.name).toBe('Flat List');
      // Flat format includes the comment line as an item (4 total)
      expect(result.imported).toBe(4);
    });

    it('returns empty metadata when no metadata comments', () => {
      const text = `
Item1
Item2
      `.trim();

      const template = createMockTemplate();
      const account = createMockAccount();

      const result = importItemsFromText(text, template as any, account as any);

      expect(result.metadata).toEqual({});
      expect(result.imported).toBe(2);
    });

    it('skips duplicate items in indented format', () => {
      const text = `
# name: Duplicate Test

Category
  Item1
  Item2
      `.trim();

      // Template with existing items - use proper path format with PATH_SEPARATOR
      const template = createMockTemplate();
      template.items = [{ path: `Category${PATH_SEPARATOR}Item1`, archived: false }];

      const account = createMockAccount();

      const result = importItemsFromText(text, template as any, account as any);

      expect(result.imported).toBe(2); // Category and Item2
      expect(result.skipped).toBe(1); // Item1 was duplicate
      expect(result.duplicates).toContain('Item1');
    });

    it('handles hierarchical items correctly', () => {
      const text = `
# name: Hierarchical Test

Category1
  Item1
  Item2
Category2
  SubCategory
    Item3
      `.trim();

      const template = createMockTemplate();
      const account = createMockAccount();

      const result = importItemsFromText(text, template as any, account as any);

      expect(result.imported).toBe(6);
      expect(result.metadata.name).toBe('Hierarchical Test');
    });
  });
});
