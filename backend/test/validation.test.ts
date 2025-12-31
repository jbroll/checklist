/**
 * Backend Validation Tests
 *
 * Tests for input validation functions.
 */

import { describe, it, expect } from 'vitest';
import { isValidCoValueId } from '../src/lib/validation.js';

describe('isValidCoValueId', () => {
  describe('valid IDs', () => {
    it('should accept valid Jazz CoValue ID format', () => {
      expect(isValidCoValueId('co_zABC123')).toBe(true);
      expect(isValidCoValueId('co_z1234567890abcdef')).toBe(true);
      expect(isValidCoValueId('co_zXYZ')).toBe(true);
    });

    it('should accept IDs with mixed case', () => {
      expect(isValidCoValueId('co_zAbCdEf123')).toBe(true);
      expect(isValidCoValueId('co_zTEST')).toBe(true);
    });
  });

  describe('invalid IDs', () => {
    it('should reject IDs without co_z prefix', () => {
      expect(isValidCoValueId('ABC123')).toBe(false);
      expect(isValidCoValueId('co_ABC123')).toBe(false);
      expect(isValidCoValueId('co123')).toBe(false);
    });

    it('should reject empty or very short IDs', () => {
      expect(isValidCoValueId('')).toBe(false);
      expect(isValidCoValueId('co')).toBe(false);
      expect(isValidCoValueId('co_')).toBe(false);
      expect(isValidCoValueId('co_z')).toBe(false);
    });

    it('should reject IDs with special characters', () => {
      expect(isValidCoValueId('co_z123-456')).toBe(false);
      expect(isValidCoValueId('co_z123_456')).toBe(false);
      expect(isValidCoValueId('co_z123.456')).toBe(false);
      expect(isValidCoValueId('co_z123@456')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidCoValueId(null as any)).toBe(false);
      expect(isValidCoValueId(undefined as any)).toBe(false);
      expect(isValidCoValueId(123 as any)).toBe(false);
      expect(isValidCoValueId({} as any)).toBe(false);
    });

    it('should reject IDs that are too long', () => {
      const longId = 'co_z' + 'a'.repeat(100);
      expect(isValidCoValueId(longId)).toBe(false);
    });
  });
});
