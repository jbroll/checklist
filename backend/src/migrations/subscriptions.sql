-- Subscription tier reference data
CREATE TABLE IF NOT EXISTS subscription_tier (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  max_lists INTEGER NOT NULL,
  session_retention_days INTEGER NOT NULL,
  stripe_price_id TEXT
);

-- Insert default tiers (use INSERT OR IGNORE to avoid duplicates on restart)
-- Tier names: free -> plus -> premium -> enterprise
INSERT OR IGNORE INTO subscription_tier (slug, name, price_cents, max_lists, session_retention_days, stripe_price_id) VALUES
  ('free', 'Free', 0, 3, 7, NULL),
  ('plus', 'Plus', 999, 30, 30, NULL),
  ('premium', 'Premium', 1999, 300, 365, NULL),
  ('enterprise', 'Enterprise', 0, -1, -1, NULL);

-- Update existing tiers if limits changed
UPDATE subscription_tier SET max_lists = 3, session_retention_days = 7 WHERE slug = 'free';
UPDATE subscription_tier SET name = 'Plus', max_lists = 30, session_retention_days = 30, price_cents = 999 WHERE slug = 'plus';
UPDATE subscription_tier SET name = 'Premium', max_lists = 300, session_retention_days = 365, price_cents = 1999 WHERE slug = 'premium';

-- User subscriptions (links user to their current tier)
-- Note: status includes 'beta' for beta testing period (gives Plus tier limits)
CREATE TABLE IF NOT EXISTS user_subscription (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  tier_slug TEXT NOT NULL DEFAULT 'free' REFERENCES subscription_tier(slug),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'beta' CHECK(status IN ('active', 'past_due', 'cancelled', 'trialing', 'beta')),
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Migration: rename old 'team' tier to 'premium' for existing users (must run after table exists)
UPDATE user_subscription SET tier_slug = 'premium' WHERE tier_slug = 'team';
DELETE FROM subscription_tier WHERE slug = 'team';

-- Set all existing users to beta status during beta period
UPDATE user_subscription SET status = 'beta' WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscription_status ON user_subscription(status);
CREATE INDEX IF NOT EXISTS idx_subscription_stripe_customer ON user_subscription(stripe_customer_id);

-- Usage snapshots for analytics
CREATE TABLE IF NOT EXISTS usage_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  list_count INTEGER NOT NULL,
  recorded_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_snapshot(user_id, recorded_at);

-- Processed webhook events for idempotency (prevents duplicate processing)
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);

-- Clean up old processed events (keep last 7 days)
DELETE FROM processed_webhook_events WHERE processed_at < datetime('now', '-7 days');

-- Rate limits table for persistent storage across server restarts
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- Clean up expired rate limits
DELETE FROM rate_limits WHERE reset_at < unixepoch();
