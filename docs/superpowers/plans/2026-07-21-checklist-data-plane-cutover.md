# CheckList Data-Plane Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point CheckList's browser client at hosted rowboat for sync and group mint, and delete the embedded sync/RBAC data plane from CheckList's backend.

**Architecture:** CheckList's BetterAuth gains the `jwt` plugin, minting short-lived per-user JWTs whose `iss`/`aud` match what `provision:*` registered with rowboat. The browser sends those as `Authorization: Bearer` directly to `<rowboat>/db/<databaseId>/api/sync` — cross-origin, no cookies — so rowboat's router needs CORS on that path. CheckList's backend keeps auth, billing, sharing and account routes but stops serving sync.

**Tech Stack:** React 18 + Vite 6, Express 5, better-auth 1.5.6 (`jwt` plugin), `@jbroll/rowboat-*`, Vitest (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-21-checklist-data-plane-cutover-design.md`

## Global Constraints

- **Two repos.** Task 1 lands in `../rowboat` via the `rowboat-wt1` worktree (branch `wt/1`, currently at `main`) using `scripts/land.sh wt/1`. Tasks 2–6 land in `/home/john/src/checklist` on a branch named `cutover-cd`, created off `main` before Task 2. **Do not merge `cutover-cd` to `main`** — sub-project E must land first (see "Deliberate gaps" in the spec).
- **Pre-commit hooks run type-check, lint, unit tests and E2E and MUST pass. Never bypass them** (`CLAUDE.md` → Git Commit Rules). Docs-only commits skip the hooks.
- **Config values, exact:** frontend `VITE_ROWBOAT_SYNC_BASE` = `<rowboatUrl>/db/<databaseId>/api/sync`; backend `ROWBOAT_DATABASE_ID` = `<databaseId>` (the JWT `audience`). JWT `issuer` = `<baseUrl>/api/auth`, `expirationTime` = `'15m'`.
- **Sharing, account-merge and account-deletion group operations stay broken** through this plan. Do not attempt to fix them — they are sub-project E. `registerAuthTables`, `registerShareTables`, `mountShareRoutes` and `mountAccountRoutes` stay wired.
- **No fallbacks.** A missing token, missing config, or non-ok response must throw, never silently degrade. This codebase states the rule explicitly at `src/lib/rowboat.tsx:69`.
- Comments are sparse in this codebase and explain *why*, never *what*. Match that density.

## File Structure

| File | Responsibility |
|---|---|
| `../rowboat/packages/router/src/router.ts` | + CORS middleware on the data-plane path |
| `../rowboat/packages/router/src/__tests__/cors.test.ts` | new — preflight + header pass-through |
| `scripts/dev-rowboat.sh` | + provision after boot, write `.env.tenant.local` |
| `scripts/with-tenant-env.sh` | new — block until the env file exists, source it, exec |
| `src/lib/syncToken.ts` | new — cached BetterAuth JWT for the data plane |
| `src/lib/__tests__/syncToken.test.ts` | new |
| `src/lib/rowboat.tsx` | sync + mint repointed at hosted rowboat |
| `backend/src/index.ts` | + `jwt` config; − embedded sync/RBAC/mint |
| `backend/src/__tests__/host.test.ts` | replaced — JWT issuance instead of sync |
| `e2e/folders-authed.spec.ts` | asserts sync hits the rowboat origin with a Bearer |

---

### Task 1: CORS on the rowboat data plane

**Files:**
- Modify: `/home/john/src/rowboat-wt1/packages/router/src/router.ts` (insert before the `app.all("/db/:database_id/api/sync/{*splat}", …)` handler at line 107)
- Test: `/home/john/src/rowboat-wt1/packages/router/src/__tests__/cors.test.ts` (create)

**Model:** `sonnet` — a small edit, but in another repo with its own test harness and landing script.

**Interfaces:**
- Consumes: nothing.
- Produces: `OPTIONS /db/:id/api/sync/*` → 204 with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Authorization, Content-Type`; the same two headers on every non-preflight response from that path. No exported symbols.

**Context:** The proxy handler copies upstream headers with `res.setHeader(k, v)` per key (`router.ts:202-205`), so headers set by earlier middleware survive the pipe — the worker never sets `Access-Control-*`. The wildcard is safe **only** on this path: the data plane is Bearer-only and reads no cookie. Do not widen it to the control-plane routes mounted at `router.ts:225`.

- [ ] **Step 1: Confirm the worktree is clean and on `wt/1` at `main`**

Run:
```bash
cd /home/john/src/rowboat-wt1 && git status --short && git log --oneline -1
```
Expected: no output from `status`; the commit matches `git -C /home/john/src/rowboat log --oneline -1`. If `wt/1` has diverged, run `git rebase main` before continuing.

- [ ] **Step 2: Write the failing test**

Create `/home/john/src/rowboat-wt1/packages/router/src/__tests__/cors.test.ts`:

```ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouter } from "../router.js";

let worker: http.Server, routerServer: http.Server, base: string;

beforeEach(async () => {
  worker = http.createServer((_req, res) => res.writeHead(200).end("ok"));
  await new Promise<void>((r) => worker.listen(0, "127.0.0.1", () => r()));
  const workerUrl = `http://127.0.0.1:${(worker.address() as AddressInfo).port}`;

  const cp = {
    getDatabase: () => ({ status: "active", subscriber_id: "sub_1" }),
    getSubscriber: () => ({ over_quota: 0 }),
  } as unknown as Parameters<typeof createRouter>[0]["controlPlane"];

  const app = createRouter({
    controlPlane: cp,
    resolveAuthor: () => "u1",
    workers: [{ id: "w1", baseUrl: workerUrl }],
    routerSecret: "s",
  });
  routerServer = http.createServer(app);
  await new Promise<void>((r) => routerServer.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(routerServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((r) => routerServer.close(() => r()));
  await new Promise<void>((r) => worker.close(() => r()));
});

describe("data-plane CORS", () => {
  it("answers the preflight with 204 and the Bearer-enabling headers", async () => {
    const res = await fetch(`${base}/db/db_1/api/sync/pull`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:8765",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "authorization",
    );
  });

  it("keeps the CORS headers on a real proxied response", async () => {
    const res = await fetch(`${base}/db/db_1/api/sync/pull`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8765" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("does not add CORS headers to the control plane", async () => {
    const res = await fetch(`${base}/v1/databases/db_1`, { headers: { origin: "http://evil" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd /home/john/src/rowboat-wt1/packages/router && npx vitest run src/__tests__/cors.test.ts
```
Expected: FAIL — the preflight case returns a non-204 status and `access-control-allow-origin` is `null`. The third case may already pass; that is fine.

- [ ] **Step 4: Add the middleware**

In `/home/john/src/rowboat-wt1/packages/router/src/router.ts`, insert immediately **before** the existing `app.all("/db/:database_id/api/sync/{*splat}", async (req, res) => {` line:

```ts
  // The data plane is a cross-origin browser surface: subscribers' SPAs sync straight here with a
  // Bearer JWT. Same path pattern as the proxy handler below, so this runs first and its headers
  // survive the proxy's per-key setHeader copy. A wildcard origin is safe on THIS path precisely
  // because it is Bearer-only and reads no cookie — there is no ambient authority to borrow. The
  // control-plane routes mounted further down are deliberately not covered.
  app.all("/db/:database_id/api/sync/{*splat}", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd /home/john/src/rowboat-wt1/packages/router && npx vitest run src/__tests__/cors.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the router and integration suites for regressions**

Run:
```bash
cd /home/john/src/rowboat-wt1/packages/router && npx vitest run
cd /home/john/src/rowboat-wt1/packages/integration && npx vitest run
```
Expected: PASS. If the integration suite is slow or needs a build, run `npm run build` at `/home/john/src/rowboat-wt1` first.

- [ ] **Step 7: Commit and land**

```bash
cd /home/john/src/rowboat-wt1
git add packages/router/src/router.ts packages/router/src/__tests__/cors.test.ts
git commit -m "feat(router): CORS on the browser data plane

Subscribers' SPAs sync cross-origin with a Bearer JWT, which preflights.
Wildcard origin is scoped to /db/:id/api/sync/* — Bearer-only, no cookies,
so there is no ambient authority for a hostile origin to borrow."
sh scripts/land.sh wt/1
```
Expected: the land script reports a successful merge onto `main`.

- [ ] **Step 8: Rebuild the sibling rowboat so CheckList's dev server picks up the change**

Run:
```bash
cd /home/john/src/rowboat && npm run build
```
Expected: build succeeds. `scripts/dev-rowboat.sh` runs the server from source via `tsx`, but the worker `.mjs` files resolve against each package's `dist/`.

---

### Task 2: Dev tenant env plumbing

**Files:**
- Modify: `scripts/dev-rowboat.sh`
- Create: `scripts/with-tenant-env.sh`
- Modify: `package.json` (`dev:frontend`, `dev:backend`)
- Modify: `.gitignore`

**Model:** `sonnet` — shell process orchestration with ordering and failure modes.

**Interfaces:**
- Consumes: `rowboat-tenant.local.json` (written by `npm run provision:local`, key `databaseId`).
- Produces: `.env.tenant.local` at the repo root containing exactly `VITE_ROWBOAT_SYNC_BASE=` and `ROWBOAT_DATABASE_ID=`. `scripts/with-tenant-env.sh <cmd> [args…]` blocks until that file exists, sources it into the environment, and `exec`s the command.

**Context:** The frontend and backend now need a value that does not exist until rowboat is up and provisioned. `dev:rowboat` owns that sequence and is the only provisioner, so there is no concurrent-bootstrap race (`provisionTenant` is idempotent across *sequential* re-runs, not simultaneous fresh ones). Deleting `.env.tenant.local` before starting is what makes freshness unambiguous: after a `.rowboat-dev/` wipe the waiters block for the new `databaseId` rather than racing a stale one.

Vite 6 copies `process.env.VITE_*` into `import.meta.env` and lets it win over `.env` files (`node_modules/vite/dist/node/chunks/dep-D4NMHUTW.js:16967-16971`), so exporting the var in the shell before `vite` is sufficient — no `.env` file juggling.

- [ ] **Step 1: Create the branch**

```bash
cd /home/john/src/checklist && git checkout -b cutover-cd
```
Expected: `Switched to a new branch 'cutover-cd'`.

- [ ] **Step 2: Write the waiter script**

Create `scripts/with-tenant-env.sh`:

```bash
#!/usr/bin/env bash
# Blocks until dev:rowboat has provisioned the local tenant and written .env.tenant.local, then
# sources it and execs the real command. Frontend and backend both need the provisioned databaseId
# (as VITE_ROWBOAT_SYNC_BASE and ROWBOAT_DATABASE_ID respectively), which does not exist until the
# local rowboat is up. dev-rowboat.sh deletes the file before starting, so its presence always means
# "provisioned this run" — never a stale id left over from a wiped .rowboat-dev/.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$here/.env.tenant.local"
timeout_sec="${TENANT_ENV_TIMEOUT:-120}"

if [ ! -f "$env_file" ]; then
  echo "with-tenant-env: waiting for $env_file (dev:rowboat provisions it)" >&2
fi

waited=0
while [ ! -f "$env_file" ]; do
  if [ "$waited" -ge "$timeout_sec" ]; then
    echo "with-tenant-env: timed out after ${timeout_sec}s waiting for $env_file" >&2
    echo "with-tenant-env: is 'npm run dev:rowboat' running? did provision:local fail?" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

exec "$@"
```

- [ ] **Step 3: Make it executable and verify the timeout path**

```bash
chmod +x scripts/with-tenant-env.sh
rm -f .env.tenant.local
TENANT_ENV_TIMEOUT=2 bash scripts/with-tenant-env.sh echo should-not-print; echo "exit=$?"
```
Expected: the two `with-tenant-env:` messages, no `should-not-print`, and `exit=1`.

- [ ] **Step 4: Verify the success path**

```bash
printf 'VITE_ROWBOAT_SYNC_BASE=http://x/db/db_fake/api/sync\nROWBOAT_DATABASE_ID=db_fake\n' > .env.tenant.local
bash scripts/with-tenant-env.sh sh -c 'echo "$ROWBOAT_DATABASE_ID $VITE_ROWBOAT_SYNC_BASE"'
rm -f .env.tenant.local
```
Expected: `db_fake http://x/db/db_fake/api/sync`.

- [ ] **Step 5: Rewrite the tail of `scripts/dev-rowboat.sh`**

Replace the final two lines of `scripts/dev-rowboat.sh` — the `echo "dev-rowboat: local rowboat-server …"` line and `exec npx tsx "$server_main"` — with:

```bash
env_file="$here/.env.tenant.local"
rm -f "$env_file"

echo "dev-rowboat: local rowboat-server on :${ROUTER_PORT} (root=${ROWBOAT_ROOT}, auth=${ROWBOAT_AUTH_MODE}, rbac=${ROWBOAT_RBAC})"
npx tsx "$server_main" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

# No health route on the router — any HTTP response (a 404 included) proves it is accepting.
waited=0
until curl -s -o /dev/null "http://localhost:${ROUTER_PORT}/"; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "dev-rowboat: server exited before becoming reachable" >&2
    exit 1
  fi
  if [ "$waited" -ge 60 ]; then
    echo "dev-rowboat: not reachable on :${ROUTER_PORT} after 60s" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

# Idempotent: a re-run is a schema no-op + issuer re-assert; a wiped .rowboat-dev/ re-bootstraps.
echo "dev-rowboat: provisioning the local tenant"
(cd "$here" && npm run --silent provision:local)

database_id="$(node -e "process.stdout.write(require('$here/rowboat-tenant.local.json').databaseId)")"
if [ -z "$database_id" ]; then
  echo "dev-rowboat: provision:local produced no databaseId" >&2
  exit 1
fi

cat > "$env_file" <<EOF
VITE_ROWBOAT_SYNC_BASE=http://localhost:${ROUTER_PORT}/db/${database_id}/api/sync
ROWBOAT_DATABASE_ID=${database_id}
EOF
echo "dev-rowboat: tenant ready (databaseId=${database_id}) -> .env.tenant.local"

wait "$server_pid"
```

- [ ] **Step 6: Point the dev scripts at the waiter**

In `package.json`, replace these two script values:

```json
    "dev:frontend": "bash scripts/with-tenant-env.sh npx vite",
    "dev:backend": "bash scripts/with-tenant-env.sh npm run --prefix backend dev",
```

- [ ] **Step 7: Ignore the generated env file**

Append to `.gitignore`:

```
.env.tenant.local
```

- [ ] **Step 8: Verify the whole sequence end to end**

```bash
rm -rf .rowboat-dev rowboat-tenant.local.json .env.tenant.local
npm run dev
```
Expected: the `rowboat` pane prints `tenant ready (databaseId=db_…)`; the `frontend` and `backend` panes print the waiting message, then start normally. `cat .env.tenant.local` shows both variables with a real `db_…` id. Stop with Ctrl-C.

- [ ] **Step 9: Verify a wiped rowboat re-bootstraps**

```bash
rm -rf .rowboat-dev && npm run dev
```
Expected: a **new** `db_…` id in `.env.tenant.local`, with no manual state-file deletion. Stop with Ctrl-C.

- [ ] **Step 10: Commit**

```bash
git add scripts/dev-rowboat.sh scripts/with-tenant-env.sh package.json .gitignore
git commit -m "feat(dev): provision the local tenant on dev:rowboat and gate the app on it

dev:rowboat now boots the local rowboat, waits for it, runs provision:local,
and writes .env.tenant.local; dev:frontend/dev:backend block on that file.
Deleting it first means a wiped .rowboat-dev/ can never leak a stale databaseId."
```

---

### Task 3: The sync-token module

**Files:**
- Create: `src/lib/syncToken.ts`
- Test: `src/lib/__tests__/syncToken.test.ts`

**Model:** `sonnet` — small and fully specified, but the caching and error semantics carry the "no fallbacks" rule.

**Interfaces:**
- Consumes: `GET <auth-base>/api/auth/token` → `{ token: string }` (better-auth `jwt` plugin, wired in Task 4).
- Produces:
  - `getSyncToken(): Promise<string>` — a valid JWT, cached and re-minted within 60s of `exp`. Throws on a non-ok response, a missing token, or a JWT without a numeric `exp`.
  - `clearSyncToken(): void` — drops the cache.

**Context:** `src/lib/auth-client.ts` derives its base from `import.meta.env.VITE_AUTH_URL`, falling back to the page origin when unset (Vite proxies `/api` to `:3001` in dev). Mirror that: a relative URL resolves against the origin, which is the same fallback. Tests run under Vitest with `environment: 'jsdom'` and `globals: true`; colocate in `src/lib/__tests__/` next to `account-merge.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/syncToken.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSyncToken, getSyncToken } from '../syncToken';

// A JWT is only parsed for `exp` here, so a real signature is unnecessary.
function jwtExpiringIn(seconds: number): string {
  const payload = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + seconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.sig`;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearSyncToken();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okToken(token: string) {
  return { ok: true, json: async () => ({ token }) } as unknown as Response;
}

describe('getSyncToken', () => {
  it('mints once and serves the cached token while it is fresh', async () => {
    fetchMock.mockResolvedValue(okToken(jwtExpiringIn(900)));

    const first = await getSyncToken();
    const second = await getSyncToken();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/token');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('re-mints inside the 60s expiry margin', async () => {
    fetchMock.mockResolvedValueOnce(okToken(jwtExpiringIn(30)));
    const first = await getSyncToken();

    const fresh = jwtExpiringIn(900);
    fetchMock.mockResolvedValueOnce(okToken(fresh));
    const second = await getSyncToken();

    expect(second).toBe(fresh);
    expect(second).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-ok response rather than yielding a blank token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    await expect(getSyncToken()).rejects.toThrow(/401/);
  });

  it('throws when the response carries no token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    await expect(getSyncToken()).rejects.toThrow(/missing a token/);
  });

  it('throws on a JWT with no numeric exp', async () => {
    const noExp = `header.${btoa(JSON.stringify({ sub: 'u1' }))}.sig`;
    fetchMock.mockResolvedValue(okToken(noExp));
    await expect(getSyncToken()).rejects.toThrow(/exp/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/__tests__/syncToken.test.ts
```
Expected: FAIL — cannot resolve `../syncToken`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/syncToken.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/__tests__/syncToken.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/syncToken.ts src/lib/__tests__/syncToken.test.ts
git commit -m "feat(sync): cached BetterAuth JWT for the hosted data plane"
```

---

### Task 4: Backend — issue JWTs, delete the embedded data plane

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json` (drop `@jbroll/rowboat-backend`)
- Replace: `backend/src/__tests__/host.test.ts`

**Model:** `sonnet` — coordinated deletions across one file plus a rewritten test.

**Interfaces:**
- Consumes: `ROWBOAT_DATABASE_ID` from the environment (written by Task 2 in dev).
- Produces: `ServerConfig` gains `rowboatDatabaseId: string`. `GET /api/auth/token` returns `{ token }` with `sub = user.id`, `iss = <baseUrl>/api/auth`, `aud = rowboatDatabaseId`. `GET /api/auth/jwks` serves the public keys. `POST /api/folders/group` and `/api/sync/*` **no longer exist**. `RowboatServer.db` is now `Database.Database`.

**Context:** `CreateIdentityOptions extends BuildAuthOptions` (`auth-betterauth/src/index.ts:33`), which already carries `jwt?: { issuer, audience, expirationTime? }` (`auth-instance.ts:84`) — so enabling the plugin is config only, no new dependency. `registerAuthTables`, `registerShareTables`, `mountShareRoutes` and `mountAccountRoutes` **stay** (see Global Constraints); their group graph goes empty, which makes sharing and merge fail closed until E.

- [ ] **Step 1: Replace the host test with one that proves JWT issuance**

The existing `backend/src/__tests__/host.test.ts` tests only the embedded mint and sync, which this task deletes. Replace the file's entire contents with:

```ts
// Supertest-verifies what the thin backend still owns after the data-plane cutover: real
// better-auth sign-up/sign-in, and the `jwt` plugin issuing a data-plane token whose claims match
// the issuer rowboat has registered for this tenant. Sync, RBAC and the folder-group mint moved to
// hosted rowboat and are no longer served here.
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
  return { agent, userId: (signInRes.body as { user: { id: string } }).user.id };
}

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

describe('thin backend: data-plane JWT issuance', () => {
  it('mints a token whose sub/iss/aud match the registered issuer', async () => {
    server = await createServer(testConfig());
    const { app } = server;

    const u = await signUpAndSignIn(app, 'u@x.com', 'correct-horse-battery');

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
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
cd backend && npx vitest run src/__tests__/host.test.ts
```
Expected: FAIL — `rowboatDatabaseId` is not a `ServerConfig` property, and `/api/auth/token` 404s.

- [ ] **Step 3: Trim the imports in `backend/src/index.ts`**

Delete line 1 (`import crypto from 'node:crypto';` — only the mint route used it). Replace line 8 with:

```ts
import { registerAuthTables } from '@jbroll/rowboat-auth';
```

Delete the whole `@jbroll/rowboat-backend` import block (lines 16-21) and the two schema lines (23-24):

```ts
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema as folderSchema } from '../../shared/schema.js';
```

- [ ] **Step 4: Add the config field and the JWT plugin**

In `ServerConfig`, add after `providers: OAuthProviderConfig[];`:

```ts
  /** The provisioned rowboat `databaseId` — the audience every data-plane JWT is bound to. */
  rowboatDatabaseId: string;
```

In `RowboatServer`, change `db: SyncDb;` to `db: Database.Database;`.

In `createServer`, change the first line from `const db = new Database(config.dbPath) as SyncDb;` to:

```ts
  const db = new Database(config.dbPath);
```

In the `createIdentity({…})` call, add after `baseUrl: `${config.baseUrl}/api/auth`,`:

```ts
    // Short-lived per-user tokens for the hosted-rowboat data plane. iss/aud must match what
    // `npm run provision:*` registered for this database, or every sync 401s with no other symptom.
    jwt: {
      issuer: `${config.baseUrl}/api/auth`,
      audience: config.rowboatDatabaseId,
      expirationTime: '15m',
    },
```

- [ ] **Step 5: Delete the embedded data plane**

Remove the sync registry block (formerly lines 109-111):

```ts
  initSyncRegistry(db);
  const { manifest } = compileSchema(folderSchema);
  for (const table of manifest) registerSyncTable(db, table);
```

Remove the `mountSyncRoutes` call (formerly 146-149):

```ts
  mountSyncRoutes(app, db, {
    auth: createRbacAuth(db),
    resolveAuthor: provider.resolveAuthor,
  });
```

Remove the entire `POST /api/folders/group` route, from its leading comment through its closing `});` (formerly 153-172).

Update the `createServer` doc comment above it to say the backend serves auth, sharing and account routes, and that sync/RBAC/mint moved to hosted rowboat.

- [ ] **Step 6: Require the database id from the environment**

In `configFromEnv`, add before the `return`:

```ts
  // No default: an unset id would mint tokens with an audience rowboat rejects, surfacing only as
  // a blanket 401 on every sync. Fail at boot instead. Lives here, not in createServer, so tests
  // that build their own ServerConfig stay independent of the process environment.
  const rowboatDatabaseId = process.env.ROWBOAT_DATABASE_ID;
  if (!rowboatDatabaseId) {
    throw new Error('ROWBOAT_DATABASE_ID is required (see rowboat-tenant.<env>.json)');
  }
```

and add `rowboatDatabaseId,` to the returned object, next to `providers,`.

- [ ] **Step 7: Drop the dead dependency**

In `backend/package.json`, remove the `"@jbroll/rowboat-backend": …` line from `dependencies`, then:

```bash
cd backend && npm install
```
Expected: lockfile updates, no errors.

- [ ] **Step 8: Run the test to verify it passes**

Run:
```bash
cd backend && npx vitest run
```
Expected: PASS, 4 tests in `host.test.ts`, plus any other backend suites unchanged.

- [ ] **Step 9: Type-check both projects**

Run:
```bash
cd /home/john/src/checklist && npm run type-check
```
Expected: clean. If `SyncDb` is still referenced anywhere, remove that usage.

- [ ] **Step 10: Commit**

```bash
git add backend/src/index.ts backend/package.json backend/package-lock.json backend/src/__tests__/host.test.ts
git commit -m "feat(backend)!: issue data-plane JWTs, delete the embedded sync/RBAC plane

BetterAuth's jwt plugin now mints per-user tokens bound to the provisioned
databaseId. mountSyncRoutes, registerSyncTable, createRbacAuth and the
POST /api/folders/group mint are gone — hosted rowboat serves them.

Sharing and account-merge group ops read a now-empty local group graph and
fail closed until sub-project E cuts them over."
```

---

### Task 5: Frontend — repoint sync and mint at hosted rowboat

**Files:**
- Modify: `src/lib/rowboat.tsx` (`serverMintGroup` at 62-80; the sync effect at 135-156; the provisioning sync at 194-201)

**Model:** `sonnet` — three coordinated edits with an ordering dependency that must be preserved.

**Interfaces:**
- Consumes: `getSyncToken()` from `@/lib/syncToken` (Task 3); `VITE_ROWBOAT_SYNC_BASE` (Task 2).
- Produces: no signature changes. `mintGroup(parentGroupId?)` keeps returning `Promise<string>`; `usePort()` and `useRowboat()` are untouched.

**Context:** `syncWithServer` appends `/sync` and `/pull` to `apiBase` and takes a `headers` map (`client/src/sync.ts:277,392,31`), so one composed base serves sync, pull, and — with `/groups` — the mint. Cookies must go: the requests are cross-origin now and rowboat authenticates the Bearer alone.

**Do not reorder the provisioning effect.** Its awaited `syncWithServer` (line ~194) is what triggers rowboat's server-side root-group provisioning (`backend/src/routes.ts:294,384`), and it must stay ahead of the first `mintGroup()` call at line ~218, whose `parentGroup` defaults to that root group.

Anonymous users are unaffected: they never sync and keep the local `crypto.randomUUID()` mint.

- [ ] **Step 1: Add the module constant**

In `src/lib/rowboat.tsx`, add to the imports:

```tsx
import { getSyncToken } from '@/lib/syncToken';
```

and below `const SYNC_INTERVAL_MS = 5000;`:

```tsx
// `<rowboatUrl>/db/<databaseId>/api/sync` — written by provision:* (see scripts/dev-rowboat.sh in
// dev, the deploy env in prod). syncWithServer appends /sync and /pull; the group mint is /groups.
const SYNC_BASE = import.meta.env.VITE_ROWBOAT_SYNC_BASE;
if (!SYNC_BASE) {
  throw new Error('VITE_ROWBOAT_SYNC_BASE is required — run `npm run provision:local` for dev');
}
```

- [ ] **Step 2: Repoint the mint**

Replace the body of `serverMintGroup` (keeping the signature) and update its comment:

```tsx
// Authenticated mint: hosted rowboat creates a scope group the caller admins, nested under their
// root group. Anonymous users have no token and never sync, so an anon folder gets a purely-local
// group id — its rows are re-scoped to the user's group by adopt on sign-in (C2).
async function serverMintGroup(parentGroupId?: string): Promise<string> {
  const res = await fetch(`${SYNC_BASE}/groups`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await getSyncToken()}`,
    },
    body: JSON.stringify({ parentGroup: parentGroupId }),
  });
  // NO FALLBACKS: a non-ok response (401 on an expired token, 403, 5xx) must surface, not
  // silently yield `undefined` and let a folder be created with no scope group.
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`mintGroup: POST ${SYNC_BASE}/groups failed (${res.status}) ${body}`);
  }
  const { groupId } = (await res.json()) as { groupId?: unknown };
  if (typeof groupId !== 'string' || groupId.length === 0) {
    throw new Error(`mintGroup: response missing a groupId (${JSON.stringify(groupId)})`);
  }
  return groupId;
}
```

- [ ] **Step 3: Repoint the sync loop**

Replace the `run` closure inside the interval effect (formerly lines 138-147) with:

```tsx
    const run = async () => {
      try {
        await syncWithServer({
          db,
          apiBase: SYNC_BASE,
          author,
          headers: { authorization: `Bearer ${await getSyncToken()}` },
        });
      } catch (err) {
        console.error('[rowboat] syncWithServer failed:', err);
      }
    };
    void run();
```

and change the interval callback to `if (!cancelled) void run();`.

The `credentials: 'include'` `fetchFn` is gone deliberately: the request is cross-origin and cookie-free, and sending credentials would make the wildcard CORS origin invalid.

- [ ] **Step 4: Repoint the provisioning sync**

Replace the awaited sync inside the provisioning effect (formerly 194-201):

```tsx
        if (author) {
          await syncWithServer({
            db,
            apiBase: SYNC_BASE,
            author,
            headers: { authorization: `Bearer ${await getSyncToken()}` },
          });
        }
```

- [ ] **Step 5: Type-check and lint**

Run:
```bash
npm run type-check && npm run lint
```
Expected: clean. If `import.meta.env.VITE_ROWBOAT_SYNC_BASE` is flagged as untyped, add it to the `ImportMetaEnv` interface in `src/vite-env.d.ts`, creating that declaration if it does not exist:

```ts
interface ImportMetaEnv {
  readonly VITE_ROWBOAT_SYNC_BASE: string;
}
```

- [ ] **Step 6: Run the unit suite**

Run:
```bash
npm run test:run
```
Expected: PASS. Any test that renders `RowboatProvider` needs `VITE_ROWBOAT_SYNC_BASE` set — if one fails on the module-level throw, stub it in `src/test/setup.ts` with `vi.stubEnv('VITE_ROWBOAT_SYNC_BASE', 'http://localhost:3020/db/db_test/api/sync')`.

- [ ] **Step 7: Verify by hand in the browser**

```bash
npm run dev
```
Then open `http://localhost:8765`, sign up with an email/password account, create a folder, and reload. Expected: the folder persists, and the Network tab shows `POST http://localhost:3020/db/db_…/api/sync/sync` and `/pull` returning 200 with an `Authorization: Bearer` request header — no calls to `localhost:3001/api/sync`. Stop with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add src/lib/rowboat.tsx src/vite-env.d.ts src/test/setup.ts
git commit -m "feat(sync)!: sync and mint directly against hosted rowboat

apiBase is now VITE_ROWBOAT_SYNC_BASE with a Bearer JWT; the group mint moves
from POST /api/folders/group to the hosted <base>/groups. Cookies are dropped —
the data plane is cross-origin and authenticates the token alone."
```

---

### Task 6: E2E proof, deploy config, and docs

**Files:**
- Modify: `e2e/folders-authed.spec.ts`
- Modify: `.env.example`
- Modify: `deploy.conf` (build env, above `APACHE_BUILD_CMD` at line 28)
- Modify: `docs/HOSTED_ROWBOAT.md`
- Modify: `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md` (E's widened charter)

**Model:** `sonnet` — a test assertion plus config and prose spread across files.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: no code interfaces. `.env.example` documents `VITE_ROWBOAT_SYNC_BASE` and `ROWBOAT_DATABASE_ID`.

**Context:** `e2e/folders-authed.spec.ts` already proves a server round-trip (create → reload → still visible). This task adds the assertion that the round-trip went to the *rowboat* origin under a Bearer, which is what makes it a cutover test rather than a persistence test. The `invite` and `merge` Playwright projects self-exclude without email infra (`playwright.config.ts:32`), so the default gate stays green despite the deliberate sharing gap.

- [ ] **Step 1: Assert the sync target in the e2e spec**

In `e2e/folders-authed.spec.ts`, replace the header comment's third paragraph reference to `POST /api/folders/group` and `mountSyncRoutes` with a note that sync now goes to hosted rowboat. Then replace the existing `page.on('request', …)` block with one that records:

```ts
  const syncRequests: { url: string; hasBearer: boolean }[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/sync')) {
      syncRequests.push({
        url: r.url(),
        hasBearer: (r.headers().authorization ?? '').startsWith('Bearer '),
      });
      console.log('[request]', r.method(), r.url(), (r.postData() ?? '').slice(0, 2000));
    }
  });
```

and add before the closing brace of the test, after the final `expect`:

```ts
  // The cutover assertion: sync left CheckList's origin for rowboat's, carrying a Bearer JWT.
  expect(syncRequests.length).toBeGreaterThan(0);
  expect(syncRequests.every((r) => r.hasBearer)).toBe(true);
  expect(syncRequests.every((r) => r.url.includes('/db/'))).toBe(true);
  expect(syncRequests.some((r) => r.url.startsWith('http://localhost:3020/'))).toBe(true);
```

- [ ] **Step 2: Run the e2e suite**

Run:
```bash
rm -rf .rowboat-dev rowboat-tenant.local.json .env.tenant.local
npm run test:e2e
```
Expected: PASS, including `folders-authed.spec.ts`. This also proves Task 2's ordering works from a clean checkout, which is what CI does. If Playwright times out starting the web server, raise `webServer.timeout` in `playwright.config.ts` to accommodate provisioning.

- [ ] **Step 3: Document the environment variables**

Add to `.env.example`:

```env
# Hosted rowboat data plane — both values come from `npm run provision:local` / `provision:prod`,
# which write them to rowboat-tenant.<env>.json. In dev, scripts/dev-rowboat.sh derives them
# automatically into .env.tenant.local; set them explicitly only for a production build/deploy.
VITE_ROWBOAT_SYNC_BASE=https://rowboat.rkroll.com/db/db_xxx/api/sync
ROWBOAT_DATABASE_ID=db_xxx
```

- [ ] **Step 4: Wire the deploy**

The frontend is built on the deploy host by `deploy.conf`'s `APACHE_BUILD_CMD="npm run build"` (line 28), so the build-time variable must be exported above it. Add to `deploy.conf`, immediately before that line:

```bash
# Hosted rowboat data plane, baked into the bundle at build time. From rowboat-tenant.prod.json
# (`npm run provision:prod`) — a stale value points the app at a database that no longer exists.
export VITE_ROWBOAT_SYNC_BASE="https://rowboat.rkroll.com/db/REPLACE_WITH_PROD_DATABASE_ID/api/sync"
```

Replace `REPLACE_WITH_PROD_DATABASE_ID` with the real id **only if** `rowboat-tenant.prod.json` exists locally; otherwise leave the placeholder and note it in the commit message as an operator step. The `databaseId` is not a secret.

The backend's runtime environment comes from the gitignored `backend/secrets.env` (`backend/deploy.conf` declares only `EXPRESS_APP_*` paths). `ROWBOAT_DATABASE_ID` belongs there, so it is **not** committed — record it in `.env.example` (Step 3) and in the runbook note (Step 5) instead.

Verify the variable reaches the bundle:
```bash
VITE_ROWBOAT_SYNC_BASE=https://rowboat.rkroll.com/db/db_x/api/sync npm run build
grep -rl "db_x/api/sync" dist/assets | head -1
```
Expected: the build succeeds and one asset file matches.

- [ ] **Step 5: Update `docs/HOSTED_ROWBOAT.md`**

Add a `### Sub-projects C+D — data-plane cutover (landed)` section after the sub-project B section, covering: the two env vars and where they come from; that `dev:rowboat` provisions and the other dev processes wait on `.env.tenant.local`; that sync and mint are now cross-origin Bearer against hosted rowboat; and the three capabilities deliberately broken until E (sharing, account-merge group link, account-deletion group cleanup).

Also update the **Troubleshooting → Data not syncing** guidance in `CLAUDE.md`, which still tells the reader to check same-origin `/api/sync` on the backend.

- [ ] **Step 6: Record E's widened charter**

In `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md`, retitle section `### E — Sharing cutover` to `### E — Server-driven group operations` and add account-merge's `link`/`grant` and account-deletion's group cleanup to its scope, noting they were surfaced by the C+D design and share the agent JWT with sharing. Update the `## Sequencing & landing` paragraph to say C+D landed together on the `cutover-cd` branch, held off `main` until E.

- [ ] **Step 7: Commit**

```bash
git add e2e/folders-authed.spec.ts .env.example deploy.conf docs/HOSTED_ROWBOAT.md docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md CLAUDE.md
git commit -m "test(e2e),docs: assert the hosted sync target; document C+D and E's widened charter"
```

- [ ] **Step 8: Full verification**

Run:
```bash
npm run check && npm run test:e2e
```
Expected: type-check, lint, unit tests and E2E all pass. Report the actual output — do not claim success without it.

- [ ] **Step 9: Confirm the branch is NOT merged**

```bash
git log --oneline main..cutover-cd
```
Expected: the five or six commits from this plan, on `cutover-cd`, with `main` untouched. Leave it that way — sub-project E lands next.
