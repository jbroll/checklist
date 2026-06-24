import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureAuthTables } from '../src/migrate-auth.js';

describe('ensureAuthTables', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  const tableNames = () =>
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (t) => t.name,
    );

  const columns = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  it('creates the better-auth core tables on an empty database', () => {
    ensureAuthTables(db);
    const names = tableNames();
    for (const t of ['user', 'session', 'account', 'verification']) {
      expect(names).toContain(t);
    }
  });

  it('adds the Jazz plugin columns to the user table', () => {
    ensureAuthTables(db);
    expect(columns('user')).toEqual(expect.arrayContaining(['accountID', 'encryptedCredentials']));
  });

  it('is idempotent (safe to run twice)', () => {
    ensureAuthTables(db);
    expect(() => ensureAuthTables(db)).not.toThrow();
    expect(tableNames()).toContain('verification');
  });

  it('backfills missing columns on a legacy user table', () => {
    db.exec(`CREATE TABLE "user" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL UNIQUE,
      "emailVerified" INTEGER NOT NULL,
      "createdAt" DATE NOT NULL,
      "updatedAt" DATE NOT NULL
    );`);
    ensureAuthTables(db);
    expect(columns('user')).toEqual(expect.arrayContaining(['accountID', 'encryptedCredentials']));
  });
});
