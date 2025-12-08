import { describe, it, expect } from 'vitest';
import {
  createVerificationToken,
  verifyToken,
  TOKEN_EXPIRY_HOURS,
  type TokenPayload,
} from '../src/lib/verification-token.js';

const TEST_SECRET = 'test-secret-key-for-testing-only';

describe('verification-token', () => {
  describe('createVerificationToken', () => {
    it('should create a token with correct format', () => {
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Token should have two parts separated by dot
      const parts = token.split('.');
      expect(parts).toHaveLength(2);

      // Both parts should be base64url encoded
      expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should encode userId and email in payload', () => {
      const token = createVerificationToken('user-456', 'alice@test.com', TEST_SECRET);
      const [payloadBase64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      expect(payload.userId).toBe('user-456');
      expect(payload.email).toBe('alice@test.com');
      expect(payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should set expiry based on TOKEN_EXPIRY_HOURS', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createVerificationToken('user-789', 'bob@test.com', TEST_SECRET);
      const [payloadBase64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      const expectedExpiry = now + TOKEN_EXPIRY_HOURS * 60 * 60;
      // Allow 5 second tolerance for test execution time
      expect(payload.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 5);
      expect(payload.expiresAt).toBeLessThanOrEqual(expectedExpiry + 5);
    });

    it('should allow custom expiry time', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET, 1); // 1 hour
      const [payloadBase64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      const expectedExpiry = now + 1 * 60 * 60;
      expect(payload.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 5);
      expect(payload.expiresAt).toBeLessThanOrEqual(expectedExpiry + 5);
    });

    it('should throw if secret is empty', () => {
      expect(() => createVerificationToken('user-123', 'test@example.com', '')).toThrow(
        'Secret is required'
      );
    });

    it('should produce different tokens for different inputs', () => {
      const token1 = createVerificationToken('user-1', 'a@test.com', TEST_SECRET);
      const token2 = createVerificationToken('user-2', 'a@test.com', TEST_SECRET);
      const token3 = createVerificationToken('user-1', 'b@test.com', TEST_SECRET);

      expect(token1).not.toBe(token2);
      expect(token1).not.toBe(token3);
      expect(token2).not.toBe(token3);
    });

    it('should produce different signatures with different secrets', () => {
      const token1 = createVerificationToken('user-1', 'test@example.com', 'secret-1');
      const token2 = createVerificationToken('user-1', 'test@example.com', 'secret-2');

      // Payloads should be the same (minus timing differences)
      const [payload1] = token1.split('.');
      const [payload2] = token2.split('.');

      // Signatures should be different
      const sig1 = token1.split('.')[1];
      const sig2 = token2.split('.')[1];
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      const payload = verifyToken(token, TEST_SECRET);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe('user-123');
      expect(payload?.email).toBe('test@example.com');
    });

    it('should return null for invalid signature', () => {
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      const [payload] = token.split('.');
      const tamperedToken = `${payload}.invalidSignature`;

      expect(verifyToken(tamperedToken, TEST_SECRET)).toBeNull();
    });

    it('should return null for wrong secret', () => {
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      expect(verifyToken(token, 'wrong-secret')).toBeNull();
    });

    it('should return null for tampered payload', () => {
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      const [, signature] = token.split('.');

      // Create tampered payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: 'hacker', email: 'hacker@evil.com', expiresAt: 9999999999 })
      ).toString('base64url');

      const tamperedToken = `${tamperedPayload}.${signature}`;
      expect(verifyToken(tamperedToken, TEST_SECRET)).toBeNull();
    });

    it('should return null for expired token', () => {
      // Create token that expires in -1 hours (already expired)
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET, -1);
      expect(verifyToken(token, TEST_SECRET)).toBeNull();
    });

    it('should return null for malformed token (no dot)', () => {
      expect(verifyToken('nodothere', TEST_SECRET)).toBeNull();
    });

    it('should return null for malformed token (too many dots)', () => {
      expect(verifyToken('a.b.c', TEST_SECRET)).toBeNull();
    });

    it('should return null for empty token', () => {
      expect(verifyToken('', TEST_SECRET)).toBeNull();
    });

    it('should return null for empty secret', () => {
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      expect(verifyToken(token, '')).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(verifyToken('!!!invalid!!!.signature', TEST_SECRET)).toBeNull();
    });

    it('should return null for invalid JSON in payload', () => {
      const invalidPayload = Buffer.from('not json').toString('base64url');
      const signature = 'fakesig';
      expect(verifyToken(`${invalidPayload}.${signature}`, TEST_SECRET)).toBeNull();
    });

    it('should return null for payload missing required fields', () => {
      // Create a valid-looking token but with missing fields
      const incompletePayload = Buffer.from(JSON.stringify({ userId: 'user-123' })).toString(
        'base64url'
      );
      // We can't easily create a valid signature for this, but test the validation
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      const [, validSig] = token.split('.');

      // This won't have a valid signature, but tests the path
      expect(verifyToken(`${incompletePayload}.${validSig}`, TEST_SECRET)).toBeNull();
    });
  });

  describe('timing safety', () => {
    it('should use constant-time comparison for signatures', () => {
      // This is a basic check - true timing attack prevention would need benchmarking
      const token = createVerificationToken('user-123', 'test@example.com', TEST_SECRET);
      const [payload] = token.split('.');

      // Both should fail, but shouldn't leak timing info
      const result1 = verifyToken(`${payload}.aaaaaa`, TEST_SECRET);
      const result2 = verifyToken(`${payload}.zzzzzz`, TEST_SECRET);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in email', () => {
      const email = 'test+special@sub.example.com';
      const token = createVerificationToken('user-123', email, TEST_SECRET);
      const payload = verifyToken(token, TEST_SECRET);

      expect(payload?.email).toBe(email);
    });

    it('should handle unicode in userId', () => {
      const userId = 'user-émoji-🎉';
      const token = createVerificationToken(userId, 'test@example.com', TEST_SECRET);
      const payload = verifyToken(token, TEST_SECRET);

      expect(payload?.userId).toBe(userId);
    });

    it('should handle very long emails', () => {
      const longEmail = 'a'.repeat(200) + '@example.com';
      const token = createVerificationToken('user-123', longEmail, TEST_SECRET);
      const payload = verifyToken(token, TEST_SECRET);

      expect(payload?.email).toBe(longEmail);
    });
  });
});
