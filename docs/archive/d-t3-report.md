# D / slice 1: rowboat host wiring (replaces createHierarchyServer)

Branch `rowboat-port-slice-1`. Rewrote `backend/src/index.ts` to stand up an Express app on one
`better-sqlite3` db via rowboat's mount functions, replacing `@jbr-jazz/hierarchy-backend`'s
`createHierarchyServer`. Added the folder-scope-group mint route and a supertest suite that
proves create → sync → scoped-pull with a real better-auth session.

## Host wiring (`backend/src/index.ts`)

`createServer(config: ServerConfig): Promise<RowboatServer>` builds:

1. `new Database(config.dbPath)` — the one db.
2. `registerAuthTables(db)`, `registerShareTables(db)` (`@jbroll/rowboat-auth`,
   `@jbroll/rowboat-sharing`).
3. `initSyncRegistry(db)`, then `compileSchema(folderSchema).manifest` (from
   `src/schema/folder.ts`'s `schema = { folder: Folder }`) → `registerSyncTable(db, table)` per
   entry. `folderSchema` is imported cross-package via a relative path
   (`../../src/schema/folder.js`, i.e. `checklist/src/schema/folder.ts` from
   `checklist/backend/src/index.ts`) — see **tsconfig note** below.
4. `createIdentity({ db, authSecret, baseUrl: `${config.baseUrl}/api/auth`, providers, emailAuth,
   sendEmail, sendVerificationEmail })` from `@jbroll/rowboat-auth-betterauth`, then
   `await identity.registerIdentityTables()` **before** building the app — this is what actually
   creates the `user`/`session`/`account`/`verification` tables (better-auth's own migration API,
   not the old `ensureAuthTables`/`migrate-auth.ts` CLI). Forgetting this `await` was the first
   test failure (`no such table: user`).
5. Express app: `corsMiddleware(trustedOrigins)` (see **CORS** note) →
   `identity.mountAuthRoutes(app)` (mounts better-auth's `/api/auth/*` **before**
   `express.json()` — better-auth reads the raw body) → `app.use(express.json())` →
   `mountSyncRoutes(app, db, { auth: createRbacAuth(db), resolveAuthor: provider.resolveAuthor })`
   → `mountShareRoutes(app, db, { provider, sendEmail })` → `mountAccountRoutes(app, { provider,
   db })` (exported from `@jbroll/rowboat-auth-betterauth` — confirmed present, wired as
   instructed).
6. `POST /api/folders/group`: `const session = await provider.requireAuth(req, res); if
   (!session) return;` (requireAuth already writes 401) → validates `body.parentGroup` is a
   string or absent → `crypto.randomUUID()` → `createScopeGroup(db, { actor: session.user.id,
   group: groupId, parentGroup: body.parentGroup ?? session.user.id })` → `res.json({ groupId
   })`. Defaulting `parentGroup` to the caller's own id nests the new group under the caller's
   auto-provisioned root group (the same root group `ensureUserRootGroup` creates on sign-up),
   which the caller admins by construction, so `createScopeGroup`'s own authority check never
   fires spuriously for the common case.
7. Returns `{ app, db, start() }`; `start()` is `app.listen(config.port, …)`.

`configFromEnv()` maps the original env-driven `BackendConfig` fields 1:1 (port, dbPath,
frontendUrl/baseUrl, authSecret, trustedOrigins, providers, smtp, emailAuth). A guarded
`isMainModule` check (`import.meta.url === file://${process.argv[1]}`) means importing `index.ts`
(as `host.test.ts` does, for `createServer`) never also opens the production db or binds port
3001 — only running it as the actual entrypoint does.

## Exact rowboat fn signatures used (verified against `dist/*.d.ts`, not guessed)

- `createIdentity(config: CreateIdentityOptions): Identity` where `Identity = { provider, auth,
  registerIdentityTables: () => Promise<void>, mountAuthRoutes: (app) => void }` — **not** a bare
  `registerIdentityTables(db)` import as the task brief suggested; the task's standalone form
  exists (`schema.ts`'s `registerIdentityTables(db, migrate)`) but `createIdentity`'s bound
  `identity.registerIdentityTables()` (no args) is what every integration test actually calls,
  and is what this code uses.
- `mountSyncRoutes(app, db: SyncDb, opts?: SyncRouteOpts): { close(): Promise<void> }` —
  `SyncRouteOpts.resolveAuthor: (req) => string | null | Promise<string | null>`, satisfied
  directly by `provider.resolveAuthor`.
- `mountShareRoutes(app, db, opts: ShareRouteOpts)` where `ShareRouteOpts = { provider, roles?,
  sendEmail?, basePath?, shareUrlBase? }`.
- `mountAccountRoutes(app, { provider, db }: MountAccountRoutesOptions)` — confirmed exported
  from `@jbroll/rowboat-auth-betterauth`'s `dist/index.d.ts`; mounted as instructed.
- `createScopeGroup(db, { actor, group, parentGroup? }, config?): string` — returns the group id
  (unused; the route mints its own `groupId` up front and passes it as `group`).
- `compileSchema(tables: Record<string, TableSchema>): { manifest: TableManifest[]; relations }`.

## Jazz / billing removed

Deleted from `index.ts`: the Node<21 `WebSocket` polyfill (Jazz-only requirement), `import type
{ BackendConfig } from '@jbr-jazz/hierarchy-shared'`, `createHierarchyServer`,
`setupLimitCheckRoute` (`@jbr-jazz/billing-backend`), `initBillingDb` (`./db.js`),
`ensureAuthTables` (`./migrate-auth.js`), `setupBillingRoutes`/`setupStripeWebhook`
(`./billing/routes.js`), `jazzApiKey`/`jazzAgentAccountId`/`jazzAgentSecret` config fields,
`accountLinking`, `registerRawRoutes` (Stripe webhook), `accountDeletionCleanup` (billing-table
cleanup hook). **Not deleted** (out of scope, still present as files, just no longer wired from
`index.ts`): `backend/src/db.ts`, `backend/src/migrate-auth.ts`, `backend/src/billing/**`,
`backend/src/migrations/subscriptions.sql`. They still compile (still reference `@jbr-jazz/*`,
which remains an installed dependency) but are dead code from `index.ts`'s perspective — slice-2
territory per the task's framing ("billing/stripe wiring is out of slice-1").

## Dependency/version fixes required (discovered via `tsc`/runtime failures, not assumed)

- **`better-auth` stayed at `1.5.6`** — checklist pins `1.5.6` exactly, rowboat's
  `auth-betterauth` wants `^1.5.6`; both resolve to the same installed `1.5.6`. No bump needed,
  no duplicate-instance conflict (rowboat owns the only `betterAuth()` call now).
- **`express` bumped `^4.21.2` → `^5.2.1`** (not anticipated by the task brief). Every rowboat
  package (`backend`, `auth-betterauth`, `sharing`, …) declares `express: ^5.0.0` and
  `auth-betterauth`'s `mount.ts` uses Express 5's named-wildcard route syntax
  (`app.all("/api/auth/*splat", …)`). Under checklist's old Express 4 + `path-to-regexp@0.1.x`,
  that pattern doesn't parse as a wildcard — every better-auth request 404'd (`sign-up/email` →
  404). Bumping to Express 5 (already the version `@types/express@^5.0.5` was written against —
  that mismatch predates this change) fixed it; all 117 backend tests (117 pre-existing +
  `host.test.ts`) still pass, so no other Express-4-specific code in `backend/src/**` broke.
- **Added `@types/cors` and `@types/nodemailer`** as devDependencies (both were missing; `cors`
  and `nodemailer` were already runtime deps but untyped, causing `tsc` failures on my code).
- **Did not end up using the `cors` package.** Wrote a small allow-list `corsMiddleware()`
  instead (same trusted-origins behavior as the pre-port config), to avoid growing the `cors`
  dependency surface for what's a ~15-line reflected-origin check. `cors` is still a listed dep
  (untouched) but no longer imported from `index.ts`.

## `boolean` columns are wire-level 0/1, not JS `true`/`false`

Discovered via a `writeDecision` crash (`SQLite3 can only bind numbers, strings, bigints,
buffers, and null`): `rb.bool()` compiles to manifest type `"boolean"`, which the backend maps to
a plain SQLite `INTEGER` column with **no** JS-boolean → int coercion in the write path. A pushed
row's `archived`/`expanded` fields must be `0`/`1`. `host.test.ts`'s `folderRow()` sends `0`/`1`
with a comment; any future `folder` producer (client-side or otherwise) needs the same. This is a
correctness fact about the shipped engine, not something slice-1 changed.

## `tsconfig.json` rootDir removed (needs a real fix before a production build)

`compileSchema(folderSchema)` needs `checklist/src/schema/folder.ts`, which lives outside
`backend/`'s own `src/` tree. `backend/tsconfig.json` had `"rootDir": "./src"`, which made `tsc`
hard-error (`TS6059`) the moment `index.ts` imported anything outside it. Removed the `rootDir`
key so `--noEmit` type-checking passes. **This is not yet build-safe**: `backend/package.json`'s
`build` script is `tsc && cp -r src/migrations dist/`, and without an explicit `rootDir` a real
(non-`--noEmit`) `tsc` run will compute the common ancestor of all included files (now including
`checklist/src/`) and change `dist/`'s layout — `dist/index.js` would move, breaking `npm start`
(`node dist/migrate-auth.js && node dist/index.js`) and `deploy-backend`'s expectations. Flagging
as a **slice-2 follow-up**: either (a) give backend a proper `rootDir: ".."`-relative build with a
corrected `outDir`/`start` script, or (b) stop cross-importing the frontend's `folder.ts` and
instead have backend depend on a schema-only package (no `@jbroll/rowboat-react` in the import
graph) that both frontend and backend consume — cleaner, and avoids coupling backend's build to
`checklist/src`'s layout at all. Did not attempt either today; out of slice-1's stated scope
(supertest-verify the flow), but noted here because it blocks `npm run build:backend` today.

## TDD evidence

`backend/src/__tests__/host.test.ts` written first; watched it fail three times for real reasons
before it passed:

1. `expected 200, got 404` on sign-up — Express 4/5 route-syntax mismatch (see above).
2. `expected 200, got 500` / `no such table: user` — forgot
   `await identity.registerIdentityTables()` in `createServer`.
3. `expected 200, got 500` — pushed `archived: false`/`expanded: true` as JS booleans; SQLite
   bind error in `writeDecision` (see above).

Final green run:

```
$ npx vitest run src/__tests__/host.test.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Full backend suite after the change: `npx vitest run` → **6 files, 117 tests, all passed**
(includes the 5 pre-existing suites: `migrate-auth`, `security`, `billing`, `billing/subscription`,
`billing/routes` — unaffected by the Express 5 bump or the `index.ts` rewrite).

`npx tsc --noEmit -p backend/tsconfig.json` → **zero errors** for the whole backend, including
the still-jazz-wired files (`db.ts`, `migrate-auth.ts`, `billing/**`) — they compile because
`@jbr-jazz/*` remains installed; nothing needed fixing there for slice-1.

## Remaining backend files still needing the port (not touched today)

- `backend/src/db.ts` (`initBillingDb`) — billing tables, unrelated to identity/sync; fine as-is
  once billing is ported in a later slice.
- `backend/src/migrate-auth.ts` — now redundant for the core better-auth tables (rowboat's
  `registerIdentityTables` owns that migration); still creates jazz-plugin-only columns
  (`accountID`, `encryptedCredentials`) that nothing reads anymore. `package.json`'s `start`
  script still runs it first (harmless — idempotent — but dead weight). Candidate for deletion
  once billing/account-linking are ported or explicitly dropped.
- `backend/src/billing/{routes,subscription,stripe}.ts` — still import
  `@jbr-jazz/hierarchy-backend` (`ApiErrors`, `RateLimiter`) and are entirely unwired from the new
  `index.ts`. Explicitly out of slice-1 per the task brief.
- `backend/src/migrate.ts` — not inspected; likely another jazz-era CLI, unverified.

## Files touched

- `backend/src/index.ts` — rewritten (this report's subject).
- `backend/src/__tests__/host.test.ts` — new supertest suite.
- `backend/tsconfig.json` — dropped `rootDir` (see note above).
- `backend/vitest.config.ts` — added `src/__tests__/**/*.test.ts` to `include`.
- `backend/package.json` / `backend/package-lock.json` — `express` `^4.21.2` → `^5.2.1`; added
  `@types/cors`, `@types/nodemailer` devDependencies.
