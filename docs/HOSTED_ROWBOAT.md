# Deploying CheckList on hosted rowboat (rowboat.rkroll.com) — architecture & status

**Date:** 2026-07-17 (updated 2026-07-18)
**Scope:** the rowboat capabilities required to run CheckList against a hosted `@jbroll/rowboat-server`
instead of the embedded-library backend, without a per-request proxy, while CheckList keeps its own
branded auth.

## Implementation status

The design below (§A/§B/§C, decisions resolved 2026-07-17) is being delivered as three phases on the
**rowboat** repo, each gated so existing behavior is unchanged until turned on.

| Phase | Scope | Status |
|-------|-------|--------|
| **A — JWKS auth bridge** (§A) | BetterAuth JWT plugin + `resolveAuthor` JWKS verifier behind `ROWBOAT_AUTH_MODE` (default `synthetic`) | ✅ **Landed** on rowboat `main` |
| **B — scope-group RBAC in the worker** (§B) | `__group*` per-database tables, writer group-write channel, per-db `authFactory` + lazy root-group provisioning, folder-group mint endpoint, gated by `ServerConfig.rbac` (default off) | ✅ **Landed** on rowboat `main` (`4a87dc4`) |
| **C — sharing / group management** (§C) | RBAC-pure **agent-mediated** sharing: `grant`/`revoke` writer ops + JWT-gated group-management endpoints; `@jbroll/rowboat-sharing` made pluggable (`GroupBackend` local/remote) with an optional agent dance; `__group*`-parameterized; mint `parentGroup` admin check fixed | ✅ **Landed** on rowboat `main` (`c4fb622`) |

Rowboat-side proof for A/B/C ships as integration tests; the CheckList **client repoint** is the
**cutover**, now designed as five sequenced sub-projects (deploy → provision → auth bridge → data-plane
→ sharing) in
[`docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md`](2026-07-18-checklist-hosted-rowboat-cutover-design.md)
(big-bang hard switch; fresh-start with user self-export; rowboat.rkroll.com deployed + a local hosted
rowboat for dev).
Detailed implementation plans + subagent execution logs are archived under
[`docs/archive/`](archive/) (`…-phase-a-jwks-bridge.md`, `…-phase-b-rbac.md`, `…-phase-c-sharing.md`, and
the `*-EXECUTION-LOG.md` files).

### Sub-project A — deploy + local-dev harness (landed)

**Local dev.** `npm run dev` now runs a third process, `dev:rowboat` (`scripts/dev-rowboat.sh`),
which runs a local `@jbroll/rowboat-server` from the sibling `../rowboat` source via `tsx` on
**http://localhost:3020**, with `ROWBOAT_AUTH_MODE=jwt` + `ROWBOAT_RBAC=on` (prod parity). Scratch
state lives in the gitignored `.rowboat-dev/`; delete it to reset. Requires the sibling rowboat
checkout to be built. Until sub-projects C/D repoint the client, this local server is standing
scaffolding — nothing points at it yet.

**Prod deploy.** rowboat.rkroll.com is deployed from `../rowboat/packages/server` via
`deploy-full.sh` + `deploy.conf`; the operator runbook is
`../rowboat/packages/server/DEPLOY_RUNBOOK.md`.

### Phase C — the agent-mediated grant dance (resolved design)

Sharing is identity/email-bound, so it **stays in the subscriber backend** (CheckList) — `@jbroll/rowboat-sharing`
remains a library it imports, holding the `share_invites` table, `principalOwnsEmail`, tokens, and SMTP.
Rowboat stays **identity-free** and exposes RBAC-pure group primitives. The offline-inviter problem
(the invitee accepts later, when the inviter isn't around to authorize the grant) is solved by an **agent
principal** — modeled on a server-agent pattern, but adapted to rowboat's server-side RBAC (rowboat has
no client signatures, so the agent exists to give the subscriber backend a *legitimate, RBAC-checked admin
principal to authenticate as*, not to supply an offline signing key):

1. **Invite-create** installs the agent as admin on the target group: `grant(actor: inviter, group, agent, admin)` — authorized by the inviter's own admin.
2. **Accept** grants the invitee *as the agent*: `grant(actor: agent, group, accepter, role)` — authorized because the agent is now admin.

Every grant is checked against the actor's real admin membership (`requireAdmin`) — **no management-key
bypass**. The prior phase-B mint `parentGroup` gap is closed (mint now requires actor-admin on a non-root parent).

**Cutover follow-ups** (for the deferred CheckList repoint): the CheckList backend wires `mountShareRoutes`
with `remoteGroupBackend` + an **agent JWT** (BetterAuth issues a token whose `sub` = the agent, via the
phase-A JWKS bridge); **agent-credential rotation/scoping** (the agent is a standing admin on every shared
group — compromise = admin on all shared groups; consider removing the agent membership when a group has no
pending invites); the `remote-403→AuthzError` path is already handled, but wrap the agent-install grant in a
try/catch (a rare TOCTOU/remote-network throw currently 500s instead of a clean 403) and neutralize the
`inviter_no_longer_admin` string for agent mode; add a `vitest.shared.js` source-alias for `@jbroll/rowboat-sharing`.

## Goal & driving requirements

Operate rowboat as a service (StaaS) so app developers don't carry the sync/storage/RBAC burden — but
without weakening security, and without forcing apps to give up their own identity. Concretely, for
CheckList:

1. **CheckList owns login.** End users authenticate through CheckList's own BetterAuth — Google/Apple
   OAuth under CheckList's branding. Rowboat does **not** host the login experience.
2. **Avoid a data-plane proxy.** The browser should sync **directly** to rowboat.rkroll.com if a safe
   mechanism exists (fall back to a proxy only if forced).
3. **Security is non-negotiable.** No spoofable identity; tenant isolation; revocable credentials.
4. **Shrink, don't eliminate, the app backend.** CheckList already runs a server-side auth component
   (BetterAuth is server-side); the target is to keep only auth + billing + token issuance there, and
   move sync/storage/RBAC/sharing/migration to rowboat.

## Where we are (evidence)

Two investigations (2026-07-17) established the surface:

- **CheckList requires** from rowboat: relational client + sync engine, BetterAuth identity with
  `user.id` = account = root scope group, `/api/sync` with **scope-group RBAC**, sharing
  (`/api/shares/*`: invites, collaborators, reader/writer/admin roles), per-folder scope-group minting
  (`POST /api/folders/group` → `createScopeGroup`), account-merge, and anon-claim. Billing is
  CheckList's own (not rowboat).
- **Hosted `rowboat-server` provides**: per-database sync proxy, BetterAuth `/api/auth/*`, account-
  merge, management API (create subscriber/database, **push schema + live-migrate**), console, backup,
  metering, quota enforcement.
- **Hosted `rowboat-server` is missing** (the gaps):
  - **G1 — data-plane auth.** Author is resolved from a synthetic `x-author` header stub
    (`main.ts:74,143`), not any verified credential. Spoofable. `ServerConfig.resolveAuthor` is a
    pluggable seam; only the stub is wired.
  - **G2 — scope-group RBAC.** The hosted worker mounts sync with **no `auth`**
    (`server-buildapp.mjs:14`, comment L23). `owner_group_id` is stored, never enforced. Any
    authenticated author reads/writes the whole database.
  - **G3 — sharing / group management.** `@jbroll/rowboat-sharing` is not even a server dependency;
    no invite/collaborator/group-create HTTP surface exists in the hosted stack.
  - **Topology tension.** Hosted isolation is **per-database** (one SQLite file per `database_id`,
    RBAC off inside it). CheckList's model is **one dataset, many scope groups, folders shared across
    users.** There is a **single, server-wide `identity.db`** (`assembly.ts:184`) — explicitly the
    *console plane* (subscriber/dashboard login) — and it *also* holds the RBAC group tables
    (`groups`, `group_members(account_id, group_id, role)`, `group_inheritance`;
    `packages/auth/src/schema.ts:5-12`) shared across **all** tenants. Synced rows live in
    per-`database_id` files on separate worker threads. So group state is centralized while the data it
    governs is sharded — "turn RBAC on" is not a toggle.

## Prior art — how this is normally solved

- **Firebase / Supabase:** a **public client key** identifies the project (safe in the browser); the
  **security boundary is a per-user JWT** evaluated against row rules. Apps with their own auth
  register a **third-party asymmetric JWT issuer**; the hosted DB verifies via a **JWKS URL** and
  enforces RLS. Supabase: *"the database … only needs a signed JWT to evaluate RLS,"* and requires
  **asymmetric keys (HS256 unsupported)** with OIDC/JWKS discovery.
  ([Supabase third-party auth](https://supabase.com/docs/guides/auth/third-party/overview),
  [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts))

**Takeaway:** a static shared "API secret" is the wrong primitive for a browser SPA (it leaks to every
user). The right primitive is **a registered tenant JWKS/issuer + short-lived per-user JWTs**, the app
minting and the service verifying. This is proxy-free and keeps the app's branded auth.

## Recommended architecture

### Ownership split
- **CheckList keeps:** its branded BetterAuth (Google/Apple OAuth), billing/Stripe, and **JWT
  issuance** (a plugin on the auth server it already runs). No sync/RBAC/sharing tables.
- **Rowboat (hosted) owns:** sync, storage, per-database isolation, **scope-group RBAC**, **sharing /
  group management**, schema registration + live migration, backup, metering.

### A. Authentication — JWKS bridge (fills G1, proxy-free)

1. CheckList enables the **BetterAuth JWT plugin** (already present in `better-auth@1.5.6` —
   `dist/plugins/jwt`). It exposes `GET /api/auth/jwks` and mints short-lived per-user JWTs
   (`GET /api/auth/token`) with `sub = user.id`. Use **asymmetric keys (EdDSA/ES256)** so rowboat only
   ever holds CheckList's *public* keys. ([better-auth JWT plugin](https://better-auth.com/docs/plugins/jwt))
2. **Rowboat registers CheckList as a JWT issuer** for its subscriber/database: a JWKS URL (or issuer
   discovery) + expected `iss`/`aud`, stored in the control-plane. This is the **dashboard
   "generate / accept / cancel"** the requirement calls for — but as **issuer/JWKS registration +
   rotation + revocation**, not a static bearer secret. Rowboat periodically refetches the JWKS (as
   Supabase does, ~30 min) so key rotation is picked up.
3. **The router's `resolveAuthor` verifies the Bearer JWT** against the tenant's JWKS: check
   signature (by `kid`), `iss`, `aud` (= the database/tenant), `exp`; resolve `author = sub`. Replaces
   the `x-author` stub. Rowboat has **no JWT/JWKS code today** (only HMAC `internal-token`), so this is
   net-new — add a small verifier (e.g. `jose`) at `packages/router` behind the `resolveAuthor` seam.
4. **Browser syncs directly** to `rowboat.rkroll.com/db/:database_id/api/sync` with
   `Authorization: Bearer <jwt>` — **no proxy.** The client refreshes the JWT from CheckList's
   BetterAuth (its session cookie stays same-origin to CheckList).

**JWT claims (decided): minimal.** `sub`, `iss`, `aud` (= the `database_id`/tenant), `exp`, `iat`;
`kid` in the header. Authorization is **not** in the token — rowboat looks up group membership
server-side from the per-database `__group_members` at request time. Rationale: authz stays **fresh**
(revoking a share bites on the next request), tokens stay small, and auth (CheckList) / authz
(rowboat) stay cleanly separated — the issuer never needs to know rowboat's group model (it couldn't
populate group claims authoritatively anyway, since groups are per-database rowboat state). The
per-request lookup is a local CTE in the file the worker already holds open. Matches the
Firebase/Supabase default (JWT = identity, rules = authz). Embedding group/role claims is rejected
(staleness + token bloat + circular dependency on rowboat's group state).

**Security properties:** identity is a signed, short-TTL, audience-scoped token; rowboat never holds a
CheckList signing secret; revocation is JWKS-key removal + short TTL; tenants are isolated by
`iss`/`aud` binding to a `database_id`.

### B. Authorization — scope-group RBAC in the hosted worker (fills G2)

Auth (who) ≠ authz (what they can see). Within one shared database, rowboat must filter by
`owner_group_id`. The blocker is topology: group membership lives in `identity.db`; the worker holds
the per-`database_id` file. Three ways to resolve it:

- **B-opt-1 (recommended): per-database group tables.** Separate two layers. **Account identity /
  credentials** stays external (CheckList's BetterAuth); the data-plane `author` is the opaque JWT
  `sub`, so rowboat stores *no* per-database identity records. **Authorization / group membership**
  moves **into each `<database_id>.db`** — reserved tables `__groups` / `__group_members` /
  `__group_inheritance` (matching the `__`-engine-column convention, excluded from the app's sync
  manifest), keyed by the external `sub`. Then `createRbacAuth`'s recursive CTE runs against the file
  the worker already has open — wire it into `server-buildapp.mjs` (today it passes no `auth`). Group
  creation / sharing / first-sync root-group provisioning write those rows via the sharing/group
  surface (§C). Benefits: no cross-DB/cross-thread query; per-database isolation preserved (tenant A's
  group graph never touches B's); the shared `identity.db` leaves the data-plane authz path entirely
  (no cross-tenant chokepoint); group state travels with the data through the existing per-file backup
  / hydrate / **live-migration**. The data plane needs no shared identity store at all; `identity.db`
  stays, but only for the console/operator auth (decision 2), never consulted by the sync worker.
- **B-opt-2: group memberships as JWT claims.** The JWT carries the user's effective groups; the
  worker enforces from the token. Stateless, but couples authz into the auth issuer (CheckList would
  own group state), and revoking a share lags until token refresh. Rejected as primary — authz should
  live with the data.
- **B-opt-3: shared groups store queried by workers.** Workers query `identity.db`/a groups service
  per request. Reintroduces a cross-tier dependency and latency; breaks per-database isolation.
  Rejected.

**Decision needed:** confirm B-opt-1 (groups become per-database data). This also relocates
CheckList's `createScopeGroup` mint from its backend to a rowboat data-plane/group endpoint.

### C. Sharing / group management (fills G3, proxy-free)

**Decided: extend the existing `@jbroll/rowboat-sharing`** (not a new surface), composing it into the
hosted server, mounted on the **router**,
**scoped by `database_id` and gated by the same tenant JWT**: create/validate/accept/revoke invites,
list/remove collaborators, reader/writer/admin roles keyed on `owner_group_id`, plus **group create /
link** (replacing CheckList's `POST /api/folders/group`). Invites resolve an email → `user.id` on
acceptance; the accepted membership is a group row (per B-opt-1), so the shared folder appears on the
invitee's next sync. Needs an **email transport** wired into the hosted server (today none is passed).
Because the browser calls these with its tenant JWT, **no proxy** is required for sharing either.

### Multi-tenancy shape (decided)
**A `database_id` = one app instance / use case.** subscriber = operator (CheckList), database = the
app instance's shared dataset (one per brand/env — CheckList prod, kjekit, test), authors = end users
(external identity via JWT), scope groups = intra-database authz. CheckList = **one subscriber, one
(multi-user) database, many scope groups** — per-user root group + per-folder groups nested, folders
shared across users *within* the one database. This requires intra-database RBAC (B); a
database-per-user shape is rejected (it cannot express cross-user folder sharing without a
cross-database mechanism rowboat lacks).

**Root-group provisioning (decided):** per-user root groups are **lazily auto-created by rowboat on a
user's first verified author** (the first valid JWT `sub` seen for the database) — the hosted
equivalent of the old `ensureUserRootGroup` signup hook, keyed on first-authenticated-sync rather than
signup. **Not** created at DB-creation (end users are unknown then). DB-creation only records the
database→subscriber (owner) association at the control plane. Guarantees a user's first write has a
scope to land in, with no client-side race. The client still seeds default folders as per-folder
groups nested under that root.

### What CheckList keeps / drops
- **Keeps:** BetterAuth (branded OAuth) + JWT plugin; billing; client-side account-merge data adoption
  (`adopt.ts`) and anon-claim (local until login, then adopt + sync); client-side seeding
  (`seedDefaultFolders`, now minting groups via rowboat's group endpoint).
- **Drops (moves to rowboat):** `mountSyncRoutes`, `registerSyncTable`, `createRbacAuth`,
  `createScopeGroup`, `mountShareRoutes`, `registerShareTables`. Schema is registered via rowboat's
  management API (`POST /v1/databases` + `/schema`) instead of `registerSyncTable` at boot — and gains
  **live migration** (retiring the fresh-start-on-schema-change constraint).

## Security analysis (summary)
- **Spoofing:** eliminated — author is a JWKS-verified, audience-bound, short-TTL JWT (vs. today's
  `x-author` stub).
- **Tenant isolation:** `iss`/`aud` bind a JWT to one `database_id`; the router's status/quota gate and
  per-database file already isolate storage.
- **Least privilege:** RBAC (B) restores per-scope-group read/write inside the shared database.
- **Revocation & rotation:** JWKS key removal + short token TTL; JWKS refetch interval bounds
  rotation lag (document the window). No long-lived secret in the browser, ever.
- **Residual:** JWT TTL vs. revocation latency tradeoff; JWKS-fetch availability (cache last-good);
  clock skew (`exp`/`nbf` leeway).

## Decisions (resolved 2026-07-17)
1. **RBAC topology → B-opt-1.** Authz/group membership moves into per-database reserved tables
   (`__groups`/`__group_members`/`__group_inheritance`) keyed by the JWT `sub`; account credentials
   stay external (CheckList).
2. **`identity.db` → kept, as the rowboat console/website auth.** rowboat.rkroll.com is a real product
   with a dashboard: operators need **human login + sessions (OAuth)** to manage their subscribers and
   databases. `identity.db` provides that better-auth login; `linkSubscriberForUser` maps a session →
   the operator's subscriber in `control-plane.db`. **Management keys (control-plane.db) coexist** for
   CLI/CI/automation (`rowboat --management-key`). The important boundary — the B-opt-1 win — is that
   `identity.db` is **out of the data-plane authz path**: it authenticates rowboat *operators* for the
   console, while *end-user* identity is external (CheckList's JWT) and end-user group membership is
   per-database. So rowboat stores **no end-user identities**, only its own operators'.
3. **Tenancy → a `database_id` is one app instance; multi-user database; lazy per-user root groups**
   auto-created on first verified author. (See Multi-tenancy shape.)
4. **Sharing → extend the existing `@jbroll/rowboat-sharing`**, mounted on the router, JWT-gated,
   operating on the per-database `__group*` tables.
5. **JWT claims → minimal** (`sub/iss/aud/exp/iat`, `kid` header); authz fully server-side.
6. **Token/JWKS lifecycle UX** — console register/rotate/revoke issuer + JWKS refetch interval +
   `aud` convention: approach accepted; exact surface is an implementation detail for phase A.
7. **Sequencing → A (auth) → B (RBAC) → C (sharing)**, each its own spec+plan. A alone ships a
   single-user proof; B and C are required for the shared-checklist product.

## Remaining implementation-level details (per-phase, not blocking)
- Exact console UX + management-API shape for issuer/JWKS register/rotate/revoke, and the JWKS
  refetch interval + clock-skew leeway (phase A).
- JWT verifier library choice (e.g. `jose`) and where the `resolveAuthor` seam plugs it in (phase A).
- Migration of CheckList's client `mintGroup`/`seedDefaultFolders` from `POST /api/folders/group` to
  the rowboat group endpoint; first-sync root-group auto-provision hook location (phase B).
- `rowboat-sharing` changes to target per-database `__group*` tables + email transport wiring (phase C).
- **Server assembly:** unchanged for auth — `identity.db` + `auth-betterauth` + the console stay
  (decision 2). The data-plane change is only wiring the new JWT verifier into the router's
  `resolveAuthor` (phase A) and `createRbacAuth` into the worker (phase B); the console/operator auth
  is untouched.

### Sub-project B — tenant provisioning (landed)

Provisioning is shrink-wrapped in `@jbroll/rowboat-cli` (`provision-tenant` verb: create subscriber →
create database with `compileSchema(shared/schema)` → register the JWT issuer). CheckList consumes it:

- `npm run provision:local` — provisions the local `dev:rowboat` (:3020). Run once; **re-run after a
  `.rowboat-dev/` reset** — the tool detects the wiped tenant and re-bootstraps automatically.
- `npm run provision:prod` — provisions rowboat.rkroll.com (operator step; see the deploy runbook).

Outputs land in a gitignored `rowboat-tenant.<env>.json` (holds the once-shown `managementKey` +
`databaseId` + issuer). The printed `databaseId` / `issuer` / `audience` are what sub-project C wires
into the app's env. The issuer contract: `audience = databaseId`, `jwksUrl`/`issuer` = CheckList's
`/api/auth` — C makes BetterAuth's JWTs conform.

**Deferred follow-ups (from B's final review — non-blocking; harmless until C/D point at the tenant):**
- **Orphaned-subscriber reconciliation.** Two paths mint a *new* subscriber and orphan the old one:
  (a) a partial fresh-bootstrap where `createSubscriber` succeeds but `createDatabase`/`setAuthIssuer`
  then throws — the once-shown `managementKey` is never persisted (the next run bootstraps fresh);
  (b) a re-run where only the database was lost (stale/404) or the key rotated (401). Cheapest
  mitigation: persist `{subscriberId, managementKey}` to the state file immediately after
  `createSubscriber`, before creating the database. Empty orphaned subscribers are harmless here.
- **Runbook caveat.** `DEPLOY_RUNBOOK.md`'s "re-running is safe (reconcile, not re-create)" is true for
  the normal case but a prod re-run after DB loss or key rotation bootstraps a *fresh* tenant — add a
  one-line operator caution when the reconciliation work lands.

### Sub-projects C+D — data-plane cutover (landed)

The browser now syncs and mints scope groups **directly against hosted rowboat**, cross-origin and
cookie-free, carrying a short-lived BetterAuth JWT as `Authorization: Bearer`. CheckList's backend
serves no data plane at all: `mountSyncRoutes`, `registerSyncTable`, `createRbacAuth` and the local
`POST /api/folders/group` mint are deleted, and `@jbroll/rowboat-backend` is off its dependency list.

Two env vars carry the tenant, both produced by `npm run provision:local` / `provision:prod` into
`rowboat-tenant.<env>.json`:

| Var | Consumer | Value |
|---|---|---|
| `VITE_ROWBOAT_SYNC_BASE` | frontend (build-time) | `<rowboatUrl>/db/<databaseId>/api/sync` — `syncWithServer` appends `/sync` and `/pull`; the mint is `/groups` |
| `ROWBOAT_DATABASE_ID` | backend (runtime) | `<databaseId>`, which is the JWT `audience` |

In dev nothing is set by hand: `dev:rowboat` boots the local server, provisions the tenant, and writes
both into `.env.tenant.local`; `dev:frontend` and `dev:backend` run behind `scripts/with-tenant-env.sh`,
which blocks until that file exists and then sources it. For prod, `VITE_ROWBOAT_SYNC_BASE` is exported
in `deploy.conf` (baked into the bundle by `APACHE_BUILD_CMD`) and `ROWBOAT_DATABASE_ID` goes in the
gitignored `backend/secrets.env`.

Two things that are easy to get wrong and produce one blanket symptom each:

- **The registered issuer is the FRONTEND origin, not the backend's.** better-auth mints `iss` from
  its baseUrl (`= FRONTEND_URL`), because the browser reaches `/api/auth` through vite's proxy in dev
  and Apache's in prod. Registering `http://localhost:3001/api/auth` instead 401s *every* sync with no
  other symptom. The `jwksUrl` is the opposite case — rowboat fetches it server-side, so it stays on
  the backend's own `:3001` and must not depend on vite being up.
- **The data-plane CORS allow-list must include `Content-Encoding`.** The client gzips every push body
  and declares it, so a preflight allowing only `Authorization, Content-Type` blocks every push while
  leaving `/pull` (unencoded) working — a half-synced app rather than an obviously broken one.

**Deliberately broken until sub-project E** (do not "fix" these — E cuts them over):
- **Sharing** — `mountShareRoutes` still resolves groups against the local graph, which is now empty.
- **Account-merge** — the group-link step has no local groups to link.
- **Account deletion** — the group-cleanup step likewise.

`registerAuthTables`, `registerShareTables`, `mountShareRoutes` and `mountAccountRoutes` stay wired for
exactly that reason; E replaces the local group backend with `remoteGroupBackend` + the agent JWT and
only then drops them.

### Sub-project E — sharing cutover (landed)

`mountShareRoutes` still runs in CheckList's backend — invites are identity-, email- and
token-bound, which rowboat deliberately knows nothing about — but its `GroupBackend` is now
`remoteGroupBackend` against `<rowboatUrl>/db/<databaseId>/api/sync`. Each call authenticates as the
**acting user**, via a JWT minted with better-auth's server-only `signJWT`, so rowboat's own
`requireAdmin` decides every grant. Granting everything as the agent would have made the caller
always-admin and rowboat's checks vacuous.

The agent (`ROWBOAT_AGENT_ID`, default `agent:checklist`) is installed as admin at invite-create,
authorized by the inviter's real admin, and performs the accept-time grant when the inviter is long
gone. It is **a standing admin on every shared group, and that is accepted**: whoever holds
CheckList's signing key is already able to mint any user's data-plane token, so the agent adds
little marginal exposure. It has no better-auth user row, never syncs, and is filtered out of the
collaborator list and protected from removal — an owner "removing" it would silently break every
pending invite on that group.

Invite links are built from the subscriber's own frontend origin (`shareUrl` on `ShareRouteOpts`),
never rowboat's.

### Sub-project F — account cutover (landed)

The last two local-group-table drivers moved to hosted rowboat, so `registerAuthTables` and the local
`groups`/`group_members`/`group_inheritance` tables are **gone** — `cutover-cd` is mergeable to `main`.

- **Account-merge** now runs `prepare`'s link and `finalize`'s grant through the same
  `remoteGroupBackend` sharing uses (one instance, threaded into the merge routes via
  `mountAuthRoutes(app, { groupBackend })`). The link needed a net-new rowboat primitive: a
  `link`-two-existing-groups writer op + `POST /db/<id>/api/sync/groups/:childGroup/parents` +
  `GroupBackend.link`. Each remote call is awaited **before** its local sync transaction (better-sqlite3
  transactions can't contain `await`); both ops are idempotent so a retry after a failed local step
  converges.
- **Account-deletion is identity-only.** Post-cutover all data-plane access needs a CheckList JWT, so
  deleting the better-auth identity revokes access outright (no user → no token → no author); the
  caller's residual group memberships and owned groups are inert orphans left to deferred data-GC. The
  route now makes **zero** group calls and the merge-component survivor bookkeeping is gone (inheritance
  is group-id-keyed and outlives any one identity).
- **Root groups are no longer provisioned locally.** rowboat lazily provisions a user's root group on
  their first verified sync, so CheckList passes `provisionRootGroup: false` to `createIdentity` — the
  better-auth `user.create.after` hook that used to write the local group tables is disabled.
- `account_merge` (via `registerIdentityTables`) and `share_invites` (via `registerShareTables`) stay
  local — they are CheckList identity state rowboat knows nothing about.

## Non-goals
- Changing CheckList's login/branding (it stays CheckList's BetterAuth).
- A data-plane proxy (only if A proves unworkable).
- Billing in rowboat (stays CheckList's).
- Building this now — this doc decides architecture + sequencing; implementation plans follow per
  phase.
