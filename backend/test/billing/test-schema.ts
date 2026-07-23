import Database from 'better-sqlite3';

/**
 * Build a fresh in-memory billing database with the schema and default tiers
 * the billing route/webhook tests exercise. Each caller owns the returned handle.
 */
export function initTestDb(): Database.Database {
  const db = new Database(':memory:');

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

  // Create processed webhook events table (for idempotency)
  db.exec(`
    CREATE TABLE processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL
    )
  `);

  return db;
}
