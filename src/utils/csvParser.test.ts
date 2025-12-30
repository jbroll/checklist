/**
 * Unit tests for CSV parser utility
 *
 * Tests CSV parsing with quoted fields, escaped quotes, and various edge cases.
 */

import { describe, expect, it } from 'vitest';
import { parseCsv, parseTextList } from './csvParser';

describe('csvParser', () => {
  describe('parseCsv', () => {
    describe('basic parsing', () => {
      it('parses simple CSV with header', () => {
        const csv = `name,value
foo,1
bar,2`;
        const result = parseCsv(csv);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'foo', value: '1' });
        expect(result[1]).toEqual({ name: 'bar', value: '2' });
      });

      it('returns empty array for empty string', () => {
        expect(parseCsv('')).toEqual([]);
      });

      it('returns empty array for whitespace-only string', () => {
        expect(parseCsv('   \n   ')).toEqual([]);
      });

      it('returns empty array for header-only CSV', () => {
        const csv = 'name,value';
        expect(parseCsv(csv)).toEqual([]);
      });

      it('handles single column', () => {
        const csv = `name
foo
bar`;
        const result = parseCsv(csv);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'foo' });
        expect(result[1]).toEqual({ name: 'bar' });
      });

      it('handles many columns', () => {
        const csv = `a,b,c,d,e
1,2,3,4,5`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ a: '1', b: '2', c: '3', d: '4', e: '5' });
      });
    });

    describe('whitespace handling', () => {
      it('trims whitespace from values', () => {
        const csv = `name,value
  foo  ,  bar  `;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'foo', value: 'bar' });
      });

      it('trims entire lines', () => {
        const csv = `  name,value
  foo,bar  `;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'foo', value: 'bar' });
      });

      it('skips empty lines', () => {
        const csv = `name,value

foo,1

bar,2

`;
        const result = parseCsv(csv);

        expect(result).toHaveLength(2);
      });
    });

    describe('quoted fields', () => {
      it('handles simple quoted fields', () => {
        const csv = `name,value
"foo","bar"`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'foo', value: 'bar' });
      });

      it('handles fields with commas inside quotes', () => {
        const csv = `name,value
"foo, bar",baz`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'foo, bar', value: 'baz' });
      });

      it('handles fields with multiple commas', () => {
        const csv = `name,value
"a, b, c",d`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'a, b, c', value: 'd' });
      });

      it('handles escaped quotes (double quotes)', () => {
        const csv = `name,value
"say ""hello""",bar`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'say "hello"', value: 'bar' });
      });

      it('handles consecutive escaped quotes', () => {
        const csv = `name,value
"""""",bar`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: '""', value: 'bar' });
      });

      it('handles mixed quoted and unquoted fields', () => {
        const csv = `name,value,extra
"foo, bar",plain,"quoted"`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({
          name: 'foo, bar',
          value: 'plain',
          extra: 'quoted',
        });
      });
    });

    describe('row column count variations', () => {
      it('handles rows with fewer columns than header', () => {
        const csv = `name,value,extra
foo`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'foo', value: '', extra: '' });
      });

      it('handles rows with more columns than header (ignores extra)', () => {
        const csv = `name,value
foo,bar,extra,ignored`;
        const result = parseCsv(csv);

        // Extra columns are simply not mapped to any header key
        expect(result[0]).toEqual({ name: 'foo', value: 'bar' });
      });
    });

    describe('header normalization', () => {
      it('uses header values as keys', () => {
        const csv = `First Name,Last Name
John,Doe`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ 'First Name': 'John', 'Last Name': 'Doe' });
      });

      it('trims header values', () => {
        const csv = `  name  ,  value
foo,bar`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: 'foo', value: 'bar' });
      });
    });

    describe('edge cases', () => {
      it('handles Windows line endings (CRLF)', () => {
        const csv = 'name,value\r\nfoo,bar\r\nbaz,qux';
        const result = parseCsv(csv);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'foo', value: 'bar' });
      });

      it('handles field starting with quote but not ending', () => {
        // This is technically malformed but we handle it gracefully
        const csv = `name,value
"foo,bar`;
        const result = parseCsv(csv);

        // Quote state stays open, comma becomes part of value
        expect(result[0].name).toBe('foo,bar');
      });

      it('handles empty quoted field', () => {
        const csv = `name,value
"",bar`;
        const result = parseCsv(csv);

        expect(result[0]).toEqual({ name: '', value: 'bar' });
      });

      it('handles empty header field', () => {
        const csv = `name,,value
foo,bar,baz`;
        const result = parseCsv(csv);

        expect(result[0].name).toBe('foo');
        expect(result[0].value).toBe('baz');
        // Empty header means that column is ignored
      });

      it('handles very long values', () => {
        const longValue = 'x'.repeat(10000);
        const csv = `name,value
foo,${longValue}`;
        const result = parseCsv(csv);

        expect(result[0].value).toHaveLength(10000);
      });
    });

    describe('real-world CSV examples', () => {
      it('parses typical item export format', () => {
        const csv = `name,defaultQuantity,path
"Milk, 2%",1 gallon,Dairy/Milk
Bread,,Bakery/Bread
"Eggs (dozen)",1 dozen,Dairy/Eggs`;
        const result = parseCsv(csv);

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
          name: 'Milk, 2%',
          defaultQuantity: '1 gallon',
          path: 'Dairy/Milk',
        });
        expect(result[1]).toEqual({
          name: 'Bread',
          defaultQuantity: '',
          path: 'Bakery/Bread',
        });
        expect(result[2]).toEqual({
          name: 'Eggs (dozen)',
          defaultQuantity: '1 dozen',
          path: 'Dairy/Eggs',
        });
      });

      it('parses session export format', () => {
        const csv = `name,category,inCart,purchased,addedToCartAt,purchasedAt
Milk,Dairy,true,false,2024-01-15T10:00:00.000Z,
Bread,Bakery,true,true,2024-01-15T10:05:00.000Z,2024-01-15T10:30:00.000Z`;
        const result = parseCsv(csv);

        expect(result).toHaveLength(2);
        expect(result[0].inCart).toBe('true');
        expect(result[0].purchased).toBe('false');
        expect(result[1].purchasedAt).toBe('2024-01-15T10:30:00.000Z');
      });
    });
  });

  describe('parseTextList', () => {
    it('splits on newlines', () => {
      const text = `foo
bar
baz`;
      const result = parseTextList(text);

      expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    it('trims whitespace from each line', () => {
      const text = `  foo
  bar
  baz  `;
      const result = parseTextList(text);

      expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    it('filters empty lines', () => {
      const text = `foo

bar

baz`;
      const result = parseTextList(text);

      expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    it('returns empty array for empty string', () => {
      expect(parseTextList('')).toEqual([]);
    });

    it('returns empty array for whitespace-only', () => {
      expect(parseTextList('   \n   \n   ')).toEqual([]);
    });

    it('handles Windows line endings', () => {
      const text = 'foo\r\nbar\r\nbaz';
      const result = parseTextList(text);

      expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    it('handles single item', () => {
      expect(parseTextList('foo')).toEqual(['foo']);
    });
  });
});
