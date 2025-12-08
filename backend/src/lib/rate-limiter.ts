/**
 * Simple in-memory rate limiter.
 * Resets on server restart.
 */
export class RateLimiter {
  private limits: Map<string, { count: number; resetAt: number }>;
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 3, windowMs: number = 60 * 60 * 1000) {
    this.limits = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed for the given key.
   * Returns true if allowed, false if rate limited.
   */
  check(key: string, now: number = Date.now()): boolean {
    const limit = this.limits.get(key);

    if (!limit || limit.resetAt < now) {
      // First request or window expired - start new window
      this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (limit.count >= this.maxRequests) {
      // Rate limited
      return false;
    }

    // Increment and allow
    limit.count++;
    return true;
  }

  /**
   * Get remaining requests for a key.
   * Returns maxRequests if no limit exists yet.
   */
  getRemaining(key: string, now: number = Date.now()): number {
    const limit = this.limits.get(key);

    if (!limit || limit.resetAt < now) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - limit.count);
  }

  /**
   * Reset the limit for a specific key.
   */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all limits.
   */
  clear(): void {
    this.limits.clear();
  }
}

// Default instance for email verification (3 requests per hour)
export const emailVerificationLimiter = new RateLimiter(3, 60 * 60 * 1000);
