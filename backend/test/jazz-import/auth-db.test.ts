import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { UsersFile } from '../../../migration/jazz-export/src/format.js';
import { createServer, type RowboatServer } from '../../src/index.js';
import { buildAuthDb } from '../../scripts/jazz-import/auth-db.js';
import { loadTarget } from '../../scripts/jazz-import/target-config.js';

const FRONTEND = 'https://checklist-test.example';

function writeEnv(dir: string): string {
  const env = join(dir, 'secrets.env');
  writeFileSync(
    env,
    `BETTER_AUTH_SECRET=s3cret-s3cret-s3cret-s3cret\nFRONTEND_URL=${FRONTEND}\nROWBOAT_DATABASE_ID=db_abc\nROWBOAT_URL=https://rowboat.example\n`,
  );
  return env;
}

let server: RowboatServer | undefined;

afterEach(() => {
  server?.db.close();
  server = undefined;
});

describe('buildAuthDb', () => {
  it('copies user/account/verification rows into a fresh auth DB, dropping session state and secrets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-db-'));
    const envFile = writeEnv(dir);
    const sourcePath = join(dir, 'source.db');
    const target = loadTarget(envFile, sourcePath);

    // Simulate prod: a real signed-up user on a source DB built through createServer, with
    // verification disabled so sign-up completes without an email round trip.
    server = await createServer({
      ...target.config,
      emailAuth: { enabled: true, requireEmailVerification: false, minPasswordLength: 8, maxPasswordLength: 128 },
    });
    const email = 'owner@example.com';
    const password = 'password1234';
    const signUpRes = await request(server.app)
      .post('/api/auth/sign-up/email')
      .set('origin', FRONTEND)
      .send({ name: 'Owner', email, password });
    expect(signUpRes.status).toBe(200);
    const sourceUserId = (signUpRes.body as { user: { id: string } }).user.id;

    const userRow = server.db.prepare('SELECT * FROM user WHERE id = ?').get(sourceUserId) as Record<
      string,
      unknown
    >;
    const accountRow = server.db.prepare('SELECT * FROM account WHERE userId = ?').get(sourceUserId) as Record<
      string,
      unknown
    >;
    const verificationRows = server.db.prepare('SELECT * FROM verification').all() as Record<string, unknown>[];
    // Sign-up creates a session on the source; buildAuthDb must not carry it forward.
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM session').get()).toEqual({ n: 1 });
    server.db.close();
    server = undefined;

    const usersFile: UsersFile = {
      user: [{ ...userRow, accountID: 'co_zOwner', encryptedCredentials: 'deadbeef' }],
      account: [accountRow],
      verification: verificationRows,
    };

    const out = join(dir, 'imported.db');
    const result = await buildAuthDb(out, loadTarget(envFile, out), usersFile);
    expect(result).toMatchObject({ users: 1, accounts: 1 });

    const db = new Database(out, { readonly: true });
    const cols = (db.prepare('PRAGMA table_info(user)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).not.toContain('encryptedCredentials');
    expect(cols).not.toContain('accountID');
    expect(db.prepare('SELECT COUNT(*) AS n FROM session').get()).toEqual({ n: 0 });
    const row = db.prepare('SELECT id, emailVerified FROM user').get() as { id: string; emailVerified: unknown };
    expect(row.id).toBe(sourceUserId);
    const kid = (db.prepare('SELECT id FROM jwks').get() as { id: string }).id;
    expect(result.jwksKeyId).toBe(kid);
    db.close();

    // The copied scrypt hash verifies on a server started from the imported file.
    server = await createServer({
      ...loadTarget(envFile, out).config,
      emailAuth: { enabled: true, requireEmailVerification: false, minPasswordLength: 8, maxPasswordLength: 128 },
    });
    const signIn = await request(server.app)
      .post('/api/auth/sign-in/email')
      .set('origin', FRONTEND)
      .send({ email, password });
    expect(signIn.status).toBe(200);
    const jwks = await request(server.app).get('/api/auth/jwks');
    expect((jwks.body as { keys: { kid: string }[] }).keys.map((k) => k.kid)).toContain(kid);
  });

  it('rejects when the output path already exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-db-'));
    const envFile = writeEnv(dir);
    const out = join(dir, 'exists.db');
    writeFileSync(out, '');
    const usersFile: UsersFile = { user: [], account: [], verification: [] };
    await expect(buildAuthDb(out, loadTarget(envFile, out), usersFile)).rejects.toThrow('already exists');
  });
});
