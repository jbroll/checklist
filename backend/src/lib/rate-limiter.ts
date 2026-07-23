/**
 * Simple in-memory rate limiter with automatic cleanup. Resets on server restart.
 * Vendored from a previous shared backend package during the rowboat port.
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

    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    // Don't block process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.limits.entries()) {
      if (value.resetAt < now) {
        this.limits.delete(key);
      }
    }
  }

  /** Stop the cleanup interval and clear all entries. */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.limits.clear();
  }

  /** Returns true if the request is allowed, false if rate limited. */
  check(key: string, now: number = Date.now()): boolean {
    const limit = this.limits.get(key);

    if (!limit || limit.resetAt < now) {
      this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (limit.count >= this.maxRequests) {
      return false;
    }

    limit.count++;
    return true;
  }

  /** Remaining requests for a key; `maxRequests` if no window is open. */
  getRemaining(key: string, now: number = Date.now()): number {
    const limit = this.limits.get(key);

    if (!limit || limit.resetAt < now) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - limit.count);
  }

  reset(key: string): void {
    this.limits.delete(key);
  }

  clear(): void {
    this.limits.clear();
  }
}
