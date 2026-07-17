# Deploying CheckList on hosted rowboat (rowboat.rkroll.com) — architecture design

**Date:** 2026-07-17
**Status:** design / decision doc (no implementation plan yet — sequencing decided after review)
**Scope:** the rowboat capabilities required to run CheckList against a hosted `@jbroll/rowboat-server`
instead of the embedded-library backend, without a per-request proxy, while CheckList keeps its own
branded auth.

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

- **Jazz (what CheckList was built on):** the sync server is **untrusted**. Edits are Ed25519-signed,
  data is encrypted so only group members can read; local-first auth has the client **self-sign a JWT
  the server verifies without a server-side session store**. The app's cloud API key is *public*
  (identifies the app for billing/limits), not the security boundary — the cryptography is.
  ([auth](https://jazz.tools/docs/react/key-features/authentication/overview),
  [encryption](https://jazz.tools/docs/react/reference/encryption))
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
  / hydrate / **live-migration**. `identity.db` keeps only its console-plane role.
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

Compose `@jbroll/rowboat-sharing` (or an equivalent) into the hosted server, mounted on the **router**,
**scoped by `database_id` and gated by the same tenant JWT**: create/validate/accept/revoke invites,
list/remove collaborators, reader/writer/admin roles keyed on `owner_group_id`, plus **group create /
link** (replacing CheckList's `POST /api/folders/group`). Invites resolve an email → `user.id` on
acceptance; the accepted membership is a group row (per B-opt-1), so the shared folder appears on the
invitee's next sync. Needs an **email transport** wired into the hosted server (today none is passed).
Because the browser calls these with its tenant JWT, **no proxy** is required for sharing either.

### Multi-tenancy shape
CheckList = **one subscriber, one database, many scope groups** (root group per user, per-folder groups
nested; folders shared across users within the one database). This *requires* intra-database RBAC
(B) — a database-per-user shape cannot express cross-user folder sharing and is rejected.

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

## Open decisions (resolve before any plan)
1. **RBAC topology:** confirm **B-opt-1** — authz/group membership moves into per-database reserved
   tables (`__groups`/`__group_members`/`__group_inheritance`) keyed by the JWT `sub`; `identity.db`
   becomes console-plane only; account credentials stay external (CheckList). Highest-impact call.
2. **Sharing home:** compose the existing `rowboat-sharing` into the hosted server vs. a new
   router-native group/sharing surface (given B-opt-1 changes where group rows live).
3. **JWT claims:** minimal (`sub/iss/aud/exp`) with authz fully server-side (preferred), vs. any
   group/role claims.
4. **Provisioning first-sync:** does rowboat auto-create a user's root group on first verified author,
   or does CheckList seed it via a group endpoint?
5. **Token/JWKS lifecycle UX:** exact console surface for register/rotate/revoke issuer + refetch
   interval + `aud` convention.
6. **Sequencing:** A (auth) is independently shippable and unblocks a single-user proof; B and C are
   required for the shared-checklist product. Recommended order: **A → B → C**, each its own spec+plan.

## Non-goals
- Changing CheckList's login/branding (it stays CheckList's BetterAuth).
- A data-plane proxy (only if A proves unworkable).
- Billing in rowboat (stays CheckList's).
- Building this now — this doc decides architecture + sequencing; implementation plans follow per
  phase.
