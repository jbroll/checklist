# CheckList tenant provisioning — design (sub-project B of the hosted-rowboat cutover)

**Date:** 2026-07-20
**Status:** design (approved 2026-07-20; plan follows)
**Depends on:** sub-project A (deploy rowboat.rkroll.com + local-dev harness) — landed
(checklist `62861b2`, rowboat `9e76aa9`). Engine phases A/B/C landed on rowboat `main`.
**Design/decomposition parent:** `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md` → section "B".

## Goal

Provision CheckList's tenant on a hosted `@jbroll/rowboat-server`: create the **subscriber**, create
the **database** with CheckList's compiled schema manifest, and register the **JWT auth issuer** for
that database. Runs against the local dev server (`http://localhost:3020`) and prod
(`https://rowboat.rkroll.com`). After B, the tenant exists and its issuer contract is registered —
but nothing is pointed at it yet (that is C/D).

## Guiding decision — the mechanism ships from rowboat

The provisioning **mechanism** is shrink-wrapped in the rowboat project (the `@jbroll/rowboat-cli`
package) and is subscriber-agnostic. The **only subscriber-dependent input is the schema**
(`shared/schema.ts`), plus per-environment config values (control-plane URL, JWKS URL, issuer). A
subscriber (CheckList) consumes the tool, feeds it its schema + env config, and stores the outputs.
This keeps every other subscriber's bootstrap identical and puts the control-plane API knowledge in
one place — rowboat.

## Control-plane API this consumes (verified, `packages/control-plane/src/routes.ts`)

| Step | Route | Auth | Body | Returns |
|---|---|---|---|---|
| Create subscriber | `POST /v1/subscribers` | none (bootstrap exception) | `{ name, billingEmail? }` | `{ subscriberId, managementKey }` |
| Create database | `POST /v1/databases` | `Bearer <managementKey>` | `{ name, schemaManifest: TableManifest[] }` | `{ databaseId }` |
| Register issuer | `PUT /v1/databases/:id/auth-issuer` | `Bearer <managementKey>` | `{ jwksUrl, issuer, audience }` | `{ ok: true }` |
| Migrate schema | `POST /v1/databases/:id/schema` | `Bearer <managementKey>` | `{ schemaManifest, dryRun? }` | `{ schemaVersion, noop? }` / dry-run plan |

- **`managementKey` is shown exactly once** (`POST /v1/subscribers` returns the plaintext; the server
  stores only its SHA-256 hash — there is no retrieval endpoint). It must be captured and persisted at
  provision time, and it is the credential for every subsequent step and re-run.
- `resolveAuthor` (JWT mode, `packages/server/src/jwt-author.ts`) reads the per-database
  `{ jwksUrl, issuer, audience }` at sync-request time and `jwtVerify`s the Bearer token against it,
  returning `payload.sub` as the author. A partial issuer config is treated as unconfigured
  (fail-closed). The JWKS is fetched lazily on the first sync request — so registering an issuer whose
  `jwksUrl` does not resolve yet (CheckList's `/api/auth/jwks`, which lands in C) is harmless in B.

## What exists vs. what B adds (rowboat `@jbroll/rowboat-cli`)

Already present: `compile` (`compileManifest(schemaModule)` → dynamic-imports a module exporting
`schema`, returns `TableManifest[]`), `provision` (`createDatabase`), `migrate` (`submitSchema`), and
`createSchemaClient(baseUrl, managementKey)` → `{ submitSchema, createDatabase }`. There is **no**
wrapper for subscriber creation or issuer registration.

B adds, in `@jbroll/rowboat-cli`:

1. **`createSubscriber(baseUrl, { name, billingEmail? }, fetchFn?)`** — a standalone function (NOT a
   `SchemaClient` method: subscriber creation is keyless and *returns* the key). `POST /v1/subscribers`;
   returns `{ subscriberId, managementKey }`; throws on non-2xx with the server's error message.
2. **`setAuthIssuer(databaseId, { jwksUrl, issuer, audience })`** — a new method on `SchemaClient`
   (keyed). `PUT /v1/databases/:id/auth-issuer`; resolves on `{ ok: true }`; throws on non-2xx.
3. **`provisionTenant(config, deps)`** — the orchestrator (importable function + a `provision-tenant`
   CLI verb). Idempotent, driven by a **state file** the caller names. See below.

### `provisionTenant` — inputs, state file, behavior

Config: `{ controlPlaneUrl, schemaModule, name, jwksUrl, issuer, statePath, billingEmail? }`.
`audience` is not an input — it is always the `databaseId` this tenant's database got.

State file (JSON at `statePath`, caller-owned, holds the secret):
```json
{ "subscriberId": "sub_…", "managementKey": "…", "databaseId": "db_…",
  "jwksUrl": "…", "issuer": "…", "audience": "db_…" }
```

Behavior (idempotent, re-runnable):
- **Compile** the manifest from `schemaModule` (`compileManifest`).
- **No state file** → *fresh bootstrap*: `createSubscriber` → `createDatabase(name, manifest)` →
  `setAuthIssuer(databaseId, { jwksUrl, issuer, audience: databaseId })` → write the state file.
- **State file present** → *reconcile*: verify the stored `databaseId` still exists by a
  `submitSchema(databaseId, manifest, { dryRun: true })` probe. On success → apply a real
  `submitSchema` (a no-op if the schema is unchanged; a live migration if it changed) and re-assert
  `setAuthIssuer` (picks up any changed `jwksUrl`/`issuer`), then rewrite the state file.
- **Stored `databaseId` probe returns 404/401** (e.g. the local scratch `ROWBOAT_ROOT` was wiped) →
  treat the state as stale, discard it, and run a fresh bootstrap. This makes `provision:local` robust
  to a `.rowboat-dev/` reset without a manual state delete.
- Prints a **non-secret summary** to stdout: `databaseId`, `controlPlaneUrl`, `issuer`, `audience`
  (the values sub-project C wires into the app's env). Never prints the `managementKey`.

`deps` carries `fetchFn`, a `print`/`printError` pair, and a state-store (read/write/delete of
`statePath`) so the orchestrator is unit-testable without real I/O.

### CLI verb

`rowboat provision-tenant --schema <module> --name <name> --jwks-url <url> --issuer <iss> --state <file>`
with the control-plane URL from `--control-plane-url` or `ROWBOAT_CONTROL_PLANE_URL`. **No
`ROWBOAT_MGMT_KEY` is read** — the key is minted on first run and thereafter read from the state file.
That is the shrink-wrapped contract: the caller never handles the management key.

## What CheckList adds (thin consumer)

- **Dev-dependency** `@jbroll/rowboat-cli` (`file:../rowboat/packages/rowboat-cli`, consistent with
  the other `file:../rowboat/*` deps).
- **Per-env config (non-secret), committed** — a small map, `local` and `prod`:
  - `local`: `controlPlaneUrl=http://localhost:3020`, `jwksUrl=http://localhost:3001/api/auth/jwks`,
    `issuer=http://localhost:3001/api/auth`, `name=checklist-local`, `state=rowboat-tenant.local.json`
  - `prod`: `controlPlaneUrl=https://rowboat.rkroll.com`,
    `jwksUrl=https://checklist-app.rkroll.com/api/auth/jwks`,
    `issuer=https://checklist-app.rkroll.com/api/auth`, `name=checklist`, `state=rowboat-tenant.prod.json`
- **npm scripts** `provision:local` and `provision:prod` that run the `provision-tenant` verb under
  `tsx` (so the TypeScript `shared/schema.ts` module imports cleanly, same as the `dev:rowboat`/backend
  tsx usage), passing `shared/schema.ts` + the env config.
- **Outputs** land in a **visible, gitignored** `rowboat-tenant.<env>.json` at the repo root (NOT a
  dotfile — but still gitignored because it holds the once-shown `managementKey`). `.gitignore` gets
  `rowboat-tenant.*.json`.
- **Docs**: `docs/HOSTED_ROWBOAT.md` gets a "Sub-project B — provisioning" note (how to run
  `provision:local`, that a `.rowboat-dev/` reset auto-rebootstraps, and the state-file/secret
  handling); the prod runbook (`../rowboat/packages/server/DEPLOY_RUNBOOK.md`) gets a "provision the
  tenant" step after first deploy.

## The issuer contract (pinned here; C conforms)

- `audience` = the `databaseId` (only known after the database is created).
- `jwksUrl` = CheckList's `<auth-base>/api/auth/jwks`.
- `issuer` = CheckList's `<auth-base>/api/auth`.

Sub-project C enables BetterAuth's `jwt` plugin and must make the minted per-user JWT carry exactly
this `iss`/`aud` and serve JWKS at that URL. If C finds BetterAuth stamps a different `iss`, the fix
is one line of env config + a `provision:*` re-run (which re-asserts the issuer idempotently) — not a
code change here.

## Ownership / boundaries

- **rowboat `@jbroll/rowboat-cli`**: the entire provisioning mechanism (the two new API wrappers + the
  idempotent orchestrator + the CLI verb). Subscriber-agnostic. Lands in the `wt2` worktree, via
  `scripts/land.sh wt2`.
- **CheckList**: the schema (`shared/schema.ts`, unchanged), the per-env config, the npm scripts, the
  gitignore entry, and the docs. Lands on a CheckList branch → `main`.

## Testing

- **rowboat** (matches the repo's existing integration pattern — a real in-process assembled server
  via `startServer`, plus fetch-level unit tests):
  - `createSubscriber`: returns `{ subscriberId, managementKey }` from a live `POST /v1/subscribers`;
    surfaces the server error on a bad request.
  - `setAuthIssuer`: a live `PUT` succeeds and the config is then honored (a subsequent JWT sync with a
    matching `iss`/`aud` resolves an author; a mismatched one 401s) — or, at minimum, that the stored
    config round-trips via `getDatabaseAuthConfig`.
  - `provisionTenant`: the three branches against a live server — (a) fresh bootstrap writes a state
    file with a real `subscriberId`/`databaseId` and a registered issuer; (b) re-run with the state
    file is a schema no-op + issuer re-assert and does **not** create a second subscriber/database;
    (c) a state file whose `databaseId` is absent on the server triggers a fresh re-bootstrap.
- **CheckList**: a `provision:local` smoke against the running `dev:rowboat` — creates the tenant,
  writes a gitignored `rowboat-tenant.local.json` containing a `db_…` id, prints the `databaseId`; a
  second `provision:local` is a no-op that reuses the same `databaseId`.

## Non-goals

- No kjekit / multi-brand (kjekit is deprecated). CheckList brand only.
- No auto-provision on `npm run dev` boot — `provision:local` is an explicit manual step.
- No client repoint, JWT minting, data-plane, or sharing changes (those are C/D/E).
- No management-key rotation tooling (operational; the key lives in the gitignored state file / prod
  secrets).

## Risks / open items (resolved in the plan)

- **TS schema module under the CLI**: `compileManifest` does `await import(schemaModule)`; running the
  verb under `tsx` makes `shared/schema.ts` importable. The plan pins the exact `tsx` invocation.
- **Local staleness**: handled by the dry-run existence probe + re-bootstrap (above), so a wiped local
  server never wedges `provision:local`.
- **Exact prod auth base / issuer string**: taken as config inputs, re-assertable on a re-run; final
  confirmation is C's responsibility.
