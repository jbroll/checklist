# Flake gate: generalization to unit tests + local tolerance — design

**Date:** 2026-07-17
**Status:** design (awaiting review)
**Repos touched:** `org-hooks` (primary), `checklist` (consumer wiring + vitest config)

## Problem

The org-hooks flake gate (`scripts/flake-gate.mjs` + `flake-gate-lib.mjs`) gives the **e2e**
(Playwright) suite a durable, history-aware flake signal on the CI host: it records each test's
per-run outcome to a shared firehose (`~/ci-flake/<repo>-flake.jsonl`) and blocks a commit only when a
test that flaked/failed *this* run is *historically* unstable (≥40% non-pass over its last 10 runs,
min 6 samples; fail-open on internal error).

Three gaps:

1. **The unit suites have no flake signal.** `vitest` (checklist frontend + backend) runs with no
   retries and no history. A one-off flake is an immediate hard failure; a chronic flake is invisible.
2. **checklist is not wired to the gate at all.** `~/ci-flake/` on the CI host has
   `wicketmap-flake.jsonl` but **no** `checklist-flake.jsonl`. checklist's `ci/e2e` runs plain
   `npm run test:e2e` and never invokes the gate.
3. **The local pre-commit hook has zero flake tolerance and no history.** It runs the full suite with
   no retries; a single contention flake hard-blocks the commit, with no local record to look back on
   and judge "is this test actually flaky on my machine?"

## Goals

- One **format-agnostic** gate that serves Playwright *and* vitest, reusing the existing pure trip
  core unchanged.
- A **vitest flake signal** (stock vitest JSON cannot express "flaky").
- **checklist wired in** for both suites, so `checklist-flake.jsonl` / `checklist-unit-flake.jsonl`
  accumulate on the CI host.
- **Local flake tolerance** driven by a **local firehose file, entirely separate from the CI host's
  `~/ci-flake/`** — same record format and same trip logic, independent history.

## Non-goals (YAGNI)

- Pulling CI flake history into the local hook (local uses its own file).
- e2e impact-based test selection in the local hook (stays CI-only, future work).
- A flake-report/dashboard CLI.
- Changing the trip thresholds or the fail-open contract.

## Architecture

The gate already operates on a normalized record: `{ testId, project, status }` where
`status ∈ { passed, flaky, failed }`. That contract is the seam. Everything upstream (how a suite
produces records) becomes a pluggable adapter; everything downstream (append to firehose, group by
testId, `computeTrips`, block/allow) is shared and **unchanged**.

```
Playwright JSON ──parseResults()────┐
                                    ├─► [ {testId,project,status} ] ─► flake-gate core ─► firehose + trip
vitest tasks ──vitest-flake-reporter┘         (normalized records)        (unchanged)     (path via env)
```

### Unit 1 — `flake-gate.mjs` becomes format-agnostic (org-hooks)

Add an input-format selector; keep Playwright the default so existing e2e behavior is untouched.

- `--format playwright` (default): read `PLAYWRIGHT_JSON` (default `test-results/results.json`), run
  the existing `parseResults`.
- `--format normalized`: read a JSONL file (path from `FLAKE_RECORDS` env or `--records <path>`) whose
  lines are already `{ testId, project, status }` — this is what the vitest reporter emits.

Unchanged: firehose resolution (`CI_FLAKE_FILE` → else `~/ci-flake/${CI_REPO}-flake.jsonl`), the
append, history read, `computeTrips`, the block message, and the fail-open wrapper.
`flake-gate-lib.mjs`'s `computeTrips` / `shouldTrip` / `rateOfWindow` are **not modified**.

### Unit 2 — `vitest-flake-reporter.mjs` (org-hooks, new)

A Vitest `Reporter` that, on run completion, walks finished tasks and emits one normalized record per
test to a file (path from `VITEST_FLAKE_OUT`):

- `failed` — final task result is `fail`.
- `flaky` — final result is `pass` **and** `result.retryCount > 0` (passed only after a retry).
- `passed` — otherwise.
- `testId = "<relFile> › <ancestorTitles joined by ' › '> › <title> › <project>"` (mirrors the e2e
  `file › title › project` shape so both firehoses read alike).
- `project` from `VITEST_PROJECT` env (`unit-frontend` | `unit-backend`).

**Implementation checkpoint (must verify first):** confirm Vitest 4 surfaces the retry count on the
task result (expected `task.result?.retryCount`). If the field name differs, only this reporter
changes — the record contract and everything downstream are unaffected. Frontend is vitest 4.0.x,
backend 4.1.x; verify on both.

### Unit 3 — vitest config: retries + reporter (checklist)

In both `vitest.config.ts` (frontend) and the backend vitest config:

- `test.retry = process.env.CI ? 2 : Number(process.env.FLAKE_LOCAL_RETRIES ?? 0)` — retries are what
  make "flaky" observable. CI mirrors Playwright's `retries: 2`. Locally, retries are enabled by the
  hook (see Unit 5) via `FLAKE_LOCAL_RETRIES`.
- Attach the custom reporter alongside the default when a flake-out path is set:
  `reporters` includes the org-hooks reporter iff `VITEST_FLAKE_OUT` is set (keeps normal
  `npm run test:run` unaffected when the env is absent).

### Unit 4 — CI wiring: checklist adopts the gate (checklist)

**Prerequisite (checklist Playwright config):** checklist currently sets `reporter: 'list'`, so no
`test-results/results.json` is produced and the gate's Playwright path has nothing to read. Add the
`json` reporter (retaining `list`) writing to `test-results/results.json` — e.g.
`reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]]`. Required for both the
CI and local e2e gate.

checklist keeps its self-contained `ci/*` scripts; each gains a gate call after its suite (matching
`org-hooks/ci/e2e.sh`'s pattern):

- `ci/e2e`: after `npm run test:e2e`, invoke
  `node "$ORG_HOOKS/scripts/flake-gate.mjs"` (`--format playwright`, firehose
  `~/ci-flake/checklist-flake.jsonl` via `CI_REPO=checklist`). `CI_REPO`/`CI_JOB_ID` are already
  exported by `ci-run.sh`.
- `ci/test`: run vitest with `VITEST_FLAKE_OUT` + `VITEST_PROJECT` set for each of frontend and
  backend, then invoke `flake-gate.mjs --format normalized` with
  `CI_FLAKE_FILE=~/ci-flake/checklist-unit-flake.jsonl`.

The e2e and unit CI runs already set `CI=true`, so retries are on and the flaky signal exists.

### Unit 5 — Local pre-commit tolerance, separate local firehose (org-hooks lefthook + checklist)

The local hook (lefthook `e2e-tests` / `unit-tests` commands) runs the suites with retries and records
to a **local** firehose, distinct from the CI host file:

- **Local firehose path:** `${FLAKE_HOME:-$HOME/.cache/org-hooks/flake}/<repo>-<suite>.jsonl`
  (e.g. `~/.cache/org-hooks/flake/checklist-e2e.jsonl`, `…/checklist-unit.jsonl`). Per-user,
  shared across this repo's worktrees, outside any git tree. **Never** `~/ci-flake/` (that is the CI
  host's).
- **e2e:** run with `--retries=2`; then call `flake-gate.mjs --format playwright` with
  `CI_FLAKE_FILE=<local e2e firehose>` and `CI_REPO=<repo>` (so it resolves a testId history) — a
  pass-on-retry is recorded `flaky` and allowed; a chronic local flake trips; a genuine failure fails
  all retries and blocks regardless of history.
- **unit:** run with `FLAKE_LOCAL_RETRIES=2` + `VITEST_FLAKE_OUT`; then
  `flake-gate.mjs --format normalized` with `CI_FLAKE_FILE=<local unit firehose>`.
- Same fail-open contract: any gate internal error logs and exits 0 — the hook must never wedge on the
  gate's own bug (a real test failure is surfaced by the suite's own exit code).

This gives the developer exactly the "look back and validate whether a test is flaky on my machine"
history they asked for, in a local file they own.

## Record & firehose contract (shared by CI and local)

- Firehose line: `{ "ts": ISO8601, "testId": string, "project": string, "status": "passed"|"flaky"|"failed" }`,
  one atomic `O_APPEND` write per test (<4 KB), lock-free.
- Trip: for each test that was non-pass this run, block iff its last-10 window has ≥6 samples and
  ≥40% non-pass. (Unchanged from today.)
- Fail-open everywhere.

## Testing

- **org-hooks unit tests** (existing harness `scripts/*.test.mjs`):
  - `vitest-flake-reporter` — given synthetic task trees (pass, fail, pass-after-retry, nested
    describe), asserts the emitted normalized records and testId shape. Include a backend-project case.
  - `flake-gate --format normalized` — feed a records JSONL + a seeded firehose; assert trip/no-trip
    and that fail-open holds on a malformed records file.
  - `parseResults` path unchanged — existing tests must stay green.
- **checklist**: a dry-run of `ci/test` and `ci/e2e` against a temp `CI_FLAKE_FILE` confirming the
  firehose gets lines and the gate exits 0 on a clean run.
- **Local**: run the pre-commit hook twice on a deliberately-seeded flaky test; confirm the local
  firehose accumulates and that a pass-on-retry does not block.

## Risks / open items

- **Vitest retry-count field** (Unit 2 checkpoint) — verify before building the reporter.
- **testId stability** — vitest testIds must be stable across runs (they are, being file+titles); a
  renamed test resets its history, which is acceptable.
- **Local firehose growth** — bounded windows make size irrelevant to logic, but add a simple
  keep-newest-N trim (cron-free; trim on write when a file exceeds a line cap) to avoid unbounded
  local growth. Mirror the CI host's rotation intent.
```

