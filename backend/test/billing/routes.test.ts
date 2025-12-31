import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';

// Mock state - these are hoisted
let stripeEnabled = false;

// Mock Stripe module
vi.mock('../../src/billing/stripe.js', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  isStripeEnabled: vi.fn(() => stripeEnabled),
}));

// Mock subscription functions that call Stripe
vi.mock('../../src/billing/subscription.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/billing/subscription.js')>();
  return {
    ...actual,
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
  };
});

import { setupBillingRoutes, setupStripeWebhook, billingLimiter } from '../../src/billing/routes.js';
import { stripe, isStripeEnabled } from '../../src/billing/stripe.js';
import { createCheckoutSession, createPortalSession } from '../../src/billing/subscription.js';

// In-memory database for testing
let db: Database.Database;
let app: express.Application;

// Mock auth object
const mockAuth = {
  api: {
    getSession: vi.fn(),
  },
};

// Initialize test database with schema
function initTestDb() {
  db = new Database(':memory:');

  // Create user table
  db.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT
    )
  `);

  // Create subscription tier table
  db.exec(`
    CREATE TABLE subscription_tier (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      max_lists INTEGER NOT NULL,
      session_retention_days INTEGER NOT NULL,
      stripe_price_id TEXT
    )
  `);

  // Insert default tiers
  db.exec(`
    INSERT INTO subscription_tier (slug, name, price_cents, max_lists, session_retention_days, stripe_price_id) VALUES
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
      list_count INTEGER NOT NULL,
      recorded_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Create processed webhook events table (for idempotency)
  db.exec(`
    CREATE TABLE processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL
    )
  `);

  return db;
}

// Helper to create a test user
function createTestUser(id: string, email = 'test@example.com') {
  db.prepare('INSERT INTO user (id, email, name) VALUES (?, ?, ?)').run(id, email, 'Test User');
}

// Helper to create subscription for user
function createSubscription(
  userId: string,
  tierSlug = 'free',
  status = 'beta',
  stripeCustomerId: string | null = null,
  stripeSubscriptionId: string | null = null
) {
  db.prepare(`
    INSERT INTO user_subscription (user_id, tier_slug, status, stripe_customer_id, stripe_subscription_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, tierSlug, status, stripeCustomerId, stripeSubscriptionId);
}

// Setup express app with routes
function setupTestApp() {
  app = express();
  app.use(express.json());
  setupBillingRoutes(app, db, mockAuth as any);
  return app;
}

describe('Billing Routes', () => {
  beforeEach(() => {
    db = initTestDb();
    app = setupTestApp();
    vi.clearAllMocks();
    stripeEnabled = false;
    billingLimiter.clear(); // Reset rate limiter between tests
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /api/billing/tiers', () => {
    it('should return all subscription tiers', async () => {
      const response = await request(app).get('/api/billing/tiers').expect(200);

      expect(response.body.tiers).toHaveLength(4);
      // Note: tiers are ordered by price, enterprise has price 0
      const slugs = response.body.tiers.map((t: any) => t.slug);
      expect(slugs).toContain('free');
      expect(slugs).toContain('enterprise');
      expect(slugs).toContain('plus');
      expect(slugs).toContain('premium');
    });

    it('should include tier details', async () => {
      const response = await request(app).get('/api/billing/tiers').expect(200);

      const plusTier = response.body.tiers.find((t: any) => t.slug === 'plus');
      expect(plusTier.name).toBe('Plus');
      expect(plusTier.priceCents).toBe(999);
      expect(plusTier.maxLists).toBe(30);
      expect(plusTier.sessionRetentionDays).toBe(30);
    });
  });

  describe('GET /api/billing/subscription', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).get('/api/billing/subscription').expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });

    it('should return user subscription when authenticated', async () => {
      createTestUser('user-1');
      createSubscription('user-1', 'plus', 'active');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).get('/api/billing/subscription').expect(200);

      expect(response.body.subscription.tierSlug).toBe('plus');
      expect(response.body.subscription.status).toBe('active');
      expect(response.body.subscription.tier.name).toBe('Plus');
    });

    it('should create default subscription for new user', async () => {
      createTestUser('user-new');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-new', email: 'new@example.com', name: 'New User' },
      });

      const response = await request(app).get('/api/billing/subscription').expect(200);

      expect(response.body.subscription.tierSlug).toBe('free');
      expect(response.body.subscription.status).toBe('beta');
    });
  });

  describe('GET /api/billing/usage', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).get('/api/billing/usage').expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });

    it('should return usage info when authenticated', async () => {
      createTestUser('user-1');
      createSubscription('user-1', 'plus', 'active');

      // Add some usage history
      db.prepare('INSERT INTO usage_snapshot (user_id, list_count, recorded_at) VALUES (?, ?, ?)').run('user-1', 5, 1000);
      db.prepare('INSERT INTO usage_snapshot (user_id, list_count, recorded_at) VALUES (?, ?, ?)').run('user-1', 7, 2000);

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).get('/api/billing/usage').expect(200);

      expect(response.body.tier.slug).toBe('plus');
      expect(response.body.maxLists).toBe(30);
      expect(response.body.sessionRetentionDays).toBe(30);
      expect(response.body.history).toHaveLength(2);
    });
  });

  describe('POST /api/billing/usage', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/usage').send({ listCount: 5 }).expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });

    it('should record usage when authenticated', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).post('/api/billing/usage').send({ listCount: 5 }).expect(200);

      expect(response.body.success).toBe(true);

      // Verify it was recorded
      const snapshot = db.prepare('SELECT * FROM usage_snapshot WHERE user_id = ?').get('user-1') as any;
      expect(snapshot.list_count).toBe(5);
    });

    it('should reject invalid listCount', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      // Test negative number
      await request(app).post('/api/billing/usage').send({ listCount: -1 }).expect(400);

      // Test non-number
      await request(app).post('/api/billing/usage').send({ listCount: 'five' }).expect(400);

      // Test too large
      await request(app).post('/api/billing/usage').send({ listCount: 10001 }).expect(400);
    });

    it('should accept zero listCount', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).post('/api/billing/usage').send({ listCount: 0 }).expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should accept maximum valid listCount', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).post('/api/billing/usage').send({ listCount: 10000 }).expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/billing/checkout (Stripe disabled)', () => {
    it('should return 503 when Stripe is not configured', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(503);

      expect(response.body.error).toBe('Billing is not configured');
    });
  });

  describe('POST /api/billing/portal (Stripe disabled)', () => {
    it('should return 503 when Stripe is not configured', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/portal').expect(503);

      expect(response.body.error).toBe('Billing is not configured');
    });
  });
});

describe('Billing Routes (Stripe enabled)', () => {
  beforeEach(() => {
    db = initTestDb();
    app = setupTestApp();
    vi.clearAllMocks();
    stripeEnabled = true;
    billingLimiter.clear(); // Reset rate limiter between tests
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/billing/checkout', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });

    it('should return 400 for invalid tier', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      // Invalid tier
      await request(app).post('/api/billing/checkout').send({ tierSlug: 'invalid' }).expect(400);

      // Free tier
      await request(app).post('/api/billing/checkout').send({ tierSlug: 'free' }).expect(400);

      // Enterprise tier
      await request(app).post('/api/billing/checkout').send({ tierSlug: 'enterprise' }).expect(400);

      // Missing tier
      await request(app).post('/api/billing/checkout').send({}).expect(400);
    });

    it('should create checkout session for plus tier', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createCheckoutSession).mockResolvedValue('https://checkout.stripe.com/session123');

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(200);

      expect(response.body.url).toBe('https://checkout.stripe.com/session123');
      expect(createCheckoutSession).toHaveBeenCalledWith(
        db,
        'user-1',
        'test@example.com',
        'plus',
        expect.stringContaining('/billing/success'),
        expect.stringContaining('/billing/cancel')
      );
    });

    it('should create checkout session for premium tier', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createCheckoutSession).mockResolvedValue('https://checkout.stripe.com/premium');

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'premium' }).expect(200);

      expect(response.body.url).toBe('https://checkout.stripe.com/premium');
      expect(createCheckoutSession).toHaveBeenCalledWith(
        db,
        'user-1',
        'test@example.com',
        'premium',
        expect.any(String),
        expect.any(String)
      );
    });

    it('should return 500 if checkout session creation fails', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createCheckoutSession).mockResolvedValue(null);

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(500);

      expect(response.body.error).toBe('Failed to create checkout session');
    });

    it('should return 500 if checkout session throws', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createCheckoutSession).mockRejectedValue(new Error('Stripe error'));

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(500);

      expect(response.body.error).toBe('Failed to create checkout session');
    });
  });

  describe('POST /api/billing/portal', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/portal').expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });

    it('should create portal session', async () => {
      createTestUser('user-1');
      createSubscription('user-1', 'plus', 'active', 'cus_123');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createPortalSession).mockResolvedValue('https://billing.stripe.com/portal123');

      const response = await request(app).post('/api/billing/portal').expect(200);

      expect(response.body.url).toBe('https://billing.stripe.com/portal123');
      expect(createPortalSession).toHaveBeenCalledWith(db, 'user-1', expect.stringContaining('/settings'));
    });

    it('should return 500 if portal session creation fails', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createPortalSession).mockResolvedValue(null);

      const response = await request(app).post('/api/billing/portal').expect(500);

      expect(response.body.error).toBe('Failed to create portal session');
    });

    it('should return 500 if portal session throws', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      vi.mocked(createPortalSession).mockRejectedValue(new Error('User has no Stripe customer'));

      const response = await request(app).post('/api/billing/portal').expect(500);

      expect(response.body.error).toBe('Failed to create portal session');
    });
  });
});

describe('Stripe Webhook', () => {
  beforeEach(() => {
    db = initTestDb();
    app = express();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('should not setup webhook when secret is not configured', () => {
    const originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupStripeWebhook(app, db);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('STRIPE_WEBHOOK_SECRET not set'));

    consoleSpy.mockRestore();
    if (originalEnv) {
      process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
    }
  });

  describe('with webhook configured', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

      // Create test user and subscription
      createTestUser('user-1', 'test@example.com');
      createSubscription('user-1', 'free', 'beta', 'cus_123', null);

      setupStripeWebhook(app, db);
    });

    afterEach(() => {
      if (originalEnv) {
        process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
      } else {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      }
    });

    it('should reject request without signature', async () => {
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'test' }))
        .expect(400);

      expect(response.text).toContain('Missing signature');
    });

    it('should reject request with invalid signature', async () => {
      vi.mocked(stripe!.webhooks.constructEvent).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'invalid_sig')
        .send(JSON.stringify({ type: 'test' }))
        .expect(400);

      expect(response.body.error).toBe('webhook_error');
      expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should handle checkout.session.completed event', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId: 'user-1', tierSlug: 'plus' },
            subscription: 'sub_123',
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);
      vi.mocked(stripe!.subscriptions.retrieve).mockResolvedValue({
        current_period_end: 1735689600,
      } as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify subscription was updated
      const sub = db.prepare('SELECT * FROM user_subscription WHERE user_id = ?').get('user-1') as any;
      expect(sub.tier_slug).toBe('plus');
      expect(sub.stripe_subscription_id).toBe('sub_123');
      expect(sub.status).toBe('active');
    });

    it('should handle customer.subscription.updated event', async () => {
      // First give user a subscription
      db.prepare('UPDATE user_subscription SET stripe_subscription_id = ?, tier_slug = ? WHERE user_id = ?').run(
        'sub_456',
        'plus',
        'user-1'
      );

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_456',
            metadata: { tierSlug: 'premium' },
            status: 'active',
            current_period_end: 1735689600,
            cancel_at_period_end: true,
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify subscription was updated
      const sub = db.prepare('SELECT * FROM user_subscription WHERE user_id = ?').get('user-1') as any;
      expect(sub.tier_slug).toBe('premium');
      expect(sub.cancel_at_period_end).toBe(1);
    });

    it('should handle customer.subscription.updated with past_due status', async () => {
      db.prepare('UPDATE user_subscription SET stripe_subscription_id = ? WHERE user_id = ?').run('sub_789', 'user-1');

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_789',
            status: 'past_due',
            current_period_end: 1735689600,
            cancel_at_period_end: false,
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      const sub = db.prepare('SELECT * FROM user_subscription WHERE user_id = ?').get('user-1') as any;
      expect(sub.status).toBe('past_due');
    });

    it('should handle customer.subscription.deleted event', async () => {
      // Give user a paid subscription
      db.prepare('UPDATE user_subscription SET stripe_subscription_id = ?, tier_slug = ?, status = ? WHERE user_id = ?').run(
        'sub_delete',
        'plus',
        'active',
        'user-1'
      );

      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_delete',
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);

      // Verify downgraded to free
      const sub = db.prepare('SELECT * FROM user_subscription WHERE user_id = ?').get('user-1') as any;
      expect(sub.tier_slug).toBe('free');
      expect(sub.stripe_subscription_id).toBeNull();
      expect(sub.status).toBe('active');
    });

    it('should handle invoice.payment_failed event', async () => {
      db.prepare('UPDATE user_subscription SET stripe_subscription_id = ?, status = ? WHERE user_id = ?').run(
        'sub_fail',
        'active',
        'user-1'
      );

      const event = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            subscription: 'sub_fail',
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      const sub = db.prepare('SELECT * FROM user_subscription WHERE user_id = ?').get('user-1') as any;
      expect(sub.status).toBe('past_due');
    });

    it('should handle unrecognized event types gracefully', async () => {
      const event = {
        type: 'some.unknown.event',
        data: { object: {} },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled event type'));

      consoleSpy.mockRestore();
    });

    it('should handle checkout with missing metadata gracefully', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: {},
            subscription: 'sub_no_meta',
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      // Should not throw
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should handle invoice.payment_failed without subscription', async () => {
      const event = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            // No subscription field
          },
        },
      };

      vi.mocked(stripe!.webhooks.constructEvent).mockReturnValue(event as any);

      // Should not throw
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'valid_sig')
        .send(JSON.stringify(event))
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });
});
