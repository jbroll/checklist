# CheckList — backlog

> **This is the single backlog: outstanding work only.** Product features and engineering items
> both live here. When an item ships, remove it — durable behavior is folded into `ARCHITECTURE.md`,
> not left behind as a "resolved" entry. Product positioning / competitive analysis lives in
> `ROADMAP.md`; the current architecture in `ARCHITECTURE.md`.

## Product features

### Medium priority (nice to have)

| Feature | Effort | Notes |
|---------|--------|-------|
| Session comparison | 4-6h | Compare items across sessions |
| Over-limit banner | 2-3h | Banner for downgraded users exceeding free tier |

### Future consideration

| Feature | Effort | Notes |
|---------|--------|-------|
| Public demo mode | Large | Anonymous template sharing (plan in docs/) |
| Labels/tags | 6-8h | May be unnecessary given hierarchy |
| Recurring sessions | 8-12h | Auto-create on schedule |
| Undo/redo | 6-8h | Action history |
| Item photos | 6-8h | Attach images to items |
| TreeView refactoring | 4-6h | Split 610-line component |
| Nutrition / calorie tracking | Large | Detailed design below (D5) — needs a product decision first |

### Explicitly not planned

- Barcode scanning
- Voice assistant integrations
- Price tracking
- Recipe import/meal planning
- Kanban/calendar views
- Gamification (streaks, points)

## Deferred feature — nutrition / calorie tracking (D5)

Per-list calorie/nutrition tracking with portion controls. A working prototype existed on the
(now-deleted) `claude/add-calorie-counter` branch (last commit `67eff69`, 2026-05). It forked
~2026-04-02 off the **pre-rowboat** `src/schemas/tree.ts`/`index.ts`, so the code predates the
rowboat schema and is not directly reusable; this entry preserves the design. **A product decision
is required first — is nutrition in scope for CheckList?**

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
  `grocery.json` enrichment carry over unchanged.

## Engineering

- **Prod checklist-app still runs the Jazz-era backend** on `0.0.0.0:3001`, with no rowboat tenant
  (`deploy.conf` still carries `REPLACE_WITH_PROD_DATABASE_ID`). Before installing the rowboat-era
  backend there:
  - back up existing Jazz users and their data, and migrate them to rowboat: a laptop-run export
    (prod `auth.db` copy + each account's Jazz data → a JSON backup) and import (backup → fresh auth
    DB + tenant rows), rehearsed first on checklist-test. The export is `migration/jazz-export/`
    and the import is `backend/scripts/import-jazz-backup.ts` (steps `auth-db` and `lists`); the
    import has run against a local fixture backup, the export is covered by unit tests against
    in-memory Jazz sync, and neither has run on checklist-test yet
  - run `npm run provision:prod`
  - replace `REPLACE_WITH_PROD_DATABASE_ID` in `deploy.conf`
  - set `ROWBOAT_DATABASE_ID` and `BIND_HOST=127.0.0.1` in `backend/secrets.env`
  - start the backend on a fresh auth DB — a Jazz-era DB fails with
    `no such column: target_group_id`

- **Billing routes are not mounted.** `backend/src/billing/routes.ts` (tiers, checkout, webhook)
  exists but `backend/src/index.ts` never wires it, so the deploy smoke test no longer checks
  `/api/billing/tiers`. Mount it and restore that check when billing ships.
  The production bundle (`backend/tsup.config.ts`) contains only code reachable from `src/index.ts`
  and `src/migrate-auth.ts`, so billing ships once index.ts mounts it, and `stripe.ts`'s
  `../../../shared/billing.js` import must bundle cleanly then.

## Standing notes & rationale

- **Schema changes migrate the tenant in place.** `provision:*` migrates an existing tenant to the
  schema lock's last version (see `docs/HOSTED_ROWBOAT.md` → sub-project B). rowboat's
  `rowboat migrate --plan` (expand/contract classification) and `movedFrom` column renames are not
  wired into a CheckList script yet. Prod's Jazz-era users and their data will be carried over once,
  by a one-time export/import (see the prod item under Engineering).
- **`knip.json`'s `better-auth` entry in `ignoreDependencies` has no home for its rationale** —
  `knip.json` is plain JSON and can't carry a comment. Recorded here: no source file imports
  `better-auth` directly, but the file:-linked `@jbroll/rowboat-auth-betterauth-react` package's
  built `dist` imports `better-auth/react`, which Node resolves from *this app's* `node_modules`
  (not the linked package's own). Removing the root `better-auth` dependency breaks the production
  build even though knip (correctly, from a static-import-graph view) sees it as unused.
