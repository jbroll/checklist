# CheckList → hosted rowboat: the cutover — design & decomposition

**Date:** 2026-07-18
**Status:** design / decomposition (decisions resolved 2026-07-18; per-sub-project specs+plans follow)
**Depends on:** Phases A (JWKS auth bridge), B (scope-group RBAC in the worker), C (agent-mediated
sharing) — all landed on rowboat `main` (`c4fb622`), gated off by default. See `docs/HOSTED_ROWBOAT.md`.

## Goal

Move CheckList off its **embedded** rowboat backend and onto the **hosted** `@jbroll/rowboat-server`
(rowboat.rkroll.com), consuming the capabilities landed in Phases A/B/C. After the cutover, CheckList
is a **client** of hosted rowboat for sync/storage/RBAC/sharing; it keeps only auth + billing + JWT
issuance + sharing-orchestration on a thin backend of its own.

## Resolved decisions

1. **Big-bang hard switch.** No dual-mode / backend toggle. CheckList drops the embedded backend
   (`mountSyncRoutes`, `registerSyncTable`, `createRbacAuth`, the local `mountShareRoutes` group ops,
   the `POST /api/folders/group` mint) and always talks to hosted rowboat. Simpler end-state; no
   fallback path is maintained.
2. **Fresh start; users preserve their own data.** No migration is built and no server-side export is
   run. Existing users **self-export** their lists via the app's existing export feature before the
   switch and re-import after; the hosted database starts empty. (Extends `DEFERRED.md` D4 — "no
   production data to migrate" — with a user-driven safety net rather than a migration tool.)
   Anon-claim/adopt still works for a user's local-until-login data.
3. **Deploy rowboat.rkroll.com; local dev runs a local hosted rowboat.** Standing up the assembled
   hosted server is in scope. `npm run dev` spins up a **local** instance of the same
   `@jbroll/rowboat-server` beside CheckList's thin auth backend; prod CheckList points at
   rowboat.rkroll.com. Dev/prod parity; offline-capable local iteration.
4. **RBAC + JWT auth on in the hosted deployment.** `ROWBOAT_AUTH_MODE=jwt` and `ROWBOAT_RBAC=on`
   (both default off in the engine) are set in the hosted server's config for CheckList's use.
5. **Agent principal for sharing.** The Phase-C agent is a well-known `sub`; CheckList's BetterAuth
   mints an **agent JWT** (reusing the JWT plugin) that the thin backend authenticates as when driving
   `remoteGroupBackend`. Agent-credential rotation/scoping is a documented operational concern.

## Ownership split (end state)

| Concern | Owner |
|---|---|
| Login / identity (BetterAuth OAuth, sessions, verified emails, `principalOwnsEmail`) | **CheckList backend** |
| Per-user JWT issuance + JWKS (`/api/auth/token`, `/api/auth/jwks`) | **CheckList backend** (BetterAuth `jwt` plugin) |
| Billing (Stripe subscriptions, webhooks, tiers) | **CheckList backend** |
| Sharing orchestration (invite tokens, email, `share_invites`, accept/validate) | **CheckList backend** (`@jbroll/rowboat-sharing` as a library) |
| Account-merge | **CheckList backend** |
| Agent-JWT issuance | **CheckList backend** |
| Sync / storage / conflict resolution | **hosted rowboat** |
| Scope-group RBAC (enforcement + group tables) | **hosted rowboat** |
| Group management primitives (grant/revoke/role/members, mint) | **hosted rowboat** (driven by CheckList via `remoteGroupBackend` + agent) |
| Schema registration + live migration, backup, metering, quota | **hosted rowboat** (control plane) |

## Decomposition — five sequenced sub-projects

Each gets its own spec → plan → build → land cycle. Dependencies are strict; C/D/E are the CheckList
repoint split by concern and are each independently landable behind the prior.

### A — Deploy rowboat.rkroll.com + local-dev harness
Stand up the assembled `@jbroll/rowboat-server` (router + listener/writer workers + control-plane +
identity console + backup + metering + object store) as a deployed service (rowboat.rkroll.com), with
`ROWBOAT_AUTH_MODE=jwt`, `ROWBOAT_RBAC=on`, a `ROUTER_SECRET`, an `AUTH_SECRET`/`AUTH_BASE_URL` for the
console, persistent `ROWBOAT_ROOT`, and TLS/reverse-proxy. Add a **local-dev harness**: `npm run dev`
launches a local instance (ephemeral or fixed port, a scratch `ROWBOAT_ROOT`) so CheckList dev has a
real hosted rowboat to point at. Deliverables: a deploy config/unit (mirroring the existing
`checklist-api` systemd topology), env templates, and the dev-script wiring.
**Interfaces produced:** a running server exposing `/db/:database_id/api/sync/*`, the management API
(`/v1/*`), and the console; the base URL(s) for dev + prod. **Depends on:** nothing (engine landed).

### B — Provision CheckList's tenant
A re-runnable **bootstrap tool** (a script / small CLI) that, against a target rowboat server + a
management key: creates the **subscriber** and **database** (`POST /v1/subscribers`, `POST /v1/databases`
with CheckList's compiled schema manifest — the StaaS control-plane path replacing embedded
`registerSyncTable`), and **registers the JWT issuer** for that database
(`PUT /v1/databases/:id/auth-issuer` with CheckList's JWKS URL + expected `iss`/`aud` = the
`database_id`). Runs once per env/brand (dev, prod CheckList, kjekit). Emits the `database_id` +
issuer config for the app to consume. **Interfaces produced:** a provisioned `database_id` per env; the
issuer registration. **Depends on:** A. **Open (for its plan):** where the compiled manifest comes from
(reuse `compileSchema(shared/schema.ts)`); schema re-push / live-migration on schema change (the
engine's `POST /v1/databases/:id/schema` + `rowboat migrate`); management-key handling.

### C — Auth bridge (Phase A's deferred client half)
Enable the BetterAuth **`jwt` plugin** in CheckList's `createIdentity` (mint per-user JWTs with
`sub = user.id`, `iss`/`aud` matching the registered issuer; serve `/api/auth/jwks`). Client: mint +
refresh a JWT from BetterAuth and send `Authorization: Bearer <jwt>` on sync; make the sync base URL
**configurable** (a `VITE_ROWBOAT_URL`-style env, replacing the hardcoded same-origin `/api/sync` in
`src/lib/rowboat.tsx:141,197`). **Interfaces produced:** authenticated, off-origin sync requests the
hosted server's `resolveAuthor` (JWT mode) accepts. **Depends on:** B. **Open:** token refresh cadence
+ 401-retry; `aud` = `database_id` wiring; CORS (the JWKS endpoint + token endpoint stay same-origin to
CheckList; the sync is cross-origin Bearer — no cookies, so no CORS-credentials complication).

### D — Data-plane cutover (Phase B's deferred client half)
Delete the embedded sync/RBAC from CheckList's backend (`mountSyncRoutes`, `registerSyncTable`,
`createRbacAuth`, `registerAuthTables`). The browser syncs **directly** to hosted rowboat
(`…/db/:database_id/api/sync`). Relocate group-mint: `serverMintGroup` /
`POST /api/folders/group` → the hosted mint endpoint (`POST …/api/sync/groups`). `seedDefaultFolders`
+ anon-claim `adopt` scope rows to the **hosted-provisioned root group** (lazy root-group provisioning
on first verified author, landed in Phase B). Turn the client's RBAC assumptions on. **Depends on:**
C. **Open:** the `owner_group_id` seeding path under hosted RBAC; adopt's `scopeGroupId` (= the user's
root group, auto-provisioned server-side); removing the now-dead backend sync wiring cleanly.

### E — Sharing cutover (Phase C's deferred client half)
CheckList's backend keeps `@jbroll/rowboat-sharing` but wires it with `remoteGroupBackend`
(→ hosted group API) + the **agent JWT** (a token whose `sub` = the agent, minted by CheckList's
BetterAuth). Reconcile the `shareUrl` / `?token` vs `/invite/:token` mismatch (the research finding:
`shareUrlBase` unset → bare `?token=`; client route is `/invite/:token`). Wrap the agent-install grant
(the Phase-C review minor) and neutralize the `inviter_no_longer_admin` string for agent mode. Drop
the local group-management — **including `registerAuthTables` and the local group tables, which D
left wired**: sharing, account-merge and account-deletion all read that (now empty) group graph and
fail closed between D and E, so removing it is E's job, not D's. **Depends on:** D (a working RBAC
data plane + provisioned groups).
**Open:** agent-credential issuance + rotation/scoping; `shareUrlBase` = CheckList's `/invite`; email
content (folder name vs the raw group id the server sees).

## End-state thin CheckList backend
Keeps: BetterAuth (+ `jwt`/JWKS plugin, OAuth, sessions, verified-email), Stripe billing + webhooks,
`@jbroll/rowboat-sharing` orchestration (invites/email/token/`share_invites`), account-merge routes,
agent-JWT issuance. Drops: `mountSyncRoutes`, `registerSyncTable`, `createRbacAuth`,
`registerAuthTables`, the local `POST /api/folders/group` mint, and the local group tables. The one
sqlite db shrinks to auth + billing + `share_invites`.

## Sequencing & landing
A → B → C → D → E. A and B are prerequisites with no CheckList-app behavior change. C is the first
user-visible switch (sync auth flips to JWT/hosted) and must land with D (the app can't half-sync:
once the client points at hosted rowboat it needs the data plane there) — **C+D land together** as the
data-plane cutover, even though specced separately. E lands after. Each sub-project is built on its own
worktree/branch and landed via `scripts/land.sh` on the rowboat repo where it touches rowboat, and via
the CheckList repo where it touches CheckList.

## Non-goals
- No dual-mode / embedded fallback (big-bang).
- No data migration tool (users self-export/import).
- No change to CheckList's login/branding, OAuth providers, or billing.
- No change to the engine (A/B/C landed); this is consumption + deployment + client wiring.

## Risks / open questions (resolved per sub-project plan)
- **CORS / cross-origin auth:** sync is cross-origin `Bearer` (no cookies) → simple; the console/JWKS
  stay same-origin to CheckList. Confirm in C.
- **Schema push + live migration:** CheckList moves from register-at-boot to management-API schema
  push; ongoing schema changes use the engine's live-migration path (`POST …/schema` + `rowboat
  migrate`) — no more fresh-start-on-schema-change. Detail in B.
- **Agent credential:** a standing admin across all shared groups; rotation/scoping is operational
  (E + `HOSTED_ROWBOAT.md` cutover notes).
- **kjekit / multi-brand:** each brand is its own subscriber+database (multi-tenant shape from the
  design); B runs per brand.
