import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if a column exists in a table
function columnExists(db: Database.Database, table: string, column: string): boolean {
  const result = db.prepare(
    `SELECT COUNT(*) as count FROM pragma_table_info(?) WHERE name = ?`
  ).get(table, column) as { count: number };
  return result.count > 0;
}

// Check if a table exists
function tableExists(db: Database.Database, table: string): boolean {
  const result = db.prepare(
    `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table) as { count: number };
  return result.count > 0;
}

// Run idempotent schema migrations
function runMigrations(db: Database.Database) {
  // share_invites: folder_covalue_id -> target_covalue_id
  if (tableExists(db, 'share_invites') && columnExists(db, 'share_invites', 'folder_covalue_id')) {
    console.log('[db] Migrating share_invites: folder_covalue_id -> target_covalue_id');
    db.exec(`
      BEGIN TRANSACTION;

      CREATE TABLE share_invites_new (
        token TEXT PRIMARY KEY,
        sender_email TEXT NOT NULL,
        sender_jazz_account_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        target_covalue_id TEXT NOT NULL,
        permission TEXT NOT NULL CHECK(permission IN ('reader', 'writer', 'admin')),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        accepted_at INTEGER
      );

      INSERT INTO share_invites_new (
        token, sender_email, sender_jazz_account_id, recipient_email,
        target_covalue_id, permission, expires_at, created_at, accepted_at
      )
      SELECT
        token, sender_email, sender_jazz_account_id, recipient_email,
        folder_covalue_id,
        CASE permission
          WHEN 'view' THEN 'reader'
          WHEN 'edit' THEN 'writer'
          ELSE permission
        END,
        expires_at, created_at, accepted_at
      FROM share_invites;

      DROP TABLE share_invites;
      ALTER TABLE share_invites_new RENAME TO share_invites;

      CREATE INDEX idx_share_invites_expires ON share_invites(expires_at);
      CREATE INDEX idx_share_invites_target ON share_invites(target_covalue_id);

      COMMIT;
    `);
  }

  // subscription_tier: max_lists -> max_items
  if (tableExists(db, 'subscription_tier') && columnExists(db, 'subscription_tier', 'max_lists')) {
    console.log('[db] Migrating subscription_tier: max_lists -> max_items');
    db.exec('ALTER TABLE subscription_tier RENAME COLUMN max_lists TO max_items');
  }

  // subscription_tier: session_retention_days -> retention_days
  if (tableExists(db, 'subscription_tier') && columnExists(db, 'subscription_tier', 'session_retention_days')) {
    console.log('[db] Migrating subscription_tier: session_retention_days -> retention_days');
    db.exec('ALTER TABLE subscription_tier RENAME COLUMN session_retention_days TO retention_days');
  }

  // usage_snapshot: list_count -> item_count
  if (tableExists(db, 'usage_snapshot') && columnExists(db, 'usage_snapshot', 'list_count')) {
    console.log('[db] Migrating usage_snapshot: list_count -> item_count');
    db.exec('ALTER TABLE usage_snapshot RENAME COLUMN list_count TO item_count');
  }
}

// Initialize database with custom tables
export function initDb(sqliteDb: Database.Database) {
  // Run idempotent migrations first (before CREATE TABLE statements)
  // This ensures column renames happen before we try to create indexes on new names
  runMigrations(sqliteDb);

  // Sharing table
  const sharesSql = readFileSync(join(__dirname, 'migrations/shares.sql'), 'utf-8');
  sqliteDb.exec(sharesSql);

  // Verified emails tables
  const verifiedEmailsSql = readFileSync(join(__dirname, 'migrations/verified-emails.sql'), 'utf-8');
  sqliteDb.exec(verifiedEmailsSql);

  // Subscription tables
  const subscriptionsSql = readFileSync(join(__dirname, 'migrations/subscriptions.sql'), 'utf-8');
  sqliteDb.exec(subscriptionsSql);

  // Sync Stripe price IDs from environment variables to database
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
