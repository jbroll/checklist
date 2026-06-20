# Adopt jbr-jazz Common Backend (createHierarchyServer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace checklist's forked backend (auth/agent/shares/verified-emails/db + custom server) with `createHierarchyServer` from `@jbr-jazz/hierarchy-backend`, keeping only checklist-specific billing/account routes, and push two common utilities (a raw-routes hook and an account-deletion route) up into the shared package.

**Architecture:** `backend/src/index.ts` becomes a thin shell: build a `BackendConfig`, call `createHierarchyServer(config)` (which provides auth + sharing + agent + verified-emails + db + middleware), then attach checklist-only routes (billing, Stripe webhook via a new `registerRawRoutes` hook, account deletion via a new shared route) on `server.app` and call `server.start()`. The forked sharing/auth/agent files are deleted.

**Tech Stack:** Node + Express, better-sqlite3, BetterAuth, Jazz (jazz-tools/worker), `@jbr-jazz/hierarchy-backend` (tsup build → `dist/`), `@jbr-jazz/billing-backend`.

## Global Constraints

- The package `@jbr-jazz/hierarchy-backend` is a **symlink** to `/home/john/src/jbr-jazz/packages/hierarchy/backend` and is consumed from `dist/` (`main: ./dist/index.js`). **After any package src edit you MUST rebuild** it: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npm run build`.
- Package changes are SHARED (wickedmap also uses this package): all additions must be **additive / backward-compatible** (new optional config fields, new exported function). Do not change existing signatures.
- Schema is already aligned: `share_invites.target_covalue_id` + `app_role`; `verified_email`. Do NOT rename columns.
- Checklist E2E does NOT exercise real Google OAuth through better-auth (mock-oauth tests hit the mock server directly; invite E2E uses email/password). Auth swap must keep email/password + dev cookies working.
- Commit messages: subject 10-72 chars, body only `Co-Authored-By: Claude <noreply@anthropic.com>`, ASCII only. Do not bypass commit hooks (they run type-check, lint, unit, full E2E).
- Dev DB path resolution (replicate exactly): `process.env.AUTH_DB_PATH || (process.env.NODE_ENV === 'production' ? './data/auth.db' : './auth.db')`.

---

## Part A — jbr-jazz package additions (shared, additive)

### Task A1: Add `registerRawRoutes` hook to BackendConfig

Lets apps register raw-body routes (e.g. Stripe webhooks) BEFORE `express.json()` is mounted.

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/<config types file>` (the file defining `BackendConfig`)
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/index.ts` (call the hook before `express.json()` at line ~209)
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/raw-routes.test.ts`

**Interfaces:**
- Produces: `BackendConfig.registerRawRoutes?: (app: import('express').Express, db: import('better-sqlite3').Database) => void` — invoked once, after the `/api/auth` handler and before `express.json()`.

- [ ] **Step 1: Find the BackendConfig file**

Run: `grep -rln "interface BackendConfig" /home/john/src/jbr-jazz/packages/hierarchy/shared/src`
Expected: prints the file path (use it below as `<config-file>`).

- [ ] **Step 2: Add the optional field to BackendConfig**

In `<config-file>`, inside `interface BackendConfig`, add (after `trustedOrigins?`):

```ts
  /**
   * Register raw-body routes (e.g. Stripe webhooks) BEFORE express.json() is
   * mounted. Receives the app and the shared sqlite db. Optional.
   */
  registerRawRoutes?: (app: import('express').Express, db: import('better-sqlite3').Database) => void;
```

- [ ] **Step 3: Call the hook in createHierarchyServer**

In `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/index.ts`, immediately BEFORE the `app.use(express.json({ limit: "10mb" }));` line (~209), add:

```ts
  // App-specific raw-body routes (e.g. Stripe webhooks) must register before JSON parsing.
  config.registerRawRoutes?.(app, db);

```

- [ ] **Step 4: Write the failing test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/raw-routes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';

// Verifies the hook contract: a raw route registered via the hook sees the
// unparsed body. We assert the ordering invariant directly (hook runs before json).
describe('registerRawRoutes ordering', () => {
  it('runs the hook before express.json so raw body is intact', async () => {
    const order: string[] = [];
    const app = express();
    // Simulate createHierarchyServer ordering:
    const registerRawRoutes = (a: express.Express) => {
      order.push('raw');
      a.post('/raw', express.raw({ type: '*/*' }), (req, res) => {
        res.json({ isBuffer: Buffer.isBuffer(req.body) });
      });
    };
    registerRawRoutes(app);
    app.use(() => order.push('json'));
    expect(order).toEqual(['raw', 'json']);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/raw-routes.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Build the package + type-check**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npm run type-check && npm run build`
Expected: no type errors; `dist/index.js` + `dist/index.d.ts` regenerated.

- [ ] **Step 7: Commit (in the jbr-jazz repo)**

```bash
cd /home/john/src/jbr-jazz
git add packages/hierarchy/shared/src packages/hierarchy/backend/src
git commit -m "feat: add registerRawRoutes hook to createHierarchyServer"
```

---

### Task A2: Add `setupAccountDeletionRoute` to hierarchy-backend

Common DELETE `/api/account` that removes the user + cascades shared tables, with an app-specific `extraCleanup` callback.

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/accounts.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/index.ts` (export it)
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/accounts.test.ts`

**Interfaces:**
- Consumes: `getAuth()` / an `auth` instance for session; `ApiErrors` from `./lib/api-error.js`.
- Produces: `setupAccountDeletionRoute(app, db, auth, opts?: { extraCleanup?: (db, userId, email) => void }): void`. Registers `DELETE /api/account`. Returns `{ success: true }`.

- [ ] **Step 1: Write the route module**

Create `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/accounts.ts`:

```ts
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { ApiErrors } from './lib/api-error.js';

// Minimal shape of the better-auth instance we need.
interface AuthApi {
  api: { getSession: (args: { headers: Record<string, string> }) => Promise<{ user?: { id: string; email: string } } | null> };
}

export interface AccountDeletionOptions {
  /** App-specific cleanup (e.g. billing tables) run inside the deletion transaction. */
  extraCleanup?: (db: Database.Database, userId: string, email: string) => void;
}

/**
 * DELETE /api/account — deletes the authenticated user and cascades the common
 * hierarchy tables (share_invites, verified_email). Jazz data becomes
 * inaccessible once the user (which holds the Jazz account keys) is removed.
 */
export function setupAccountDeletionRoute(
  app: Express,
  db: Database.Database,
  auth: AuthApi,
  opts: AccountDeletionOptions = {},
): void {
  app.delete('/api/account', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user?.id) return ApiErrors.unauthorized(res);

      const { id: userId, email } = session.user;
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM share_invites WHERE sender_email = ? OR recipient_email = ?').run(email, email);
        db.prepare('DELETE FROM verified_email WHERE user_id = ?').run(userId);
        opts.extraCleanup?.(db, userId, email);
        // Deleting the user cascades to sessions + oauth accounts.
        db.prepare('DELETE FROM user WHERE id = ?').run(userId);
      });
      tx();

      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
      console.error('[account-deletion] Error:', error);
      return ApiErrors.serverError(res, 'Failed to delete account');
    }
  });
}
```

- [ ] **Step 2: Export it from index.ts**

In `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/index.ts`, add to the exports block:

```ts
export { setupAccountDeletionRoute, type AccountDeletionOptions } from "./accounts.js";
```

- [ ] **Step 3: Write the test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/accounts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import { setupAccountDeletionRoute } from '../accounts.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT);
           CREATE TABLE share_invites (token TEXT, sender_email TEXT, recipient_email TEXT, target_covalue_id TEXT, permission TEXT, expires_at INTEGER, created_at INTEGER);
           CREATE TABLE verified_email (id TEXT, user_id TEXT, email TEXT);
           CREATE TABLE billing (user_id TEXT);`);
  db.prepare('INSERT INTO user VALUES (?,?)').run('u1', 'a@b.com');
  db.prepare('INSERT INTO verified_email VALUES (?,?,?)').run('v1', 'u1', 'a@b.com');
  db.prepare('INSERT INTO billing VALUES (?)').run('u1');
  return db;
}

describe('setupAccountDeletionRoute', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('deletes user + cascades + runs extraCleanup', async () => {
    const auth = { api: { getSession: async () => ({ user: { id: 'u1', email: 'a@b.com' } }) } };
    const app = express();
    let cleaned = false;
    setupAccountDeletionRoute(app, db, auth, {
      extraCleanup: (d, userId) => { d.prepare('DELETE FROM billing WHERE user_id = ?').run(userId); cleaned = true; },
    });
    // Invoke the handler directly via a fake request/response.
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/account');
    const res: any = { json: (b: any) => { res.body = b; return res; }, status: () => res };
    await layer.route.stack[0].handle({ headers: {} }, res, () => {});
    expect(res.body).toEqual({ success: true, message: 'Account deleted successfully' });
    expect(db.prepare('SELECT count(*) c FROM user').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT count(*) c FROM verified_email').get()).toEqual({ c: 0 });
    expect(cleaned).toBe(true);
    expect(db.prepare('SELECT count(*) c FROM billing').get()).toEqual({ c: 0 });
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/accounts.test.ts`
Expected: PASS. If the `_router.stack` introspection is brittle on this Express version, switch to `supertest` (already a dev dep in many setups) — but try the direct-invoke first.

- [ ] **Step 5: Build + type-check + commit**

```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npm run type-check && npm run build
cd /home/john/src/jbr-jazz && git add packages/hierarchy/backend/src && git commit -m "feat: add setupAccountDeletionRoute to hierarchy-backend"
```

---

## Part B — checklist backend migration

### Task B1: Slim `db.ts` to billing-only init

The package's `initDb` now owns share_invites + verified_email. Checklist keeps only billing table init + Stripe price sync.

**Files:**
- Modify: `backend/src/db.ts`

- [ ] **Step 1: Replace db.ts with billing-only init**

Replace the entire `backend/src/db.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Initialize checklist-specific billing tables (subscription_tier,
 * user_subscription, usage_snapshot) and sync Stripe price IDs.
 * Sharing + verified-email tables are owned by @jbr-jazz/hierarchy-backend's initDb.
 */
export function initBillingDb(db: Database.Database): Database.Database {
  const subscriptionsSql = readFileSync(join(__dirname, 'migrations/subscriptions.sql'), 'utf-8');
  db.exec(subscriptionsSql);
  syncStripePriceIds(db);
  return db;
}

function syncStripePriceIds(db: Database.Database) {
  const updatePriceId = db.prepare('UPDATE subscription_tier SET stripe_price_id = ? WHERE slug = ?');
  const plusPriceId = process.env.STRIPE_PRICE_PLUS;
  const premiumPriceId = process.env.STRIPE_PRICE_PREMIUM;
  if (plusPriceId) {
    updatePriceId.run(plusPriceId, 'plus');
    console.log('[db] Synced Stripe price ID for plus tier');
  }
  if (premiumPriceId) {
    updatePriceId.run(premiumPriceId, 'premium');
    console.log('[db] Synced Stripe price ID for premium tier');
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/john/src/checklist && npx tsc --noEmit -p backend/tsconfig.json`
Expected: errors ONLY about other files still importing the old `initDb` (fixed in B2). `db.ts` itself clean.

(No commit yet — commit after B2 so the backend compiles.)

---

### Task B2: Rewrite `index.ts` to use createHierarchyServer

**Files:**
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `createHierarchyServer`, `setupAccountDeletionRoute` from `@jbr-jazz/hierarchy-backend`; `initBillingDb` from `./db.js`; `setupBillingRoutes`, `setupStripeWebhook` from `./billing/routes.js`; `setupLimitCheckRoute` from `@jbr-jazz/billing-backend`.

- [ ] **Step 1: Replace index.ts entirely**

Replace `backend/src/index.ts` with:

```ts
// WebSocket polyfill for Node.js < 21 (Jazz requires WebSocket API)
import { WebSocket } from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error - Polyfilling WebSocket for Node < 21
  globalThis.WebSocket = WebSocket;
}

import path from 'node:path';
import dotenv from 'dotenv';
import type { BackendConfig } from '@jbr-jazz/hierarchy-shared';
import { createHierarchyServer, setupAccountDeletionRoute } from '@jbr-jazz/hierarchy-backend';
import { setupLimitCheckRoute } from '@jbr-jazz/billing-backend';
import { initBillingDb } from './db.js';
import { setupBillingRoutes, setupStripeWebhook } from './billing/routes.js';

// Root .env first (shared config like JAZZ_API_KEY), then backend .env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();
if (process.env.VITE_JAZZ_API_KEY && !process.env.JAZZ_API_KEY) {
  process.env.JAZZ_API_KEY = process.env.VITE_JAZZ_API_KEY;
}

const isProd = process.env.NODE_ENV === 'production';
const dbPath = process.env.AUTH_DB_PATH || (isProd ? './data/auth.db' : './auth.db');
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

const config: BackendConfig = {
  port: Number(process.env.PORT) || 3001,
  frontendUrl,
  baseUrl: frontendUrl,
  dbPath,
  authSecret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-me',
  appName: 'CheckList',
  jazzApiKey: process.env.JAZZ_API_KEY,
  jazzAgentAccountId: process.env.JAZZ_AGENT_ACCOUNT_ID,
  jazzAgentSecret: process.env.JAZZ_AGENT_SECRET,
  trustedOrigins: [
    'http://localhost:8765',
    'http://localhost:8766',
    'http://localhost:5173',
    'https://checklist-app.rkroll.com',
    'https://appleid.apple.com',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [{
          name: 'google',
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          scopes: ['openid', 'email'],
          options: { prompt: 'select_account', disableDefaultScopes: true },
        }]
      : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [{
          name: 'apple',
          clientId: process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
          scopes: ['name', 'email'],
        }]
      : []),
  ],
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.EMAIL_FROM || 'CheckList <invite@checklist.rkroll.com>',
      }
    : undefined,
  emailAuth: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] },
  // Stripe webhook needs the raw body before express.json() (registered via this hook).
  registerRawRoutes: (app, db) => {
    setupStripeWebhook(app, db);
  },
};

const server = createHierarchyServer(config);
server.app.set('trust proxy', true);

// Checklist-specific billing tables + Stripe price sync.
initBillingDb(server.db);

// Billing routes (JSON body already mounted by the package).
setupBillingRoutes(server.app, server.db, server.auth);
setupLimitCheckRoute(server.app, server.db, server.auth, {
  getUsage: (db, userId) => {
    const result = db
      .prepare('SELECT item_count FROM usage_snapshot WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1')
      .get(userId) as { item_count: number } | undefined;
    return { currentCount: result?.item_count ?? 0, resourceName: 'lists' };
  },
  formatMessage: (response) => {
    if (response.status === 'beta') return `Beta: ${response.currentCount} of ${response.maxAllowed} lists (Plus tier limits during beta)`;
    if (response.atLimit) return `You've reached your limit of ${response.maxAllowed} lists. Upgrade your plan to create more.`;
    if (response.approachingLimit) return `${response.remaining} lists remaining. Consider upgrading for more.`;
    if (response.maxAllowed === -1) return `${response.currentCount} lists (unlimited)`;
    return `${response.currentCount} of ${response.maxAllowed} lists`;
  },
});

// Account deletion (shared route + checklist billing-table cleanup).
setupAccountDeletionRoute(server.app, server.db, server.auth, {
  extraCleanup: (db, userId) => {
    db.prepare('DELETE FROM usage_snapshot WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_subscription WHERE user_id = ?').run(userId);
  },
});

server.start();
```

- [ ] **Step 2: Verify the billing route signatures match**

Run: `grep -nE "export function setupBillingRoutes|export function setupStripeWebhook" backend/src/billing/routes.ts`
Expected: `setupBillingRoutes(app, db, auth)` and `setupStripeWebhook(app, db)`. If `setupLimitCheckRoute`'s `getUsage` signature differs, align the callback to the actual `@jbr-jazz/billing-backend` type (it was `(db, userId, tier, status)` previously — keep extra params if required by the type).

- [ ] **Step 3: Type-check**

Run: `cd /home/john/src/checklist && npx tsc --noEmit -p backend/tsconfig.json`
Expected: errors only from the now-orphaned forked files (deleted in B3) and `migrate-auth.ts` import (fixed in B3).

---

### Task B3: Delete forked files + rewire stragglers

**Files:**
- Delete: `backend/src/auth.ts`, `backend/src/agent.ts`, `backend/src/shares.ts`, `backend/src/verified-emails.ts`, `backend/src/lib/rate-limiter.ts`, `backend/src/lib/api-error.ts`, `backend/src/lib/email-matching.ts`, `backend/src/lib/verification-token.ts`, `backend/src/lib/validation.ts`, `backend/src/jazz/index.ts`
- Modify: `backend/src/migrate-auth.ts` (it imports `sqliteDb` from `./auth.js`)
- Delete (obsolete migrations): `backend/src/migrations/shares.sql`, `backend/src/migrations/verified-emails.sql` (now owned by the package's `initDb`)

- [ ] **Step 1: Confirm nothing else imports the deleted modules**

Run:
```bash
cd /home/john/src/checklist
grep -rnE "from './(auth|agent|shares|verified-emails)\.js'|/lib/(rate-limiter|api-error|email-matching|verification-token|validation)\.js'|from './jazz/index" backend/src --include=*.ts | grep -v test
```
Expected: only `migrate-auth.ts` (and the files about to be deleted). Any other hit must be rewired to the package import first.

- [ ] **Step 2: Rewire migrate-auth.ts DB access**

In `backend/src/migrate-auth.ts`, replace `import { sqliteDb } from './auth.js';` with a direct DB open:

```ts
import Database from 'better-sqlite3';
const dbPath = process.env.AUTH_DB_PATH || (process.env.NODE_ENV === 'production' ? './data/auth.db' : './auth.db');
const sqliteDb = new Database(dbPath);
```

(Keep the rest of `migrate-auth.ts` unchanged.)

- [ ] **Step 3: Delete the forked files**

```bash
cd /home/john/src/checklist
git rm backend/src/auth.ts backend/src/agent.ts backend/src/shares.ts backend/src/verified-emails.ts \
  backend/src/lib/rate-limiter.ts backend/src/lib/api-error.ts backend/src/lib/email-matching.ts \
  backend/src/lib/verification-token.ts backend/src/lib/validation.ts backend/src/jazz/index.ts \
  backend/src/migrations/shares.sql backend/src/migrations/verified-emails.sql
```

- [ ] **Step 4: Check for remaining references to deleted libs from tests**

Run: `grep -rnE "lib/(rate-limiter|api-error|email-matching|verification-token|validation)|'\./(auth|agent|shares|verified-emails)" backend/test backend/src --include=*.ts | grep -v node_modules`
Expected: backend tests for the deleted modules (e.g. `verification-token.test.ts`, `email-matching.test.ts`, `validation.test.ts`, `security.test.ts`, sharing tests) still reference them. Delete the tests whose subject moved into the package (they're now covered by the package's own tests): `git rm` the corresponding `backend/test/*.test.ts` files that import deleted modules. Keep billing tests.

- [ ] **Step 5: Type-check whole backend**

Run: `cd /home/john/src/checklist && npx tsc --noEmit -p backend/tsconfig.json`
Expected: PASS (no errors).

- [ ] **Step 6: Update knip if it flags the deletions**

Run: `npm run knip 2>&1 | tail -5`
Expected: exit 0. If `@jbr-jazz/hierarchy-shared` is now a direct import and flagged "unlisted dependency", add it to `backend/package.json` dependencies (it's already a workspace symlink). Fix any unlisted/unused reported.

- [ ] **Step 7: Commit the migration**

```bash
cd /home/john/src/checklist
git add -A backend/
git commit -m "refactor: adopt jbr-jazz createHierarchyServer; drop backend fork"
```

(The pre-commit hook runs type-check + lint + unit + full E2E. Ensure the dev server still boots — see Task B4 — before relying on the hook; if the hook's E2E fails, fix before the commit completes.)

---

### Task B4: Verify the running app + sharing end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Boot the backend, confirm it starts clean**

```bash
cd /home/john/src/checklist
SMTP_HOST=127.0.0.1 SMTP_PORT=3025 SMTP_USER=greenmail SMTP_PASS=greenmail \
IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USERNAME=greenmail IMAP_PASSWORD=greenmail IMAP_PER_RECIPIENT=1 \
npm run dev
```
Expected logs: `🔐 BetterAuth server running` (or the package's equivalent), `✅ Jazz agent initialized`, no `EADDRINUSE`, no missing-table errors. Confirm `curl -fsS localhost:3001/health` (or `/api/health`) returns 200 and `curl localhost:8765` serves the app.

- [ ] **Step 2: Run the invite closed-loop E2E (the real regression guard)**

With the gpu GreenMail tunnel up (`npm run test:e2e:invite:tunnel`), expected: **9 passed** (including `recipient accepts and gains folder access`). This proves auth + agent + sharing all work through the package.

- [ ] **Step 3: Run the full check suite**

Run: `cd /home/john/src/checklist && npm run check`
Expected: type-check + lint + unit tests PASS. Then `npm run test:e2e` (mocked sharing-ui, smoke, billing, etc.) PASS.

- [ ] **Step 4: Final commit if any verification fixes were needed**

```bash
git add -A && git commit -m "test: verify jbr-jazz backend adoption"
```

---

## Self-Review

**Spec coverage:**
- Full adoption of createHierarchyServer → Task B2.
- Delete forked auth/agent/shares/verified-emails/db/libs → Tasks B1, B3.
- Stripe raw webhook via package hook → Task A1 + B2 `registerRawRoutes`.
- Account deletion pushed up with extraCleanup → Task A2 + B2.
- Billing kept checklist-side (tables + routes + limit-check) → B1, B2.
- Package changes additive/backward-compatible → A1, A2 (new optional field, new export).
- Rebuild package after edits → Global Constraints + A1/A2 build steps.

**Placeholder scan:** No TBD/TODO. The one introspection risk (Express `_router.stack` in the A2 test) has an explicit supertest fallback. Test-deletion in B3 Step 4 is conditional on actual grep output (the executor lists then removes) — not a placeholder but a discovery step inherent to deletion.

**Type consistency:** `registerRawRoutes(app, db)` signature consistent A1↔B2. `setupAccountDeletionRoute(app, db, auth, {extraCleanup})` consistent A2↔B2. `initBillingDb(db)` consistent B1↔B2. `createHierarchyServer` returns `{app, db, auth, start, stop}` — B2 uses `server.app/db/auth/start`.

**Risks flagged for the executor:**
- Package auth dev cookie/CSRF behavior must keep email/password E2E working (B4 Step 2 is the guard).
- `setupLimitCheckRoute` `getUsage` callback arity may differ from checklist's old 4-arg form — align to the package's current type (B2 Step 2).
- If `@jbr-jazz/hierarchy-shared` types lag the new `registerRawRoutes` field at checklist's type-check, rebuild shared too (`npm run build --workspaces` at jbr-jazz root).
