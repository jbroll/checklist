# Sub-project A — Deploy rowboat.rkroll.com + local-dev harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give CheckList dev a real hosted `@jbroll/rowboat-server` to point at locally, and finish the (already-scaffolded) rowboat.rkroll.com deploy so prod runs the assembled server with JWT auth + RBAC on.

**Architecture:** The rowboat prod deploy is **already scaffolded** — `packages/server/deploy.conf` targets rowboat.rkroll.com (Apache + letsencrypt + a systemd `node_app` on port 3010, code in `/opt/rowboat`, data in `/var/lib/rowboat`). Sub-project A **finishes** that (adds the JWT/RBAC env, a build+deploy wrapper, and a human-run deploy runbook) and **adds the net-new local-dev harness**: a `dev:rowboat` process that runs the same server from source via `tsx` beside CheckList's frontend + auth backend. Nothing here changes the CheckList app's runtime behavior — it is deployment + dev scaffolding that sub-projects B–E then consume.

**Tech Stack:** `@jbroll/rowboat-server` (assembly + control-plane + listener/writer worker threads), `tsx` (run TS from source, no build), `concurrently` (dev process group), `deploy.sh` (the shared modular deploy engine at `~/src/deploy.sh/deploy.sh`), Apache reverse-proxy + letsencrypt + systemd (`node_app`).

## Global Constraints

- **Two repos, two land flows.** CheckList changes (Task 1) land in the **CheckList** repo (`/home/john/src/checklist`) — branch off `main` first (never commit on `main` directly), then merge. rowboat changes (Tasks 2–4) are made in the **wt2 worktree** `/home/john/src/rowboat-wt2` (branch `wt2`), rebased on rowboat `main`, and landed via `scripts/land.sh wt2` from the rowboat repo.
- **Never `--no-verify`.** Commits go through the org-hooks gate (type-check + lint + tests). ALL hook checks must pass. Non-code changes (pure `.md`) skip the code gate.
- **Sibling-repo layout is assumed** (as elsewhere in CheckList): CheckList at `/home/john/src/checklist`, rowboat at `/home/john/src/rowboat`, so rowboat packages are reachable at `../rowboat/packages/*`. The dev harness runs the server from that sibling source tree; it does **not** add `@jbroll/rowboat-server` to CheckList's dependencies.
- **rowboat packages must be built** for the harness/deploy to run (their `@jbroll/*` deps resolve to `dist/`). `scripts/land.sh` keeps dist built; assume built.
- **Dev/prod parity = JWT + RBAC.** Both the local harness and the prod deploy set `ROWBOAT_AUTH_MODE=jwt` and `ROWBOAT_RBAC=on` (cutover-design decisions 3 & 4). These default OFF in the engine; A turns them on for CheckList's use.
- **Prod deploy facts (from `deploy.conf`, do not change):** domain `rowboat.rkroll.com`, router/proxy port `3010`, code `/opt/rowboat`, data `/var/lib/rowboat`, service user `john`, `NODE_APP_DEPLOY_DIRS="dist spa"`, secrets file `rowboat.env.secret` (gitignored).
- **The prod deploy itself runs on a host these agents cannot reach.** Tasks 2–4 produce the *committable* artifacts (env template, build+deploy wrapper, runbook); the actual `deploy.sh init` on the box is the human operator's step, documented in the runbook (Task 4).

---

## File structure

**CheckList repo (Task 1):**
- Create: `scripts/dev-rowboat.sh` — wrapper that sets dev env defaults and runs the sibling rowboat-server from source via `tsx`.
- Modify: `package.json` — add `dev:rowboat` script; add it to the `dev` concurrently group.
- Modify: `.gitignore` — ignore the scratch `.rowboat-dev/` state dir.
- Modify: `docs/HOSTED_ROWBOAT.md` — document the local harness + point at the deploy runbook; mark sub-project A.

**rowboat repo, wt2 worktree (Tasks 2–4):**
- Modify: `packages/server/rowboat.env.secret.example` — add `ROWBOAT_AUTH_MODE=jwt` + `ROWBOAT_RBAC=on`.
- Create: `packages/server/deploy-full.sh` — build server bundle + console SPA, stage `spa/`, invoke `deploy.sh`.
- Create: `packages/server/DEPLOY_RUNBOOK.md` — the human-run deploy procedure (DNS, secrets, first deploy, smoke, updates).

---

## Task 1: Local-dev harness (`dev:rowboat`)

**Files:**
- Create: `/home/john/src/checklist/scripts/dev-rowboat.sh`
- Modify: `/home/john/src/checklist/package.json:7` (the `dev` script) and the `scripts` block
- Modify: `/home/john/src/checklist/.gitignore`
- Modify: `/home/john/src/checklist/docs/HOSTED_ROWBOAT.md`

**Model:** `sonnet` — cross-repo process wiring + verifying a live server boot; judgment beyond verbatim transcription.

**Interfaces:**
- Consumes: nothing from other A tasks (independent). Relies on the sibling rowboat checkout at `../rowboat/packages/server/src/main.ts` and its `configFromEnv` env contract (`ROWBOAT_ROOT`, `ROUTER_PORT`, `ROUTER_SECRET`, `AUTH_SECRET`, `AUTH_BASE_URL`, `ROWBOAT_AUTH_MODE`, `ROWBOAT_RBAC`).
- Produces: a local hosted-rowboat base URL `http://localhost:3020` that sub-projects C/D point the CheckList client at in dev; `npm run dev` now runs frontend + auth backend + local rowboat together.

- [ ] **Step 1: Write the harness script**

Create `/home/john/src/checklist/scripts/dev-rowboat.sh`:

```bash
#!/usr/bin/env bash
# Local-dev harness (cutover-design sub-project A). Runs a local @jbroll/rowboat-server beside
# CheckList's frontend + auth backend so dev has a real hosted rowboat to point at. Parity with
# prod: ROWBOAT_AUTH_MODE=jwt + ROWBOAT_RBAC=on (decision 4). The server is run FROM SOURCE via tsx
# against the sibling rowboat checkout — no build step: the worker .mjs files resolve as committed
# siblings of each package's dist/. Scratch state lives in .rowboat-dev/ (gitignored); delete it to
# reset. Every env var is overridable so an integration test / alt port can reuse this script.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"          # checklist repo root
server_main="$here/../rowboat/packages/server/src/main.ts"

if [[ ! -f "$server_main" ]]; then
  echo "dev-rowboat: expected the sibling rowboat server at $server_main" >&2
  echo "dev-rowboat: is ../rowboat checked out and built (npm install && build)?" >&2
  exit 1
fi

export ROWBOAT_ROOT="${ROWBOAT_ROOT:-$here/.rowboat-dev}"
export ROUTER_PORT="${ROUTER_PORT:-3020}"
export ROUTER_SECRET="${ROUTER_SECRET:-dev-router-secret-not-for-prod}"
export AUTH_SECRET="${AUTH_SECRET:-dev-auth-secret-not-for-prod}"
export AUTH_BASE_URL="${AUTH_BASE_URL:-http://localhost:${ROUTER_PORT}/api/auth}"
export ROWBOAT_AUTH_MODE="${ROWBOAT_AUTH_MODE:-jwt}"
export ROWBOAT_RBAC="${ROWBOAT_RBAC:-on}"

echo "dev-rowboat: local rowboat-server on :${ROUTER_PORT} (root=${ROWBOAT_ROOT}, auth=${ROWBOAT_AUTH_MODE}, rbac=${ROWBOAT_RBAC})"
exec npx tsx "$server_main"
```

Make it executable:

```bash
chmod +x /home/john/src/checklist/scripts/dev-rowboat.sh
```

- [ ] **Step 2: Ignore the scratch state dir**

Append to `/home/john/src/checklist/.gitignore` (after the `e2e/.auth/` block):

```gitignore

# Local hosted-rowboat dev harness scratch state (scripts/dev-rowboat.sh)
.rowboat-dev/
```

- [ ] **Step 3: Wire the npm scripts**

In `/home/john/src/checklist/package.json`, replace the `dev` line (line 7) and add `dev:rowboat` immediately after `dev:backend`:

```json
    "dev": "concurrently -n \"frontend,backend,rowboat\" -c \"cyan,magenta,green\" \"npm run dev:frontend\" \"npm run dev:backend\" \"npm run dev:rowboat\"",
    "dev:frontend": "vite",
    "dev:backend": "cd backend && npm run dev",
    "dev:rowboat": "bash scripts/dev-rowboat.sh",
```

(`concurrently` without `--kill-others` keeps frontend+backend running even if rowboat exits, so this cannot destabilize the existing dev loop before the C/D cutover.)

- [ ] **Step 4: Verify the harness boots and serves (the test)**

Run this self-contained smoke (no bare `sleep`; `curl --retry-connrefused` waits out the boot):

```bash
cd /home/john/src/checklist
bash scripts/dev-rowboat.sh > /tmp/dev-rowboat.log 2>&1 &
RB=$!
code=$(curl -s --retry 40 --retry-delay 1 --retry-connrefused -o /dev/null -w '%{http_code}' http://localhost:3020/console/v1/databases)
kill "$RB" 2>/dev/null || true
wait "$RB" 2>/dev/null || true
echo "PROBE: HTTP $code"
grep -q "listening on port 3020" /tmp/dev-rowboat.log && echo "BOOT: ok"
```

Expected:
- `PROBE: HTTP 401` — the server booted and routed the request; the console guard rejects the un-keyed probe (proves liveness without a management key).
- `BOOT: ok` — the server logged `rowboat-server: listening on port 3020`.

If the probe is `000` (never connected), read `/tmp/dev-rowboat.log`: the usual cause is rowboat packages not built (`cd /home/john/src/rowboat && npm run build`) or a missing `../rowboat` checkout.

- [ ] **Step 5: Confirm the scratch dir is untracked**

```bash
cd /home/john/src/checklist
git status --porcelain .rowboat-dev/
```

Expected: **empty output** (the `.rowboat-dev/` the smoke created is gitignored). Then remove it: `rm -rf .rowboat-dev`.

- [ ] **Step 6: Document the harness in HOSTED_ROWBOAT.md**

In `/home/john/src/checklist/docs/HOSTED_ROWBOAT.md`, add this section under the cutover area (adjust the surrounding heading to match the doc; the content is what matters):

```markdown
### Sub-project A — deploy + local-dev harness (landed)

**Local dev.** `npm run dev` now runs a third process, `dev:rowboat` (`scripts/dev-rowboat.sh`),
which runs a local `@jbroll/rowboat-server` from the sibling `../rowboat` source via `tsx` on
**http://localhost:3020**, with `ROWBOAT_AUTH_MODE=jwt` + `ROWBOAT_RBAC=on` (prod parity). Scratch
state lives in the gitignored `.rowboat-dev/`; delete it to reset. Requires the sibling rowboat
checkout to be built. Until sub-projects C/D repoint the client, this local server is standing
scaffolding — nothing points at it yet.

**Prod deploy.** rowboat.rkroll.com is deployed from `../rowboat/packages/server` via
`deploy-full.sh` + `deploy.conf`; the operator runbook is
`../rowboat/packages/server/DEPLOY_RUNBOOK.md`.
```

- [ ] **Step 7: Commit**

```bash
cd /home/john/src/checklist
git add scripts/dev-rowboat.sh package.json .gitignore docs/HOSTED_ROWBOAT.md
git commit -m "feat(dev): local hosted-rowboat harness (dev:rowboat) + sub-project A docs"
```

Expected: the org-hooks gate runs and passes; `git log --oneline -1` shows the new commit.

---

## Task 2: Add JWT + RBAC to the prod env template

**Files:**
- Modify: `/home/john/src/rowboat-wt2/packages/server/rowboat.env.secret.example`

**Model:** `haiku` — a config-template edit with the exact content given.

**Interfaces:**
- Consumes: nothing.
- Produces: the prod `rowboat.env.secret` template now declares the two flags the deploy must set; Task 4's runbook references them.

- [ ] **Step 1: Add the flags to the env template**

In `/home/john/src/rowboat-wt2/packages/server/rowboat.env.secret.example`, immediately after the `AUTH_BASE_URL=...` line (the console-auth block), insert:

```bash

# Data-plane auth + RBAC for CheckList's tenant (cutover-design decisions 4). Both default OFF in the
# engine; CheckList's deployment turns them ON. jwt = verify per-user Bearer JWTs against the tenant's
# registered JWKS issuer (set per-database via the control plane); on = per-database scope-group RBAC.
ROWBOAT_AUTH_MODE=jwt
ROWBOAT_RBAC=on
```

- [ ] **Step 2: Verify the edit**

```bash
grep -nE "ROWBOAT_AUTH_MODE=jwt|ROWBOAT_RBAC=on" /home/john/src/rowboat-wt2/packages/server/rowboat.env.secret.example
```

Expected: both lines print.

- [ ] **Step 3: Commit (in wt2)**

```bash
cd /home/john/src/rowboat-wt2
git add packages/server/rowboat.env.secret.example
git commit -m "chore(server): declare ROWBOAT_AUTH_MODE=jwt + ROWBOAT_RBAC=on in the deploy env template"
```

Expected: commit succeeds (a `.example` template edit; no code gate triggered).

---

## Task 3: Build + deploy wrapper (`deploy-full.sh`)

**Files:**
- Create: `/home/john/src/rowboat-wt2/packages/server/deploy-full.sh`

**Model:** `sonnet` — a deploy wrapper mirroring an existing pattern; ordering/staging judgment.

**Interfaces:**
- Consumes: `deploy.conf` (Task-independent, already present) and the `deploy.sh` engine at `~/src/deploy.sh/deploy.sh`.
- Produces: `./deploy-full.sh [init|update|--stage-only]` — the single command Task 4's runbook tells the operator to run.

- [ ] **Step 1: Write the wrapper**

Create `/home/john/src/rowboat-wt2/packages/server/deploy-full.sh`:

```bash
#!/usr/bin/env bash
# Build + deploy the @jbroll/rowboat-server assembly to rowboat.rkroll.com (see deploy.conf).
# Usage:
#   ./deploy-full.sh init          first deploy (provisions systemd unit, Apache vhost, TLS cert)
#   ./deploy-full.sh update        redeploy (default)
#   ./deploy-full.sh --stage-only  build the bundle + stage the console SPA, skip deploy (local test)
#
# What it does, in order:
#   1. build the server bundle (tsup -> dist/main.js), shipped via NODE_APP_DEPLOY_DIRS.
#   2. build the console-web SPA and stage it into ./spa (also shipped; survives rsync --delete only
#      because it is in the deploy payload — see deploy.conf's console-SPA note).
#   3. hand off to the deploy.sh engine with this dir as the project dir.
set -euo pipefail

mode="${1:-update}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"     # packages/server
repo="$(cd "$here/../.." && pwd)"                        # rowboat repo root
DEPLOY_SH="${DEPLOY_SH:-$repo/../deploy.sh/deploy.sh}"

echo "==> build server bundle (dist/main.js)"
( cd "$repo" && npm run -w @jbroll/rowboat-server build )

echo "==> build + stage console SPA (-> $here/spa)"
( cd "$repo" && npm run -w @jbroll/rowboat-console-web build )
rm -rf "$here/spa"
cp -r "$repo/packages/console-web/dist" "$here/spa"

if [[ "$mode" == "--stage-only" ]]; then
  echo "==> --stage-only: built dist + staged spa; skipping deploy"
  exit 0
fi

if [[ ! -x "$DEPLOY_SH" ]]; then
  echo "deploy-full: deploy engine not found/executable at $DEPLOY_SH (set DEPLOY_SH=...)" >&2
  exit 1
fi

echo "==> deploy.sh $mode --project-dir $here"
"$DEPLOY_SH" "$mode" --project-dir "$here"
```

Make it executable:

```bash
chmod +x /home/john/src/rowboat-wt2/packages/server/deploy-full.sh
```

- [ ] **Step 2: Syntax-check**

```bash
bash -n /home/john/src/rowboat-wt2/packages/server/deploy-full.sh && echo "SYNTAX: ok"
```

Expected: `SYNTAX: ok`.

- [ ] **Step 3: Verify the build+stage path works (the test)**

```bash
cd /home/john/src/rowboat-wt2/packages/server
./deploy-full.sh --stage-only
test -f dist/main.js && echo "BUNDLE: ok"
test -f spa/index.html && echo "SPA: ok"
```

Expected: `BUNDLE: ok` and `SPA: ok` (the deploy engine is never invoked in `--stage-only`). Then clean the build artifact from the worktree so it isn't committed: `rm -rf spa` (it's a gitignored build output; confirm with `git status --porcelain spa` → empty).

- [ ] **Step 4: Commit (in wt2)**

```bash
cd /home/john/src/rowboat-wt2
git add packages/server/deploy-full.sh
git commit -m "feat(server): deploy-full.sh — build bundle + stage console SPA + deploy.sh handoff"
```

Expected: the org-hooks gate runs and passes.

---

## Task 4: Deploy runbook

**Files:**
- Create: `/home/john/src/rowboat-wt2/packages/server/DEPLOY_RUNBOOK.md`

**Model:** `haiku` — a docs file with the full content given below.

**Interfaces:**
- Consumes: Tasks 2 (env flags) and 3 (`deploy-full.sh`).
- Produces: the operator-facing procedure the human runs on the box; CheckList's `docs/HOSTED_ROWBOAT.md` (Task 1, Step 6) points at it.

- [ ] **Step 1: Write the runbook**

Create `/home/john/src/rowboat-wt2/packages/server/DEPLOY_RUNBOOK.md`:

```markdown
# rowboat.rkroll.com — deploy runbook

Deploys the assembled `@jbroll/rowboat-server` (router + listener/writer workers + control-plane +
identity console + backup + metering + object store) behind Apache + letsencrypt as a systemd
service. Config: `deploy.conf`. Wrapper: `deploy-full.sh`. Run from `packages/server/`.

This is the **operator** procedure — it runs against the box `rowboat.rkroll.com` as user `john`.

## Prerequisites (once)

1. **DNS:** an `A` record for `rowboat.rkroll.com` pointing at the box's public IP (letsencrypt
   HTTP-01 needs it resolving before `init`).
2. **Box:** the shared `deploy.sh` engine at `~/src/deploy.sh/deploy.sh`, plus node, Apache, and
   certbot (the `letsencrypt` deploy type provisions the cert).
3. **rowboat packages built** in the repo you deploy from (`npm install && npm run build` at the
   repo root) — `deploy-full.sh` builds the server bundle + console SPA, but their `@jbroll/*` deps
   must already be built.

## Secrets (once, on the box — never commit)

    cd packages/server
    cp rowboat.env.secret.example rowboat.env.secret

Edit `rowboat.env.secret`:

- `ROUTER_SECRET` — `openssl rand -hex 32`
- `AUTH_SECRET` — `openssl rand -hex 32`
- `AUTH_BASE_URL=https://rowboat.rkroll.com/api/auth`
- `SPA_DIR=/opt/rowboat/spa`
- `ROWBOAT_AUTH_MODE=jwt` and `ROWBOAT_RBAC=on` (already in the template — keep them)
- `OBJECT_STORE_KIND=fs` (local disk under `ROWBOAT_ROOT/objects`; switch to `s3` only if wiring MinIO)
- OAuth (`GOOGLE_*` / `APPLE_*`) only if the identity console needs social login; omit otherwise.

`ROWBOAT_ROOT` and `ROUTER_PORT` default correctly for the box (`/var/lib/rowboat`, `3010`).

## First deploy

    cd packages/server
    ./deploy-full.sh init

This builds `dist/main.js`, stages the console SPA into `./spa`, then runs `deploy.sh init` which:
provisions the systemd `rowboat` unit, the Apache vhost proxying `:443 -> :3010`, and the TLS cert;
rsyncs `dist` + `spa` to `/opt/rowboat`; installs the env file; and starts the service.

## Smoke (after deploy)

    # liveness: the console guard rejects an un-keyed request with 401 once the server is routing
    curl -s -o /dev/null -w '%{http_code}\n' https://rowboat.rkroll.com/console/v1/databases   # -> 401

    # service + logs (on the box)
    systemctl status rowboat
    journalctl -u rowboat -n 50 --no-pager     # expect "rowboat-server: listening on port 3010"

A `401` (not `000`/`502`) confirms TLS, the Apache proxy, and the node service are all up. The tenant
(subscriber + database + JWKS issuer) is provisioned separately — that is sub-project B.

## Updates

    cd packages/server
    ./deploy-full.sh update      # rebuild bundle + SPA, rsync, restart the unit

## Notes

- `spa/` and `dist/` are build artifacts (gitignored); `deploy-full.sh` regenerates them each run.
- Changing `rowboat.env.secret` on the box requires a `systemctl restart rowboat` (or an `update`).
- Auth/RBAC being ON here means the data plane only accepts verified per-user JWTs; the CheckList
  client starts sending those in sub-project C.
```

- [ ] **Step 2: Verify it renders as intended**

```bash
grep -nE "deploy-full.sh init|401|ROWBOAT_AUTH_MODE=jwt" /home/john/src/rowboat-wt2/packages/server/DEPLOY_RUNBOOK.md
```

Expected: the key procedure lines print.

- [ ] **Step 3: Commit (in wt2)**

```bash
cd /home/john/src/rowboat-wt2
git add packages/server/DEPLOY_RUNBOOK.md
git commit -m "docs(server): rowboat.rkroll.com deploy runbook"
```

Expected: commit succeeds (pure `.md`; no code gate).

---

## Landing

- **CheckList (Task 1):** merge the CheckList branch into `main` per the repo's normal flow and push.
- **rowboat (Tasks 2–4):** from `/home/john/src/rowboat`, run `scripts/land.sh wt2` (ff-only onto `main`, pushes origin, rebuilds dist for the `file:`-linked CheckList consumer).
- **After landing:** the operator runs `./deploy-full.sh init` on the box per `DEPLOY_RUNBOOK.md`. That first prod deploy is the human step this plan cannot perform.

## Self-review notes

- **Spec coverage (cutover-design §A):** "stand up the assembled server with jwt+rbac, TLS/reverse-proxy, persistent ROWBOAT_ROOT" → `deploy.conf` (present) + Task 2 (jwt/rbac env) + Task 3 (build+deploy) + Task 4 (runbook). "local-dev harness — `npm run dev` launches a local instance" → Task 1. "Interfaces produced: a running server exposing the sync/management/console surface + base URLs for dev+prod" → dev `http://localhost:3020` (Task 1), prod `https://rowboat.rkroll.com` (Task 4).
- **Not in scope for A (deferred to B):** provisioning CheckList's subscriber/database and registering the JWKS issuer — so the smoke probes only prove *liveness* (401), not a working tenant. Called out in Task 1 Step 4 and the runbook smoke section.
- **Type/name consistency:** the env keys (`ROWBOAT_AUTH_MODE`, `ROWBOAT_RBAC`, `ROUTER_PORT`, `ROWBOAT_ROOT`, `AUTH_SECRET`, `AUTH_BASE_URL`, `ROUTER_SECRET`) match `configFromEnv` in `packages/server/src/main.ts`; the port `3020` (dev) / `3010` (prod), the `/console/v1/databases` probe, and the `spa`/`dist` deploy dirs match `deploy.conf` and `assembly.ts`.
