/**
 * Simple in-memory rate limiter with automatic cleanup.
 * Resets on server restart.
 */
export class RateLimiter {
  private limits: Map<string, { count: number; resetAt: number }>;
  private maxRequests: number;
  private windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxRequests: number = 3, windowMs: number = 60 * 60 * 1000) {
    this.limits = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    // Don't block process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Remove expired entries from the map.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.limits.entries()) {
      if (value.resetAt < now) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval and clear all entries.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.limits.clear();
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

// Rate limiter for share invites (prevents spam to random emails)
export const shareInviteLimiter = new RateLimiter(30, 60 * 60 * 1000); // 30 invites per hour
