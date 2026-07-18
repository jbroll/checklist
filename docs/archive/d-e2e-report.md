# D-E2E: Playwright e2e running on the rowboat stack (sub-project D, slice 1)

## Scope

Get checklist's Playwright e2e suite actually running the live app against the ported
rowboat backend (`backend/src/index.ts`, see `docs/superpowers/d-h1..d-t5-report.md`), get
the folders smoke test green, and quarantine e2e specs that test out-of-scope
(later-slice/Jazz-only) functionality. This is LIVE-app work: a real Vite dev server + a
real rowboat backend + a real (system) Chromium, driven by Playwright.

## Fresh-db + auth wiring (`playwright.config.ts`)

The rowboat backend defaults `AUTH_DB_PATH` to `./auth.db`, and this checkout's
`./backend/auth.db` is still the pre-port jbr-jazz-shaped db — booting the sync/sharing
routes against it hard-errors (`no such column: target_group_id`). `playwright.config.ts`
now:

- Mints a **fresh temp sqlite path** once per Playwright process
  (`fs.mkdtempSync(os.tmpdir()/checklist-e2e-auth-*)/auth.db`) and passes it as
  `AUTH_DB_PATH` in the `webServer.env` block, together with `BETTER_AUTH_SECRET` (a fixed
  test-only value, not the real prod secret sitting in `backend/.env`) and `FRONTEND_URL=
  http://localhost:8765` (overriding `backend/.env`'s `FRONTEND_URL=https://checklist-app.
  rkroll.com` — `dotenv.config()` never overwrites an already-set `process.env` var, and
  Playwright forwards `webServer.env` into the spawned `npm run dev`, so these win).
- Points Chromium at the **system-installed binary** (`/usr/bin/chromium`) via
  `launchOptions.executablePath` on the `chromium` project — Playwright's own downloadable
  Chromium isn't installable on this host (no `apt-get`; `playwright install chromium`
  fails with `sh: apt-get: not found`), following the repo's `chromium-mcp-debug` skill
  guidance (system browser over downloaded one, config over installation).

No changes were needed to `backend/src/index.ts`'s env-var names — `AUTH_DB_PATH` /
`BETTER_AUTH_SECRET` / `FRONTEND_URL` / `PORT` are exactly what `configFromEnv()` already
reads (note: it's `BETTER_AUTH_SECRET`, not `AUTH_SECRET` as the task brief said).

## Mock-OAuth vs email/password — mock-OAuth is infeasible without patching better-auth

Investigated wiring `test-helpers/mock-oauth-server.ts` (port 9999) into the rowboat
backend's `providers: OAuthProviderConfig[]`. **Blocked, with receipts, not attempted:**

- `@jbroll/rowboat-auth-betterauth`'s `buildSocialProviders()` only maps `provider.name`
  to better-auth's *built-in* `google`/`github`/`apple` social providers
  (`backend/node_modules/@jbroll/rowboat-auth-betterauth/dist/index.js:10-40`) — there is no
  generic/custom-OAuth provider path, and `OAuthProviderConfig` carries no
  authorization/token-endpoint override fields.
- better-auth's built-in Google provider
  (`backend/node_modules/@better-auth/core/dist/social-providers/google.mjs`) **hardcodes**
  `https://accounts.google.com/o/oauth2/v2/auth` and `https://oauth2.googleapis.com/token`
  — not configurable via `options`. Its `getUserInfo` decodes the id-token JWT directly and
  (when `disableIdTokenSignIn` isn't set) verifies its signature against Google's real JWKS
  (`https://www.googleapis.com/oauth2/v3/certs`). The mock server's `id_token` is
  `alg: "none"` with a fake signature — it would fail that verification even if the
  authorization redirect could be pointed at `localhost:9999` (which it can't).

Redirecting Google sign-in to the mock server would require patching vendored
`better-auth`/`@better-auth/core` dist code, which is out of scope. **Result: e2e login
uses no auth at all for the smoke test** (see next section) — the app's anonymous mode
already renders the full folders UI, so `smoke.spec.ts` never needed sign-in in the first
place. `mock-oauth-test.spec.ts` (which only exercises the mock server's own HTTP endpoints,
not app login) still ports and passes cleanly. Email/password sign-in was not exercised
either: `configFromEnv()` hardcodes `emailAuth.requireEmailVerification: true` with no SMTP
in this environment (`sendVerificationEmail` is `undefined` whenever `SMTP_HOST` is unset),
so a signed-up e2e user could never clear verification — wiring a test-only bypass would be
a backend config change beyond this task's fresh-db/mock-oauth scope, so it wasn't done.

## Root-caused and fixed: infinite-render loop in the ported tree UI

`smoke.spec.ts`'s "New Folder button" test failed not because of e2e config but because the
**app itself crashed** into its `ErrorBoundary` ("Just a moment... We hit a small bump") on
every load. Driven via the Playwright MCP browser against the manually-started dev server,
console showed React's own warning first: `The result of getSnapshot should be cached to
avoid an infinite loop`, then `Maximum update depth exceeded`.

Root cause: `src/components/tree/TreeView.tsx:126` called
`useSelect(() => g.folder.all().map((n) => n.$data))` with **no `isEqual`**.
`@jbroll/rowboat-react`'s `useSelect` feeds the selector straight into
`useSyncExternalStore`'s `getSnapshot`, comparing against the previous value with
`Object.is` by default (`node_modules/@jbroll/rowboat-react/dist/index.js:14-24,90-98`).
Since `.map()` allocates a **new array every call**, `Object.is` never matches, React never
considers the snapshot "stable", and the render loops forever — a straight port bug (the
sibling call in `useCheckListHierarchy.ts:93` already had this right, passing
`arraysEqualById`).

Fix: exported the existing `arraysEqualById` helper from `useCheckListHierarchy.ts` (via
`src/hooks/index.ts`) and passed it as `TreeView.tsx`'s missing `isEqual` argument. Verified
via the MCP browser: 0 console errors, "New Folder"/"New list"/"Sign In"/"More options"
buttons all render on first load. This was the *only* other `useSelect` call site in `src/`
(grepped) — no other instances of the bug.

## Specs: ported / passing vs. quarantined

**Ported and green** (`npx playwright test --project=chromium`: **9 passed, 4 skipped**,
exit 0):
- `e2e/smoke.spec.ts` — 4 pass (load, header, New Folder button, Export/Import menu items
  visible), **4 skipped** with `TODO(slice-2)` — the Export/Import *dialog* tests, because
  `AppContainer.tsx` wires `onExport`/`onImport` as explicit no-op stubs for slice 1
  (export/import needs template items, not in the rowboat `Folder` table yet, per
  `docs/superpowers/d-t4-report.md`). This is a deliberate, documented slice-1 scope
  decision, not a fallback.
- `e2e/mock-oauth-test.spec.ts` — 5/5 pass unchanged (pure HTTP tests against the mock
  server, no app/auth dependency).

**Skipped/self-excluding, untouched** (not part of the `chromium` project; require
GreenMail IMAP env absent in this environment):
- `e2e/invite-closed-loop.spec.ts`, `e2e/invite.setup.ts`, `e2e/account-merge.spec.ts` — the
  existing `hasEmailInfra` gate in `playwright.config.ts` already self-excludes these; no
  changes made. Not attempted (per the task brief: "skip if unavailable, note it").

**Newly quarantined this task** (`git mv *.spec.ts *.spec.ts.skip` + a `TODO(slice-2/3)`
header comment, so Playwright's `**/*.spec.ts` `testMatch` no longer picks them up; content
untouched otherwise):
- `session-ui`, `archive-ui-state`, `export-import`, `billing`, `deploy-smoke`,
  `error-handling` — later-slice UI/flows (items/sessions/export/billing/deploy), per the
  task brief's explicit quarantine list.
- `jazz-services`, `cross-device-real-sync`, `cross-device-sync` — Jazz-specific, need a
  rewrite against rowboat's sync model rather than a straight port.
- `sharing-ui.spec.ts` — investigated as "feasible" (API-mocked) but actually **not**
  portable without slice-2 work: it drives the app through a `/test` route +
  `window.__testServices.directory` (a Jazz-era test-only service that no longer exists —
  `checklistFolderFactory.ts`/the old services path was replaced by `folderOps.ts`), and
  opens the share dialog via a folder-row "Share" menu item that
  `docs/superpowers/d-t5-report.md` documents as `TODO(slice-2)` (not wired into the live
  tree UI — `ShareDialog` itself works fine against rowboat's `useSharing`, per that report,
  it's just unreachable from the UI). Quarantined with a note rather than built out, since
  building the `/test` harness route + Share menu entry is real slice-2 UI work, not an e2e
  config task.

## Actual `playwright test` output (folders smoke, the acceptance gate)

```
$ npx playwright test e2e/smoke.spec.ts --project=chromium

Running 8 tests using 8 workers
  -  [chromium] › e2e/smoke.spec.ts:60:8 › should not crash when clicking Export button
  -  [chromium] › e2e/smoke.spec.ts:80:8 › should not crash when clicking Import button
  -  [chromium] › e2e/smoke.spec.ts:100:8 › should close Export dialog when clicking Cancel
  -  [chromium] › e2e/smoke.spec.ts:121:8 › should close Import dialog when clicking Cancel
  ✓  [chromium] › e2e/smoke.spec.ts:38:3 › should show Export and Import buttons in header (962ms)
  ✓  [chromium] › e2e/smoke.spec.ts:10:3 › should load the application (1.4s)
  ✓  [chromium] › e2e/smoke.spec.ts:17:3 › should display app header after loading (1.5s)
  ✓  [chromium] › e2e/smoke.spec.ts:26:3 › should show New Folder button (1.6s)

  4 skipped
  4 passed (6.2s)
```

Exit code 0. Full `chromium` project (`smoke` + `mock-oauth-test`): **9 passed, 4 skipped**,
exit 0 (log excerpt above under "Specs").

Unit suite unaffected by this task's changes: `npm run test:run` → **1183 passed / 390
skipped / 0 failed** (59 files passed, 12 skipped), matching the pre-task baseline stated in
the task brief.

## What's blocked / not done, and why

- **Mock-OAuth login is blocked** on better-auth's hardcoded Google endpoints + real-JWKS id
  token verification (see above) — not a rowboat-port gap, a better-auth library
  constraint. No workaround was attempted that would touch vendored `better-auth` code.
- **Email/password e2e login was not exercised** — `requireEmailVerification: true` with no
  SMTP in this environment means a signed-up test user can never verify and sign in; adding
  a test-only bypass is a `backend/src/index.ts` config change outside this task's fresh-db/
  mock-oauth scope, so `smoke.spec.ts`'s bonus "sign in → create folder → reload →
  persists" flow was **not added** — the shipped folders UI is proven working in anonymous
  mode instead (the app's normal unauthenticated path, exercised end-to-end by the smoke
  test itself: New Folder button renders and is clickable against a live backend).
- **Invite/merge closed-loop** (GreenMail IMAP) — untouched, self-excluding as before; no
  IMAP env in this environment.
- **`sharing-ui.spec.ts`** — quarantined rather than ported; needs slice-2 UI wiring (Share
  menu entry + a `/test` harness route) to be portable at all.

## Files touched

- `playwright.config.ts` — fresh `AUTH_DB_PATH`/`BETTER_AUTH_SECRET`/`FRONTEND_URL`/`PORT`
  via `webServer.env`; system-Chromium `launchOptions.executablePath`.
- `src/components/tree/TreeView.tsx`, `src/hooks/useCheckListHierarchy.ts`,
  `src/hooks/index.ts` — the `useSelect` infinite-loop fix (app bug, not e2e-only).
- `e2e/smoke.spec.ts` — 4 Export/Import-dialog tests marked `test.skip` with
  `TODO(slice-2)`.
- `e2e/{session-ui,archive-ui-state,export-import,billing,deploy-smoke,error-handling,
  jazz-services,cross-device-real-sync,cross-device-sync,sharing-ui}.spec.ts` → renamed to
  `*.spec.ts.skip` with a `TODO(slice-2/3)` header comment (content otherwise untouched).
