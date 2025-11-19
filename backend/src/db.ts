import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database with sharing table
export function initDb(sqliteDb: Database.Database) {
  const sql = readFileSync(join(__dirname, 'migrations/shares.sql'), 'utf-8');
  sqliteDb.exec(sql);
  return sqliteDb;
}
