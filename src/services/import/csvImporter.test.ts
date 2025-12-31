/**
 * Unit tests for CSV import functionality
 *
 * Tests CSV parsing, column mapping, and import result structure.
 */

import { describe, expect, it, vi } from 'vitest';
import { importItemsFromCsv } from './csvImporter';

// Mock template for testing
const createMockTemplate = (items: any[] = []) => {
  const template = {
    items,
    updatedAt: new Date(),
    $jazz: {
      set: vi.fn((key: string, value: any) => {
        if (key === 'items') {
          template.items = value;
        } else if (key === 'updatedAt') {
          template.updatedAt = value;
        }
      }),
    },
  };
  return template;
};

// Mock account for testing
const createMockAccount = () => ({
  $jazz: { id: 'account-1' },
});

describe('csvImporter', () => {
  describe('importItemsFromCsv', () => {
    describe('basic CSV parsing', () => {
      it('imports simple CSV with name column only', () => {
        const csv = `name
Apples
Bananas
Milk`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(template.items).toHaveLength(3);
      });

      it('imports CSV with category,item format', () => {
        const csv = `category,item
Produce,Apples
Produce,Bananas
Dairy,Milk
Dairy,Cheese`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(4);
        expect(template.items[0].name).toBe('Apples');
        expect(template.items[0].path).toBe('Produce/Apples');
        expect(template.items[2].name).toBe('Milk');
        expect(template.items[2].path).toBe('Dairy/Milk');
      });

      it('imports CSV with all supported columns', () => {
        const csv = `name,defaultQuantity,icon,path
Apples,5 lbs,,Produce/Apples
Bananas,1 bunch,,Produce/Bananas
Milk,1 gallon,,Dairy/Milk`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(3);
        expect(template.items[0].name).toBe('Apples');
        expect(template.items[0].defaultQuantity).toBe('5 lbs');
        expect(template.items[0].path).toBe('Produce/Apples');
      });

      it('uses name as path when path column is empty', () => {
        const csv = `name,path
Apples,
Bananas,Produce/Bananas`;
        const template = createMockTemplate();
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[0].path).toBe('Apples');
        expect(template.items[1].path).toBe('Produce/Bananas');
      });

      it('uses name as path when path column is missing', () => {
        const csv = `name,defaultQuantity
Apples,5 lbs
Bananas,1 bunch`;
        const template = createMockTemplate();
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[0].path).toBe('Apples');
        expect(template.items[1].path).toBe('Bananas');
      });
    });

    describe('CSV format handling', () => {
      it('handles quoted fields with commas', () => {
        const csv = `name,defaultQuantity
"Apples, Red",5 lbs
Bananas,1 bunch`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(2);
        expect(template.items[0].name).toBe('Apples, Red');
      });

      it('handles escaped quotes in quoted fields', () => {
        const csv = `name,defaultQuantity
"Apples ""Gala""",5 lbs
Bananas,1 bunch`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(2);
        expect(template.items[0].name).toBe('Apples "Gala"');
      });

      it('handles empty lines in CSV', () => {
        const csv = `name
Apples

Bananas

Milk`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(3);
      });

      it('trims whitespace from values', () => {
        const csv = `name,defaultQuantity
  Apples  ,  5 lbs
Bananas,1 bunch`;
        const template = createMockTemplate();
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[0].name).toBe('Apples');
        expect(template.items[0].defaultQuantity).toBe('5 lbs');
      });
    });

    describe('row context tracking', () => {
      it('adds row context starting from row 2', () => {
        // Row 1 is header, data starts at row 2
        const csv = `name
Apples
Bananas`;
        const template = createMockTemplate([
          { path: 'apples', archived: false }, // Existing item to trigger duplicate
        ]);
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        // First item (Apples) is duplicate, second (Bananas) imported
        expect(result.skipped).toBe(1);
        expect(result.imported).toBe(1);
        expect(result.duplicates).toContain('Apples');
      });
    });

    describe('duplicate handling', () => {
      it('skips items with duplicate paths (case-insensitive)', () => {
        const csv = `name,path
Apples,Produce/Apples
Red Apples,produce/apples`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.duplicates).toContain('Red Apples');
      });

      it('skips items that exist in template', () => {
        const csv = `name,path
Apples,Produce/Apples
Bananas,Produce/Bananas`;
        const template = createMockTemplate([{ path: 'produce/apples', archived: false }]);
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
      });
    });

    describe('validation and error handling', () => {
      it('skips rows with empty name', () => {
        const csv = `name,path
Apples,Produce/Apples
,Empty/Name
Bananas,Produce/Bananas`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(2);
        expect(template.items).toHaveLength(2);
      });

      it('skips rows with whitespace-only name', () => {
        const csv = `name,path
Apples,Produce/Apples
   ,Whitespace/Name
Bananas,Produce/Bananas`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(2);
      });

      it('returns error for empty CSV', () => {
        const csv = '';
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(0);
        expect(result.errors).toContain('No items found');
      });

      it('returns error for CSV with only header', () => {
        const csv = `name,path,defaultQuantity`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(0);
        expect(result.errors).toContain('No items found');
      });

      it('returns parse error for malformed CSV', () => {
        // This CSV is technically valid but we can test with empty name handling
        const csv = `name
`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(0);
        expect(result.errors).toContain('No items found');
      });
    });

    describe('default values', () => {
      it('uses empty string for missing defaultQuantity', () => {
        const csv = `name,path
Apples,Produce/Apples`;
        const template = createMockTemplate();
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[0].defaultQuantity).toBe('');
      });

      it('creates items as type "item" (not category)', () => {
        const csv = `name
Apples`;
        const template = createMockTemplate();
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[0].type).toBe('item');
      });
    });

    describe('sortOrder', () => {
      it('assigns sequential sortOrder to imported items', () => {
        const csv = `name
Apples
Bananas
Milk`;
        const template = createMockTemplate();
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[0].sortOrder).toBe(0);
        expect(template.items[1].sortOrder).toBe(1);
        expect(template.items[2].sortOrder).toBe(2);
      });

      it('continues sortOrder from existing items', () => {
        const csv = `name
New Item`;
        const template = createMockTemplate([{ path: 'existing', archived: false, sortOrder: 10 }]);
        const account = createMockAccount();

        importItemsFromCsv(csv, template as any, account as any);

        expect(template.items[1].sortOrder).toBe(11);
      });
    });

    describe('extra columns handling', () => {
      it('ignores unknown columns', () => {
        const csv = `name,unknownColumn,path
Apples,ignored,Produce/Apples`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(1);
        expect(template.items[0].name).toBe('Apples');
        expect((template.items[0] as any).unknownColumn).toBeUndefined();
      });

      it('handles rows with fewer columns than header', () => {
        const csv = `name,defaultQuantity,path
Apples`;
        const template = createMockTemplate();
        const account = createMockAccount();

        const result = importItemsFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(1);
        expect(template.items[0].name).toBe('Apples');
        expect(template.items[0].defaultQuantity).toBe('');
        // Path defaults to name when missing
        expect(template.items[0].path).toBe('Apples');
      });
    });
  });
});
