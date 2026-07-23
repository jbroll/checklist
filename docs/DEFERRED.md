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

## D10 — newly-granted scope is never backfilled (accepting an invite shows nothing) — **RESOLVED (2026-07-22)**

**Resolved in rowboat** by the chosen design below (one global cursor + a per-client "caught-up
groups" set): `dfcc8bf` (client backfills newly-authorized scope groups) + `08c4eb6` (integration
test: a share accepted after the recipient's cursor advanced still delivers). CheckList's
sub-project E closed-loop e2e (`e2e/sharing-closed-loop.spec.ts`) now runs green in the default gate.
Design preserved below.


- **What:** accepting a share invite grants the recipient access, but the shared folder never appears
  on their device. Pull is a single incremental cursor (`rowboat/packages/backend/src/pull.ts:45`:
  `WHERE t.__server_updated_at > lastPulledAt`, with the scope filter evaluated at request time), so a
  client whose cursor has already advanced past a row's `__server_updated_at` will never receive that
  row — even once its scope widens to include it. Widening access delivers nothing; the rows are
  simply below the cursor.
- **Not a cutover regression.** The embedded data plane used this same `pull.ts`, so invite-accept has
  been silently broken since the port. `InviteAcceptPage.tsx:92` still asserts the opposite ("The
  shared folder shows up once the client's next periodic sync pulls it"). It went unnoticed because the
  only test that would catch it is the GreenMail `invite` project, which self-excludes from the default
  gate (`playwright.config.ts:32`). rowboat documents the same cursor property for the *revocation*
  direction (`packages/integration/src/sharing-agent-e2e.test.ts:257-262`) and sidesteps it there by
  using a brand-new client; it bites symmetrically on *grant*.
- **Rejected — rewind the cursor to 0 on accept.** Correct but O(dataset): re-downloads every row in
  scope on every accept, for a bounded event.
- **Rejected — bump `__server_updated_at` on the granted group's rows.** Fixes every device with no
  client change, but forces a re-download of that group to every member who already has those rows.
- **Rejected — per-group cursors.** No server writes, but groups inherit
  (`rowboat/packages/auth/src/rbac.ts:48` — `readScope` returns the *expanded* readable-group set), so
  the scope set grows and repeat downloads pile up as groups accumulate.
- **Chosen design — one global cursor plus a per-client "caught-up groups" set.** `readScope` already
  computes the authorized group list on every pull, so return it. When a group appears in that list
  that this client has never caught up on, the client issues **one** scoped pull (`lastPulledAt: 0`
  restricted to that group) and marks it caught up; the global cursor serves it from then on. The
  server-side group filter must be **intersected** with `readScope` so a caller-supplied list can only
  narrow, never widen. `pullChanges` already accepts `scopes?: Record<string, ReadScope>`
  ("caller-resolved scopes override auth when provided"), so the read primitive exists — what is
  missing is the route parameter and the client-side set. Effectively per-group cursors collapsed to a
  boolean, which is why it does not amplify: no N cursors are maintained.
  - A fresh client already pulls everything at cursor 0 — it marks all currently-scoped groups
    caught up at that point, so nothing is fetched twice.
  - A group the client mints itself is marked caught up at mint time, so it never "discovers" a group
    and backfills rows it just wrote.
  - Steady-state wire cost: the client sends a digest of its caught-up set and the server returns the
    full list only on mismatch — ~32 bytes per pull, the list only when scope actually changed.
- **Cost:** steady state unchanged; accepting an invite fetches exactly the shared group once per
  device; nothing else moves.
- **Where it lands:** rowboat (data plane — pull route + client), via the `wt/2` worktree and
  `scripts/land.sh`. Nothing in CheckList changes.
- **What it unblocks:** sub-project E's remaining tasks (`docs/superpowers/plans/2026-07-22-checklist-sharing-cutover.md`
  Tasks 3–4). E's backend and rowboat-side work has landed and works — A's invite creates a proper
  `/invite/<token>` link, the agent is installed and correctly hidden from the collaborator list, and
  B's accept succeeds — but the closed-loop E2E asserts that B then *sees* the folder, which is exactly
  what this item fixes.

## Resolved: jbr-jazz dependency removal (2026-07-20)

CheckList had two undeclared-in-any-tracker dependencies on `~/src/jbr-jazz`:
`@jbr-jazz/billing-shared` (subscription types/limits) and `@jbr-jazz/hierarchy-backend`
(`ApiErrors`, `RateLimiter`). Both are removed.

- Tier policy now lives in `shared/billing.ts` — **per product, by design.** A limit table shared
  across products makes one product's pricing change a breaking change for another.
- `assertTier` throws on an unrecognized slug. The previous shared helper silently downgraded to
  free-tier limits, which would clamp a paying customer with no signal.
- `getSubscriptionInfo` had inlined a copy of the effective-tier rule that omitted the
  past_due/cancelled arm, disagreeing with `getMaxLists` on the same user. Fixed.
- `jazz-tools` was a phantom dependency — declared in both manifests, imported nowhere.

This clears CheckList's half of rowboat roadmap Phase 4 ("retire jbr-jazz"); `wicketmap` remains.

**Deferred/tracked findings from this pass (not fixed here):**

- **`backend/scripts/rotate.ts` `cmdApple` has a pre-existing TDZ bug**, unrelated to de-jazzing.
  It calls the module-level `header()` function (~line 714) inside `cmdApple`, but that same
  function later declares a block-scoped `const header = { alg: 'ES256', ... }` (~line 765). The
  `const` shadows the outer `header` for the *entire* function body, so the earlier call sits in
  the temporal dead zone and throws `ReferenceError: Cannot access 'header' before
  initialization`. `npx tsx backend/scripts/rotate.ts apple` is currently broken.
- **`backend/scripts/` is excluded from type-checking, and so is the root `e2e/` suite.**
  `backend/tsconfig.json` only `include`s `src/**/*` (+ `../shared/**/*`), so `rotate.ts` — and
  everything else under `scripts/` — is never run through `tsc`. That's how the `cmdApple` bug
  above passed CI unnoticed; the same gap will hide the next one. Separately, the root
  `tsconfig.json` excludes `e2e/**/*`, so the Playwright suite is also unchecked (e.g. the
  untyped `page` parameter at `e2e/error-handling.spec.ts:28`). Worth closing (add
  `scripts/**/*` to the backend `include`, and stop excluding `e2e/**/*` at the root, or give
  each its own `tsconfig.json`), but out of scope for the de-jazzing branch.
- **Stale Jazz documentation was left behind by the de-jazzing pass** — several docs still
  describe Jazz.tools as the current storage/sync layer and need a product decision on how to
  fix them (mechanical edit vs. a fuller rewrite), not just a find-replace:
  - **Highest priority — `website/privacy.md:7,15` and its built `website/privacy.html:66,70`.**
    This is a **published, live legal document**, compiled by `website/build-legal.js` on every
    `npm run build`. It currently states "Your list data is stored using Jazz.tools. Jazz account
    keys are stored server-side", "backed up via Jazz.tools", and — most seriously — "Your data
    is encrypted before it reaches the sync service—they cannot read your lists." Under rowboat
    this is false: the server stores list/item rows in plaintext SQLite and can read them (see
    the KEY_ROTATION.md fix in this same commit for the verified detail). This is a factual
    misstatement about data confidentiality in a live privacy policy — it needs a product/legal
    decision about the replacement wording, not a mechanical edit, and was deliberately **not**
    edited as part of this fix pass.
  - Also stale: `docs/ROADMAP.md:18,100,105,108,110`, `docs/HOSTED_ROWBOAT.md:35,100-105`,
    `DEPLOY.md:198-200`, `e2e/INVITE_TESTING.md`, `docs/MARKET_COMPARISON.md`,
    `docs/GooglePlayStore.md`, `full-description.md`, `short-description.md`.
- **The committed Capacitor bundles under `android/` and `ios/` still reference Jazz** —
  `vendor-jazz-*.js` chunks and jazz-referencing source maps are present in
  `android/app/src/main/assets/public/`. These are stale build output, not source; they
  regenerate from the current (jazz-free) frontend via `npm run cap:sync`. No action needed
  beyond a routine `cap:sync` before the next mobile release.
- **`knip.json`'s `better-auth` entry in `ignoreDependencies` has no home for its rationale** —
  `knip.json` is plain JSON and can't carry a comment. Recorded here: no source file imports
  `better-auth` directly, but the file:-linked `@jbroll/rowboat-auth-betterauth-react` package's
  built `dist` imports `better-auth/react`, which Node resolves from *this app's* `node_modules`
  (not the linked package's own). Removing the root `better-auth` dependency breaks the
  production build even though knip (correctly, from a static-import-graph view) sees it as
  unused.
