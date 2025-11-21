#!/usr/bin/env node
/**
 * BetterAuth Database Migration
 * Ensures all required tables exist in the database
 * Run this before starting the backend server
 */

import { sqliteDb } from './auth.js';

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

  // Create tables using BetterAuth's schema
  // These are the standard BetterAuth table definitions

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      name TEXT,
      image TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      accountID TEXT
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      expiresAt INTEGER,
      scope TEXT,
      password TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  console.log('[migrate-auth] ✓ Tables created successfully');
} else {
  console.log('[migrate-auth] ✓ All tables exist');
}

console.log('[migrate-auth] Migration complete');
process.exit(0);
