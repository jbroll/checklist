# CheckList — deferred engineering backlog (rowboat port)

Open, intentionally-deferred technical items from the rowboat port. Each is deferred on purpose
with the rationale below — not forgotten. (Product/market roadmap lives in `ROADMAP.md`; design
specs in `docs/superpowers/specs/`.)

## D1 — concurrency data-loss on lists: adopt `rb.ordered` — **HIGH**
- **Where:** `shared/schema.ts` (`items`/`sessions` are `rb.json(z.array(...))`) and the write paths
  `src/services/sessionService.ts` (`updateSession` → `g.folder.update(id, { sessions: entireArray })`)
  and `src/services/templateService.ts`.
- **Symptom:** every item-check / edit rewrites the WHOLE `sessions` (or `items`) json column — a
  clockless whole-cell write the engine resolves as whole-value LWW. Two clients (multi-device, or a
  shared list) checking DIFFERENT items concurrently **silently clobber each other** (one check is
  lost). Verified by the rowboat characterization suite
  (`@jbroll/rowboat-integration/json-merge-characterization.test.ts`, scenario 1).
- **Fix:** adopt rowboat's `rb.ordered` (LANDED on rowboat main `0324c4f`): model `items`/`sessions`
  (and nested item children) as ordered lists (keyed map + fracKey `__order` + `__deleted`
  tombstone), and rewrite the write paths to the `orderedList` field-level API
  (`@jbroll/rowboat-client`: `orderedList({path,key,read,update})` — append/setField/move/remove).
  This makes concurrent check/reorder/insert/delete merge with no lost survivor. Its own
  spec→plan cycle; no data migration (existing data is discarded — product decision). See rowboat
  `docs/superpowers/specs/2026-07-15-rb-ordered-design.md`.
- **Note:** `rb.ordered` sidesteps rowboat's separate M1 covering bug (rowboat `docs/status.md`) by
  construction (new-key append + leaf-only writes); no mid-level subtree replaces over existing
  descendants.

## D2 — `user_settings` anon-adopt duplicate edge — **MEDIUM**
- **Where:** `src/lib/jazz.tsx` `RowboatBridge` provisioning (`ensureUserSettings`) + the anon-claim
  adopt path.
- **Symptom:** on sign-in the anon `user_settings` row is adopted keeping `id = ANON_IDENTITY`; a
  later device provisions `id = user.id`, so a multi-device + adopt sequence could leave TWO
  `user_settings` rows in the account. Single-device is correct (the account-init effect awaits a
  server pull before deciding, and the deterministic `id = owner_group_id = user.id` converges).
- **Fix:** exclude `user_settings` from adoption, or rename-on-adopt to `user.id`. Low reachability
  today (multi-device authed + adopt), so deferred.

## D3 — browser back/forward session navigation — **LOW**
- **Where:** `src/components/editor/AppContainer.tsx` tracks the open session in React state
  (`currentSessionId`), not browser history. The hash+History router `src/lib/useNavigationHistory.ts`
  exists (Jazz-era) but is no longer wired to the template→session transition.
- **Symptom:** `page.goBack()`/`goForward()` don't toggle TreeView↔SessionView (see the skipped
  `e2e/deploy-smoke.spec.ts` nav test).
- **Fix:** re-wire `AppContainer` onto `useNavigationHistory` (derive the active session from
  `navState`; `navigateTo`/`goBack`/`replaceState`). Open decision: whether a `#session/<t>/<s>` URL
  must also **restore on reload / deep-link** (resolving against rowboat ids) or is nav-only.

## D4 — jbr-jazz → rowboat data migration for a real cutover — **deferred**
- Existing deployed jbr-jazz data (jazz-shaped `auth.db`, `share_invites.target_covalue_id`, folder
  CoValues) has no migration to the rowboat schema; a stale slice-1 db also crashes on boot
  (`registerSyncTable: re-registering "folder" cannot introduce column "items"`). Fresh dbs (dev/CI)
  are fine. A production cutover needs an addColumn/data migration — or the accepted "delete existing
  data" path (as used for the `rb.ordered` adoption).
