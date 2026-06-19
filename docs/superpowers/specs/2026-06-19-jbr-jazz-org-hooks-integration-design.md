# CheckList ⇄ jbr-jazz + org-hooks Integration — Design

**Date:** 2026-06-19
**Status:** Approved (design) — pending plan
**Author:** John Roll + Claude

## Goal

Bring the CheckList app into **full integration** with the latest `jbr-jazz`
packages and the `org-hooks` shared CI/hook system, following the wicketmap and
drop-notes reference repos. This is a **multi-step migration**, sequenced so each
phase lands behind a green `npm run check` before the next begins.

## Current State (verified 2026-06-19)

### jbr-jazz consumption
CheckList consumes jbr-jazz packages via `file:` deps:

- Frontend (`package.json`): `@jbr-jazz/hierarchy-client`, `@jbr-jazz/hierarchy-shared`,
  `@jbr-jazz/billing-shared`.
- Backend (`backend/package.json`): `@jbr-jazz/hierarchy-backend`,
  `@jbr-jazz/hierarchy-shared`, `@jbr-jazz/billing-backend`, `@jbr-jazz/billing-shared`.

**Version mismatch (the core risk):**
- CheckList: `jazz-tools ^0.19.16` (frontend) / `^0.19.15` (backend); resolves to `0.19.17`.
- Latest jbr-jazz: `hierarchy-backend` **hard-depends on `jazz-tools ^0.20.15`**;
  `shared`/`client` peer-range `>=0.19.0` (installs, but lets two majors coexist).

Two coexisting jazz-tools versions (0.19 + 0.20) is exactly the mismatch that
breaks Jazz CoValue runtime/schema identity. Must converge on **one** version.

### org-hooks consumption
CheckList is **not** wired to org-hooks. It uses a bespoke `scripts/git-hooks/`
(`install.sh` + `commit-msg`). Sibling repos (wicketmap, drop-notes, rkr-blog)
fully adopt org-hooks via `lefthook.yml` (remote → org-hooks configs) +
`lefthook-rc.sh` + `ci/setup.sh`.

### jazz-waist
The org-hooks `ts-jazz-waist` gate (`scripts/check-jazz-value-import-ban.mjs`)
bans **value** imports of bare `jazz-tools` and `jazz-tools/react` outside
`src/jazz/**` (runtime adapter) and `src/schema/**` (schema defs). `import type`
is always allowed; subpaths like `jazz-tools/testing` are allowed.

**Surface in CheckList:** 56 files import `jazz-tools`; **47 are type-only (allowed)**.
Only the following carry **value** imports that must route through the waist:

| File | Value bindings |
|------|----------------|
| `src/components/AuthGate.tsx` | `useAccount, useIsAuthenticated, useLogOut` (react) |
| `src/components/AuthGate.test.tsx` | hooks (react) — **test file, exempt** |
| `src/lib/jazz.tsx` | `JazzReactProvider, useAccount` (react) — **provider mount** |
| `src/services/checklistFolderFactory.ts` | `co` |
| `src/hooks/useCheckListHierarchy.ts` | `co, Group` |
| `src/services/import/jsonImporter.ts` | `Group` |
| `src/schemas/index.ts`, `src/schemas/tree.ts` | `co, z` — **schema, exempt once relocated** |

So the **non-exempt app files to convert are ~4** (`AuthGate.tsx`,
`checklistFolderFactory.ts`, `useCheckListHierarchy.ts`, `jsonImporter.ts`),
plus the provider (`src/lib/jazz.tsx`) and the schema-dir rename.

**Total runtime binding surface the waist must re-export:** `co`, `Group` from
`jazz-tools`; `useAccount`, `useIsAuthenticated`, `useLogOut`, `JazzReactProvider`
from `jazz-tools/react`. (jbr-jazz's own 0.20 code uses these same names, so no
API renames are expected — 0.20 risk is runtime/protocol, to be verified.)

## Decisions

- **Scope:** Full — Phases A–D, including simple-ci CI runner integration.
- **Schema dir:** Rename `src/schemas/` → `src/schema/` (the gate-exempt
  convention), updating all importers.

## Architecture: the narrow waist

```
                 ┌─────────────────────────────────────────┐
   app code ───► │  src/jazz/   (runtime adapter)           │ ──► jazz-tools
  (services,     │    index.ts   re-exports co, Group, …    │     jazz-tools/react
   components,   │    react.ts   re-exports hooks+provider  │
   hooks)        └─────────────────────────────────────────┘
                 ┌─────────────────────────────────────────┐
   schema defs ─►│  src/schema/  (co.map/z schema CoValues) │ ──► jazz-tools (co, z)
                 └─────────────────────────────────────────┘
   app code keeps `import type { … } from 'jazz-tools'` directly (allowed).
```

Only `src/jazz/**` and `src/schema/**` may value-import `jazz-tools`. Everything
else imports runtime from `@/jazz` and types from `jazz-tools` (type-only). The
JazzProvider mount (`src/lib/jazz.tsx`) either moves under `src/jazz/` or is
listed in `.jazz-waist-allow` (the documented escape valve).

## Phases

### Phase A — jazz-tools 0.20 upgrade (jbr-jazz compatibility)
1. Bump `jazz-tools` to the version jbr-jazz targets (`^0.20.15`) in both
   `package.json` and `backend/package.json`.
2. `npm install` in both; confirm the lockfile dedupes to a **single**
   jazz-tools version (`node_modules/jazz-tools` and any nested copies).
3. Fix 0.19→0.20 API/behavior breaks surfaced by `type-check`, unit tests, build.
4. Gate: `npm run check` green (type-check + lint + unit) and `npm run build`.
   Spot-check sync still works against the Jazz peer (manual or e2e).

### Phase B — jazz narrow-waist
1. Create `src/jazz/index.ts` (re-export `co`, `Group`, plus any runtime value
   later needed) and `src/jazz/react.ts` (re-export `useAccount`,
   `useIsAuthenticated`, `useLogOut`, `JazzReactProvider`).
2. Rename `src/schemas/` → `src/schema/`; update every importer (≈ many type-only
   importers + factory/services).
3. Convert the ~4 non-exempt value importers to import runtime from `@/jazz`,
   keeping their type imports as `import type … from 'jazz-tools'`.
4. Handle the provider mount (move into `src/jazz/` or `.jazz-waist-allow`).
5. Gate: `node scripts/check-jazz-value-import-ban.mjs src` clean (run the
   org-hooks script directly), plus `npm run check` green.

### Phase C — org-hooks adoption (lefthook)
1. Add `lefthook.yml`: `remotes:` → `/home/john/src/org-hooks` `ref: main`,
   `configs: [lefthook-common.yml, profiles/ts.yml]`; `rc: <abs>/lefthook-rc.sh`.
2. Add `lefthook-rc.sh` exporting `ORG_HOOKS` and sourcing `$ORG_HOOKS/rc.sh`.
3. Add repo-specific commands in `lefthook.yml`: `unit-tests`, `e2e-tests`, and a
   `commit-msg` hook that preserves CheckList's existing subject rules (10–72,
   ASCII-only, body = Co-Authored-By only). org-hooks `lefthook-common.yml`
   provides pre-commit hygiene + `pre-merge-commit`, **not** commit-msg, so the
   commit-msg policy stays repo-local.
4. Add npm `knip` script + `knip.json`; add devDeps `knip`, `dpdm` (biome,
   typescript already present). Ensure `type-check` covers all tsconfigs
   (app + backend + tests).
5. Satisfy remaining `profiles/ts.yml` gates (`ts-size-cap`, `ts-comment-hygiene`,
   `ts-deadcode`/knip, `ts-circular`/dpdm) — fix or configure per repo.
6. Retire `scripts/git-hooks/`; wire `lefthook install` via the `prepare` script.
7. Gate: a real `git commit` runs the full org-hooks tier and passes.

### Phase D — CI (simple-ci) integration
1. Add `ci/setup.sh` mirroring wicketmap: source secrets/services env, the
   **jazz version-lock** check (app `jazz-tools` must equal the CI sync
   service `jazz-run`), sibling `jbr-jazz` linking/rsync for `file:` deps,
   per-job ports, and (if e2e needs identities) Jazz account minting.
2. Register CheckList with simple-ci (`simple-ci.conf`) on the runner host.
3. Gate: a CI job checks out, installs, and runs lint + type-check + unit + e2e
   green on the runner.

## Testing strategy

- Each phase ends behind `npm run check` (+ `npm run build` for A/B).
- Phase A additionally verifies live Jazz sync (the protocol risk of 0.20).
- Phase C verifies via an actual commit; Phase D via an actual CI run.
- No new test framework — reuse existing Vitest + Playwright suites.

## Risks & mitigations

- **0.20 protocol/runtime breakage** (highest): converge to one jazz-tools
  version, verify live sync, keep Phase A isolated so a regression is bisectable.
- **jazz-run ↔ jazz-tools lockstep in CI**: Phase D's version-lock check
  hard-fails setup on mismatch (wicketmap pattern) rather than flaking e2e.
- **Hidden value imports via barrels**: run the waist script directly in Phase B
  before enabling the gate, fix all hits, keep `.jazz-waist-allow` empty except
  the provider.
- **ts.yml gates flag pre-existing debt** (size-cap, comment-hygiene, dead code):
  triage in Phase C — fix small ones, use documented per-repo override/allow
  files for the rest, log anything deferred.

## Out of scope

- Refactoring app features unrelated to the integration.
- Upgrading other dependencies beyond what 0.20 / org-hooks require.
- Changing the jbr-jazz packages themselves (consumed as-is).
