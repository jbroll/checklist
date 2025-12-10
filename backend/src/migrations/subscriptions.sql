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
INSERT OR IGNORE INTO subscription_tier (slug, name, price_cents, max_lists, session_retention_days, stripe_price_id) VALUES
  ('free', 'Free', 0, 5, 30, NULL),
  ('premium', 'Premium', 999, 50, 365, NULL),
  ('team', 'Team', 1999, 250, 1825, NULL),
  ('enterprise', 'Enterprise', 0, -1, -1, NULL);

-- Update existing tiers if limits changed
UPDATE subscription_tier SET max_lists = 50 WHERE slug = 'premium';
UPDATE subscription_tier SET max_lists = 250, session_retention_days = 1825, price_cents = 1999 WHERE slug = 'team';

-- User subscriptions (links user to their current tier)
CREATE TABLE IF NOT EXISTS user_subscription (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  tier_slug TEXT NOT NULL DEFAULT 'free' REFERENCES subscription_tier(slug),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'past_due', 'cancelled', 'trialing')),
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

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
