import type Database from 'better-sqlite3';

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

// Rate limiter for share token validation (prevents brute-force on tokens)
export const tokenValidationLimiter = new RateLimiter(10, 60 * 1000); // 10 requests per minute per IP

/**
 * Persistent rate limiter using SQLite.
 * Survives server restarts and can be shared across instances (with same DB).
 */
export class PersistentRateLimiter {
  private readonly db: Database.Database;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly prefix: string;

  constructor(
    db: Database.Database,
    maxRequests: number = 10,
    windowMs: number = 60 * 60 * 1000,
    prefix = 'rate'
  ) {
    this.db = db;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  /**
   * Check if a request is allowed for the given key.
   * Returns true if allowed, false if rate limited.
   */
  check(key: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const fullKey = `${this.prefix}:${key}`;
    const windowSeconds = Math.floor(this.windowMs / 1000);

    // Get or create entry
    const entry = this.db
      .prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
      .get(fullKey) as { count: number; reset_at: number } | undefined;

    // If no entry or entry expired, create new entry
    if (!entry || entry.reset_at < now) {
      this.db
        .prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)')
        .run(fullKey, now + windowSeconds);
      return true;
    }

    // If within limit, increment and allow
    if (entry.count < this.maxRequests) {
      this.db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(fullKey);
      return true;
    }

    // Rate limited
    return false;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(now);
  }
}
