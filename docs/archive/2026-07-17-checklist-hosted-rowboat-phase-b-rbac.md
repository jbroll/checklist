# Phase B — Scope-group RBAC in the hosted worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn scope-group RBAC ON inside a hosted rowboat sync worker: scoped pull + gated push by `owner_group_id`, with group membership living in per-database reserved `__group*` tables, lazy per-user root-group provisioning on first verified author, and a folder-group mint endpoint — so multiple end users are isolated within one shared database.

**Architecture:** Enforcement is read-only and already supported by the engine (`mountSyncRoutes` threads a `SyncAuth` into pull's `WHERE owner_group_id IN (readable)` filter and push's `gate()` → 403). Phase B (a) makes `auth` **per-database** via an `authFactory(db, databaseId)` hook (the listener already resolves the per-db handle), (b) parameterizes the auth package's group-table names so the data plane uses `__groups`/`__group_members`/`__group_inheritance` (collision-safe, still un-synced because they're never registered in the manifest), and (c) routes the only group-table **writes** (lazy root-group provisioning + folder-group mint) through the **single writer thread** via a new non-CRDT message variant, with the group-op runner injected into the writer by a dynamic-import module URL (mirroring the existing `listenerApp` injection) so `@jbroll/rowboat-backend` stays free of an `@jbroll/rowboat-auth` dependency (auth already depends on backend → a static back-edge would be a cycle). All new behavior is gated by an RBAC flag (default OFF) so existing suites/deploys are unchanged, exactly as Phase A's `ROWBOAT_AUTH_MODE` was.

**Tech Stack:** TypeScript (ESM) + better-sqlite3, Node `worker_threads` (listener/writer), Express 5, Vitest 4, supertest.

## Global Constraints

- **Work in a git worktree off rowboat `main`** (currently `f7e54fa`, which already contains Phase A). No CheckList-repo changes in this plan (client repoint deferred).
- **Enforcement is gated OFF by default.** A flag (`ROWBOAT_RBAC=on|off`, default `off`; surfaced as `appData.rbac: boolean`) selects whether the worker wires `auth`. Off ⇒ byte-for-byte current behavior (no `auth`), so all existing suites and deploys are unchanged. This mirrors Phase A's `ROWBOAT_AUTH_MODE` default.
- **Per-database group tables are named `__groups` / `__group_members` / `__group_inheritance`** in each `<database_id>.db`. The auth package's DEFAULT names stay `groups`/`group_members`/`group_inheritance` (the console identity.db keeps using them, unchanged). Only the hosted data-plane wiring passes the `__`-prefixed names.
- **Group tables are never registered in the sync manifest** (never `registerSyncTable`d), so they never sync to clients — this is the existing mechanism; no `__`-prefix table filter is added anywhere.
- **The single-writer invariant is preserved.** Every write to a per-database file — CRDT batches AND group-table writes — goes through the one writer thread. The listener never writes; it only reads (enforcement CTEs) on its own connection.
- **`@jbroll/rowboat-backend` must not gain a static dependency on `@jbroll/rowboat-auth`.** The writer's group-op runner is injected via a dynamic-import URL supplied by `@jbroll/rowboat-service` (which may depend on auth). Backend is generic.
- **Scope column is `owner_group_id`** (the `createRbacAuth` default and the `rb.scope()` column CheckList emits).
- Package manager npm; ESM (`.js` import specifiers). Each package runs `npm run test:run` (Vitest). Cross-package edits require `npm run build` (or the touched package's `build`) before a dependent package type-checks/tests. Commit in the **foreground**, full pre-commit gate, **never `--no-verify`**, never a new `.size-cap-allow` entry without reporting it.

## Baseline (record before Task 1)
`git merge-base main HEAD` = the branch point. Run the affected suites once to capture green baselines: `packages/auth`, `packages/backend`, `packages/rowboat-service` (if it has tests), `packages/control-plane`, `packages/server`, `packages/integration`.

---

### Task 1: Parameterize group-table names in the auth package

**Files:**
- Modify: `packages/auth/src/schema.ts` (`registerAuthTables`)
- Create: `packages/auth/src/tables.ts` (the `GroupTables` type + resolver/validator)
- Modify: `packages/auth/src/effective-role.ts` (`effectiveRole` gains a tables arg)
- Modify: `packages/auth/src/rbac.ts` (thread tables through every group-table SQL)
- Modify: `packages/auth/src/index.ts` (export `GroupTables`, `DEFAULT_GROUP_TABLES`)
- Test: `packages/auth/src/__tests__/table-names.test.ts` (new)

**Interfaces:**
- Consumes: existing `createRbacAuth`, `createScopeGroup`, `grant`, `link`, `revoke`, `unlink`, `effectiveRole`, `registerAuthTables`, `RbacConfig`, `AuthzError`.
- Produces (relied on by Tasks 2/5/8):
  ```ts
  export interface GroupTables { groups: string; members: string; inheritance: string; }
  export const DEFAULT_GROUP_TABLES: GroupTables; // { groups:"groups", members:"group_members", inheritance:"group_inheritance" }
  // RbacConfig gains:  tables?: GroupTables
  registerAuthTables(db: SyncDb, tables?: GroupTables): void;
  effectiveRole(db, account, group, cfg?, tables?): string | null; // tables trailing-optional, defaults preserved
  ```
  All existing call sites that omit `tables` behave identically (defaults).

- [ ] **Step 1: Write the failing test**

Create `packages/auth/src/__tests__/table-names.test.ts`:

```ts
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createRbacAuth, createScopeGroup, effectiveRole, grant, registerAuthTables } from "../index.js";
import type { GroupTables } from "../index.js";

const CUSTOM: GroupTables = {
  groups: "__groups",
  members: "__group_members",
  inheritance: "__group_inheritance",
};

function db() {
  const d = new Database(":memory:") as unknown as import("@jbroll/rowboat-backend").SyncDb;
  // a domain table so authorize() has something to SELECT the scope column from
  d.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, owner_group_id TEXT)");
  return d;
}

describe("parameterized group-table names", () => {
  it("registerAuthTables(db, CUSTOM) creates the __-prefixed tables only", () => {
    const d = db();
    registerAuthTables(d, CUSTOM);
    const names = (d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toContain("__groups");
    expect(names).toContain("__group_members");
    expect(names).toContain("__group_inheritance");
    expect(names).not.toContain("groups");
  });

  it("createScopeGroup + effectiveRole operate on the custom tables", () => {
    const d = db();
    registerAuthTables(d, CUSTOM);
    createScopeGroup(d, { actor: "user_a", group: "user_a" }, { tables: CUSTOM });
    expect(effectiveRole(d, "user_a", "user_a", undefined, CUSTOM)).toBe("admin");
    // rows land in the __-prefixed table
    expect(d.prepare("SELECT COUNT(*) c FROM __group_members").get()).toEqual({ c: 1 });
  });

  it("createRbacAuth(db, {tables}) scopes reads/writes via the custom tables", () => {
    const d = db();
    registerAuthTables(d, CUSTOM);
    createScopeGroup(d, { actor: "user_a", group: "g1" }, { tables: CUSTOM });
    const auth = createRbacAuth(d, { tables: CUSTOM });
    expect(auth.readScope("user_a", "notes")).toEqual({ column: "owner_group_id", in: ["g1"] });
    expect(auth.authorize({ table: "notes", kind: "write", id: "n1", row: { owner_group_id: "g1" }, author: "user_a" })).toBe(true);
    expect(auth.authorize({ table: "notes", kind: "write", id: "n2", row: { owner_group_id: "g1" }, author: "user_b" })).toBe(false);
  });

  it("defaults are unchanged when tables is omitted", () => {
    const d = db();
    registerAuthTables(d); // default names
    const names = (d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toContain("group_members");
    createScopeGroup(d, { actor: "u", group: "u" });
    expect(effectiveRole(d, "u", "u")).toBe("admin");
  });

  it("rejects a non-identifier table name", () => {
    const d = db();
    expect(() => registerAuthTables(d, { ...CUSTOM, groups: "bad name; DROP TABLE" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/auth && npm run test:run -- table-names`
Expected: FAIL — `registerAuthTables` takes no 2nd arg / `GroupTables` not exported / custom tables not created.

- [ ] **Step 3: Add the tables type + validator**

Create `packages/auth/src/tables.ts`:

```ts
export interface GroupTables {
  groups: string;
  members: string;
  inheritance: string;
}

export const DEFAULT_GROUP_TABLES: GroupTables = {
  groups: "groups",
  members: "group_members",
  inheritance: "group_inheritance",
};

// Table names are interpolated into SQL (SQLite can't bind identifiers), so validate them as plain
// identifiers before use. These names are internal constants (never user input), but validating
// keeps the interpolation provably injection-safe.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function resolveTables(tables?: GroupTables): GroupTables {
  const t = tables ?? DEFAULT_GROUP_TABLES;
  for (const name of [t.groups, t.members, t.inheritance]) {
    if (!IDENT.test(name)) throw new Error(`invalid group table name: ${JSON.stringify(name)}`);
  }
  return t;
}
```

- [ ] **Step 4: Parameterize `registerAuthTables`**

Replace `packages/auth/src/schema.ts` body so the DDL uses the resolved names:

```ts
import type { SyncDb } from "@jbroll/rowboat-backend";
import { type GroupTables, resolveTables } from "./tables.js";

export function registerAuthTables(db: SyncDb, tables?: GroupTables): void {
  const t = resolveTables(tables);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${t.groups} (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS ${t.members} (
      group_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (group_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS ${t.inheritance} (
      child_group_id TEXT NOT NULL,
      parent_group_id TEXT NOT NULL,
      PRIMARY KEY (child_group_id, parent_group_id)
    );
    CREATE INDEX IF NOT EXISTS idx_${t.members}_account ON ${t.members}(account_id);
    CREATE INDEX IF NOT EXISTS idx_${t.inheritance}_child ON ${t.inheritance}(child_group_id);
  `);
}
```

- [ ] **Step 5: Parameterize `effectiveRole`**

In `packages/auth/src/effective-role.ts`, add the tables arg and use it in the CTE:

```ts
import { DEFAULT_ROLES, type RoleConfig, roleRank } from "@jbroll/rowboat-auth-shared";
import type { SyncDb } from "@jbroll/rowboat-backend";
import { type GroupTables, resolveTables } from "./tables.js";

export function effectiveRole(
  db: SyncDb,
  account: string,
  group: string,
  cfg: RoleConfig = DEFAULT_ROLES,
  tables?: GroupTables,
): string | null {
  const t = resolveTables(tables);
  const rows = db
    .prepare(`
      WITH RECURSIVE ancestors(gid) AS (
        SELECT ?
        UNION
        SELECT gi.parent_group_id FROM ${t.inheritance} gi JOIN ancestors a ON gi.child_group_id = a.gid
      )
      SELECT gm.role AS role
      FROM ${t.members} gm
      WHERE gm.account_id = ? AND gm.group_id IN (SELECT gid FROM ancestors)
    `)
    .all(group, account) as { role: string }[];
  let best: string | null = null;
  for (const { role } of rows) {
    if (best === null || roleRank(cfg, role) > roleRank(cfg, best)) best = role;
  }
  return best;
}
```

- [ ] **Step 6: Parameterize `rbac.ts`**

In `packages/auth/src/rbac.ts`:
1. Add the import and the `tables` field on `RbacConfig`:

```ts
import { type GroupTables, resolveTables } from "./tables.js";
```
```ts
export interface RbacConfig {
  roles?: RoleConfig;
  scopeColumn?: string;
  roleForOp?: (ctx: AuthOpContext) => string;
  capability?: (ctx: AuthOpContext) => boolean;
  tables?: GroupTables;
}
```

2. In `readableGroups`, take resolved tables and use them:

```ts
function readableGroups(db: SyncDb, account: string, t: GroupTables): string[] {
  return (
    db
      .prepare(`
        WITH RECURSIVE readable(gid) AS (
          SELECT group_id FROM ${t.members} WHERE account_id = ?
          UNION
          SELECT gi.child_group_id FROM ${t.inheritance} gi JOIN readable r ON gi.parent_group_id = r.gid
        )
        SELECT DISTINCT gid FROM readable
      `)
      .all(account) as { gid: string }[]
  ).map((r) => r.gid);
}
```

3. In `createRbacAuth`, resolve tables once and pass them to `readableGroups` and `effectiveRole`:

```ts
export function createRbacAuth(db: SyncDb, config: RbacConfig = {}): SyncAuth {
  const roles = config.roles ?? DEFAULT_ROLES;
  const scopeColumn = config.scopeColumn ?? "owner_group_id";
  const roleForOp = config.roleForOp ?? (() => "writer");
  const capability = config.capability ?? (() => true);
  const t = resolveTables(config.tables);

  return {
    readScope(author: string): ReadScope {
      return { column: scopeColumn, in: readableGroups(db, author, t) };
    },
    authorize(ctx: AuthOpContext): boolean {
      const existing = db
        .prepare(`SELECT ${scopeColumn} AS g FROM ${ctx.table} WHERE id = ?`)
        .get(ctx.id) as { g: string | null } | undefined;
      const writesScope = scopeColumn in ctx.row;
      const destination = ctx.row[scopeColumn];
      if (writesScope && typeof destination !== "string") return false;
      let group: string;
      if (existing !== undefined) {
        if (typeof existing.g !== "string") return false;
        group = existing.g;
      } else {
        if (typeof destination !== "string") return false;
        group = destination;
      }
      const op = roleForOp(ctx);
      if (!roleAtLeast(roles, effectiveRole(db, ctx.author, group, roles, t), op)) return false;
      if (
        writesScope &&
        typeof destination === "string" &&
        destination !== group &&
        !roleAtLeast(roles, effectiveRole(db, ctx.author, destination, roles, t), op)
      ) {
        return false;
      }
      return capability(ctx);
    },
  };
}
```

4. `requireAdmin` takes tables and forwards to `effectiveRole`:

```ts
function requireAdmin(db: SyncDb, actor: string, group: string, roles: RoleConfig, t: GroupTables): void {
  if (effectiveRole(db, actor, group, roles, t) !== TOP(roles)) {
    throw new AuthzError(`requires ${TOP(roles)} on ${group}`);
  }
}
```

5. `grant`, `revoke`, `link`, `wouldCycle`, `createScopeGroup`, `unlink` each resolve `const t = resolveTables(config.tables)` at the top and use `t.members` / `t.inheritance` / `t.groups` in their SQL, and pass `t` to `requireAdmin`/`effectiveRole`/`link`. The full bodies (interpolating `${t.*}` for every `group_members`/`group_inheritance`/`groups` literal, and threading `t` into the nested `link`/`requireAdmin`/`wouldCycle` calls):

```ts
export function grant(db, args, config = {}) {
  const roles = config.roles ?? DEFAULT_ROLES;
  const t = resolveTables(config.tables);
  requireAdmin(db, args.actor, args.group, roles, t);
  if (!roles.roles.includes(args.role))
    throw new AuthzError(`unknown role "${args.role}" (configured: ${roles.roles.join(", ")})`);
  db.prepare(
    `INSERT INTO ${t.members} (group_id, account_id, role) VALUES (?, ?, ?) ON CONFLICT(group_id, account_id) DO UPDATE SET role = excluded.role`,
  ).run(args.group, args.account, args.role);
}

export function revoke(db, args, config = {}) {
  const roles = config.roles ?? DEFAULT_ROLES;
  const t = resolveTables(config.tables);
  requireAdmin(db, args.actor, args.group, roles, t);
  db.prepare(`DELETE FROM ${t.members} WHERE group_id = ? AND account_id = ?`).run(args.group, args.account);
}

function wouldCycle(db, childGroup, parentGroup, t: GroupTables): boolean {
  const hit = db
    .prepare(`
      WITH RECURSIVE ancestors(gid) AS (
        SELECT ?
        UNION
        SELECT gi.parent_group_id FROM ${t.inheritance} gi JOIN ancestors a ON gi.child_group_id = a.gid
      )
      SELECT 1 FROM ancestors WHERE gid = ? LIMIT 1
    `)
    .get(parentGroup, childGroup);
  return hit !== undefined;
}

export function link(db, args, config = {}) {
  const roles = config.roles ?? DEFAULT_ROLES;
  const t = resolveTables(config.tables);
  requireAdmin(db, args.actor, args.childGroup, roles, t);
  if (wouldCycle(db, args.childGroup, args.parentGroup, t))
    throw new AuthzError(`link ${args.childGroup} <- ${args.parentGroup} would create an inheritance cycle`);
  db.prepare(
    `INSERT INTO ${t.inheritance} (child_group_id, parent_group_id) VALUES (?, ?) ON CONFLICT(child_group_id, parent_group_id) DO NOTHING`,
  ).run(args.childGroup, args.parentGroup);
}

export function createScopeGroup(db, args, config = {}) {
  const roles = config.roles ?? DEFAULT_ROLES;
  const t = resolveTables(config.tables);
  if (db.prepare(`SELECT 1 FROM ${t.groups} WHERE id = ?`).get(args.group) !== undefined)
    throw new AuthzError(`group ${args.group} already exists`);
  db.transaction(() => {
    db.prepare(`INSERT INTO ${t.groups} (id) VALUES (?)`).run(args.group);
    db.prepare(`INSERT INTO ${t.members} (group_id, account_id, role) VALUES (?, ?, ?)`).run(args.group, args.actor, TOP(roles));
    if (args.parentGroup !== undefined)
      link(db, { actor: args.actor, childGroup: args.group, parentGroup: args.parentGroup }, config);
  })();
  return args.group;
}

export function unlink(db, args, config = {}) {
  const roles = config.roles ?? DEFAULT_ROLES;
  const t = resolveTables(config.tables);
  requireAdmin(db, args.actor, args.childGroup, roles, t);
  db.prepare(`DELETE FROM ${t.inheritance} WHERE child_group_id = ? AND parent_group_id = ?`).run(args.childGroup, args.parentGroup);
}
```
(Keep the exact TypeScript parameter type annotations from the current file — only the SQL literals and the added `t` threading change. Do not alter the security comments; keep them.)

- [ ] **Step 7: Export the new types**

In `packages/auth/src/index.ts`, add:

```ts
export { type GroupTables, DEFAULT_GROUP_TABLES } from "./tables.js";
```

- [ ] **Step 8: Run tests to verify green**

Run: `cd packages/auth && npm run test:run`
Expected: PASS — the new `table-names` test plus all existing `rbac`/`inheritance`/`integration`/`effective-role` tests (defaults preserved).

- [ ] **Step 9: Commit**

```bash
git add packages/auth/src
git commit -m "feat(auth): parameterize group-table names (GroupTables) for per-database RBAC"
```

---

### Task 2: Writer-thread group-write channel + injectable runner

**Files:**
- Modify: `packages/backend/src/writer-thread.ts`
- Modify: `packages/backend/src/index.ts` (export the new types if not already surfaced)
- Test: `packages/backend/src/__tests__/writer-group-write.test.ts` (new)

**Interfaces:**
- Consumes: `ResidenceRegistry`, `applyBatch`, `Prepared`, `BatchResult`.
- Produces (relied on by Tasks 3/5/6):
  ```ts
  export type GroupOp =
    | { op: "ensureRootGroup"; account: string }
    | { op: "createScopeGroup"; actor: string; group: string; parentGroup?: string };
  export type GroupResult = { ok: true } | { ok: false; error: string };
  // db is the writer's per-database handle; a runner is injected (backend stays auth-free):
  export type ApplyGroupOp = (db: SyncDb, databaseId: string, groupOp: GroupOp) => GroupResult;
  // WriterRequest becomes a discriminated union on `kind`; startWriterThread gains applyGroupOp:
  startWriterThread(registry, ports, applyGroupOp?: ApplyGroupOp): { close; evict; fence; unfence }
  ```
  A port message with `kind: "groupWrite"` runs `applyGroupOp` against `registry.stateFor(databaseId).db`; absent/`"prepared"` keeps the existing CRDT path. Reply shape stays `{ requestId, result }` (result is `BatchResult` for prepared, `GroupResult` for group writes).

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/__tests__/writer-group-write.test.ts`:

```ts
import { MessageChannel } from "node:worker_threads";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { ResidenceRegistry } from "../residence.js";
import { startWriterThread, type ApplyGroupOp, type GroupResult } from "../writer-thread.js";

// A fake runner standing in for the injected auth-backed runner (backend has no auth dep).
const runner: ApplyGroupOp = (db, _dbId, groupOp): GroupResult => {
  if (groupOp.op !== "createScopeGroup") return { ok: false, error: "unsupported" };
  try {
    db.exec("CREATE TABLE IF NOT EXISTS __groups (id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO __groups (id) VALUES (?)").run(groupOp.group);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

describe("writer group-write channel", () => {
  it("runs a groupWrite via the injected runner and replies ok", async () => {
    const dir = new URL(`./tmp-${Math.floor(performance.now())}/`, import.meta.url).pathname; // unique-ish; see note
    // Simpler: use an in-memory-backed registry mock is not possible (registry opens files). Use a tmp dir.
    // ... (implementer: create a tmpdir via mkdtempSync, seed <dbId>.db with a sync registry) ...
    // The essential assertions:
    // 1. post { requestId, databaseId, kind: "groupWrite", groupOp: { op:"createScopeGroup", actor, group } }
    // 2. await the { requestId, result } reply → result.ok === true
    // 3. open <dbId>.db and confirm the __groups row exists
    expect(true).toBe(true);
  });
});
```

> **Note for the implementer:** write this test concretely against a real tmp dir: `mkdtempSync`, create `<dir>/db1.db` with `initSyncRegistry` + one `registerSyncTable`, build `new ResidenceRegistry({ resolvePath: id => join(dir, id + '.db') })`, a `MessageChannel`, `startWriterThread(registry, [channel.port2], runner)`, then `channel.port1.postMessage({ requestId: 1, databaseId: "db1", kind: "groupWrite", groupOp: { op: "createScopeGroup", actor: "u", group: "g1" } })` and resolve a promise on `channel.port1.on("message", ...)`. Assert `result.ok` and that a fresh `new Database(join(dir,'db1.db'))` has the `__groups` row. Also add a second case: a `kind: "prepared"` (or kind-absent) message still routes to `applyBatch` (you can assert it does not throw / replies with a `BatchResult`-shaped object for an empty `ops` batch). Clean up the tmp dir + `registry.closeAll()` in `afterEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npm run test:run -- writer-group-write`
Expected: FAIL — `ApplyGroupOp`/`GroupResult` not exported; `kind`/`groupOp` messages throw in `rebuffer` (no `ops`).

- [ ] **Step 3: Add the types + discriminated message + runner injection**

In `packages/backend/src/writer-thread.ts`:

1. Add types after the existing imports:

```ts
export type GroupOp =
  | { op: "ensureRootGroup"; account: string }
  | { op: "createScopeGroup"; actor: string; group: string; parentGroup?: string };
export type GroupResult = { ok: true } | { ok: false; error: string };
export type ApplyGroupOp = (db: import("./db.js").SyncDb, databaseId: string, groupOp: GroupOp) => GroupResult;
```

2. Widen `WriterRequest` to a discriminated union (keep `kind` optional for the prepared path so existing forwarders that omit it still work):

```ts
export type WriterRequest =
  | { requestId: number; databaseId: string; kind?: "prepared"; prepared: Prepared }
  | { requestId: number; databaseId: string; kind: "groupWrite"; groupOp: GroupOp };
```

3. Add a `QueueItem` variant:

```ts
type QueueItem =
  | { kind: "prepared"; port: MessagePort; requestId: number; databaseId: string; prepared: Prepared }
  | { kind: "groupWrite"; port: MessagePort; requestId: number; databaseId: string; groupOp: GroupOp };
```

4. `startWriterThread` gains `applyGroupOp?: ApplyGroupOp`. In the port `message` handler, branch on `kind`:

```ts
for (const port of ports) {
  port.on("message", (msg: WriterRequest) => {
    if (closed) return;
    if (msg.kind === "groupWrite") {
      queue.push({ kind: "groupWrite", port, requestId: msg.requestId, databaseId: msg.databaseId, groupOp: msg.groupOp });
    } else {
      queue.push({ kind: "prepared", port, requestId: msg.requestId, databaseId: msg.databaseId, prepared: rebuffer(msg.prepared) });
    }
    scheduleDrain();
  });
}
```

5. In `drain()`, within each `databaseId` group, process `groupWrite` items FIRST (individually, via `applyGroupOp` against the resolved db), then the `prepared` items via `applyBatch` as today. A `groupWrite` for a fenced id short-circuits to `{ ok:false, error:"fenced" }` (same as prepared). Concretely, replace the per-group body:

```ts
for (const [databaseId, group] of groups) {
  if (fenced.has(databaseId)) {
    for (const item of group) postReply(item.port, item.requestId, { ok: false, error: "fenced" });
    continue;
  }
  const groupWrites = group.filter((i): i is Extract<QueueItem, { kind: "groupWrite" }> => i.kind === "groupWrite");
  const prepared = group.filter((i): i is Extract<QueueItem, { kind: "prepared" }> => i.kind === "prepared");
  // group writes first (provisioning/mint before any same-drain CRDT push; they are always awaited
  // by the listener before dependent work, so intra-drain ordering here is not correctness-critical).
  for (const item of groupWrites) {
    let result: GroupResult;
    try {
      const { db } = registry.stateFor(databaseId);
      result = applyGroupOp ? applyGroupOp(db, databaseId, item.groupOp) : { ok: false, error: "no group-op runner configured" };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    postReply(item.port, item.requestId, result);
  }
  if (prepared.length > 0) {
    let results: BatchResult[];
    try {
      const { db, state, cache } = registry.stateFor(databaseId);
      results = applyBatch(state, db, prepared.map((r) => r.prepared), cache);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results = prepared.map((): BatchResult => ({ ok: false, error }));
    }
    for (let j = 0; j < prepared.length; j++) postReply(prepared[j].port, prepared[j].requestId, results[j]);
  }
}
```
(`postReply` already accepts `BatchResult`; widen its `result` param type to `BatchResult | GroupResult`.)

6. Update `startWriterThread`'s signature to accept `applyGroupOp` and keep the returned control object unchanged.

- [ ] **Step 4: Export the new types** (`packages/backend/src/index.ts`): add `export { type GroupOp, type GroupResult, type ApplyGroupOp } from "./writer-thread.js";` (and confirm `startWriterThread` is already exported for the worker entry).

- [ ] **Step 5: Run tests to verify green**

Run: `cd packages/backend && npm run test:run -- writer-group-write` then the full `npm run test:run`.
Expected: PASS — new test green; all existing writer/push/pull tests unaffected (kind-absent messages still take the prepared path).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/writer-thread.ts packages/backend/src/index.ts packages/backend/src/__tests__/writer-group-write.test.ts
git commit -m "feat(backend): writer group-write channel with an injected runner (single-writer preserved)"
```

---

### Task 3: Thread the writer group-op runner module URL through the worker spawn

**Files:**
- Modify: `packages/backend/src/writer.worker.mjs` (dynamic-import the runner)
- Modify: `packages/backend/src/serve-threads.ts` (`ServeThreadsOpts` already spreads `writerData`; confirm the module URL rides it)
- Modify: `packages/backend/src/serve-sync.ts` (pass `groupOpsModule` through `writerData`)
- Modify: `packages/rowboat-service/src/start-core-service.ts` (accept + forward `groupOpsModule`)
- Test: covered end-to-end by Task 10; add a focused unit assertion in `packages/backend/src/__tests__/writer-group-write.test.ts` only if `writer.worker.mjs` gains testable pure logic (otherwise none here).

**Interfaces:**
- Consumes: Task 2's `startWriterThread(registry, ports, applyGroupOp?)` and `ApplyGroupOp`.
- Produces: `startCoreService(opts)` gains `groupOpsModule?: string` (a module URL). When set, the writer worker dynamic-imports it (`const { applyGroupOp } = await import(groupOpsModule)`) and passes it to `startWriterThread`. When unset, the writer runs with no group-op runner (group writes reply `{ ok:false, error:"no group-op runner configured" }`).

- [ ] **Step 1: Writer worker imports the runner**

In `packages/backend/src/writer.worker.mjs`, read `groupOpsModule` from `workerData` and dynamic-import it (mirroring how `listener.worker.mjs` imports `listenerApp`):

```js
const { dbDir, ports, objectStore, groupOpsModule } = workerData;
// ... existing registry construction ...
const applyGroupOp = groupOpsModule ? (await import(groupOpsModule)).applyGroupOp : undefined;
const writer = startWriterThread(registry, ports, applyGroupOp);
```
(Read the current `writer.worker.mjs` for the exact variable names — `startWriterThread(registry, ports)` becomes `startWriterThread(registry, ports, applyGroupOp)`.)

- [ ] **Step 2: Pass `groupOpsModule` through `writerData`**

`serve-threads.ts` already spawns the writer with `workerData: { dbDir, ports, ...opts.writerData }` — so any key on `opts.writerData` reaches the writer. In `serve-sync.ts`, add `groupOpsModule` to the `writerData` it forwards (alongside `objectStore`). In `start-core-service.ts`, add `groupOpsModule?: string` to its options and pass it into `serveSync`'s `writerData`.

- [ ] **Step 3: Verify no regression**

Run: `cd packages/backend && npm run test:run` and `cd packages/rowboat-service && npm run test:run` (if present).
Expected: PASS — `groupOpsModule` is optional; unset preserves current behavior. (No new test here; Task 10 exercises the wired path end-to-end.)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/writer.worker.mjs packages/backend/src/serve-threads.ts packages/backend/src/serve-sync.ts packages/rowboat-service/src/start-core-service.ts
git commit -m "feat(backend): inject the writer group-op runner via a dynamic-import module URL"
```

---

### Task 4: `mountSyncRoutes` per-database `authFactory` + `ensureProvisioned` hook

**Files:**
- Modify: `packages/backend/src/routes.ts` (`SyncRouteOpts` + pull/push handlers)
- Test: `packages/backend/src/__tests__/auth-factory.test.ts` (new)

**Interfaces:**
- Consumes: `SyncAuth`, existing pull/push handler flow.
- Produces (relied on by Task 7):
  ```ts
  // SyncRouteOpts gains:
  authFactory?: (db: SyncDb, databaseId: string) => SyncAuth;   // per-db enforcement; XOR with `auth`
  ensureProvisioned?: (databaseId: string, author: string) => Promise<void>;  // awaited after resolveAuthor, before enforce
  ```
  When `authFactory` is set, each request resolves its `SyncAuth` from the request's db handle (cached per databaseId), used exactly where `auth` is used today. `ensureProvisioned` (if set) is awaited after author resolution and before `pullChanges`/`prepareWrite`. The existing single `auth` option still works; setting both `auth` and `authFactory` throws at mount. `authFactory`/`auth` still requires `resolveAuthor` (existing guard).

- [ ] **Step 1: Write the failing test** — `packages/backend/src/__tests__/auth-factory.test.ts`: mount sync (registry or single-db form) with an `authFactory` that returns a `createRbacAuth(db, {tables})`-style stub and an `ensureProvisioned` spy; drive a pull and a push via supertest; assert (a) `ensureProvisioned` was awaited with `(databaseId, author)` before any row was returned, (b) the pull was scoped (rows outside the author's groups are absent), (c) setting both `auth` and `authFactory` throws at mount. (Model the harness on `packages/integration/src/env.ts` + the existing `rbac-e2e` server setup.)

- [ ] **Step 2: Run test to verify it fails** — `cd packages/backend && npm run test:run -- auth-factory` → FAIL (`authFactory` unknown).

- [ ] **Step 3: Implement.** In `routes.ts`:
  1. Add `authFactory?` and `ensureProvisioned?` to `SyncRouteOpts`.
  2. Mount guard: `if (auth && authFactory) throw new Error("mountSyncRoutes: pass at most one of `auth` / `authFactory`")`. Extend the existing `(auth || authFactory) && !resolveAuthor` guard to require `resolveAuthor` for either.
  3. In both the pull handler and the sync (push) handler, after resolving `db` (from `databaseIdFrom`/registry) and `author`: `if (ensureProvisioned && author) await ensureProvisioned(databaseId, author);` then compute `const effectiveAuth = authFactory ? authForDb(db, databaseId) : auth;` where `authForDb` is a small per-`databaseId` cache (`Map<string, SyncAuth>`) built once in `mountSyncRoutes`. Pass `effectiveAuth` everywhere `auth` currently flows (`pullChanges({... auth: effectiveAuth ...})`, `prepareWrite(... effectiveAuth ...)`).

  (Read `routes.ts` pull handler ~255-337 and push handler ~339-431 for the exact `db`/`author` variable names and the `pullChanges`/`prepareWrite` call sites; substitute `effectiveAuth` for `auth` there.)

- [ ] **Step 4: Run tests** — `cd packages/backend && npm run test:run` → PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes.ts packages/backend/src/__tests__/auth-factory.test.ts
git commit -m "feat(backend): per-database authFactory + ensureProvisioned hook on mountSyncRoutes"
```

---

### Task 5: The group-op runner (`applyGroupOp`) in rowboat-service

**Files:**
- Create: `packages/rowboat-service/src/writer-groupops.mjs` (or `.ts` compiled to a `.mjs`-importable entry — match how `server-buildapp.mjs` is authored/built in this package)
- Modify: `packages/rowboat-service/package.json` (add `@jbroll/rowboat-auth` dependency)
- Test: `packages/rowboat-service/src/__tests__/writer-groupops.test.ts` (new)

**Interfaces:**
- Consumes: `@jbroll/rowboat-auth` (`registerAuthTables`, `ensureUserRootGroup` equivalent via `createScopeGroup` + `effectiveRole`, `createScopeGroup`, `GroupTables`), Task 2's `GroupOp`/`GroupResult` shape.
- Produces: `export function applyGroupOp(db, databaseId, groupOp): GroupResult` — the injected runner. Uses the `__group*` `GroupTables`. Idempotently `registerAuthTables(db, GROUP_TABLES)` before the op (safe: `CREATE TABLE IF NOT EXISTS`). `ensureRootGroup` = the existing `ensureUserRootGroup` logic (existence check via `effectiveRole`, else `createScopeGroup({actor:account, group:account})`) with the custom tables. `createScopeGroup` = mint with the given actor/group/parentGroup. Returns `{ ok:false, error }` on any `AuthzError`/throw (never throws — the writer replies with the result).

- [ ] **Step 1: Write the failing test** — a Vitest that imports `applyGroupOp`, opens an in-memory/`tmp` sqlite, calls `applyGroupOp(db, "db1", { op:"ensureRootGroup", account:"user_a" })` twice (idempotent → both `{ok:true}`, one membership row), then `{ op:"createScopeGroup", actor:"user_a", group:"g1", parentGroup:"user_a" }` → `{ok:true}` and the `__group_inheritance` edge exists; and a failing case (createScopeGroup on an existing group → `{ok:false}`, not a throw).

- [ ] **Step 2: Run → FAIL** (module missing).

- [ ] **Step 3: Implement** `writer-groupops.mjs`:

```js
import { createScopeGroup, DEFAULT_GROUP_TABLES, effectiveRole, registerAuthTables } from "@jbroll/rowboat-auth";

export const GROUP_TABLES = { groups: "__groups", members: "__group_members", inheritance: "__group_inheritance" };

export function applyGroupOp(db, _databaseId, groupOp) {
  try {
    registerAuthTables(db, GROUP_TABLES); // idempotent
    if (groupOp.op === "ensureRootGroup") {
      if (effectiveRole(db, groupOp.account, groupOp.account, undefined, GROUP_TABLES) === null) {
        createScopeGroup(db, { actor: groupOp.account, group: groupOp.account }, { tables: GROUP_TABLES });
      }
      return { ok: true };
    }
    if (groupOp.op === "createScopeGroup") {
      createScopeGroup(
        db,
        { actor: groupOp.actor, group: groupOp.group, parentGroup: groupOp.parentGroup },
        { tables: GROUP_TABLES },
      );
      return { ok: true };
    }
    return { ok: false, error: `unknown group op ${JSON.stringify(groupOp)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(rowboat-service): applyGroupOp runner (root-group + scope-group mint on __group* tables)`.

---

### Task 6: Listener writer-client — add `forwardGroupWrite`

**Files:**
- Modify: `packages/backend/src/listener.worker.mjs`
- Test: none in isolation (exercised by Task 10); the change is a mechanical extension of the existing forward closure.

**Interfaces:**
- Produces: alongside `forwardPush`, a `forwardGroupWrite(databaseId, groupOp): Promise<GroupResult>` over the same writer port, sharing one `pending` map. `buildApp` receives both.

- [ ] **Step 1:** Refactor `makeForwardPush` into `makeWriterClient(wp)` that owns one `pending` map + `nextId` and returns `{ forwardPush, forwardGroupWrite }`:

```js
function makeWriterClient(wp) {
  const pending = new Map();
  let nextId = 0;
  wp.on("message", ({ requestId, result }) => { pending.get(requestId)?.(result); pending.delete(requestId); });
  const rejectAll = (e) => { for (const r of pending.values()) r({ ok: false, error: String(e) }); pending.clear(); };
  wp.on("close", () => rejectAll(new Error("writer port closed")));
  wp.on("messageerror", (e) => rejectAll(e));
  const send = (payload) => new Promise((resolve) => { const requestId = ++nextId; pending.set(requestId, resolve); wp.postMessage({ requestId, ...payload }); });
  return {
    forwardPush: (databaseId, prepared) => send({ databaseId, kind: "prepared", prepared }),
    forwardGroupWrite: (databaseId, groupOp) => send({ databaseId, kind: "groupWrite", groupOp }),
  };
}
```
Then: `const writerClient = writerPort ? makeWriterClient(writerPort) : undefined;` and pass both into buildApp: `buildApp({ reg, basePath, forwardPush: writerClient?.forwardPush, forwardGroupWrite: writerClient?.forwardGroupWrite, appData })`.

(Note: existing `prepared` messages now carry `kind: "prepared"` explicitly — Task 2's writer handles both explicit and absent `kind`, so this is compatible.)

- [ ] **Step 2:** Run `cd packages/backend && npm run test:run` (listener behavior unchanged for the push path). PASS.
- [ ] **Step 3: Commit** `feat(backend): listener forwardGroupWrite over the writer channel`.

---

### Task 7: Wire enforcement + provisioning + mint endpoint in `server-buildapp.mjs`

**Files:**
- Modify: `packages/rowboat-service/src/server-buildapp.mjs`
- Test: exercised by Task 10 (end-to-end).

**Interfaces:**
- Consumes: `forwardGroupWrite` (Task 6), `createRbacAuth` (Task 1, from `@jbroll/rowboat-auth`), the `GROUP_TABLES` (Task 5), `authFactory`/`ensureProvisioned` (Task 4).
- Produces: when `appData.rbac` is true, `buildApp` wires:
  - `authFactory: (db) => createRbacAuth(db, { tables: GROUP_TABLES })`
  - `ensureProvisioned: (databaseId, author) => provisionOnce(databaseId, author)` where `provisionOnce` keeps an in-memory `Set<`${databaseId} ${author}`>` and, on a miss, `await forwardGroupWrite(databaseId, { op:"ensureRootGroup", account: author })`, throws if `!result.ok`, else adds to the set.
  - a mint route `POST` under the sync prefix (e.g. `${basePath}/groups`) gated by the same `resolveAuthor` (internal token): body `{ parentGroup?: string }`, generate `groupId = randomUUID()`, `await forwardGroupWrite(databaseId, { op:"createScopeGroup", actor: author, group: groupId, parentGroup: parentGroup ?? author })`, 200 `{ groupId }` on ok / 403 or 409 on `!ok`.
  When `appData.rbac` is false, none of the above is wired (current behavior).

- [ ] **Step 1:** Add `forwardGroupWrite` to `buildApp`'s destructured params. Guard all new wiring behind `if (appData.rbac)`. Build `provisionOnce` (the cached Set). Pass `authFactory` + `ensureProvisioned` into the `mountSyncRoutes` opts (Task 4). Mount the mint route (a small `express` handler that reuses the same internal-token `verify` closure the sync mount uses for `resolveAuthor`, resolves `databaseId` from `req.params.database_id`, and calls `forwardGroupWrite`).

- [ ] **Step 2:** Because the mint route lives under `/db/:database_id/api/sync/...`, the router's existing splat proxy forwards it with no router change (same as media). Confirm the route path string sits under `basePath`.

- [ ] **Step 3:** Verify with Task 10; run `cd packages/rowboat-service && npm run test:run`. Commit `feat(rowboat-service): wire RBAC enforcement, lazy root-group provisioning, and the group-mint endpoint`.

---

### Task 8: Create the `__group*` tables at database provisioning

**Files:**
- Modify: `packages/control-plane/src/control-plane.ts` (`createDatabase`)
- Modify: `packages/control-plane/package.json` (add `@jbroll/rowboat-auth` dependency)
- Test: `packages/control-plane/src/__tests__/group-tables.test.ts` (new)

**Interfaces:**
- Produces: `createDatabase` also calls `registerAuthTables(sdb, __GROUP_TABLES)` on the freshly-created `<database_id>.db` (inside the existing `try` where `sdb` is open, after the `registerSyncTable` loop), so every new database ships with empty `__group*` tables. The enforcement reads (listener) and group writes (writer) therefore always find the tables.

- [ ] **Step 1: Failing test** — create a subscriber+database via `ControlPlane`, then open the `<id>.db` file and assert `__groups`/`__group_members`/`__group_inheritance` exist and are NOT in `sync_tables` (not synced).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in `createDatabase`, import `registerAuthTables` + the `__` `GroupTables` and call `registerAuthTables(sdb, { groups:"__groups", members:"__group_members", inheritance:"__group_inheritance" })` right after the `for (const t of args.schemaManifest) registerSyncTable(sdb, t)` loop (before `getSchemaVersion(sdb)`), so it rides the same open handle + error-cleanup path.

- [ ] **Step 4: Run → PASS** (`cd packages/control-plane && npm run test:run`). Commit `feat(control-plane): provision per-database __group* tables at createDatabase`.

---

### Task 9: Surface the RBAC flag + group-ops module through the server assembly

**Files:**
- Modify: `packages/server/src/assembly.ts` (`ServerConfig` + `startCoreService` call + `appData`/listener wiring)
- Modify: `packages/server/src/main.ts` (`configFromEnv` reads `ROWBOAT_RBAC`)
- Test: `packages/server/src/__tests__/rbac-flag.test.ts` (new — `configFromEnv` maps `ROWBOAT_RBAC=on` → `rbac:true`; default false; unknown throws)

**Interfaces:**
- Produces: `ServerConfig.rbac?: boolean` (default false). `configFromEnv` reads `ROWBOAT_RBAC` (`on`/`off`, default `off`; unknown throws, mirroring `ROWBOAT_AUTH_MODE`). `startServer` passes `rbac` into the listener `appData` and passes `groupOpsModule` (the `new URL("...writer-groupops.mjs", import.meta.url)` href resolved against the rowboat-service package) into `startCoreService`. When `rbac` is false, `appData.rbac` is false and `groupOpsModule` may still be passed (harmless — no group writes occur).

- [ ] **Step 1–4:** TDD the `configFromEnv` flag (test like Phase A's `auth-mode.test.ts`), then wire `rbac` into `appData` and `groupOpsModule` into the `startCoreService` options. Run `cd packages/server && npm run test:run`. Commit `feat(server): ROWBOAT_RBAC flag wires per-database RBAC into the worker`.

> **Implementer note:** the `groupOpsModule` URL must resolve to the built `writer-groupops` entry inside `@jbroll/rowboat-service`. Match however `server-buildapp.mjs`'s URL is currently resolved in `start-core-service.ts` (`new URL("../src/server-buildapp.mjs", import.meta.url)`) and add a sibling `writer-groupops.mjs` resolution.

---

### Task 10: Integration proof — RBAC on, end-to-end through the real worker

**Files:**
- Create: `packages/integration/src/rbac-worker-e2e.test.ts`
- Modify: `packages/integration/package.json` (ensure deps: `@jbroll/rowboat-server`, `@jbroll/rowboat-control-plane`, `@jbroll/rowboat-auth`, `@jbroll/rowboat-client`)

**Interfaces:**
- Consumes: the assembled hosted server (`startServer` from `@jbroll/rowboat-server` with `rbac: true`, or `startCoreService` + `createRouter` wired as `assembly.ts` does), the control-plane management API (create subscriber/database), and a sync client.

**Proof (assertions — do NOT weaken):**
- [ ] Boot the server with `rbac: true` and `groupOpsModule` wired; create a subscriber + database (which now provisions `__group*` tables). Author identity is supplied via the worker's internal-token path — drive requests through the router with an author (reuse the Phase A JWT bridge OR, if that's heavier than needed, drive the core service directly with `x-author`/synthetic identity behind the router; match whichever identity path the test harness already uses for authed sync).
- [ ] **Root-group auto-provision + self access:** user A syncs (pull/push) a row with `owner_group_id = A`; assert the push is authorized and A pulls it back. (Root group for A was lazily provisioned on first author.)
- [ ] **Isolation:** user B pulls; assert B does NOT receive A's row (scoped out). B pushes a row scoped to A's group; assert 403.
- [ ] **Folder-group mint + nested access:** user A calls the mint endpoint (`POST …/api/sync/groups` with `{ parentGroup: A }`) → `{ groupId: g }`; A pushes a row with `owner_group_id = g`; assert A can pull it (inherited readability via the root→group link) and B cannot.
- [ ] **Mint authorization:** B calling mint with `{ parentGroup: A }` (a group B doesn't admin) → the write fails (403/409), because `createScopeGroup`'s `link` requires admin on the child and B isn't admin of A.

- [ ] Run `cd packages/integration && npm run test:run -- rbac-worker-e2e` and the full `npm run test:run`. Commit `test(integration): RBAC-on worker proof — per-user isolation, lazy root group, folder-group mint`.

---

## Self-Review

**Spec coverage (design §B, decisions B-opt-1 / 3 / 4-partial):**
- §B enforcement in the worker (scoped pull + gated push by `owner_group_id`) → Tasks 4 (authFactory) + 7 (wiring) + 1 (parameterized `createRbacAuth`). Engine already enforces; no engine change.
- B-opt-1 per-database `__group*` tables keyed by external `sub` → Tasks 1 (names) + 8 (provisioning) + 5 (writer writes). `account_id` is opaque (no FK) so the JWT `sub` works.
- Lazy per-user root-group provisioning on first verified author → Tasks 4 (`ensureProvisioned`) + 5 (`ensureRootGroup`) + 7 (cached `provisionOnce`).
- Relocated `createScopeGroup` mint (folder groups) → Task 7 mint endpoint + 5 runner. (CheckList client repoint to this endpoint is deferred — see Non-goals.)
- Single-writer preserved → Tasks 2/3/6 (all group writes ride the one writer thread via the injected runner). Backend stays auth-free (dynamic-import injection).
- Gated rollout → Task 9 (`ROWBOAT_RBAC`, default off).

**Placeholder scan:** Two tests are described rather than written verbatim (Task 2's writer test needs a tmpdir+registry harness; Task 10's e2e needs the assembled server) — each has a concrete "implementer note" enumerating the exact setup and assertions, because they depend on harness details (worker threads, server boot) that are cleaner to wire against the real files than to transcribe blind. Every production-code step has complete code or a precisely-anchored edit. No `TBD`/"handle errors"/"similar to Task N".

**Type consistency:** `GroupTables{groups,members,inheritance}` defined once (Task 1), consumed in Tasks 5/8. `GroupOp`/`GroupResult`/`ApplyGroupOp` defined once (Task 2), consumed in Tasks 3/5/6. `authFactory(db,databaseId)=>SyncAuth` and `ensureProvisioned(databaseId,author)=>Promise<void>` identical across Tasks 4/7. The `{ requestId, kind, ... }` message shape matches between listener `send` (Task 6) and the writer handler (Task 2).

**Risk callouts (for the reviewer):**
- Tasks 2–3 modify the **single-writer core**. The reviewer must confirm: group writes and CRDT batches never race (both on the one writer thread); a fenced db short-circuits group writes too; the widened `WriterRequest` union doesn't break the `rebuffer` path; the shared `pending` map (Task 6) correlates both message kinds correctly.
- Task 1 interpolates table names into security-critical SQL — the `resolveTables` identifier validation is the guard; the reviewer must confirm every group-table SQL literal was parameterized (no stray hardcoded `group_members` left) and defaults are byte-identical.
- WAL visibility: `ensureProvisioned` awaits the writer's committed reply before the listener enforces, so the listener's separate read connection sees the new root group. The reviewer should confirm the await ordering in Task 4/7.

## Non-goals (Phase B)
- **No CheckList client repoint** — `serverMintGroup` still targets CheckList's own `POST /api/folders/group`; pointing it at the rowboat mint endpoint (and dropping CheckList's backend group route) is a later CheckList-cutover phase.
- **No sharing / invites / collaborators** — `grant`/`revoke`/invite flows and the `@jbroll/rowboat-sharing` surface are **Phase C**. Task 1 parameterizes `grant`/`link`/etc. so Phase C can reuse them, but no sharing endpoint is mounted here.
- **No flip of the hosted default to RBAC-on** — `ROWBOAT_RBAC` defaults `off`; production turns it on as a deliberate cutover (with every database's `__group*` tables provisioned).
- **No migration of pre-existing databases** — `__group*` tables are created at `createDatabase`; databases created before Phase B would need a one-off backfill (out of scope; the proof uses fresh databases).
