import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Share Invites Table
 */
export interface ShareInvite {
  id: number;
  token: string;
  owner_id: string;
  owner_email: string;
  recipient_identifier: string;
  folder_id: string;
  permission_level: 'view' | 'edit' | 'admin';
  expires_at: number | null;
  created_at: number;
  accepted_at: number | null;
  accepted_by_user_id: string | null;
  accepted_by_oauth_sub: string | null;
  accepted_by_oauth_provider: string | null;
  revoked_at: number | null;
}

/**
 * Share Audit Log Table
 */
export interface ShareAuditLog {
  id: number;
  action: string;
  actor_id: string;
  target_user_id: string | null;
  folder_id: string;
  metadata: string | null;
  created_at: number;
}

/**
 * Folder Ownership Table
 */
export interface FolderOwnership {
  folder_id: string;
  owner_user_id: string;
  created_at: number;
}

/**
 * Database Schema Interface
 */
export interface DatabaseSchema {
  share_invites: ShareInvite;
  share_audit_log: ShareAuditLog;
  folder_ownership: FolderOwnership;
}

/**
 * Initialize database with migrations
 */
function initializeDatabase(sqliteDb: Database.Database) {
  // Run migration
  const migrationPath = join(__dirname, 'migrations', '001_sharing_tables.sql');
  const migration = readFileSync(migrationPath, 'utf-8');

  // Execute migration
  sqliteDb.exec(migration);

  console.log('✅ Database migrations applied');
}

/**
 * Create Kysely database instance
 */
export function createDatabase(sqliteDb: Database.Database): Kysely<DatabaseSchema> {
  // Run migrations
  initializeDatabase(sqliteDb);

  // Create Kysely instance
  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: sqliteDb,
    }),
  });

  return db;
}
