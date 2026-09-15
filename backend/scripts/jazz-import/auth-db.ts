import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import type { UsersFile } from '../../../migration/jazz-export/src/format.js';
import { createServer } from '../../src/index.js';
import type { Target } from './target-config.js';

export interface AuthDbResult {
  users: number;
  accounts: number;
  verifications: number;
  jwksKeyId: string;
}

const EXCLUDED_KEYS = new Set(['accountID', 'encryptedCredentials']);

// Inserts one Jazz-export table's rows into `db`, keeping only keys that are real destination
// columns (drops Jazz-only fields like accountID/encryptedCredentials) so a schema drift between
// export and target shows up as a missing column, not a silently dropped value.
function insertRows(
  db: import('better-sqlite3').Database,
  table: string,
  rows: Record<string, unknown>[],
): number {
  if (rows.length === 0) return 0;
  const destColumns = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
  );

  let count = 0;
  for (const row of rows) {
    if (!row.id) {
      throw new Error(`${table} row missing id`);
    }
    const keys = Object.keys(row).filter((k) => destColumns.has(k) && !EXCLUDED_KEYS.has(k));
    const columns = keys.join(', ');
    const placeholders = keys.map((k) => `@${k}`).join(', ');
    db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`).run(row);
    count += 1;
  }
  return count;
}

// Builds a fresh rowboat-era auth DB at `outPath` from a Jazz-export users.json, using the
// backend's own createServer so the schema and JWT signing key are the real ones — a hand-rolled
// schema could drift from what the server actually serves. The copied scrypt hashes are opaque to
// this code; they simply carry over as the `password` column value.
export async function buildAuthDb(
  outPath: string,
  target: Target,
  users: UsersFile,
): Promise<AuthDbResult> {
  if (existsSync(outPath)) {
    throw new Error(`${outPath} already exists`);
  }

  // Create the file at 0o600 up front so the copied password hashes are never briefly readable
  // under createServer's default (usually 0o644) file mode.
  writeFileSync(outPath, '', { mode: 0o600 });

  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    server = await createServer({ ...target.config, dbPath: outPath });
    const db = server.db;

    const counts = db.transaction(() => {
      const userCount = insertRows(db, 'user', users.user);
      const accountCount = insertRows(db, 'account', users.account);
      const verificationCount = insertRows(db, 'verification', users.verification);
      return { userCount, accountCount, verificationCount };
    })();

    // Ensures a jwks row exists before we read its kid; the probe subject is never persisted
    // anywhere but the JWT itself.
    await server.signJWT((users.user[0]?.id as string | undefined) ?? 'import-key-probe');
    const jwksKeyId = (db.prepare('SELECT id FROM jwks').get() as { id: string }).id;

    db.close();
    chmodSync(outPath, 0o600);

    return {
      users: counts.userCount,
      accounts: counts.accountCount,
      verifications: counts.verificationCount,
      jwksKeyId,
    };
  } catch (err) {
    // Any failure past this point — a bad row, a signJWT error — must not leave a half-built db
    // behind: buildAuthDb refuses an existing outPath, so a leftover file would block every retry,
    // and one left after the insert transaction commits but before signJWT would hold real copied
    // password hashes with no jwks row to authenticate against.
    server?.db.close();
    for (const path of [outPath, `${outPath}-wal`, `${outPath}-shm`]) {
      if (existsSync(path)) rmSync(path);
    }
    throw err;
  }
}
