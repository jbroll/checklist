import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Initialize checklist-specific billing tables (subscription_tier,
 * user_subscription, usage_snapshot) and sync Stripe price IDs.
 * Sharing + verified-email tables are owned by @jbroll/rowboat-auth-betterauth and
 * @jbroll/rowboat-sharing.
 */
export function initBillingDb(db: Database.Database): Database.Database {
  const subscriptionsSql = readFileSync(join(__dirname, 'migrations/subscriptions.sql'), 'utf-8');
  db.exec(subscriptionsSql);
  syncStripePriceIds(db);
  return db;
}

function syncStripePriceIds(db: Database.Database) {
  const updatePriceId = db.prepare('UPDATE subscription_tier SET stripe_price_id = ? WHERE slug = ?');
  const plusPriceId = process.env.STRIPE_PRICE_PLUS;
  const premiumPriceId = process.env.STRIPE_PRICE_PREMIUM;
  if (plusPriceId) {
    updatePriceId.run(plusPriceId, 'plus');
    console.log('[db] Synced Stripe price ID for plus tier');
  }
  if (premiumPriceId) {
    updatePriceId.run(premiumPriceId, 'premium');
    console.log('[db] Synced Stripe price ID for premium tier');
  }
}
