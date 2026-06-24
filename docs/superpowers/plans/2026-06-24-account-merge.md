# Account Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user merge a second ("source") account into their current ("target") account: adopt the source's lists, turn the source login into a permanent second door to the target's Jazz account, and consolidate the source's verified emails onto the target.

**Architecture:** Two-login client flow. (1) As target, capture the target Jazz account id + a one-time merge nonce. (2) Log into source; as admin of its own folders, the client adds the target account to each top-level folder's Jazz group and reports the folder ids to the backend (`prepare`). (3) Log back into target; the client pulls those folders into its root and calls `finalize`, which repoints the source `user` row's Jazz pointer to the target account and moves the source's verified emails onto the target. A deletion guard prevents the existing account-delete cascade from harming a shared Jazz account.

**Tech Stack:** Express + better-sqlite3 (backend, in `@jbr-jazz/hierarchy-backend`), React + Jazz.tools + BetterAuth (frontend, in `checklist`), Vitest + supertest (backend tests), Vitest + Testing Library (frontend tests), Playwright (E2E).

## Global Constraints

- Backend routes/DB live in `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/`; frontend in `/home/john/src/checklist/src/`. The app wires backend routes in `/home/john/src/checklist/backend/src/index.ts`.
- DB driver is `better-sqlite3`. Tables created with `db.exec('CREATE TABLE IF NOT EXISTS ...')` inside `initDb` (`backend/src/db.ts`). Statements via `db.prepare(...).run()/.get()/.all()`. Multi-write ops via `db.transaction(() => {...})()`.
- Auth/session read pattern: `const session = await auth.api.getSession({ headers: req.headers as Record<string, string> })`; user id is `session.user.id`; Jazz account id is `(session.user as { accountID?: string }).accountID`.
- ESM imports use `.js` extensions for local backend modules (e.g. `import { initDb } from './db.js'`).
- Jazz client group ops: `const group = covalue.$jazz.owner`; load an account with `Account.load(id, { loadAs: group.$jazz.loadedAs })`; `group.addMember(account, 'admin')`; `group.removeMember(account)`; `await group.$jazz.waitForSync()`.
- Frontend backend calls use raw `fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })`.
- Commit message format (from CLAUDE.md): subject 10–72 chars, ASCII only, body limited to `Co-Authored-By: Claude <noreply@anthropic.com>`. Pre-commit runs type-check + lint + unit + E2E and MUST pass; never bypass.
- Token/secret for signing the merge nonce: the BetterAuth secret (`config.authSecret` / `BETTER_AUTH_SECRET`), same source used by `lib/verification-token.ts`.

---

## File Structure

**Create:**
- `jbr-jazz/.../backend/src/account-merge.ts` — `prepare` + `finalize` routes + merge-record helpers.
- `jbr-jazz/.../backend/src/__tests__/account-merge.test.ts` — backend unit tests.
- `checklist/src/lib/account-merge.ts` — client API + Jazz data-move helpers.
- `checklist/src/lib/__tests__/account-merge.test.ts` — client helper tests.
- `checklist/src/components/auth/MergeAccountFlow.tsx` — the two-login UI state machine.
- `checklist/src/components/auth/__tests__/MergeAccountFlow.test.tsx` — component tests.

**Modify:**
- `jbr-jazz/.../backend/src/db.ts` — add `account_merge` table + expected-schema entry.
- `jbr-jazz/.../backend/src/accounts.ts` — add shared-`accountID` deletion guard.
- `jbr-jazz/.../backend/src/index.ts` — mount merge routes alongside the others.
- `checklist/backend/src/index.ts` — (no change expected; routes mount inside the package) — verify only.
- `checklist/src/App.tsx` — detect `?merge=<nonce>` and route into `MergeAccountFlow`.
- `checklist/src/components/auth/LinkedEmailsSection.tsx` (or the settings panel that renders it) — add a "Combine another account" entry point.

---

## Task 1: `account_merge` table

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/db.ts` (inside `initDb`, near the `verified_email` block ~line 90-110; and the `EXPECTED_SCHEMAS` map)
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/account-merge-db.test.ts`

**Interfaces:**
- Produces: an `account_merge` table with columns `nonce TEXT PK, target_user_id TEXT, target_jazz_id TEXT, source_user_id TEXT, source_jazz_id TEXT, adopted_folder_ids TEXT, state TEXT, created_at INTEGER, expires_at INTEGER`.

- [ ] **Step 1: Write the failing test**

```typescript
// account-merge-db.test.ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initDb } from '../db.js';

describe('account_merge table', () => {
  it('is created by initDb with the expected columns', () => {
    const db = new Database(':memory:');
    // initDb references the `user` table via FK in verified_email; create a stub first.
    db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT)');
    initDb(db);
    const cols = (db.prepare('PRAGMA table_info(account_merge)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual(
      expect.arrayContaining([
        'nonce',
        'target_user_id',
        'target_jazz_id',
        'source_user_id',
        'source_jazz_id',
        'adopted_folder_ids',
        'state',
        'created_at',
        'expires_at',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-db.test.ts`
Expected: FAIL — `no such table: account_merge`.

- [ ] **Step 3: Add the table to `initDb`**

In `db.ts`, immediately after the `verified_email` `CREATE TABLE` block, add:

```typescript
  // Create account merge records (transient, TTL-bounded)
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_merge (
      nonce TEXT PRIMARY KEY,
      target_user_id TEXT NOT NULL,
      target_jazz_id TEXT NOT NULL,
      source_user_id TEXT,
      source_jazz_id TEXT,
      adopted_folder_ids TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'prepared', 'finalized')),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
```

If `EXPECTED_SCHEMAS` lists every table's expected columns, add an `account_merge` entry mirroring the columns above so `validateTableSchema` passes. (Read the existing `EXPECTED_SCHEMAS` shape first and match it exactly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/jbr-jazz add packages/hierarchy/backend/src/db.ts packages/hierarchy/backend/src/__tests__/account-merge-db.test.ts
git -C /home/john/src/jbr-jazz commit -m "feat: add account_merge table"
```

---

## Task 2: Merge-record helpers + nonce

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/account-merge.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/account-merge-record.test.ts`

**Interfaces:**
- Produces:
  - `createMergeNonce(secret: string): string` — random id signed like `lib/verification-token` (32 random bytes hex + HMAC), opaque to the client.
  - `MERGE_TTL_SECONDS = 1800`
  - `insertMergeRecord(db, { nonce, targetUserId, targetJazzId, now }): void` — inserts `state='pending'`, `expires_at = now + MERGE_TTL_SECONDS`.
  - `getMergeRecord(db, nonce): MergeRecord | null` — returns null when missing or expired (`expires_at < now`).
  - `type MergeRecord = { nonce, target_user_id, target_jazz_id, source_user_id, source_jazz_id, adopted_folder_ids, state, created_at, expires_at }`.

- [ ] **Step 1: Write the failing test**

```typescript
// account-merge-record.test.ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initDb } from '../db.js';
import { createMergeNonce, getMergeRecord, insertMergeRecord } from '../account-merge.js';

function freshDb() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT)');
  initDb(db);
  return db;
}

describe('merge record helpers', () => {
  it('round-trips a pending record', () => {
    const db = freshDb();
    const now = 1_000_000;
    const nonce = createMergeNonce('secret');
    insertMergeRecord(db, { nonce, targetUserId: 'u-t', targetJazzId: 'co_t', now });
    const rec = getMergeRecord(db, nonce, now + 10);
    expect(rec?.target_user_id).toBe('u-t');
    expect(rec?.state).toBe('pending');
  });

  it('returns null for an expired record', () => {
    const db = freshDb();
    const now = 1_000_000;
    const nonce = createMergeNonce('secret');
    insertMergeRecord(db, { nonce, targetUserId: 'u-t', targetJazzId: 'co_t', now });
    expect(getMergeRecord(db, nonce, now + 2000)).toBeNull(); // TTL 1800
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-record.test.ts`
Expected: FAIL — cannot find module `../account-merge.js` / exports undefined.

- [ ] **Step 3: Implement helpers**

```typescript
// account-merge.ts
import { randomBytes, createHmac } from 'node:crypto';
import type Database from 'better-sqlite3';

export const MERGE_TTL_SECONDS = 1800;

export interface MergeRecord {
  nonce: string;
  target_user_id: string;
  target_jazz_id: string;
  source_user_id: string | null;
  source_jazz_id: string | null;
  adopted_folder_ids: string;
  state: 'pending' | 'prepared' | 'finalized';
  created_at: number;
  expires_at: number;
}

export function createMergeNonce(secret: string): string {
  if (!secret) throw new Error('Secret is required');
  const id = randomBytes(32).toString('hex');
  const sig = createHmac('sha256', secret).update(id).digest('hex');
  return `${id}.${sig}`;
}

export function insertMergeRecord(
  db: Database.Database,
  args: { nonce: string; targetUserId: string; targetJazzId: string; now: number },
): void {
  db.prepare(
    `INSERT INTO account_merge (nonce, target_user_id, target_jazz_id, state, created_at, expires_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  ).run(args.nonce, args.targetUserId, args.targetJazzId, args.now, args.now + MERGE_TTL_SECONDS);
}

export function getMergeRecord(
  db: Database.Database,
  nonce: string,
  now: number,
): MergeRecord | null {
  const rec = db.prepare('SELECT * FROM account_merge WHERE nonce = ?').get(nonce) as
    | MergeRecord
    | undefined;
  if (!rec) return null;
  if (rec.expires_at < now) return null;
  return rec;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-record.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/jbr-jazz add packages/hierarchy/backend/src/account-merge.ts packages/hierarchy/backend/src/__tests__/account-merge-record.test.ts
git -C /home/john/src/jbr-jazz commit -m "feat: add merge record helpers"
```

---

## Task 3: `start` + `prepare` routes

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/account-merge.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/account-merge-prepare.test.ts`

**Interfaces:**
- Consumes: `createMergeNonce`, `insertMergeRecord`, `getMergeRecord` (Task 2); `AuthApi` shape `{ api: { getSession(args): Promise<{ user?: { id: string; accountID?: string } } | null> } }`.
- Produces: `setupAccountMergeRoutes(app: Express, db: Database.Database, auth: AuthApi, config: { authSecret: string }): void` registering:
  - `POST /api/account/merge/start` (authed as **target**) → body `{}` → `{ nonce, targetJazzId }`. Records a `pending` row.
  - `POST /api/account/merge/prepare` (authed as **source**) → body `{ nonce, adoptedFolderIds: string[] }` → `{ success: true }`. Validates the record exists/pending/unexpired, that `source_jazz_id !== target_jazz_id`, then sets `source_user_id`, `source_jazz_id`, `adopted_folder_ids`, `state='prepared'`.

- [ ] **Step 1: Write the failing test**

```typescript
// account-merge-prepare.test.ts
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { initDb } from '../db.js';
import { setupAccountMergeRoutes } from '../account-merge.js';

function appWith(sessionByCall: Array<{ id: string; accountID: string }>) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT)');
  initDb(db);
  let call = 0;
  const auth = {
    api: { getSession: async () => ({ user: sessionByCall[call++] }) },
  } as never;
  const app = express();
  app.use(express.json());
  setupAccountMergeRoutes(app, db, auth, { authSecret: 'secret' });
  return { app, db };
}

describe('merge start + prepare', () => {
  it('start returns a nonce and target jazz id, prepare records source + folders', async () => {
    const { app, db } = appWith([
      { id: 'u-target', accountID: 'co_target' }, // start (target)
      { id: 'u-source', accountID: 'co_source' }, // prepare (source)
    ]);

    const start = await request(app).post('/api/account/merge/start').send({});
    expect(start.status).toBe(200);
    expect(start.body.targetJazzId).toBe('co_target');
    const nonce = start.body.nonce as string;

    const prep = await request(app)
      .post('/api/account/merge/prepare')
      .send({ nonce, adoptedFolderIds: ['co_f1', 'co_f2'] });
    expect(prep.status).toBe(200);

    const rec = db.prepare('SELECT * FROM account_merge WHERE nonce = ?').get(nonce) as {
      source_user_id: string;
      state: string;
      adopted_folder_ids: string;
    };
    expect(rec.source_user_id).toBe('u-source');
    expect(rec.state).toBe('prepared');
    expect(JSON.parse(rec.adopted_folder_ids)).toEqual(['co_f1', 'co_f2']);
  });

  it('rejects self-merge (same jazz id)', async () => {
    const { app } = appWith([
      { id: 'u-target', accountID: 'co_same' },
      { id: 'u-source', accountID: 'co_same' },
    ]);
    const start = await request(app).post('/api/account/merge/start').send({});
    const prep = await request(app)
      .post('/api/account/merge/prepare')
      .send({ nonce: start.body.nonce, adoptedFolderIds: [] });
    expect(prep.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-prepare.test.ts`
Expected: FAIL — `setupAccountMergeRoutes` is not exported.

- [ ] **Step 3: Implement the routes**

Append to `account-merge.ts`:

```typescript
import type { Express } from 'express';

type AuthApi = {
  api: {
    getSession(args: { headers: Record<string, string> }): Promise<
      { user?: { id: string; accountID?: string } } | null
    >;
  };
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function setupAccountMergeRoutes(
  app: Express,
  db: Database.Database,
  auth: AuthApi,
  config: { authSecret: string },
): void {
  app.post('/api/account/merge/start', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
      const targetJazzId = (session.user as { accountID?: string }).accountID;
      if (!targetJazzId) return res.status(400).json({ error: 'No Jazz account on session' });

      const nonce = createMergeNonce(config.authSecret);
      insertMergeRecord(db, {
        nonce,
        targetUserId: session.user.id,
        targetJazzId,
        now: nowSeconds(),
      });
      res.json({ nonce, targetJazzId });
    } catch (error) {
      console.error('[account-merge] start error:', error);
      res.status(500).json({ error: 'Failed to start merge' });
    }
  });

  app.post('/api/account/merge/prepare', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
      const sourceJazzId = (session.user as { accountID?: string }).accountID;
      if (!sourceJazzId) return res.status(400).json({ error: 'No Jazz account on session' });

      const { nonce, adoptedFolderIds } = req.body ?? {};
      if (typeof nonce !== 'string' || !Array.isArray(adoptedFolderIds)) {
        return res.status(400).json({ error: 'nonce and adoptedFolderIds are required' });
      }

      const rec = getMergeRecord(db, nonce, nowSeconds());
      if (!rec || rec.state !== 'pending') {
        return res.status(404).json({ error: 'Merge session not found or already used' });
      }
      if (rec.target_jazz_id === sourceJazzId) {
        return res.status(400).json({ error: 'Cannot merge an account into itself' });
      }

      db.prepare(
        `UPDATE account_merge
         SET source_user_id = ?, source_jazz_id = ?, adopted_folder_ids = ?, state = 'prepared'
         WHERE nonce = ?`,
      ).run(session.user.id, sourceJazzId, JSON.stringify(adoptedFolderIds), nonce);

      res.json({ success: true });
    } catch (error) {
      console.error('[account-merge] prepare error:', error);
      res.status(500).json({ error: 'Failed to prepare merge' });
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-prepare.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/jbr-jazz add packages/hierarchy/backend/src/account-merge.ts packages/hierarchy/backend/src/__tests__/account-merge-prepare.test.ts
git -C /home/john/src/jbr-jazz commit -m "feat: add merge start and prepare routes"
```

---

## Task 4: `finalize` route (repoint + consolidate emails)

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/account-merge.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/account-merge-finalize.test.ts`

**Interfaces:**
- Consumes: the `prepared` record from Task 3.
- Produces: `POST /api/account/merge/finalize` (authed as **target**) → body `{ nonce }` → `{ success: true }`. In one transaction: copies the target row's Jazz pointer columns onto the source row; moves `verified_email` rows from source→target (skipping `UNIQUE(email)` clashes); inserts the source row's primary email as a verified email on target (skip on clash); sets `state='finalized'`.

**IMPORTANT — column names:** the Jazz plugin's `user` columns may be stored as `accountID`/`encryptedCredentials` (camelCase) or snake_case depending on the BetterAuth adapter. Before writing the UPDATE, the implementer MUST confirm the real column names by running `PRAGMA table_info(user)` against the dev auth DB (path from the prod-deploy memory / `checklist/backend`) and use the exact names. The test below creates the columns as `accountID` / `encryptedCredentials`; adjust both test and code together if the live DB differs.

- [ ] **Step 1: Write the failing test**

```typescript
// account-merge-finalize.test.ts
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { initDb } from '../db.js';
import { setupAccountMergeRoutes } from '../account-merge.js';

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      email TEXT,
      accountID TEXT,
      encryptedCredentials TEXT
    );
  `);
  initDb(db);
  db.prepare('INSERT INTO user VALUES (?,?,?,?)').run('u-target', 't@x.com', 'co_target', 'TGT_CREDS');
  db.prepare('INSERT INTO user VALUES (?,?,?,?)').run('u-source', 's@x.com', 'co_source', 'SRC_CREDS');
  db.prepare('INSERT INTO verified_email (id, user_id, email, verified_at, created_at) VALUES (?,?,?,?,?)')
    .run('v-src1', 'u-source', 'extra@x.com', 1, 1);

  // session order: start(target), prepare(source), finalize(target)
  const sessions = [
    { id: 'u-target', accountID: 'co_target' },
    { id: 'u-source', accountID: 'co_source' },
    { id: 'u-target', accountID: 'co_target' },
  ];
  let i = 0;
  const auth = { api: { getSession: async () => ({ user: sessions[i++] }) } } as never;
  const app = express();
  app.use(express.json());
  setupAccountMergeRoutes(app, db, auth, { authSecret: 'secret' });
  return { app, db };
}

describe('merge finalize', () => {
  it('repoints source Jazz pointer and consolidates emails onto target', async () => {
    const { app, db } = setup();
    const start = await request(app).post('/api/account/merge/start').send({});
    const nonce = start.body.nonce;
    await request(app).post('/api/account/merge/prepare').send({ nonce, adoptedFolderIds: ['co_f1'] });

    const fin = await request(app).post('/api/account/merge/finalize').send({ nonce });
    expect(fin.status).toBe(200);

    // Source row now opens the TARGET Jazz account.
    const src = db.prepare('SELECT accountID, encryptedCredentials FROM user WHERE id = ?').get('u-source');
    expect(src).toEqual({ accountID: 'co_target', encryptedCredentials: 'TGT_CREDS' });

    // Source's verified email moved to target; source primary added as verified on target.
    const targetEmails = (db.prepare('SELECT email FROM verified_email WHERE user_id = ?').all('u-target') as { email: string }[])
      .map((r) => r.email)
      .sort();
    expect(targetEmails).toEqual(['extra@x.com', 's@x.com']);
    expect(db.prepare('SELECT count(*) c FROM verified_email WHERE user_id = ?').get('u-source')).toEqual({ c: 0 });

    // State finalized + idempotent (second call is a no-op success or 409; assert not double-applied).
    const rec = db.prepare('SELECT state FROM account_merge WHERE nonce = ?').get(nonce);
    expect(rec).toEqual({ state: 'finalized' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-finalize.test.ts`
Expected: FAIL — no `finalize` route (404).

- [ ] **Step 3: Implement finalize**

Append inside `setupAccountMergeRoutes` (before the closing brace):

```typescript
  app.post('/api/account/merge/finalize', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) return res.status(401).json({ error: 'Not authenticated' });
      const targetJazzId = (session.user as { accountID?: string }).accountID;

      const { nonce } = req.body ?? {};
      if (typeof nonce !== 'string') return res.status(400).json({ error: 'nonce is required' });

      const rec = getMergeRecord(db, nonce, nowSeconds());
      if (!rec) return res.status(404).json({ error: 'Merge session not found or expired' });
      if (rec.state === 'finalized') return res.json({ success: true }); // idempotent
      if (rec.state !== 'prepared') return res.status(409).json({ error: 'Merge not ready to finalize' });
      if (rec.target_user_id !== session.user.id || rec.target_jazz_id !== targetJazzId) {
        return res.status(403).json({ error: 'Session does not match the target account' });
      }
      if (!rec.source_user_id) return res.status(409).json({ error: 'Merge missing source' });

      const target = db
        .prepare('SELECT accountID, encryptedCredentials FROM user WHERE id = ?')
        .get(rec.target_user_id) as { accountID: string; encryptedCredentials: string } | undefined;
      const source = db
        .prepare('SELECT email FROM user WHERE id = ?')
        .get(rec.source_user_id) as { email: string } | undefined;
      if (!target || !source) return res.status(404).json({ error: 'Accounts not found' });

      const now = Date.now();
      db.transaction(() => {
        // 1. Repoint the source login at the target Jazz account.
        db.prepare('UPDATE user SET accountID = ?, encryptedCredentials = ? WHERE id = ?').run(
          target.accountID,
          target.encryptedCredentials,
          rec.source_user_id,
        );

        // 2. Move source verified emails to target, skipping UNIQUE(email) clashes.
        const srcEmails = db
          .prepare('SELECT id, email FROM verified_email WHERE user_id = ?')
          .all(rec.source_user_id) as { id: string; email: string }[];
        for (const row of srcEmails) {
          const clash = db
            .prepare('SELECT 1 FROM verified_email WHERE user_id = ? AND LOWER(email) = LOWER(?)')
            .get(rec.target_user_id, row.email);
          if (clash) {
            db.prepare('DELETE FROM verified_email WHERE id = ?').run(row.id);
          } else {
            db.prepare('UPDATE verified_email SET user_id = ? WHERE id = ?').run(
              rec.target_user_id,
              row.id,
            );
          }
        }

        // 3. Add the source's primary email as a verified email on target (skip on clash).
        const exists = db
          .prepare('SELECT 1 FROM verified_email WHERE LOWER(email) = LOWER(?)')
          .get(source.email);
        const isTargetPrimary = db
          .prepare('SELECT 1 FROM user WHERE id = ? AND LOWER(email) = LOWER(?)')
          .get(rec.target_user_id, source.email);
        if (!exists && !isTargetPrimary) {
          db.prepare(
            'INSERT INTO verified_email (id, user_id, email, verified_at, created_at) VALUES (?,?,?,?,?)',
          ).run(`vm_${nonce.slice(0, 16)}`, rec.target_user_id, source.email, now, now);
        }

        db.prepare("UPDATE account_merge SET state = 'finalized' WHERE nonce = ?").run(nonce);
      })();

      res.json({ success: true });
    } catch (error) {
      console.error('[account-merge] finalize error:', error);
      res.status(500).json({ error: 'Failed to finalize merge' });
    }
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-merge-finalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/jbr-jazz add packages/hierarchy/backend/src/account-merge.ts packages/hierarchy/backend/src/__tests__/account-merge-finalize.test.ts
git -C /home/john/src/jbr-jazz commit -m "feat: add merge finalize route"
```

---

## Task 5: Account-deletion guard for shared `accountID`

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/accounts.ts` (the `db.transaction` block, ~lines 34-51)
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/account-deletion-merged.test.ts`

**Interfaces:**
- Consumes: existing `setupAccountDeletionRoute(app, db, auth, opts)`.
- Produces: when another `user` row shares this row's `accountID`, deletion removes ONLY this row (and its cascaded sessions/oauth accounts) and does NOT delete `share_invites` by `sender_jazz_account_id` (the shared Jazz account is still live via the other row), nor the other row's data.

- [ ] **Step 1: Write the failing test**

```typescript
// account-deletion-merged.test.ts
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupAccountDeletionRoute } from '../accounts.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT, accountID TEXT);
    CREATE TABLE share_invites (token TEXT, sender_email TEXT, sender_jazz_account_id TEXT, recipient_email TEXT);
    CREATE TABLE verified_email (id TEXT, user_id TEXT, email TEXT);
  `);
  // Two rows share the same Jazz account (a merged pair).
  db.prepare('INSERT INTO user VALUES (?,?,?)').run('u-target', 't@x.com', 'co_shared');
  db.prepare('INSERT INTO user VALUES (?,?,?)').run('u-source', 's@x.com', 'co_shared');
  // An invite SENT by the shared Jazz account must survive deleting one door.
  db.prepare('INSERT INTO share_invites VALUES (?,?,?,?)').run('tok', 't@x.com', 'co_shared', 'r@x.com');
  return db;
}

describe('deletion guard for merged (shared accountID) rows', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('deleting the source door keeps the shared accounts invites and the other row', async () => {
    const auth = { api: { getSession: async () => ({ user: { id: 'u-source', email: 's@x.com', accountID: 'co_shared' } }) } };
    const app = express();
    setupAccountDeletionRoute(app, db, auth as never);
    const res = await request(app).delete('/api/account');
    expect(res.status).toBe(200);

    expect(db.prepare("SELECT 1 FROM user WHERE id = 'u-source'").get()).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM user WHERE id = 'u-target'").get()).toBeDefined();
    // Shared Jazz account still live via u-target → its sent invite must remain.
    expect(db.prepare("SELECT 1 FROM share_invites WHERE token = 'tok'").get()).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-deletion-merged.test.ts`
Expected: FAIL — the sent invite is deleted (current code deletes by `sender_jazz_account_id` unconditionally).

- [ ] **Step 3: Add the guard**

In `accounts.ts`, inside the route handler before the transaction, compute whether the Jazz account is shared, and gate the invite-deletion:

```typescript
      const jazzAccountId = (session.user as { accountID?: string }).accountID ?? null;

      // If another user row still points at the same Jazz account, this is one
      // door of a merged pair: deleting it must not touch the shared Jazz
      // account's invites or the sibling row.
      const sharedCount = jazzAccountId
        ? (db.prepare('SELECT COUNT(*) c FROM user WHERE accountID = ? AND id != ?').get(jazzAccountId, userId) as { c: number }).c
        : 0;
      const jazzAccountIsShared = sharedCount > 0;

      db.transaction(() => {
        if (jazzAccountId && !jazzAccountIsShared) {
          db.prepare('DELETE FROM share_invites WHERE sender_jazz_account_id = ?').run(jazzAccountId);
        } else if (!jazzAccountId) {
          db.prepare('DELETE FROM share_invites WHERE sender_email = ?').run(email);
        }
        // Received invites: only remove email matches when no sibling shares this email's account.
        if (!jazzAccountIsShared) {
          db.prepare('DELETE FROM share_invites WHERE recipient_email = ?').run(email);
        }
        db.prepare('DELETE FROM verified_email WHERE user_id = ?').run(userId);
        opts.extraCleanup?.(db, userId, email);
        db.prepare('DELETE FROM user WHERE id = ?').run(userId);
      })();
```

(Preserve the existing comments; this replaces the body of the transaction and the `jazzAccountId` line above it.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/account-deletion-merged.test.ts src/__tests__/accounts.test.ts`
Expected: PASS (new test AND the existing `accounts.test.ts` still green).

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/jbr-jazz add packages/hierarchy/backend/src/accounts.ts packages/hierarchy/backend/src/__tests__/account-deletion-merged.test.ts
git -C /home/john/src/jbr-jazz commit -m "fix: guard deletion of merged account door"
```

---

## Task 6: Mount merge routes

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/index.ts` (near the other `setup*Routes` calls, ~lines 218-230)
- Test: manual smoke (route presence) — covered by Task 3/4 unit tests; add a registration assertion if an app-level test harness exists.

**Interfaces:**
- Consumes: `setupAccountMergeRoutes`, `config.authSecret` (confirm the hierarchy `config` exposes the BetterAuth secret; if it is named differently, e.g. `config.betterAuthSecret`, use that exact name).

- [ ] **Step 1: Add the import + mount**

At the top of `index.ts` with the other imports:

```typescript
import { setupAccountMergeRoutes } from './account-merge.js';
```

Next to `setupVerifiedEmailRoutes(app, db, config);`:

```typescript
  // Account merge routes
  setupAccountMergeRoutes(app, db, auth, { authSecret: config.authSecret });
```

(If the hierarchy `config` type lacks `authSecret`, add it to the config interface and thread it from `checklist/backend/src/index.ts`, which already has `authSecret: process.env.BETTER_AUTH_SECRET ...`.)

- [ ] **Step 2: Build the package to verify types**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx tsc --noEmit`
Expected: no new errors referencing `account-merge`.

- [ ] **Step 3: Commit**

```bash
git -C /home/john/src/jbr-jazz add packages/hierarchy/backend/src/index.ts
git -C /home/john/src/jbr-jazz commit -m "feat: mount account merge routes"
```

---

## Task 7: Client API + Jazz data-move helpers

**Files:**
- Create: `/home/john/src/checklist/src/lib/account-merge.ts`
- Test: `/home/john/src/checklist/src/lib/__tests__/account-merge.test.ts`

**Interfaces:**
- Produces:
  - `startMerge(): Promise<{ nonce: string; targetJazzId: string }>` — POST `/api/account/merge/start`.
  - `prepareMerge(nonce: string, adoptedFolderIds: string[]): Promise<void>` — POST `/api/account/merge/prepare`.
  - `finalizeMerge(nonce: string): Promise<void>` — POST `/api/account/merge/finalize`.
  - `shareTopLevelFoldersTo(account, targetJazzId: string): Promise<string[]>` — as source, for each non-archived top-level folder in `account.root.folders`, add the target account to the folder's group as admin; return adopted folder ids.
  - `adoptFolders(account, folderIds: string[], sourceJazzId: string): Promise<void>` — as target, load each folder id and push into `account.root.folders`; best-effort `group.removeMember(sourceAccount)`.
  - Merge state persistence: `saveMergeState(s)`, `loadMergeState()`, `clearMergeState()` using `localStorage` key `checklist:merge`.

- [ ] **Step 1: Write the failing test (API helpers)**

```typescript
// account-merge.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeMerge, prepareMerge, startMerge } from '../account-merge';

afterEach(() => vi.restoreAllMocks());

describe('merge API helpers', () => {
  it('startMerge posts and returns nonce + targetJazzId', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ nonce: 'n1', targetJazzId: 'co_t' }),
    }) as never;
    const out = await startMerge();
    expect(out).toEqual({ nonce: 'n1', targetJazzId: 'co_t' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/account/merge/start',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('prepareMerge throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'nope' }),
    }) as never;
    await expect(prepareMerge('n1', ['co_f1'])).rejects.toThrow('nope');
  });

  it('finalizeMerge resolves on ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) }) as never;
    await expect(finalizeMerge('n1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/checklist && npx vitest run src/lib/__tests__/account-merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement API helpers + state persistence**

```typescript
// src/lib/account-merge.ts
import { Account, type Group } from 'jazz-tools';

const MERGE_KEY = 'checklist:merge';

export interface MergeState {
  nonce: string;
  targetJazzId: string;
  sourceJazzId?: string;
  adoptedFolderIds?: string[];
  phase: 'awaiting-source' | 'awaiting-target';
}

export function saveMergeState(s: MergeState): void {
  localStorage.setItem(MERGE_KEY, JSON.stringify(s));
}
export function loadMergeState(): MergeState | null {
  const raw = localStorage.getItem(MERGE_KEY);
  return raw ? (JSON.parse(raw) as MergeState) : null;
}
export function clearMergeState(): void {
  localStorage.removeItem(MERGE_KEY);
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Request failed: ${res.status}`);
  return data;
}

export async function startMerge(): Promise<{ nonce: string; targetJazzId: string }> {
  const d = await postJson('/api/account/merge/start', {});
  return { nonce: d.nonce as string, targetJazzId: d.targetJazzId as string };
}
export async function prepareMerge(nonce: string, adoptedFolderIds: string[]): Promise<void> {
  await postJson('/api/account/merge/prepare', { nonce, adoptedFolderIds });
}
export async function finalizeMerge(nonce: string): Promise<void> {
  await postJson('/api/account/merge/finalize', { nonce });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/checklist && npx vitest run src/lib/__tests__/account-merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test (Jazz data-move helpers)**

Add to the same test file, using the project's Jazz mocks (`createMockAccount`, `createMockCoList`, `createMockCoMap` from `jazz-mock`, re-exported via `src/test/setup.ts`). Model `account.root.folders` as a mock CoList of mock folders whose `$jazz.owner` is a fake group exposing `members`, `addMember`, `removeMember`, `$jazz.waitForSync`, `$jazz.loadedAs`. Assert that `shareTopLevelFoldersTo(account, 'co_target')`:
- calls `addMember` once per non-archived folder with role `'admin'`,
- returns the folder ids.

```typescript
import { shareTopLevelFoldersTo } from '../account-merge';

it('shareTopLevelFoldersTo adds target to each folder group and returns ids', async () => {
  const addMember = vi.fn();
  const group = {
    members: [],
    addMember,
    removeMember: vi.fn(),
    $jazz: { waitForSync: vi.fn().mockResolvedValue(undefined), loadedAs: {} },
  };
  const mkFolder = (id: string, archived = false) => ({ archived, $jazz: { id, owner: group } });
  const account = {
    root: { folders: [mkFolder('co_f1'), mkFolder('co_f2'), mkFolder('co_f3', true)] },
  } as never;

  vi.spyOn(Account, 'load').mockResolvedValue({ id: 'co_target' } as never);

  const ids = await shareTopLevelFoldersTo(account, 'co_target');
  expect(ids).toEqual(['co_f1', 'co_f2']); // archived folder skipped
  expect(addMember).toHaveBeenCalledTimes(2);
  expect(addMember).toHaveBeenCalledWith(expect.anything(), 'admin');
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd /home/john/src/checklist && npx vitest run src/lib/__tests__/account-merge.test.ts`
Expected: FAIL — `shareTopLevelFoldersTo` not exported.

- [ ] **Step 7: Implement the Jazz helpers**

Append to `src/lib/account-merge.ts`:

```typescript
type JazzFolder = { archived?: boolean; $jazz: { id: string; owner: Group } };
type JazzAccount = { root: { folders: JazzFolder[] } };

export async function shareTopLevelFoldersTo(
  account: JazzAccount,
  targetJazzId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const folder of account.root.folders) {
    if (!folder || folder.archived) continue;
    const group = folder.$jazz.owner;
    const alreadyMember = group.members.some((m: { id: string }) => m.id === targetJazzId);
    if (!alreadyMember) {
      const targetAccount = await Account.load(targetJazzId, { loadAs: group.$jazz.loadedAs });
      if (!targetAccount) throw new Error('Could not load the target account to share with.');
      group.addMember(targetAccount, 'admin');
      await group.$jazz.waitForSync();
    }
    ids.push(folder.$jazz.id);
  }
  return ids;
}

export async function adoptFolders(
  account: JazzAccount & { root: { folders: { push: (f: unknown) => void } & JazzFolder[] } },
  folderIds: string[],
  sourceJazzId: string,
): Promise<void> {
  const { co } = await import('jazz-tools');
  for (const id of folderIds) {
    if (account.root.folders.some((f) => f?.$jazz?.id === id)) continue; // idempotent
    const folder = await co.map({}).load(id, { loadAs: (account as never) });
    if (!folder) continue;
    account.root.folders.push(folder);
    // Best-effort: drop the now-detached source identity from the group.
    try {
      const group = (folder as unknown as JazzFolder).$jazz.owner;
      const sourceAccount = await Account.load(sourceJazzId, { loadAs: group.$jazz.loadedAs });
      if (sourceAccount) group.removeMember(sourceAccount);
    } catch {
      /* non-fatal: ghost admin is a dead, unloggable account */
    }
  }
}
```

> NOTE for implementer: `adoptFolders` loads a foreign CoValue generically. Confirm the correct Jazz load API in this version — the codebase uses `FolderNode` (`src/schema/tree.ts`); prefer `FolderNode.load(id, { loadAs: account })` over a bare `co.map({})` if `FolderNode` is importable here. Adjust the test's mock accordingly. The push target is the real `co.list(FolderNode)` from `account.root.folders`.

- [ ] **Step 8: Run to verify it passes**

Run: `cd /home/john/src/checklist && npx vitest run src/lib/__tests__/account-merge.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git -C /home/john/src/checklist add src/lib/account-merge.ts src/lib/__tests__/account-merge.test.ts
git -C /home/john/src/checklist commit -m "feat: add client account-merge helpers"
```

---

## Task 8: `MergeAccountFlow` component (state machine)

**Files:**
- Create: `/home/john/src/checklist/src/components/auth/MergeAccountFlow.tsx`
- Test: `/home/john/src/checklist/src/components/auth/__tests__/MergeAccountFlow.test.tsx`

**Interfaces:**
- Consumes: helpers from Task 7; `useAccount(Account, { resolve: ACCOUNT_RESOLVE })` from `@/lib/jazz`; `betterAuthClient` from `@/lib/auth-client` (for `signIn.social` / `signIn.email` / `signOut`).
- Produces: `<MergeAccountFlow />` default export driving:
  - **Entry (target, no merge state):** "Combine another account" → calls `startMerge()`, saves `{ nonce, targetJazzId, phase: 'awaiting-source' }`, then signs out and shows the source login choices (Google / Apple / email+password) with `callbackURL` carrying `?merge=<nonce>`.
  - **Resume phase `awaiting-source` (now signed in as source):** runs `shareTopLevelFoldersTo(account, targetJazzId)` → `prepareMerge(nonce, ids)` → save `{ ...state, adoptedFolderIds: ids, sourceJazzId: account.$jazz.id, phase: 'awaiting-target' }` → prompt "sign back into your main account" → sign out + login choices with `?merge=<nonce>`.
  - **Resume phase `awaiting-target` (signed back into target):** verify `account.$jazz.id === targetJazzId`; run `adoptFolders(account, adoptedFolderIds, sourceJazzId)` → `finalizeMerge(nonce)` → `clearMergeState()` → success screen.
  - Guard: if a resumed phase's current `account.$jazz.id` doesn't match what the phase expects, show an error with a "Cancel merge" button that calls `clearMergeState()`.

- [ ] **Step 1: Write the failing test**

Test the orchestration with mocked helpers and a mocked account. Mock `@/lib/account-merge` and `@/lib/auth-client`; render with merge state preset in `localStorage`.

```typescript
// MergeAccountFlow.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const helpers = {
  loadMergeState: vi.fn(),
  clearMergeState: vi.fn(),
  saveMergeState: vi.fn(),
  startMerge: vi.fn(),
  prepareMerge: vi.fn().mockResolvedValue(undefined),
  finalizeMerge: vi.fn().mockResolvedValue(undefined),
  shareTopLevelFoldersTo: vi.fn().mockResolvedValue(['co_f1']),
  adoptFolders: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/lib/account-merge', () => helpers);
vi.mock('@/lib/auth-client', () => ({ betterAuthClient: { signOut: vi.fn(), signIn: { social: vi.fn(), email: vi.fn() } } }));
vi.mock('@/lib/jazz', () => ({
  useAccount: () => ({ me: { $jazz: { id: 'co_target' }, root: { folders: [] } } }),
  Account: {},
  ACCOUNT_RESOLVE: {},
}));

import MergeAccountFlow from '../MergeAccountFlow';

afterEach(() => vi.clearAllMocks());

describe('MergeAccountFlow', () => {
  it('on awaiting-target phase, adopts folders and finalizes', async () => {
    helpers.loadMergeState.mockReturnValue({
      nonce: 'n1', targetJazzId: 'co_target', sourceJazzId: 'co_source',
      adoptedFolderIds: ['co_f1'], phase: 'awaiting-target',
    });
    render(<MergeAccountFlow />);
    await waitFor(() => expect(helpers.adoptFolders).toHaveBeenCalledWith(expect.anything(), ['co_f1'], 'co_source'));
    expect(helpers.finalizeMerge).toHaveBeenCalledWith('n1');
    expect(helpers.clearMergeState).toHaveBeenCalled();
    expect(await screen.findByText(/merged|complete|success/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/checklist && npx vitest run src/components/auth/__tests__/MergeAccountFlow.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `MergeAccountFlow.tsx`**

Build the component following the `VerifyEmailPage.tsx` structure (a `useEffect` that inspects state on mount, a `useState` status enum, and conditional JSX). Use `useAccount(Account, { resolve: ACCOUNT_RESOLVE })` to get `me`. Implement the three phases above. For login buttons reuse the existing OAuth/email sign-in calls (`betterAuthClient.signIn.social({ provider, callbackURL })`, `betterAuthClient.signIn.email({ email, password })`). Build `callbackURL` as `${window.location.origin}/?merge=${nonce}`. On the resume phases, run the async orchestration inside the mount effect and render loading/success/error accordingly. Keep the file focused (one responsibility: the merge flow UI + orchestration).

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/checklist && npx vitest run src/components/auth/__tests__/MergeAccountFlow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/checklist add src/components/auth/MergeAccountFlow.tsx src/components/auth/__tests__/MergeAccountFlow.test.tsx
git -C /home/john/src/checklist commit -m "feat: add merge account flow UI"
```

---

## Task 9: Route `?merge=<nonce>` + settings entry point

**Files:**
- Modify: `/home/john/src/checklist/src/App.tsx` (route detection ~lines 172-260)
- Modify: `/home/john/src/checklist/src/components/auth/LinkedEmailsSection.tsx` (or the settings container that renders it) — add a button that navigates to `/?merge=start` (a sentinel that opens `MergeAccountFlow` in its entry state).
- Test: `/home/john/src/checklist/src/App.test.tsx` (or extend existing App routing test if present)

**Interfaces:**
- Consumes: `MergeAccountFlow` (Task 8), `loadMergeState` (Task 7).
- Produces: when `new URLSearchParams(window.location.search).get('merge')` is non-null OR `loadMergeState()` returns a state, App renders `<MergeAccountFlow />` (lazy-loaded, wrapped in `<Suspense>`), taking precedence over `AuthGate` once authenticated.

- [ ] **Step 1: Write the failing test**

```typescript
// App routing for ?merge
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./components/auth/MergeAccountFlow', () => ({ default: () => <div data-testid="merge-flow" /> }));
// ...mock JazzProvider/auth as the existing App test does...

it('renders MergeAccountFlow when ?merge is present', async () => {
  Object.defineProperty(window, 'location', {
    value: { search: '?merge=n1', pathname: '/', origin: 'http://localhost', href: 'http://localhost/?merge=n1' },
    writable: true,
  });
  const { App } = await import('./App');
  render(<App />);
  expect(await screen.findByTestId('merge-flow')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/checklist && npx vitest run src/App.test.tsx`
Expected: FAIL — AuthGate renders instead of merge flow.

- [ ] **Step 3: Wire the route + lazy import**

In `App.tsx`, add a lazy import next to the others:

```typescript
const MergeAccountFlow = lazy(() => import('./components/auth/MergeAccountFlow'));
```

Add detection alongside the existing `const isVerifyEmailPage = ...` block:

```typescript
const params = new URLSearchParams(window.location.search);
const isMergeFlow = params.get('merge') !== null;
```

Add a branch in the conditional render (before `: ( <AuthGate /> )`), so merge takes precedence when active:

```typescript
) : isMergeFlow ? (
  <Suspense fallback={<LoadingScreen />}>
    <MergeAccountFlow />
  </Suspense>
```

- [ ] **Step 4: Add the settings entry point**

In `LinkedEmailsSection.tsx`, add a button below the linked-emails list:

```tsx
<button
  type="button"
  onClick={() => { window.location.href = '/?merge=start'; }}
  className="text-sm text-content-secondary underline"
>
  Combine another account into this one
</button>
```

`MergeAccountFlow` treats `merge=start` (no saved state) as the entry phase.

- [ ] **Step 5: Run to verify it passes**

Run: `cd /home/john/src/checklist && npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /home/john/src/checklist add src/App.tsx src/components/auth/LinkedEmailsSection.tsx src/App.test.tsx
git -C /home/john/src/checklist commit -m "feat: route merge flow and add settings entry"
```

---

## Task 10: E2E happy-path (two-login merge)

**Files:**
- Create: `/home/john/src/checklist/e2e/account-merge.spec.ts`

**Interfaces:**
- Consumes: the full stack. Follow the existing invite E2E harness conventions (`e2e/INVITE_TESTING.md`, GreenMail for email if needed). Email/password accounts avoid OAuth redirects in tests.

- [ ] **Step 1: Write the E2E test**

Author a Playwright spec that: creates account A (email+password) with one folder; signs out; creates account B with a different folder; from B's settings clicks "Combine another account", logs into A when prompted, then logs back into B; asserts B's list now shows both folders; asserts a fresh login with A's credentials lands on B's data (same folders visible). Use the existing E2E helpers for account creation and the dev servers. Mark `test.describe.configure({ mode: 'serial' })`.

- [ ] **Step 2: Run the E2E**

Run: `cd /home/john/src/checklist && npx playwright test e2e/account-merge.spec.ts`
Expected: PASS (start dev servers per existing E2E setup).

- [ ] **Step 3: Commit**

```bash
git -C /home/john/src/checklist add e2e/account-merge.spec.ts
git -C /home/john/src/checklist commit -m "test: add account merge e2e"
```

---

## Task 11: Full verification sweep

- [ ] **Step 1: Backend package checks**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 2: Frontend checks**

Run: `cd /home/john/src/checklist && npm run type-check && npm run lint && npm run test:run`
Expected: clean.

- [ ] **Step 3: If `@jbr-jazz/*` is consumed as a built `dist`**

The app imports `@jbr-jazz/hierarchy-backend` from `dist` (see diagnostics). Rebuild the package so the new routes ship: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npm run build` (confirm the script name). Then re-run `npm run type-check` in `checklist`.

- [ ] **Step 4: Final commit if any build artifacts/lockfiles changed**

```bash
git -C /home/john/src/checklist add -A && git -C /home/john/src/checklist commit -m "chore: rebuild for account merge" || true
```

---

## Self-Review Notes

- **Spec coverage:** verification model (Tasks 8/9 two-login), adopt-via-resharing (Task 7 `shareTopLevelFoldersTo`/`adoptFolders`), Jazz-pointer repoint (Task 4), email consolidation (Task 4), deletion guard (Task 5), merge record/coordination (Tasks 1–3), billing out-of-scope (no deletion path touched). All mapped.
- **Cross-repo build:** the app consumes `@jbr-jazz/hierarchy-backend` as built `dist` — Task 11 Step 3 rebuilds it. Watch this; unit tests run against `src` but the running app uses `dist`.
- **Column-name risk:** Task 4 hinges on the real `user` column names for the Jazz pointer — verified via `PRAGMA table_info(user)` before writing the UPDATE.
- **Jazz load API risk:** Task 7 `adoptFolders` generic load — prefer `FolderNode.load` if importable; adjust mock to match.
