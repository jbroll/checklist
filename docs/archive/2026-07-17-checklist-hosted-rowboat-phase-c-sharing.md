# Phase C — Sharing / group management (agent-mediated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a folder be shared with another user under hosted rowboat RBAC — via an **agent-mediated grant dance** that stays RBAC-pure (no management-key bypass): rowboat exposes JWT-gated group-management primitives (`grant`/`revoke`/role-read/member-list on `__group*`, writes through the writer), and `@jbroll/rowboat-sharing` becomes pluggable so a subscriber backend can drive those primitives while keeping identity/email/invite orchestration on its own side.

**Architecture.** Sharing is inherently identity/email-bound, so invite orchestration (`share_invites` table, `principalOwnsEmail`, SMTP, tokens) **stays in the subscriber backend** (CheckList), which has the BetterAuth `IdentityProvider`. Rowboat stays identity-free: it only ever sees an opaque JWT `sub` and enforces RBAC on group ops. Because rowboat grants are server-side (no client signatures), the offline-inviter problem is solved by an **agent principal** (a well-known `sub`) that a real admin installs as group-admin at invite-create time (an ordinary `grant(actor=inviter, …, role=admin)`), and that the subscriber backend authenticates *as* to perform the accept-time grant (`grant(actor=agent, …)` — authorized because the agent is now admin). Rowboat never trusts the caller's assertion of authority; every grant is checked against the actor's real admin membership. This follows a server-side grant-dance pattern, adapted from a crypto-capability model to rowboat's server-side RBAC.

**Tech Stack:** TypeScript (ESM) + better-sqlite3, Node `worker_threads`, Express 5, Vitest 4, supertest. Builds on Phase A (JWKS bridge) + Phase B (RBAC in the worker), both landed on rowboat `main` (`4a87dc4`).

## Global Constraints

- **Work in a git worktree off rowboat `main`** (currently `4a87dc4`). Rebuild before testing dependent packages; commit in the **foreground**, full pre-commit gate, **never `--no-verify`** / no unreported `.size-cap-allow`. Land with `scripts/land.sh <branch>` after a rebase onto current main.
- **No CheckList-repo changes in this plan.** The CheckList sharing repoint (configuring its `mountShareRoutes` with the remote backend + agent credential, cross-origin cookies, the `shareUrl`/`?token` vs `/invite/:token` mismatch) is the deferred cutover — matches how A and B deferred the client.
- **RBAC-pure, no management-key bypass.** Every `grant`/`revoke` is authorized by the *actor's* real admin membership via `@jbroll/rowboat-auth` (`requireAdmin`). The agent is just another principal (`sub`); it has no special rowboat privilege beyond an admin membership a real admin gave it.
- **All group writes go through the single writer** (extend the Phase-B group-write channel; never a second writer). Group **reads** (role, member list) run on the listener's connection, like enforcement.
- **Per-database `__group*` tables** (`{groups:"__groups", members:"__group_members", inheritance:"__group_inheritance"}`), the Phase-B convention. The sharing package must be `tables`-parameterized (today it hardcodes defaults + two raw `group_members` selects).
- **Gated behind `appData.rbac`** (Phase B's flag) — group-management endpoints only mount when RBAC is on; off = byte-for-byte unchanged.
- Backend must not gain a static `@jbroll/rowboat-auth` dependency (the writer runner stays injected, per Phase B).

## Baseline (record before Task 1)
`git merge-base main HEAD`. Run the affected suites once green: `packages/auth`, `packages/backend`, `packages/rowboat-service`, `packages/sharing`, `packages/server`, `packages/integration`.

---

### Task 1: Writer `grant`/`revoke` group-write ops

**Files:**
- Modify: `packages/backend/src/writer-thread.ts` (extend `GroupOp`)
- Modify: `packages/rowboat-service/src/writer-groupops.mjs` (`applyGroupOp` branches)
- Test: `packages/rowboat-service/src/__tests__/writer-groupops.test.ts` (extend)

**Interfaces:**
- Consumes: Phase-B `GroupOp`/`ApplyGroupOp`, `grant`/`revoke` from `@jbroll/rowboat-auth` (parameterized, `{tables}`).
- Produces (relied on by Tasks 2/6):
  ```ts
  // added to GroupOp union (writer-thread.ts):
  | { op: "grant"; actor: string; group: string; account: string; role: string }
  | { op: "revoke"; actor: string; group: string; account: string }
  ```
  `applyGroupOp` runs `grant`/`revoke` with `{ tables: GROUP_TABLES }`; both are **actor-authorized** — `@jbroll/rowboat-auth.grant`/`revoke` call `requireAdmin(actor, group)` and throw `AuthzError` if the actor is not admin, which `applyGroupOp` catches → `{ ok:false, error }`. Never throws out.

- [ ] **Step 1: Write failing tests** — extend `writer-groupops.test.ts`: seed a group where `admin_a` is admin (`createScopeGroup` then it's admin); `applyGroupOp(db,"db1",{op:"grant",actor:"admin_a",group:"g1",account:"user_b",role:"writer"})` → `{ok:true}` and `__group_members` has `(g1,user_b,writer)`; `effectiveRole(db,"user_b","g1",undefined,GROUP_TABLES)==="writer"`. A grant by a non-admin actor → `{ok:false}` (not a throw). A `revoke` removes the row. All on `__group*`.

- [ ] **Step 2: Run → FAIL** (`cd packages/rowboat-service && npx vitest run writer-groupops` → unknown op).

- [ ] **Step 3: Extend `GroupOp`** in `writer-thread.ts` with the two variants above (append to the union at the top of the file).

- [ ] **Step 4: Extend `applyGroupOp`** in `writer-groupops.mjs`. Import `grant`, `revoke` from `@jbroll/rowboat-auth` (alongside the existing `createScopeGroup`/`effectiveRole`/`registerAuthTables`). Add branches inside the existing try:

```js
if (groupOp.op === "grant") {
  grant(db, { actor: groupOp.actor, group: groupOp.group, account: groupOp.account, role: groupOp.role }, { tables: GROUP_TABLES });
  return { ok: true };
}
if (groupOp.op === "revoke") {
  revoke(db, { actor: groupOp.actor, group: groupOp.group, account: groupOp.account }, { tables: GROUP_TABLES });
  return { ok: true };
}
```
(Keep the existing `ensureRootGroup`/`createScopeGroup` branches and the outer try/catch → `{ok:false,error}`.)

- [ ] **Step 5: Run → PASS** (`npx vitest run writer-groupops`, then full `cd packages/rowboat-service && npm run test:run` and `cd packages/backend && npm run test:run`). Commit `feat(rowboat-service): grant/revoke writer group-write ops (actor-authorized)`.

---

### Task 2: Group-management HTTP endpoints (JWT-gated, per-database)

**Files:**
- Modify: `packages/rowboat-service/src/server-buildapp.mjs` (mount new routes under `basePath`, inside `if (appData.rbac)`)
- Test: exercised end-to-end by Task 6 (server-buildapp runs in a worker thread — no isolated unit test; note in the report).

**Interfaces:**
- Consumes: `forwardGroupWrite` (Phase B), the request's resolved `db` for reads (via a small read helper), `createRbacAuth`/`effectiveRole` semantics on `__group*`, `resolveAuthor` (internal-token `sub`).
- Produces (relied on by Tasks 4/6): under the router-proxied `${basePath}` prefix (`/db/:database_id/api/sync`), all JWT-gated (`author = resolveAuthor(req)`, 401 if null), `databaseId = req.params.database_id`:
  - `POST ${basePath}/groups/:groupId/members` body `{ account, role }` → `forwardGroupWrite(databaseId, { op:"grant", actor: author, group: groupId, account, role })`; 200 `{ ok:true }` / 403 on `!ok`.
  - `DELETE ${basePath}/groups/:groupId/members/:account` → `forwardGroupWrite(databaseId, { op:"revoke", actor: author, group: groupId, account })`; 200 / 403.
  - `GET ${basePath}/groups/:groupId/role` → the author's own `effectiveRole(author, groupId)` on `__group*` (listener read); 200 `{ role: string|null }`.
  - `GET ${basePath}/groups/:groupId/members` → list `__group_members` for the group (`[{account_id, role}]`); gated so only a member (own `effectiveRole !== null`) may list; 200 `{ members }` / 403.

- [ ] **Step 1:** In `server-buildapp.mjs`, inside `if (appData.rbac)` (next to the existing mint route), add the four routes above. Grant/revoke forward to the writer (like the mint route). For the two **reads**, resolve the request's db and run `effectiveRole`/a `SELECT account_id, role FROM __group_members WHERE group_id = ?` against it. To read the db on the listener without importing auth into backend, do the read via a small injected reader — **prefer** reusing the enforcement path: import `effectiveRole` from `@jbroll/rowboat-auth` and `GROUP_TABLES` from `./writer-groupops.mjs` (rowboat-service already depends on auth — Phase B) and resolve the db via `reg.stateFor(databaseId).db` (`reg` is a `buildApp` param). Guard `groups/:groupId/members` on `effectiveRole(author, groupId, undefined, GROUP_TABLES) !== null`.

- [ ] **Step 2:** Confirm all four paths sit under `${basePath}` so the router's existing splat proxy forwards them (no router change — same as the mint route). Reuse the same `resolveAuthor` closure.

- [ ] **Step 3:** Build + `cd packages/rowboat-service && npm run test:run` (baseline green; new routes covered by Task 6). Commit `feat(rowboat-service): JWT-gated group-management endpoints (grant/revoke/role/members)`.

---

### Task 3: Fix the mint `parentGroup` admin gap (Phase-B review item)

**Files:**
- Modify: `packages/rowboat-service/src/server-buildapp.mjs` (the `POST ${basePath}/groups` mint handler)
- Test: end-to-end in Task 6 (a non-admin minting under another's group → 403).

**Interface / behavior:** Before forwarding `createScopeGroup`, when the caller supplies a `parentGroup` that is **not** the author's own root (`parentGroup && parentGroup !== author`), require the author to be **admin** on `parentGroup` (`effectiveRole(author, parentGroup, undefined, GROUP_TABLES) === "admin"` via a listener read on the resolved db); otherwise 403 and do not forward. `parentGroup` unset or equal to `author` (the normal top-level nest under the user's own root) is unchanged. This closes the integrity/injection gap (a user parenting a new group under a victim's group to surface rows into the victim's view) while leaving normal folder-nesting (users admin their own folder groups) working.

- [ ] **Step 1:** Add the admin check to the mint handler (read `effectiveRole` on the resolved db, same helper as Task 2). Preserve the existing behavior for `parentGroup ?? author`.
- [ ] **Step 2:** Build + `npm run test:run`. Commit `fix(rowboat-service): mint requires actor admin on a non-root parentGroup`.

> Note the read-then-forward TOCTOU (admin revoked between the check and the writer apply) is acceptable — admin changes are rare and the worst case is a spurious success on an about-to-be-revoked admin; the grant itself still runs `requireAdmin` inside `createScopeGroup`'s `link` for the child. Document this inline.

---

### Task 4: `@jbroll/rowboat-sharing` — pluggable group backend + `__group*` + agent dance

**Files:**
- Create: `packages/sharing/src/group-backend.ts` (the interface + local impl)
- Modify: `packages/sharing/src/routes.ts` (route handlers use the backend; add `tables`/`agent` opts)
- Modify: `packages/sharing/src/index.ts` (export the new types)
- Test: `packages/sharing/src/__tests__/group-backend.test.ts` (new) + adapt existing sharing route tests

**Interfaces:**
- Consumes: existing `mountShareRoutes`/`ShareRouteOpts`/`registerShareTables`, `@jbroll/rowboat-auth` (`grant`/`revoke`/`effectiveRole`, `GroupTables`).
- Produces:
  ```ts
  export interface GroupBackend {
    effectiveRole(actor: string, group: string): Promise<string | null> | string | null;
    grant(actor: string, group: string, account: string, role: string): Promise<void> | void;
    revoke(actor: string, group: string, account: string): Promise<void> | void;
    listMembers(group: string): Promise<Array<{ account_id: string; role: string }>> | Array<{ account_id: string; role: string }>;
  }
  export function localGroupBackend(db: SyncDb, opts?: { tables?: GroupTables; roles?: RoleConfig }): GroupBackend;
  // ShareRouteOpts gains:
  groupBackend?: GroupBackend;   // default: localGroupBackend(db)  -> backward compatible
  agent?: string;                // the agent principal sub; when set, invite-create installs the agent as admin and accept grants AS the agent
  ```
  Every group read/write in `routes.ts` goes through `opts.groupBackend ?? localGroupBackend(db)` instead of calling `grant`/`revoke`/`effectiveRole` directly, and the two raw `SELECT … FROM group_members` become `backend.listMembers(group)`. When `opts.agent` is set: invite-create additionally installs the agent (`backend.grant(actor: inviterSub, group: targetGroupId, account: agent, role: "admin")`), and accept grants as the agent (`backend.grant(actor: agent, group, account: accepterSub, role: invite.role)`) instead of `actor: invite.inviter`. When `agent` is unset, behavior is exactly today's (embedded mode).

- [ ] **Step 1: Write failing tests** — `group-backend.test.ts`: `localGroupBackend(db, {tables: __GROUP})` round-trips grant/effectiveRole/listMembers on `__group*`; and an agent-mode accept path: with `agent` set, an accept installs+uses the agent (assert the agent got admin, then the accepter got the invite role) — drive through `mountShareRoutes` with a fake `IdentityProvider` + an in-memory db seeded so the inviter is admin. Read the current `packages/sharing/src/__tests__/*` for the existing harness (IdentityProvider stub, db seeding) and extend it.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `group-backend.ts`** — the interface + `localGroupBackend` wrapping `@jbroll/rowboat-auth` (`grant`/`revoke`/`effectiveRole` with `{roles, tables}`) and a `listMembers` = `SELECT account_id, role FROM ${tables.members} WHERE group_id = ?`.

- [ ] **Step 4: Thread the backend through `routes.ts`** — replace every direct `grant`/`revoke`/`effectiveRole` and the two hardcoded `group_members` selects with `backend.*` calls (await them — handlers are already async). Add `groupBackend`/`agent`/`tables` to `ShareRouteOpts`; default `groupBackend = localGroupBackend(db, { tables: opts.tables })`. Implement the agent-install (invite-create) and agent-grant (accept) when `opts.agent` is set (see Interfaces). Keep the admin-gate on invite-create as `backend.effectiveRole(inviterSub, targetGroupId) === TOP` (the inviter must still be admin to invite).

- [ ] **Step 5: Export** the new types from `index.ts`.

- [ ] **Step 6: Run → PASS** (`cd packages/sharing && npm run test:run`; existing route tests stay green with the default local backend). Commit `feat(sharing): pluggable GroupBackend + __group* tables + optional agent-mediated grants`.

---

### Task 5: `remoteGroupBackend` — the HTTP client the subscriber backend plugs in

**Files:**
- Create: `packages/sharing/src/remote-group-backend.ts` (or a small sibling package if `sharing` must stay dependency-light — check `sharing/package.json`; prefer same package)
- Modify: `packages/sharing/src/index.ts` (export)
- Test: `packages/sharing/src/__tests__/remote-group-backend.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export function remoteGroupBackend(opts: {
    baseUrl: string;                                   // e.g. https://rowboat…/db/<databaseId>/api/sync
    token: (actor: string) => Promise<string> | string; // mints/returns a JWT whose sub === actor (agent or user)
    fetchFn?: typeof fetch;
  }): GroupBackend;
  ```
  A `GroupBackend` whose methods call the Task-2 endpoints (`${baseUrl}/groups/:g/members` grant/revoke, `/role`, `/members`), sending `Authorization: Bearer <token(actor)>`. This is how a subscriber backend points the sharing package at rowboat: for agent-authored grants it passes the agent's JWT; for the inviter-admin check it passes the inviter's. (The subscriber wires `token` to its BetterAuth JWT issuance — the Phase-A JWKS bridge.)

- [ ] **Step 1: Failing test** — stand up a tiny express app mimicking the Task-2 routes (or reuse Task 6's server if simpler), point `remoteGroupBackend` at it, assert grant/revoke/effectiveRole/listMembers issue the right HTTP calls with the right Bearer token and parse responses. (A focused test with a stub server is fine here; the real end-to-end is Task 6.)

- [ ] **Step 2–4:** Implement, export, run → PASS. Commit `feat(sharing): remoteGroupBackend HTTP client for the hosted rowboat group API`.

---

### Task 6: Integration proof — the agent-mediated grant dance end-to-end

**Files:**
- Create: `packages/integration/src/sharing-agent-e2e.test.ts`
- Modify: `packages/integration/package.json` if `@jbroll/rowboat-sharing` / `@jbroll/rowboat-server` aren't already devDeps

**Harness:** Boot the real assembled server via `startServer` with `rbac: true` and synthetic `x-author` identity (as Phase B's `rbac-worker-e2e.test.ts` does — reuse that setup). Create a subscriber + database (provisions `__group*`). Mount `@jbroll/rowboat-sharing` (in-process, with a fake `IdentityProvider` for email/`principalOwnsEmail`) configured with a `remoteGroupBackend` pointed at the running server and an `agent` sub; the `token(actor)` helper returns a synthetic credential the server's `x-author` path accepts (i.e. drive the group API with `x-author: <actor>` — since the proof uses synthetic identity, `token` maps `actor` → an `x-author` header value). Authors: `owner_a` (folder admin), `agent`, `user_b`.

**Proof (assertions — do NOT weaken):**
- [ ] **Setup:** `owner_a` mints a folder group `G` (via the mint endpoint) and syncs a row scoped to `G`; assert `owner_a` reads it back and `user_b` cannot (Phase-B isolation still holds).
- [ ] **Invite-create installs the agent:** create an invite (inviter `owner_a`, recipient `user_b`, role `writer`); assert the **agent** is now `admin` on `G` (`GET /groups/G/role` as agent → `admin`), installed by `owner_a`'s authority. A create by a **non-admin** of `G` → rejected.
- [ ] **Accept grants via the agent:** `user_b` accepts; assert the grant was performed **as the agent** and `user_b` now holds `writer` on `G` (`GET /groups/G/role` as `user_b` → `writer`). Then `user_b`'s **RBAC sync pull now returns `G`'s row** (the shared folder is visible) — the load-bearing end-to-end assertion.
- [ ] **Authz is real:** a direct `grant` to `/groups/G/members` **as `user_b`** (non-admin) → 403; the agent's grant only works because a real admin installed it.
- [ ] **Revoke removes access:** revoke `user_b` (as the agent or `owner_a`); assert `user_b`'s effectiveRole on `G` is `null` and `user_b`'s pull **no longer returns** `G`'s row.
- [ ] **Mint parentGroup gap closed (Task 3):** `user_b` mints a group with `parentGroup: G` (which `user_b` doesn't admin) → 403.

- [ ] Run `cd packages/integration && npm run test:run -- sharing-agent-e2e` + full suite. Commit `test(integration): agent-mediated sharing grant dance — invite installs agent, accept grants, revoke removes`.

---

## Self-Review

**Spec coverage (design §C + decision 4 + the Phase-B mint gap):**
- §C sharing extends `@jbroll/rowboat-sharing` (not a new surface), `__group*`, JWT-gated → Tasks 4/5 (pluggable backend + remote client) + Tasks 1/2 (rowboat primitives the remote backend calls). Sharing stays in the subscriber backend (the resolved ownership split); rowboat provides RBAC-pure primitives.
- Group **writes through the writer** → Task 1. Group **reads** on the listener → Task 2.
- Agent-mediated grant dance (install-at-create, grant-as-agent-at-accept), RBAC-pure → Tasks 4 + 6.
- Mint `parentGroup` admin check (Phase-B review item) → Task 3.
- Email/token/`principalOwnsEmail` stay in the subscriber backend → unchanged (Task 4 keeps them; only the *group ops* move behind the backend).

**Deliberately out of Phase C (deferred cutover):** the CheckList repoint (wire its `mountShareRoutes` to `remoteGroupBackend` + agent JWT via BetterAuth issuance; cross-origin cookies/CORS; `shareUrl`/`?token` vs `/invite/:token`). The BetterAuth agent-JWT issuance (a token whose `sub` = the agent) is a subscriber-side concern proven here only via the synthetic-identity harness.

**Placeholder scan:** Tasks 2/3 have no isolated unit test (server-buildapp runs in a worker thread — Task 6 covers them end-to-end), flagged explicitly. Task-4/5 tests are described with concrete harness pointers (extend the existing sharing test harness / a stub server) because they wire against the package's `IdentityProvider` stub and HTTP. All production-code steps have concrete code or precisely-anchored edits.

**Type consistency:** `GroupBackend` (Task 4) is consumed by Tasks 5/6. `GroupOp` grant/revoke variants (Task 1) are consumed by Task 2's endpoints. The endpoint shapes in Task 2 match `remoteGroupBackend`'s calls in Task 5.

**Risk callouts (for review):** Task 1 adds actor-authorized writes to the writer core — confirm `requireAdmin` failures surface as `{ok:false}` (403), never a throw out of drain, and never a second writer. Task 4 changes security-relevant routes — confirm the default local backend is byte-for-byte today's behavior and the agent path only activates when `agent` is set. Task 6 is the RBAC-purity proof — a non-admin grant MUST 403.

## Non-goals
- No CheckList repoint (deferred cutover).
- No management-key bypass — all grants RBAC-checked against the actor's admin membership.
- No change to the invite token/email/SMTP model (stays in the subscriber backend).
- No flip of the hosted default to RBAC-on (still `appData.rbac`-gated).
