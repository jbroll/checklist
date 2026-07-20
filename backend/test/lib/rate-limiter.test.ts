import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/lib/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to maxRequests then blocks', () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(false);

    limiter.destroy();
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.check('a', 1000)).toBe(true);
    expect(limiter.check('a', 1000)).toBe(false);
    expect(limiter.check('b', 1000)).toBe(true);

    limiter.destroy();
  });

  it('starts a fresh window once the old one expires', () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(false);
    expect(limiter.check('user-1', 62_000)).toBe(true);

    limiter.destroy();
  });

  it('reports remaining requests', () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.getRemaining('user-1', 1000)).toBe(3);
    limiter.check('user-1', 1000);
    expect(limiter.getRemaining('user-1', 1000)).toBe(2);

    limiter.destroy();
  });
});
