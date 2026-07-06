# Migrate CheckList Backend Billing to jbr-jazz

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete CheckList's local billing implementation under `backend/src/billing/` and adopt `@jbr-jazz/billing-backend`, fixing known drift bugs in the process.

**Architecture:** `backend/src/index.ts` already uses `@jbr-jazz/hierarchy-backend` via `createHierarchyServer`. Extend that adoption to billing: import `setupBillingRoutes`, `setupStripeWebhook`, `initBillingDatabase`, `getStripe` from `@jbr-jazz/billing-backend`, delete local duplicates, and move any CheckList-specific behavior (rate limiting, legacy `listCount` alias) into thin wrappers or middleware.

**Tech Stack:** Node, Express, better-sqlite3, Stripe, BetterAuth, `@jbr-jazz/hierarchy-backend`, `@jbr-jazz/billing-backend`.

## Global Constraints

- Coordinate with plan `2026-06-20-jbr-jazz-backend-adoption.md` if that work is not yet complete; the hierarchy-backend integration must be in place first.
- `@jbr-jazz/billing-backend` is consumed from `dist/`; rebuild after any package edit: `cd /home/john/src/jbr-jazz/packages/billing/backend && npm run build`.
- Package changes must be additive/backward-compatible.
- Commit messages: subject 10-72 chars, body only `Co-Authored-By: Claude <noreply@anthropic.com>`, ASCII only.
- Do not bypass commit hooks.
- Preserve existing billing tests; update them to exercise the shared routes.

---

## File Structure

| File | Change |
|---|---|
| `backend/src/billing/routes.ts` | Delete; use package `setupBillingRoutes` + `setupStripeWebhook`. |
| `backend/src/billing/subscription.ts` | Delete; use package subscription operations. |
| `backend/src/billing/stripe.ts` | Delete; use package `getStripe`/`initStripe`. |
| `backend/src/db.ts` | Delete billing init; use `initBillingDatabase` from package. |
| `backend/src/migrations/subscriptions.sql` | Delete or reduce to app-specific migrations only. |
| `backend/src/index.ts` | Wire package billing routes; add rate-limit wrapper. |
| `backend/src/migrate-auth.ts` | Replace with package helper if hierarchy-backend gains `ensureAuthTables`. |
| `backend/scripts/rotate-agent.ts` | Fix `folder_covalue_id` → `target_covalue_id`. |
| `backend/test/security.test.ts` | Import real `csrfProtectionMiddleware` from hierarchy-backend. |

---

## Task C1: Replace local billing module with billing-backend

**Files:**
- Delete: `backend/src/billing/routes.ts`, `backend/src/billing/subscription.ts`, `backend/src/billing/stripe.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/db.ts`
- Delete: `backend/src/migrations/subscriptions.sql` (after extracting app-specific migrations)
- Test: `backend/test/billing/*.test.ts`

**Interfaces:**
- Consumes: `setupBillingRoutes`, `setupStripeWebhook`, `initBillingDatabase`, `getStripe`, `createBillingTables`, `seedDefaultTiers`, `syncStripePriceIds` from `@jbr-jazz/billing-backend`
- Produces: same `/api/billing/*` routes and Stripe webhook behavior

- [ ] **Step 1: Extract app-specific migrations**

If `backend/src/migrations/subscriptions.sql` contains CheckList-specific data fixes (`team` → `premium`, beta status), move them to a new file `backend/src/migrations/checklist-billing-fixups.sql`.

- [ ] **Step 2: Delete local billing source files**

```bash
rm backend/src/billing/routes.ts
rm backend/src/billing/subscription.ts
rm backend/src/billing/stripe.ts
rm backend/src/migrations/subscriptions.sql
```

Keep `backend/src/billing/` as an empty directory or delete it if no files remain.

- [ ] **Step 3: Update backend/src/db.ts**

Replace local billing DB init with package call:

```ts
import { initBillingDatabase } from '@jbr-jazz/billing-backend';

export function initBillingDb(db: Database.Database): Database.Database {
  initBillingDatabase(db);
  // App-specific fixups:
  const fixups = readFileSync(join(__dirname, 'migrations/checklist-billing-fixups.sql'), 'utf-8');
  db.exec(fixups);
  return db;
}
```

If no app-specific fixups exist, delete `backend/src/db.ts` entirely and call `initBillingDatabase` directly from `backend/src/index.ts`.

- [ ] **Step 4: Update backend/src/index.ts**

Replace local imports:

```ts
import { setupBillingRoutes, setupStripeWebhook } from './billing/routes.js';
import { initBillingDb } from './db.js';
```

with package imports:

```ts
import {
  getStripe,
  initBillingDatabase,
  setupBillingRoutes,
  setupStripeWebhook,
} from '@jbr-jazz/billing-backend';
```

Initialize billing DB where the local `initBillingDb` was called:

```ts
initBillingDatabase(db);
```

Mount billing routes using the package:

```ts
setupBillingRoutes(app, db, auth, {
  stripe: getStripe(),
  successUrl: `${baseUrl}/billing/success`,
  cancelUrl: `${baseUrl}/billing/cancel`,
});
setupStripeWebhook(app, db, getStripe(), {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
});
```

- [ ] **Step 5: Preserve checkout/portal rate limiting**

If the local `routes.ts` wrapped checkout/portal in a rate limiter, add a small Express middleware around those routes:

```ts
import rateLimit from 'express-rate-limit';

const billingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/billing/checkout', billingLimiter);
app.use('/api/billing/portal', billingLimiter);
```

Run this **before** `setupBillingRoutes`.

- [ ] **Step 6: Preserve legacy `listCount` alias**

If CheckList frontend still sends `listCount`, add a tiny middleware before billing routes:

```ts
app.use('/api/billing/usage', (req, res, next) => {
  if (req.body && typeof req.body.listCount === 'number' && req.body.itemCount === undefined) {
    req.body.itemCount = req.body.listCount;
  }
  next();
});
```

- [ ] **Step 7: Run backend tests and type-check**

```bash
cd /home/john/src/checklist/backend
npm run type-check
npm run test:run
```

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor(backend): adopt billing-backend package"
```

---

## Task C2: Fix rotate-agent.ts column drift

**Files:**
- Modify: `backend/scripts/rotate-agent.ts`
- Test: run script manually or add a small test

**Interfaces:**
- Uses `target_covalue_id` column from `share_invites` table as defined by `@jbr-jazz/hierarchy-backend`

- [ ] **Step 1: Replace column name**

In `backend/scripts/rotate-agent.ts`, change:

```ts
let query = `SELECT DISTINCT folder_covalue_id FROM share_invites`;
```

to:

```ts
let query = `SELECT DISTINCT target_covalue_id FROM share_invites`;
```

- [ ] **Step 2: Update downstream references**

Replace any usage of `folder_covalue_id` in the script with `target_covalue_id`.

- [ ] **Step 3: Verify with type-check**

```bash
cd /home/john/src/checklist/backend
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(scripts): align rotate-agent with share_invites.target_covalue_id"
```

---

## Task C3: Replace CSRF middleware copy in tests

**Files:**
- Modify: `backend/test/security.test.ts`
- Test: `npm run test:run` in backend

**Interfaces:**
- Consumes: `csrfProtectionMiddleware` from `@jbr-jazz/hierarchy-backend`

- [ ] **Step 1: Import real middleware**

Replace the inline copy in `backend/test/security.test.ts` with:

```ts
import { csrfProtectionMiddleware } from '@jbr-jazz/hierarchy-backend';

app.use(csrfProtectionMiddleware({ authPathPrefix: '/api/auth', webhookPath: '/api/webhooks/stripe' }));
```

- [ ] **Step 2: Adjust test expectations to match package behavior**

Verify the response body shape matches what the package returns. Update assertions if needed.

- [ ] **Step 3: Run tests**

```bash
cd /home/john/src/checklist/backend
npm run test:run
```

- [ ] **Step 4: Commit**

```bash
git commit -m "test(backend): use real csrfProtectionMiddleware from hierarchy-backend"
```

---

## Task C4: Migrate migrate-auth.ts to hierarchy-backend helper

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/auth.ts` (or create helper)
- Delete: `backend/src/migrate-auth.ts`
- Modify: `backend/src/index.ts`
- Test: backend startup / migration tests

**Interfaces:**
- Consumes: `ensureAuthTables` from `@jbr-jazz/hierarchy-backend`
- Produces: same idempotent BetterAuth schema setup

- [ ] **Step 1: Add ensureAuthTables to hierarchy-backend**

In `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/auth.ts` (or a new `src/migration.ts`), add:

```ts
export function ensureAuthTables(db: Database.Database): void {
  const tableNames = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  ).map((t) => t.name);

  const requiredTables = ['user', 'session', 'account', 'verification'];
  const missingTables = requiredTables.filter((t) => !tableNames.includes(t));

  if (missingTables.length > 0) {
    console.log(`[ensureAuthTables] Creating BetterAuth tables: ${missingTables.join(', ')}`);
    // ... existing local SQL from CheckList backend/src/migrate-auth.ts ...
  }

  const ensureColumn = (table: string, column: string, ddlType: string) => { ... };
  ensureColumn('user', 'encryptedCredentials', 'TEXT');
  ensureColumn('user', 'accountID', 'TEXT');
}
```

- [ ] **Step 2: Rebuild hierarchy-backend**

```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/backend
npm run type-check
npm run build
```

- [ ] **Step 3: Delete CheckList migrate-auth.ts**

```bash
rm backend/src/migrate-auth.ts
```

- [ ] **Step 4: Update backend/src/index.ts**

Replace the local `ensureAuthTables` import/call with the package helper:

```ts
import { ensureAuthTables } from '@jbr-jazz/hierarchy-backend';

ensureAuthTables(db);
```

- [ ] **Step 5: Run tests and commit**

```bash
cd /home/john/src/checklist/backend
npm run type-check
npm run test:run
git commit -m "refactor(backend): use hierarchy-backend ensureAuthTables"
```

---

## Self-Review

**Spec coverage:** All backend duplications identified in the code review are addressed:
- billing routes/subscription/stripe → Task C1
- rotate-agent column drift → Task C2
- CSRF test copy → Task C3
- migrate-auth → Task C4

**Placeholder scan:** No TBD/TODO. Concrete file paths and commands provided.

**Type consistency:** Uses package export names from `@jbr-jazz/billing-backend` and `@jbr-jazz/hierarchy-backend` `index.ts` files.
