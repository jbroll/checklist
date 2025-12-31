/**
 * Security Tests
 *
 * Tests for security-related utilities and validation functions.
 */

import { describe, expect, it } from 'vitest';

// Token validation constants (should match AuthGate.tsx)
const TOKEN_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 128;

/**
 * Validates an invite token format to prevent open redirect attacks.
 */
function isValidToken(token: string): boolean {
  if (!token) return false;
  if (token.length > MAX_TOKEN_LENGTH) return false;
  return TOKEN_REGEX.test(token);
}

// Email validation (should match ShareDialog.tsx)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

function isValidEmail(email: string): boolean {
  if (!email) return false;
  if (email.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_REGEX.test(email);
}

describe('Token Validation', () => {
  describe('valid tokens', () => {
    it('should accept alphanumeric tokens', () => {
      expect(isValidToken('abc123')).toBe(true);
    });

    it('should accept tokens with underscores', () => {
      expect(isValidToken('abc_123')).toBe(true);
    });

    it('should accept tokens with hyphens', () => {
      expect(isValidToken('abc-123')).toBe(true);
    });

    it('should accept hex tokens (typical invite format)', () => {
      expect(isValidToken('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true);
    });

    it('should accept base64url tokens', () => {
      expect(isValidToken('abcABC123_-')).toBe(true);
    });

    it('should accept tokens at max length', () => {
      const maxToken = 'a'.repeat(MAX_TOKEN_LENGTH);
      expect(isValidToken(maxToken)).toBe(true);
    });
  });

  describe('invalid tokens', () => {
    it('should reject empty tokens', () => {
      expect(isValidToken('')).toBe(false);
    });

    it('should reject tokens with spaces', () => {
      expect(isValidToken('abc 123')).toBe(false);
    });

    it('should reject tokens with special characters', () => {
      expect(isValidToken('abc!123')).toBe(false);
      expect(isValidToken('abc@123')).toBe(false);
      expect(isValidToken('abc#123')).toBe(false);
      expect(isValidToken('abc$123')).toBe(false);
      expect(isValidToken('abc%123')).toBe(false);
    });

    it('should reject tokens with slashes (path injection)', () => {
      expect(isValidToken('abc/123')).toBe(false);
      expect(isValidToken('../../../etc/passwd')).toBe(false);
    });

    it('should reject tokens with URL characters', () => {
      expect(isValidToken('abc?foo=bar')).toBe(false);
      expect(isValidToken('abc&bar=baz')).toBe(false);
    });

    it('should reject tokens exceeding max length', () => {
      const tooLongToken = 'a'.repeat(MAX_TOKEN_LENGTH + 1);
      expect(isValidToken(tooLongToken)).toBe(false);
    });

    it('should reject potential XSS payloads', () => {
      expect(isValidToken('<script>alert(1)</script>')).toBe(false);
      expect(isValidToken('javascript:alert(1)')).toBe(false);
    });

    it('should reject tokens with newlines', () => {
      expect(isValidToken('abc\n123')).toBe(false);
      expect(isValidToken('abc\r123')).toBe(false);
    });
  });
});

describe('Email Validation', () => {
  describe('valid emails', () => {
    it('should accept standard email format', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('should accept email with subdomain', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true);
    });

    it('should accept email with dots in local part', () => {
      expect(isValidEmail('first.last@example.com')).toBe(true);
    });

    it('should accept email with plus sign', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should accept email with numbers', () => {
      expect(isValidEmail('user123@example456.com')).toBe(true);
    });

    it('should accept email with hyphens in domain', () => {
      expect(isValidEmail('user@my-company.com')).toBe(true);
    });

    it('should accept email with underscore in local part', () => {
      expect(isValidEmail('user_name@example.com')).toBe(true);
    });

    it('should accept various TLDs', () => {
      expect(isValidEmail('user@example.co.uk')).toBe(true);
      expect(isValidEmail('user@example.io')).toBe(true);
      expect(isValidEmail('user@example.museum')).toBe(true);
    });
  });

  describe('invalid emails', () => {
    it('should reject empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('should reject email without @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });

    it('should reject email without domain', () => {
      expect(isValidEmail('user@')).toBe(false);
    });

    it('should reject email without local part', () => {
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('should reject email without TLD', () => {
      expect(isValidEmail('user@example')).toBe(false);
    });

    it('should reject email with spaces', () => {
      expect(isValidEmail('user @example.com')).toBe(false);
      expect(isValidEmail('user@ example.com')).toBe(false);
    });

    it('should reject email with multiple @', () => {
      expect(isValidEmail('user@@example.com')).toBe(false);
      expect(isValidEmail('user@foo@example.com')).toBe(false);
    });

    it('should reject email exceeding max length', () => {
      // Email length must exceed 254 chars (RFC 5321 limit)
      const localPart = 'a'.repeat(240);
      const tooLongEmail = `${localPart}@example.com`; // 240 + 12 = 252 chars, still OK
      expect(isValidEmail(tooLongEmail)).toBe(true); // Still valid

      // Now exceed 254
      const veryLongLocal = 'a'.repeat(250);
      const wayTooLong = `${veryLongLocal}@example.com`; // 250 + 12 = 262 chars
      expect(isValidEmail(wayTooLong)).toBe(false);
    });

    it('should reject single-char TLD', () => {
      expect(isValidEmail('user@example.c')).toBe(false);
    });
  });
});
