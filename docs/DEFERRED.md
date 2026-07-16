# CheckList — deferred engineering backlog (rowboat port)

Open, intentionally-deferred technical items from the rowboat port. Each is deferred on purpose
with the rationale below — not forgotten. (Product/market roadmap lives in `ROADMAP.md`; the current
architecture lives in `ARCHITECTURE.md`.)

Resolved items (D1 `rb.ordered` adoption, D2 `user_settings` convergence, D6 export off Jazz, D7
account-merge, D8 Jazz-schema deletion, D9 session-retention cleanup) have shipped and their durable
behavior is folded into `ARCHITECTURE.md`.

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
- Related: an existing sync db also stores the per-column `jsonSchema` in its registry, so picking up
  a schema change (e.g. the `rb.ordered` keyed-map conformance) may require re-registration on boot;
  verify as part of the cutover.

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
