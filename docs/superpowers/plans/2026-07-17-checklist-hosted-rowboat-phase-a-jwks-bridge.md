# Phase A — JWKS Data-Plane Auth Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosted rowboat resolve a data-plane request's `author` from a short-lived, asymmetric-signed per-user JWT (minted by CheckList's BetterAuth, verified against the tenant's JWKS) instead of the spoofable `x-author` header stub.

**Architecture:** CheckList's BetterAuth gains the `jwt` plugin (EdDSA/Ed25519, `sub = user.id`, `GET /api/auth/token` + `GET /api/auth/jwks`). Each rowboat `database` row stores its tenant's expected `{ jwksUrl, issuer, audience }` in the control plane. A new `createJwtResolveAuthor()` verifier (in `packages/server`, using `jose`) plugs into the existing `resolveAuthor` seam: it reads `database_id` from the request, looks up that tenant's issuer config, verifies the Bearer JWT's signature/`iss`/`aud`/`exp` against the tenant JWKS, and returns `sub`. The `resolveAuthor` seam is widened to receive a `{ controlPlane }` context so the verifier can do the per-request lookup. The old synthetic stub stays reachable behind a `ROWBOAT_AUTH_MODE` switch (default `synthetic`) so existing suites stay green; flipping the hosted default to `jwt` is the production cutover (out of scope — see Non-goals).

**Tech Stack:** TypeScript (ESM), Express 5, better-sqlite3, better-auth 1.6.x (`jwt` plugin), `jose` 6.x, Vitest 4, supertest.

## Global Constraints

- **All work lands in a git worktree off `/home/john/src/rowboat`** (decision: new worktree). Create it with the `superpowers:using-git-worktrees` skill before Task 1. No changes to the CheckList repo in this plan.
- **Proof boundary = rowboat-side bridge proof.** Do NOT repoint CheckList's client sync URL, register CheckList's schema via the management API, or drive a browser. The deliverable is: a real CheckList-BetterAuth-minted JWT authenticates a rowboat data-plane request, verified by an integration test.
- **Issuer config lives in the control plane, per database** — `{ jwksUrl, issuer, audience }` on the `database` row; the verifier looks it up by `database_id` at request time. Authz claims are NOT in the token (Phase B).
- **Asymmetric keys only.** Rowboat only ever holds CheckList's *public* keys (EdDSA/Ed25519, better-auth's default). Never an HMAC/shared secret for user identity.
- **`author` resolution returns `string | null`** — `null` ⇒ router responds 401. Every verification failure path returns `null`, never throws out of the seam.
- Package manager: `npm`. Each rowboat package runs its own `npm run test:run` (Vitest). `type: "module"` everywhere — use `.js` import specifiers for local files.
- Existing `resolveAuthor` implementations that take only `(req)` must keep compiling — a 1-arg function stays assignable to the widened 2-arg seam type (TS allows fewer parameters).

---

### Task 1: Control-plane per-database issuer config (storage)

**Files:**
- Modify: `packages/control-plane/src/schema.ts` (after line 75, the `manifest` ALTER block)
- Modify: `packages/control-plane/src/control-plane.ts` (`DatabaseRow` interface ~L14-24; add methods after `setManifest` ~L244)
- Test: `packages/control-plane/src/__tests__/auth-issuer.test.ts` (new)

**Interfaces:**
- Consumes: existing `ControlPlane` class, `ControlPlaneError`, `initControlPlaneSchema`.
- Produces (relied on by Tasks 2, 4, 7):
  ```ts
  export interface DatabaseAuthConfig {
    jwksUrl: string;
    issuer: string;
    audience: string;
  }
  // on class ControlPlane:
  getDatabaseAuthConfig(databaseId: string): DatabaseAuthConfig | null;
  setDatabaseAuthConfig(databaseId: string, config: DatabaseAuthConfig): void; // throws ControlPlaneError(404) on unknown id
  ```
  `DatabaseRow` gains `jwks_url: string | null; jwt_issuer: string | null; jwt_audience: string | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/control-plane/src/__tests__/auth-issuer.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ControlPlane, ControlPlaneError } from "../control-plane.js";

const MANIFEST = [
  { name: "records", columns: [{ name: "val", type: "text" as const, isOptional: false }] },
];

let dir: string;
let cp: ControlPlane;
let databaseId: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cp-auth-issuer-"));
  cp = new ControlPlane({
    cpDbPath: join(dir, "cp.db"),
    dbDir: join(dir, "dbs"),
    defaultLimits: { maxDatabases: -1, maxStorageBytes: -1 },
  });
  const sub = cp.createSubscriber({ name: "acme" });
  databaseId = cp.createDatabase({
    subscriberId: sub.subscriberId,
    name: "prod",
    schemaManifest: MANIFEST,
  }).databaseId;
});

afterEach(() => {
  cp.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("ControlPlane per-database auth-issuer config", () => {
  it("returns null before any config is set", () => {
    expect(cp.getDatabaseAuthConfig(databaseId)).toBeNull();
  });

  it("round-trips a set config", () => {
    const config = {
      jwksUrl: "https://checklist.example/api/auth/jwks",
      issuer: "https://checklist.example",
      audience: databaseId,
    };
    cp.setDatabaseAuthConfig(databaseId, config);
    expect(cp.getDatabaseAuthConfig(databaseId)).toEqual(config);
  });

  it("setDatabaseAuthConfig on an unknown database throws ControlPlaneError(404)", () => {
    expect(() =>
      cp.setDatabaseAuthConfig("db_missing", {
        jwksUrl: "https://x/jwks",
        issuer: "https://x",
        audience: "db_missing",
      }),
    ).toThrow(ControlPlaneError);
  });

  it("survives a control-plane reopen (persisted, idempotent schema)", () => {
    cp.setDatabaseAuthConfig(databaseId, {
      jwksUrl: "https://x/jwks",
      issuer: "https://x",
      audience: databaseId,
    });
    cp.close();
    cp = new ControlPlane({
      cpDbPath: join(dir, "cp.db"),
      dbDir: join(dir, "dbs"),
      defaultLimits: { maxDatabases: -1, maxStorageBytes: -1 },
    });
    expect(cp.getDatabaseAuthConfig(databaseId)?.issuer).toBe("https://x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/control-plane && npm run test:run -- auth-issuer`
Expected: FAIL — `cp.getDatabaseAuthConfig is not a function`.

- [ ] **Step 3: Add the columns to the schema**

In `packages/control-plane/src/schema.ts`, immediately after the `manifest` ALTER block (after line 75, before the M4b subscriber block), add:

```ts
  // Phase A: per-database JWT issuer config for the data-plane JWKS auth bridge. Nullable — a
  // database created before this column existed, or one not yet registered with an issuer, has no
  // config and the router's JWT verifier returns null (401) for it. `dbCols` is the same
  // table_info(database) snapshot taken above for residency/manifest.
  if (!dbCols.some((c) => c.name === "jwks_url")) {
    db.exec("ALTER TABLE database ADD COLUMN jwks_url TEXT");
  }
  if (!dbCols.some((c) => c.name === "jwt_issuer")) {
    db.exec("ALTER TABLE database ADD COLUMN jwt_issuer TEXT");
  }
  if (!dbCols.some((c) => c.name === "jwt_audience")) {
    db.exec("ALTER TABLE database ADD COLUMN jwt_audience TEXT");
  }
```

- [ ] **Step 4: Extend `DatabaseRow` and add the accessor methods**

In `packages/control-plane/src/control-plane.ts`, add three fields to the `DatabaseRow` interface (after `manifest: string | null;`, before `created_at`):

```ts
  jwks_url: string | null;
  jwt_issuer: string | null;
  jwt_audience: string | null;
```

Add the exported config type just above the `DatabaseRow` interface:

```ts
export interface DatabaseAuthConfig {
  jwksUrl: string;
  issuer: string;
  audience: string;
}
```

Add these two methods to the `ControlPlane` class, immediately after `setManifest` (after line 244):

```ts
  // Phase A: the per-database JWT issuer config the data-plane verifier checks a Bearer token
  // against. Returns null unless ALL THREE columns are present — a partially-configured row is
  // treated as unconfigured (fail closed), never a half-verified token.
  getDatabaseAuthConfig(databaseId: string): DatabaseAuthConfig | null {
    const row = this.getDatabase(databaseId);
    if (!row || row.jwks_url == null || row.jwt_issuer == null || row.jwt_audience == null) {
      return null;
    }
    return { jwksUrl: row.jwks_url, issuer: row.jwt_issuer, audience: row.jwt_audience };
  }

  setDatabaseAuthConfig(databaseId: string, config: DatabaseAuthConfig): void {
    const info = this.db
      .prepare(
        "UPDATE database SET jwks_url = ?, jwt_issuer = ?, jwt_audience = ? WHERE database_id = ?",
      )
      .run(config.jwksUrl, config.issuer, config.audience, databaseId);
    if (info.changes === 0) throw new ControlPlaneError(404, `unknown database ${databaseId}`);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/control-plane && npm run test:run -- auth-issuer`
Expected: PASS (4 tests). Then run the whole package to catch `DatabaseRow` fallout: `npm run test:run`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/schema.ts packages/control-plane/src/control-plane.ts packages/control-plane/src/__tests__/auth-issuer.test.ts
git commit -m "feat(control-plane): per-database JWT issuer config storage"
```

---

### Task 2: Management route to register a database's issuer config

**Files:**
- Modify: `packages/control-plane/src/routes.ts` (add a route inside `mountControlPlaneRoutes`, after the `POST /v1/databases/:id/schema` block ~L275)
- Test: `packages/control-plane/src/__tests__/auth-issuer-route.test.ts` (new)

**Interfaces:**
- Consumes: `ControlPlane.getDatabaseAuthConfig` / `setDatabaseAuthConfig` (Task 1), the existing `requireManagementKey` auth middleware, `requireOwnedDatabase`, `sendControlPlaneError`.
- Produces: `PUT /v1/databases/:id/auth-issuer` — management-key-gated, ownership-scoped. Body `{ jwksUrl: string; issuer: string; audience: string }` (all required, non-empty strings). 200 `{ ok: true }`; 400 on a missing/blank field; 401 without a valid key; 404 for an unknown/other-tenant id.

- [ ] **Step 1: Write the failing test**

Create `packages/control-plane/src/__tests__/auth-issuer-route.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ControlPlane } from "../control-plane.js";
import { mountControlPlaneRoutes } from "../routes.js";

const MANIFEST = [
  { name: "records", columns: [{ name: "val", type: "text" as const, isOptional: false }] },
];

let dir: string;
let cp: ControlPlane;
let app: Express;
let key: string;
let databaseId: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cp-auth-route-"));
  cp = new ControlPlane({
    cpDbPath: join(dir, "cp.db"),
    dbDir: join(dir, "dbs"),
    defaultLimits: { maxDatabases: -1, maxStorageBytes: -1 },
  });
  app = express();
  app.use(express.json());
  mountControlPlaneRoutes(app, cp);
  const sub = await request(app).post("/v1/subscribers").send({ name: "acme" });
  key = sub.body.managementKey as string;
  const db = await request(app)
    .post("/v1/databases")
    .set("Authorization", `Bearer ${key}`)
    .send({ name: "prod", schemaManifest: MANIFEST });
  databaseId = db.body.databaseId as string;
});

afterEach(() => {
  cp.close();
  rmSync(dir, { recursive: true, force: true });
});

const body = {
  jwksUrl: "https://checklist.example/api/auth/jwks",
  issuer: "https://checklist.example",
  audience: "AUD",
};

describe("PUT /v1/databases/:id/auth-issuer", () => {
  it("registers issuer config with a valid key", async () => {
    const res = await request(app)
      .put(`/v1/databases/${databaseId}/auth-issuer`)
      .set("Authorization", `Bearer ${key}`)
      .send({ ...body, audience: databaseId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(cp.getDatabaseAuthConfig(databaseId)).toEqual({ ...body, audience: databaseId });
  });

  it("401 without a management key", async () => {
    const res = await request(app).put(`/v1/databases/${databaseId}/auth-issuer`).send(body);
    expect(res.status).toBe(401);
  });

  it("400 when a field is missing or blank", async () => {
    const res = await request(app)
      .put(`/v1/databases/${databaseId}/auth-issuer`)
      .set("Authorization", `Bearer ${key}`)
      .send({ jwksUrl: "https://x/jwks", issuer: "", audience: databaseId });
    expect(res.status).toBe(400);
  });

  it("404 for an unknown database", async () => {
    const res = await request(app)
      .put(`/v1/databases/db_missing/auth-issuer`)
      .set("Authorization", `Bearer ${key}`)
      .send(body);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/control-plane && npm run test:run -- auth-issuer-route`
Expected: FAIL — `PUT` returns 404 (route not mounted) where 200/400 expected.

- [ ] **Step 3: Add the route**

In `packages/control-plane/src/routes.ts`, inside `mountControlPlaneRoutes`, after the `POST /v1/databases/:id/schema` handler closes (after line 275) and before `app.delete("/v1/databases/:id", ...)`, add:

```ts
  app.put("/v1/databases/:id/auth-issuer", auth, (req: Request, res: Response) => {
    const { subscriberId } = res.locals as ControlPlaneLocals;
    const databaseId = String(req.params.id);
    if (!requireOwnedDatabase(cp, subscriberId, databaseId, res)) return;
    const body = req.body as { jwksUrl?: unknown; issuer?: unknown; audience?: unknown };
    const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
    if (
      !isNonEmptyString(body.jwksUrl) ||
      !isNonEmptyString(body.issuer) ||
      !isNonEmptyString(body.audience)
    ) {
      res.status(400).json({ error: "jwksUrl, issuer, and audience are required non-empty strings" });
      return;
    }
    try {
      cp.setDatabaseAuthConfig(databaseId, {
        jwksUrl: body.jwksUrl,
        issuer: body.issuer,
        audience: body.audience,
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      sendControlPlaneError(res, e);
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/control-plane && npm run test:run -- auth-issuer-route`
Expected: PASS (4 tests). Then `npm run test:run`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/routes.ts packages/control-plane/src/__tests__/auth-issuer-route.test.ts
git commit -m "feat(control-plane): PUT /v1/databases/:id/auth-issuer management route"
```

---

### Task 3: Widen the `resolveAuthor` seam with a `{ controlPlane }` context

**Files:**
- Modify: `packages/router/src/router.ts` (`RouterOpts.resolveAuthor` type ~L15; add `ResolveAuthorContext` interface; call site ~L139)
- Modify: `packages/server/src/assembly.ts` (`ServerConfig.resolveAuthor` type ~L110; import `ResolveAuthorContext`)
- Test: `packages/router/src/__tests__/resolve-author-context.test.ts` (new)

**Interfaces:**
- Consumes: existing `RouterOpts`, `createRouter`, `ControlPlane`.
- Produces (relied on by Tasks 4, 5, 7):
  ```ts
  // exported from @jbroll/rowboat-router
  export interface ResolveAuthorContext {
    controlPlane: ControlPlane;
  }
  // seam type (router + server):
  resolveAuthor: (
    req: Request,
    ctx: ResolveAuthorContext,
  ) => string | null | Promise<string | null>;
  ```
  The router invokes `opts.resolveAuthor(req, { controlPlane: opts.controlPlane })`.

- [ ] **Step 1: Write the failing test**

Create `packages/router/src/__tests__/resolve-author-context.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlane } from "@jbroll/rowboat-control-plane";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolveAuthorContext } from "../router.js";
import { createRouter } from "../router.js";

const MANIFEST = [
  { name: "records", columns: [{ name: "val", type: "text" as const, isOptional: false }] },
];

let dir: string;
let cp: ControlPlane;
let databaseId: string;
let routerServer: http.Server;
let routerPort: number;
let captured: ResolveAuthorContext | null;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "router-ctx-"));
  cp = new ControlPlane({
    cpDbPath: join(dir, "cp.db"),
    dbDir: join(dir, "dbs"),
    defaultLimits: { maxDatabases: -1, maxStorageBytes: -1 },
  });
  const sub = cp.createSubscriber({ name: "acme" });
  databaseId = cp.createDatabase({
    subscriberId: sub.subscriberId,
    name: "prod",
    schemaManifest: MANIFEST,
  }).databaseId;

  captured = null;
  const app = createRouter({
    controlPlane: cp,
    // Records the context it was handed, then rejects (null → 401) so no worker proxy is needed.
    resolveAuthor: (_req, ctx) => {
      captured = ctx;
      return null;
    },
    workers: [{ id: "w1", baseUrl: "http://127.0.0.1:1" }],
    routerSecret: "s",
  });
  routerServer = http.createServer(app);
  await new Promise<void>((resolve) => routerServer.listen(0, "127.0.0.1", resolve));
  routerPort = (routerServer.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>((resolve) => routerServer.close(() => resolve()));
  cp.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveAuthor context", () => {
  it("is invoked with the router's controlPlane", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: routerPort,
          path: `/db/${databaseId}/api/sync/pull`,
          method: "POST",
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(401);
    expect(captured).not.toBeNull();
    expect(captured?.controlPlane).toBe(cp);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/router && npm run test:run -- resolve-author-context`
Expected: FAIL — TypeScript error: `ResolveAuthorContext` is not exported / `resolveAuthor` callback typed with 1 param, `ctx` is `any` and `captured?.controlPlane` never set.

- [ ] **Step 3: Widen the router seam**

In `packages/router/src/router.ts`:

Add the context interface just above `export interface RouterOpts` (after the imports, ~L12):

```ts
// Context handed to resolveAuthor so a verifier can do per-request, per-database lookups (e.g. the
// JWT bridge reads the tenant's issuer config from the control plane keyed by database_id). The
// synthetic/header stubs simply ignore it — a 1-arg (req)=>... stays assignable to this type.
export interface ResolveAuthorContext {
  controlPlane: ControlPlane;
}
```

Change the `resolveAuthor` field type (line 15) from:

```ts
  resolveAuthor: (req: Request) => string | null | Promise<string | null>;
```

to:

```ts
  resolveAuthor: (
    req: Request,
    ctx: ResolveAuthorContext,
  ) => string | null | Promise<string | null>;
```

Change the call site (line 139) from:

```ts
      const author = await opts.resolveAuthor(req);
```

to:

```ts
      const author = await opts.resolveAuthor(req, { controlPlane: opts.controlPlane });
```

- [ ] **Step 4: Widen the server seam to match**

In `packages/server/src/assembly.ts`, add `ResolveAuthorContext` to the router import (line 35):

```ts
import { createRouter, type ResolveAuthorContext, ResidencyCache } from "@jbroll/rowboat-router";
```

Change `ServerConfig.resolveAuthor` (line 110) from:

```ts
  resolveAuthor: (req: Request) => string | null | Promise<string | null>;
```

to:

```ts
  resolveAuthor: (
    req: Request,
    ctx: ResolveAuthorContext,
  ) => string | null | Promise<string | null>;
```

(The pass-through at line 380, `resolveAuthor: config.resolveAuthor`, is unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/router && npm run test:run`
Expected: PASS — the new test plus the existing `router.test.ts` (whose `resolveAuthor: (req) => req.header("x-author") ?? null` stays valid as a 1-arg function).
Run: `cd packages/server && npm run test:run`
Expected: PASS (type-checks against the widened seam; `resolveAuthorSynthetic` still assignable).

- [ ] **Step 6: Commit**

```bash
git add packages/router/src/router.ts packages/server/src/assembly.ts packages/router/src/__tests__/resolve-author-context.test.ts
git commit -m "feat(router): pass a { controlPlane } context to the resolveAuthor seam"
```

---

### Task 4: JWT verifier — `createJwtResolveAuthor` (jose + control-plane lookup)

**Files:**
- Modify: `packages/server/package.json` (add `"jose"` to `dependencies`)
- Create: `packages/server/src/jwt-author.ts`
- Test: `packages/server/src/__tests__/jwt-author.test.ts` (new)

**Interfaces:**
- Consumes: `ResolveAuthorContext` (Task 3), `ControlPlane.getDatabaseAuthConfig` / `DatabaseAuthConfig` (Task 1), `jose` (`createRemoteJWKSet`, `jwtVerify`).
- Produces (relied on by Tasks 5, 7):
  ```ts
  export interface JwtAuthorOptions {
    clockToleranceSec?: number; // default 30
  }
  export function createJwtResolveAuthor(
    opts?: JwtAuthorOptions,
  ): (req: Request, ctx: ResolveAuthorContext) => Promise<string | null>;
  ```
  Verifies the Bearer token against the tenant's JWKS (by `database_id`); returns `sub` on success, `null` on any failure. Caches one `createRemoteJWKSet` per distinct `jwksUrl`.

- [ ] **Step 1: Add the `jose` dependency**

In `packages/server/package.json`, add to `dependencies` (alphabetical, after `express`):

```json
    "jose": "^6.2.3",
```

Run: `cd packages/server && npm install`
Expected: installs `jose` (already present transitively at 6.2.3), lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `packages/server/src/__tests__/jwt-author.test.ts`:

```ts
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request } from "express";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  type JWK,
  SignJWT,
} from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseAuthConfig } from "@jbroll/rowboat-control-plane";
import type { ResolveAuthorContext } from "@jbroll/rowboat-router";
import { createJwtResolveAuthor } from "../jwt-author.js";

const DB_ID = "db_test";
const ISSUER = "https://checklist.example";

let privateKey: CryptoKey;
let publicJwk: JWK;
let kid: string;
let jwksServer: http.Server;
let jwksUrl: string;

// A control-plane stand-in exposing only the method the verifier calls.
function ctxFor(config: DatabaseAuthConfig | null): ResolveAuthorContext {
  return {
    controlPlane: {
      getDatabaseAuthConfig: (id: string) => (id === DB_ID ? config : null),
    },
  } as unknown as ResolveAuthorContext;
}

function reqWith(authHeader: string | undefined, databaseId = DB_ID): Request {
  return {
    params: { database_id: databaseId },
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? authHeader : undefined,
  } as unknown as Request;
}

async function mint(claims: {
  sub?: string;
  iss?: string;
  aud?: string;
  expiresIn?: string;
}): Promise<string> {
  const b = new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setIssuedAt()
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? DB_ID)
    .setExpirationTime(claims.expiresIn ?? "5m");
  if (claims.sub !== undefined) b.setSubject(claims.sub);
  return b.sign(privateKey);
}

beforeEach(async () => {
  const kp = await generateKeyPair("EdDSA", { extractable: true });
  privateKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.alg = "EdDSA";
  kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;

  jwksServer = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

describe("createJwtResolveAuthor", () => {
  const config = () => ({ jwksUrl, issuer: ISSUER, audience: DB_ID });

  it("returns sub for a valid token", async () => {
    const resolve = createJwtResolveAuthor();
    const token = await mint({ sub: "user_42" });
    await expect(resolve(reqWith(`Bearer ${token}`), ctxFor(config()))).resolves.toBe("user_42");
  });

  it("returns null when there is no issuer config for the database", async () => {
    const resolve = createJwtResolveAuthor();
    const token = await mint({ sub: "user_42" });
    await expect(resolve(reqWith(`Bearer ${token}`), ctxFor(null))).resolves.toBeNull();
  });

  it("returns null with no Authorization header", async () => {
    const resolve = createJwtResolveAuthor();
    await expect(resolve(reqWith(undefined), ctxFor(config()))).resolves.toBeNull();
  });

  it("returns null for a wrong audience", async () => {
    const resolve = createJwtResolveAuthor();
    const token = await mint({ sub: "user_42", aud: "db_other" });
    await expect(resolve(reqWith(`Bearer ${token}`), ctxFor(config()))).resolves.toBeNull();
  });

  it("returns null for a wrong issuer", async () => {
    const resolve = createJwtResolveAuthor();
    const token = await mint({ sub: "user_42", iss: "https://evil.example" });
    await expect(resolve(reqWith(`Bearer ${token}`), ctxFor(config()))).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const resolve = createJwtResolveAuthor({ clockToleranceSec: 0 });
    const token = await mint({ sub: "user_42", expiresIn: "-1m" });
    await expect(resolve(reqWith(`Bearer ${token}`), ctxFor(config()))).resolves.toBeNull();
  });

  it("returns null for a token with no subject", async () => {
    const resolve = createJwtResolveAuthor();
    const token = await mint({});
    await expect(resolve(reqWith(`Bearer ${token}`), ctxFor(config()))).resolves.toBeNull();
  });

  it("returns null for a tampered signature", async () => {
    const resolve = createJwtResolveAuthor();
    const token = await mint({ sub: "user_42" });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${"a".repeat(parts[2].length)}`;
    await expect(resolve(reqWith(`Bearer ${tampered}`), ctxFor(config()))).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/server && npm run test:run -- jwt-author`
Expected: FAIL — cannot find module `../jwt-author.js`.

- [ ] **Step 4: Implement the verifier**

Create `packages/server/src/jwt-author.ts`:

```ts
import type { ResolveAuthorContext } from "@jbroll/rowboat-router";
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface JwtAuthorOptions {
  // Leeway (seconds) applied to exp/nbf checks to absorb small clock skew between the issuer
  // (CheckList) and rowboat. Default 30.
  clockToleranceSec?: number;
}

// Builds a resolveAuthor that verifies a Bearer JWT against the request's tenant JWKS. The tenant
// is the database_id in the URL; its expected { jwksUrl, issuer, audience } come from the control
// plane (Phase A: rowboat holds only CheckList's PUBLIC keys, never a signing secret). Returns the
// verified `sub` (the CheckList user.id) or null on ANY failure — no issuer config, no/blank token,
// bad signature, wrong iss/aud, expired, or missing sub. Never throws out of the seam (router maps
// null → 401).
export function createJwtResolveAuthor(
  opts: JwtAuthorOptions = {},
): (req: Request, ctx: ResolveAuthorContext) => Promise<string | null> {
  // One JWKS set per distinct URL. createRemoteJWKSet caches keys, coalesces concurrent fetches,
  // rate-limits refetches, and re-fetches on an unknown kid — so key rotation is picked up without
  // us managing a TTL. Keyed by URL so multiple tenants/issuers each get their own set.
  const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
  const clockTolerance = opts.clockToleranceSec ?? 30;

  return async (req, ctx) => {
    const databaseId = String(req.params.database_id ?? "");
    if (!databaseId) return null;

    const config = ctx.controlPlane.getDatabaseAuthConfig(databaseId);
    if (!config) return null;

    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) return null;

    let jwks = jwksByUrl.get(config.jwksUrl);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(config.jwksUrl));
      jwksByUrl.set(config.jwksUrl, jwks);
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        clockTolerance,
      });
      return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
    } catch {
      // Any verification failure (signature, iss/aud, exp, malformed, JWKS fetch error) is an
      // unauthenticated request, not a server error.
      return null;
    }
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npm run test:run -- jwt-author`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/package-lock.json packages/server/src/jwt-author.ts packages/server/src/__tests__/jwt-author.test.ts
git commit -m "feat(server): createJwtResolveAuthor — JWKS Bearer-token verifier for the data plane"
```

(If `npm install` updated the repo-root lockfile instead of a package-local one, add that path instead.)

---

### Task 5: Wire `ROWBOAT_AUTH_MODE` into `configFromEnv`

**Files:**
- Modify: `packages/server/src/main.ts` (import `createJwtResolveAuthor`; select the resolver in `configFromEnv` ~L143)
- Test: `packages/server/src/__tests__/auth-mode.test.ts` (new)

**Interfaces:**
- Consumes: `createJwtResolveAuthor` (Task 4), existing `configFromEnv`, `resolveAuthorSynthetic`, `optionalInt`.
- Produces: `configFromEnv` reads `ROWBOAT_AUTH_MODE` (`"synthetic"` default | `"jwt"`); `"jwt"` selects `createJwtResolveAuthor({ clockToleranceSec: JWT_CLOCK_TOLERANCE_SEC })`; an unrecognized value throws. The returned `ServerConfig.resolveAuthor` reflects the choice.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/auth-mode.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request } from "express";
import type { ResolveAuthorContext } from "@jbroll/rowboat-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configFromEnv } from "../main.js";

let dir: string;

function baseEnv(): Record<string, string> {
  return {
    ROWBOAT_ROOT: dir,
    ROUTER_PORT: "0",
    ROUTER_SECRET: "router-secret",
    AUTH_SECRET: "auth-secret-auth-secret-auth-secret",
    AUTH_BASE_URL: "http://localhost:3001/api/auth",
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auth-mode-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("ROWBOAT_AUTH_MODE", () => {
  it("defaults to the synthetic x-author resolver", () => {
    const cfg = configFromEnv(baseEnv());
    const req = { header: (n: string) => (n === "x-author" ? "user_syn" : undefined) } as Request;
    expect(cfg.resolveAuthor(req, {} as ResolveAuthorContext)).toBe("user_syn");
  });

  it("selects the JWT resolver when ROWBOAT_AUTH_MODE=jwt", async () => {
    const cfg = configFromEnv({ ...baseEnv(), ROWBOAT_AUTH_MODE: "jwt" });
    // The JWT resolver returns a Promise and yields null with no issuer config / no token.
    const req = {
      params: { database_id: "db_x" },
      header: () => undefined,
    } as unknown as Request;
    const ctx = {
      controlPlane: { getDatabaseAuthConfig: () => null },
    } as unknown as ResolveAuthorContext;
    await expect(Promise.resolve(cfg.resolveAuthor(req, ctx))).resolves.toBeNull();
  });

  it("throws on an unrecognized mode", () => {
    expect(() => configFromEnv({ ...baseEnv(), ROWBOAT_AUTH_MODE: "bogus" })).toThrow(
      /ROWBOAT_AUTH_MODE/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npm run test:run -- auth-mode`
Expected: FAIL — the `jwt` case returns the synthetic result / the bogus case does not throw.

- [ ] **Step 3: Implement the mode switch**

In `packages/server/src/main.ts`, add the import (after line 12's `./assembly.js` import):

```ts
import { createJwtResolveAuthor } from "./jwt-author.js";
```

Inside `configFromEnv`, after the `enforcementIntervalMs` line (line 134) and before the `return {` (line 136), add:

```ts
  // Data-plane author resolution mode. Default "synthetic" keeps the x-author dogfood stub (and all
  // existing suites) unchanged; "jwt" selects the JWKS Bearer-token bridge. An unknown value is a
  // deploy misconfig — fail loudly, never silently fall back to a stub in a "jwt"-intended deploy.
  const authMode = env.ROWBOAT_AUTH_MODE ?? "synthetic";
  let resolveAuthor: ServerConfig["resolveAuthor"];
  if (authMode === "jwt") {
    resolveAuthor = createJwtResolveAuthor({
      clockToleranceSec: optionalInt(env.JWT_CLOCK_TOLERANCE_SEC, "JWT_CLOCK_TOLERANCE_SEC"),
    });
  } else if (authMode === "synthetic") {
    resolveAuthor = resolveAuthorSynthetic;
  } else {
    throw new Error(
      `rowboat-server: ROWBOAT_AUTH_MODE must be "jwt" or "synthetic", got ${authMode}`,
    );
  }
```

Then change the config object's `resolveAuthor` field (line 143) from:

```ts
    resolveAuthor: resolveAuthorSynthetic,
```

to:

```ts
    resolveAuthor,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npm run test:run -- auth-mode`
Expected: PASS (3 tests). Then `npm run test:run`.
Expected: PASS (existing `configFromEnv` / assembly tests unaffected — default stays synthetic).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/main.ts packages/server/src/__tests__/auth-mode.test.ts
git commit -m "feat(server): ROWBOAT_AUTH_MODE selects synthetic (default) or jwt author resolution"
```

---

### Task 6: Enable the better-auth `jwt` plugin in `buildAuth`

**Files:**
- Modify: `packages/auth-betterauth/src/auth-instance.ts` (import `jwt`; add `jwt` to `BuildAuthOptions`; conditionally push the plugin ~L98)
- Test: `packages/auth-betterauth/src/__tests__/jwt-plugin.test.ts` (new)

**Interfaces:**
- Consumes: existing `buildAuth` / `BuildAuthOptions`, `betterAuth`, `jwt` from `better-auth/plugins`. `CreateIdentityOptions extends BuildAuthOptions` (so the new field flows through `createIdentity` for Task 7 with no extra wiring).
- Produces (relied on by Task 7):
  ```ts
  // added to BuildAuthOptions:
  jwt?: {
    issuer: string;
    audience: string | string[];
    expirationTime?: string; // default "15m"
  };
  ```
  When set, the built auth serves `GET /api/auth/jwks` and mints `GET /api/auth/token` (`{ token }`, `sub = user.id`, EdDSA/Ed25519, the configured `iss`/`aud`). `migrate()` creates the plugin's `jwks` table.

- [ ] **Step 1: Write the failing test**

Create `packages/auth-betterauth/src/__tests__/jwt-plugin.test.ts`:

```ts
import { registerAuthTables } from "@jbroll/rowboat-auth";
import Database from "better-sqlite3";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { buildAuth } from "../auth-instance.js";

async function setup() {
  const db = new Database(":memory:");
  registerAuthTables(db);
  const { auth, migrate } = buildAuth({
    db,
    authSecret: "test-secret-test-secret-test-secret",
    baseUrl: "http://localhost/api/auth",
    emailAuth: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    jwt: { issuer: "http://localhost", audience: "db_checklist_prod" },
  });
  await migrate();

  await auth.api.signUpEmail({
    body: { name: "Ada", email: "a@x.com", password: "correct-horse-battery" },
  });
  const signIn = await auth.api.signInEmail({
    body: { email: "a@x.com", password: "correct-horse-battery" },
    asResponse: true,
  });
  const cookie = signIn.headers.getSetCookie().join("; ");
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) throw new Error("no session");
  return { auth, cookie, userId: session.user.id };
}

describe("buildAuth jwt plugin", () => {
  it("serves a non-empty JWKS", async () => {
    const { auth } = await setup();
    const jwks = (await auth.api.getJwks()) as { keys: unknown[] };
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
  });

  it("mints a token with sub=user.id and the configured iss/aud", async () => {
    const { auth, cookie, userId } = await setup();
    const { token } = await auth.api.getToken({ headers: new Headers({ cookie }) });
    const claims = decodeJwt(token);
    expect(claims.sub).toBe(userId);
    expect(claims.iss).toBe("http://localhost");
    expect(claims.aud).toBe("db_checklist_prod");
    expect(typeof claims.exp).toBe("number");
  });

  it("omits the plugin when jwt is not configured (getJwks throws / no token endpoint)", async () => {
    const db = new Database(":memory:");
    registerAuthTables(db);
    const { auth, migrate } = buildAuth({
      db,
      authSecret: "test-secret-test-secret-test-secret",
      baseUrl: "http://localhost/api/auth",
      emailAuth: {
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
      },
    });
    await migrate();
    expect((auth.api as Record<string, unknown>).getJwks).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/auth-betterauth && npm run test:run -- jwt-plugin`
Expected: FAIL — `auth.api.getJwks` / `auth.api.getToken` undefined (plugin not enabled); type error on the unknown `jwt` option.

- [ ] **Step 3: Enable the plugin**

In `packages/auth-betterauth/src/auth-instance.ts`, change the plugins import (line 4) from:

```ts
import { bearer } from "better-auth/plugins";
```

to:

```ts
import { bearer, jwt } from "better-auth/plugins";
```

Add the `jwt` field to `BuildAuthOptions` (after the `onUserCreate` field, before the closing `}` at line 80):

```ts
  // When set, enables the better-auth JWT plugin: mints short-lived per-user JWTs at
  // GET /api/auth/token (sub = user.id) and serves the PUBLIC JWKS at GET /api/auth/jwks for a
  // resource server (rowboat) to verify against. Keys are asymmetric EdDSA/Ed25519 (the plugin
  // default) — rowboat only ever holds the public half. Absent = no JWT plugin (unchanged).
  jwt?: {
    issuer: string;
    audience: string | string[];
    expirationTime?: string; // default "15m"
  };
```

In `buildAuth`, replace the inline `plugins: [bearer()],` (line 98) by building the array first. Just before `const authConfig: ... = {` (line 94), add:

```ts
  const plugins: NonNullable<Parameters<typeof betterAuth>[0]["plugins"]> = [bearer()];
  if (opts.jwt) {
    plugins.push(
      jwt({
        jwt: {
          issuer: opts.jwt.issuer,
          audience: opts.jwt.audience,
          expirationTime: opts.jwt.expirationTime ?? "15m",
        },
      }),
    );
  }
```

Then change the `authConfig` field (line 98) from:

```ts
    plugins: [bearer()],
```

to:

```ts
    plugins,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/auth-betterauth && npm run test:run -- jwt-plugin`
Expected: PASS (3 tests). Then `npm run test:run`.
Expected: PASS (existing auth tests unaffected — `jwt` is opt-in).

- [ ] **Step 5: Commit**

```bash
git add packages/auth-betterauth/src/auth-instance.ts packages/auth-betterauth/src/__tests__/jwt-plugin.test.ts
git commit -m "feat(auth-betterauth): opt-in better-auth jwt plugin (JWKS + per-user token)"
```

---

### Task 7: Integration bridge proof — real CheckList JWT authenticates a rowboat request

**Files:**
- Create: `packages/integration/src/jwt-bridge.test.ts`
- Modify: `packages/integration/package.json` if `jose` / `@jbroll/rowboat-server` / `@jbroll/rowboat-auth-betterauth` / `@jbroll/rowboat-router` are not already devDependencies (add the missing ones)

**Interfaces:**
- Consumes: `createIdentity` (`@jbroll/rowboat-auth-betterauth`) with the new `jwt` option (Task 6), `ControlPlane` + `setDatabaseAuthConfig` (Task 1), `createJwtResolveAuthor` (Task 4), `ResolveAuthorContext` (Task 3), `registerAuthTables` (`@jbroll/rowboat-auth`).
- Produces: a Vitest proof that a real better-auth-minted JWT + a real remote JWKS fetch + a real control-plane issuer lookup resolve `author = sub`, and that spoofed / absent / wrong-tenant tokens resolve to `null`.

- [ ] **Step 1: Ensure the integration package can import the pieces**

Check `packages/integration/package.json` `devDependencies`. Ensure these are present (add any missing, as `file:../<pkg>`, then `npm install`):
- `@jbroll/rowboat-auth`
- `@jbroll/rowboat-auth-betterauth`
- `@jbroll/rowboat-control-plane`
- `@jbroll/rowboat-router`
- `@jbroll/rowboat-server`
- `jose` (`^6.2.3`)

Run: `cd packages/integration && npm install`
Expected: no errors.

- [ ] **Step 2: Write the failing test**

Create `packages/integration/src/jwt-bridge.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerAuthTables } from "@jbroll/rowboat-auth";
import { createIdentity } from "@jbroll/rowboat-auth-betterauth";
import { ControlPlane } from "@jbroll/rowboat-control-plane";
import type { ResolveAuthorContext } from "@jbroll/rowboat-router";
import { createJwtResolveAuthor } from "@jbroll/rowboat-server/jwt-author";
import Database from "better-sqlite3";
import express from "express";
import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MANIFEST = [
  { name: "records", columns: [{ name: "val", type: "text" as const, isOptional: false }] },
];

let dir: string;
let cp: ControlPlane;
let databaseId: string;
let authServer: http.Server;
let authBaseUrl: string;
let jwksUrl: string;
let token: string;
let userId: string;

function reqWith(authHeader: string | undefined, dbId = databaseId): Request {
  return {
    params: { database_id: dbId },
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? authHeader : undefined,
  } as unknown as Request;
}

function ctx(): ResolveAuthorContext {
  return { controlPlane: cp } as unknown as ResolveAuthorContext;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "jwt-bridge-"));

  // Control plane + a database (the tenant).
  cp = new ControlPlane({
    cpDbPath: join(dir, "cp.db"),
    dbDir: join(dir, "dbs"),
    defaultLimits: { maxDatabases: -1, maxStorageBytes: -1 },
  });
  const sub = cp.createSubscriber({ name: "checklist" });
  databaseId = cp.createDatabase({
    subscriberId: sub.subscriberId,
    name: "prod",
    schemaManifest: MANIFEST,
  }).databaseId;

  // A real CheckList-style BetterAuth with the jwt plugin, served over HTTP so the verifier can
  // fetch its JWKS by URL. aud = the database_id (the tenant binding).
  const idb = new Database(join(dir, "identity.db"));
  registerAuthTables(idb);
  const app = express();
  const issuer = "http://checklist.local";
  const identity = createIdentity({
    db: idb,
    authSecret: "integration-secret-integration-secret",
    baseUrl: "http://placeholder/api/auth", // rewritten below once the port is known
    emailAuth: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    jwt: { issuer, audience: databaseId },
  });
  await identity.registerIdentityTables();
  identity.mountAuthRoutes(app);
  authServer = http.createServer(app);
  await new Promise<void>((resolve) => authServer.listen(0, "127.0.0.1", resolve));
  const port = (authServer.address() as AddressInfo).port;
  authBaseUrl = `http://127.0.0.1:${port}/api/auth`;
  jwksUrl = `${authBaseUrl}/jwks`;

  // Mint a real token via the auth server's in-process API (sign up → sign in → get token).
  await identity.provider; // ensure provider constructed
  const auth = identity.auth;
  await auth.api.signUpEmail({
    body: { name: "Ada", email: "a@x.com", password: "correct-horse-battery" },
  });
  const signIn = await auth.api.signInEmail({
    body: { email: "a@x.com", password: "correct-horse-battery" },
    asResponse: true,
  });
  const cookie = signIn.headers.getSetCookie().join("; ");
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) throw new Error("no session");
  userId = session.user.id;
  token = (await auth.api.getToken({ headers: new Headers({ cookie }) })).token;

  // Register the tenant's issuer config in the control plane.
  cp.setDatabaseAuthConfig(databaseId, { jwksUrl, issuer, audience: databaseId });
});

afterEach(async () => {
  await new Promise<void>((resolve) => authServer.close(() => resolve()));
  cp.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("JWKS bridge — a real CheckList JWT authenticates a rowboat request", () => {
  it("resolves author = sub for a valid token", async () => {
    const resolve = createJwtResolveAuthor();
    await expect(resolve(reqWith(`Bearer ${token}`), ctx())).resolves.toBe(userId);
  });

  it("rejects an absent token (null → 401 at the router)", async () => {
    const resolve = createJwtResolveAuthor();
    await expect(resolve(reqWith(undefined), ctx())).resolves.toBeNull();
  });

  it("rejects a token presented to the wrong database (aud mismatch)", async () => {
    const other = cp.createDatabase({
      subscriberId: cp.getDatabase(databaseId)!.subscriber_id,
      name: "other",
      schemaManifest: MANIFEST,
    }).databaseId;
    cp.setDatabaseAuthConfig(other, {
      jwksUrl,
      issuer: "http://checklist.local",
      audience: other,
    });
    const resolve = createJwtResolveAuthor();
    await expect(resolve(reqWith(`Bearer ${token}`, other), ctx())).resolves.toBeNull();
  });

  it("rejects a tampered token", async () => {
    const resolve = createJwtResolveAuthor();
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${"a".repeat(parts[2].length)}`;
    await expect(resolve(reqWith(`Bearer ${tampered}`), ctx())).resolves.toBeNull();
  });
});
```

> **Note for the implementer:** `createIdentity`'s return shape (`Identity`) is defined in `packages/auth-betterauth/src/index.ts` (`export interface Identity` ~L39). Confirm the exact member names — `auth`, `provider`, `mountAuthRoutes`, `registerIdentityTables` — and adjust the test's accessors (`identity.auth`, `identity.provider`) to match. If `Identity` does not surface `auth` directly, use `buildAuth` + `createProvider` + `mountAuthRoutes` explicitly (as `packages/auth-betterauth/src/__tests__/mount-composition.test.ts` does) to obtain the `auth` handle. Also confirm the `@jbroll/rowboat-server/jwt-author` subpath import resolves; if the server package does not expose subpath exports, either add `"./jwt-author": "./dist/jwt-author.js"` to its `package.json` `exports`, or re-export `createJwtResolveAuthor` from the server package's main entry and import it from there.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/integration && npm run test:run -- jwt-bridge`
Expected: FAIL initially on import/module resolution (`@jbroll/rowboat-server/jwt-author`) or on the `Identity` accessor names — resolve per the note above, then it should fail only on assertions if any wiring is off.

- [ ] **Step 4: Fix wiring until the test passes**

Resolve the two known integration points from the note:
1. **Server subpath export** for `jwt-author` (or re-export from the main entry).
2. **`Identity` accessors** — match `auth` / `provider` / `mountAuthRoutes` / `registerIdentityTables` to the real interface.

Run: `cd packages/integration && npm run test:run -- jwt-bridge`
Expected: PASS (4 tests) — a real better-auth JWT, fetched-by-URL JWKS, and control-plane issuer lookup resolve `author = userId`; spoofed/absent/wrong-tenant/tampered all resolve `null`.

- [ ] **Step 5: Commit**

```bash
git add packages/integration/src/jwt-bridge.test.ts packages/integration/package.json packages/server/package.json
git commit -m "test(integration): JWKS bridge proof — real CheckList JWT resolves rowboat author"
```

---

## Self-Review

**1. Spec coverage** (design §A, decisions 1/3/5/7 for the Phase-A slice):
- §A.1 CheckList mints per-user JWTs + serves JWKS, asymmetric keys, `sub = user.id` → **Task 6** (`jwt` plugin, EdDSA default, `getToken`/`getJwks`).
- §A.2 Rowboat registers CheckList as a JWT issuer (JWKS URL + `iss`/`aud`) stored in the control plane → **Task 1** (storage) + **Task 2** (management route). Console/rotation UX explicitly deferred (design decision 6).
- §A.3 The router's `resolveAuthor` verifies the Bearer JWT (sig by `kid`, `iss`, `aud`, `exp`; `author = sub`), replacing the stub, using `jose` behind the seam → **Task 4** (verifier) + **Task 3** (seam receives `{ controlPlane }`) + **Task 5** (wired via `ROWBOAT_AUTH_MODE`).
- §A minimal claims (`sub/iss/aud/exp/iat`), authz server-side → honored: verifier reads only `sub`; no group/role claims consulted (Phase B).
- Decision-3 tenancy (`aud` = `database_id`) → Tasks 1/6/7 bind `audience` to the `database_id`.
- Bridge-proof boundary → **Task 7** proves it end-to-end without repointing CheckList's client (per Global Constraints).

**Deliberately out of Phase A (design defers, or user's proof-boundary choice):** client-side token injection into `rowboat.tsx`, `VITE_API_URL` repoint, schema registration via management API, browser e2e, flipping the hosted default to `jwt`, JWKS-rotation console UX, lazy per-user root-group provisioning (that is Phase B — no RBAC in Phase A). These are noted in Non-goals below.

**2. Placeholder scan:** No `TBD`/`handle errors`/"similar to Task N"/"write tests for the above". Every code and test step shows full content. The only non-verbatim spots are the two explicitly-flagged integration points in Task 7 (server subpath export; `Identity` accessor names), each with a concrete resolution path and a reference test to mirror — these depend on package-`exports`/interface details the plan cannot assert without the implementer running resolution, and are called out rather than guessed.

**3. Type consistency:** `DatabaseAuthConfig { jwksUrl, issuer, audience }` is defined once (Task 1) and imported unchanged in Tasks 4/7. `ResolveAuthorContext { controlPlane }` is defined once (Task 3, exported from `@jbroll/rowboat-router`) and consumed in Tasks 4/5/7. `createJwtResolveAuthor(opts?) => (req, ctx) => Promise<string|null>` signature is identical across Tasks 4/5/7. `getDatabaseAuthConfig`/`setDatabaseAuthConfig` names match across Tasks 1/2/4/7. The `jwt` build option shape `{ issuer, audience, expirationTime? }` matches between Task 6's `BuildAuthOptions` and Task 7's `createIdentity` call.

## Non-goals (Phase A)
- **No CheckList client change** — `src/lib/rowboat.tsx` sync `fetchFn`/`headers`, `auth-client.ts` `jwtClient`, `VITE_API_URL`. That is the production cutover, tracked separately.
- **No RBAC / scope-group enforcement** — the worker still mounts sync with `auth: undefined`. Any authenticated `author` reads/writes the whole database. That is **Phase B** (design §B, B-opt-1). This is why Phase A is a *single-user* proof.
- **No sharing / group management** — **Phase C** (design §C).
- **No flip of the hosted default to `jwt`** — `ROWBOAT_AUTH_MODE` defaults to `synthetic` so existing suites/deploys are unchanged; the production deploy sets `ROWBOAT_AUTH_MODE=jwt` and registers each database's issuer config (Task 2 route) as part of the cutover.
- **No JWKS-rotation / issuer console UX** — design decision 6 defers the exact surface; Task 2 provides the minimal management-API primitive it will build on.
