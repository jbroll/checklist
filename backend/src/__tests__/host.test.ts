// Supertest-verifies the rowboat host stood up in ../index.ts: sign-up/sign-in through the real
// better-auth routes, mint a folder scope group, push a `folder` row scoped to it, and confirm a
// scoped pull returns it to the owner but not to a second, unrelated user. Mirrors rowboat's
// packages/integration/src/identity-auth-boundary.test.ts stand-up pattern.
import { hexPack } from '@jbroll/rowboat-shared';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type RowboatServer, type ServerConfig } from '../index.js';

const AUTH_SECRET = 'test-secret-test-secret-test-secret';

function testConfig(): ServerConfig {
  return {
    port: 0,
    dbPath: ':memory:',
    frontendUrl: 'http://localhost:5173',
    baseUrl: 'http://localhost:5173',
    authSecret: AUTH_SECRET,
    appName: 'CheckList Test',
    trustedOrigins: ['http://localhost:5173'],
    providers: [],
    emailAuth: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
  };
}

let server: RowboatServer | undefined;

afterEach(() => {
  server?.db.close();
  server = undefined;
});

// supertest's `.agent()` persists Set-Cookie across calls, so each signed-up user gets its own
// cookie jar — exactly like a real browser session.
async function signUpAndSignIn(
  app: Express,
  email: string,
  password: string,
): Promise<{ agent: ReturnType<typeof request.agent>; userId: string }> {
  const agent = request.agent(app);
  const signUpRes = await agent
    .post('/api/auth/sign-up/email')
    .send({ name: email, email, password });
  expect(signUpRes.status).toBe(200);

  const signInRes = await agent.post('/api/auth/sign-in/email').send({ email, password });
  expect(signInRes.status).toBe(200);
  const userId = (signInRes.body as { user: { id: string } }).user.id;
  return { agent, userId };
}

function folderRow(id: string, groupId: string, author: string) {
  return {
    id,
    owner_group_id: groupId,
    name: 'Groceries',
    type: 'list',
    parent_id: null,
    sharing_mode: 'private',
    // boolean columns store SQLite INTEGER — the wire value must be 0/1, not JS true/false
    // (better-sqlite3 cannot bind a JS boolean).
    archived: 0,
    expanded: 1,
    created_by: author,
    created_at: 1000,
    updated_at: 1000,
    __hlc: hexPack(1000, 0),
    __op: 'create',
  };
}

describe('rowboat host: folder-group mint -> scoped push -> scoped pull', () => {
  it('U sees its own folder; V (unrelated) sees none; unauthenticated mint is 401', async () => {
    server = await createServer(testConfig());
    const { app, db } = server;

    // Unauthenticated mint: no session cookie -> 401, no group created.
    const noAuthMint = await request(app).post('/api/folders/group').send({});
    expect(noAuthMint.status).toBe(401);

    const u = await signUpAndSignIn(app, 'u@x.com', 'correct-horse-battery');
    const v = await signUpAndSignIn(app, 'v@x.com', 'correct-horse-battery');

    // U mints a folder scope group (nested under U's own root group, the default).
    const mintRes = await u.agent.post('/api/folders/group').send({});
    expect(mintRes.status).toBe(200);
    const { groupId } = mintRes.body as { groupId: string };
    expect(typeof groupId).toBe('string');
    expect(groupId.length).toBeGreaterThan(0);

    const serverEpoch = Number(
      db.prepare("SELECT value FROM rowboat_meta WHERE key = 'server_epoch'").pluck().get(),
    );

    // U pushes a folder row scoped to the freshly minted group.
    const pushRes = await u.agent
      .post('/api/sync/sync')
      .send({
        serverEpoch,
        instanceId: 'inst-u',
        changes: {
          folder: {
            upserted: [folderRow('f1', groupId, u.userId)],
            deleted: [],
          },
        },
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.stale).toEqual({});

    // A fresh pull as U returns the folder.
    const pullU = await u.agent
      .post('/api/sync/pull')
      .send({ tables: ['folder'], lastPulledAt: 0, instanceId: 'inst-u', serverEpoch });
    expect(pullU.status).toBe(200);
    const uIds = (
      pullU.body.changes.folder.upserted as { id: string }[]
    ).map((r) => r.id);
    expect(uIds).toEqual(['f1']);

    // A pull as V (never granted access to U's group) returns none of U's folders.
    const pullV = await v.agent
      .post('/api/sync/pull')
      .send({ tables: ['folder'], lastPulledAt: 0, instanceId: 'inst-v', serverEpoch });
    expect(pullV.status).toBe(200);
    expect(pullV.body.changes.folder.upserted).toEqual([]);
  });
});
