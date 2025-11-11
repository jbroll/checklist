import { describe, expect, it } from 'vitest';
import { isIndentedFormat, parseIndentedList } from './indentedListParser';
import { PATH_SEPARATOR } from './pathUtils';

describe('indentedListParser', () => {
  describe('isIndentedFormat', () => {
    it('detects flat format (no indentation)', () => {
      const text = `
Item1
Item2
Item3
      `.trim();

      expect(isIndentedFormat(text)).toBe(false);
    });

    it('detects indented format with spaces', () => {
      const text = `
Category1
  Item1
  Item2
      `.trim();

      expect(isIndentedFormat(text)).toBe(true);
    });

    it('detects indented format with tabs', () => {
      const text = `
Category1
\tItem1
\tItem2
      `.trim();

      expect(isIndentedFormat(text)).toBe(true);
    });

    it('ignores blank lines and comments when detecting', () => {
      const text = `
# Comment
Item1

Item2
      `.trim();

      expect(isIndentedFormat(text)).toBe(false);
    });

    it('detects indentation even with comments', () => {
      const text = `
# Comment
Category1
  Item1
      `.trim();

      expect(isIndentedFormat(text)).toBe(true);
    });
  });

  describe('parseIndentedList', () => {
    it('parses simple two-level hierarchy with 2 spaces', () => {
      const text = `
Category1
  Item1
  Item2
Category2
  Item3
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(5);
      expect(result[0]).toMatchObject({
        name: 'Category1',
        type: 'category',
        path: 'Category1',
        level: 0,
      });
      expect(result[1]).toMatchObject({
        name: 'Item1',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}Item1`,
        level: 1,
      });
      expect(result[2]).toMatchObject({
        name: 'Item2',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}Item2`,
        level: 1,
      });
      expect(result[3]).toMatchObject({
        name: 'Category2',
        type: 'category',
        path: 'Category2',
        level: 0,
      });
      expect(result[4]).toMatchObject({
        name: 'Item3',
        type: 'item',
        path: `Category2${PATH_SEPARATOR}Item3`,
        level: 1,
      });
    });

    it('parses three-level hierarchy', () => {
      const text = `
Category1
  SubCategory1
    Item1
    Item2
  SubCategory2
    Item3
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(6);
      expect(result[0]).toMatchObject({
        name: 'Category1',
        type: 'category',
        path: 'Category1',
      });
      expect(result[1]).toMatchObject({
        name: 'SubCategory1',
        type: 'category',
        path: `Category1${PATH_SEPARATOR}SubCategory1`,
      });
      expect(result[2]).toMatchObject({
        name: 'Item1',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}SubCategory1${PATH_SEPARATOR}Item1`,
      });
      expect(result[3]).toMatchObject({
        name: 'Item2',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}SubCategory1${PATH_SEPARATOR}Item2`,
      });
      expect(result[4]).toMatchObject({
        name: 'SubCategory2',
        type: 'category',
        path: `Category1${PATH_SEPARATOR}SubCategory2`,
      });
      expect(result[5]).toMatchObject({
        name: 'Item3',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}SubCategory2${PATH_SEPARATOR}Item3`,
      });
    });

    it('parses with tabs', () => {
      const text = `Category1
\tItem1
\tItem2`;

      const result = parseIndentedList(text);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        name: 'Category1',
        type: 'category',
      });
      expect(result[1]).toMatchObject({
        name: 'Item1',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}Item1`,
      });
      expect(result[2]).toMatchObject({
        name: 'Item2',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}Item2`,
      });
    });

    it('parses with 4 spaces', () => {
      const text = `
Category1
    Item1
    Item2
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        name: 'Category1',
        type: 'category',
      });
      expect(result[1]).toMatchObject({
        name: 'Item1',
        type: 'item',
      });
      expect(result[2]).toMatchObject({
        name: 'Item2',
        type: 'item',
      });
    });

    it('ignores blank lines', () => {
      const text = `
Category1
  Item1

  Item2
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.name)).toEqual(['Category1', 'Item1', 'Item2']);
    });

    it('ignores comment lines', () => {
      const text = `
# My Grocery List
Category1
  # These are fruits
  Item1
  Item2
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.name)).toEqual(['Category1', 'Item1', 'Item2']);
    });

    it('handles mixed tabs and spaces (normalized)', () => {
      const text = `Category1
\tItem1
  Item2`;

      const result = parseIndentedList(text);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('category');
      expect(result[1].type).toBe('item');
      expect(result[2].type).toBe('item');
    });

    it('returns empty array for empty input', () => {
      expect(parseIndentedList('')).toEqual([]);
      expect(parseIndentedList('   ')).toEqual([]);
      expect(parseIndentedList('\n\n')).toEqual([]);
    });

    it('returns empty array for only comments', () => {
      const text = `
# Comment 1
# Comment 2
      `.trim();

      expect(parseIndentedList(text)).toEqual([]);
    });

    it('handles root-level items (leaf nodes at root)', () => {
      const text = `
Category1
  Item1
Item2
Item3
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        name: 'Category1',
        type: 'category',
        path: 'Category1',
      });
      expect(result[1]).toMatchObject({
        name: 'Item1',
        type: 'item',
        path: `Category1${PATH_SEPARATOR}Item1`,
      });
      expect(result[2]).toMatchObject({
        name: 'Item2',
        type: 'item',
        path: 'Item2',
      });
      expect(result[3]).toMatchObject({
        name: 'Item3',
        type: 'item',
        path: 'Item3',
      });
    });

    it('handles your example format', () => {
      const text = `
Category1
Category2
  SubCat1-1
    Item1
    Item2

Category3
   Item3-1
   Item3-2
      `.trim();

      const result = parseIndentedList(text);

      expect(result.map((r) => r.name)).toEqual([
        'Category1',
        'Category2',
        'SubCat1-1',
        'Item1',
        'Item2',
        'Category3',
        'Item3-1',
        'Item3-2',
      ]);

      expect(result[0]).toMatchObject({
        name: 'Category1',
        type: 'item', // No children, so it's an item
      });
      expect(result[1]).toMatchObject({
        name: 'Category2',
        type: 'category', // Has children
      });
      expect(result[2]).toMatchObject({
        name: 'SubCat1-1',
        type: 'category', // Has children
      });
      expect(result[3]).toMatchObject({
        name: 'Item1',
        type: 'item',
      });
    });
  });
});
