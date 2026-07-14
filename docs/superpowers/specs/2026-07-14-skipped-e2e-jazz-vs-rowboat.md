# Skipped e2e tests: how they worked under Jazz, and how to restore them on rowboat

**Date:** 2026-07-14
**Context:** After the slice-2 data-layer + UI-wiring port, 13 e2e tests remain `test.skip`. Each
was investigated against the Jazz-supported app (git history on
`migrate-checklist-duplications-to-jbr-jazz`, branch point `d51a192`; framework at
`~/src/jbr-jazz`). This document records the Jazz mechanism, why it's skipped on rowboat, and a
proposed solution per cluster.

**Headline correction:** authed e2e is **not** infra-blocked. A headless test-auth path already
exists and passes on CI (`folders-authed.spec.ts`). The earlier "authed e2e blocked (OAuth/JWKS)"
note was true at slice-1 but was resolved by commit `efebe28`.

---

## Cluster A — Invite Accept Page UI ×11 (`e2e/sharing-ui.spec.ts:271-492`)

### How Jazz did it
The Jazz `InviteAcceptPage` (`d51a192:src/components/sharing/InviteAcceptPage.tsx`) was
**server-decides**: it called `validateInvite(token)` *unconditionally on mount* and branched on a
rich response `{ valid, senderEmail?, permission?, error? }`, where `error` was one of
`unauthenticated | email_mismatch | not_found | expired | already_accepted | already_member |
self_invite`. Every screen (sign-in, wrong-account, invalid, expired, valid-details, per-role
description) was a pure function of that body — which is exactly why the tests mock
`/api/shares/validate/*` per error-code and assert each screen.

Authentication in the Jazz e2e was a **real GreenMail/IMAP round-trip**: `e2e/invite.setup.ts` +
`e2e/helpers/{auth-helper,imap-helper}.ts` signed up three fixed accounts, clicked the real
verification link pulled over IMAP, and saved `storageState` (`e2e/.auth/test{1,2,3}.json`). These
projects self-exclude unless `IMAP_HOST`/`IMAP_USERNAME` are set.

### Why it's skipped on rowboat
The port redesigned the page to **client-gates**
(`src/components/sharing/InviteAcceptPage.tsx`): anon session → renders "Sign In to Continue" and
**never calls validate**; only an authenticated session validates. And rowboat's server
(`packages/sharing/src/routes.ts`) deliberately collapses *all* validate failures to `{ valid:
false }` ("no leak to non-owners") and returns `{ valid: true, inviterEmail, role, appRole }` on
success — **no** `senderEmail`/`permission`/error-codes. Email-mismatch surfaces only at
accept-time (403 `this invite was not sent to your account`). The 11 tests are byte-identical to
the Jazz versions — only `test.skip` was added.

Blockers, per the investigation:
- **All 11** hit the client auth gate (anon never reaches validate). *(Exceptions: #5
  "unauthenticated" coincidentally still passes; #10 passes on the wrong screen via a weak
  assertion.)*
- **7 of them** (invalid/expired/valid-details/mismatch/reader/writer/admin) *also* encode the Jazz
  contract (`senderEmail`, `permission`, per-error copy) that rowboat structurally no longer emits.

### Proposed solution
Rewrite the describe block against the rowboat contract (auth path already exists):
1. **Authenticate** each test with `signUpAndSignIn` from `e2e/helpers/rowboat-auth.ts` (backed by
   `CHECKLIST_TEST_AUTH=1`, already in `playwright.config.ts` `webServer.env`). This clears the auth
   gate so the page validates.
2. **Reshape validate mocks** to `{ valid: true, inviterEmail, role, appRole }` / `{ valid: false }`.
3. **Re-express the error cases to rowboat's model** — this is a genuine behavior change, not a
   remock: rowboat cannot distinguish not_found vs expired vs email_mismatch at validate (by
   privacy design). So:
   - invalid/expired → one "invite no longer valid" assertion (drop the distinct copy).
   - email-mismatch → move to an **accept-time** test (mock `POST /api/shares/accept` → 403).
   - reader/writer/admin descriptions → keyed on `role`, mock `role` not `permission`.
4. Keep #5/#10 but assert the *correct* screen.

**Effort:** Medium (~11 tests; ~3 need real reshaping, ~4 are mechanical, ~2 trivial).
**Recommendation:** Implement — largest single un-skip, auth path proven on CI. The rewrite documents
rowboat's *more* privacy-preserving invite model, which is the desired behavior.

---

## Cluster B — Quick Errands default list ×1 (`e2e/session-ui.spec.ts:19`)

### How Jazz did it
Commit `8c6d9b7` added "Step 6" to the Jazz account **`withMigration`** hook
(`src/schema/index.ts:164-219`). On every account load, after ensuring folders were loaded, `if
(root.folders.length === 0)` it created one `template-folder` named **"Quick Errands"** with 6
items (Bank, Dry cleaning, Grocery store, Post office, Gas station, Pharmacy), all pre-selected via
`defaultItems`. The test just `goto('/')` and asserts the list is visible.

### Why it's skipped on rowboat
`src/schema/index.ts` is now **Jazz-era dead code** (a `co.account` schema nothing instantiates).
The port's account-init (`RowboatBridge` in `src/lib/jazz.tsx`) provisions only the `user_settings`
singleton and **creates no folders** — new anon sessions start empty (matching the skip comment).

### Proposed solution
Port "Step 6" into the same provisioning effect that already does `ensureUserSettings`:
- Guard on an **authoritative** `db.table('folder')` read (non-deleted), same race-safe pattern as
  the `user_settings` provisioning; if empty, seed once.
- Create via the rowboat surface: `useCheckListHierarchy.addFolder` / `folderOps` for the folder +
  `templateService.createItem` ×6 + set `default_items` so they render pre-checked.
- Un-skip the test.

**Effort:** Small–medium.
**Open decision (product):** the port *intentionally* starts empty. Restoring a default starter list
is Jazz parity but a **product choice** — confirm it's wanted before implementing. (It interacts
cleanly with anon→adopt: the seeded folder re-scopes on sign-in like any other.)
**Recommendation:** Defer to a product yes/no. Low technical risk if approved.

---

## Cluster C — browser back/forward session nav ×1 (`e2e/deploy-smoke.spec.ts:337`)

### How Jazz did it
The app **already ships a hash + History API router**: `src/lib/useNavigationHistory.ts` (present
and identical in both trees) encodes nav as `#session/{templateId}/{sessionId}` via
`pushState`/`popstate`. The Jazz `AppContainer` (`d51a192`) derived the active session **from
`navState`**, and `handleTemplateSelect` ended with `navigateTo({view:'session',...})` — so clicking
a template pushed a history entry and `page.goBack()` popped back to TreeView.

### Why it's skipped on rowboat
The port's `AppContainer` replaced the history-driven model with local React state
(`const [currentSessionId, setCurrentSessionId] = useState(...)`); it doesn't import
`useNavigationHistory` at all for the template→session transition. So back/forward don't toggle
TreeView↔SessionView.

### Proposed solution
Re-wire `AppContainer` onto the existing router (restore the `d51a192` structure over rowboat
services — the router itself needs no change):
- Call `useNavigationHistory()`; drop the `currentSessionId` `useState`.
- Derive `activeSessionTemplateId`/`activeSessionId` from `navState`; key the SessionView render
  branch off them.
- `handleTemplateSelect`/`onOpenSession` → `navigateTo({view:'session',...})`;
  `handleBackToTemplates` → `goBack()`; `handleSwitchSession` → `replaceState(...)`.
- Reconcile `useTemplateNavigation` highlight with `navState` on `popstate`.
- Un-skip the test.

**Effort:** Small–medium (mostly re-wiring).
**Tradeoff to resolve:** a `#session/{id}/{id}` URL must resolve against rowboat ids on **reload /
deep-link** — the Jazz version got this free from synced CoValue ids. Decide whether reload-restore
is in scope or the URL is nav-only (back/forward within a session, no deep-link).
**Recommendation:** Implement (router exists); scope the reload-restore decision explicitly.

---

## Cluster D — PWA offline reload ×1 (`e2e/error-handling.spec.ts:532`)

### Nature
**Framework-agnostic** — identical concern under Jazz or rowboat. The data layer (IndexedDB)
persists offline in both; the gap is the **service worker** caching the app *shell* so a
reload-while-offline still boots. `vite-plugin-pwa` is configured, but the dev server doesn't
activate the SW (`devOptions.enabled` is unset), and the e2e webServer runs the dev server.

### Proposed solution (two options)
1. **Faithful:** add a Playwright project that runs against `vite build` + `vite preview` (SW
   active), and run only this offline test there. Tests the real PWA path.
2. **Cheap:** set `VitePWA({ devOptions: { enabled: true } })` so the SW registers in dev. Simpler,
   but tests dev-mode SW behavior, not production.

**Effort:** Small.
**Recommendation:** Option 1 if PWA offline is a shipped guarantee worth CI coverage; otherwise leave
skipped with the honest env note. Lowest value of the four clusters.

---

## Summary + recommended order

| Cluster | Tests | Blocker type | Effort | Recommendation |
|---|---|---|---|---|
| A — Invite Accept | 11 | test rewrite (auth path exists) | Medium | **Implement** — biggest win, proven auth path |
| C — browser nav | 1 | re-wire to existing router | Small–Med | Implement; decide reload-restore scope |
| B — Quick Errands | 1 | port migration Step 6 | Small–Med | **Product decision first** (start-empty vs seed) |
| D — PWA offline | 1 | SW / prod-build harness | Small | Optional; add prod-preview project or leave |

Two need a **decision**, not just code: B (do we want a default starter list?) and C's reload-restore
scope. A and D are purely mechanical once decided.
