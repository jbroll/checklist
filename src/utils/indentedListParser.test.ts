import { describe, expect, it } from 'vitest';
import {
  isIndentedFormat,
  parseIndentedList,
  parseIndentedListWithMetadata,
} from './indentedListParser';
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

    it('parses with single space indents', () => {
      const text = `
Category1
 Item1
 Item2
Category2
 SubCategory
  Item3
  Item4
      `.trim();

      const result = parseIndentedList(text);

      expect(result).toHaveLength(7);
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
        name: 'SubCategory',
        type: 'category',
        path: `Category2${PATH_SEPARATOR}SubCategory`,
        level: 1,
      });
      expect(result[5]).toMatchObject({
        name: 'Item3',
        type: 'item',
        path: `Category2${PATH_SEPARATOR}SubCategory${PATH_SEPARATOR}Item3`,
        level: 2,
      });
      expect(result[6]).toMatchObject({
        name: 'Item4',
        type: 'item',
        path: `Category2${PATH_SEPARATOR}SubCategory${PATH_SEPARATOR}Item4`,
        level: 2,
      });
    });

    it('parses with 3 spaces', () => {
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
        level: 0,
      });
      expect(result[1]).toMatchObject({
        name: 'Item1',
        type: 'item',
        level: 1,
      });
      expect(result[2]).toMatchObject({
        name: 'Item2',
        type: 'item',
        level: 1,
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

    it('handles actual items.txt from user', () => {
      const text = `
Item 0
Cat 2
 Item 1
 Item 2
Item 3
Cat 4
  Item 4
  Cat 6
   Item 5
   Item 6
      `.trim();

      const result = parseIndentedList(text);

      // Debug: log all items
      result.forEach((item, i) => {
        console.log(`[${i}] name="${item.name}" type=${item.type} level=${item.level}`);
      });

      // Item 0 should be type='item' (no children)
      const item0 = result.find((r) => r.name === 'Item 0');
      console.log('Item 0 found:', item0);
      expect(item0).toBeDefined();
      expect(item0?.type).toBe('item');

      // Item 3 should be type='item' (no children)
      const item3 = result.find((r) => r.name === 'Item 3');
      expect(item3).toBeDefined();
      expect(item3?.type).toBe('item');

      // Item 4 should be type='item' (no children, even though indented)
      const item4 = result.find((r) => r.name === 'Item 4');
      expect(item4).toBeDefined();
      expect(item4?.type).toBe('item');
    });
  });

  describe('parseIndentedListWithMetadata', () => {
    it('extracts name metadata from comments', () => {
      const text = `
# name: My Grocery List
# description: Weekly shopping

Produce
  Apples
  Bananas
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata.name).toBe('My Grocery List');
      expect(result.metadata.description).toBe('Weekly shopping');
      expect(result.items).toHaveLength(3);
    });

    it('handles metadata with extra spaces', () => {
      const text = `
#  name:   Spaced Out Name
# description:  Some description

Item1
Item2
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata.name).toBe('Spaced Out Name');
      expect(result.metadata.description).toBe('Some description');
    });

    it('returns empty metadata when no key:value comments', () => {
      const text = `
# Just a regular comment
# Another comment

Item1
Item2
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata).toEqual({});
      expect(result.items).toHaveLength(2);
    });

    it('extracts arbitrary metadata keys', () => {
      const text = `
# name: Test List
# author: John Doe
# version: 1.0

Item1
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata.name).toBe('Test List');
      expect(result.metadata.author).toBe('John Doe');
      expect(result.metadata.version).toBe('1.0');
    });

    it('handles colons in values', () => {
      const text = `
# name: List: With Colon
# time: 10:30 AM

Item1
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata.name).toBe('List: With Colon');
      expect(result.metadata.time).toBe('10:30 AM');
    });

    it('ignores comments without colons', () => {
      const text = `
# name: Valid Name
# This is just a comment
# Another comment without colon

Item1
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata.name).toBe('Valid Name');
      expect(Object.keys(result.metadata)).toHaveLength(1);
    });

    it('normalizes keys to lowercase', () => {
      const text = `
# NAME: Test
# Description: Test desc

Item1
      `.trim();

      const result = parseIndentedListWithMetadata(text);

      expect(result.metadata.name).toBe('Test');
      expect(result.metadata.description).toBe('Test desc');
    });
  });
});
