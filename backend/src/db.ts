import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database with custom tables
export function initDb(sqliteDb: Database.Database) {
  // Sharing table
  const sharesSql = readFileSync(join(__dirname, 'migrations/shares.sql'), 'utf-8');
  sqliteDb.exec(sharesSql);

  // Verified emails tables
  const verifiedEmailsSql = readFileSync(join(__dirname, 'migrations/verified-emails.sql'), 'utf-8');
  sqliteDb.exec(verifiedEmailsSql);

  // Subscription tables
  const subscriptionsSql = readFileSync(join(__dirname, 'migrations/subscriptions.sql'), 'utf-8');
  sqliteDb.exec(subscriptionsSql);

  // Run schema alignment migration (renames old column names to jbr-jazz format)
  // This is safe to run on fresh installs - errors are ignored when columns don't exist
  try {
    const alignmentSql = readFileSync(join(__dirname, 'migrations/billing-schema-alignment.sql'), 'utf-8');
    sqliteDb.exec(alignmentSql);
    console.log('[db] Billing schema alignment migration applied');
  } catch {
    // Migration already applied or fresh install with new column names
  }

  // Sync Stripe price IDs from environment variables to database
  // This allows the database to be the single source of truth for tier configuration
  syncStripePriceIds(sqliteDb);

  return sqliteDb;
}

// Sync Stripe price IDs from env vars to database
function syncStripePriceIds(db: Database.Database) {
  const updatePriceId = db.prepare(
    'UPDATE subscription_tier SET stripe_price_id = ? WHERE slug = ?'
  );

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
