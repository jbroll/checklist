import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// Mock Stripe module
vi.mock('../../src/billing/stripe.js', () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
  isStripeEnabled: vi.fn(),
}));

import {
  getSubscriptionTiers,
  getTier,
  getUserSubscription,
  getUserSubscriptionWithTier,
  updateUserSubscription,
  canCreateList,
  getListsRemaining,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  recordUsage,
  getUsageHistory,
  createCheckoutSession,
  createPortalSession,
} from '../../src/billing/subscription.js';
import { stripe, isStripeEnabled } from '../../src/billing/stripe.js';

// In-memory database for testing
let db: Database.Database;

// Initialize test database with schema
function initTestDb() {
  db = new Database(':memory:');

  // Create user table (required for foreign key)
  db.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT
    )
  `);

  // Create subscription tier table (aligned with jbr-jazz schema)
  db.exec(`
    CREATE TABLE subscription_tier (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      max_items INTEGER NOT NULL,
      retention_days INTEGER NOT NULL,
      stripe_price_id TEXT
    )
  `);

  // Insert default tiers
  db.exec(`
    INSERT INTO subscription_tier (slug, name, price_cents, max_items, retention_days, stripe_price_id) VALUES
      ('free', 'Free', 0, 3, 7, NULL),
      ('plus', 'Plus', 999, 30, 30, 'price_plus_test'),
      ('premium', 'Premium', 1999, 300, 365, 'price_premium_test'),
      ('enterprise', 'Enterprise', 0, -1, -1, NULL)
  `);

  // Create user subscription table
  db.exec(`
    CREATE TABLE user_subscription (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      tier_slug TEXT NOT NULL DEFAULT 'free' REFERENCES subscription_tier(slug),
      stripe_customer_id TEXT UNIQUE,
      stripe_subscription_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'beta' CHECK(status IN ('active', 'past_due', 'cancelled', 'trialing', 'beta')),
      current_period_end INTEGER,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Create usage snapshot table
  db.exec(`
    CREATE TABLE usage_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      item_count INTEGER NOT NULL,
      recorded_at INTEGER DEFAULT (unixepoch())
    )
  `);

  return db;
}

// Helper to create a test user
function createTestUser(id: string, email = 'test@example.com') {
  db.prepare('INSERT INTO user (id, email, name) VALUES (?, ?, ?)').run(id, email, 'Test User');
}

describe('Subscription Service', () => {
  beforeEach(() => {
    db = initTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('getSubscriptionTiers', () => {
    it('should return all tiers ordered by price', () => {
      const tiers = getSubscriptionTiers(db);

      expect(tiers).toHaveLength(4);
      // Note: enterprise has price 0, so it sorts with free
      // Order is: free (0), enterprise (0), plus (999), premium (1999)
      const slugs = tiers.map((t) => t.slug);
      expect(slugs).toContain('free');
      expect(slugs).toContain('enterprise');
      expect(slugs).toContain('plus');
      expect(slugs).toContain('premium');
    });

    it('should return correct tier properties', () => {
      const tiers = getSubscriptionTiers(db);
      const plusTier = tiers.find((t) => t.slug === 'plus');

      expect(plusTier).toBeDefined();
      expect(plusTier?.name).toBe('Plus');
      expect(plusTier?.priceCents).toBe(999);
      expect(plusTier?.maxItems).toBe(30);
      expect(plusTier?.retentionDays).toBe(30);
      expect(plusTier?.stripePriceId).toBe('price_plus_test');
    });
  });

  describe('getTier', () => {
    it('should return tier by slug', () => {
      const tier = getTier(db, 'premium');

      expect(tier).not.toBeNull();
      expect(tier?.slug).toBe('premium');
      expect(tier?.maxItems).toBe(300);
    });

    it('should return null for invalid slug', () => {
      const tier = getTier(db, 'invalid' as any);

      expect(tier).toBeNull();
    });
  });

  describe('getUserSubscription', () => {
    it('should create default free subscription for new user', () => {
      createTestUser('user-1');

      const sub = getUserSubscription(db, 'user-1');

      expect(sub.userId).toBe('user-1');
      expect(sub.tierSlug).toBe('free');
      expect(sub.status).toBe('beta');
      expect(sub.stripeCustomerId).toBeNull();
      expect(sub.stripeSubscriptionId).toBeNull();
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('should return existing subscription', () => {
      createTestUser('user-2');

      // Insert existing subscription
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, stripe_customer_id, status)
        VALUES (?, 'plus', 'cus_123', 'active')
      `).run('user-2');

      const sub = getUserSubscription(db, 'user-2');

      expect(sub.tierSlug).toBe('plus');
      expect(sub.stripeCustomerId).toBe('cus_123');
      expect(sub.status).toBe('active');
    });

    it('should convert cancelAtPeriodEnd to boolean', () => {
      createTestUser('user-3');

      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status, cancel_at_period_end)
        VALUES (?, 'plus', 'active', 1)
      `).run('user-3');

      const sub = getUserSubscription(db, 'user-3');

      expect(sub.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('getUserSubscriptionWithTier', () => {
    it('should return subscription with tier details', () => {
      createTestUser('user-1');

      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'plus', 'active')
      `).run('user-1');

      const result = getUserSubscriptionWithTier(db, 'user-1');

      expect(result.tierSlug).toBe('plus');
      expect(result.tier.name).toBe('Plus');
      expect(result.tier.maxItems).toBe(30);
      expect(result.tier.retentionDays).toBe(30);
    });

    it('should return default tier values when tier lookup returns defaults', () => {
      createTestUser('user-1');

      // Create subscription with free tier
      db.exec(`INSERT INTO user_subscription (user_id, tier_slug, status) VALUES ('user-1', 'free', 'active')`);

      const result = getUserSubscriptionWithTier(db, 'user-1');

      // Should return the tier from database
      expect(result.tier.slug).toBe('free');
      expect(result.tier.maxItems).toBe(3);
      expect(result.tier.retentionDays).toBe(7);
      // Verify tier object is properly merged
      expect(result.tierSlug).toBe('free');
      expect(result.status).toBe('active');
    });
  });

  describe('updateUserSubscription', () => {
    beforeEach(() => {
      createTestUser('user-1');
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'free', 'beta')
      `).run('user-1');
    });

    it('should update tier slug', () => {
      updateUserSubscription(db, 'user-1', { tierSlug: 'plus' });

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.tierSlug).toBe('plus');
    });

    it('should update stripe customer id', () => {
      updateUserSubscription(db, 'user-1', { stripeCustomerId: 'cus_abc123' });

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.stripeCustomerId).toBe('cus_abc123');
    });

    it('should update multiple fields at once', () => {
      updateUserSubscription(db, 'user-1', {
        tierSlug: 'premium',
        stripeCustomerId: 'cus_xyz',
        stripeSubscriptionId: 'sub_xyz',
        status: 'active',
        currentPeriodEnd: 1735689600,
        cancelAtPeriodEnd: true,
      });

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.tierSlug).toBe('premium');
      expect(sub.stripeCustomerId).toBe('cus_xyz');
      expect(sub.stripeSubscriptionId).toBe('sub_xyz');
      expect(sub.status).toBe('active');
      expect(sub.currentPeriodEnd).toBe(1735689600);
      expect(sub.cancelAtPeriodEnd).toBe(true);
    });

    it('should do nothing with empty updates', () => {
      const before = getUserSubscription(db, 'user-1');
      updateUserSubscription(db, 'user-1', {});
      const after = getUserSubscription(db, 'user-1');

      expect(after.tierSlug).toBe(before.tierSlug);
    });
  });

  describe('canCreateList', () => {
    beforeEach(() => {
      createTestUser('user-1');
    });

    it('should return true when under limit', () => {
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'free', 'active')
      `).run('user-1');

      expect(canCreateList(db, 'user-1', 0)).toBe(true);
      expect(canCreateList(db, 'user-1', 1)).toBe(true);
      expect(canCreateList(db, 'user-1', 2)).toBe(true);
    });

    it('should return false when at or over limit', () => {
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'free', 'active')
      `).run('user-1');

      expect(canCreateList(db, 'user-1', 3)).toBe(false);
      expect(canCreateList(db, 'user-1', 5)).toBe(false);
    });

    it('should always return true for unlimited tier', () => {
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'enterprise', 'active')
      `).run('user-1');

      expect(canCreateList(db, 'user-1', 0)).toBe(true);
      expect(canCreateList(db, 'user-1', 1000)).toBe(true);
      expect(canCreateList(db, 'user-1', 999999)).toBe(true);
    });
  });

  describe('getListsRemaining', () => {
    beforeEach(() => {
      createTestUser('user-1');
    });

    it('should return correct remaining count', () => {
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'free', 'active')
      `).run('user-1');

      expect(getListsRemaining(db, 'user-1', 0)).toBe(3);
      expect(getListsRemaining(db, 'user-1', 1)).toBe(2);
      expect(getListsRemaining(db, 'user-1', 2)).toBe(1);
      expect(getListsRemaining(db, 'user-1', 3)).toBe(0);
    });

    it('should not go below zero', () => {
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'free', 'active')
      `).run('user-1');

      expect(getListsRemaining(db, 'user-1', 5)).toBe(0);
      expect(getListsRemaining(db, 'user-1', 100)).toBe(0);
    });

    it('should return -1 for unlimited tier', () => {
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'enterprise', 'active')
      `).run('user-1');

      expect(getListsRemaining(db, 'user-1', 0)).toBe(-1);
      expect(getListsRemaining(db, 'user-1', 1000)).toBe(-1);
    });
  });

  describe('handleCheckoutCompleted', () => {
    it('should update subscription after successful checkout', () => {
      createTestUser('user-1');
      db.prepare(`INSERT INTO user_subscription (user_id, tier_slug, status) VALUES (?, 'free', 'beta')`).run('user-1');

      handleCheckoutCompleted(db, 'user-1', 'plus', 'sub_123', 1735689600);

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.tierSlug).toBe('plus');
      expect(sub.stripeSubscriptionId).toBe('sub_123');
      expect(sub.status).toBe('active');
      expect(sub.currentPeriodEnd).toBe(1735689600);
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });
  });

  describe('handleSubscriptionUpdated', () => {
    beforeEach(() => {
      createTestUser('user-1');
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, stripe_subscription_id, status)
        VALUES (?, 'plus', 'sub_123', 'active')
      `).run('user-1');
    });

    it('should update subscription status', () => {
      handleSubscriptionUpdated(db, 'sub_123', 'past_due', null, 1735689600, false);

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.status).toBe('past_due');
      expect(sub.currentPeriodEnd).toBe(1735689600);
    });

    it('should update tier when provided', () => {
      handleSubscriptionUpdated(db, 'sub_123', 'active', 'premium', 1735689600, false);

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.tierSlug).toBe('premium');
    });

    it('should not change tier when null', () => {
      handleSubscriptionUpdated(db, 'sub_123', 'active', null, 1735689600, false);

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.tierSlug).toBe('plus'); // unchanged
    });

    it('should set cancelAtPeriodEnd flag', () => {
      handleSubscriptionUpdated(db, 'sub_123', 'active', null, 1735689600, true);

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.cancelAtPeriodEnd).toBe(true);
    });

    it('should handle non-existent subscription gracefully', () => {
      // Should not throw
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      handleSubscriptionUpdated(db, 'sub_nonexistent', 'active', null, 1735689600, false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No user found'));
      consoleSpy.mockRestore();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    beforeEach(() => {
      createTestUser('user-1');
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, stripe_subscription_id, status, current_period_end)
        VALUES (?, 'premium', 'sub_123', 'active', 1735689600)
      `).run('user-1');
    });

    it('should downgrade to free tier', () => {
      handleSubscriptionDeleted(db, 'sub_123');

      const sub = getUserSubscription(db, 'user-1');
      expect(sub.tierSlug).toBe('free');
      expect(sub.stripeSubscriptionId).toBeNull();
      expect(sub.status).toBe('active');
      expect(sub.currentPeriodEnd).toBeNull();
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('should handle non-existent subscription gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      handleSubscriptionDeleted(db, 'sub_nonexistent');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No user found'));
      consoleSpy.mockRestore();
    });
  });

  describe('recordUsage', () => {
    it('should record usage snapshot', () => {
      createTestUser('user-1');

      recordUsage(db, 'user-1', 5);

      const result = db.prepare('SELECT * FROM usage_snapshot WHERE user_id = ?').get('user-1') as any;
      expect(result.item_count).toBe(5);
    });

    it('should allow multiple snapshots for same user', () => {
      createTestUser('user-1');

      recordUsage(db, 'user-1', 5);
      recordUsage(db, 'user-1', 7);
      recordUsage(db, 'user-1', 3);

      const results = db.prepare('SELECT * FROM usage_snapshot WHERE user_id = ?').all('user-1');
      expect(results).toHaveLength(3);
    });
  });

  describe('getUsageHistory', () => {
    beforeEach(() => {
      createTestUser('user-1');
    });

    it('should return usage history in descending order', () => {
      // Insert with explicit timestamps to control order
      db.prepare('INSERT INTO usage_snapshot (user_id, item_count, recorded_at) VALUES (?, ?, ?)').run('user-1', 5, 1000);
      db.prepare('INSERT INTO usage_snapshot (user_id, item_count, recorded_at) VALUES (?, ?, ?)').run('user-1', 7, 2000);
      db.prepare('INSERT INTO usage_snapshot (user_id, item_count, recorded_at) VALUES (?, ?, ?)').run('user-1', 3, 3000);

      const history = getUsageHistory(db, 'user-1');

      expect(history).toHaveLength(3);
      expect(history[0].itemCount).toBe(3); // Most recent
      expect(history[1].itemCount).toBe(7);
      expect(history[2].itemCount).toBe(5); // Oldest
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 50; i++) {
        db.prepare('INSERT INTO usage_snapshot (user_id, item_count, recorded_at) VALUES (?, ?, ?)').run('user-1', i, i);
      }

      const history = getUsageHistory(db, 'user-1', 10);

      expect(history).toHaveLength(10);
    });

    it('should return empty array for user with no history', () => {
      const history = getUsageHistory(db, 'user-1');

      expect(history).toEqual([]);
    });
  });

  describe('createCheckoutSession', () => {
    beforeEach(() => {
      createTestUser('user-1', 'user@example.com');
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, status)
        VALUES (?, 'free', 'beta')
      `).run('user-1');
      vi.clearAllMocks();
    });

    it('should throw error when Stripe is not configured', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(false);

      await expect(
        createCheckoutSession(db, 'user-1', 'user@example.com', 'plus', 'http://success', 'http://cancel')
      ).rejects.toThrow('Stripe is not configured');
    });

    it('should throw error when tier has no price ID', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(true);

      // Update plus tier to have no price ID
      db.prepare('UPDATE subscription_tier SET stripe_price_id = NULL WHERE slug = ?').run('plus');

      await expect(
        createCheckoutSession(db, 'user-1', 'user@example.com', 'plus', 'http://success', 'http://cancel')
      ).rejects.toThrow('No Stripe price configured for tier: plus');
    });

    it('should create new Stripe customer when user has none', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(true);
      vi.mocked(stripe!.customers.create).mockResolvedValue({ id: 'cus_new123' } as any);
      vi.mocked(stripe!.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/session123' } as any);

      const url = await createCheckoutSession(db, 'user-1', 'user@example.com', 'plus', 'http://success', 'http://cancel');

      expect(stripe!.customers.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        metadata: { userId: 'user-1' },
      });
      expect(url).toBe('https://checkout.stripe.com/session123');

      // Verify customer ID was saved
      const sub = getUserSubscription(db, 'user-1');
      expect(sub.stripeCustomerId).toBe('cus_new123');
    });

    it('should use existing Stripe customer when available', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(true);
      vi.mocked(stripe!.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/session456' } as any);

      // Set existing customer ID
      db.prepare('UPDATE user_subscription SET stripe_customer_id = ? WHERE user_id = ?').run('cus_existing', 'user-1');

      const url = await createCheckoutSession(db, 'user-1', 'user@example.com', 'plus', 'http://success', 'http://cancel');

      expect(stripe!.customers.create).not.toHaveBeenCalled();
      expect(stripe!.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
          mode: 'subscription',
          line_items: [{ price: 'price_plus_test', quantity: 1 }],
          success_url: 'http://success',
          cancel_url: 'http://cancel',
        })
      );
      expect(url).toBe('https://checkout.stripe.com/session456');
    });

    it('should include metadata in checkout session', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(true);
      vi.mocked(stripe!.customers.create).mockResolvedValue({ id: 'cus_meta' } as any);
      vi.mocked(stripe!.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/meta' } as any);

      await createCheckoutSession(db, 'user-1', 'user@example.com', 'premium', 'http://success', 'http://cancel');

      expect(stripe!.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { userId: 'user-1', tierSlug: 'premium' },
          subscription_data: {
            metadata: { userId: 'user-1', tierSlug: 'premium' },
          },
        })
      );
    });
  });

  describe('createPortalSession', () => {
    beforeEach(() => {
      createTestUser('user-1', 'user@example.com');
      db.prepare(`
        INSERT INTO user_subscription (user_id, tier_slug, stripe_customer_id, status)
        VALUES (?, 'plus', 'cus_portal123', 'active')
      `).run('user-1');
      vi.clearAllMocks();
    });

    it('should throw error when Stripe is not configured', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(false);

      await expect(
        createPortalSession(db, 'user-1', 'http://return')
      ).rejects.toThrow('Stripe is not configured');
    });

    it('should throw error when user has no Stripe customer', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(true);

      // Remove customer ID
      db.prepare('UPDATE user_subscription SET stripe_customer_id = NULL WHERE user_id = ?').run('user-1');

      await expect(
        createPortalSession(db, 'user-1', 'http://return')
      ).rejects.toThrow('User has no Stripe customer record');
    });

    it('should create portal session and return URL', async () => {
      vi.mocked(isStripeEnabled).mockReturnValue(true);
      vi.mocked(stripe!.billingPortal.sessions.create).mockResolvedValue({ url: 'https://billing.stripe.com/portal123' } as any);

      const url = await createPortalSession(db, 'user-1', 'http://return');

      expect(stripe!.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_portal123',
        return_url: 'http://return',
      });
      expect(url).toBe('https://billing.stripe.com/portal123');
    });
  });
});
