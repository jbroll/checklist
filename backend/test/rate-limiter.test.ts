import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/lib/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 60 * 60 * 1000); // 3 requests per hour
  });

  describe('check', () => {
    it('should allow first request', () => {
      expect(limiter.check('user-1')).toBe(true);
    });

    it('should allow requests up to the limit', () => {
      expect(limiter.check('user-1')).toBe(true);
      expect(limiter.check('user-1')).toBe(true);
      expect(limiter.check('user-1')).toBe(true);
    });

    it('should block requests after limit is reached', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      expect(limiter.check('user-1')).toBe(false);
    });

    it('should continue blocking after limit', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      expect(limiter.check('user-1')).toBe(false);
      expect(limiter.check('user-1')).toBe(false);
      expect(limiter.check('user-1')).toBe(false);
    });

    it('should track different users independently', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');

      // user-1 is blocked
      expect(limiter.check('user-1')).toBe(false);

      // user-2 should still be allowed
      expect(limiter.check('user-2')).toBe(true);
      expect(limiter.check('user-2')).toBe(true);
      expect(limiter.check('user-2')).toBe(true);
      expect(limiter.check('user-2')).toBe(false);
    });

    it('should reset after window expires', () => {
      const now = Date.now();

      limiter.check('user-1', now);
      limiter.check('user-1', now);
      limiter.check('user-1', now);
      expect(limiter.check('user-1', now)).toBe(false);

      // Move time forward past the window (1 hour + 1ms)
      const afterWindow = now + 60 * 60 * 1000 + 1;
      expect(limiter.check('user-1', afterWindow)).toBe(true);
    });

    it('should start new window after expiry', () => {
      const now = Date.now();

      // Use up all requests
      limiter.check('user-1', now);
      limiter.check('user-1', now);
      limiter.check('user-1', now);

      // Move time forward past the window
      const afterWindow = now + 60 * 60 * 1000 + 1;

      // Should get fresh 3 requests
      expect(limiter.check('user-1', afterWindow)).toBe(true);
      expect(limiter.check('user-1', afterWindow)).toBe(true);
      expect(limiter.check('user-1', afterWindow)).toBe(true);
      expect(limiter.check('user-1', afterWindow)).toBe(false);
    });
  });

  describe('getRemaining', () => {
    it('should return max for new user', () => {
      expect(limiter.getRemaining('user-1')).toBe(3);
    });

    it('should decrease as requests are made', () => {
      limiter.check('user-1');
      expect(limiter.getRemaining('user-1')).toBe(2);

      limiter.check('user-1');
      expect(limiter.getRemaining('user-1')).toBe(1);

      limiter.check('user-1');
      expect(limiter.getRemaining('user-1')).toBe(0);
    });

    it('should not go below zero', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1'); // blocked
      limiter.check('user-1'); // blocked

      expect(limiter.getRemaining('user-1')).toBe(0);
    });

    it('should reset after window expires', () => {
      const now = Date.now();

      limiter.check('user-1', now);
      limiter.check('user-1', now);
      limiter.check('user-1', now);

      expect(limiter.getRemaining('user-1', now)).toBe(0);

      const afterWindow = now + 60 * 60 * 1000 + 1;
      expect(limiter.getRemaining('user-1', afterWindow)).toBe(3);
    });
  });

  describe('reset', () => {
    it('should clear limit for specific user', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');
      expect(limiter.check('user-1')).toBe(false);

      limiter.reset('user-1');

      expect(limiter.check('user-1')).toBe(true);
      expect(limiter.getRemaining('user-1')).toBe(2);
    });

    it('should not affect other users', () => {
      limiter.check('user-1');
      limiter.check('user-2');

      limiter.reset('user-1');

      expect(limiter.getRemaining('user-1')).toBe(3);
      expect(limiter.getRemaining('user-2')).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all limits', () => {
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-2');
      limiter.check('user-3');

      limiter.clear();

      expect(limiter.getRemaining('user-1')).toBe(3);
      expect(limiter.getRemaining('user-2')).toBe(3);
      expect(limiter.getRemaining('user-3')).toBe(3);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom max requests', () => {
      const customLimiter = new RateLimiter(5, 1000);

      for (let i = 0; i < 5; i++) {
        expect(customLimiter.check('user-1')).toBe(true);
      }
      expect(customLimiter.check('user-1')).toBe(false);
    });

    it('should respect custom window', () => {
      const now = Date.now();
      const shortWindow = 1000; // 1 second
      const customLimiter = new RateLimiter(3, shortWindow);

      customLimiter.check('user-1', now);
      customLimiter.check('user-1', now);
      customLimiter.check('user-1', now);
      expect(customLimiter.check('user-1', now)).toBe(false);

      // After short window
      expect(customLimiter.check('user-1', now + shortWindow + 1)).toBe(true);
    });
  });
});
