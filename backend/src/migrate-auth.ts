#!/usr/bin/env node
/**
 * BetterAuth Database Migration
 *
 * Ensures all required BetterAuth tables (+ two legacy columns, `accountID` and
 * `encryptedCredentials`, kept for the account this app was originally built on) exist.
 * Nothing else creates these, so we own the schema. This runs on server boot from
 * index.ts (the systemd unit launches dist/index.js directly and is regenerated from a
 * deploy template, so a migrate step in the unit would not survive a deploy). Also
 * runnable as a CLI: `node dist/migrate-auth.js`.
 */

import Database from 'better-sqlite3';

/**
 * Create the BetterAuth core tables and backfill the legacy columns if missing.
 * Idempotent: every statement is guarded so repeated calls are safe.
 */
export function ensureAuthTables(db: Database.Database): void {
  const tableNames = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  ).map((t) => t.name);

  const requiredTables = ['user', 'session', 'account', 'verification'];
  const missingTables = requiredTables.filter((t) => !tableNames.includes(t));

  if (missingTables.length > 0) {
    console.log(`[migrate-auth] Creating BetterAuth tables: ${missingTables.join(', ')}`);
    // Schema matches what BetterAuth creates + the two legacy columns (see header comment).
    db.exec(`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" INTEGER NOT NULL,
        "image" TEXT,
        "createdAt" DATE NOT NULL,
        "updatedAt" DATE NOT NULL,
        "accountID" TEXT,
        "encryptedCredentials" TEXT
      );

      CREATE TABLE IF NOT EXISTS "session" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "expiresAt" DATE NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "createdAt" DATE NOT NULL,
        "updatedAt" DATE NOT NULL,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS "account" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" DATE,
        "refreshTokenExpiresAt" DATE,
        "scope" TEXT,
        "password" TEXT,
        "createdAt" DATE NOT NULL,
        "updatedAt" DATE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "verification" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "identifier" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "expiresAt" DATE NOT NULL,
        "createdAt" DATE NOT NULL,
        "updatedAt" DATE NOT NULL
      );
    `);
  }

  // Backfill columns on pre-existing (legacy) tables.
  const ensureColumn = (table: string, column: string, ddlType: string) => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    if (!cols.includes(column)) {
      console.log(`[migrate-auth] Adding ${table}.${column} column`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
    }
  };

  ensureColumn('user', 'encryptedCredentials', 'TEXT');
  ensureColumn('user', 'accountID', 'TEXT');
  ensureColumn('session', 'token', 'TEXT');
  ensureColumn('account', 'idToken', 'TEXT');
  ensureColumn('account', 'accessTokenExpiresAt', 'DATE');
  ensureColumn('account', 'refreshTokenExpiresAt', 'DATE');
}

// CLI entry: only when executed directly (node dist/migrate-auth.js), not on import.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const dbPath =
    process.env.AUTH_DB_PATH ||
    (process.env.NODE_ENV === 'production' ? './data/auth.db' : './auth.db');
  const db = new Database(dbPath);
  console.log('[migrate-auth] Checking BetterAuth tables...');
  ensureAuthTables(db);
  db.close();
  console.log('[migrate-auth] Migration complete');
  process.exit(0);
}
