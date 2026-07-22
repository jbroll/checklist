// Supertest-verifies the rowboat host stood up in ../index.ts: it serves auth, billing, sharing
// and account routes, and mints the data-plane JWT the browser carries to hosted rowboat. Sync,
// RBAC and the folder-group mint are NOT here any more — hosted rowboat owns them.
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type RowboatServer, type ServerConfig } from '../index.js';

const AUTH_SECRET = 'test-secret-test-secret-test-secret';
const DATABASE_ID = 'db_test_tenant';

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
    rowboatDatabaseId: DATABASE_ID,
    rowboatUrl: 'http://rowboat.test',
    rowboatAgentId: 'agent:test',
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

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

// The data-plane credential: rowboat's resolveAuthor verifies these against CheckList's JWKS, so
// iss/aud must match exactly what `npm run provision:*` registered for this database. A mismatch
// surfaces only as a blanket 401 on every sync, which is why it is asserted here.
describe('data-plane JWT issuance', () => {
  it('mints a token whose sub/iss/aud match the registered issuer', async () => {
    server = await createServer(testConfig());
    const u = await signUpAndSignIn(server.app, 'jwt@x.com', 'correct-horse-battery');

    const tokenRes = await u.agent.get('/api/auth/token');
    expect(tokenRes.status).toBe(200);
    const { token } = tokenRes.body as { token: string };
    expect(typeof token).toBe('string');

    const claims = claimsOf(token);
    expect(claims.sub).toBe(u.userId);
    expect(claims.iss).toBe('http://localhost:5173/api/auth');
    expect(claims.aud).toBe(DATABASE_ID);
    expect(typeof claims.exp).toBe('number');
  });

  it('serves a public JWKS rowboat can verify against', async () => {
    server = await createServer(testConfig());

    const res = await request(server.app).get('/api/auth/jwks');
    expect(res.status).toBe(200);
    const { keys } = res.body as { keys: { kty: string; d?: string }[] };
    expect(keys.length).toBeGreaterThan(0);
    // Public half only — a private component here would mean leaking the signing key.
    expect(keys.every((k) => k.d === undefined)).toBe(true);
  });

  it('refuses to mint for an unauthenticated caller', async () => {
    server = await createServer(testConfig());

    const res = await request(server.app).get('/api/auth/token');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('no longer serves the embedded data plane', async () => {
    server = await createServer(testConfig());
    const { app } = server;

    expect((await request(app).post('/api/folders/group').send({})).status).toBe(404);
    expect((await request(app).post('/api/sync/pull').send({})).status).toBe(404);
  });
});

// The sharing group backend authenticates to rowboat as the ACTING USER, so the backend must be
// able to mint a token for an arbitrary subject. That capability is only safe because better-auth's
// signJWT is server-only: an HTTP route reaching it would let anyone impersonate anyone on the data
// plane. Both halves are asserted here.
describe('actor-token minting for the sharing group backend', () => {
  it('mints a token for an arbitrary subject with the registered iss/aud', async () => {
    server = await createServer(testConfig());

    const token = await server.signJWT('agent:test');

    const claims = claimsOf(token);
    expect(claims.sub).toBe('agent:test');
    expect(claims.iss).toBe('http://localhost:5173/api/auth');
    expect(claims.aud).toBe(DATABASE_ID);
  });

  it('exposes no HTTP route that mints for a caller-supplied subject', async () => {
    server = await createServer(testConfig());
    const u = await signUpAndSignIn(server.app, 'impersonator@x.com', 'correct-horse-battery');

    for (const path of ['/api/auth/sign-jwt', '/api/auth/signJWT', '/api/auth/jwt/sign']) {
      const res = await u.agent.post(path).send({ payload: { sub: 'victim' } });
      expect(res.status).toBe(404);
    }
  });
});
