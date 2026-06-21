#!/usr/bin/env node
/**
 * BetterAuth Database Migration
 * Ensures all required tables exist in the database
 * Run this before starting the backend server
 */

import Database from 'better-sqlite3';
const dbPath = process.env.AUTH_DB_PATH || (process.env.NODE_ENV === 'production' ? './data/auth.db' : './auth.db');
const sqliteDb = new Database(dbPath);

console.log('[migrate-auth] Checking BetterAuth tables...');

// Check if tables exist
const tables = sqliteDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all() as { name: string }[];

const tableNames = tables.map(t => t.name);
const requiredTables = ['user', 'session', 'account', 'verification'];
const missingTables = requiredTables.filter(t => !tableNames.includes(t));

if (missingTables.length > 0) {
  console.log(`[migrate-auth] Missing tables: ${missingTables.join(', ')}`);
  console.log('[migrate-auth] Creating BetterAuth tables...');

  // Create tables using BetterAuth's schema + Jazz plugin columns
  // Schema matches what BetterAuth actually creates

  sqliteDb.exec(`
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

  console.log('[migrate-auth] ✓ Tables created successfully');
} else {
  console.log('[migrate-auth] ✓ All tables exist');
}

// Check for Jazz plugin columns (added by jazz-tools/better-auth)
const userColumns = sqliteDb
  .prepare("PRAGMA table_info(user)")
  .all() as { name: string }[];
const userColumnNames = userColumns.map(c => c.name);

if (!userColumnNames.includes('encryptedCredentials')) {
  console.log('[migrate-auth] Adding user.encryptedCredentials column...');
  sqliteDb.exec('ALTER TABLE user ADD COLUMN encryptedCredentials TEXT');
}
if (!userColumnNames.includes('accountID')) {
  console.log('[migrate-auth] Adding user.accountID column...');
  sqliteDb.exec('ALTER TABLE user ADD COLUMN accountID TEXT');
}

// Check for session.token column (required by BetterAuth)
const sessionColumns = sqliteDb
  .prepare("PRAGMA table_info(session)")
  .all() as { name: string }[];
const sessionColumnNames = sessionColumns.map(c => c.name);

if (!sessionColumnNames.includes('token')) {
  console.log('[migrate-auth] Adding session.token column...');
  sqliteDb.exec('ALTER TABLE session ADD COLUMN token TEXT');
}

// Check for account columns (required by BetterAuth)
const accountColumns = sqliteDb
  .prepare("PRAGMA table_info(account)")
  .all() as { name: string }[];
const accountColumnNames = accountColumns.map(c => c.name);

if (!accountColumnNames.includes('idToken')) {
  console.log('[migrate-auth] Adding account.idToken column...');
  sqliteDb.exec('ALTER TABLE account ADD COLUMN idToken TEXT');
}
if (!accountColumnNames.includes('accessTokenExpiresAt')) {
  console.log('[migrate-auth] Adding account.accessTokenExpiresAt column...');
  sqliteDb.exec('ALTER TABLE account ADD COLUMN accessTokenExpiresAt DATE');
}
if (!accountColumnNames.includes('refreshTokenExpiresAt')) {
  console.log('[migrate-auth] Adding account.refreshTokenExpiresAt column...');
  sqliteDb.exec('ALTER TABLE account ADD COLUMN refreshTokenExpiresAt DATE');
}

console.log('[migrate-auth] Migration complete');
process.exit(0);
