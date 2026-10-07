/**
 * Security Tests
 *
 * Tests for security-related utilities and validation functions.
 */

import {
  inviteTokenFromPath,
  stashInviteToken,
  takeStashedInviteToken,
} from '@jbroll/rowboat-sharing-react';
import { beforeEach, describe, expect, it } from 'vitest';

const TOKEN = 'a1b2c3d4'.repeat(8);

// Email validation
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

function isValidEmail(email: string): boolean {
  if (!email) return false;
  if (email.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_REGEX.test(email);
}

describe('invite token from the path', () => {
  it('accepts a 64-hex token, with or without a trailing slash', () => {
    expect(inviteTokenFromPath(`/invite/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromPath(`/invite/${TOKEN}/`)).toBe(TOKEN);
  });

  it('rejects anything that is not a 64-hex token', () => {
    for (const path of [
      '/invite/',
      '/invite/abc123',
      `/invite/${TOKEN.toUpperCase()}`,
      `/invite/${TOKEN}a`,
      `/invite/${TOKEN}/extra`,
      '/invite/../../../etc/passwd',
      '/invite/<script>alert(1)</script>',
      `/invite/${TOKEN}?next=//evil.example`,
    ]) {
      expect(inviteTokenFromPath(path)).toBeNull();
    }
  });
});

describe('stashed invite token', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns a stashed token once', () => {
    stashInviteToken(TOKEN);
    expect(takeStashedInviteToken()).toBe(TOKEN);
    expect(takeStashedInviteToken()).toBeNull();
  });

  it('drops a malformed stash so it can never become a redirect target', () => {
    for (const bad of ['//evil.example', 'javascript:alert(1)', '../x', 'abc\n123', '']) {
      stashInviteToken(bad);
      expect(takeStashedInviteToken()).toBeNull();
    }
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
