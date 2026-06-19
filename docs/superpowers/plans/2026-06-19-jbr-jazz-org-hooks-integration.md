# CheckList ⇄ jbr-jazz + org-hooks Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring CheckList into full integration with the latest jbr-jazz packages (jazz-tools 0.20) and the org-hooks shared lefthook/CI system, including the jazz narrow-waist and simple-ci runner.

**Architecture:** Four sequenced phases, each ending behind a green `npm run check`. (A) converge jazz-tools to a single 0.20 version matching jbr-jazz. (B) route all frontend `jazz-tools` *value* imports through a `src/jazz/**` adapter + `src/schema/**` and satisfy the `ts-jazz-waist` gate. (C) replace bespoke git hooks with org-hooks via lefthook. (D) add simple-ci `ci/setup.sh` mirroring wicketmap.

**Tech Stack:** React 19 + TS + Vite, jazz-tools 0.20, Vitest + Playwright, Biome, lefthook + org-hooks, simple-ci.

## Global Constraints

- jazz-tools version: bump to `^0.20.15` in `package.json` and `backend/package.json`; lockfiles MUST resolve to a SINGLE jazz-tools version (no 0.19 + 0.20 coexistence).
- Soft deletes only (`archived: true`); never splice CoLists.
- Commit message format: subject 10-72 chars, ASCII only, body = `Co-Authored-By: Claude <noreply@anthropic.com>` only.
- jazz-waist: outside `**/jazz/**` (adapter) and `**/schema/**` (schemas), app code — **frontend AND backend** — may only `import type` from `jazz-tools` / `jazz-tools/react`; runtime values come from the waist (`@/jazz` frontend, `./jazz` backend). The gate scans BOTH `src/` and `backend/src/`. (`jazz-tools/worker`, `jazz-tools/better-auth/*`, `jazz-tools/testing` are non-bare subpaths and are never flagged.)
- org-hooks reference repos to mirror: `/home/john/src/wicketmap`, `/home/john/src/drop-notes`. org-hooks checkout: `/home/john/src/org-hooks`.
- Every phase ends behind `npm run check` green (+ `npm run build` for A/B).

---

## Phase A — jazz-tools 0.20 upgrade

### Task A1: Bump jazz-tools and reinstall to a single version

**Files:**
- Modify: `package.json:88` (`jazz-tools` → `^0.20.15`)
- Modify: `backend/package.json` (`jazz-tools` → `^0.20.15`)

**Interfaces:**
- Produces: a deduped `jazz-tools@0.20.x` across frontend + backend node_modules.

- [ ] **Step 1: Edit both manifests** — set `"jazz-tools": "^0.20.15"` in `package.json` and `backend/package.json`.

- [ ] **Step 2: Reinstall frontend** — Run: `npm install`. Expected: completes; `@jbr-jazz/*` file deps relink.

- [ ] **Step 3: Reinstall backend** — Run: `cd backend && npm install`.

- [ ] **Step 4: Verify single jazz-tools version**

Run: `npm ls jazz-tools; cd backend && npm ls jazz-tools`
Expected: one resolved version `0.20.x` in each tree; no deduped/extraneous `0.19.x`. Also check siblings: `node -e "console.log(require('jazz-tools/package.json').version)"` resolves to 0.20.x.

- [ ] **Step 5: Commit** (manifests + lockfiles, no code yet — pre-commit hygiene only)

```bash
git add package.json package-lock.json backend/package.json backend/package-lock.json
git commit -m "build: bump jazz-tools to 0.20 for jbr-jazz parity"
```

### Task A2: Fix 0.19→0.20 type/API breaks (discovery loop)

**Files:**
- Modify: any frontend/backend file surfaced by `type-check` (expected candidates: `src/lib/jazz.tsx`, `src/services/*`, `backend/src/index.ts`).
- Test: existing Vitest suites.

**Interfaces:**
- Consumes: jazz-tools 0.20 API. CheckList's runtime bindings are `co`, `Group`, `z`, `Account`, `CoMap` and react hooks — all present in jbr-jazz's own 0.20 code, so renames are unlikely; this task absorbs whatever the compiler actually reports.

- [ ] **Step 1: Run frontend type-check**

Run: `npm run type-check`
Expected: either clean, or a finite list of 0.20 type errors. Record them.

- [ ] **Step 2: Run backend type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: clean or a finite error list.

- [ ] **Step 3: Fix each surfaced error** — apply the minimal 0.20-compatible change per error (consult jbr-jazz's 0.20 usage as the reference for the corrected API). If no errors, skip to Step 5.

- [ ] **Step 4: Re-run both type-checks until clean** — repeat Step 1–3.

- [ ] **Step 5: Run unit tests**

Run: `npm run test:run && (cd backend && npm test)`
Expected: PASS. Fix any 0.20 runtime breaks (e.g. changed CoValue method names) until green.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit** (only if Steps 3/5 changed code)

```bash
git add -A
git commit -m "fix: adapt app code to jazz-tools 0.20 API"
```

### Task A2b: Fix 0.20 deep-loading regression (discovered during execution)

**Root cause:** jazz-tools 0.20 no longer auto-loads CoList *elements*. With the
account loaded via `useAccount()` without a resolve query, `account.root.folders`
has the right `length` but its elements are `null`, so `[...folders].filter(f => f != null)`
(in `getRootFolders`, tree builders, `addToLocation`) yields an empty list — the
UI shows "No lists yet" and folder/list/item creation silently no-ops. This broke
~65 e2e tests (every data-creating flow) while the app shell still loaded.

**Fix:**
- Add `export const ACCOUNT_RESOLVE = { root: { folders: { $each: true }, viewState: true, userSettings: true } }`
  in `src/schemas/index.ts`; give the `Account` schema a matching `.resolved(...)`
  default; in the migration, `ensureLoaded({ resolve: { folders: { $each: true } } })`
  before the empty-check.
- Pass `useAccount(Account, { resolve: ACCOUNT_RESOLVE })` at every data-rendering
  call site (8): `AppContainer`, `TestPage`, `AuthGate`, `InviteAcceptPage`,
  `SessionView`, `SessionZone`, `SessionItemRow`, `BillingSuccessPage`. (Sites
  using the type-param form `useAccount<typeof Account>()` passed no runtime
  schema — convert to the runtime-arg form.)
- Add `dedupe: ['jazz-tools','better-auth','react','react-dom']` to vite resolve
  (single-instance safety with file:-linked jbr-jazz).
- Also pin `better-auth` to `1.5.6` (jazz-tools 0.20 client plugin uses the older
  2-arg `getActions`; 1.6.x's 3-arg `BetterAuthClientPlugin` type-mismatches) and
  fix `backend/src/auth.ts` auth-instance typing (`Auth<concrete>` vs generic).

### Task A3: Verify live Jazz sync against the peer

**Files:** none (manual/e2e verification).

- [ ] **Step 1: Run the e2e suite** — Run: `npm run test:e2e`. Expected: PASS (this exercises real auth + Jazz sync). If the suite needs running servers, start `npm run dev` first per CLAUDE.md.

- [ ] **Step 2: If e2e cannot run locally**, do a manual smoke: `npm run dev`, sign in, create a folder/item, confirm it persists across reload (sync round-trip works on 0.20).

- [ ] **Step 3: Gate** — `npm run check` green. Phase A complete.

---

## Phase B — jazz narrow-waist

### Task B1: Create the `src/jazz/` runtime adapter

**Files:**
- Create: `src/jazz/index.ts`
- Create: `src/jazz/react.ts`

**Interfaces:**
- Produces:
  - `@/jazz` (= `src/jazz/index.ts`) re-exports runtime values `co`, `Group` from `jazz-tools`.
  - `@/jazz/react` (= `src/jazz/react.ts`) re-exports `useAccount`, `useIsAuthenticated`, `useLogOut`, `useCoState`, `useAcceptInvite`, `JazzReactProvider` from `jazz-tools/react`.

- [ ] **Step 1: Write `src/jazz/index.ts`**

```ts
// Jazz runtime narrow-waist. The ONLY non-schema module allowed to value-import
// from "jazz-tools" (enforced by org-hooks ts-jazz-waist). App code imports
// runtime values from "@/jazz"; types still come from "jazz-tools" directly.
export { co, Group } from 'jazz-tools';
```

- [ ] **Step 2: Write `src/jazz/react.ts`**

```ts
// React-side narrow-waist: the blessed re-export point for jazz-tools/react
// runtime hooks + provider. App code imports these from "@/jazz/react".
export {
  JazzReactProvider,
  useAcceptInvite,
  useAccount,
  useCoState,
  useIsAuthenticated,
  useLogOut,
} from 'jazz-tools/react';
```

- [ ] **Step 3: Confirm the `@/` alias resolves** — Run: `grep -n '"@/\*"\|"paths"' tsconfig.json vite.config.*`. If no `@/` alias exists, use relative imports (`../jazz`) in B3 instead and note it. Expected: record which form to use.

- [ ] **Step 4: Type-check** — Run: `npm run type-check`. Expected: PASS (new files compile).

- [ ] **Step 5: Commit**

```bash
git add src/jazz/index.ts src/jazz/react.ts
git commit -m "feat: add jazz narrow-waist runtime adapter"
```

### Task B2: Rename `src/schemas/` → `src/schema/`

**Files:**
- Rename: `src/schemas/{index,tree,index.test,tree.test}.ts` → `src/schema/`
- Modify: every importer of `../schemas` / `@/schemas` / `./schemas`.

**Interfaces:**
- Produces: schema modules at `src/schema/**` (the gate-exempt path); same exported symbols (`Account`, `FolderNode`, `TemplateItem`, `ShoppingSession`, `ItemState`, etc.).

- [ ] **Step 1: Move the directory with git**

Run:
```bash
git mv src/schemas src/schema
```
Expected: four files relocated.

- [ ] **Step 2: Find all importers**

Run: `grep -rln "schemas" src/ --include="*.ts" --include="*.tsx" | grep -v "src/schema/"`
Expected: a list of files referencing the old path.

- [ ] **Step 3: Rewrite import paths** — replace `schemas` → `schema` in each importer's jazz-schema import specifier (e.g. `from '../schemas'` → `from '../schema'`, `from '@/schemas/tree'` → `from '@/schema/tree'`). Be precise: only the schema-dir path segment, not unrelated words.

- [ ] **Step 4: Update any non-TS references** — Run: `grep -rln "src/schemas\|/schemas'" . --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules`. Fix vitest/biome/tsconfig include globs if they name `schemas`.

- [ ] **Step 5: Type-check + unit tests**

Run: `npm run type-check && npm run test:run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename src/schemas to src/schema for jazz-waist"
```

### Task B3: Route value imports through the waist

**Files:**
- Modify: `src/components/AuthGate.tsx:1`
- Modify: `src/services/checklistFolderFactory.ts:9`
- Modify: `src/hooks/useCheckListHierarchy.ts:27`
- Modify: `src/services/import/jsonImporter.ts:8`
- Modify: `src/lib/jazz.tsx` (provider mount — see Step 5)

**Interfaces:**
- Consumes: `@/jazz` (`co`, `Group`), `@/jazz/react` (hooks/provider) from B1.

- [ ] **Step 1: `AuthGate.tsx`** — change line 1 from
  `import { useAccount, useIsAuthenticated, useLogOut } from 'jazz-tools/react';`
  to `import { useAccount, useIsAuthenticated, useLogOut } from '@/jazz/react';`
  (use relative `../jazz/react` if no `@/` alias per B1 Step 3).

- [ ] **Step 2: `checklistFolderFactory.ts`** — change line 9 from
  `import { co, type Group, type InstanceOfSchema } from 'jazz-tools';`
  to two lines:
  `import { co, Group } from '@/jazz';`
  `import type { InstanceOfSchema } from 'jazz-tools';`
  (Note: `Group` is used as a value here? It is imported as `type Group` today — keep it `import type { Group, InstanceOfSchema } from 'jazz-tools';` and only move `co` to `@/jazz` if `Group` is type-only in this file. Verify usage with `grep -n "Group" src/services/checklistFolderFactory.ts` and split accordingly: value uses → `@/jazz`, type-only → `import type`.)

- [ ] **Step 3: `useCheckListHierarchy.ts`** — line 27 is
  `import { co, Group, type InstanceOfSchema } from 'jazz-tools';`
  `co` and `Group` are runtime values → `import { co, Group } from '@/jazz';` and `import type { InstanceOfSchema } from 'jazz-tools';`

- [ ] **Step 4: `jsonImporter.ts`** — line 8 is
  `import { Group, type InstanceOfSchema } from 'jazz-tools';`
  → `import { Group } from '@/jazz';` and `import type { InstanceOfSchema } from 'jazz-tools';`

- [ ] **Step 5: Provider mount `src/lib/jazz.tsx`** — this file value-imports `JazzReactProvider`, `useAccount` from `jazz-tools/react` and `AuthProvider` from `jazz-tools/better-auth/auth/react`, and re-exports hooks. Decision (per design): keep this file but make it import the provider/hooks from the waist so it carries no bare value import:
  - change line 2 `import { JazzReactProvider, useAccount } from 'jazz-tools/react';` → `import { JazzReactProvider, useAccount } from '@/jazz/react';`
  - change the re-export block (lines 68-74) to re-export from `@/jazz/react` instead of `jazz-tools/react`.
  - `jazz-tools/better-auth/auth/react` is a DIFFERENT subpath — NOT banned by the gate (gate matches only exact `jazz-tools` / `jazz-tools/react`). Leave it.

- [ ] **Step 6: Run the waist gate directly**

Run: `node /home/john/src/org-hooks/scripts/check-jazz-value-import-ban.mjs src`
Expected: exits 0 (no violations). If it flags a file, convert that import too.

- [ ] **Step 7: Type-check + unit tests + build**

Run: `npm run type-check && npm run test:run && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: route jazz value imports through narrow-waist"
```

### Task B4: Bring the backend into the waist

**Files:**
- Create: `backend/src/jazz/index.ts`
- Modify: `backend/src/agent.ts:2`

**Interfaces:**
- Produces: `backend/src/jazz/index.ts` re-exports runtime values `Account`, `CoMap` from `jazz-tools` (the only bare value bindings the backend uses). Path contains `src/jazz/` so the gate exempts it.

- [ ] **Step 1: Write `backend/src/jazz/index.ts`**

```ts
// Backend Jazz runtime narrow-waist. The ONLY non-schema backend module allowed
// to value-import from "jazz-tools" (enforced by org-hooks ts-jazz-waist over
// backend/src). Backend code imports runtime values from "./jazz" (relative);
// types still come from "jazz-tools" directly. Subpaths like
// "jazz-tools/worker" / "jazz-tools/better-auth/*" are not bare and are exempt.
export { Account, CoMap } from 'jazz-tools';
```

- [ ] **Step 2: Convert `backend/src/agent.ts`** — line 2 is
  `import { Account, type ID, CoMap } from 'jazz-tools';`
  Split into runtime-from-waist + type-from-jazz:
  `import { Account, CoMap } from './jazz';`
  `import type { ID } from 'jazz-tools';`
  (Adjust the relative path if `agent.ts` is not directly under `backend/src/`.)

- [ ] **Step 3: Run the waist gate over the backend tree**

Run: `node /home/john/src/org-hooks/scripts/check-jazz-value-import-ban.mjs backend/src`
Expected: exits 0. If any other backend file is flagged, add its value bindings to `backend/src/jazz/index.ts` and convert that import.

- [ ] **Step 4: Backend type-check + tests**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/jazz/index.ts backend/src/agent.ts
git commit -m "refactor: bring backend into jazz narrow-waist"
```

---

## Phase C — org-hooks adoption (lefthook)

### Task C1: Add lefthook + org-hooks wiring

**Files:**
- Create: `lefthook.yml`
- Create: `lefthook-rc.sh`
- Modify: `.gitignore` (add `lefthook-local.yml`)

**Interfaces:**
- Produces: lefthook config pulling org-hooks `lefthook-common.yml` + `profiles/ts.yml`, plus repo-local test + commit-msg commands.

- [ ] **Step 1: Write `lefthook-rc.sh`** (mirror wicketmap)

```sh
# Sourced by lefthook before every command (see `rc:` in lefthook.yml).
# Sets ORG_HOOKS so scripts from the org-hooks remote configs resolve.
export ORG_HOOKS=/home/john/src/org-hooks
# Pull org-wide hook env defaults (LEFTHOOK_OUTPUT, etc.). Each uses := —
# override by exporting before this line.
. "$ORG_HOOKS/rc.sh"
```

- [ ] **Step 2: Write `lefthook.yml`**

```yaml
# Hook config is pulled from the pinned org-hooks ref; this stub plus the
# repo-local commands below is all this repo carries.
remotes:
  - git_url: /home/john/src/org-hooks
    ref: main
    refetch: true
    configs:
      - lefthook-common.yml
      - profiles/ts.yml

rc: /home/john/src/checklist/lefthook-rc.sh

# ── Repo-local commands ──────────────────────────────────────────────────────
pre-commit:
  commands:
    # Override the inherited ts-jazz-waist (which scans only `src`) to ALSO
    # scan the backend tree — CheckList puts the backend under waist control.
    ts-jazz-waist:
      glob: "*.{ts,tsx,js,jsx,mjs}"
      run: node "${ORG_HOOKS}/scripts/check-jazz-value-import-ban.mjs" src && node "${ORG_HOOKS}/scripts/check-jazz-value-import-ban.mjs" backend/src
    # Full unit suite (frontend + backend) — fast, deterministic.
    unit-tests:
      glob: "*.{ts,tsx}"
      run: npm run test:run
    # Playwright e2e drives the real app; webServer auto-starts.
    e2e-tests:
      glob: "*.{ts,tsx,html}"
      run: npm run test:e2e

# Preserve CheckList's commit-message policy (subject 10-72, ASCII-only,
# body = Co-Authored-By only). org-hooks lefthook-common provides no commit-msg.
commit-msg:
  commands:
    format:
      run: 'bash scripts/git-hooks/check-commit-msg.sh {1}'
```

- [ ] **Step 3: Add `lefthook-local.yml` to `.gitignore`** (per org-hooks per-repo override convention).

- [ ] **Step 4: Commit** (config only)

```bash
git add lefthook.yml lefthook-rc.sh .gitignore
git commit -m "build: wire lefthook to org-hooks shared config"
```

### Task C2: Preserve commit-msg policy as a standalone script

**Files:**
- Create: `scripts/git-hooks/check-commit-msg.sh`

**Interfaces:**
- Consumes: `$1` = path to commit message file (passed by lefthook `{1}`).
- Produces: exit 0 on valid message, non-zero + reason on invalid.

- [ ] **Step 1: Write `scripts/git-hooks/check-commit-msg.sh`**

```sh
#!/bin/sh
# Commit-message policy: subject 10-72 chars, ASCII only, body lines limited to
# Co-Authored-By trailers. Skips merge/revert commits.
set -eu
MSG_FILE="$1"
# Skip merges/reverts.
first_line=$(grep -v '^#' "$MSG_FILE" | sed '/^$/d' | head -1)
case "$first_line" in
  Merge*|Revert*) exit 0 ;;
esac
# ASCII-only (no emoji / non-ASCII).
if LC_ALL=C grep -qP '[^\x00-\x7F]' "$MSG_FILE" 2>/dev/null || \
   LC_ALL=C grep -q '[^ -~]' "$MSG_FILE"; then
  echo "commit-msg: non-ASCII characters are not allowed" >&2
  exit 1
fi
len=${#first_line}
if [ "$len" -lt 10 ] || [ "$len" -gt 72 ]; then
  echo "commit-msg: subject must be 10-72 chars (got $len): $first_line" >&2
  exit 1
fi
# Body: every non-blank, non-comment line after the subject must be a
# Co-Authored-By trailer.
body=$(grep -v '^#' "$MSG_FILE" | sed '1d' | sed '/^$/d')
if [ -n "$body" ]; then
  bad=$(printf '%s\n' "$body" | grep -v '^Co-Authored-By:' || true)
  if [ -n "$bad" ]; then
    echo "commit-msg: body may only contain Co-Authored-By trailers" >&2
    printf '  offending: %s\n' "$bad" >&2
    exit 1
  fi
fi
exit 0
```

- [ ] **Step 2: Make executable** — Run: `chmod +x scripts/git-hooks/check-commit-msg.sh`.

- [ ] **Step 3: Manually test valid + invalid**

Run:
```bash
printf 'feat: a valid subject line here\n' > /tmp/ok.txt && bash scripts/git-hooks/check-commit-msg.sh /tmp/ok.txt && echo PASS-OK
printf 'bad\n' > /tmp/bad.txt && ! bash scripts/git-hooks/check-commit-msg.sh /tmp/bad.txt && echo PASS-REJECT
```
Expected: prints `PASS-OK` then `PASS-REJECT`.

- [ ] **Step 4: Commit**

```bash
git add scripts/git-hooks/check-commit-msg.sh
git commit -m "build: add standalone commit-msg policy check"
```

### Task C3: Add knip + dpdm tooling and update scripts

**Files:**
- Modify: `package.json` (devDeps + scripts)
- Create: `knip.json`

**Interfaces:**
- Produces: `npm run knip`, a `type-check` that covers app + backend, devDeps `knip` + `dpdm`.

- [ ] **Step 1: Add devDeps** — Run: `npm install -D knip dpdm`.

- [ ] **Step 2: Add/extend scripts in `package.json`**
  - add `"knip": "knip --no-progress"`
  - change `"type-check"` to cover backend too: `"tsc --noEmit && tsc --noEmit -p backend/tsconfig.json"`

- [ ] **Step 3: Write `knip.json`** (start permissive; tighten later)

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/main.tsx",
    "backend/src/index.ts",
    "*.config.{ts,js,mjs}",
    "scripts/**/*.{ts,js,mjs}"
  ],
  "project": ["src/**/*.{ts,tsx}", "backend/src/**/*.ts"],
  "ignore": ["website/**", "android/**", "ios/**"],
  "ignoreDependencies": ["@capacitor/.*"]
}
```

- [ ] **Step 4: Run knip and triage**

Run: `npm run knip`
Expected: a report. Resolve real dead code; add justified `ignore`/`ignoreDependencies` entries for false positives (e.g. Capacitor platform deps). Goal: `knip` exits 0.

- [ ] **Step 5: Verify type-check still green** — Run: `npm run type-check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json knip.json
git commit -m "build: add knip + dpdm and broaden type-check"
```

### Task C4: Remove ALL existing git hooks, install lefthook

**Files:**
- Delete: `scripts/git-hooks/install.sh`, `scripts/git-hooks/commit-msg`
- Modify: `package.json` (`prepare`, `setup:hooks` scripts)

**Interfaces:**
- Produces: `prepare` runs `lefthook install`; the bespoke hook system is fully removed; `.git/hooks/*` are lefthook-generated shims only.

This task completes the user directive "remove existing git hooks and replace with org-hooks": the only file surviving under `scripts/git-hooks/` is `check-commit-msg.sh` (a policy helper invoked BY lefthook, not a git hook itself).

- [ ] **Step 1: Point `prepare` at lefthook** — in `package.json` set
  `"prepare": "lefthook install"` and remove `setup:hooks` (or set it to `lefthook install`). Add `lefthook` to devDeps so it's pinned: Run `npm install -D lefthook`.

- [ ] **Step 2: Delete the old hook sources**

Run:
```bash
git rm scripts/git-hooks/install.sh scripts/git-hooks/commit-msg
```
(Keep `scripts/git-hooks/check-commit-msg.sh` from C2.)

- [ ] **Step 3: Remove the stale bespoke-installed hook + install lefthook**

Run:
```bash
rm -f .git/hooks/commit-msg          # the old bespoke-installed test-runner hook
npx lefthook install
```
Expected: writes `.git/hooks/pre-commit`, `commit-msg`, `pre-merge-commit` (lefthook shims). Confirm: `head -3 .git/hooks/pre-commit` shows lefthook; `head -3 .git/hooks/commit-msg` shows lefthook (not the old bespoke script).

- [ ] **Step 4: Dry-run the hook tier**

Run: `npx lefthook run pre-commit --all-files`
Expected: org-hooks hygiene + ts gates + unit/e2e run. Fix any gate failures surfaced (size-cap, comment-hygiene, deadcode, circular) — small fixes inline; documented per-repo override files for the rest; log anything deferred.

- [ ] **Step 5: Real commit to exercise the full path**

```bash
git add -A
git commit -m "build: replace bespoke git hooks with lefthook"
```
Expected: lefthook pre-commit + commit-msg run and pass.

---

## Phase D — simple-ci integration

### Task D1: Add `ci/setup.sh` mirroring wicketmap (scoped to CheckList)

**Files:**
- Create: `ci/setup.sh`

**Interfaces:**
- Consumes: `$WORKTREE`, `$CI_SLOT_INDEX`, `$CI_WORKSPACE` (set by ci-run.sh).
- Produces: per-job env, jazz version-lock guard, sibling `jbr-jazz` + `jazz-mock` linking, per-job backend `.env.local`.

- [ ] **Step 1: Write `ci/setup.sh`** — adapt wicketmap's, keeping only what CheckList needs:
  - source `~/.config/checklist/secrets.env` + `services.env` if present;
  - `export ORG_HOOKS="${ORG_HOOKS:-$HOME/src/org-hooks}"`;
  - jazz version-lock: read app `jazz-tools` from `package-lock.json`, compare to the CI jazz-sync service `jazz-run` version, hard-fail on mismatch (copy wicketmap's block verbatim, swapping the `JAZZ_SYNC_DIR` default if different);
  - sibling linking loop for `jbr-jazz` AND `jazz-mock` (CheckList's two `file:` siblings) — copy wicketmap's symlink/rsync-cross-fs loop, replacing `nmea-widgets` with `jazz-mock`;
  - per-job ports + `backend/.env.local` write (pick a free CheckList port band, e.g. backend `3001`, frontend `5173` offset by `CI_SLOT_INDEX`).

  (Exact content is assembled during execution from `/home/john/src/wicketmap/ci/setup.sh` as the template; every block above maps 1:1 to a wicketmap block.)

- [ ] **Step 2: Make executable** — `chmod +x ci/setup.sh`.

- [ ] **Step 3: Shellcheck** — Run: `shellcheck ci/setup.sh` (if available). Expected: clean or only intentional, annotated disables (as wicketmap does).

- [ ] **Step 4: Commit**

```bash
git add ci/setup.sh
git commit -m "ci: add simple-ci setup mirroring wicketmap"
```

### Task D2: Register CheckList with simple-ci

**Files:**
- Modify: `/home/john/src/simple-ci/simple-ci.conf` (add CheckList entry)

**Interfaces:**
- Consumes: simple-ci's repo registration format (read existing wicketmap entry first).

- [ ] **Step 1: Read the existing format** — Run: `grep -n -A8 "wicketmap" /home/john/src/simple-ci/simple-ci.conf`. Mirror it for checklist (repo path `/home/john/src/checklist`, test command `npm run test:ci`-equivalent, any `CI_NEED_JAZZ_AGENT` / env flags CheckList needs).

- [ ] **Step 2: Ensure a CI test entrypoint exists** — add a `"test:ci"` script to `package.json` if simple-ci expects one: `"test:ci": "npm run lint && npm run type-check && npm run test:run && npm run test:e2e"`.

- [ ] **Step 3: Trigger a CI run** — per simple-ci's mechanism (e.g. push to a branch or `ci-run.sh`). Expected: job checks out, `ci/setup.sh` runs, lint + type-check + unit + e2e pass on the runner.

- [ ] **Step 4: Commit** (the `test:ci` script, if added)

```bash
git add package.json
git commit -m "ci: add test:ci entrypoint for simple-ci"
```

---

## Final verification

- [ ] `npm run check` green.
- [ ] `npm run build` succeeds.
- [ ] `node /home/john/src/org-hooks/scripts/check-jazz-value-import-ban.mjs src` exits 0.
- [ ] `node /home/john/src/org-hooks/scripts/check-jazz-value-import-ban.mjs backend/src` exits 0.
- [ ] `npm ls jazz-tools` shows a single 0.20.x version (frontend + backend).
- [ ] A real `git commit` runs the lefthook + org-hooks tier (incl. backend waist) and the commit-msg policy.
- [ ] A simple-ci job passes end-to-end.

---

## Follow-up (separate effort, NOT this plan): wicketmap backend waist

Per the user, wicketmap's backend should also come under waist control — a
distinct repo and PR, tracked here so it isn't lost:

- The org-hooks `ts-jazz-waist` profile command defaults to scanning `src` only.
  Two options to make backends first-class:
  1. **Per-repo override (precedent set by THIS plan):** each repo overrides the
     `ts-jazz-waist` command in its own `lefthook.yml` to also scan `backend/src`
     (see Task C1). Lowest-risk, no org-hooks change. Recommended near-term.
  2. **Org-wide convention:** extend `profiles/ts.yml` so the gate scans an
     `JAZZ_WAIST_DIRS` list (default `src`), letting repos opt backend in via env.
     Cleaner long-term but touches every consumer — coordinate before changing.
- wicketmap backend waist work itself: inventory `wicketmap/backend/src` bare
  `jazz-tools` value imports (`grep -rn "from 'jazz-tools'" backend/src | grep -v 'import type'`),
  add `wicketmap/backend/src/jazz/index.ts`, convert importers, then add the same
  `ts-jazz-waist` backend-scan override to wicketmap's `lefthook.yml`. Mirror
  Task B4 + the C1 override exactly.
