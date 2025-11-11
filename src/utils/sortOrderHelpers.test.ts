/**
 * Unit tests for sortOrder helper functions
 */

import { describe, expect, it } from 'vitest';
import {
  calculateMidpointSortOrder,
  needsRenumbering,
  renumberSortOrders,
} from './sortOrderHelpers';

describe('sortOrderHelpers', () => {
  describe('calculateMidpointSortOrder', () => {
    it('should calculate midpoint between two numbers', () => {
      const result = calculateMidpointSortOrder(1.0, 3.0);
      expect(result).toBe(2.0);
    });

    it('should handle fractional values', () => {
      const result = calculateMidpointSortOrder(1.0, 1.5);
      expect(result).toBe(1.25);
    });

    it('should calculate value before first item when before is undefined', () => {
      const result = calculateMidpointSortOrder(undefined, 5.0);
      expect(result).toBe(2.5);
    });

    it('should calculate value after last item when after is undefined', () => {
      const result = calculateMidpointSortOrder(10.0, undefined);
      expect(result).toBe(11.0);
    });

    it('should return 1.0 when both are undefined', () => {
      const result = calculateMidpointSortOrder(undefined, undefined);
      expect(result).toBe(1.0);
    });

    it('should handle very small differences', () => {
      const result = calculateMidpointSortOrder(1.0, 1.0001);
      expect(result).toBeCloseTo(1.00005, 4); // Use toBeCloseTo for floating point
    });

    it('should handle large numbers', () => {
      const result = calculateMidpointSortOrder(1000.0, 2000.0);
      expect(result).toBe(1500.0);
    });

    it('should handle multiple levels of fractional division', () => {
      // Simulate multiple inserts between 1.0 and 2.0
      const first = calculateMidpointSortOrder(1.0, 2.0); // 1.5
      const second = calculateMidpointSortOrder(1.0, first); // 1.25
      const third = calculateMidpointSortOrder(1.0, second); // 1.125

      expect(first).toBe(1.5);
      expect(second).toBe(1.25);
      expect(third).toBe(1.125);
    });
  });

  describe('needsRenumbering', () => {
    it('should return false for whole numbers', () => {
      expect(needsRenumbering(1.0)).toBe(false);
      expect(needsRenumbering(42.0)).toBe(false);
    });

    it('should return false for reasonable fractional values', () => {
      expect(needsRenumbering(1.5)).toBe(false);
      expect(needsRenumbering(2.25)).toBe(false);
      expect(needsRenumbering(3.125)).toBe(false);
    });

    it('should return true for very small fractional values', () => {
      expect(needsRenumbering(1.00001)).toBe(true);
      expect(needsRenumbering(2.000001)).toBe(true);
    });

    it('should handle edge cases near the threshold', () => {
      expect(needsRenumbering(1.001)).toBe(false); // Above threshold
      expect(needsRenumbering(1.00005)).toBe(true); // Below threshold
    });
  });

  describe('renumberSortOrders', () => {
    it('should renumber items with sequential values', () => {
      const items = [
        { id: '1', sortOrder: 1.5 },
        { id: '2', sortOrder: 1.75 },
        { id: '3', sortOrder: 2.125 },
      ];

      const result = renumberSortOrders(items);

      expect(result[0].sortOrder).toBe(1.0);
      expect(result[1].sortOrder).toBe(2.0);
      expect(result[2].sortOrder).toBe(3.0);
    });

    it('should preserve item order', () => {
      const items = [
        { id: 'a', sortOrder: 5.5 },
        { id: 'b', sortOrder: 10.2 },
        { id: 'c', sortOrder: 15.7 },
      ];

      const result = renumberSortOrders(items);

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');
    });

    it('should handle empty array', () => {
      const result = renumberSortOrders([]);
      expect(result).toEqual([]);
    });

    it('should handle single item', () => {
      const items = [{ id: '1', sortOrder: 99.9 }];
      const result = renumberSortOrders(items);

      expect(result[0].sortOrder).toBe(1.0);
    });

    it('should not mutate original items', () => {
      const items = [
        { id: '1', sortOrder: 1.5 },
        { id: '2', sortOrder: 2.5 },
      ];

      const original = items[0].sortOrder;
      renumberSortOrders(items);

      expect(items[0].sortOrder).toBe(original);
    });
  });
});
