# Sub-project B — CheckList tenant provisioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shrink-wrapped, idempotent tenant-provisioning tool in `@jbroll/rowboat-cli` (create subscriber → create database with the compiled schema → register the JWT issuer), and consume it from CheckList to provision the local + prod tenants.

**Architecture:** The mechanism lives entirely in rowboat's `@jbroll/rowboat-cli` — two new control-plane client calls (`createSubscriber`, `setAuthIssuer`) plus a `provisionTenant` orchestrator (importable fn + `provision-tenant` CLI verb) that is idempotent via a caller-named state file. CheckList is a thin consumer: two npm scripts run the CLI (via `tsx`, by path against the sibling `../rowboat` checkout) with CheckList's `shared/schema.ts` and per-env config; outputs land in a gitignored `rowboat-tenant.<env>.json`. The schema is the only subscriber-dependent input.

**Tech Stack:** TypeScript, `@jbroll/rowboat-cli` (existing `compile`/`provision`/`migrate` verbs + `createSchemaClient`), `@jbroll/rowboat-schema` (`compileSchema`), `@jbroll/rowboat-shared` (`TableManifest`), Vitest (fetch/dep fakes — no live server for units), `tsx`, the rowboat control-plane `/v1/*` API.

## Global Constraints

- **Two repos, two land flows.** rowboat Tasks 1–3 are made in the **wt2 worktree** `/home/john/src/rowboat-wt2` (branch `wt2`, base rowboat `main` `9e76aa9`) and landed via `scripts/land.sh wt2` from `/home/john/src/rowboat`. CheckList Task 4 is made on branch `hosted-rowboat-subproject-b` (already created, off `main` `62861b2`) and merged to `main`.
- **Strict ordering: rowboat Tasks 1–3 must be LANDED (and dist rebuilt) before Task 4.** Task 4 runs the CLI from the **main** `../rowboat` checkout (`/home/john/src/rowboat`), not wt2 — so the new verb must be on rowboat `main` first. `scripts/land.sh` rebuilds dist for `file:`-linked consumers.
- **Never `--no-verify`.** Every commit passes the org-hooks gate. Non-`.md` code changes run the full gate.
- **TDD** for all rowboat tasks: write the failing test, see it fail, implement, see it pass, commit.
- **Preserve existing error-message strings** when refactoring the client to throw `ControlPlaneHttpError` — existing `control-plane-client.test.ts` assertions must stay green.
- **The `managementKey` is a secret** (shown once by `POST /v1/subscribers`): never print it; the state file that holds it is gitignored.
- **Shared types (defined in Task 1/2, consumed later — use these exact names):**
  - `class ControlPlaneHttpError extends Error { readonly status: number }`
  - `interface SubscriberResult { subscriberId: string; managementKey: string }`
  - `interface AuthIssuerConfig { jwksUrl: string; issuer: string; audience: string }`
  - `SchemaClient` gains `setAuthIssuer(databaseId: string, config: AuthIssuerConfig): Promise<void>`
  - `createSubscriber(baseUrl: string, input: { name: string; billingEmail?: string }, fetchFn?): Promise<SubscriberResult>`
  - `interface TenantState { subscriberId; managementKey; databaseId; jwksUrl; issuer; audience }` (all `string`)
  - `interface ProvisionTenantConfig { controlPlaneUrl; schemaModule; name; jwksUrl; issuer; billingEmail? }`
  - `provisionTenant(cfg: ProvisionTenantConfig, deps: ProvisionTenantDeps): Promise<TenantState>`
  - `fileStateStore(path: string): StateStore`, `defaultDeps(statePath: string): ProvisionTenantDeps`

---

## File structure

**rowboat `@jbroll/rowboat-cli` (wt2):**
- Modify: `packages/rowboat-cli/src/control-plane-client.ts` — `ControlPlaneHttpError`, `createSubscriber`, `setAuthIssuer`; route the two existing methods' error throws through the new error type.
- Modify: `packages/rowboat-cli/src/__tests__/control-plane-client.test.ts` — add cases for the new calls.
- Create: `packages/rowboat-cli/src/provision-tenant.ts` — orchestrator, `StateStore`/`fileStateStore`, `defaultDeps`, types.
- Create: `packages/rowboat-cli/src/__tests__/provision-tenant.test.ts` — the three orchestrator branches.
- Modify: `packages/rowboat-cli/src/cli.ts` — `provision-tenant` verb + USAGE + handlers map + robust entrypoint guard.
- Modify: `packages/rowboat-cli/src/__tests__/cli.test.ts` — verb validation cases.

**CheckList:**
- Modify: `package.json` — `provision:local` / `provision:prod` scripts.
- Modify: `.gitignore` — `rowboat-tenant.*.json`.
- Modify: `docs/HOSTED_ROWBOAT.md` — sub-project B usage note.
- Modify (rowboat, docs-only follow-on): `../rowboat/packages/server/DEPLOY_RUNBOOK.md` gets a "provision the tenant" step — done as part of Task 4's rowboat-side note **only if** landing separately is undesirable; otherwise fold into Task 3. (See Task 4, Step 5.)

---

## Task 1: `createSubscriber` + `setAuthIssuer` + typed HTTP error

**Files:**
- Modify: `/home/john/src/rowboat-wt2/packages/rowboat-cli/src/control-plane-client.ts`
- Test: `/home/john/src/rowboat-wt2/packages/rowboat-cli/src/__tests__/control-plane-client.test.ts`

**Model:** `sonnet` — real client code + a behavior-preserving error-type refactor; must not break existing assertions.

**Interfaces:**
- Consumes: nothing new (existing `createSchemaClient` shape).
- Produces: `ControlPlaneHttpError` (with `.status`), `createSubscriber`, `SubscriberResult`, `AuthIssuerConfig`, and `SchemaClient.setAuthIssuer` — all consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `control-plane-client.test.ts` (keep existing imports; add `createSubscriber` to the import from `../control-plane-client.js`):

```ts
describe("createSubscriber", () => {
  it("POSTs /v1/subscribers with no auth header and returns the ids", async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://cp.example.com/v1/subscribers");
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(JSON.parse(init.body as string)).toEqual({ name: "checklist", billingEmail: undefined });
      return { ok: true, status: 201, json: async () => ({ subscriberId: "sub_1", managementKey: "mk_1" }) };
    });
    const res = await createSubscriber("https://cp.example.com", { name: "checklist" }, fetchFn as unknown as typeof fetch);
    expect(res).toEqual({ subscriberId: "sub_1", managementKey: "mk_1" });
  });

  it("throws ControlPlaneHttpError with the status on a non-2xx", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "bad name" }) }));
    await expect(createSubscriber("https://cp.example.com", { name: "" }, fetchFn as unknown as typeof fetch))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("bad name") });
  });
});

describe("setAuthIssuer", () => {
  it("PUTs /v1/databases/:id/auth-issuer with Bearer + body and resolves on ok", async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://cp.example.com/v1/databases/db1/auth-issuer");
      expect(init.method).toBe("PUT");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
      expect(JSON.parse(init.body as string)).toEqual({ jwksUrl: "https://a/jwks", issuer: "https://a", audience: "db1" });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    const client = createSchemaClient("https://cp.example.com", "test-key", fetchFn as unknown as typeof fetch);
    await expect(client.setAuthIssuer("db1", { jwksUrl: "https://a/jwks", issuer: "https://a", audience: "db1" }))
      .resolves.toBeUndefined();
  });

  it("throws ControlPlaneHttpError on non-2xx", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "no db" }) }));
    const client = createSchemaClient("https://cp.example.com", "k", fetchFn as unknown as typeof fetch);
    await expect(client.setAuthIssuer("dbX", { jwksUrl: "j", issuer: "i", audience: "a" }))
      .rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run the new tests — verify they fail**

Run: `cd /home/john/src/rowboat-wt2 && npx vitest run packages/rowboat-cli/src/__tests__/control-plane-client.test.ts`
Expected: FAIL — `createSubscriber`/`setAuthIssuer` are not exported yet.

- [ ] **Step 3: Implement in `control-plane-client.ts`**

At the top of the file (after the `TableManifest` import) add the error type + issuer config type, and refactor the two existing throws to use it. Replace the two existing `throw new Error(...)` sites in `submitSchema` and `createDatabase` with `ControlPlaneHttpError` (message strings unchanged), and add the new members:

```ts
export class ControlPlaneHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ControlPlaneHttpError";
  }
}

export interface SubscriberResult {
  subscriberId: string;
  managementKey: string;
}

export interface AuthIssuerConfig {
  jwksUrl: string;
  issuer: string;
  audience: string;
}
```

In `submitSchema`, change the error throw to:
```ts
      if (!response.ok) {
        throw new ControlPlaneHttpError(
          `schema submit failed (${response.status}): ${body.error ?? "unknown error"}`,
          response.status,
        );
      }
```
In `createDatabase`, change the error throw to:
```ts
      if (!response.ok) {
        throw new ControlPlaneHttpError(
          `create database failed (${response.status}): ${body.error ?? "unknown error"}`,
          response.status,
        );
      }
```

Add `setAuthIssuer` to the `SchemaClient` interface:
```ts
  setAuthIssuer(databaseId: string, config: AuthIssuerConfig): Promise<void>;
```
Implement it inside the object returned by `createSchemaClient` (peer of `submitSchema`/`createDatabase`):
```ts
    async setAuthIssuer(databaseId, config) {
      const response = await fetchFn(`${baseUrl}/v1/databases/${databaseId}/auth-issuer`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${managementKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jwksUrl: config.jwksUrl, issuer: config.issuer, audience: config.audience }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new ControlPlaneHttpError(
          `set auth issuer failed (${response.status}): ${body.error ?? "unknown error"}`,
          response.status,
        );
      }
    },
```
Add the standalone `createSubscriber` (module-level export, not a `SchemaClient` method — it is keyless and returns the key):
```ts
export async function createSubscriber(
  baseUrl: string,
  input: { name: string; billingEmail?: string },
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<SubscriberResult> {
  const response = await fetchFn(`${baseUrl}/v1/subscribers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, billingEmail: input.billingEmail }),
  });
  const body = (await response.json()) as { subscriberId?: string; managementKey?: string; error?: string };
  if (!response.ok) {
    throw new ControlPlaneHttpError(
      `create subscriber failed (${response.status}): ${body.error ?? "unknown error"}`,
      response.status,
    );
  }
  if (!body.subscriberId || !body.managementKey) {
    throw new ControlPlaneHttpError("create subscriber response missing subscriberId/managementKey", response.status);
  }
  return { subscriberId: body.subscriberId, managementKey: body.managementKey };
}
```

- [ ] **Step 4: Run the full client test file — verify all pass**

Run: `cd /home/john/src/rowboat-wt2 && npx vitest run packages/rowboat-cli/src/__tests__/control-plane-client.test.ts`
Expected: PASS — the new cases AND the pre-existing cases (message strings unchanged, so the old assertions still hold).

- [ ] **Step 5: Commit**

```bash
cd /home/john/src/rowboat-wt2
git add packages/rowboat-cli/src/control-plane-client.ts packages/rowboat-cli/src/__tests__/control-plane-client.test.ts
git commit -m "feat(cli): createSubscriber + setAuthIssuer + typed ControlPlaneHttpError"
```
Expected: org-hooks gate passes.

---

## Task 2: `provisionTenant` orchestrator + state store

**Files:**
- Create: `/home/john/src/rowboat-wt2/packages/rowboat-cli/src/provision-tenant.ts`
- Test: `/home/john/src/rowboat-wt2/packages/rowboat-cli/src/__tests__/provision-tenant.test.ts`

**Model:** `opus` — the idempotency/stale-rebootstrap logic is the correctness crux (a bug means duplicate subscribers or a wedged local tenant); worth the stronger model.

**Interfaces:**
- Consumes: `createSubscriber`, `createSchemaClient`, `setAuthIssuer`, `ControlPlaneHttpError` (Task 1); `compileManifest` (`./compile.js`); `TableManifest` (`@jbroll/rowboat-shared`).
- Produces: `provisionTenant`, `fileStateStore`, `defaultDeps`, `TenantState`, `ProvisionTenantConfig`, `ProvisionTenantDeps`, `StateStore` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `provision-tenant.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { TableManifest } from "@jbroll/rowboat-shared";
import { ControlPlaneHttpError, type SchemaClient } from "../control-plane-client.js";
import { provisionTenant, type ProvisionTenantConfig, type StateStore, type TenantState } from "../provision-tenant.js";

const manifest: TableManifest[] = [{ name: "folder", columns: [{ name: "id", type: "text" }] }];
const cfg: ProvisionTenantConfig = {
  controlPlaneUrl: "https://cp",
  schemaModule: "shared/schema.ts",
  name: "checklist",
  jwksUrl: "https://app/api/auth/jwks",
  issuer: "https://app/api/auth",
};

function memStore(initial?: TenantState): StateStore & { current?: TenantState } {
  const s: { current?: TenantState } = { current: initial };
  return { current: s.current, read: () => s.current, write: (v) => { s.current = v; } };
}

function fakeClient(over: Partial<SchemaClient> = {}): SchemaClient {
  return {
    submitSchema: vi.fn(async () => ({ noop: true, schemaVersion: 1 })),
    createDatabase: vi.fn(async () => ({ databaseId: "db_new" })),
    setAuthIssuer: vi.fn(async () => {}),
    ...over,
  };
}

describe("provisionTenant", () => {
  it("fresh bootstrap: creates subscriber+database+issuer and writes state", async () => {
    const store = memStore();
    const createSubscriber = vi.fn(async () => ({ subscriberId: "sub_1", managementKey: "mk_1" }));
    const client = fakeClient();
    const state = await provisionTenant(cfg, {
      compileManifest: async () => manifest,
      createSubscriber,
      createSchemaClient: () => client,
      stateStore: store,
      print: () => {},
    });
    expect(createSubscriber).toHaveBeenCalledTimes(1);
    expect(client.createDatabase).toHaveBeenCalledWith("checklist", manifest);
    expect(client.setAuthIssuer).toHaveBeenCalledWith("db_new", { jwksUrl: cfg.jwksUrl, issuer: cfg.issuer, audience: "db_new" });
    expect(state).toMatchObject({ subscriberId: "sub_1", managementKey: "mk_1", databaseId: "db_new", audience: "db_new" });
    expect(store.read()).toEqual(state);
  });

  it("reconcile: prior state + db exists -> migrate + re-assert issuer, NO new subscriber", async () => {
    const prior: TenantState = { subscriberId: "sub_1", managementKey: "mk_1", databaseId: "db_1", jwksUrl: "old", issuer: "old", audience: "db_1" };
    const store = memStore(prior);
    const createSubscriber = vi.fn();
    const submitSchema = vi.fn(async () => ({ noop: true, schemaVersion: 2 }));
    const setAuthIssuer = vi.fn(async () => {});
    const client = fakeClient({ submitSchema, setAuthIssuer });
    const state = await provisionTenant(cfg, {
      compileManifest: async () => manifest,
      createSubscriber,
      createSchemaClient: () => client,
      stateStore: store,
      print: () => {},
    });
    expect(createSubscriber).not.toHaveBeenCalled();
    // one dry-run existence probe + one real migrate:
    expect(submitSchema).toHaveBeenNthCalledWith(1, "db_1", manifest, { dryRun: true });
    expect(submitSchema).toHaveBeenNthCalledWith(2, "db_1", manifest);
    expect(setAuthIssuer).toHaveBeenCalledWith("db_1", { jwksUrl: cfg.jwksUrl, issuer: cfg.issuer, audience: "db_1" });
    expect(state).toMatchObject({ databaseId: "db_1", jwksUrl: cfg.jwksUrl, issuer: cfg.issuer });
  });

  it("stale: prior state but db 404s on probe -> fresh re-bootstrap", async () => {
    const prior: TenantState = { subscriberId: "old", managementKey: "old", databaseId: "db_gone", jwksUrl: "o", issuer: "o", audience: "db_gone" };
    const store = memStore(prior);
    const createSubscriber = vi.fn(async () => ({ subscriberId: "sub_2", managementKey: "mk_2" }));
    const submitSchema = vi.fn(async () => { throw new ControlPlaneHttpError("schema submit failed (404): not found", 404); });
    const client = fakeClient({ submitSchema, createDatabase: vi.fn(async () => ({ databaseId: "db_fresh" })) });
    const state = await provisionTenant(cfg, {
      compileManifest: async () => manifest,
      createSubscriber,
      createSchemaClient: () => client,
      stateStore: store,
      print: () => {},
    });
    expect(createSubscriber).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ subscriberId: "sub_2", databaseId: "db_fresh", audience: "db_fresh" });
  });

  it("propagates a non-404/401 probe error instead of re-bootstrapping", async () => {
    const prior: TenantState = { subscriberId: "s", managementKey: "k", databaseId: "db_1", jwksUrl: "o", issuer: "o", audience: "db_1" };
    const createSubscriber = vi.fn();
    const submitSchema = vi.fn(async () => { throw new ControlPlaneHttpError("schema submit failed (500): boom", 500); });
    await expect(provisionTenant(cfg, {
      compileManifest: async () => manifest,
      createSubscriber,
      createSchemaClient: () => fakeClient({ submitSchema }),
      stateStore: memStore(prior),
      print: () => {},
    })).rejects.toMatchObject({ status: 500 });
    expect(createSubscriber).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `cd /home/john/src/rowboat-wt2 && npx vitest run packages/rowboat-cli/src/__tests__/provision-tenant.test.ts`
Expected: FAIL — `../provision-tenant.js` does not exist yet.

- [ ] **Step 3: Implement `provision-tenant.ts`**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import type { TableManifest } from "@jbroll/rowboat-shared";
import { compileManifest } from "./compile.js";
import {
  ControlPlaneHttpError,
  createSchemaClient,
  createSubscriber,
  type SchemaClient,
  type SubscriberResult,
} from "./control-plane-client.js";

export interface TenantState {
  subscriberId: string;
  managementKey: string;
  databaseId: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
}

export interface ProvisionTenantConfig {
  controlPlaneUrl: string;
  schemaModule: string;
  name: string;
  jwksUrl: string;
  issuer: string;
  billingEmail?: string;
}

export interface StateStore {
  read(): TenantState | undefined;
  write(state: TenantState): void;
}

export interface ProvisionTenantDeps {
  compileManifest: (schemaModule: string) => Promise<TableManifest[]>;
  createSubscriber: (baseUrl: string, input: { name: string; billingEmail?: string }) => Promise<SubscriberResult>;
  createSchemaClient: (baseUrl: string, managementKey: string) => SchemaClient;
  stateStore: StateStore;
  print: (s: string) => void;
}

export function fileStateStore(path: string): StateStore {
  return {
    read() {
      try {
        return JSON.parse(readFileSync(path, "utf8")) as TenantState;
      } catch {
        return undefined;
      }
    },
    write(state) {
      writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
    },
  };
}

export function defaultDeps(statePath: string): ProvisionTenantDeps {
  return {
    compileManifest,
    createSubscriber: (baseUrl, input) => createSubscriber(baseUrl, input),
    createSchemaClient: (baseUrl, key) => createSchemaClient(baseUrl, key),
    stateStore: fileStateStore(statePath),
    print: (s) => console.log(s),
  };
}

async function databaseExists(client: SchemaClient, databaseId: string, manifest: TableManifest[]): Promise<boolean> {
  try {
    await client.submitSchema(databaseId, manifest, { dryRun: true });
    return true;
  } catch (err) {
    if (err instanceof ControlPlaneHttpError && (err.status === 404 || err.status === 401)) {
      return false;
    }
    throw err;
  }
}

function summary(state: TenantState, cfg: ProvisionTenantConfig): string {
  return [
    "provisioned tenant:",
    `  databaseId:   ${state.databaseId}`,
    `  controlPlane: ${cfg.controlPlaneUrl}`,
    `  issuer:       ${state.issuer}`,
    `  audience:     ${state.audience}`,
  ].join("\n");
}

export async function provisionTenant(
  cfg: ProvisionTenantConfig,
  deps: ProvisionTenantDeps,
): Promise<TenantState> {
  const manifest = await deps.compileManifest(cfg.schemaModule);
  const prior = deps.stateStore.read();

  if (prior) {
    const client = deps.createSchemaClient(cfg.controlPlaneUrl, prior.managementKey);
    if (await databaseExists(client, prior.databaseId, manifest)) {
      await client.submitSchema(prior.databaseId, manifest); // migrate (no-op if unchanged)
      await client.setAuthIssuer(prior.databaseId, {
        jwksUrl: cfg.jwksUrl,
        issuer: cfg.issuer,
        audience: prior.databaseId,
      });
      const next: TenantState = { ...prior, jwksUrl: cfg.jwksUrl, issuer: cfg.issuer, audience: prior.databaseId };
      deps.stateStore.write(next);
      deps.print(summary(next, cfg));
      return next;
    }
    // stored databaseId is gone (e.g. a wiped local scratch ROWBOAT_ROOT) — fall through to a fresh bootstrap
  }

  const { subscriberId, managementKey } = await deps.createSubscriber(cfg.controlPlaneUrl, {
    name: cfg.name,
    billingEmail: cfg.billingEmail,
  });
  const client = deps.createSchemaClient(cfg.controlPlaneUrl, managementKey);
  const { databaseId } = await client.createDatabase(cfg.name, manifest);
  await client.setAuthIssuer(databaseId, { jwksUrl: cfg.jwksUrl, issuer: cfg.issuer, audience: databaseId });
  const state: TenantState = {
    subscriberId,
    managementKey,
    databaseId,
    jwksUrl: cfg.jwksUrl,
    issuer: cfg.issuer,
    audience: databaseId,
  };
  deps.stateStore.write(state);
  deps.print(summary(state, cfg));
  return state;
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `cd /home/john/src/rowboat-wt2 && npx vitest run packages/rowboat-cli/src/__tests__/provision-tenant.test.ts`
Expected: PASS — all four cases.

- [ ] **Step 5: Commit**

```bash
cd /home/john/src/rowboat-wt2
git add packages/rowboat-cli/src/provision-tenant.ts packages/rowboat-cli/src/__tests__/provision-tenant.test.ts
git commit -m "feat(cli): provisionTenant orchestrator — idempotent bootstrap/reconcile/re-bootstrap"
```
Expected: org-hooks gate passes.

---

## Task 3: `provision-tenant` CLI verb + robust entrypoint guard

**Files:**
- Modify: `/home/john/src/rowboat-wt2/packages/rowboat-cli/src/cli.ts`
- Test: `/home/john/src/rowboat-wt2/packages/rowboat-cli/src/__tests__/cli.test.ts`

**Model:** `sonnet` — CLI arg wiring + a small correctness fix to the entrypoint guard.

**Interfaces:**
- Consumes: `provisionTenant`, `defaultDeps` (Task 2); `resolveConfig`, `requireControlPlaneUrl` (`./config.js`); `flagValue`, `run` (existing in `cli.ts`).
- Produces: the `provision-tenant` verb, runnable via `tsx <path>/cli.ts provision-tenant …`.

- [ ] **Step 1: Write the failing tests**

Add to `cli.test.ts` (it already imports `run` from `../cli.js` — reuse that import; add `vi`, `beforeEach`, `afterEach` to the vitest import if not present). These assert the **verb-specific error text**, so before the verb exists they fail (an unknown verb prints "unknown verb", not "provision-tenant requires") — a meaningful RED, not a vacuous exit-code check:

```ts
describe("provision-tenant verb", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { errSpy.mockRestore(); });
  const errText = () => errSpy.mock.calls.flat().join(" ");

  it("validates required flags with a verb-specific error", async () => {
    const code = await run(["provision-tenant", "--schema", "s", "--name", "n", "--jwks-url", "j", "--issuer", "i"]); // no --state
    expect(code).toBe(1);
    expect(errText()).toContain("provision-tenant requires");
  });

  it("returns 1 with a control-plane-URL error when the URL is absent", async () => {
    const prev = process.env.ROWBOAT_CONTROL_PLANE_URL;
    delete process.env.ROWBOAT_CONTROL_PLANE_URL;
    try {
      const code = await run(["provision-tenant", "--schema", "s", "--name", "n", "--jwks-url", "j", "--issuer", "i", "--state", "f.json"]);
      expect(code).toBe(1);
      expect(errText()).toMatch(/control-plane URL|ROWBOAT_CONTROL_PLANE_URL/);
    } finally {
      if (prev !== undefined) process.env.ROWBOAT_CONTROL_PLANE_URL = prev;
    }
  });
});
```

- [ ] **Step 2: Run — verify they fail**

Run: `cd /home/john/src/rowboat-wt2 && npx vitest run packages/rowboat-cli/src/__tests__/cli.test.ts -t "provision-tenant"`
Expected: FAIL — `provision-tenant` is still an unknown verb, so `console.error` carries "unknown verb", not "provision-tenant requires" (first test) and not a control-plane-URL error (second test). Both assertions fail until Step 3 registers the verb.

- [ ] **Step 3: Implement in `cli.ts`**

Add the import near the other verb imports:
```ts
import { provisionTenant } from "./provision-tenant.js";
import { defaultDeps } from "./provision-tenant.js";
```
(or a single combined import). Add the handler function (peer of `runProvision`):
```ts
async function runProvisionTenant(rest: string[]): Promise<number> {
  const schemaModule = flagValue(rest, "--schema");
  const name = flagValue(rest, "--name");
  const jwksUrl = flagValue(rest, "--jwks-url");
  const issuer = flagValue(rest, "--issuer");
  const statePath = flagValue(rest, "--state");
  const billingEmail = flagValue(rest, "--billing-email");

  if (!schemaModule || !name || !jwksUrl || !issuer || !statePath) {
    console.error(
      "error: provision-tenant requires --schema <module> --name <name> --jwks-url <url> --issuer <iss> --state <file>",
    );
    return 1;
  }

  let controlPlaneUrl: string;
  try {
    const config = resolveConfig(
      { "control-plane-url": flagValue(rest, "--control-plane-url") },
      { ROWBOAT_CONTROL_PLANE_URL: process.env.ROWBOAT_CONTROL_PLANE_URL },
    );
    controlPlaneUrl = requireControlPlaneUrl(config);
  } catch (err) {
    console.error(`error: ${errMsg(err)}`);
    return 1;
  }

  try {
    await provisionTenant(
      { controlPlaneUrl, schemaModule, name, jwksUrl, issuer, billingEmail },
      defaultDeps(statePath),
    );
    return 0;
  } catch (err) {
    console.error(`error: ${errMsg(err)}`);
    return 1;
  }
}
```
Register it in the `handlers` map:
```ts
  "provision-tenant": runProvisionTenant,
```
Add a USAGE line under `provision`:
```
  provision-tenant --schema <module> --name <name> --jwks-url <url> --issuer <iss> --state <file>
                                                   Bootstrap/reconcile a tenant (subscriber+db+issuer)
```

- [ ] **Step 4: Make the entrypoint guard robust (so `tsx <relative-path>/cli.ts` fires `main()`)**

The current guard `if (import.meta.url === \`file://${process.argv[1]}\`)` fails when the script is launched by a relative path or through a symlink (`process.argv[1]` is relative → no match → `main()` never runs → the CLI silently exits 0). Replace it with a realpath-resolving guard (same fix already used in `packages/server/src/main.ts`):

Add imports at the top of `cli.ts`:
```ts
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
```
Replace the bottom guard with:
```ts
function isEntryPoint(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main();
}
```

- [ ] **Step 5: Run the verb tests + the full cli test file**

Run: `cd /home/john/src/rowboat-wt2 && npx vitest run packages/rowboat-cli/src/__tests__/cli.test.ts`
Expected: PASS — the new `provision-tenant` validation cases and all pre-existing cli tests.

- [ ] **Step 6: Commit**

```bash
cd /home/john/src/rowboat-wt2
git add packages/rowboat-cli/src/cli.ts packages/rowboat-cli/src/__tests__/cli.test.ts
git commit -m "feat(cli): provision-tenant verb + realpath entrypoint guard (runnable by path)"
```
Expected: org-hooks gate passes.

- [ ] **Step 7: Add the "provision the tenant" step to the deploy runbook (wt2, docs)**

In `/home/john/src/rowboat-wt2/packages/server/DEPLOY_RUNBOOK.md`, add after the "Smoke (after deploy)" section:
```markdown
## Provision the tenant (after first deploy)

The deployed server has no tenant yet. From the CheckList checkout, once its BetterAuth JWKS endpoint
is live (sub-project C), run `npm run provision:prod` — it creates the subscriber + database (with
CheckList's compiled schema) and registers the JWT issuer, storing the management key in a gitignored
`rowboat-tenant.prod.json`. Re-running is safe (reconcile, not re-create).
```
Commit (pure `.md`, skips the code gate):
```bash
cd /home/john/src/rowboat-wt2
git add packages/server/DEPLOY_RUNBOOK.md
git commit -m "docs(server): runbook — provision the tenant after first deploy"
```

- [ ] **Step 8: Land rowboat Tasks 1–3 (+ the runbook doc) onto main**

After Tasks 1–3 are reviewed clean, land them so CheckList (Task 4) sees the verb on the main `../rowboat` checkout:
```bash
cd /home/john/src/rowboat
scripts/land.sh wt2
```
Expected: `wt2` fast-forwards onto `main`, pushes origin, and rebuilds dist. Confirm the new verb is present: `grep -q provision-tenant /home/john/src/rowboat/packages/rowboat-cli/src/cli.ts && echo present`.

---

## Task 4: CheckList consumer — provision scripts + smoke

**Files:**
- Modify: `/home/john/src/checklist/package.json`
- Modify: `/home/john/src/checklist/.gitignore`
- Modify: `/home/john/src/checklist/docs/HOSTED_ROWBOAT.md`

(The deploy-runbook provisioning step lands with the rowboat work — Task 3 Step 7.)

**Model:** `sonnet` — cross-repo wiring + a live end-to-end smoke against the running local server.

**Interfaces:**
- Consumes: the landed `provision-tenant` CLI verb (Task 3, on rowboat `main`); CheckList's `shared/schema.ts` (exports `schema`); the local `dev:rowboat` server (:3020, from sub-project A).
- Produces: `npm run provision:local` / `npm run provision:prod`; a gitignored `rowboat-tenant.<env>.json`.

**Precondition:** rowboat Tasks 1–3 are LANDED (Task 3 Step 7) and `../rowboat` dist is rebuilt.

- [ ] **Step 1: Add the provision scripts to `package.json`**

Insert after the `dev:rowboat` script (all flags inline — non-secret; the schema is the only tenant-specific input):

```json
    "provision:local": "tsx ../rowboat/packages/rowboat-cli/src/cli.ts provision-tenant --schema shared/schema.ts --name checklist-local --jwks-url http://localhost:3001/api/auth/jwks --issuer http://localhost:3001/api/auth --state rowboat-tenant.local.json --control-plane-url http://localhost:3020",
    "provision:prod": "tsx ../rowboat/packages/rowboat-cli/src/cli.ts provision-tenant --schema shared/schema.ts --name checklist --jwks-url https://checklist-app.rkroll.com/api/auth/jwks --issuer https://checklist-app.rkroll.com/api/auth --state rowboat-tenant.prod.json --control-plane-url https://rowboat.rkroll.com",
```

- [ ] **Step 2: Gitignore the tenant state files**

Append to `/home/john/src/checklist/.gitignore` (after the `.rowboat-dev/` block from sub-project A):

```gitignore

# Hosted-rowboat tenant state (holds the once-shown management key) — visible, but never committed
rowboat-tenant.*.json
```

- [ ] **Step 3: Smoke `provision:local` against the running local server (the test)**

Start the local rowboat harness, provision, assert the state file + printed databaseId, then re-provision to prove idempotency (same databaseId, no second subscriber):

```bash
cd /home/john/src/checklist
rm -f rowboat-tenant.local.json
bash scripts/dev-rowboat.sh > /tmp/prov-rowboat.log 2>&1 &
RB=$!
# wait for the server to route (401 on the guarded probe)
curl -s --retry 40 --retry-delay 1 --retry-connrefused -o /dev/null http://localhost:3020/console/v1/databases
npm run provision:local
DB1=$(node -e "console.log(require('./rowboat-tenant.local.json').databaseId)")
echo "DB1=$DB1"
npm run provision:local            # second run — must reuse the same tenant
DB2=$(node -e "console.log(require('./rowboat-tenant.local.json').databaseId)")
echo "DB2=$DB2"
node -e "const s=require('./rowboat-tenant.local.json'); if(!s.subscriberId||!s.managementKey||!s.databaseId||s.audience!==s.databaseId) throw new Error('bad state'); console.log('STATE ok')"
kill "$RB" 2>/dev/null || true; wait "$RB" 2>/dev/null || true
test "$DB1" = "$DB2" && echo "IDEMPOTENT ok"
```

Expected:
- `provision:local` prints a `provisioned tenant:` summary with a `db_…` `databaseId`.
- `DB1` = `DB2` (a `db_…` id) and `IDEMPOTENT ok` — the second run reconciled, did not mint a new tenant.
- `STATE ok` — the state file has subscriberId + managementKey + databaseId and `audience === databaseId`.

Then confirm the state file is gitignored:
```bash
git status --porcelain rowboat-tenant.local.json   # expect empty
rm -f rowboat-tenant.local.json
```

- [ ] **Step 4: Document in `docs/HOSTED_ROWBOAT.md`**

Add a "Sub-project B — provisioning (landed)" subsection:
```markdown
### Sub-project B — tenant provisioning (landed)

Provisioning is shrink-wrapped in `@jbroll/rowboat-cli` (`provision-tenant` verb: create subscriber →
create database with `compileSchema(shared/schema)` → register the JWT issuer). CheckList consumes it:

- `npm run provision:local` — provisions the local `dev:rowboat` (:3020). Run once; **re-run after a
  `.rowboat-dev/` reset** — the tool detects the wiped tenant and re-bootstraps automatically.
- `npm run provision:prod` — provisions rowboat.rkroll.com (operator step; see the deploy runbook).

Outputs land in a gitignored `rowboat-tenant.<env>.json` (holds the once-shown `managementKey` +
`databaseId` + issuer). The printed `databaseId` / `issuer` / `audience` are what sub-project C wires
into the app's env. The issuer contract: `audience = databaseId`, `jwksUrl`/`issuer` = CheckList's
`/api/auth` — C makes BetterAuth's JWTs conform.
```

- [ ] **Step 5: Commit the CheckList changes**

```bash
cd /home/john/src/checklist
git add package.json .gitignore docs/HOSTED_ROWBOAT.md
git commit -m "feat(provision): provision:local/prod scripts consuming the rowboat provision-tenant tool"
```
Expected: the org-hooks gate passes.

---

## Landing

- **rowboat (Tasks 1–3 + the runbook doc):** landed in Task 3 Step 8 via `scripts/land.sh wt2` (before Task 4).
- **CheckList (Task 4):** merge `hosted-rowboat-subproject-b` → `main` and push.

## Self-review notes

- **Spec coverage:** the two API gaps → Task 1 (`createSubscriber`, `setAuthIssuer`); the idempotent orchestrator + state file + stale-rebootstrap → Task 2; the `provision-tenant` verb (the "shrink-wrapped tool" surface) → Task 3; CheckList consuming it with schema + per-env config, gitignored visible output, docs → Task 4. Issuer contract (`aud=databaseId`, `jwksUrl`/`iss` = CheckList auth base) is realized in the orchestrator + the Task 4 script flags.
- **Deviation from the spec (deliberate):** the spec said "add `@jbroll/rowboat-cli` as a devDep." Task 4 instead runs the CLI **by path via `tsx`** against the sibling `../rowboat` checkout — identical to sub-project A's `dev:rowboat` harness, needs no dep, and keeps CheckList as pure config. The entrypoint-guard fix (Task 3 Step 4) is what makes by-path invocation reliable. Net effect matches the spec's intent (consume the shrink-wrapped tool, schema-only input).
- **Type consistency:** `ControlPlaneHttpError.status`, `SubscriberResult`, `AuthIssuerConfig`, `TenantState`, `ProvisionTenantConfig`/`Deps`, `StateStore`, and the `setAuthIssuer(databaseId, config)` / `createSubscriber(baseUrl, input, fetchFn?)` signatures are defined in Tasks 1–2 and used verbatim in Tasks 2–4.
- **Test hygiene:** unit tests use fetch/dep fakes (repo convention); the only live check is Task 4's local smoke, which also proves idempotency (DB1==DB2, no second subscriber) — a real behavior assertion, not a mock echo.
- **Not covered (correctly out of scope, per spec non-goals):** no kjekit, no auto-provision on dev boot, no client repoint / JWT minting (C), no key rotation.
