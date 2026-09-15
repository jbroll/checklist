import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { parse } from 'dotenv';
import type { Account } from 'jazz-tools';
import { startWorker } from 'jazz-tools/worker';
import { decryptCredentials } from './credentials.js';
import type { Manifest, ManifestUser, UsersFile } from './format.js';
import { loadTree } from './load.js';
import { countFolders } from './serialize.js';

const USAGE = 'Usage: npm run export -- --backup-dir <dir> --secrets <backend/secrets.env>';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function writePrivate(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function tableExists(db: Database.Database, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function allRows(db: Database.Database, name: string): Record<string, unknown>[] {
  if (!tableExists(db, name)) return [];
  return db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { 'backup-dir': { type: 'string' }, secrets: { type: 'string' } },
  });
  const dir = values['backup-dir'];
  const secretsPath = values.secrets;
  if (!dir || !secretsPath) fail(USAGE);

  const authDbPath = join(dir, 'auth.db');
  const jazzEnvPath = join(dir, 'jazz.env');
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(authDbPath)) fail(`missing ${authDbPath}`);
  if (!existsSync(jazzEnvPath)) fail(`missing ${jazzEnvPath}`);
  chmodSync(dir, 0o700);
  if (existsSync(manifestPath)) fail(`${manifestPath} already exists; refusing to overwrite an export`);

  if (!existsSync(secretsPath)) fail(`missing ${secretsPath}`);
  const secret = parse(readFileSync(secretsPath)).BETTER_AUTH_SECRET;
  if (!secret) fail(`BETTER_AUTH_SECRET not set in ${secretsPath}`);

  const jazzEnv = parse(readFileSync(jazzEnvPath));
  const peer = jazzEnv.JAZZ_PEER;
  if (!peer) fail(`JAZZ_PEER not set in ${jazzEnvPath}`);
  const apiKey = jazzEnv.JAZZ_API_KEY || jazzEnv.VITE_JAZZ_API_KEY;
  const syncServer = apiKey ? `${peer}/?key=${apiKey}` : peer;

  const db = new Database(authDbPath, { readonly: true, fileMustExist: true });
  const usersFile: UsersFile = {
    user: allRows(db, 'user'),
    account: allRows(db, 'account'),
    verification: allRows(db, 'verification'),
  };
  const shareInvites = tableExists(db, 'share_invites')
    ? (db.prepare('SELECT COUNT(*) AS n FROM share_invites').get() as { n: number }).n
    : 0;
  db.close();

  const users: ManifestUser[] = [];
  const failed: Manifest['failed'] = [];

  for (const row of usersFile.user) {
    const userId = String(row.id);
    const encrypted = row.encryptedCredentials;
    if (typeof encrypted !== 'string' || encrypted === '') {
      failed.push({ userId, error: 'no encryptedCredentials' });
      continue;
    }
    try {
      const creds = await decryptCredentials(encrypted, secret);
      const started = await startWorker({
        accountID: creds.accountID,
        accountSecret: creds.accountSecret,
        syncServer,
        skipInboxLoad: true,
      });
      try {
        const exported = await loadTree(started.worker as unknown as Account, userId);
        writePrivate(join(dir, `${userId}.json`), exported);
        users.push({ userId, accountId: exported.accountId, ...countFolders(exported.folders) });
      } finally {
        await started.shutdownWorker();
      }
    } catch (err) {
      failed.push({ userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  writePrivate(join(dir, 'users.json'), usersFile);
  const manifest: Manifest = { exportedAt: new Date().toISOString(), shareInvites, users, failed };
  writePrivate(manifestPath, manifest);

  for (const u of users) console.log(`${u.userId} folders=${u.folders} items=${u.items} sessions=${u.sessions}`);
  console.log(`failed=${failed.length}`);
  for (const f of failed) console.log(`${f.userId} ${f.error}`);
  return failed.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => fail(err instanceof Error ? err.message : String(err)),
);
