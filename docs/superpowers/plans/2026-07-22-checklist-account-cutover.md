# CheckList account cutover (sub-project F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut account-merge's group link and account-deletion over to hosted rowboat, then drop `registerAuthTables` + the local group tables so `cutover-cd` can merge to `main`.

**Architecture:** Add a link-two-existing-groups primitive to rowboat (writer op + HTTP endpoint + `GroupBackend.link`), point `mountAccountMergeRoutes` at a `GroupBackend` (link on prepare, grant on finalize), and simplify `mountAccountRoutes` to identity-only (access dies with the token; no group calls). rowboat changes land first via the `rowboat-wt2` worktree; CheckList then wires one `groupBackend` into both merge and share routes and drops the local group tables.

**Tech Stack:** TypeScript, better-sqlite3, express, better-auth, Vitest, supertest; rowboat monorepo (`~/src/rowboat`, worktree `~/src/rowboat-wt2`), CheckList (`~/src/checklist`).

## Global Constraints

- **rowboat work happens in `~/src/rowboat-wt2` (branch `wt2`), never a commit on `main` in `~/src/rowboat`.** Land with `scripts/land.sh wt2` (ff-only merge to main + push origin, under a lock). `wt2` must be rebased on main and clean before landing. Sync at start: `git -C ~/src/rowboat-wt2 reset --hard main`.
- **CheckList work happens on branch `cutover-cd` in `~/src/checklist`.**
- **CheckList consumes rowboat via built `dist/`** — after landing, run `npm run build` in `~/src/rowboat` (or `--workspace` the changed packages) before CheckList's `npm run check` sees the change.
- **CheckList commit hook** runs type-check + lint + unit tests + E2E (6–10 min); **all must pass, no bypass** (CLAUDE.md).
- **rowboat reserved group tables** are `__groups` / `__group_members` / `__group_inheritance` (`GROUP_TABLES` in `writer-groupops.mjs`); the local (CheckList/test) names are `groups` / `group_members` / `group_inheritance` (`DEFAULT_GROUP_TABLES`).
- **Merge arg mapping:** `childGroup = source`, `parentGroup = target`. `link` requires the actor be admin on `childGroup`; inheritance flows parent→child.
- `link`/`unlink`/`grant`/`revoke` are already exported from `@jbroll/rowboat-auth`.

---

### Task 1: rowboat `link` writer op + HTTP endpoint

**Files:**
- Modify: `~/src/rowboat-wt2/packages/backend/src/writer-thread.ts:24-28` (GroupOp union)
- Modify: `~/src/rowboat-wt2/packages/rowboat-service/src/writer-groupops.mjs` (add `link` handler + import)
- Modify: `~/src/rowboat-wt2/packages/rowboat-service/src/server-buildapp.mjs` (add endpoint after the `/groups/:groupId/members` DELETE, ~L146)
- Test: `~/src/rowboat-wt2/packages/rowboat-service/src/__tests__/writer-groupops-link.test.ts` (create)

**Model:** `sonnet` — multi-file engine change across two packages.

**Interfaces:**
- Produces: writer op `{ op: "link"; actor: string; childGroup: string; parentGroup: string }`; HTTP `POST <base>/groups/:childGroup/parents` body `{ parentGroup }` → 200 `{ ok: true }` / 401 / 403.

- [ ] **Step 1: Write the failing test** — `writer-groupops-link.test.ts`:

```ts
import { createScopeGroup, effectiveRole } from "@jbroll/rowboat-auth";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { applyGroupOp, GROUP_TABLES } from "../writer-groupops.mjs";

function seed() {
  const db = new Database(":memory:");
  // applyGroupOp calls registerAuthTables(db, GROUP_TABLES) itself.
  applyGroupOp(db, "db1", { op: "ensureRootGroup", account: "alice" });
  applyGroupOp(db, "db1", { op: "ensureRootGroup", account: "bob" });
  return db;
}

describe("applyGroupOp link", () => {
  it("links childGroup under parentGroup when actor is admin on the child", () => {
    const db = seed();
    const res = applyGroupOp(db, "db1", {
      op: "link", actor: "alice", childGroup: "alice", parentGroup: "bob",
    });
    expect(res).toEqual({ ok: true });
    const row = db
      .prepare(`SELECT 1 FROM ${GROUP_TABLES.inheritance} WHERE child_group_id = ? AND parent_group_id = ?`)
      .get("alice", "bob");
    expect(row).toBeDefined();
    // bob (parent) now inherits access to alice (child).
    expect(effectiveRole(db, "bob", "alice", undefined, GROUP_TABLES)).toBe("admin");
  });

  it("rejects when actor is not admin on the child group", () => {
    const db = seed();
    const res = applyGroupOp(db, "db1", {
      op: "link", actor: "bob", childGroup: "alice", parentGroup: "bob",
    });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/rowboat-service -- writer-groupops-link`
Expected: FAIL — `link` op hits the `unknown group op` branch (`res.ok === false`) in the first test.

- [ ] **Step 3: Add `link` to the GroupOp union** — `writer-thread.ts:24-28`, append a member:

```ts
export type GroupOp =
  | { op: "ensureRootGroup"; account: string }
  | { op: "createScopeGroup"; actor: string; group: string; parentGroup?: string }
  | { op: "grant"; actor: string; group: string; account: string; role: string }
  | { op: "revoke"; actor: string; group: string; account: string }
  | { op: "link"; actor: string; childGroup: string; parentGroup: string };
```

- [ ] **Step 4: Add the `link` handler** — `writer-groupops.mjs`: add `link` to the auth import, and a branch before the `unknown group op` return:

```ts
import {
  createScopeGroup,
  effectiveRole,
  grant,
  link,
  registerAuthTables,
  revoke,
} from "@jbroll/rowboat-auth";
```

```ts
    if (groupOp.op === "link") {
      link(
        db,
        { actor: groupOp.actor, childGroup: groupOp.childGroup, parentGroup: groupOp.parentGroup },
        { tables: GROUP_TABLES },
      );
      return { ok: true };
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/rowboat-service -- writer-groupops-link`
Expected: PASS (both tests).

- [ ] **Step 6: Add the HTTP endpoint** — `server-buildapp.mjs`, inside the `if (appData.rbac) {` block, after the `/groups/:groupId/members/:account` DELETE handler (~L146). `link`'s own `requireAdmin(actor, childGroup)` is the gate — no extra parentGroup check (inheritance only exposes the child's rows upward, self-authorized):

```js
    app.post(`${basePath}/groups/:childGroup/parents`, express.json(), async (req, res) => {
      const author = await resolveAuthor(req);
      if (!author) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const parentGroup = req.body?.parentGroup;
      if (typeof parentGroup !== "string" || !parentGroup) {
        res.status(400).json({ error: "parentGroup is required" });
        return;
      }
      const databaseId = String(req.params.database_id);
      const result = await forwardGroupWrite(databaseId, {
        op: "link",
        actor: author,
        childGroup: req.params.childGroup,
        parentGroup,
      });
      if (!result.ok) {
        res.status(403).json({ error: result.error ?? "forbidden" });
        return;
      }
      res.status(200).json({ ok: true });
    });
```

- [ ] **Step 7: Run the service suite + type-check**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/rowboat-service && npm run type-check --workspace packages/backend --workspace packages/rowboat-service`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd ~/src/rowboat-wt2 && git add packages/backend/src/writer-thread.ts packages/rowboat-service/src/writer-groupops.mjs packages/rowboat-service/src/server-buildapp.mjs packages/rowboat-service/src/__tests__/writer-groupops-link.test.ts
git commit -m "feat(rowboat): link-two-existing-groups writer op + POST /groups/:child/parents"
```

---

### Task 2: Hoist `GroupBackend` into `@jbroll/rowboat-auth` + add `.link`

**Files:**
- Create: `~/src/rowboat-wt2/packages/auth/src/group-backend.ts` (moved from sharing, + `link`)
- Create: `~/src/rowboat-wt2/packages/auth/src/remote-group-backend.ts` (moved from sharing, + `link`)
- Modify: `~/src/rowboat-wt2/packages/auth/src/index.ts` (export the three symbols)
- Delete: `~/src/rowboat-wt2/packages/sharing/src/group-backend.ts`, `~/src/rowboat-wt2/packages/sharing/src/remote-group-backend.ts`
- Modify: `~/src/rowboat-wt2/packages/sharing/src/index.ts` (re-export from auth)
- Test: `~/src/rowboat-wt2/packages/auth/src/__tests__/group-backend-link.test.ts` (create)

**Model:** `sonnet` — cross-package move + interface extension.

**Interfaces:**
- Consumes: Task 1's `POST /groups/:childGroup/parents`.
- Produces: `GroupBackend.link(actor, childGroup, parentGroup): Promise<void> | void`; `localGroupBackend`/`remoteGroupBackend` from `@jbroll/rowboat-auth` (re-exported by `@jbroll/rowboat-sharing`).

- [ ] **Step 1: Move the two files into auth.** Move `sharing/src/group-backend.ts` and `sharing/src/remote-group-backend.ts` to `auth/src/`. In the moved `group-backend.ts`, change the `@jbroll/rowboat-auth` self-import to relative:

```ts
import {
  effectiveRole as authEffectiveRole,
  grant as authGrant,
  link as authLink,
  revoke as authRevoke,
} from "./rbac.js";
import { DEFAULT_GROUP_TABLES, type GroupTables } from "./tables.js";
```

(`SyncDb` still imports from `@jbroll/rowboat-backend`; `DEFAULT_ROLES`/`RoleConfig` still from `@jbroll/rowboat-auth-shared`.) The moved `remote-group-backend.ts` is unchanged (its `AuthzError` import from `@jbroll/rowboat-backend` still resolves — auth depends on backend).

- [ ] **Step 2: Add `link` to the interface + both backends.** In `auth/src/group-backend.ts`, add to the `GroupBackend` interface and to `localGroupBackend`'s returned object:

```ts
  link(
    actor: string,
    childGroup: string,
    parentGroup: string,
  ): Promise<void> | void;
```

```ts
    link(actor, childGroup, parentGroup) {
      authLink(db, { actor, childGroup, parentGroup }, { roles, tables });
    },
```

In `auth/src/remote-group-backend.ts`, add to the returned object:

```ts
    async link(actor, childGroup, parentGroup) {
      const res = await fetchFn(`${baseUrl}/groups/${encodeURIComponent(childGroup)}/parents`, {
        method: "POST",
        headers: { ...(await authHeaders(actor)), "Content-Type": "application/json" },
        body: JSON.stringify({ parentGroup }),
      });
      await parseJsonOrThrow(res, "link");
    },
```

- [ ] **Step 3: Wire the exports.** In `auth/src/index.ts` add:

```ts
export { type GroupBackend, localGroupBackend } from "./group-backend.js";
export { remoteGroupBackend } from "./remote-group-backend.js";
```

In `sharing/src/index.ts` replace the first two lines with re-exports:

```ts
export { type GroupBackend, localGroupBackend, remoteGroupBackend } from "@jbroll/rowboat-auth";
```

- [ ] **Step 4: Write the failing test** — `auth/src/__tests__/group-backend-link.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { createScopeGroup, localGroupBackend, remoteGroupBackend } from "../index.js";
import { registerAuthTables } from "../schema.js";

describe("localGroupBackend.link", () => {
  it("links child under parent via authLink", () => {
    const db = new Database(":memory:");
    registerAuthTables(db);
    createScopeGroup(db, { actor: "alice", group: "alice" });
    createScopeGroup(db, { actor: "bob", group: "bob" });
    const be = localGroupBackend(db);
    be.link("alice", "alice", "bob");
    const row = db
      .prepare("SELECT 1 FROM group_inheritance WHERE child_group_id = ? AND parent_group_id = ?")
      .get("alice", "bob");
    expect(row).toBeDefined();
  });
});

describe("remoteGroupBackend.link", () => {
  it("POSTs to /groups/:child/parents as the actor", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const be = remoteGroupBackend({ baseUrl: "http://x/base", token: (a) => `tok-${a}`, fetchFn });
    await be.link("alice", "alice", "bob");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://x/base/groups/alice/parents");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok-alice");
    expect(JSON.parse(init.body)).toEqual({ parentGroup: "bob" });
  });
});
```

- [ ] **Step 5: Run tests + the sharing suite (re-export must not break consumers)**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/auth --workspace packages/sharing && npm run type-check --workspace packages/auth --workspace packages/sharing`
Expected: PASS — new link tests green, existing sharing tests still green through the re-export.

- [ ] **Step 6: Commit**

```bash
cd ~/src/rowboat-wt2 && git add packages/auth/src/group-backend.ts packages/auth/src/remote-group-backend.ts packages/auth/src/index.ts packages/auth/src/__tests__/group-backend-link.test.ts packages/sharing/src/index.ts && git rm packages/sharing/src/group-backend.ts packages/sharing/src/remote-group-backend.ts
git commit -m "refactor(rowboat): hoist GroupBackend to @jbroll/rowboat-auth, add link()"
```

---

### Task 3: `mountAccountMergeRoutes` uses `GroupBackend` (+ thread through `mountAuthRoutes`)

**Files:**
- Modify: `~/src/rowboat-wt2/packages/auth-betterauth/src/account-merge-routes.ts`
- Modify: `~/src/rowboat-wt2/packages/auth-betterauth/src/mount.ts` (thread `groupBackend`)
- Modify: `~/src/rowboat-wt2/packages/auth-betterauth/src/index.ts` (`Identity.mountAuthRoutes` signature)
- Test: `~/src/rowboat-wt2/packages/auth-betterauth/src/__tests__/account-merge-routes.test.ts` (update `buildApp`)

**Model:** `sonnet` — multi-file, transaction-ordering judgment.

**Interfaces:**
- Consumes: `GroupBackend` from `@jbroll/rowboat-auth` (Task 2).
- Produces: `MountAccountMergeRoutesOptions.groupBackend: GroupBackend` (required); `Identity.mountAuthRoutes(app, opts: { groupBackend: GroupBackend })`.

- [ ] **Step 1: Update the merge routes.** In `account-merge-routes.ts`: replace `import { grant, link } from "@jbroll/rowboat-auth";` with `import type { GroupBackend } from "@jbroll/rowboat-auth";`, add `groupBackend: GroupBackend;` to `MountAccountMergeRoutesOptions`, destructure it, and rewrite the two group calls so the remote op is awaited **before** the sync transaction (better-sqlite3 transactions cannot contain `await`).

`prepare` — replace the `db.transaction(() => { link(...); update(...) })(...)` block (~L71-76) with:

```ts
    await groupBackend.link(source, source, rec.target_user_id);
    db.prepare(
      "UPDATE account_merge SET source_user_id = ?, state = 'prepared' WHERE nonce = ?",
    ).run(source, nonce);
```

`finalize` — hoist the grant out of the transaction (~L101-108), then keep the rest of the transaction:

```ts
    const source = rec.source_user_id;
    await groupBackend.grant(rec.target_user_id, rec.target_user_id, source, "admin");
    db.transaction(() => {
      // verified-email consolidation + state=finalized (unchanged)
```

(Remove the `grant(db as never, { ... })` call that was the transaction's first statement.)

- [ ] **Step 2: Thread `groupBackend` through mount.** In `mount.ts`, add `groupBackend: GroupBackend;` to `MountAuthRoutesOptions` (import the type from `@jbroll/rowboat-auth`), and pass it at the `mountAccountMergeRoutes` call:

```ts
  mountAccountMergeRoutes(app, { provider: opts.provider, db: opts.db, groupBackend: opts.groupBackend });
```

In `index.ts`, change `mountAuthRoutes` on the `Identity` interface and its implementation to require the option and forward it:

```ts
  mountAuthRoutes: (app: Express, opts: { groupBackend: GroupBackend }) => void;
```

```ts
    mountAuthRoutes: (app, opts) =>
      mountAuthRoutesImpl(app, {
        auth,
        provider,
        db: config.db,
        authSecret: config.authSecret,
        sendEmail: config.sendEmail,
        groupBackend: opts.groupBackend,
      }),
```

(Add `import type { GroupBackend } from "@jbroll/rowboat-auth";` to `index.ts`.)

- [ ] **Step 3: Update the test harness.** In `account-merge-routes.test.ts`, import `localGroupBackend` and pass it — the merge routes then drive the real in-memory group tables, so existing `group_inheritance`/`group_members` assertions hold unchanged:

```ts
import { createScopeGroup, localGroupBackend, registerAuthTables } from "@jbroll/rowboat-auth";
```

```ts
  mountAccountMergeRoutes(app, { provider, db, groupBackend: localGroupBackend(db) });
```

The `signUp` helper must ensure each signed-up user has a root group (merge's `link`/`grant` require `source`/`target` to exist as admin-owned groups) — after each sign-up add `createScopeGroup(db, { actor: userId, group: userId });` if the harness does not already (check for an existing root-group step first).

- [ ] **Step 4: Run the merge suite + type-check**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/auth-betterauth -- account-merge-routes && npm run type-check --workspace packages/auth-betterauth`
Expected: PASS. If type-check flags other `mountAuthRoutes` callers in the repo, update them to pass `{ groupBackend }` (grep: `git grep -n "mountAuthRoutes("` — the CheckList caller is fixed in Task 6).

- [ ] **Step 5: Commit**

```bash
cd ~/src/rowboat-wt2 && git add packages/auth-betterauth/src/account-merge-routes.ts packages/auth-betterauth/src/mount.ts packages/auth-betterauth/src/index.ts packages/auth-betterauth/src/__tests__/account-merge-routes.test.ts
git commit -m "feat(rowboat): account-merge link/grant via GroupBackend"
```

---

### Task 4: `mountAccountRoutes` identity-only

**Files:**
- Modify: `~/src/rowboat-wt2/packages/auth-betterauth/src/account-routes.ts`
- Test: `~/src/rowboat-wt2/packages/auth-betterauth/src/__tests__/account-delete.test.ts` (update assertions)
- Delete: `~/src/rowboat-wt2/packages/auth-betterauth/src/__tests__/account-delete-merged.test.ts`

**Model:** `sonnet` — deletion with correctness-sensitive scope change.

**Interfaces:**
- Produces: `DELETE /api/account` — identity-only; no group tables, no network. Signature `mountAccountRoutes(app, { provider, db })` unchanged.

- [ ] **Step 1: Update the delete test.** In `account-delete.test.ts`, remove any assertion that `group_members` / `groups` / `group_inheritance` were emptied (those tables are no longer touched — and after Task 6 no longer exist in prod). Add an `account_merge` table to the `beforeEach` schema and a new assertion that the caller's `account_merge` rows are deleted:

```ts
    db.exec(`
      CREATE TABLE account_merge (
        nonce TEXT PRIMARY KEY, target_user_id TEXT, source_user_id TEXT,
        state TEXT, created_at INTEGER, expires_at INTEGER
      )
    `);
```

```ts
  it("deletes the caller's account_merge rows", async () => {
    // sign up 'ada' (see existing helper), capture userId, then:
    db.prepare(
      "INSERT INTO account_merge (nonce, target_user_id, source_user_id, state, created_at, expires_at) VALUES ('n1', ?, 'other', 'finalized', 0, 0)",
    ).run(userId);
    await request(app).delete("/api/account").set("Cookie", cookie).expect(200);
    expect(db.prepare("SELECT 1 FROM account_merge WHERE nonce = 'n1'").get()).toBeUndefined();
  });
```

Delete `account-delete-merged.test.ts` entirely — the merge-component survivor-preservation behavior it asserts is removed in Step 2.

- [ ] **Step 2: Run tests to verify the delete-merged test is gone and the group assertions fail**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/auth-betterauth -- account-delete`
Expected: `account-delete.test.ts` new `account_merge` test FAILS (rows not yet deleted); `account-delete-merged` no longer collected.

- [ ] **Step 3: Simplify `account-routes.ts`.** Replace the whole file body of `mountAccountRoutes` with the identity-only version — drop `findMergePartners`, `partnerAlive`, and every `group_members`/`groups`/`group_inheritance` statement; add the `account_merge` delete:

```ts
export function mountAccountRoutes(
  app: Express,
  { provider, db }: MountAccountRoutesOptions,
): void {
  app.delete("/api/account", async (req: Request, res: Response) => {
    const session = await provider.requireAuth(req, res);
    if (!session) return;
    const userId = session.user.id;

    db.transaction(() => {
      // Access to the hosted data plane dies with the identity (no user row -> no JWT -> no
      // author), so the caller's residual group memberships/owned groups are inert orphans left
      // to deferred data-GC. Delete only the identity footprint here.
      const shareInvitesTableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'share_invites'")
        .get();
      if (shareInvitesTableExists) {
        db.prepare("DELETE FROM share_invites WHERE inviter = ?").run(userId);
        db.prepare("DELETE FROM share_invites WHERE LOWER(recipient_email) = LOWER(?)").run(
          session.user.email,
        );
      }
      const accountMergeTableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'account_merge'")
        .get();
      if (accountMergeTableExists) {
        db.prepare(
          "DELETE FROM account_merge WHERE target_user_id = ? OR source_user_id = ?",
        ).run(userId, userId);
      }
      db.prepare("DELETE FROM verified_email WHERE user_id = ?").run(userId);
      // session/account/verified_email cascade from user (ON DELETE CASCADE); verification rows
      // carry no user column and expire on their own TTL.
      db.prepare("DELETE FROM user WHERE id = ?").run(userId);
    })();

    res.status(200).json({ success: true });
  });
}
```

Update the file's top comment to describe identity-only deletion.

- [ ] **Step 4: Run the delete suite + type-check**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/auth-betterauth -- account-delete && npm run type-check --workspace packages/auth-betterauth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/src/rowboat-wt2 && git add packages/auth-betterauth/src/account-routes.ts packages/auth-betterauth/src/__tests__/account-delete.test.ts && git rm packages/auth-betterauth/src/__tests__/account-delete-merged.test.ts
git commit -m "feat(rowboat)!: account deletion is identity-only (access dies with the token)"
```

---

### Task 5: Merge capstone integration test

**Files:**
- Test: `~/src/rowboat-wt2/packages/integration/src/account-merge-e2e.test.ts` (create)

**Model:** `sonnet` — integration test authoring against the real assembled server.

**Interfaces:**
- Consumes: Tasks 1–3 (link endpoint, `remoteGroupBackend.link`, merge routes) + the harness pattern in `sharing-agent-e2e.test.ts`.

- [ ] **Step 1: Write the capstone.** Model the setup on `packages/integration/src/sharing-agent-e2e.test.ts` (real assembled `rowboat-server` with `ROWBOAT_AUTH_MODE`/RBAC, `token: (actor) => actor` identity fake, `mountAccountMergeRoutes` wired with `remoteGroupBackend` against the server). Assert the full merge: after `prepare` + `finalize`, the target inherits the source's rows.

```ts
// Skeleton — fill server/db setup from sharing-agent-e2e.test.ts verbatim.
// 1. Provision groups: source root, target root, and a source-owned folder-group with a row.
// 2. groupBackend = remoteGroupBackend({ baseUrl, token: (a) => a }); mount merge routes with it.
// 3. POST /api/account/merge/start (as target) -> nonce
//    POST /api/account/merge/prepare (as source, nonce)   -> link(source, source, target)
//    POST /api/account/merge/finalize (as target, nonce)  -> grant(target, target, source, admin)
// 4. Assert: effectiveRole(target, sourceFolderGroup) !== null   (inheritance landed)
//    and a pull as target returns the source folder's row.
```

- [ ] **Step 2: Run it**

Run: `cd ~/src/rowboat-wt2 && npm run test:run --workspace packages/integration -- account-merge-e2e`
Expected: PASS.

- [ ] **Step 3: Full rowboat gate before landing**

Run: `cd ~/src/rowboat-wt2 && npm run build && npm run type-check && npm run test:run`
Expected: PASS across workspaces (this is the pre-land gate).

- [ ] **Step 4: Commit**

```bash
cd ~/src/rowboat-wt2 && git add packages/integration/src/account-merge-e2e.test.ts
git commit -m "test(rowboat): account-merge closed-loop against the assembled server"
```

- [ ] **Step 5: Land + rebuild dist**

```bash
cd ~/src/rowboat-wt2 && scripts/land.sh wt2      # ff-merge to main + push origin, under lock
cd ~/src/rowboat && npm run build                # rebuild dist so CheckList's symlinked deps update
```

Expected: `landed wt2 — main and worktree both at <sha>` + `pushed main to origin`; build succeeds.

---

### Task 6: CheckList backend wiring + drop local group tables

**Files:**
- Modify: `~/src/checklist/backend/src/index.ts` (build+pass `groupBackend`, drop `registerAuthTables`, remove double-mount)
- Test: `~/src/checklist/backend/test/*` (whichever asserts server wiring — see Step 4)

**Model:** `sonnet` — integration wiring + full gate.

**Interfaces:**
- Consumes: landed rowboat `Identity.mountAuthRoutes(app, { groupBackend })` (Task 3) and the identity-only delete (Task 4).

- [ ] **Step 1: Rewire `backend/src/index.ts`.** Remove `import { registerAuthTables } from '@jbroll/rowboat-auth';` and the `registerAuthTables(db);` call (~L7, L106). Move the `groupBackend` construction (currently ~L153) above the `identity.mountAuthRoutes` call, pass it into that call, and delete the redundant `mountAccountRoutes(app, { provider, db });` (~L164):

```ts
  const groupBackend = remoteGroupBackend({
    baseUrl: `${config.rowboatUrl}/db/${config.rowboatDatabaseId}/api/sync`,
    token: (actor) => identity.signJWT(actor),
  });

  identity.mountAuthRoutes(app);          // BEFORE express.json() — becomes:
  identity.mountAuthRoutes(app, { groupBackend });
```

The single `groupBackend` now feeds both `mountAuthRoutes` (merge) and `mountShareRoutes` (sharing). Keep `remoteGroupBackend` imported from `@jbroll/rowboat-sharing` (it re-exports auth's). Remove the `mountAccountRoutes` import if now unused.

- [ ] **Step 2: Type-check to confirm the wiring**

Run: `cd ~/src/checklist && npm run type-check`
Expected: PASS. A failure on `mountAuthRoutes` arity means Task 3's landed change isn't in `dist` — re-run `npm run build` in `~/src/rowboat`.

- [ ] **Step 3: Confirm the group tables are gone.** `grep -rn "registerAuthTables\|group_members\|group_inheritance" backend/src` returns nothing. `account_merge` (via `registerIdentityTables`) and `share_invites` (via `registerShareTables`) remain.

- [ ] **Step 4: Update/confirm backend wiring tests.** Run the backend unit suite; fix any test that constructed the server expecting `registerAuthTables` or the double-mount:

Run: `cd ~/src/checklist && npm run test:run`
Expected: PASS.

- [ ] **Step 5: Run the account-merge E2E against the hosted plane**

Run: `cd ~/src/checklist && npm run test:e2e -- account-merge`
Expected: PASS — the real `link`/`grant` round-trip to rowboat now succeeds.

- [ ] **Step 6: Full gate + commit** (commit hook runs type-check + lint + unit + E2E, 6–10 min):

```bash
cd ~/src/checklist && git add backend/src/index.ts backend/test
git commit -m "feat(sharing)!: account merge + deletion on hosted rowboat; drop local group tables"
```

- [ ] **Step 7: Update docs.** In `docs/HOSTED_ROWBOAT.md`, add a "Sub-project F — account cutover (landed)" section under E and remove the "Still broken until sub-project F" / "cutover-cd cannot merge to main" caveats (E section + F line). Commit (docs-only, no hook):

```bash
cd ~/src/checklist && git add docs/HOSTED_ROWBOAT.md
git commit -m "docs: record the account cutover; cutover-cd is mergeable"
```

---

## Self-Review

**Spec coverage:** link primitive (T1) ✓; GroupBackend hoist + `.link` (T2, decision 3) ✓; merge via GroupBackend + transaction split + threading (T3, decisions 2/4) ✓; identity-only deletion + `account_merge` delete (T4, decision 1) ✓; capstone (T5, Testing) ✓; drop `registerAuthTables` + double-mount removal + one groupBackend for both surfaces + docs (T6, decisions 4 + goal) ✓. E2E `account-merge.spec` (T6 Step 5) ✓. Non-goals (no client change, keep share/identity tables) respected — no task touches them.

**Placeholders:** T5 is a documented skeleton pointing at `sharing-agent-e2e.test.ts` for verbatim server setup (that harness is too long to inline and must be copied, not reinvented); every other step carries complete code.

**Type consistency:** `link(actor, childGroup, parentGroup)` and `grant(actor, group, account, role)` argument orders are identical across writer op (T1), `GroupBackend`/remote (T2), and merge routes (T3). Merge mapping `childGroup=source, parentGroup=target` is consistent T3 ↔ capstone T5. `mountAuthRoutes(app, { groupBackend })` matches T3 (def) ↔ T6 (call).
