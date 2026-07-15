# CheckList — deferred engineering backlog (rowboat port)

Open, intentionally-deferred technical items from the rowboat port. Each is deferred on purpose
with the rationale below — not forgotten. (Product/market roadmap lives in `ROADMAP.md`; design
specs in `docs/superpowers/specs/`.)

## D1 — concurrency data-loss on lists: adopt `rb.ordered` — **RESOLVED**
- **Was:** every item-check / edit rewrote the WHOLE `sessions` (or `items`) json column — a
  clockless whole-cell write the engine resolves as whole-value LWW, so two clients checking
  DIFFERENT items concurrently silently clobbered each other.
- **Fix (shipped):** `items`/`sessions` are now `rb.ordered` columns (`shared/schema.ts`); every
  write in `sessionService`/`templateService`/`folderOps`/import goes through the `orderedList`
  field-level API (`src/services/folderListHandles.ts`), so concurrent check/edit merges with no
  lost survivor (`src/services/__tests__/concurrentMerge.test.ts`). No data migration — existing
  data discarded. See `docs/superpowers/specs/2026-07-15-checklist-rb-ordered-adoption-design.md`.
- **Residual (low):** display order stays the `sortOrder` field (kept to avoid rewriting
  import/export/categorization), so two clients reordering the SAME level concurrently can still land
  on the same midpoint. Adopting `rb.ordered`'s `__order` fracKey for display would close this.

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

## D5 — nutrition / calorie tracking feature (port from prototype) — **FEATURE, deferred**
- **What:** per-list calorie/nutrition tracking with portion controls — a working prototype existed on
  the (now-deleted) `claude/add-calorie-counter` branch (last commit `67eff69`, 2026-05). It forked
  ~2026-04-02 off the **Jazz-era** `src/schemas/tree.ts`/`index.ts`, so the code predates the rowboat
  schema and is not directly reusable; this entry preserves the design.
- **Data pipeline (schema-agnostic, reusable as-is):** `scripts/bake-nutrition.ts` enriches each
  `grocery.json` entry carrying a `usdaFdcId` from USDA FoodData Central, baking `caloriesPer100g`,
  `defaultServingGrams`, `servingLabel`, and basic macros into the dataset (idempotent; needs
  `FDC_API_KEY`).
- **Service:** `nutritionService.ts` — `NutritionData` shape, `getNutrition(item)` (cached lookup
  index over the baked dataset), `computeItemCalories(item, portion)`, `sumSessionCalories(session)`.
- **UI:** `SessionCalorieContext` + calorie display woven into `SessionView`/`SessionItemRow`, a
  `PortionSheetDialog` (per-item portion/serving controls), and a `NutritionEditorDialog` (manual
  per-item nutrition override). Auto-nutrition hooks into the categorization layer.
- **Port effort:** move the per-item portion + nutrition-override fields onto the rowboat schema
  (`shared/schema.ts` — `TemplateItem`/`ItemState`, written field-level via the `rb.ordered` handles),
  and rewrite the service/UI against the current rowboat graph. The USDA bake pipeline and
  `grocery.json` enrichment carry over unchanged. Product decision required first (is nutrition in
  scope for CheckList?).
