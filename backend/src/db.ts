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

  return sqliteDb;
}
