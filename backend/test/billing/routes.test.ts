import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { setupBillingRoutes, setupStripeWebhook } from '../../src/billing/routes.js';

// Mock Stripe module
vi.mock('../../src/billing/stripe.js', () => ({
  stripe: null,
  isStripeEnabled: () => false,
}));

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

  return db;
}

// Helper to create a test user
function createTestUser(id: string, email = 'test@example.com') {
  db.prepare('INSERT INTO user (id, email, name) VALUES (?, ?, ?)').run(id, email, 'Test User');
}

// Helper to create subscription for user
function createSubscription(userId: string, tierSlug = 'free', status = 'beta') {
  db.prepare(`
    INSERT INTO user_subscription (user_id, tier_slug, status)
    VALUES (?, ?, ?)
  `).run(userId, tierSlug, status);
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

  describe('POST /api/billing/checkout', () => {
    it('should return 503 when Stripe is not configured (checked before auth)', async () => {
      // Note: Stripe check happens before auth check in the route
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(503);

      expect(response.body.error).toBe('Billing is not configured');
    });

    it('should return 503 for any request when Stripe not configured', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).post('/api/billing/checkout').send({ tierSlug: 'plus' }).expect(503);

      expect(response.body.error).toBe('Billing is not configured');
    });
  });

  describe('POST /api/billing/portal', () => {
    it('should return 503 when Stripe is not configured (checked before auth)', async () => {
      // Note: Stripe check happens before auth check in the route
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await request(app).post('/api/billing/portal').expect(503);

      expect(response.body.error).toBe('Billing is not configured');
    });

    it('should return 503 for any request when Stripe not configured', async () => {
      createTestUser('user-1');
      createSubscription('user-1');

      mockAuth.api.getSession.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      });

      const response = await request(app).post('/api/billing/portal').expect(503);

      expect(response.body.error).toBe('Billing is not configured');
    });
  });
});

describe('Stripe Webhook', () => {
  beforeEach(() => {
    db = initTestDb();
    app = express();
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
});
