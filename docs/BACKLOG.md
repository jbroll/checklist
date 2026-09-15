# CheckList — backlog

> **This is the single backlog: outstanding work only.** Product features and engineering items
> both live here. When an item ships, remove it — durable behavior is folded into `ARCHITECTURE.md`,
> not left behind as a "resolved" entry. Product positioning / competitive analysis lives in
> `ROADMAP.md`; the current architecture in `ARCHITECTURE.md`.

## Product features

### High priority (competitive parity)

| Feature | Effort | Notes |
|---------|--------|-------|
| **Custom session names** | 2-3h | Optional name instead of date |
| **Keyboard shortcuts** | 2-3h | Enter, Escape, arrow navigation |

### Medium priority (nice to have)

| Feature | Effort | Notes |
|---------|--------|-------|
| Expose timestamps in UI | 2-3h | Show "completed in X min" stats |
| Quick inline notes | 2-3h | Edit notes without modal |
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

- **Stale Capacitor web bundles on disk (not tracked in git)** — an earlier `cap sync` left
  vendored chunks and source maps under `android/app/src/main/assets/public/`, which is
  gitignored, so none of it is committed. It regenerates from the current frontend via
  `npm run cap:sync` before the next mobile release.

- **Prod checklist-app still runs the Jazz-era backend** on `0.0.0.0:3001`, with no rowboat tenant
  (`deploy.conf` still carries `REPLACE_WITH_PROD_DATABASE_ID`). Before installing the rowboat-era
  backend there:
  - back up existing Jazz users and their data, and migrate them to rowboat if possible (being
    researched separately)
  - run `npm run provision:prod`
  - replace `REPLACE_WITH_PROD_DATABASE_ID` in `deploy.conf`
  - set `ROWBOAT_DATABASE_ID` and `BIND_HOST=127.0.0.1` in `backend/secrets.env`
  - start the backend on a fresh auth DB — a Jazz-era DB fails with
    `no such column: target_group_id`

- **New-device login duplicates default seed content.** Signing into an existing account in a
  private window produced a second copy of the default "Quick Errands" list. New-device login
  appears to seed default content and then claim it into the account (anonymous-session claim; see
  `ARCHITECTURE.md` → Anonymous sessions & convergence and `useAnonClaim` in `src/lib/rowboat.tsx`),
  so every new device adds another copy. Needs a way to mark default seed content so it is not
  re-seeded or claimed on each new device login.

- **Billing routes are not mounted.** `backend/src/billing/routes.ts` (tiers, checkout, webhook)
  exists but `backend/src/index.ts` never wires it, so the deploy smoke test no longer checks
  `/api/billing/tiers`. Mount it and restore that check when billing ships.
  The production bundle (`backend/tsup.config.ts`) contains only code reachable from `src/index.ts`
  and `src/migrate-auth.ts`, so billing ships once index.ts mounts it, and `stripe.ts`'s
  `../../../shared/billing.js` import must bundle cleanly then.

## Standing notes & rationale

- **rowboat has a live schema-migration mechanism, but CheckList doesn't use it yet.** rowboat
  landed a full live-migration stack (a `migrating` state + off-thread migration worker + `POST
  /v1/databases/:id/schema` + the `rowboat migrate` CLI + `movedFrom` column-move DX) — the **StaaS /
  control-plane** path. CheckList runs rowboat as an **embedded library**: the backend registers a
  single compiled schema at boot (`registerSyncTable`), so an *ongoing* schema change here still
  means a fresh `AUTH_DB_PATH` DB (see the Troubleshooting note in CLAUDE.md), NOT a live migration.
  There is no production data to migrate, so the fresh-start / "delete existing data" path stands and
  no legacy→rowboat migration will be built. Adopting rowboat's migration path (or its `movedFrom`
  DX for column renames) is a future option if CheckList ever needs to evolve a schema without
  discarding data.
- **`knip.json`'s `better-auth` entry in `ignoreDependencies` has no home for its rationale** —
  `knip.json` is plain JSON and can't carry a comment. Recorded here: no source file imports
  `better-auth` directly, but the file:-linked `@jbroll/rowboat-auth-betterauth-react` package's
  built `dist` imports `better-auth/react`, which Node resolves from *this app's* `node_modules`
  (not the linked package's own). Removing the root `better-auth` dependency breaks the production
  build even though knip (correctly, from a static-import-graph view) sees it as unused.
