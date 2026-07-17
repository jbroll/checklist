# CheckList — deferred engineering backlog (rowboat port)

Open, intentionally-deferred technical items from the rowboat port. Each is deferred on purpose
with the rationale below — not forgotten. (Product/market roadmap lives in `ROADMAP.md`; the current
architecture lives in `ARCHITECTURE.md`.)

Resolved items (D1 `rb.ordered` adoption, D2 `user_settings` convergence, D3 browser back/forward
navigation, D6 export off Jazz, D7 account-merge, D8 Jazz-schema deletion, D9 session-retention
cleanup) have shipped and their durable behavior is folded into `ARCHITECTURE.md`.

**Decided against — D4 (jbr-jazz → rowboat data migration for a cutover):** there is no production
data to migrate, so the fresh-start / "delete existing data" path stands (the same path used for the
`rb.ordered` adoption). No migration will be built.

> **Note (2026-07-17) — rowboat now has a live schema-migration mechanism, but CheckList doesn't use it
> yet.** rowboat landed a full live-migration stack (a `migrating` state + off-thread migration worker
> + `POST /v1/databases/:id/schema` + the `rowboat migrate` CLI + `movedFrom` column-move DX). That is
> the **StaaS / control-plane** deployment path. CheckList runs rowboat as an **embedded library**: the
> backend registers a single compiled schema at boot (`registerSyncTable`), so an *ongoing* schema
> change here still means a fresh `AUTH_DB_PATH` DB (see the Troubleshooting note in CLAUDE.md), NOT a
> live migration. Adopting rowboat's migration path (or its `movedFrom` DX for column renames) is a
> future option if CheckList ever needs to evolve a schema without discarding data — a separate
> decision from the closed Jazz-cutover one above.

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
