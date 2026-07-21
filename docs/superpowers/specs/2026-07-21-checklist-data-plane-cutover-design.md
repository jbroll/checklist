# CheckList data-plane cutover — design (sub-projects C+D of the hosted-rowboat cutover)

**Date:** 2026-07-21
**Status:** design (approved 2026-07-21; plan follows)
**Depends on:** sub-project A (deploy + local-dev harness) and sub-project B (tenant provisioning) —
both landed (checklist `62861b2`, `ccfe72f`). Engine phases A/B/C landed on rowboat `main`.
**Design/decomposition parent:** `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md` →
sections "C" and "D".

## Goal

Point CheckList's browser client at hosted rowboat for sync, and delete the embedded sync/RBAC
backend. After C+D, the browser authenticates to rowboat with a BetterAuth-minted JWT and syncs
**directly** to `<rowboat>/db/<databaseId>/api/sync`; CheckList's own backend no longer serves sync,
holds a schema, or mints scope groups.

C and D are specced as one document because they land as one commit: the app cannot half-sync. C
alone (JWT issuance) has nothing to authenticate to; D alone (deleting the embedded data plane)
leaves the client with no reachable server. The parent decomposition already anticipated this
("C+D land together as the data-plane cutover").

## Verified starting facts

Established by reading the current code, not assumed:

| Fact | Evidence |
|---|---|
| The JWT plugin is a pure config addition — `CreateIdentityOptions extends BuildAuthOptions`, which already carries `jwt: { issuer, audience, expirationTime }` | `auth-betterauth/src/index.ts:33`, `auth-instance.ts:84,104` |
| Hosted `ensureRootGroup` creates a group whose id **is** the account id — identical to the embedded `ensureUserRootGroup` | `rowboat-service/src/writer-groupops.mjs:23-31` |
| Root-group provisioning fires on **both** push and pull | `backend/src/routes.ts:294,384` |
| `adopt` re-scopes anon rows to `scopeGroupId: userId` | `auth-betterauth-react/src/useAnonClaim.ts:59,86` |
| The mint endpoint takes `{ parentGroup }` and returns `{ groupId }` — same contract as CheckList's local route | `rowboat-service/src/server-buildapp.mjs:56-96` |
| `syncWithServer` appends `/sync` and `/pull` to `apiBase` and accepts a `headers` map | `client/src/sync.ts:277,392,31` |
| rowboat has **no** CORS handling in the router, the service, or the Apache deploy config | grep across `packages/*/src` and `packages/server/deploy.conf` |
| `mountShareRoutes` defaults to `localGroupBackend(db, …)`, reading the tables D orphans | `sharing/src/routes.ts:53` |
| account-merge and account-deletion also drive local group tables | `auth-betterauth/src/account-merge-routes.ts:72,102`, `account-routes.ts:82,93` |

The root-group fact is what keeps this cutover small: `owner_group_id = user.id`,
`ensureUserSettings(graph, identity, identity)`, and `adopt`'s scope rewrite all remain correct
without change.

## Architecture

Three origins where there were two. The browser talks to CheckList's backend (`:3001` dev,
`checklist-app.rkroll.com` prod) for auth, billing, sharing and account routes — same-origin, with
cookies — and directly to rowboat (`:3020` dev, `rowboat.rkroll.com` prod) for sync and group mint —
cross-origin, with a Bearer JWT and **no** cookies.

### Configuration

One value produced by `provision:*` reaches two consumers:

| Consumer | Variable | Value |
|---|---|---|
| Frontend (build-time) | `VITE_ROWBOAT_SYNC_BASE` | `<rowboatUrl>/db/<databaseId>/api/sync` |
| Backend (runtime) | `ROWBOAT_DATABASE_ID` | `<databaseId>`, used as the JWT `audience` |

A single composed URL suffices for the frontend because everything it needs hangs off that base:
`…/sync` and `…/pull` (appended by `syncWithServer`) and `…/groups` (mint). Splitting host and id
into two vars would only create a way for them to disagree.

### Token flow

`ServerConfig` gains a `rowboatDatabaseId: string`, and `createServer` passes
`jwt: { issuer: '<baseUrl>/api/auth', audience: config.rowboatDatabaseId, expirationTime: '15m' }` to
`createIdentity`. That serves the public EdDSA JWKS at
`/api/auth/jwks` and mints per-user tokens at `/api/auth/token` with `sub = user.id`. The `iss` and
`aud` match what `provision:*` registered, per B's pinned issuer contract.

A new `src/lib/syncToken.ts` holds one cached token, reads `exp` from the payload, and re-mints when
within 60s of expiry. The existing 5s sync loop awaits it before each tick. No bespoke 401-retry:
a mint failure fails a single tick, and the next tick recovers — which is already how the loop
handles every other transient sync error.

`configFromEnv` throws when `ROWBOAT_DATABASE_ID` is unset, rather than starting an auth server that
mints tokens rowboat will reject. The throw lives there, not in `createServer`, so tests that build
their own `ServerConfig` stay independent of the process environment.

### Authorization

Unchanged in shape, because the hosted root group id is the account id. The one ordering dependency
to preserve is in `rowboat.tsx`'s provisioning effect: its awaited `syncWithServer` must stay ahead
of the first `mintGroup()`, because that sync is what triggers server-side root-group provisioning
and the mint's `parentGroup` defaults to it.

Anonymous users are unaffected — they never sync and never mint, keeping local `crypto.randomUUID()`
group ids until `adopt` re-scopes them to `user.id` on sign-in.

### CORS

A middleware in `packages/router/src/router.ts` scoped to the `/db/:database_id/api/sync/*` data
plane: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Authorization, Content-Type`,
and a 204 short-circuit on `OPTIONS`. The wildcard is safe on this path and only this path — the data
plane is Bearer-only and reads no cookie, so a hostile origin has no ambient authority to borrow. It
belongs in rowboat rather than a CheckList workaround: every browser-based subscriber needs it, and
the alternative (reverse-proxying rowboat under CheckList's origin) walks back the proxy-free goal
the whole hosted design is built on.

## Changes by repo

### rowboat

`packages/router/src/router.ts` — the CORS middleware above, plus an integration test asserting a
preflight returns 204 with the expected headers and that a real Bearer sync still resolves an author.
Lands on a worktree via `scripts/land.sh`.

### CheckList backend

Deletions, plus the one `jwt` config block. From `backend/src/index.ts`: `initSyncRegistry`,
`registerSyncTable`, `mountSyncRoutes`, `createRbacAuth`, the `compileSchema`/`folderSchema` import,
the entire `POST /api/folders/group` route with its `createScopeGroup` call, and the `SyncDb` type
(reverting to `Database.Database`). The `@jbroll/rowboat-backend` dependency is removed.

`registerAuthTables`, `registerShareTables`, `mountShareRoutes` and `mountAccountRoutes` **stay**.
They compile and their tables still exist, but the group graph they read is now empty, so sharing and
merge fail closed — an inviter reads as non-admin — rather than silently mis-authorizing. See
"Deliberate gaps" below.

### CheckList frontend

- `src/lib/syncToken.ts` — new; the cached-token module described above.
- `src/lib/rowboat.tsx` — three edits: the two `syncWithServer` call sites gain
  `apiBase: VITE_ROWBOAT_SYNC_BASE` and an `Authorization` header and lose the
  `credentials: 'include'` `fetchFn`; `serverMintGroup` targets `${SYNC_BASE}/groups` with a Bearer
  header. Request and response bodies are unchanged.

### Dev startup ordering

The frontend and backend now need a value that does not exist until rowboat is running and
provisioned. `dev:rowboat` owns that sequence: delete the gitignored `.env.tenant.local`, start the
server, wait for health, run `provision:local`, then write both variables into that file.
`dev:frontend` and `dev:backend` run behind a waiter script that polls for the file, sources it, and
execs the real command.

Deleting the file first is what makes freshness unambiguous: after a `.rowboat-dev/` wipe, the
waiters block for the new `databaseId` instead of racing a stale one. Only `dev:rowboat` provisions,
so there is no concurrent-bootstrap race (B's idempotence covers re-runs, not simultaneous fresh
bootstraps). Playwright's `webServer: npm run dev` then works unchanged in CI from a clean checkout.

### Deploy

`VITE_ROWBOAT_SYNC_BASE` is set for the production build; `ROWBOAT_DATABASE_ID` joins the
`checklist-api` service environment. Both come from `rowboat-tenant.prod.json`, produced by
`provision:prod`.

## Deliberate gaps

C+D lands with three capabilities broken, all closing in E:

- Sharing — invite creation, acceptance, and collaborator management.
- Account-merge — the `link`/`grant` that re-parents the source user's group under the target's.
- Account deletion — the `DELETE FROM groups` cleanup, which now leaves an orphaned group in rowboat.

**E's charter widens accordingly**, from "sharing cutover" to *every backend-initiated group
operation*: sharing, account-merge, and account-deletion cleanup, all through `remoteGroupBackend`
plus the agent JWT they share. The parent decomposition doc is updated to record this.

The default `npm run test:e2e` gate stays green: the `invite` and `merge` Playwright projects
self-exclude when email infra is absent, and the `chromium` project already ignores their specs.
`test:e2e:invite:tunnel` and `test:e2e:merge:tunnel` will fail until E lands. The C+D branch
therefore stays off `main` until E is ready.

## Testing

- **rowboat** — the preflight/Bearer integration test described above.
- **CheckList unit** — `syncToken`: cache hit within the validity window, re-mint inside the 60s
  expiry margin, and a mint failure surfacing rather than yielding a blank header.
- **CheckList backend** — `host.test.ts` loses its mint and sync cases; what remains covers auth and
  billing.
- **CheckList e2e** — `folders-authed.spec.ts` is the end-to-end proof: sign in, create a folder,
  assert the sync requests target the rowboat origin carrying an `Authorization: Bearer` header and
  returning 200, and that the folder survives a reload (proving a real server round-trip, not
  IndexedDB).

## Non-goals

- No sharing, account-merge, or account-deletion group-op cutover (E).
- No dual-mode or embedded fallback — the embedded data plane is deleted, not disabled.
- No data migration; users self-export and re-import per the parent design's fresh-start decision.
- No change to login, OAuth providers, branding, or billing.
- No agent-JWT mechanism (E).

## Risks

- **Startup ordering** is the most failure-prone piece. The waiter must distinguish "not yet
  provisioned" from "provisioned last run", which the delete-first sequence handles; the plan pins
  the poll interval and a timeout that fails loudly instead of hanging CI.
- **`aud` mismatch.** If BetterAuth stamps an `iss` differing from B's registered value, every sync
  401s with no other symptom. The fix is a config change plus a `provision:*` re-run, not code — but
  the plan calls for verifying a minted token's claims against the registered issuer before wiring
  the client.
- **Deploy sequencing.** A frontend built with a stale `VITE_ROWBOAT_SYNC_BASE` points at a
  nonexistent database. The prod runbook gains a step tying the build to the current
  `rowboat-tenant.prod.json`.
