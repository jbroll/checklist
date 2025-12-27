/**
 * Backend Unit Tests for Billing/Subscription Functions
 *
 * Tests the subscription service functions and database operations.
 */

import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb } from '../src/db.js';
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
  initDb(db);
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
    // Sorted by price_cents ASC: free (0), enterprise (0), premium (999), team (1999)
    const slugs = tiers.map((t) => t.slug);
    expect(slugs).toContain('free');
    expect(slugs).toContain('premium');
    expect(slugs).toContain('team');
    expect(slugs).toContain('enterprise');
  });

  it('should return tier by slug', () => {
    const freeTier = getTier(db, 'free');
    expect(freeTier).not.toBeNull();
    expect(freeTier?.slug).toBe('free');
    expect(freeTier?.maxLists).toBe(3);
    expect(freeTier?.sessionRetentionDays).toBe(7);

    const premiumTier = getTier(db, 'premium');
    expect(premiumTier).not.toBeNull();
    expect(premiumTier?.slug).toBe('premium');
    expect(premiumTier?.maxLists).toBe(30);
  });

  it('should return null for non-existent tier', () => {
    const tier = getTier(db, 'nonexistent' as any);
    expect(tier).toBeNull();
  });

  it('should have stripe_price_id column in tier', () => {
    const tier = getTier(db, 'premium');
    expect(tier).toHaveProperty('stripePriceId');
  });
});

describe('Stripe Price ID Sync', () => {
  it('should sync price IDs from env vars to database', () => {
    // Set env vars and re-run initDb to sync
    const originalPremium = process.env.STRIPE_PRICE_PREMIUM;
    const originalTeam = process.env.STRIPE_PRICE_TEAM;

    process.env.STRIPE_PRICE_PREMIUM = 'price_test_premium_123';
    process.env.STRIPE_PRICE_TEAM = 'price_test_team_456';

    // Re-init to trigger sync
    initDb(db);

    const premiumTier = getTier(db, 'premium');
    const teamTier = getTier(db, 'team');

    expect(premiumTier?.stripePriceId).toBe('price_test_premium_123');
    expect(teamTier?.stripePriceId).toBe('price_test_team_456');

    // Restore original env vars
    if (originalPremium) {
      process.env.STRIPE_PRICE_PREMIUM = originalPremium;
    } else {
      delete process.env.STRIPE_PRICE_PREMIUM;
    }
    if (originalTeam) {
      process.env.STRIPE_PRICE_TEAM = originalTeam;
    } else {
      delete process.env.STRIPE_PRICE_TEAM;
    }
  });

  it('should not update price ID if env var is not set', () => {
    // Clear the price ID first
    db.exec("UPDATE subscription_tier SET stripe_price_id = NULL WHERE slug = 'premium'");

    const originalPremium = process.env.STRIPE_PRICE_PREMIUM;
    delete process.env.STRIPE_PRICE_PREMIUM;

    // Re-init
    initDb(db);

    const premiumTier = getTier(db, 'premium');
    expect(premiumTier?.stripePriceId).toBeNull();

    // Restore
    if (originalPremium) {
      process.env.STRIPE_PRICE_PREMIUM = originalPremium;
    }
  });
});

describe('User Subscription', () => {
  it('should create default free subscription for new user', () => {
    const subscription = getUserSubscription(db, 'test-user-1');

    expect(subscription.userId).toBe('test-user-1');
    expect(subscription.tierSlug).toBe('free');
    expect(subscription.status).toBe('active');
    expect(subscription.stripeCustomerId).toBeNull();
    expect(subscription.stripeSubscriptionId).toBeNull();
  });

  it('should return existing subscription', () => {
    // Create subscription first
    getUserSubscription(db, 'test-user-1');

    // Update it
    updateUserSubscription(db, 'test-user-1', {
      tierSlug: 'premium',
      stripeCustomerId: 'cus_123',
    });

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('premium');
    expect(subscription.stripeCustomerId).toBe('cus_123');
  });

  it('should get subscription with tier details', () => {
    getUserSubscription(db, 'test-user-1');

    const result = getUserSubscriptionWithTier(db, 'test-user-1');
    expect(result.tierSlug).toBe('free');
    expect(result.tier.slug).toBe('free');
    expect(result.tier.maxLists).toBe(3);
  });
});

describe('Subscription Updates', () => {
  it('should update subscription tier', () => {
    getUserSubscription(db, 'test-user-1');

    updateUserSubscription(db, 'test-user-1', { tierSlug: 'team' });

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('team');
  });

  it('should update multiple fields', () => {
    getUserSubscription(db, 'test-user-1');

    updateUserSubscription(db, 'test-user-1', {
      tierSlug: 'premium',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_xyz',
      status: 'active',
      currentPeriodEnd: 1700000000,
      cancelAtPeriodEnd: false,
    });

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('premium');
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

    handleCheckoutCompleted(db, 'test-user-1', 'premium', 'sub_123', 1700000000);

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.tierSlug).toBe('premium');
    expect(subscription.stripeSubscriptionId).toBe('sub_123');
    expect(subscription.status).toBe('active');
    expect(subscription.currentPeriodEnd).toBe(1700000000);
  });

  it('should handle subscription updated', () => {
    getUserSubscription(db, 'test-user-1');
    updateUserSubscription(db, 'test-user-1', { stripeSubscriptionId: 'sub_456' });

    handleSubscriptionUpdated(db, 'sub_456', 'past_due', 'premium', 1800000000, true);

    const subscription = getUserSubscription(db, 'test-user-1');
    expect(subscription.status).toBe('past_due');
    expect(subscription.tierSlug).toBe('premium');
    expect(subscription.cancelAtPeriodEnd).toBe(true);
  });

  it('should handle subscription deleted (downgrade to free)', () => {
    getUserSubscription(db, 'test-user-1');
    updateUserSubscription(db, 'test-user-1', {
      tierSlug: 'premium',
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
    expect(history[0].listCount).toBe(5);
  });

  it('should return usage history in descending order', () => {
    recordUsage(db, 'test-user-1', 1);
    recordUsage(db, 'test-user-1', 2);
    recordUsage(db, 'test-user-1', 3);

    const history = getUsageHistory(db, 'test-user-1');
    expect(history).toHaveLength(3);
    expect(history[0].listCount).toBe(3); // Most recent first
    expect(history[2].listCount).toBe(1);
  });

  it('should limit usage history results', () => {
    for (let i = 0; i < 50; i++) {
      recordUsage(db, 'test-user-1', i);
    }

    const history = getUsageHistory(db, 'test-user-1', 10);
    expect(history).toHaveLength(10);
  });
});
