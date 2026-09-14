# checklist-test on hosted rowboat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** checklist-test.rkroll.com runs the current rowboat-era backend and frontend, synced
against its own tenant on https://rowboat.rkroll.com, with the backend bound to `127.0.0.1:3002`.

**Architecture:** rowboat.rkroll.com is first redeployed from current rowboat `main`, because the
box runs engine code older than the 2026-07-22 RBAC fixes. Then `npm run provision:test` creates a subscriber, management key and database on the
hosted control plane and records them in `rowboat-tenant.test.json`. The frontend deploy config
derives `VITE_ROWBOAT_SYNC_BASE` from that file; the backend reads `ROWBOAT_DATABASE_ID` and
`ROWBOAT_URL` from `backend/secrets-test.env`, which deploy.sh installs as
`/var/lib/checklist-api-test.env` on apps. `deploy-full.sh test` deploys both, then its health check
and smoke tests confirm the result.

**Tech Stack:** Express + better-auth backend, Vite/React frontend, rowboat CLI
(`../rowboat/packages/rowboat-cli`), deploy.sh (`express_app`, `apache`, `letsencrypt`), Playwright.

**Spec:** none beyond `docs/HOSTED_ROWBOAT.md` (tenant wiring, lines 280-330) and
`docs/superpowers/specs/2026-07-20-checklist-tenant-provisioning-design.md` (provision-tenant contract).

## Global Constraints

- Branch: `checklist-test-rowboat` off `main`. Never push, never open a PR.
- Never bypass hooks. Pre-commit runs type-check, lint, unit and e2e (about 2-4 minutes).
- Tenant name `checklist-test`; issuer `https://checklist-test.rkroll.com/api/auth`; JWKS
  `https://checklist-test.rkroll.com/api/auth/jwks`; state file `rowboat-tenant.test.json`
  (already git-ignored by `rowboat-tenant.*.json`, `.gitignore:80`).
- `ROWBOAT_URL=https://rowboat.rkroll.com`. Sync base
  `https://rowboat.rkroll.com/db/<databaseId>/api/sync`.
- Test backend: unit `checklist-api-test`, `APP_PORT=3002`, `BIND_HOST=127.0.0.1`.
- Secrets never enter git, chat output, or command lines. The management key is filed in `pass`
  at `services/rowboat-checklist-test`.
- Docs change in the same commit as the behavior they describe. This plan file is deleted in the
  final commit.

## Facts the tasks rely on

- `POST /v1/subscribers` on the control plane is unauthenticated
  (`rowboat/packages/control-plane/src/routes.ts:132-133`), so `provision-tenant` needs no existing
  secret: it mints the subscriber and management key, creates the database, sets the auth issuer,
  and only then writes the state file (`rowboat-cli/src/provision-tenant.ts:128-148`).
- Rowboat fetches the JWKS lazily at JWT verification (`rowboat/packages/server/src/jwt-author.ts:41-47`),
  so provisioning can precede the backend deploy.
- A re-run with an existing state file reconciles. A probe that gets 401/404 creates a new tenant
  (`provision-tenant.ts:81,125`), and a fresh run that fails after the subscriber call orphans it.
- `deploy-full.sh` curls `/api/health` (`:139`) and `e2e/deploy-smoke.spec.ts` checks `/api/health`
  (`:34-47`) and `/api/billing/tiers` (`:64-75`). The backend mounts neither: no health route exists,
  and `backend/src/billing/routes.ts` is not wired in `index.ts` (comment at `:102`).
- `deploy-test.conf` sets no `VITE_ROWBOAT_SYNC_BASE`, and `src/lib/rowboat.tsx:45-47` throws
  without it.
- `backend/secrets-test.env` keys today: NODE_ENV, FRONTEND_URL, JAZZ_PEER, JAZZ_AGENT_ACCOUNT_ID,
  JAZZ_AGENT_SECRET, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APPLE_CLIENT_ID,
  APPLE_CLIENT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, BIND_HOST.
- `rowboat/docs/backlog.md:20-27` says the rowboat.rkroll.com box runs code older than the
  2026-07-22 RBAC fixes and must be redeployed before checklist uses it. Treat the redeploy as
  required (Task 4). No checklist tenant exists on it yet (prod was never provisioned), so no live
  tenant depends on the current box.
- The rowboat box is apps. Its `rowboat` unit runs `/opt/rowboat/dist/main.js` on `127.0.0.1:3010`,
  data under `/var/lib/rowboat`, env at `/etc/rowboat.env` (node_app `NODE_APP_CONFIG_PATH=/etc`,
  mode 600). `packages/server/deploy-full.sh update` builds the server bundle and the console SPA, then
  runs deploy.sh, which rsyncs `dist` and `spa` to `/opt/rowboat` with `--delete`, replaces
  `/etc/rowboat.env` with the local `packages/server/rowboat.env.secret`, and restarts the unit.
  There is no built-in rollback.
- The local `rowboat.env.secret` declares ROWBOAT_ROOT, ROUTER_PORT, ROUTER_SECRET, AUTH_SECRET,
  AUTH_BASE_URL, SPA_DIR, GOOGLE_*, APPLE_*, OBJECT_STORE_KIND, S3_*, MAX_UPLOAD_BYTES,
  ROWBOAT_AUTH_MODE, ROWBOAT_RBAC, none empty. The server refuses to boot without AUTH_SECRET,
  AUTH_BASE_URL, ROWBOAT_AUTH_MODE and ROWBOAT_RBAC (`packages/server/DEPLOY_RUNBOOK.md:24-33`).

---

### Task 1: Land the pending deploy-config edits on the branch

**Files:**
- Modify (already edited, uncommitted): `deploy-full.sh`, `deploy.conf`, `deploy-test.conf`,
  `backend/deploy.conf`, `backend/deploy-test.conf`, `DEPLOY.md`, `docs/BACKLOG.md`
- Add: `docs/superpowers/plans/2026-09-14-checklist-test-on-rowboat.md`

**Model:** `haiku` — git bookkeeping on finished edits.

- [ ] **Step 1: Create the branch**

Run: `git -C /home/john/src/checklist switch -c checklist-test-rowboat`

- [ ] **Step 2: Verify the port wiring resolves**

Run: `env APP_PORT=3001 bash -c 'source /home/john/src/checklist/backend/deploy.conf; source /home/john/src/checklist/deploy.conf; printf "%s | %s\n" "$EXPRESS_APP_PORT" "$APACHE_PROXY_RULES"'`
Expected: `3001 | /api:3001:/api`

Run the same with `APP_PORT=3002` and the two `deploy-test.conf` files.
Expected: `3002 | /api:3002:/api`

- [ ] **Step 3: Commit**

```bash
git -C /home/john/src/checklist add deploy-full.sh deploy.conf deploy-test.conf backend/deploy.conf backend/deploy-test.conf DEPLOY.md docs/BACKLOG.md docs/superpowers/plans/2026-09-14-checklist-test-on-rowboat.md
git -C /home/john/src/checklist commit -m "chore(deploy): set the backend port once per environment in deploy-full.sh"
```

These are non-code files, so the hooks skip the test suites.

---

### Task 2: Make the deploy checks match the backend

**Files:**
- Modify: `backend/src/index.ts` (mount `GET /api/health` inside `createServer`, after `app.use(express.json())`)
- Test: `backend/src/__tests__/host.test.ts`
- Modify: `e2e/deploy-smoke.spec.ts:64-75` (remove the `/api/billing/tiers` test)
- Modify: `docs/BACKLOG.md` (Engineering: billing routes exist in `backend/src/billing/routes.ts` but are not mounted)

**Model:** `sonnet` — small code change, but the smoke spec's exact expectations must be read and matched.

**Interfaces:**
- Produces: `GET /api/health` → `200 {"status":"ok","timestamp":<value>}`. Read
  `e2e/deploy-smoke.spec.ts:34-47` first and match the timestamp type it asserts.

- [ ] **Step 1: Write the failing test** in `host.test.ts`, alongside the `listen address` describe

```ts
describe('health', () => {
  it('reports ok for the deploy health check', async () => {
    server = await createServer(testConfig());

    const res = await request(server.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.body.timestamp).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `/home/john/src/checklist/backend/node_modules/.bin/vitest run --root /home/john/src/checklist/backend src/__tests__/host.test.ts -t health`
Expected: FAIL, status 404.

- [ ] **Step 3: Implement** in `createServer`, directly after `app.use(express.json());`

```ts
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
```

Change the timestamp expression if Step 1's reading of the smoke spec showed it expects a number.

- [ ] **Step 4: Run the backend suite**

Run: `/home/john/src/checklist/backend/node_modules/.bin/vitest run --root /home/john/src/checklist/backend`
Expected: all pass.

- [ ] **Step 5: Remove the billing-tiers smoke test** (`e2e/deploy-smoke.spec.ts:64-75`) and add the
  BACKLOG line: "**Billing routes are not mounted.** `backend/src/billing/routes.ts` (tiers, checkout,
  webhook) exists but `backend/src/index.ts` never wires it, so the deploy smoke test no longer checks
  `/api/billing/tiers`. Mount it and restore that check when billing ships."

- [ ] **Step 6: Commit**

```bash
git -C /home/john/src/checklist add backend/src/index.ts backend/src/__tests__/host.test.ts e2e/deploy-smoke.spec.ts docs/BACKLOG.md
git -C /home/john/src/checklist commit -m "fix(backend): serve /api/health for the deploy check; drop the unmounted billing smoke test"
```

---

### Task 3: Test tenant script and frontend sync base

**Files:**
- Modify: `package.json` (add `provision:test` beside `provision:prod`, line 12)
- Modify: `deploy-test.conf` (derive `VITE_ROWBOAT_SYNC_BASE` from the state file)
- Modify: `docs/HOSTED_ROWBOAT.md:283-285,320-322` (document `provision:test` and where test values live)

**Model:** `haiku` — every edit is spelled out.

**Interfaces:**
- Produces: `npm run provision:test` writes `rowboat-tenant.test.json` with fields
  `subscriberId, managementKey, databaseId, jwksUrl, issuer, audience`.
- Produces: sourcing `deploy-test.conf` exports
  `VITE_ROWBOAT_SYNC_BASE=https://rowboat.rkroll.com/db/<databaseId>/api/sync`, or aborts when the
  state file is missing.

- [ ] **Step 1: Add the script** to `package.json`, after `provision:prod`

```json
    "provision:test": "tsx ../rowboat/packages/rowboat-cli/src/cli.ts provision-tenant --schema shared/schema.ts --name checklist-test --jwks-url https://checklist-test.rkroll.com/api/auth/jwks --issuer https://checklist-test.rkroll.com/api/auth --state rowboat-tenant.test.json --control-plane-url https://rowboat.rkroll.com",
```

- [ ] **Step 2: Add the sync base** to `deploy-test.conf`, directly after `export APACHE_CONTENT_DIR="."`

```bash
# Hosted rowboat data plane, baked into the bundle at build time from the test tenant's state file.
TENANT_DB_ID="$(node -p "require('$(dirname "${BASH_SOURCE[0]}")/rowboat-tenant.test.json').databaseId")"
export VITE_ROWBOAT_SYNC_BASE="https://rowboat.rkroll.com/db/${TENANT_DB_ID:?run npm run provision:test first}/api/sync"
```

- [ ] **Step 3: Verify the missing-file path aborts**

Run: `env APP_PORT=3002 bash -c 'source /home/john/src/checklist/deploy-test.conf'`
Expected: non-zero exit, stderr contains `run npm run provision:test first`.

- [ ] **Step 4: Document** in `docs/HOSTED_ROWBOAT.md`: add
  "`npm run provision:test` — provisions the checklist-test tenant on rowboat.rkroll.com" beside the
  prod line, and under the env wiring: "Test: `deploy-test.conf` reads `databaseId` from
  `rowboat-tenant.test.json`; `ROWBOAT_DATABASE_ID` and `ROWBOAT_URL` go in `backend/secrets-test.env`.
  The management key is in `pass` at `services/rowboat-checklist-test`."

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/checklist add package.json deploy-test.conf docs/HOSTED_ROWBOAT.md
git -C /home/john/src/checklist commit -m "feat(deploy): provision:test and a state-file-derived sync base for checklist-test"
```

---

### Task 4: Redeploy rowboat.rkroll.com

**Files:** none in git. Touches `/opt/rowboat`, `/etc/rowboat.env` and the `rowboat` unit on apps.

**Model:** `opus` — replaces a production service and its env file with no built-in rollback.

**Interfaces:**
- Produces: `https://rowboat.rkroll.com` serving rowboat `main` (at or after `66fdc94`, which
  requires `appVersion`), with `POST /v1/subscribers`, `POST /v1/databases` and
  `PUT /v1/databases/:id/auth-issuer` available to Task 5.

**sudo on apps:** run every `ssh apps sudo ...` command yourself. If the auto-mode classifier denies
one, stop and report the exact command so the user can run it as `! <command>`, then continue from
its output. Never reword a denied command to get past the classifier.

- [ ] **Step 1: Read** `/home/john/src/rowboat/packages/server/DEPLOY_RUNBOOK.md` and
  `/home/john/src/rowboat/packages/server/deploy.conf` in full.

- [ ] **Step 2: Build rowboat** (the runbook requires every `@jbroll/*` package built first)

Run: `npm --prefix /home/john/src/rowboat run build`
Expected: exit 0.

- [ ] **Step 3: Check the local env values that gate boot**, printing counts only

Run each; every one must print `1`:
```
grep -c '^AUTH_BASE_URL=https://rowboat.rkroll.com/api/auth$' /home/john/src/rowboat/packages/server/rowboat.env.secret
grep -c '^ROWBOAT_AUTH_MODE=jwt$' /home/john/src/rowboat/packages/server/rowboat.env.secret
grep -c '^ROWBOAT_RBAC=on$' /home/john/src/rowboat/packages/server/rowboat.env.secret
grep -c '^SPA_DIR=/opt/rowboat/spa$' /home/john/src/rowboat/packages/server/rowboat.env.secret
grep -c '^OBJECT_STORE_KIND=fs$' /home/john/src/rowboat/packages/server/rowboat.env.secret
```
Any `0` → stop and report which key. Do not edit secrets without the user.

- [ ] **Step 4: Compare the box's env key names with the local file**

Run: `ssh apps sudo -n cut -d= -f1 /etc/rowboat.env`
  A key on the box missing locally → stop and report; the deploy would drop it.

- [ ] **Step 5: Back up the box**

Run: `ssh apps sudo -n tar czf /root/rowboat-predeploy-2026-09-14.tgz /opt/rowboat /var/lib/rowboat /etc/rowboat.env`
Expected: exit 0. Do not start Step 6 without a successful backup.

- [ ] **Step 6: Deploy**, in the background with its log kept

Run: `/home/john/src/rowboat/packages/server/deploy-full.sh update`
Expected: exit 0. The script resolves its own paths from `BASH_SOURCE`, so the cwd does not matter.

- [ ] **Step 7: Smoke**

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://rowboat.rkroll.com/console/v1/databases`
Expected: `401`. `000` or `502` means the unit is down.

Run: `ssh apps ss -ltn`
Expected: `127.0.0.1:3010` present, and no new `0.0.0.0` listener beyond the known 40983.

Run: `ssh apps sudo -n journalctl -u rowboat -n 50 --no-pager`
Expected: `rowboat-server: listening on port 3010`, no boot error.

- [ ] **Step 8: If Step 7 fails**, restore and report

Run: `ssh apps sudo -n tar xzf /root/rowboat-predeploy-2026-09-14.tgz -C /`
Run: `ssh apps sudo -n systemctl restart rowboat`
  Then stop the plan. Do not start Task 5 against a broken control plane.

---

### Task 5: Provision the tenant and write the test secrets

**Files:**
- Create (git-ignored): `rowboat-tenant.test.json`
- Modify (git-ignored): `backend/secrets-test.env`
- Add to `pass`: `services/rowboat-checklist-test`

**Model:** `opus` — creates live credentials; secret handling has to be exact.

- [ ] **Step 1: Provision** from `/home/john/src/checklist`

Run: `npm --prefix /home/john/src/checklist run provision:test`
Expected: exit 0 and `rowboat-tenant.test.json` exists. Never print the file.

- [ ] **Step 2: File the management key in `pass`** without echoing it

Run: `node -p "require('/home/john/src/checklist/rowboat-tenant.test.json').managementKey" | pass insert -m services/rowboat-checklist-test`
Expected: `pass ls services` lists `rowboat-checklist-test`.

- [ ] **Step 3: Rewrite `backend/secrets-test.env`** with the Edit tool, never echoing values:
  - Delete `JAZZ_PEER`, `JAZZ_AGENT_ACCOUNT_ID`, `JAZZ_AGENT_SECRET` and their Jazz comments.
  - Add `ROWBOAT_DATABASE_ID=<databaseId from the state file>` and `ROWBOAT_URL=https://rowboat.rkroll.com`.
  - Set `FRONTEND_URL=https://checklist-test.rkroll.com`. This is the issuer base, and a mismatch
    401s every sync.
  - Keep `BIND_HOST=127.0.0.1`, the SMTP keys, and `BETTER_AUTH_SECRET`.

- [ ] **Step 4: Verify the keys** (names only)

Run: `cut -d= -f1 /home/john/src/checklist/backend/secrets-test.env`
Expected: includes ROWBOAT_DATABASE_ID, ROWBOAT_URL, FRONTEND_URL, BETTER_AUTH_SECRET, BIND_HOST, and no JAZZ_ key.

Nothing to commit: every file here is git-ignored or in `pass`.

---

### Task 6: Deploy and verify checklist-test

**Files:** none.

**Model:** `sonnet` — run the deploy and read its results.

- [ ] **Step 1: Deploy** from `/home/john/src/checklist` (runs its own health check and smoke tests)

Run: `./deploy-full.sh test update` with cwd `/home/john/src/checklist`, in the background, with its log kept.
Expected: "Backend health check passed", "Smoke tests passed", "Test Deployment Complete".

- [ ] **Step 2: Confirm the bind**

Run: `ssh apps ss -ltn`
Expected: `127.0.0.1:3002`, no `0.0.0.0:3002`. `0.0.0.0:3001` stays until prod is deployed.

- [ ] **Step 3: Confirm the JWKS rowboat will fetch**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://checklist-test.rkroll.com/api/auth/jwks`
Expected: `200`

- [ ] **Step 4: End-to-end sync** — the user signs up with email at https://checklist-test.rkroll.com,
  completes the verification email, creates a folder, and sees it on a second browser signed into
  the same account. A 401 on `rowboat.rkroll.com/db/.../api/sync` means `FRONTEND_URL` and the
  registered issuer disagree.

---

### Task 7: Record the result and clean up

**Files:**
- Modify: `/home/john/src/checklist/docs/BACKLOG.md` (delete the "checklist-test.rkroll.com has no rowboat tenant" item; keep a one-line prod reminder: "Prod has no tenant: `deploy.conf` still bakes `REPLACE_WITH_PROD_DATABASE_ID`. Run `provision:prod` and fill `backend/secrets.env` before the next prod deploy.")
- Modify: `/home/john/src/checklist/DEPLOY.md` (test deploy prerequisites: `provision:test`, `secrets-test.env` keys)
- Delete: `/home/john/src/checklist/docs/superpowers/plans/2026-09-14-checklist-test-on-rowboat.md`
- Modify: `/home/john/Install/services.md` (vhost table stays; "Backends that bind the wildcard" says 3002 is on loopback as of the deploy date, 3001 waits on prod)
- Modify: `/home/john/Install/docs/backlog.md` (checklist item narrows to prod 3001)
- Modify: `/home/john/src/rowboat/docs/backlog.md` (delete the "Redeploy `rowboat.rkroll.com` before the checklist cutover" item; add: "`POST /v1/subscribers` is unauthenticated on the public control plane (`packages/control-plane/src/routes.ts:132-133`), so anyone can create subscribers and databases on rowboat.rkroll.com. Gate it before M1c.")

**Model:** `haiku` — doc edits with the text given.

- [ ] **Step 1: Make the edits above.**
- [ ] **Step 2: Commit checklist**, then fast-forward `main`

```bash
git -C /home/john/src/checklist add -A docs/BACKLOG.md DEPLOY.md docs/superpowers/plans
git -C /home/john/src/checklist commit -m "docs: checklist-test runs on its rowboat tenant"
git -C /home/john/src/checklist switch main
git -C /home/john/src/checklist merge --ff-only checklist-test-rowboat
```

- [ ] **Step 3: Commit Install** (`services.md`, `docs/backlog.md`) and **rowboat** (`docs/backlog.md`), one commit each.
