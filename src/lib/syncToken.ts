/**
 * The Bearer credential for the hosted-rowboat data plane. BetterAuth's `jwt` plugin mints these at
 * `GET /api/auth/token` with `sub = user.id` and the `iss`/`aud` that `provision:*` registered with
 * rowboat, so the router's `resolveAuthor` verifies them against CheckList's public JWKS.
 *
 * One token is cached and re-minted a minute before it expires. The 5s sync loop awaits this before
 * every tick, so no 401-retry is needed: a failed mint costs one tick and the next recovers — the
 * same shape as every other transient sync error the loop already absorbs.
 */

const REFRESH_MARGIN_MS = 60_000;

// Mirrors auth-client.ts: an explicit base in prod/Capacitor, the page origin in dev (Vite proxies
// /api to the backend), which is what a relative URL resolves to.
const TOKEN_URL = `${import.meta.env.VITE_AUTH_URL ?? ''}/api/auth/token`;

let cached: { token: string; expiresAtMs: number } | null = null;

function expiryMsOf(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('syncToken: malformed JWT (no payload segment)');
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const { exp } = JSON.parse(json) as { exp?: unknown };
  if (typeof exp !== 'number') throw new Error('syncToken: JWT carries no numeric exp claim');
  return exp * 1000;
}

export async function getSyncToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAtMs - REFRESH_MARGIN_MS) return cached.token;

  // Same-origin to CheckList, so the session cookie authenticates the mint.
  const res = await fetch(TOKEN_URL, { credentials: 'include' });
  if (!res.ok) throw new Error(`syncToken: GET /api/auth/token failed (${res.status})`);

  const { token } = (await res.json()) as { token?: unknown };
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('syncToken: response missing a token');
  }

  cached = { token, expiresAtMs: expiryMsOf(token) };
  return token;
}

/** Drops the cached token so the next call re-mints — used on identity change and by tests. */
export function clearSyncToken(): void {
  cached = null;
}
