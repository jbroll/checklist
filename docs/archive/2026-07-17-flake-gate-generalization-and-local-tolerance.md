# Flake gate generalization + local tolerance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the vitest suites and the local pre-commit hook the same history-aware flake detection the e2e (Playwright) suite has on CI, driven by a local firehose separate from the CI host's.

**Architecture:** The org-hooks flake gate already operates on a normalized `{testId, project, status}` record. Keep its pure trip core untouched; add a `normalized` input format so a new vitest reporter can feed it, and a single `flake-run.sh` orchestrator that runs a suite with retries and calls the gate — used by both CI (`~/ci-flake/…`) and the local hook (`~/.cache/org-hooks/flake/…`).

**Tech Stack:** Node ESM (`.mjs`), `node --test`, Bash, Vitest 4 reporter API (`@vitest/runner/utils`), Playwright JSON reporter, lefthook, simple-ci.

## Global Constraints

- **Two repos.** Shared code lands in `org-hooks` (`~/src/org-hooks`); consumer wiring/config lands in `checklist` (`~/src/checklist`). Commit to each repo separately.
- **Backward compatible.** `flake-gate.mjs` default format stays `playwright` — wicketmap and any other consumer are unaffected. Existing `flake-gate.test.mjs` must stay green.
- **Fail-open everywhere.** Any gate internal error logs a warning and exits 0; a real suite failure is surfaced by the suite's own exit code, never suppressed.
- **Local firehose is never the CI file.** Local base dir: `${FLAKE_HOME:-$HOME/.cache/org-hooks/flake}`. CI base dir: `$HOME/ci-flake`.
- **Normalized record contract:** JSON object `{ testId: string, project: string, status: "passed"|"flaky"|"failed" }`, one per line.
- **testId shapes:** e2e (existing) `"<file> › <title> › <project>"`; vitest `"<relFile> › <describe…> › <test> › <project>"` where project ∈ `unit-frontend | unit-backend`.
- **Trip logic unchanged:** block a non-pass test iff its last-10 window has ≥6 samples and ≥40% non-pass.

---

### Task 1: Generalize `flake-gate.mjs` to accept normalized records

**Files:**
- Modify: `~/src/org-hooks/scripts/flake-gate.mjs`
- Test: `~/src/org-hooks/scripts/flake-gate.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: gate honors `FLAKE_FORMAT=normalized` + `FLAKE_RECORDS=<jsonl path>`; default (`FLAKE_FORMAT` unset or `playwright`) is unchanged. Reused by Tasks 3/6.

- [ ] **Step 1: Write the failing test** — append to `flake-gate.test.mjs`:

```js
describe("flake-gate normalized format", () => {
  const orig = { ...process.env };
  const tmps = [];
  afterEach(() => {
    for (const k of ["CI_FLAKE_FILE", "CI_REPO", "FLAKE_FORMAT", "FLAKE_RECORDS"]) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
    for (const p of tmps.splice(0)) rmSync(p, { force: true });
  });

  it("appends normalized records to the firehose and exits 0 on a clean run", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "flake-norm-"));
    tmps.push(dir);
    const records = path.join(dir, "records.jsonl");
    const firehose = path.join(dir, "unit-flake.jsonl");
    writeFileSync(
      records,
      JSON.stringify({ testId: "src/a.test.ts › does x › unit-frontend", project: "unit-frontend", status: "passed" }) + "\n",
    );
    process.env.FLAKE_FORMAT = "normalized";
    process.env.FLAKE_RECORDS = records;
    process.env.CI_FLAKE_FILE = firehose;
    delete process.env.CI_REPO;

    const code = main();

    assert.equal(code, 0);
    const lines = readFileSync(firehose, "utf-8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.match(lines[0], /"testId":"src\/a\.test\.ts › does x › unit-frontend"/);
    assert.match(lines[0], /"status":"passed"/);
  });

  it("skips corrupt record lines (fail-open)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "flake-norm-"));
    tmps.push(dir);
    const records = path.join(dir, "records.jsonl");
    const firehose = path.join(dir, "unit-flake.jsonl");
    writeFileSync(records, "{not json}\n" + JSON.stringify({ testId: "t", project: "p", status: "passed" }) + "\n");
    process.env.FLAKE_FORMAT = "normalized";
    process.env.FLAKE_RECORDS = records;
    process.env.CI_FLAKE_FILE = firehose;
    const code = main();
    assert.equal(code, 0);
    assert.equal(readFileSync(firehose, "utf-8").trim().split("\n").length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/src/org-hooks && node --test scripts/flake-gate.test.mjs`
Expected: FAIL — the new cases record 0 lines (gate still parses `PLAYWRIGHT_JSON` and throws/returns empty on the missing report).

- [ ] **Step 3: Implement the format switch** in `flake-gate.mjs`.

Add `existsSync` to the fs import:
```js
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
```

Add a reader near the top of the module (after imports):
```js
/** Read a normalized-records JSONL into [{ testId, project, status }]. Skips corrupt lines. */
function readNormalized(recordsPath) {
  if (!recordsPath || !existsSync(recordsPath)) return [];
  const out = [];
  for (const line of readFileSync(recordsPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.testId && rec.status) {
        out.push({ testId: rec.testId, project: rec.project ?? "", status: rec.status });
      }
    } catch {
      // skip a partially-written / malformed line
    }
  }
  return out;
}
```

In `main()`, replace the block that builds `thisRun` from the Playwright report:
```js
  const report = JSON.parse(readFileSync(reportPath, "utf-8"));
  const thisRun = parseResults(report);
```
with:
```js
  const format = process.env.FLAKE_FORMAT ?? "playwright";
  const thisRun =
    format === "normalized"
      ? readNormalized(process.env.FLAKE_RECORDS)
      : parseResults(JSON.parse(readFileSync(reportPath, "utf-8")));
```
(Leave the `reportPath` line above it in place — it is only referenced on the playwright branch, which is fine.)

- [ ] **Step 4: Run tests to verify pass**

Run: `cd ~/src/org-hooks && node --test scripts/flake-gate.test.mjs`
Expected: PASS — all existing playwright cases plus the two new normalized cases.

- [ ] **Step 5: Commit**

```bash
cd ~/src/org-hooks
git add scripts/flake-gate.mjs scripts/flake-gate.test.mjs
git commit -m "feat(flake-gate): normalized-records input format (FLAKE_FORMAT=normalized)"
```

---

### Task 2: Vitest flake reporter

**Files:**
- Create: `~/src/org-hooks/scripts/vitest-flake-reporter.mjs`
- Test: `~/src/org-hooks/scripts/vitest-flake-reporter.test.mjs`

**Interfaces:**
- Consumes: env `VITEST_FLAKE_OUT` (records output path), `VITEST_PROJECT` (project label).
- Produces: default-export reporter class with `onFinished(files)` writing normalized JSONL — `flaky` when a test's final `result.state==='pass'` and `result.retryCount>0`, `failed` on `state==='fail'`, else `passed`. Consumed by vitest (Task 4) and `flake-run.sh` (Task 3).

- [ ] **Step 1: Write the failing test** — `vitest-flake-reporter.test.mjs`:

```js
// Run with: node --test scripts/vitest-flake-reporter.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import FlakeReporter from "./vitest-flake-reporter.mjs";

/** Build a linked file→suite→test task tree the way @vitest/runner expects. */
function makeFile(relPath, tests) {
  const file = { type: "suite", name: relPath, filepath: `/abs/${relPath}`, tasks: [] };
  file.file = file;
  for (const t of tests) {
    const suite = { type: "suite", name: t.group, file, tasks: [] };
    suite.suite = file;
    const test = {
      type: "test",
      name: t.title,
      suite,
      file,
      result: { state: t.state, retryCount: t.retryCount ?? 0 },
    };
    suite.tasks.push(test);
    file.tasks.push(suite);
  }
  return file;
}

describe("vitest-flake-reporter", () => {
  const orig = { ...process.env };
  const tmps = [];
  afterEach(() => {
    for (const k of ["VITEST_FLAKE_OUT", "VITEST_PROJECT"]) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
    for (const p of tmps.splice(0)) rmSync(p, { recursive: true, force: true });
  });

  it("classifies passed / failed / flaky and stamps the project into testId", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vflake-"));
    tmps.push(dir);
    const out = path.join(dir, "records.jsonl");
    process.env.VITEST_FLAKE_OUT = out;
    process.env.VITEST_PROJECT = "unit-frontend";

    const file = makeFile("src/a.test.ts", [
      { group: "G", title: "clean", state: "pass", retryCount: 0 },
      { group: "G", title: "recovered", state: "pass", retryCount: 1 },
      { group: "G", title: "broken", state: "fail", retryCount: 2 },
    ]);
    new FlakeReporter().onFinished([file]);

    const recs = readFileSync(out, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const byTitle = Object.fromEntries(recs.map((r) => [r.testId, r.status]));
    assert.equal(byTitle["src/a.test.ts › G › clean › unit-frontend"], "passed");
    assert.equal(byTitle["src/a.test.ts › G › recovered › unit-frontend"], "flaky");
    assert.equal(byTitle["src/a.test.ts › G › broken › unit-frontend"], "failed");
    for (const r of recs) assert.equal(r.project, "unit-frontend");
  });

  it("is a no-op when VITEST_FLAKE_OUT is unset", () => {
    delete process.env.VITEST_FLAKE_OUT;
    // Must not throw.
    new FlakeReporter().onFinished([makeFile("src/a.test.ts", [{ group: "G", title: "x", state: "pass" }])]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/src/org-hooks && node --test scripts/vitest-flake-reporter.test.mjs`
Expected: FAIL — `Cannot find module './vitest-flake-reporter.mjs'`.

- [ ] **Step 3: Implement the reporter** — `vitest-flake-reporter.mjs`:

```js
// Vitest reporter that emits normalized flake records for org-hooks' flake gate.
// Writes one {testId, project, status} JSON line per test to VITEST_FLAKE_OUT.
// status: "flaky" when the test passed only after a retry (result.retryCount > 0),
// "failed" when its final state is fail, else "passed". Skipped/todo are omitted.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getFullName, getTests } from "@vitest/runner/utils";

function normalize(test) {
  const r = test.result;
  if (r?.state === "fail") return "failed";
  if (r?.state === "pass") return (r.retryCount ?? 0) > 0 ? "flaky" : "passed";
  return null; // skipped / todo / not-run
}

export default class FlakeReporter {
  onFinished(files = []) {
    const out = process.env.VITEST_FLAKE_OUT;
    if (!out) return;
    const project = process.env.VITEST_PROJECT ?? "unit";
    const lines = [];
    for (const test of getTests(files)) {
      const status = normalize(test);
      if (!status) continue;
      const testId = `${getFullName(test, " › ")} › ${project}`;
      lines.push(JSON.stringify({ testId, project, status }));
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, lines.length ? lines.join("\n") + "\n" : "");
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd ~/src/org-hooks && node --test scripts/vitest-flake-reporter.test.mjs`
Expected: PASS — both cases.

- [ ] **Step 5: Commit**

```bash
cd ~/src/org-hooks
git add scripts/vitest-flake-reporter.mjs scripts/vitest-flake-reporter.test.mjs
git commit -m "feat(flake): vitest reporter emitting normalized flake records"
```

---

### Task 3: Shared `flake-run.sh` orchestrator

**Files:**
- Create: `~/src/org-hooks/scripts/flake-run.sh` (chmod +x)

**Interfaces:**
- Consumes: `flake-gate.mjs` (Task 1), `vitest-flake-reporter.mjs` (Task 2). Env: `CI` (selects CI vs local base dir + retries), `CI_REPO` (repo label; else `git` basename), `FLAKE_HOME`, `FLAKE_LOCAL_RETRIES`.
- Produces: `flake-run.sh <e2e|unit>` — runs the suite with retries, records to the correct firehose, exits non-zero on a real suite failure or a historical trip. Called by Task 6 (CI scripts + local hook).

- [ ] **Step 1: Implement the orchestrator** — `flake-run.sh`:

```bash
#!/usr/bin/env bash
# flake-run.sh <e2e|unit> — run a suite with retries and feed the org-hooks flake gate.
# CI (CI=true): firehose ~/ci-flake/<repo>-<suite>.jsonl, retries 2.
# Local:        firehose ${FLAKE_HOME:-~/.cache/org-hooks/flake}/<repo>-<suite>.jsonl.
# Fail-open: the gate never wedges the run; a real suite failure exits non-zero regardless.
set -uo pipefail
KIND="${1:?usage: flake-run.sh <e2e|unit>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/flake-gate.mjs"
REPORTER="$HERE/vitest-flake-reporter.mjs"
REPO="${CI_REPO:-$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo repo)")}"

if [ -n "${CI:-}" ]; then
  BASE="$HOME/ci-flake"; RETRIES=2
else
  BASE="${FLAKE_HOME:-$HOME/.cache/org-hooks/flake}"; RETRIES="${FLAKE_LOCAL_RETRIES:-2}"
fi
mkdir -p "$BASE"

case "$KIND" in
  e2e)
    FIRE="$BASE/${REPO}-e2e.jsonl"
    set +e
    npm run test:e2e -- --retries="$RETRIES"
    SUITE=$?
    CI_FLAKE_FILE="$FIRE" CI_REPO="$REPO" PLAYWRIGHT_JSON="test-results/results.json" node "$GATE"
    GATE_EXIT=$?
    set -e
    ;;
  unit)
    FIRE="$BASE/${REPO}-unit.jsonl"
    REC="$(mktemp)"; REC_BE="$(mktemp)"
    set +e
    VITEST_RETRY="$RETRIES" VITEST_FLAKE_REPORTER="$REPORTER" VITEST_FLAKE_OUT="$REC" \
      VITEST_PROJECT="unit-frontend" npm run test:run
    FE=$?
    ( cd backend && VITEST_RETRY="$RETRIES" VITEST_FLAKE_REPORTER="$REPORTER" VITEST_FLAKE_OUT="$REC_BE" \
      VITEST_PROJECT="unit-backend" npm test )
    BE=$?
    cat "$REC_BE" >> "$REC" 2>/dev/null || true
    SUITE=0; { [ $FE -eq 0 ] && [ $BE -eq 0 ]; } || SUITE=1
    CI_FLAKE_FILE="$FIRE" CI_REPO="$REPO" FLAKE_FORMAT=normalized FLAKE_RECORDS="$REC" node "$GATE"
    GATE_EXIT=$?
    rm -f "$REC" "$REC_BE"
    set -e
    ;;
  *) echo "flake-run.sh: unknown suite '$KIND'" >&2; exit 2 ;;
esac

[ "${SUITE:-0}" -eq 0 ] || exit "$SUITE"
exit "${GATE_EXIT:-0}"
```

- [ ] **Step 2: Make it executable + syntax-check**

Run:
```bash
cd ~/src/org-hooks && chmod +x scripts/flake-run.sh && bash -n scripts/flake-run.sh && echo "syntax OK"
```
Expected: `syntax OK`.

- [ ] **Step 3: Commit**

```bash
cd ~/src/org-hooks
git add scripts/flake-run.sh
git commit -m "feat(flake): shared flake-run.sh orchestrator (CI + local firehose)"
```

---

### Task 4: Vitest configs read retry + reporter env (checklist)

**Files:**
- Modify: `~/src/checklist/vitest.config.ts` (frontend)
- Modify: `~/src/checklist/backend/vitest.config.ts`

**Interfaces:**
- Consumes: env `VITEST_RETRY`, `VITEST_FLAKE_REPORTER` (from Task 3).
- Produces: both configs retry per `VITEST_RETRY` (CI default 2, else 0) and attach the custom reporter when `VITEST_FLAKE_REPORTER` is set. Absent envs → today's behavior (used by Task 6).

- [ ] **Step 1: Frontend `vitest.config.ts`** — inside `test: { … }`, add after `globals: true,`:

```ts
    retry: Number(process.env.VITEST_RETRY ?? (process.env.CI ? 2 : 0)),
    reporters: process.env.VITEST_FLAKE_REPORTER
      ? ['default', process.env.VITEST_FLAKE_REPORTER]
      : ['default'],
```

- [ ] **Step 2: Backend `backend/vitest.config.ts`** — inside `test: { … }`, add after `globals: true,`:

```ts
    retry: Number(process.env.VITEST_RETRY ?? (process.env.CI ? 2 : 0)),
    reporters: process.env.VITEST_FLAKE_REPORTER
      ? ['default', process.env.VITEST_FLAKE_REPORTER]
      : ['default'],
```

- [ ] **Step 3: Verify the reporter wires up and emits records**

Run (frontend, one fast test file, real reporter path):
```bash
cd ~/src/checklist
VITEST_FLAKE_REPORTER="$HOME/src/org-hooks/scripts/vitest-flake-reporter.mjs" \
VITEST_FLAKE_OUT=/tmp/fe-records.jsonl VITEST_PROJECT=unit-frontend \
  npx vitest run src/utils/sortOrderHelpers.test.ts >/dev/null 2>&1
head -3 /tmp/fe-records.jsonl
```
Expected: JSON lines like `{"testId":"src/utils/sortOrderHelpers.test.ts › … › unit-frontend","project":"unit-frontend","status":"passed"}`.

- [ ] **Step 4: Confirm default behavior unchanged**

Run: `cd ~/src/checklist && npm run test:run 2>&1 | tail -3`
Expected: full suite passes; no reporter file written (env unset).

- [ ] **Step 5: Commit**

```bash
cd ~/src/checklist
git add vitest.config.ts backend/vitest.config.ts
git commit -m "feat(test): vitest retry + flake reporter driven by env (frontend + backend)"
```
(Config-only + tests still run in-hook; the pre-commit hook will exercise unit + e2e.)

---

### Task 5: Playwright emits a JSON report (checklist)

**Files:**
- Modify: `~/src/checklist/playwright.config.ts:72`

**Interfaces:**
- Produces: `test-results/results.json` on every run — the gate's playwright input (Task 3/6).

- [ ] **Step 1: Replace the reporter line** at `playwright.config.ts:72`:

```ts
  reporter: 'list',
```
with:
```ts
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
```

- [ ] **Step 2: Verify the JSON report is produced**

Run:
```bash
cd ~/src/checklist
rm -f test-results/results.json
npx playwright test e2e/smoke.spec.ts --reporter=list,json >/dev/null 2>&1 || true
PLAYWRIGHT_JSON=1 npx playwright test e2e/smoke.spec.ts >/dev/null 2>&1
test -f test-results/results.json && echo "results.json present"
```
Expected: `results.json present`. (The config change makes the file appear on a normal `npm run test:e2e` too.)

- [ ] **Step 3: Commit**

```bash
cd ~/src/checklist
git add playwright.config.ts
git commit -m "feat(test): emit Playwright JSON report for the flake gate"
```

---

### Task 6: Wire CI jobs and the local hook to `flake-run.sh` (checklist)

**Files:**
- Modify: `~/src/checklist/ci/e2e`
- Modify: `~/src/checklist/ci/test`
- Modify: `~/src/checklist/lefthook.yml` (`unit-tests`, `e2e-tests` commands)

**Interfaces:**
- Consumes: `flake-run.sh` (Task 3), Task 4/5 config. `ORG_HOOKS` env resolves to `~/src/org-hooks` (already used by other hook commands and `ci/setup.sh`).

- [ ] **Step 1: Confirm `ORG_HOOKS` is exported in both contexts**

Run:
```bash
cd ~/src/checklist
grep -rnE "ORG_HOOKS" lefthook-rc.sh ci/setup.sh
```
Expected: an `export ORG_HOOKS=…` (or equivalent) in each. If CI's `ci/setup.sh` lacks it, add `export ORG_HOOKS="${ORG_HOOKS:-$HOME/src/org-hooks}"` near the top of `ci/setup.sh` in this step.

- [ ] **Step 2: `ci/e2e`** — replace the final `npm run test:e2e` line with:

```bash
"${ORG_HOOKS:-$HOME/src/org-hooks}/scripts/flake-run.sh" e2e
```

- [ ] **Step 3: `ci/test`** — replace the two test-run lines (`npm run test:run` and `( cd backend && npm test )`) with a single:

```bash
"${ORG_HOOKS:-$HOME/src/org-hooks}/scripts/flake-run.sh" unit
```
Keep the preceding `npm run lint` and `npm run type-check` lines as-is.

- [ ] **Step 4: `lefthook.yml`** — change the two command bodies:

```yaml
    unit-tests:
      glob: "*.{ts,tsx}"
      run: '"${ORG_HOOKS}/scripts/flake-run.sh" unit'
    e2e-tests:
      glob: "*.{ts,tsx,html}"
      run: '"${ORG_HOOKS}/scripts/flake-run.sh" e2e'
```

- [ ] **Step 5: Verify the local hook path end-to-end (records accumulate, no CI file touched)**

Run a direct local invocation of the unit path (fast — exercises reporter → gate → local firehose):
```bash
cd ~/src/checklist
rm -f "$HOME/.cache/org-hooks/flake/checklist-unit.jsonl"
FLAKE_LOCAL_RETRIES=1 "$HOME/src/org-hooks/scripts/flake-run.sh" unit >/tmp/flake-local.log 2>&1; echo "exit=$?"
wc -l "$HOME/.cache/org-hooks/flake/checklist-unit.jsonl"
```
Expected: `exit=0`; the local firehose has one line per unit test; `~/ci-flake/` untouched (does not exist locally).

- [ ] **Step 6: Verify a flake passes the local gate (retry tolerance)**

Create a throwaway flaky test that fails once then passes, run the unit path twice, confirm it is recorded `flaky` and does not block:
```bash
cd ~/src/checklist
cat > src/__flake_probe.test.ts <<'EOF'
import { it, expect } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
const marker = '/tmp/flake-probe-marker';
it('flakes once then passes', () => {
  if (!existsSync(marker)) { writeFileSync(marker, '1'); throw new Error('first-try flake'); }
  expect(true).toBe(true);
});
EOF
rm -f /tmp/flake-probe-marker
FLAKE_LOCAL_RETRIES=2 "$HOME/src/org-hooks/scripts/flake-run.sh" unit >/tmp/flake-probe.log 2>&1; echo "exit=$?"
grep -o '"testId":"[^"]*__flake_probe[^"]*"[^}]*' "$HOME/.cache/org-hooks/flake/checklist-unit.jsonl" | tail -1
rm -f src/__flake_probe.test.ts /tmp/flake-probe-marker
```
Expected: `exit=0`; the probe's last record shows `"status":"flaky"`.

- [ ] **Step 7: Commit**

```bash
cd ~/src/checklist
git add ci/e2e ci/test lefthook.yml
git commit -m "feat(ci): route unit + e2e suites through flake-run.sh (CI + local firehose)"
```

---

## Self-Review

- **Spec coverage:**
  - Unit 1 (format-agnostic gate) → Task 1. ✅
  - Unit 2 (vitest reporter, retryCount checkpoint) → Task 2 (verified `result.retryCount` exists in Vitest 4 during planning). ✅
  - Unit 3 (vitest retry + reporter config) → Task 4. ✅
  - Unit 4 (CI adoption for checklist) + Playwright JSON prerequisite → Tasks 5, 6. ✅
  - Unit 5 (local tolerance, separate local firehose) → Tasks 3, 6. ✅
  - Record & firehose contract → Global Constraints + Tasks 1–3. ✅
  - Firehose trim (spec "Risks") → **deferred**: per-testId windows are last-10, so unbounded lines don't affect logic; local growth is slow. Not built now (YAGNI); revisit if a local firehose gets large.
- **Placeholder scan:** none — every code/step is concrete.
- **Type/name consistency:** `VITEST_FLAKE_OUT`/`VITEST_PROJECT`/`VITEST_RETRY`/`VITEST_FLAKE_REPORTER`, `FLAKE_FORMAT=normalized`/`FLAKE_RECORDS`, `CI_FLAKE_FILE`, firehose names `<repo>-e2e.jsonl` / `<repo>-unit.jsonl` used identically across Tasks 1–6. Reporter is a default-export class with `onFinished(files)` consistent with the vitest config string-path wiring.
```
