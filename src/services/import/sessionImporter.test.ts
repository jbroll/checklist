/**
 * Unit tests for session import functionality
 *
 * Tests session state import from CSV, item matching, and state parsing.
 */

import { describe, expect, it, vi } from 'vitest';
import { importSessionFromCsv } from './sessionImporter';

// Mock template for testing
const createMockTemplate = (items: any[] = [], sessions: any[] = []) => {
  const template = {
    items,
    sessions,
    updatedAt: new Date(),
    $jazz: {
      set: vi.fn((key: string, value: any) => {
        if (key === 'items') {
          template.items = value;
        } else if (key === 'sessions') {
          template.sessions = value;
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

describe('sessionImporter', () => {
  describe('importSessionFromCsv', () => {
    describe('template validation', () => {
      it('returns error when template has no items', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = { items: undefined, sessions: [], $jazz: { set: vi.fn() } };
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(false);
        expect(result.errors).toContain('Can only import sessions into templates with items');
      });

      it('returns error when template has no sessions array', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = { items: [], sessions: undefined, $jazz: { set: vi.fn() } };
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(false);
        expect(result.errors).toContain('Can only import sessions into templates with items');
      });
    });

    describe('CSV parsing', () => {
      it('returns error for empty CSV', () => {
        const csv = '';
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(false);
        expect(result.errors).toContain('No items found in CSV file');
      });

      it('returns error for CSV with only header', () => {
        const csv = `name,inCart,purchased`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(false);
        expect(result.errors).toContain('No items found in CSV file');
      });

      it('reports error for rows with missing name', () => {
        const csv = `name,inCart,purchased
,true,false
Apples,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.matched).toBe(1);
        expect(result.errors).toContain('Row 2: Missing item name');
      });
    });

    describe('item matching', () => {
      it('matches items by name (case-insensitive)', () => {
        const csv = `name,inCart,purchased
APPLES,true,false
bananas,true,true`;
        const template = createMockTemplate([
          { id: 'item-1', name: 'Apples', archived: false },
          { id: 'item-2', name: 'Bananas', archived: false },
        ]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.matched).toBe(2);
        expect(result.unmatched).toBe(0);
      });

      it('tracks unmatched items', () => {
        const csv = `name,inCart,purchased
Apples,true,false
Oranges,true,true`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.matched).toBe(1);
        expect(result.unmatched).toBe(1);
        expect(result.unmatchedItems).toContain('Oranges');
      });

      it('excludes archived items from matching', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: true }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(false);
        expect(result.matched).toBe(0);
        expect(result.unmatched).toBe(1);
        expect(result.unmatchedItems).toContain('Apples');
      });

      it('returns error when no items match', () => {
        const csv = `name,inCart,purchased
Oranges,true,false
Grapes,true,true`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(false);
        expect(result.errors).toContain('No items could be matched to template items');
      });
    });

    describe('state parsing', () => {
      it('parses boolean inCart and purchased fields', () => {
        const csv = `name,inCart,purchased
Apples,true,false
Bananas,false,true`;
        const template = createMockTemplate([
          { id: 'item-1', name: 'Apples', archived: false },
          { id: 'item-2', name: 'Bananas', archived: false },
        ]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selected).toBe(true);
        expect(session.itemStates['item-1'].checked).toBe(false);
        expect(session.itemStates['item-2'].selected).toBe(false);
        expect(session.itemStates['item-2'].checked).toBe(true);
      });

      it('handles case-insensitive boolean values', () => {
        const csv = `name,inCart,purchased
Apples,TRUE,FALSE
Bananas,True,True`;
        const template = createMockTemplate([
          { id: 'item-1', name: 'Apples', archived: false },
          { id: 'item-2', name: 'Bananas', archived: false },
        ]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selected).toBe(true);
        expect(session.itemStates['item-1'].checked).toBe(false);
        expect(session.itemStates['item-2'].selected).toBe(true);
        expect(session.itemStates['item-2'].checked).toBe(true);
      });

      it('treats missing boolean fields as false', () => {
        const csv = `name
Apples`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selected).toBe(false);
        expect(session.itemStates['item-1'].checked).toBe(false);
      });
    });

    describe('timestamp parsing', () => {
      it('parses valid ISO timestamps', () => {
        const csv = `name,inCart,purchased,addedToCartAt,purchasedAt
Apples,true,true,2024-01-15T10:30:00.000Z,2024-01-15T11:00:00.000Z`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selectedAt).toBeInstanceOf(Date);
        expect(session.itemStates['item-1'].checkedAt).toBeInstanceOf(Date);
        expect(session.itemStates['item-1'].selectedAt?.toISOString()).toBe(
          '2024-01-15T10:30:00.000Z',
        );
      });

      it('handles invalid timestamps gracefully', () => {
        const csv = `name,inCart,purchased,addedToCartAt,purchasedAt
Apples,true,true,not-a-date,also-invalid`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selectedAt).toBeUndefined();
        expect(session.itemStates['item-1'].checkedAt).toBeUndefined();
      });

      it('handles empty timestamp fields', () => {
        const csv = `name,inCart,purchased,addedToCartAt,purchasedAt
Apples,true,false,,`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selectedAt).toBeUndefined();
        expect(session.itemStates['item-1'].checkedAt).toBeUndefined();
      });
    });

    describe('session creation', () => {
      it('creates session with correct structure', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.sessionId).toBeDefined();

        const session = template.sessions[0];
        expect(session.id).toBeDefined();
        expect(session.archived).toBe(false);
        expect(session.viewMode).toBe('zone-in-hierarchy');
        expect(session.categoryExpanded).toEqual({});
        expect(session.itemStates).toBeDefined();
        expect(session.createdAt).toBeInstanceOf(Date);
        expect(session.lastActivityAt).toBeInstanceOf(Date);
      });

      it('calculates correct counts', () => {
        const csv = `name,inCart,purchased
Apples,true,false
Bananas,true,true
Milk,false,false`;
        const template = createMockTemplate([
          { id: 'item-1', name: 'Apples', archived: false },
          { id: 'item-2', name: 'Bananas', archived: false },
          { id: 'item-3', name: 'Milk', archived: false },
        ]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        const session = template.sessions[0];
        expect(session.selectedCount).toBe(2); // Apples and Bananas in cart
        expect(session.checkedCount).toBe(1); // Only Bananas purchased
        expect(session.remainingCount).toBe(2); // 3 matched - 1 purchased = 2
      });

      it('adds session to existing sessions array', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const existingSession = { id: 'existing', itemStates: {} };
        const template = createMockTemplate(
          [{ id: 'item-1', name: 'Apples', archived: false }],
          [existingSession],
        );
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(template.sessions).toHaveLength(2);
        expect(template.sessions[0]).toBe(existingSession);
      });

      it('returns sessionId in result', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.sessionId).toBeDefined();
        expect(result.sessionId).toBe(template.sessions[0].id);
      });
    });

    describe('template updates', () => {
      it('updates template updatedAt timestamp', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        importSessionFromCsv(csv, template as any, account as any);

        expect(template.$jazz.set).toHaveBeenCalledWith('updatedAt', expect.any(Date));
      });

      it('updates template sessions array', () => {
        const csv = `name,inCart,purchased
Apples,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        importSessionFromCsv(csv, template as any, account as any);

        expect(template.$jazz.set).toHaveBeenCalledWith('sessions', expect.any(Array));
      });
    });

    describe('edge cases', () => {
      it('handles items with special characters in names', () => {
        const csv = `name,inCart,purchased
"Apples, Red",true,false
"Milk (2%)""",true,true`;
        const template = createMockTemplate([
          { id: 'item-1', name: 'Apples, Red', archived: false },
          { id: 'item-2', name: 'Milk (2%)"', archived: false },
        ]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.matched).toBe(2);
      });

      it('handles duplicate item names in CSV (uses last occurrence)', () => {
        const csv = `name,inCart,purchased
Apples,true,false
Apples,false,true`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        // Second occurrence should overwrite first
        const session = template.sessions[0];
        expect(session.itemStates['item-1'].selected).toBe(false);
        expect(session.itemStates['item-1'].checked).toBe(true);
      });

      it('handles large number of items', () => {
        const items = Array.from({ length: 100 }, (_, i) => ({
          id: `item-${i}`,
          name: `Item ${i}`,
          archived: false,
        }));
        const csvRows = ['name,inCart,purchased'];
        for (let i = 0; i < 100; i++) {
          csvRows.push(`Item ${i},${i % 2 === 0},${i % 3 === 0}`);
        }
        const csv = csvRows.join('\n');

        const template = createMockTemplate(items);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.matched).toBe(100);
        expect(result.unmatched).toBe(0);
      });

      it('handles whitespace in item names', () => {
        const csv = `name,inCart,purchased
  Apples  ,true,false`;
        const template = createMockTemplate([{ id: 'item-1', name: 'Apples', archived: false }]);
        const account = createMockAccount();

        const result = importSessionFromCsv(csv, template as any, account as any);

        expect(result.imported).toBe(true);
        expect(result.matched).toBe(1);
      });
    });
  });
});
