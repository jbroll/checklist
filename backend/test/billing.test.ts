/**
 * Backend Unit Tests for Billing/Subscription Functions
 *
 * Tests the subscription service functions and database operations.
 */

import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initBillingDb } from '../src/db.js';
import {
  canCreateList,
  getListsRemaining,
  getSubscriptionTiers,
  getTier,
  getUserSubscription,
  getUserSubscriptionWithTier,
  handleCheckoutCompleted,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  recordUsage,
  getUsageHistory,
  updateUserSubscription,
} from '../src/billing/subscription.js';

// Create in-memory database for testing
let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');

  // Create BetterAuth user table (required for foreign key)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      createdAt INTEGER DEFAULT (unixepoch()),
      updatedAt INTEGER DEFAULT (unixepoch())
    )
  `);

  // Insert test user
  db.exec(`
    INSERT INTO user (id, email, name) VALUES ('test-user-1', 'test@example.com', 'Test User')
  `);

  // Initialize subscription tables
  initBillingDb(db);
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  // Clean up user_subscription and usage_snapshot tables between tests
  db.exec('DELETE FROM user_subscription');
  db.exec('DELETE FROM usage_snapshot');
});

describe('Subscription Tiers', () => {
  it('should return all subscription tiers', () => {
    const tiers = getSubscriptionTiers(db);

    expect(tiers).toHaveLength(4);
    // Sorted by price_cents ASC: free (0), enterprise (0), plus (999), premium (1999)
    const slugs = tiers.map((t) => t.slug);
    expect(slugs).toContain('free');
    expect(slugs).toContain('plus');
    expect(slugs).toContain('premium');
    expect(slugs).toContain('enterprise');
  });

  it('should return tier by slug', () => {
    const freeTier = getTier(db, 'free');
    expect(freeTier).not.toBeNull();
    expect(freeTier?.slug).toBe('free');
    expect(freeTier?.maxItems).toBe(3);
    expect(freeTier?.retentionDays).toBe(7);

    const plusTier = getTier(db, 'plus');
    expect(plusTier).not.toBeNull();
    expect(plusTier?.slug).toBe('plus');
    expect(plusTier?.maxItems).toBe(30);
  });

  it('should return null for non-existent tier', () => {
    const tier = getTier(db, 'nonexistent' as any);
    expect(tier).toBeNull();
  });

  it('should have stripe_price_id column in tier', () => {
    const tier = getTier(db, 'plus');
    expect(tier).toHaveProperty('stripePriceId');
  });
});

describe('Stripe Price ID Sync', () => {
  it('should sync price IDs from env vars to database', () => {
    // Set env vars and re-run initDb to sync
    const originalPlus = process.env.STRIPE_PRICE_PLUS;
    const originalPremium = process.env.STRIPE_PRICE_PREMIUM;

    process.env.STRIPE_PRICE_PLUS = 'price_test_plus_123';
    process.env.STRIPE_PRICE_PREMIUM = 'price_test_premium_456';

    // Re-init to trigger sync
    initBillingDb(db);

    const plusTier = getTier(db, 'plus');
    const premiumTier = getTier(db, 'premium');

    expect(plusTier?.stripePriceId).toBe('price_test_plus_123');
    expect(premiumTier?.stripePriceId).toBe('price_test_premium_456');

    // Restore original env vars
    if (originalPlus) {
      process.env.STRIPE_PRICE_PLUS = originalPlus;
    } else {
      delete process.env.STRIPE_PRICE_PLUS;
    }
    if (originalPremium) {
      process.env.STRIPE_PRICE_PREMIUM = originalPremium;
    } else {
      delete process.env.STRIPE_PRICE_PREMIUM;
    }
  });

  it('should not update price ID if env var is not set', () => {
    // Clear the price ID first
    db.exec("UPDATE subscription_tier SET stripe_price_id = NULL WHERE slug = 'plus'");

    const originalPlus = process.env.STRIPE_PRICE_PLUS;
    delete process.env.STRIPE_PRICE_PLUS;

    // Re-init
    initBillingDb(db);

    const plusTier = getTier(db, 'plus');
    expect(plusTier?.stripePriceId).toBeNull();

    // Restore
    if (originalPlus) {
      process.env.STRIPE_PRICE_PLUS = originalPlus;
    }
  });
});

describe('User Subscription', () => {
  it('should create default free subscription with beta status for new user', () => {
    const subscription = getUserSubscription(db, 'test-user-1');

    expect(subscription.userId).toBe('test-user-1');
    expect(subscription.tierSlug).toBe('free');
    expect(subscription.status).toBe('beta'); // Beta status during beta period
    expect(subscription.stripeCustomerId).toBeNull();
    expect(subscription.stripeSubscriptionId).toBeNull();
  });

  it('should return existing subscription', () => {
    // Create subscription first
    getUserSubscription(db, 'test-user-1');

    // Update it
    updateUserSubscription(db, 'test-user-1', {
      tierSlug: 'plus',
      stripeCustomerId: 'cus_123',
    });

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('plus');
    expect(subscription.stripeCustomerId).toBe('cus_123');
  });

  it('should get subscription with tier details', () => {
    getUserSubscription(db, 'test-user-1');

    const result = getUserSubscriptionWithTier(db, 'test-user-1');
    expect(result.tierSlug).toBe('free');
    expect(result.tier.slug).toBe('free');
    expect(result.tier.maxItems).toBe(3);
  });
});

describe('Subscription Updates', () => {
  it('should update subscription tier', () => {
    getUserSubscription(db, 'test-user-1');

    updateUserSubscription(db, 'test-user-1', { tierSlug: 'premium' });

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('premium');
  });

  it('should update multiple fields', () => {
    getUserSubscription(db, 'test-user-1');

    updateUserSubscription(db, 'test-user-1', {
      tierSlug: 'plus',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_xyz',
      status: 'active',
      currentPeriodEnd: 1700000000,
      cancelAtPeriodEnd: false,
    });

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('plus');
    expect(subscription.stripeCustomerId).toBe('cus_abc');
    expect(subscription.stripeSubscriptionId).toBe('sub_xyz');
    expect(subscription.currentPeriodEnd).toBe(1700000000);
  });
});

describe('List Limit Checking', () => {
  it('should allow creating list when under limit', () => {
    getUserSubscription(db, 'test-user-1'); // Free tier, limit 3

    expect(canCreateList(db, 'test-user-1', 0)).toBe(true);
    expect(canCreateList(db, 'test-user-1', 1)).toBe(true);
    expect(canCreateList(db, 'test-user-1', 2)).toBe(true);
  });

  it('should block creating list when at limit', () => {
    getUserSubscription(db, 'test-user-1'); // Free tier, limit 3

    expect(canCreateList(db, 'test-user-1', 3)).toBe(false);
    expect(canCreateList(db, 'test-user-1', 5)).toBe(false);
  });

  it('should allow unlimited for enterprise tier', () => {
    getUserSubscription(db, 'test-user-1');
    updateUserSubscription(db, 'test-user-1', { tierSlug: 'enterprise' });

    expect(canCreateList(db, 'test-user-1', 1000)).toBe(true);
  });

  it('should calculate lists remaining', () => {
    getUserSubscription(db, 'test-user-1'); // Free tier, limit 3

    expect(getListsRemaining(db, 'test-user-1', 0)).toBe(3);
    expect(getListsRemaining(db, 'test-user-1', 2)).toBe(1);
    expect(getListsRemaining(db, 'test-user-1', 3)).toBe(0);
    expect(getListsRemaining(db, 'test-user-1', 5)).toBe(0);
  });

  it('should return -1 for unlimited tier', () => {
    getUserSubscription(db, 'test-user-1');
    updateUserSubscription(db, 'test-user-1', { tierSlug: 'enterprise' });

    expect(getListsRemaining(db, 'test-user-1', 1000)).toBe(-1);
  });
});

describe('Webhook Handlers', () => {
  it('should handle checkout completed', () => {
    getUserSubscription(db, 'test-user-1');

    handleCheckoutCompleted(db, 'test-user-1', 'plus', 'sub_123', 1700000000);

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('plus');
    expect(subscription.stripeSubscriptionId).toBe('sub_123');
    expect(subscription.status).toBe('active');
    expect(subscription.currentPeriodEnd).toBe(1700000000);
  });

  it('should handle subscription updated', () => {
    getUserSubscription(db, 'test-user-1');
    updateUserSubscription(db, 'test-user-1', { stripeSubscriptionId: 'sub_456' });

    handleSubscriptionUpdated(db, 'sub_456', 'past_due', 'plus', 1800000000, true);

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.status).toBe('past_due');
    expect(subscription.tierSlug).toBe('plus');
    expect(subscription.cancelAtPeriodEnd).toBe(true);
  });

  it('should handle subscription deleted (downgrade to free)', () => {
    getUserSubscription(db, 'test-user-1');
    updateUserSubscription(db, 'test-user-1', {
      tierSlug: 'plus',
      stripeSubscriptionId: 'sub_789',
    });

    handleSubscriptionDeleted(db, 'sub_789');

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('free');
    expect(subscription.stripeSubscriptionId).toBeNull();
    expect(subscription.status).toBe('active');
  });

  it('should not crash for unknown subscription ID', () => {
    // Should just log warning, not throw
    expect(() => {
      handleSubscriptionUpdated(db, 'unknown_sub', 'active', null, 0, false);
    }).not.toThrow();

    expect(() => {
      handleSubscriptionDeleted(db, 'unknown_sub');
    }).not.toThrow();
  });
});

describe('Usage Tracking', () => {
  it('should record usage snapshot', () => {
    recordUsage(db, 'test-user-1', 5);

    const history = getUsageHistory(db, 'test-user-1');
    expect(history).toHaveLength(1);
    expect(history[0].itemCount).toBe(5);
  });

  it('should return usage history in descending order', () => {
    recordUsage(db, 'test-user-1', 1);
    recordUsage(db, 'test-user-1', 2);
    recordUsage(db, 'test-user-1', 3);

    const history = getUsageHistory(db, 'test-user-1');
    expect(history).toHaveLength(3);
    expect(history[0].itemCount).toBe(3); // Most recent first
    expect(history[2].itemCount).toBe(1);
  });

  it('should limit usage history results', () => {
    for (let i = 0; i < 50; i++) {
      recordUsage(db, 'test-user-1', i);
    }

    const history = getUsageHistory(db, 'test-user-1', 10);
    expect(history).toHaveLength(10);
  });
});

describe('Webhook Idempotency', () => {
  beforeEach(() => {
    // Clean up processed events table between tests
    db.exec('DELETE FROM processed_webhook_events');
  });

  it('should record processed webhook events', () => {
    const eventId = 'evt_test_123';

    // Insert a processed event
    db.prepare(
      'INSERT INTO processed_webhook_events (event_id, processed_at) VALUES (?, ?)'
    ).run(eventId, new Date().toISOString());

    // Verify it was recorded
    const row = db
      .prepare('SELECT * FROM processed_webhook_events WHERE event_id = ?')
      .get(eventId) as { event_id: string; processed_at: string };

    expect(row).toBeDefined();
    expect(row.event_id).toBe(eventId);
  });

  it('should detect duplicate events', () => {
    const eventId = 'evt_duplicate_456';

    // First insertion should succeed
    const insert = db.prepare(
      'INSERT INTO processed_webhook_events (event_id, processed_at) VALUES (?, ?)'
    );
    insert.run(eventId, new Date().toISOString());

    // Second insertion should fail (PRIMARY KEY constraint)
    expect(() => {
      insert.run(eventId, new Date().toISOString());
    }).toThrow();
  });

  it('should allow checking for existing events', () => {
    const eventId = 'evt_check_789';

    // Before insertion
    let existing = db
      .prepare('SELECT event_id FROM processed_webhook_events WHERE event_id = ?')
      .get(eventId);
    expect(existing).toBeUndefined();

    // After insertion
    db.prepare(
      'INSERT INTO processed_webhook_events (event_id, processed_at) VALUES (?, ?)'
    ).run(eventId, new Date().toISOString());

    existing = db
      .prepare('SELECT event_id FROM processed_webhook_events WHERE event_id = ?')
      .get(eventId);
    expect(existing).toBeDefined();
  });
});
