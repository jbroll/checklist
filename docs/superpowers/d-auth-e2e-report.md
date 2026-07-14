# D-AUTH-E2E: unblocking authenticated e2e for the rowboat port (sub-project D)

## Scope

`d-e2e-report.md` got the folders smoke test green, but only anonymously — mock-OAuth is
infeasible (better-auth hardcodes Google's endpoints) and real email/password signup was
blocked by `requireEmailVerification: true` with no SMTP in some envs. This slice adds a
test-only switch to disable the verification requirement, wires it into the CI e2e env, and
adds an authenticated e2e spec that exercises the real rowboat backend under a real session.

## 1. Test-only verification switch (`backend/src/index.ts`)

`configFromEnv()` reads `process.env.CHECKLIST_TEST_AUTH === '1'` into `isTestAuth` and sets
`emailAuth.requireEmailVerification: !isTestAuth`. `emailAuth.enabled` was already
unconditionally `true`. Unset (prod, dev, and any CI job that doesn't explicitly opt in),
`requireEmailVerification` is `true` exactly as before — this is a named explicit switch, not
a default or silent fallback, and it only ever *relaxes* a requirement, never bypasses auth
itself (a session cookie is still only issued by better-auth's real sign-up/sign-in routes).

**`createIdentity` forwards `requireEmailVerification` correctly — no rowboat-side gap.**
Verified in the built dist, not just the `.d.ts`:

```
$ grep -n "requireEmailVerification" ~/src/rowboat/packages/auth-betterauth/dist/*.js
75:      requireEmailVerification: opts.emailAuth.requireEmailVerification,
```

`backend/src/index.ts`'s `createServer()` passes `config.emailAuth` straight through to
`createIdentity({ ..., emailAuth: config.emailAuth })`, and rowboat's `auth-betterauth`
package forwards `emailAuth.requireEmailVerification` into better-auth's
`emailAndPassword.requireEmailVerification` unmodified. With it `false`, better-auth's
sign-up route takes the `shouldSkipAutoSignIn = autoSignIn === false || requireEmailVerification`
branch as `false`, so `signUp.email` auto-signs-in and sets the session cookie immediately —
no verification email round-trip needed.

## 2. CI e2e env wiring

`playwright.config.ts`'s `webServer.env` (which Playwright forwards into the spawned
`npm run dev`, overriding `backend/.env` since `dotenv.config()` never clobbers an
already-set `process.env` var) already had a fresh-per-run `AUTH_DB_PATH`
(`fs.mkdtempSync(os.tmpdir()/checklist-e2e-auth-*)/auth.db`, avoiding the pre-port
jbr-jazz-shaped `./auth.db` schema collision — `no such column: target_group_id`) and a
fixed test `BETTER_AUTH_SECRET` from the prior e2e slice. Added:

- `CHECKLIST_TEST_AUTH: '1'` in the same `webServer.env` block, so every Playwright-launched
  dev server run has verification disabled — CI (`ci/e2e` → `npm run test:e2e`) and local
  Playwright runs alike (though local Playwright runs are out of scope for this session per
  the environment rule).
- `stdout: 'pipe'` / `stderr: 'pipe'` on the `webServer` block so backend/dev-server output is
  captured for CI debugging instead of being silently swallowed.

`ci/e2e` and `ci/setup.sh` need no changes: `ci/e2e` just runs `npm run test:e2e`, which reads
`playwright.config.ts`, so the webServer env above is where the wiring belongs. `ci/setup.sh`
writes a `backend/.env` with its own `AUTH_DB_PATH=./data/auth.db` and `BETTER_AUTH_SECRET`,
but those are for cases where the backend is run directly (not via Playwright's webServer);
Playwright's `webServer.env` wins over `backend/.env` values for the e2e-launched process, so
`ci/e2e`'s dev server picks up the fresh db + `CHECKLIST_TEST_AUTH=1` regardless. GreenMail
SMTP/IMAP (`ci/setup.sh`, `IMAP_HOST`/`IMAP_USERNAME`) stays wired up for the existing
`invite`/`merge` Playwright projects, unaffected — this is a second, independent auth path
alongside them, not a replacement.

## 3. Login helper (`e2e/helpers/rowboat-auth.ts`)

Rather than POSTing directly to `/api/auth/sign-up/email` / `/api/auth/sign-in/email` via
`page.request`, the helper drives the **real UI** (`signUpAndSignIn(page, { email, password,
name? })`): opens the sign-in dialog → "Continue with email" → "Create account", fills the
signup form, and submits. This was chosen over raw API calls because the app's
`EmailAuthDialog` component wires the session into the rowboat/Dexie provider tree itself on
success (see `src/lib/jazz.tsx`'s `RowboatBridge`) — setting a cookie out-of-band via
`page.request` would leave the client-side provider state unaware of the new session, likely
requiring a manual `page.reload()` orchestration that fights the same StrictMode
double-invoke/dev cleanup issue documented below. Driving the real form exercises the full
signup path (including that a session cookie really does get set) rather than just the
API contract, at the cost of being slightly slower/UI-coupled.

- `uniqueAuthedEmail(prefix)` returns a collision-safe, unique-per-call email
  (`${prefix}-${Date.now()}-${counter}-${rand}@example.test`) — no mailbox needed since
  `CHECKLIST_TEST_AUTH` skips verification entirely.
- After submitting the signup form, the helper does **not** reload — sign-up already
  established the session server-side (autoSignIn fires because
  `requireEmailVerification` is false). `waitForAuthedShell` instead polls for the
  authenticated app shell (header visible + "Sign In" button absent), with a bounded
  reload-retry loop, because the app's own `useSession()` hook is reactive: once it resolves,
  `AuthGate` swaps the anonymous provider tree for the authenticated one on its own. The
  helper's own comment records that reloading immediately after signup was tried and
  empirically caused a permanent Dexie `DatabaseClosedError` (see next point) — this is prior
  work in this branch, not something exercised again in this session.
- The `EmailAuthDialog`'s post-signup UI always shows a "Check Your Email" panel regardless
  of whether verification is actually required (it only branches on `result.error`) — a
  cosmetic leftover from the pre-port always-verify flow, noted in the helper's doc comment
  but not fixed here (out of scope: UI copy, not auth correctness).

### Related fix already in the branch: `src/lib/jazz.tsx` StrictMode close race

`RowboatBridge`'s effect cleanup used to call `db.close()` synchronously. React StrictMode's
dev-mode mount→cleanup→mount double-invoke closed the Dexie singleton on first render with
nothing left to reopen it (the component function itself isn't re-invoked by the simulated
remount), permanently breaking every subsequent read/write/`syncWithServer` call for the rest
of the page's life with `DatabaseClosedError`. Fixed by debouncing the close via
`setTimeout(..., 0)` plus clearing any pending close on the next effect run — the immediate
StrictMode remount cancels the pending close, while a genuine unmount still closes normally.
This was necessary groundwork for the authed spec to survive React dev-mode without flaking.

## 4. Authed spec (`e2e/folders-authed.spec.ts`)

Chromium-project spec (matches the default `**/*.spec.ts` `testMatch`, not in any
`testIgnore` list, no `.skip` suffix — confirmed **not quarantined**): signs up a fresh
email/password user via `signUpAndSignIn`, creates a folder via the existing
`createFolder` e2e helper, reloads the page, and asserts the folder is still visible —
i.e. it round-tripped through the rowboat backend (server-synced) rather than just
surviving in in-memory/localStorage state. Per its doc comment, this exercises in one pass:
the root-group auto-provision at signup (`ensureUserRootGroup`, called from `createProvider`
on first authenticated request), the folder-scope-group mint route
(`POST /api/folders/group`), and scoped sync under a real session (the RBAC-authenticated
path in `mountSyncRoutes`, not the anonymous path already covered by `smoke.spec.ts`).

**Not run in this session** — e2e is CI-host-only per the environment rule; the controller
runs it via `sci push checklist/e2e`.

## Verification performed locally (no Playwright)

- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` — 1182 pass / 1 fail / 390 skipped. The 1 failure
  (`src/hooks/__tests__/useCheckListHierarchy.test.tsx > archiveNode/unarchiveNode toggle
  archived and folders honors showArchived`) is a **pre-existing flaky test**, unrelated to
  this slice's changes: confirmed by `git stash`-ing all of this session's diffs and
  re-running the same file in isolation — it fails there too (with a *different* assertion
  failing between runs, consistent with a timing/async race in that test, not a regression).
  Re-run in isolation with the diff restored also failed nondeterministically (2/2 vs 1/1
  failures across runs). No auth/e2e file touches that hook or its test.

## Files touched

- `backend/src/index.ts` — `CHECKLIST_TEST_AUTH` switch.
- `playwright.config.ts` — `CHECKLIST_TEST_AUTH: '1'` + `stdout`/`stderr: 'pipe'` in
  `webServer.env`/`webServer` (fresh `AUTH_DB_PATH` and `BETTER_AUTH_SECRET` were already
  wired from the prior e2e slice).
- `src/lib/jazz.tsx` — debounced `db.close()` to survive StrictMode double-invoke.
- `e2e/helpers/rowboat-auth.ts` (new) — `signUpAndSignIn`, `uniqueAuthedEmail`, `isAuthed`,
  `waitForAuthedShell`.
- `e2e/folders-authed.spec.ts` (new) — authed folder-create-and-persist spec, CI-run-only.
