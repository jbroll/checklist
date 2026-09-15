# Jazz-to-rowboat migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only export of prod's Jazz-era users and lists to a JSON backup, an import that turns that backup into a fresh auth DB plus rowboat rows, and rehearse both against checklist-test.

**Architecture:** The export is a standalone package in `migration/jazz-export/` that pins the Jazz-era `jazz-tools` and `better-auth`, decrypts each user's stored Jazz credentials and walks their tree as that account, writing nothing. The import runs from `backend/` so it uses the real `createServer`: step A builds an auth DB offline; step B signs a token per user from that DB and writes rows through a rowboat-cli data session. Pure mapping code (export JSON to rowboat rows) is split from the I/O so it can be unit-tested.

**Tech Stack:** TypeScript, tsx, vitest, jazz-tools 0.20.18, better-auth 1.5.6, better-sqlite3, `@jbroll/rowboat-cli` `openDataSession`, `@jbroll/rowboat-client` `fracKey`, `@jbroll/rowboat-schema` `compileSchema`.

**Spec:** `docs/superpowers/specs/2026-09-15-jazz-to-rowboat-migration-design.md`

## Global Constraints

- Never write to Jazz. The export loads with jazz-tools' default `Account` schema and `skipInboxLoad: true`, never a schema with a migration.
- No command or script prints a secret or list contents. Scripts print counts, ids and errors only.
- Backup directory `~/backups/checklist/<date>/` is mode 700; every file in it is mode 600.
- `migration/jazz-export/package.json` pins `jazz-tools` `0.20.18` and `better-auth` `1.5.6` exactly.
- `@jbroll/rowboat-cli` is added to `backend/package.json` devDependencies as `file:../../rowboat/packages/rowboat-cli`.
- Import copies `user` (without `accountID`, `encryptedCredentials`), `account` and `verification` rows with their ids. It never copies sessions.
- Folder `id` is the Jazz folder id. `created_by` is the better-auth user id. Dates are epoch-ms.
- Only folders whose owner account is the importing user's Jazz account are written.
- Checklist sends `appVersion: 0`.
- Pre-commit hooks run type-check, lint, unit and e2e tests. Never bypass them (`--no-verify` is forbidden).
- Commit messages end with the two attribution lines:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01Mt2vzwNxuDK8pWt6DuEdrx`.
- Work happens on the existing `jazz-migration` branch in `/home/john/src/checklist`. Never open a PR, never push.

## Facts implementers need

- Group mint: `POST ${syncBase}/groups` with JSON `{ parentGroup }` and `authorization: Bearer <token>`, response `{ groupId: string }`. The app omits `parentGroup` for a top-level folder and passes the parent folder's `owner_group_id` for a nested one (`src/lib/rowboat.tsx:72-92`).
- `syncBase` is `${ROWBOAT_URL}/db/${ROWBOAT_DATABASE_ID}/api/sync`.
- `rb.ordered` storage form is `{ [id]: { ...element, __order: <fracKey> } }`, built by `fracKey.between(prev, undefined)` in sequence (`src/services/folderListHandles.ts:17-27`). The app creates a folder with `g.folder.create({ ...row, items: {}, sessions: {} })`.
- App defaults for a new folder are in `src/services/folderOps.ts:32-50`: `sharing_mode 'private'`, `archived false`, `expanded false`, `default_items {}`, `show_zone_headings false`, `auto_categorize_enabled false`, `autocomplete_domain 'none'`.
- App defaults for `user_settings` are in `src/services/subscriptionService.ts:126-142`. Free-tier limits come from `DEFAULT_TIER_LIMITS.free` in `shared/billing.ts` (`maxItems: 3`, `retentionDays: 7`), which the app renames to `maxLists`/`sessionRetentionDays`.
- `openDataSession({ manifest, filename, syncUrl, author, token })` is in `../rowboat/packages/rowboat-cli/src/data-session.ts`. The package has no `exports` map, so import it as `@jbroll/rowboat-cli/src/data-session.js`. For reading rows back, follow `../rowboat/packages/rowboat-cli/src/verbs/query.ts` and `verbs/get.ts`.
- `createServer(config)` (`backend/src/index.ts:103`) runs migrations on `config.dbPath` and returns `{ app, db, signJWT }` without listening. `backend/src/__tests__/host.test.ts:12-33` has a complete test `ServerConfig`.
- Local dev rowboat: `npm run dev:rowboat` in the repo root starts it on :3020, provisions `rowboat-tenant.local.json` with JWKS `http://localhost:3001/api/auth/jwks` and issuer `http://localhost:8765/api/auth`, and writes `.env.tenant.local` with `ROWBOAT_DATABASE_ID` and `ROWBOAT_URL`. A token only verifies if the backend on :3001 serves the JWKS of the auth DB that signed it and `FRONTEND_URL=http://localhost:8765`.
- Jazz-era schema: `git show d51a192:src/schema/index.ts` and `git show d51a192:src/schema/tree.ts`. `hierarchyNodeBaseFields` (`../jbr-jazz/packages/hierarchy/shared/src/schema/base-fields.ts`) is `name`, `sharingMode: 'private'|'shared'|'public'`, `expanded?`, `archived?`, `archivedAt?: Date`, `createdBy`, `createdAt: Date`, `updatedAt: Date`.
- Jazz-era sync URL: `${JAZZ_PEER}/?key=${JAZZ_API_KEY}`, or `JAZZ_PEER` alone when no key is set (`git show d51a192:backend/scripts/rotate-agent.ts`, `getSyncServer`).
- Root vitest does not collect `migration/**` or `backend/**`. Backend vitest collects `backend/test/**/*.test.ts` and `backend/src/__tests__/**/*.test.ts`. Biome lints only `src/**` and root-level files.

## File map

```
migration/jazz-export/
  package.json            pinned deps, scripts: test, export
  tsconfig.json
  README.md               how to run export and import, backup layout
  src/format.ts           backup JSON types (shared with the import, type-only)
  src/credentials.ts      decryptCredentials
  src/schema.ts           migration-free copies of the Jazz-era CoValue schemas
  src/serialize.ts        loaded folder/settings values -> format types (pure)
  src/load.ts             walk one account's tree into an ExportUser
  src/export.ts           CLI: auth.db copy + secret + jazz.env -> backup files
  test/credentials.test.ts
  test/serialize.test.ts
  test/load.test.ts
backend/scripts/import-jazz-backup.ts   CLI: `auth-db` and `lists` subcommands
backend/scripts/jazz-import/
  target-config.ts        env file -> ServerConfig + syncBase
  map.ts                  ExportUser -> UserPlan (pure)
  auth-db.ts              buildAuthDb (step A)
  write-lists.ts          importUserLists (step B)
backend/test/jazz-import/
  fixtures/backup/        users.json, manifest.json, <userId>.json fixture backup
  map.test.ts
  auth-db.test.ts
  target-config.test.ts
```

---

### Task 1: Spike `rb.ordered` writes through `openDataSession`

Settles the spec's unverified risk before any mapping code exists. Nothing from this task is committed except a findings note.

**Files:**
- Create (scratch, deleted at the end): `backend/scripts/jazz-import/spike.ts`
- Modify: `backend/package.json` (add the rowboat-cli devDependency; this change is kept)
- Create: `docs/superpowers/plans/2026-09-15-jazz-spike-findings.md`

**Model:** `sonnet` — investigation across rowboat-cli, local rowboat and the backend, with judgment on what the results mean.

**Interfaces:**
- Produces: a findings note answering (1) does `db.create('folder', row)` accept `items`/`sessions` as ordered-map objects, or does it need JSON strings; (2) does a second fresh replica pull back the elements with `__order`; (3) does top-level `POST /groups` with no `parentGroup` succeed right after the first sync; (4) does the app show the folder and its items after signing in; (5) exact import path and call shape for reading rows back from a session.

- [ ] **Step 1: Add the devDependency**

In `backend/package.json` devDependencies add `"@jbroll/rowboat-cli": "file:../../rowboat/packages/rowboat-cli"` (keep alphabetical order), then run `npm install` in `backend/`. Confirm `backend/node_modules/@jbroll/rowboat-cli` is a symlink.

- [ ] **Step 2: Start local rowboat**

Run `npm run dev:rowboat` from the repo root with `run_in_background`. Wait until `.env.tenant.local` exists (check with Read on the next turn, do not poll with `sleep`).

- [ ] **Step 3: Start a backend on a scratch auth DB**

Pick a scratch path such as `/tmp/claude-spike/auth.db`. Start the backend in the background:

```bash
AUTH_DB_PATH=/tmp/claude-spike/auth.db FRONTEND_URL=http://localhost:8765 CHECKLIST_TEST_AUTH=1 BETTER_AUTH_SECRET=spike-secret-spike-secret-spike-secret bash scripts/with-tenant-env.sh npm run --prefix backend dev
```

Sign up one user with `curl -s -X POST http://localhost:3001/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:8765' -d '{"name":"spike","email":"spike@example.com","password":"spike-password-123"}'` and note the returned `user.id`.

- [ ] **Step 4: Write the spike script**

`backend/scripts/jazz-import/spike.ts`:

```ts
import { rmSync } from 'node:fs';
import { fracKey } from '@jbroll/rowboat-client';
import { openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';
import { compileSchema } from '@jbroll/rowboat-schema';
import { schema } from '../../../shared/schema.js';
import { createServer } from '../../src/index.js';

const [userId, databaseId] = process.argv.slice(2);
const rowboatUrl = 'http://localhost:3020';
const syncBase = `${rowboatUrl}/db/${databaseId}/api/sync`;

const server = await createServer({
  port: 0,
  host: '127.0.0.1',
  dbPath: '/tmp/claude-spike/auth.db',
  frontendUrl: 'http://localhost:8765',
  baseUrl: 'http://localhost:8765',
  authSecret: 'spike-secret-spike-secret-spike-secret',
  appName: 'spike',
  trustedOrigins: [],
  providers: [],
  rowboatDatabaseId: databaseId,
  rowboatUrl,
  rowboatAgentId: 'agent:checklist',
  emailAuth: { enabled: true, requireEmailVerification: false, minPasswordLength: 8, maxPasswordLength: 128 },
});
const token = await server.signJWT(userId);
const manifest = compileSchema(schema).manifest;

const a = await openDataSession({ manifest, filename: '/tmp/claude-spike/a.db', syncUrl: syncBase, author: userId, token });
await a.sync();

const res = await fetch(`${syncBase}/groups`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({}),
});
console.log('mint status', res.status);
const { groupId } = (await res.json()) as { groupId: string };

const k1 = fracKey.between(undefined, undefined);
const k2 = fracKey.between(k1, undefined);
const now = Date.now();
await a.db.create('folder', {
  id: 'spike-folder-1',
  owner_group_id: groupId,
  name: 'Spike list',
  type: 'template-folder',
  parent_id: null,
  sharing_mode: 'private',
  archived: false,
  expanded: false,
  created_by: userId,
  created_at: now,
  updated_at: now,
  items: {
    i1: { id: 'i1', name: 'Milk', type: 'item', path: 'Milk', expanded: false, sortOrder: 0, archived: false, defaultQuantity: '', notes: 'two percent', createdAt: now, __order: k1 },
    i2: { id: 'i2', name: 'Eggs', type: 'item', path: 'Eggs', expanded: false, sortOrder: 1, archived: true, defaultQuantity: '', createdAt: now, __order: k2 },
  },
  sessions: {
    s1: { id: 's1', itemStates: { i1: { selected: true, checked: false, selectedAt: now, notes: 'store brand' } }, archived: false, categoryExpanded: {}, viewMode: 'flat', selectedCount: 1, checkedCount: 0, remainingCount: 1, createdAt: now, lastActivityAt: now, __order: k1 },
  },
  default_items: { i1: true },
  show_zone_headings: false,
  auto_categorize_enabled: false,
  autocomplete_domain: 'none',
});
await a.sync();
a.close();

const b = await openDataSession({ manifest, filename: '/tmp/claude-spike/b.db', syncUrl: syncBase, author: userId, token });
await b.sync();
// Read the folder row back here using the mechanism verbs/get.ts uses, and print
// the raw items and sessions column values.
b.close();
server.db.close();
rmSync('/tmp/claude-spike/a.db', { force: true });
rmSync('/tmp/claude-spike/b.db', { force: true });
```

Fill in the read-back by copying the approach from `../rowboat/packages/rowboat-cli/src/verbs/get.ts`. If `db.create` rejects object values for `items`/`sessions`, try `JSON.stringify` of the same maps and record which one works.

- [ ] **Step 5: Run it**

Run from `backend/`: `npx tsx scripts/jazz-import/spike.ts <userId> <databaseId>` (databaseId from `rowboat-tenant.local.json`). Expected: `mint status 200` (or 201) and a read-back row whose items map has `i1` and `i2` with `__order` and whose sessions map has `s1`.

- [ ] **Step 6: Check the app renders it**

Start `bash scripts/with-tenant-env.sh npx vite` in the background, open `http://localhost:8765` with a short Playwright script (the repo has `@playwright/test`), sign in as `spike@example.com` / `spike-password-123`, and confirm "Spike list" appears and, when opened, shows "Milk" with its note. Take a screenshot into the scratch dir. If sign-in cannot be automated, record that and say so.

- [ ] **Step 7: Record findings and clean up**

Write `docs/superpowers/plans/2026-09-15-jazz-spike-findings.md` answering questions (1)-(5) from **Interfaces** with the exact outputs observed. Delete `spike.ts` and `/tmp/claude-spike/`. Stop the background processes.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json docs/superpowers/plans/2026-09-15-jazz-spike-findings.md
git commit -m "chore(backend): link rowboat-cli for the Jazz import; record the rb.ordered write spike"
```

If the spike shows `db.create` cannot write ordered maps at all, stop and report BLOCKED with the findings; later tasks depend on it.

---

### Task 2: Export package, backup format, credential decryption, serialization

**Files:**
- Create: `migration/jazz-export/package.json`, `migration/jazz-export/tsconfig.json`, `migration/jazz-export/.gitignore`
- Create: `migration/jazz-export/src/format.ts`, `src/credentials.ts`, `src/serialize.ts`
- Test: `migration/jazz-export/test/credentials.test.ts`, `test/serialize.test.ts`

**Model:** `sonnet` — new package scaffold plus pure code from mostly verbatim steps.

**Interfaces:**
- Produces (`src/format.ts`, consumed type-only by Tasks 3, 4, 6):

```ts
export type AutocompleteDomain = 'none' | 'grocery' | 'hardware' | 'outdoor' | 'all';

export interface ExportItem {
  id: string;
  name: string;
  type: 'category' | 'item';
  path: string;
  expanded: boolean;
  sortOrder: number;
  archived: boolean;
  defaultQuantity: string;
  notes?: string;
  createdAt: string; // ISO
}

export interface ExportItemState {
  selected: boolean;
  checked: boolean;
  selectedAt?: string;
  checkedAt?: string;
  notes?: string;
}

export interface ExportSession {
  id: string;
  itemStates: Record<string, ExportItemState>;
  archived: boolean;
  categoryExpanded: Record<string, boolean>;
  viewMode: 'zone-in-hierarchy' | 'flat';
  selectedCount: number;
  checkedCount: number;
  remainingCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ExportFolder {
  id: string;
  parentId: string | null; // null = in root.folders
  childIds: string[]; // Jazz order
  ownerAccountId: string;
  groupId: string;
  name: string;
  type: 'folder' | 'template-folder';
  sharingMode: 'private' | 'shared' | 'public';
  expanded?: boolean;
  archived?: boolean;
  archivedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items?: ExportItem[];
  sessions?: ExportSession[];
  defaultItems?: Record<string, boolean>;
  showZoneHeadings?: boolean;
  autocompleteDomain?: AutocompleteDomain;
  autoCategorizeEnabled?: boolean;
}

export interface ExportUserSettings {
  defaultAutocompleteDomain?: AutocompleteDomain;
  enableAutoCategorization?: boolean;
  subscriptionTier?: 'free' | 'plus' | 'premium' | 'enterprise';
  subscriptionStatus?: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta';
  subscriptionEndsAt?: number;
  maxLists?: number;
  sessionRetentionDays?: number;
  subscriptionSyncedAt?: number;
}

export interface ExportViewState {
  folderExpanded: Record<string, boolean>;
  templateCategoryExpanded: Record<string, Record<string, boolean>>;
  sessionCategoryExpanded: Record<string, Record<string, boolean>>;
}

export interface ExportUser {
  userId: string;
  accountId: string;
  rootFolderIds: string[]; // root.folders order
  folders: ExportFolder[]; // every folder reachable from the root, each id once
  userSettings: ExportUserSettings | null;
  viewState: ExportViewState | null;
}

export interface UsersFile {
  user: Record<string, unknown>[];
  account: Record<string, unknown>[];
  verification: Record<string, unknown>[];
}

export interface ManifestUser {
  userId: string;
  accountId: string;
  folders: number;
  items: number;
  sessions: number;
}

export interface Manifest {
  exportedAt: string;
  shareInvites: number;
  users: ManifestUser[];
  failed: { userId: string; error: string }[];
}
```

- Produces (`src/credentials.ts`): `decryptCredentials(encrypted: string, secret: string): Promise<JazzCredentials>` with `interface JazzCredentials { accountID: string; accountSecret: string; secretSeed?: unknown; provider?: string }`.
- Produces (`src/serialize.ts`): `serializeFolder(node: LoadedFolder, parentId: string | null, childIds: string[], ownerAccountId: string, groupId: string): ExportFolder`, `serializeSettings(s: LoadedSettings | null): ExportUserSettings | null`, `serializeViewState(v: ExportViewState | null): ExportViewState | null`, `countFolders(folders: ExportFolder[]): { folders: number; items: number; sessions: number }`. `LoadedFolder` is the plain shape of a loaded FolderNode's scalar fields with `Date` values (define it as an interface in `serialize.ts`, same fields as `ExportFolder` minus `id`/`parentId`/`childIds`/`ownerAccountId`/`groupId`, dates as `Date`, and items/sessions with `Date` fields).

- [ ] **Step 1: Scaffold the package**

`migration/jazz-export/package.json`:

```json
{
  "name": "checklist-jazz-export",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "export": "tsx src/export.ts"
  },
  "dependencies": {
    "better-auth": "1.5.6",
    "better-sqlite3": "^12.4.1",
    "dotenv": "^16.4.7",
    "jazz-tools": "0.20.18"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^4.0.15"
  },
  "allowScripts": {
    "better-sqlite3": true
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

`.gitignore`: `node_modules/`. Run `npm install` in `migration/jazz-export/`.

- [ ] **Step 2: Write `src/format.ts`** with exactly the types in **Interfaces**.

- [ ] **Step 3: Write the failing credential test**

`test/credentials.test.ts`:

```ts
import { symmetricEncrypt } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { decryptCredentials } from '../src/credentials.js';

const SECRET = 'fixture-secret-fixture-secret-fixture';

describe('decryptCredentials', () => {
  it('reverses symmetricEncrypt with the auth secret', async () => {
    const creds = { accountID: 'co_zAccount', secretSeed: [1, 2, 3], accountSecret: 'sealerSecret_z/signerSecret_z', provider: 'better-auth' };
    const data = await symmetricEncrypt({ key: SECRET, data: JSON.stringify(creds) });
    await expect(decryptCredentials(data, SECRET)).resolves.toEqual(creds);
  });

  it('fails with the wrong secret', async () => {
    const data = await symmetricEncrypt({ key: SECRET, data: JSON.stringify({ accountID: 'a', accountSecret: 'b' }) });
    await expect(decryptCredentials(data, 'another-secret-another-secret-another')).rejects.toThrow();
  });

  it('rejects credentials missing accountID or accountSecret', async () => {
    const data = await symmetricEncrypt({ key: SECRET, data: JSON.stringify({ accountID: 'a' }) });
    await expect(decryptCredentials(data, SECRET)).rejects.toThrow('accountSecret');
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `npx vitest run test/credentials.test.ts` in `migration/jazz-export/`. Expected: FAIL, cannot resolve `../src/credentials.js`.

- [ ] **Step 5: Implement `src/credentials.ts`**

```ts
import { symmetricDecrypt } from 'better-auth/crypto';

export interface JazzCredentials {
  accountID: string;
  accountSecret: string;
  secretSeed?: unknown;
  provider?: string;
}

export async function decryptCredentials(encrypted: string, secret: string): Promise<JazzCredentials> {
  const parsed = JSON.parse(await symmetricDecrypt({ key: secret, data: encrypted })) as Partial<JazzCredentials>;
  if (typeof parsed.accountID !== 'string') throw new Error('credentials missing accountID');
  if (typeof parsed.accountSecret !== 'string') throw new Error('credentials missing accountSecret');
  return parsed as JazzCredentials;
}
```

- [ ] **Step 6: Run the credential test.** Expected: 3 passed.

- [ ] **Step 7: Write the failing serialization test**

`test/serialize.test.ts` covers: dates become ISO strings; optional fields absent in the input stay absent in the output (no `undefined` keys, check with `Object.keys`); item `notes` and session item-state `notes`, `selectedAt`, `checkedAt` survive; `archivedAt` survives; `childIds`, `ownerAccountId`, `groupId`, `parentId` are passed through; `countFolders` sums items and sessions across folders and treats missing arrays as 0.

```ts
import { describe, expect, it } from 'vitest';
import { countFolders, serializeFolder, type LoadedFolder } from '../src/serialize.js';

const d = (s: string) => new Date(s);

const template: LoadedFolder = {
  name: 'Groceries',
  type: 'template-folder',
  sharingMode: 'shared',
  archived: true,
  archivedAt: d('2026-01-03T00:00:00.000Z'),
  createdBy: 'co_zOwner',
  createdAt: d('2026-01-01T00:00:00.000Z'),
  updatedAt: d('2026-01-02T00:00:00.000Z'),
  items: [
    { id: 'i1', name: 'Milk', type: 'item', path: 'Milk', expanded: false, sortOrder: 1, archived: false, defaultQuantity: '1', notes: 'whole', createdAt: d('2026-01-01T00:00:01.000Z') },
  ],
  sessions: [
    {
      id: 's1',
      itemStates: { i1: { selected: true, checked: true, selectedAt: d('2026-01-04T00:00:00.000Z'), checkedAt: d('2026-01-04T00:01:00.000Z'), notes: 'got 2' } },
      archived: true,
      categoryExpanded: {},
      viewMode: 'flat',
      selectedCount: 1,
      checkedCount: 1,
      remainingCount: 0,
      createdAt: d('2026-01-04T00:00:00.000Z'),
      lastActivityAt: d('2026-01-04T00:01:00.000Z'),
    },
  ],
  defaultItems: { i1: true },
  showZoneHeadings: true,
  autocompleteDomain: 'grocery',
  autoCategorizeEnabled: false,
};

describe('serializeFolder', () => {
  it('converts dates to ISO and keeps notes, archivedAt and ownership', () => {
    const out = serializeFolder(template, 'parent1', [], 'co_zOwner', 'co_zGroup');
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(out.archivedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(out.items?.[0]).toMatchObject({ notes: 'whole', createdAt: '2026-01-01T00:00:01.000Z' });
    expect(out.sessions?.[0].itemStates.i1).toEqual({ selected: true, checked: true, selectedAt: '2026-01-04T00:00:00.000Z', checkedAt: '2026-01-04T00:01:00.000Z', notes: 'got 2' });
    expect(out).toMatchObject({ parentId: 'parent1', ownerAccountId: 'co_zOwner', groupId: 'co_zGroup', sharingMode: 'shared' });
  });

  it('omits optionals that were never set', () => {
    const bare: LoadedFolder = { name: 'Box', type: 'folder', sharingMode: 'private', createdBy: 'a', createdAt: d('2026-01-01T00:00:00.000Z'), updatedAt: d('2026-01-01T00:00:00.000Z') };
    const out = serializeFolder(bare, null, ['c1', 'c2'], 'a', 'g');
    expect(Object.keys(out).sort()).toEqual(['childIds', 'createdAt', 'createdBy', 'groupId', 'id', 'name', 'ownerAccountId', 'parentId', 'sharingMode', 'type', 'updatedAt'].sort());
    expect(out.childIds).toEqual(['c1', 'c2']);
  });
});

describe('countFolders', () => {
  it('sums items and sessions, treating missing lists as empty', () => {
    const a = serializeFolder(template, null, [], 'a', 'g');
    const b = serializeFolder({ name: 'Box', type: 'folder', sharingMode: 'private', createdBy: 'a', createdAt: d('2026-01-01T00:00:00.000Z'), updatedAt: d('2026-01-01T00:00:00.000Z') }, null, [], 'a', 'g');
    expect(countFolders([a, b])).toEqual({ folders: 2, items: 1, sessions: 1 });
  });
});
```

`serializeFolder` needs the folder's own id. Add it as a field `id: string` on `LoadedFolder` (the loader fills it from `$jazz.id`), and set `id: 'f1'` / `id: 'f2'` in the fixtures above.

- [ ] **Step 8: Run it and see it fail.** Expected: FAIL, cannot resolve `../src/serialize.js`.

- [ ] **Step 9: Implement `src/serialize.ts`**

Write `LoadedFolder`, `LoadedItem`, `LoadedSession`, `LoadedItemState`, `LoadedSettings` interfaces mirroring the format types with `Date` in place of ISO strings. Implement with a helper that copies a key only when the value is not `undefined`:

```ts
function put<T extends object, K extends keyof T>(out: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) out[key] = value as T[K];
}
const iso = (d: Date) => d.toISOString();
const isoOpt = (d: Date | undefined) => (d === undefined ? undefined : d.toISOString());
```

`serializeFolder` builds the required fields, then `put`s each optional (`expanded`, `archived`, `archivedAt` via `isoOpt`, `items` mapped, `sessions` mapped, `defaultItems`, `showZoneHeadings`, `autocompleteDomain`, `autoCategorizeEnabled`). Items put `notes` only when set. Item states put `selectedAt`, `checkedAt`, `notes` only when set. `defaultItems`, `categoryExpanded`, `itemStates` keys are copied with `{ ...value }`. `serializeSettings` copies only set keys. `serializeViewState` returns a deep copy or null. `countFolders` sums `items?.length ?? 0` and `sessions?.length ?? 0`.

- [ ] **Step 10: Run the package tests.** `npm test` in `migration/jazz-export/`. Expected: all pass. Also run `npx tsc --noEmit -p .`. Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add migration/jazz-export/package.json migration/jazz-export/package-lock.json migration/jazz-export/tsconfig.json migration/jazz-export/.gitignore migration/jazz-export/src migration/jazz-export/test
git commit -m "feat(migration): Jazz export package with backup format, credential decryption and serialization"
```

---

### Task 3: Export loader and CLI

**Files:**
- Create: `migration/jazz-export/src/schema.ts`, `src/load.ts`, `src/export.ts`, `README.md`
- Test: `migration/jazz-export/test/load.test.ts`

**Model:** `opus` — jazz-tools 0.20.18 API work where a wrong call can write to prod Jazz; needs careful reading of the installed type definitions.

**Interfaces:**
- Consumes: `format.ts` types, `decryptCredentials`, `serializeFolder`, `serializeSettings`, `serializeViewState`, `countFolders` from Task 2.
- Produces: `loadTree(account: Account, userId: string): Promise<ExportUser>` in `src/load.ts`, where `account` is any loaded jazz-tools `Account` instance; and the CLI `npm run export -- --backup-dir <dir> --secrets <path>`.

- [ ] **Step 1: Read the jazz-tools API you will call**

In `migration/jazz-export/node_modules/jazz-tools/dist/`, read the type definitions for `startWorker` (`worker/index.d.ts`: argument and return shape, including how to shut the worker down), `CoMap` schema `.load(id, { loadAs, resolve })`, `$jazz.id`, `$jazz.owner`, `$jazz.refs`, `$jazz.raw.get`, and `jazz-tools/testing` (`createJazzTestAccount`, `setupJazzTestSync`). Write down in your report the exact signatures you used. Do not guess.

- [ ] **Step 2: Write `src/schema.ts`**

Copies of the Jazz-era schemas from `git show d51a192:src/schema/tree.ts` and `d51a192:src/schema/index.ts`, with `hierarchyNodeBaseFields` inlined (fields listed in **Facts implementers need**). Export `FolderNode`, `ViewState`, `UserSettings`, `ListsRoot`. Do not export or define an account schema, and do not add `.withMigration` or `.resolved` anywhere. Keep the `children`, `parent` and `owner` getters.

- [ ] **Step 3: Write the failing loader test**

`test/load.test.ts` builds an in-memory account with `createJazzTestAccount` (with `setupJazzTestSync` first if the API requires it), creates a root with the Task 3 schemas, and asserts `loadTree` output:

- root with two top-level folders `A` (folder) and `T` (template-folder with 2 items, 1 session carrying item-state notes)
- `A.children` holds folder `B`, and `B.children` holds template `C` (depth 2 nesting, which the Jazz default resolve does not load)
- `T` pushed a second time into `root.folders` (duplicate reference)
- a folder `S` owned by a second test account, created in a group where the first account has been added as a member, pushed into the first account's `root.folders`
- `userSettings` with `enableAutoCategorization: false`; `viewState` with one `folderExpanded` entry

Expected assertions:

```ts
expect(out.rootFolderIds).toEqual([A.$jazz.id, T.$jazz.id, T.$jazz.id, S.$jazz.id]);
expect(out.folders.map((f) => f.id).sort()).toEqual([A, B, C, S, T].map((f) => f.$jazz.id).sort());
expect(out.folders.find((f) => f.id === C.$jazz.id)?.parentId).toBe(B.$jazz.id);
expect(out.folders.find((f) => f.id === A.$jazz.id)?.childIds).toEqual([B.$jazz.id]);
expect(out.folders.find((f) => f.id === S.$jazz.id)?.ownerAccountId).toBe(other.$jazz.id);
expect(out.folders.find((f) => f.id === T.$jazz.id)?.ownerAccountId).toBe(me.$jazz.id);
expect(out.folders.find((f) => f.id === T.$jazz.id)?.sessions?.[0].itemStates).toBeDefined();
expect(out.userSettings).toEqual({ enableAutoCategorization: false });
expect(out.viewState?.folderExpanded).toEqual({ [T.$jazz.id]: true });
expect(out.accountId).toBe(me.$jazz.id);
```

`rootFolderIds` keeps duplicates in root order; `folders` holds each id once.

- [ ] **Step 4: Run it and see it fail.** Expected: FAIL, `loadTree` not found.

- [ ] **Step 5: Implement `src/load.ts`**

- Resolve the root id from the account without an account schema (for example `account.$jazz.raw.get('root')`). Throw `account has no root` when absent.
- `ListsRoot.load(rootId, { loadAs: account, resolve: { folders: { $each: true }, viewState: true, userSettings: true } })`. Throw when it returns null or not-loaded, naming the root id.
- Walk depth-first from `root.folders` in order. For each folder id not yet visited, load it with `FolderNode.load(id, { loadAs: account, resolve: { children: { $each: true } } })`, read the owner account id from the `owner` ref id (not by loading the account), and the group id from `$jazz.owner.$jazz.id`. Serialize with `serializeFolder` passing `parentId` (null at the top), `childIds` in list order, then recurse into children.
- A folder that fails to load throws with its id. Do not skip silently.
- Never call `$jazz.set`, `$jazz.push`, `create`, `addMember` or anything else that writes.

- [ ] **Step 6: Run the loader test.** Expected: pass.

- [ ] **Step 7: Implement `src/export.ts`**

```
Usage: npm run export -- --backup-dir <dir> --secrets <backend/secrets.env>
```

Behavior, in order:

1. Require `<dir>/auth.db` and `<dir>/jazz.env`. `chmodSync(dir, 0o700)`. Refuse to run if `<dir>/manifest.json` already exists.
2. Read `BETTER_AUTH_SECRET` from `--secrets` with `dotenv.parse`. Read `JAZZ_PEER` and `JAZZ_API_KEY` (or `VITE_JAZZ_API_KEY`) from `jazz.env`. Build the sync URL as in **Facts implementers need**. Exit 1 with a message naming the missing variable if the secret or peer is missing.
3. Open `auth.db` with `new Database(path, { readonly: true, fileMustExist: true })`. Read all rows of `user`, `account`, `verification` (an absent table yields `[]`), and `SELECT COUNT(*) FROM share_invites` (0 if absent).
4. For each user row with a non-empty `encryptedCredentials`: decrypt, `startWorker({ accountID, accountSecret, syncServer, skipInboxLoad: true })` with no `AccountSchema`, `loadTree(worker, user.id)`, write `<dir>/<userId>.json` with mode 0o600, shut the worker down. On any error push `{ userId, error: message }` to `failed` and continue. Users without credentials are listed in `failed` with `error: 'no encryptedCredentials'`.
5. Write `users.json` (`UsersFile`, full rows including `accountID`/`encryptedCredentials` as stored) and `manifest.json` (`Manifest`), both mode 0o600.
6. Print one line per user, `<userId> folders=<n> items=<n> sessions=<n>`, then `failed=<n>` and each failure as `<userId> <error>`. Print nothing else from the data. Exit 1 if `failed` is non-empty.

Write every file with `writeFileSync(path, json, { mode: 0o600 })` and `chmodSync(path, 0o600)` after, since an existing file keeps its old mode.

- [ ] **Step 8: Smoke-test the CLI's failure paths locally**

Make a scratch dir with a copy of a Jazz-free sqlite file containing an empty `user` table and a `jazz.env` with `JAZZ_PEER=wss://invalid.example`. Run the export. Expected: exits 0 with `failed=0` and a manifest with no users. Then remove `jazz.env` and run again. Expected: exits 1 naming `jazz.env`.

- [ ] **Step 9: Write `migration/jazz-export/README.md`**

Short: what the two scripts do, the backup directory layout (`auth.db`, `jazz.env`, `users.json`, `manifest.json`, `<userId>.json`), modes, the export command, the two import commands (Task 6 names them: `npx tsx scripts/import-jazz-backup.ts auth-db ...` and `... lists ...`), and that this directory and `backend/scripts/import-jazz-backup.ts` plus `backend/scripts/jazz-import/` are deleted after the prod cutover.

- [ ] **Step 10: Run package tests and type-check.** `npm test` and `npx tsc --noEmit -p .` in `migration/jazz-export/`. Expected: pass, no errors.

- [ ] **Step 11: Commit**

```bash
git add migration/jazz-export
git commit -m "feat(migration): read-only Jazz tree loader and export CLI"
```

---

### Task 4: Import mapping (pure)

**Files:**
- Create: `backend/scripts/jazz-import/map.ts`
- Create: `backend/test/jazz-import/fixtures/backup/users.json`, `manifest.json`, `user-owner.json`, `user-other.json`
- Test: `backend/test/jazz-import/map.test.ts`

**Model:** `sonnet` — pure logic from a precise spec, with several edge cases.

**Interfaces:**
- Consumes: `ExportUser`, `ExportFolder` from `../../../migration/jazz-export/src/format.js` (type-only import); spike findings from Task 1 on whether ordered columns are objects or JSON strings.
- Produces:

```ts
import type { SessionData, TemplateItem, UserSettingsRow } from '../../../shared/schema.js';

export type OrderedMap<T> = Record<string, T & { __order: string }>;

export interface FolderRowDraft {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  sharing_mode: string;
  archived: boolean;
  expanded: boolean;
  created_by: string;
  created_at: number;
  updated_at: number;
  items: OrderedMap<TemplateItem>;
  sessions: OrderedMap<SessionData>;
  default_items: Record<string, boolean>;
  show_zone_headings: boolean;
  auto_categorize_enabled: boolean;
  autocomplete_domain: string;
}

export interface NotCarried {
  siblingOrderParents: number; // parents (root counts as one) with 2+ imported children
  archivedAt: string[]; // imported folder ids that had archivedAt
  foreignFolders: string[]; // skipped: owner account is not this user's
  ownedUnderForeign: string[]; // skipped: owned by this user but under a foreign ancestor
}

export interface UserPlan {
  userId: string;
  folders: FolderRowDraft[]; // parents before children
  userSettings: UserSettingsRow;
  notCarried: NotCarried;
  counts: { folders: number; items: number; sessions: number };
}

export function planUser(user: ExportUser): UserPlan;
```

`owner_group_id` is not on `FolderRowDraft`; Task 6 adds it after minting.

- [ ] **Step 1: Write the fixture backup**

`backend/test/jazz-import/fixtures/backup/user-owner.json` is an `ExportUser` with `userId: 'user-owner'`, `accountId: 'co_zOwner'`, and:

- `F1` top-level `folder`, children `[T1, F2]`, `expanded: true`, no `archived`
- `T1` template under `F1`: 3 items with `sortOrder` 2, 0, 0 (the two 0s differ in `createdAt`), one item has `notes`, one item `archived: true`; 2 sessions with different `createdAt`, one `archived: true`, one with an item state carrying `notes`, `selectedAt`, `checkedAt`; `defaultItems`; `showZoneHeadings: true`; `autocompleteDomain: 'grocery'`; `autoCategorizeEnabled: true`
- `F2` folder under `F1` with `archived: true` and `archivedAt`, children `[T2]`
- `T2` template under `F2` with no `items`, `sessions`, `defaultItems`, `showZoneHeadings`, `autocompleteDomain`, `autoCategorizeEnabled` (all missing optionals)
- `S1` top-level template with `ownerAccountId: 'co_zOther'`, children `[S2]`
- `S2` folder under `S1` with `ownerAccountId: 'co_zOwner'`
- `rootFolderIds: ['F1', 'S1']`
- `userSettings: { enableAutoCategorization: false, subscriptionTier: 'plus' }`
- `viewState: { folderExpanded: { F1: true }, templateCategoryExpanded: { T1: { c: true } }, sessionCategoryExpanded: {} }`

`user-other.json`: `userId: 'user-other'`, `accountId: 'co_zOther'`, root `[S1]` with `S1` owned by `co_zOther`, `userSettings: null`, `viewState: null`.

`users.json`: two `user` rows (`id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`, `accountID`, `encryptedCredentials`) and matching `account` rows (`id`, `accountId`, `providerId: 'credential'`, `userId`, `password`, `createdAt`, `updatedAt`), `verification: []`. Password values are placeholders here; Task 5 generates real hashes in its test.

`manifest.json`: counts computed from the two files, `failed: []`, `shareInvites: 1`.

- [ ] **Step 2: Write the failing mapping test**

`backend/test/jazz-import/map.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExportUser } from '../../../migration/jazz-export/src/format.js';
import { planUser } from '../../scripts/jazz-import/map.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures/backup', name), 'utf8')) as ExportUser;

const orderOf = (map: Record<string, { __order: string }>) =>
  Object.entries(map).sort(([, a], [, b]) => (a.__order < b.__order ? -1 : 1)).map(([id]) => id);

describe('planUser', () => {
  const plan = planUser(fixture('user-owner.json'));
  const byId = new Map(plan.folders.map((f) => [f.id, f]));

  it('writes owned folders parents before children and skips foreign subtrees', () => {
    expect(plan.folders.map((f) => f.id)).toEqual(['F1', 'T1', 'F2', 'T2']);
    expect(byId.get('T2')?.parent_id).toBe('F2');
    expect(byId.get('F1')?.parent_id).toBeNull();
    expect(plan.notCarried.foreignFolders).toEqual(['S1']);
    expect(plan.notCarried.ownedUnderForeign).toEqual(['S2']);
  });

  it('remaps created_by to the user id and dates to epoch-ms', () => {
    const t1 = byId.get('T1');
    expect(t1?.created_by).toBe('user-owner');
    expect(typeof t1?.created_at).toBe('number');
    expect(Object.values(t1?.items ?? {}).every((i) => typeof i.createdAt === 'number')).toBe(true);
  });

  it('orders items by sortOrder then createdAt and sessions by createdAt', () => {
    const t1 = byId.get('T1');
    // fill the expected ids from the fixture: the two sortOrder-0 items oldest first, then sortOrder 2
    expect(orderOf(t1?.items ?? {})).toEqual(['<item sortOrder 0 older>', '<item sortOrder 0 newer>', '<item sortOrder 2>']);
    expect(orderOf(t1?.sessions ?? {})).toEqual(['<older session>', '<newer session>']);
  });

  it('keeps notes, archived items and archived sessions', () => {
    const t1 = byId.get('T1');
    const items = Object.values(t1?.items ?? {});
    expect(items.some((i) => i.notes !== undefined)).toBe(true);
    expect(items.some((i) => i.archived)).toBe(true);
    const sessions = Object.values(t1?.sessions ?? {});
    expect(sessions.some((s) => s.archived)).toBe(true);
    const state = sessions.flatMap((s) => Object.values(s.itemStates)).find((st) => st.notes !== undefined);
    expect(typeof state?.selectedAt).toBe('number');
    expect(typeof state?.checkedAt).toBe('number');
  });

  it('fills app defaults for missing optionals', () => {
    expect(byId.get('T2')).toMatchObject({
      items: {},
      sessions: {},
      default_items: {},
      show_zone_headings: false,
      auto_categorize_enabled: false,
      autocomplete_domain: 'none',
      expanded: false,
    });
    expect(byId.get('F1')?.archived).toBe(false);
  });

  it('reports what it cannot carry', () => {
    expect(plan.notCarried.archivedAt).toEqual(['F2']);
    expect(plan.notCarried.siblingOrderParents).toBe(1); // F1 has T1 and F2; root has only F1 imported
  });

  it('maps user settings and view state onto the singleton row', () => {
    expect(plan.userSettings).toMatchObject({
      id: 'user-owner',
      owner_group_id: 'user-owner',
      enable_auto_categorization: false,
      subscription_tier: 'plus',
      subscription_status: 'beta',
      default_autocomplete_domain: 'none',
      max_lists: 3,
      session_retention_days: 7,
      subscription_ends_at: 0,
      subscription_synced_at: 0,
      view_folder_expanded: { F1: true },
      view_template_category_expanded: { T1: { c: true } },
      view_session_category_expanded: {},
    });
  });

  it('counts what it will write', () => {
    expect(plan.counts).toEqual({ folders: 4, items: 3, sessions: 2 });
  });

  it('builds default settings when the export has none', () => {
    const other = planUser(fixture('user-other.json'));
    expect(other.folders.map((f) => f.id)).toEqual(['S1']);
    expect(other.userSettings).toMatchObject({ id: 'user-other', enable_auto_categorization: true, view_folder_expanded: {} });
  });
});
```

Replace the `<...>` placeholders in the ordering test with the actual ids you gave those items and sessions in Step 1.

- [ ] **Step 3: Run it and see it fail**

Run in `backend/`: `npx vitest run test/jazz-import/map.test.ts`. Expected: FAIL, cannot resolve `map.js`.

- [ ] **Step 4: Implement `map.ts`**

- Walk from `rootFolderIds` depth-first using `childIds`, visiting each id once (first occurrence wins). A folder whose `ownerAccountId !== user.accountId` goes to `foreignFolders` and its descendants are not written; owned descendants of it go to `ownedUnderForeign`.
- Epoch-ms via `Date.parse(iso)`. Optional date fields become numbers only when present.
- Items: sort a copy by `sortOrder`, then `Date.parse(createdAt)`. Sessions: sort by `Date.parse(createdAt)`. Build the ordered map with `fracKey.between(prev, undefined)` from `@jbroll/rowboat-client`, exactly like `toOrderedMap` in `src/services/folderListHandles.ts:17-27`. Keep `notes` only when present.
- If the Task 1 findings say ordered columns must be JSON strings at `db.create`, keep `FolderRowDraft` as objects here anyway and have Task 6 stringify at write time.
- Defaults: `sharing_mode` from `sharingMode`; `archived ?? false`; `expanded ?? false`; `default_items ?? {}`; `show_zone_headings ?? false`; `auto_categorize_enabled ?? false`; `autocomplete_domain ?? 'none'`.
- `siblingOrderParents`: count of parents (with the root as one parent) that end up with two or more imported children.
- `userSettings`: start from the values in `buildDefaultUserSettings` (`src/services/subscriptionService.ts:126-142`) with `max_lists: DEFAULT_TIER_LIMITS.free.maxItems` and `session_retention_days: DEFAULT_TIER_LIMITS.free.retentionDays` imported from `../../../shared/billing.js`, then override each column whose export field is present, and the three `view_*` columns from `viewState`.
- `counts` covers written folders only.

- [ ] **Step 5: Run the mapping test.** Expected: all pass.

- [ ] **Step 6: Type-check.** Run `npm run type-check` in the repo root. Expected: no errors. If the backend project cannot resolve `@jbroll/rowboat-client` from `backend/scripts/`, report it rather than adding a path alias.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/jazz-import/map.ts backend/test/jazz-import
git commit -m "feat(backend): map a Jazz export user to rowboat folder and settings rows"
```

---

### Task 5: Auth DB builder (import step A)

**Files:**
- Create: `backend/scripts/jazz-import/target-config.ts`, `backend/scripts/jazz-import/auth-db.ts`
- Test: `backend/test/jazz-import/target-config.test.ts`, `backend/test/jazz-import/auth-db.test.ts`

**Model:** `sonnet` — backend integration with better-auth tables and supertest.

**Interfaces:**
- Consumes: `createServer`, `ServerConfig` from `backend/src/index.ts`; `UsersFile` from the format module.
- Produces:

```ts
// target-config.ts
export interface Target { config: ServerConfig; syncBase: string }
export function loadTarget(envPath: string, dbPath: string): Target;

// auth-db.ts
export interface AuthDbResult { users: number; accounts: number; verifications: number; jwksKeyId: string }
export async function buildAuthDb(outPath: string, target: Target, users: UsersFile): Promise<AuthDbResult>;
```

- [ ] **Step 1: Write the failing target-config test**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTarget } from '../../scripts/jazz-import/target-config.js';

describe('loadTarget', () => {
  it('builds a ServerConfig and sync base from an env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'target-'));
    const env = join(dir, 'secrets.env');
    writeFileSync(env, 'BETTER_AUTH_SECRET=s3cret-s3cret-s3cret-s3cret\nFRONTEND_URL=https://checklist-test.example\nROWBOAT_DATABASE_ID=db_abc\nROWBOAT_URL=https://rowboat.example\n');
    const t = loadTarget(env, join(dir, 'auth.db'));
    expect(t.syncBase).toBe('https://rowboat.example/db/db_abc/api/sync');
    expect(t.config).toMatchObject({ authSecret: 's3cret-s3cret-s3cret-s3cret', baseUrl: 'https://checklist-test.example', frontendUrl: 'https://checklist-test.example', rowboatDatabaseId: 'db_abc', dbPath: join(dir, 'auth.db') });
  });

  it('names a missing variable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'target-'));
    const env = join(dir, 'secrets.env');
    writeFileSync(env, 'BETTER_AUTH_SECRET=x\n');
    expect(() => loadTarget(env, join(dir, 'auth.db'))).toThrow('FRONTEND_URL');
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run test/jazz-import/target-config.test.ts` in `backend/`. Expected: FAIL.

- [ ] **Step 3: Implement `target-config.ts`**

Parse with `dotenv.parse(readFileSync(envPath))`. Require `BETTER_AUTH_SECRET`, `FRONTEND_URL`, `ROWBOAT_DATABASE_ID`, `ROWBOAT_URL`, throwing `missing <NAME> in <envPath>`; the error must never include a value. Build `ServerConfig` like `testConfig()` in `backend/src/__tests__/host.test.ts:12-33`: `port: 0`, `host: '127.0.0.1'`, `dbPath`, `frontendUrl` and `baseUrl` from `FRONTEND_URL`, `authSecret`, `appName: 'CheckList'`, `trustedOrigins: [FRONTEND_URL]`, `providers: []`, `rowboatDatabaseId`, `rowboatUrl`, `rowboatAgentId: 'agent:checklist'`, `emailAuth: { enabled: true, requireEmailVerification: true, minPasswordLength: 8, maxPasswordLength: 128 }`.

- [ ] **Step 4: Run the target-config test.** Expected: pass.

- [ ] **Step 5: Write the failing auth-db test**

`backend/test/jazz-import/auth-db.test.ts` simulates prod: build a source DB with `createServer` on a temp file and sign up a user through supertest (config with `requireEmailVerification: false`), read its `user`, `account` and `verification` rows, add `accountID: 'co_zOwner'` and `encryptedCredentials: 'deadbeef'` to the user row object, and insert one `session` row count check on the source. Then:

```ts
const out = join(dir, 'imported.db');
const result = await buildAuthDb(out, loadTarget(envFile, out), usersFile);
expect(result).toMatchObject({ users: 1, accounts: 1 });

const db = new Database(out, { readonly: true });
const cols = (db.prepare('PRAGMA table_info(user)').all() as { name: string }[]).map((c) => c.name);
expect(cols).not.toContain('encryptedCredentials');
expect(db.prepare('SELECT COUNT(*) AS n FROM session').get()).toEqual({ n: 0 });
const row = db.prepare('SELECT id, emailVerified FROM user').get() as { id: string; emailVerified: unknown };
expect(row.id).toBe(sourceUserId);
const kid = (db.prepare('SELECT id FROM jwks').get() as { id: string }).id;
expect(result.jwksKeyId).toBe(kid);
db.close();

// The copied scrypt hash verifies on a server started from the imported file.
const server = await createServer({ ...loadTarget(envFile, out).config, emailAuth: { enabled: true, requireEmailVerification: false, minPasswordLength: 8, maxPasswordLength: 128 } });
const signIn = await request(server.app).post('/api/auth/sign-in/email').set('origin', FRONTEND).send({ email, password });
expect(signIn.status).toBe(200);
const jwks = await request(server.app).get('/api/auth/jwks');
expect((jwks.body as { keys: { kid: string }[] }).keys.map((k) => k.kid)).toContain(kid);
server.db.close();
```

Also assert `buildAuthDb` rejects when `outPath` already exists (`already exists`). Before writing the kid assertion, open a DB from `createServer` + `signJWT` and check which `jwks` column the served `kid` equals; adjust the query to that column if it is not `id`.

- [ ] **Step 6: Run it and see it fail.** Expected: FAIL, `auth-db.js` not found.

- [ ] **Step 7: Implement `auth-db.ts`**

1. Throw `<outPath> already exists` if the file exists.
2. `const server = await createServer({ ...target.config, dbPath: outPath })`.
3. For each of `user`, `account`, `verification`: read the destination's column names with `PRAGMA table_info`, and for each source row insert only keys that are destination columns, excluding `accountID` and `encryptedCredentials`. Use one transaction. Throw if a source row lacks `id`.
4. `await server.signJWT(users.user[0]?.id ?? 'import-key-probe')` so the `jwks` row exists.
5. Read the key id, count rows, `server.db.close()`, `chmodSync(outPath, 0o600)`, return the counts.

- [ ] **Step 8: Run both jazz-import test files and the full backend suite.** `npx vitest run test/jazz-import` then `npm test` in `backend/`. Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/scripts/jazz-import/target-config.ts backend/scripts/jazz-import/auth-db.ts backend/test/jazz-import/target-config.test.ts backend/test/jazz-import/auth-db.test.ts
git commit -m "feat(backend): build a rowboat-era auth DB from a Jazz backup"
```

---

### Task 6: List writer, import CLI and local end-to-end run

**Files:**
- Create: `backend/scripts/jazz-import/write-lists.ts`, `backend/scripts/import-jazz-backup.ts`
- Modify: `backend/package.json` (script `"import-jazz": "tsx scripts/import-jazz-backup.ts"`)
- Modify: `migration/jazz-export/README.md` (confirm command lines match)
- Modify: `docs/BACKLOG.md` (under the prod Jazz item, note that export and import exist in `migration/jazz-export/` and `backend/scripts/import-jazz-backup.ts` and are rehearsed on checklist-test before prod)

**Model:** `opus` — network writes through rowboat as each user, group minting order, read-back verification, and a live local run across three processes.

**Interfaces:**
- Consumes: `planUser`, `UserPlan` (Task 4); `loadTarget`, `buildAuthDb` (Task 5); `createServer`; `openDataSession`; `compileSchema`, `schema`; spike findings (Task 1).
- Produces:

```ts
export interface ReadBack { folders: number; items: number; sessions: number; userSettings: boolean }
export async function importUserLists(args: {
  plan: UserPlan;
  syncBase: string;
  signJWT: (sub: string) => Promise<string>;
  workDir: string;
}): Promise<ReadBack>;
```

CLI:

```
npx tsx scripts/import-jazz-backup.ts auth-db --backup <dir> --env <env file> --out <auth.db>
npx tsx scripts/import-jazz-backup.ts lists   --backup <dir> --env <env file> --auth-db <copy of the installed auth.db>
```

- [ ] **Step 1: Implement `write-lists.ts`**

1. `const token = await args.signJWT(plan.userId)`.
2. Open a data session on `join(workDir, `${plan.userId}-write.db`)` with `manifest = compileSchema(schema).manifest`, `author: plan.userId`, `appVersion: 0`. `await sync()`.
3. Using the read mechanism from the spike findings, throw `user <id> already has rows in this tenant` if any `folder` row or the `user_settings` row exists.
4. For each `FolderRowDraft` in order: `parentGroup = draft.parent_id === null ? undefined : groups.get(draft.parent_id)`; throw if a non-null parent has no group. `POST ${syncBase}/groups` with `JSON.stringify({ parentGroup })`; on non-ok throw with status and body; require a string `groupId`. `groups.set(draft.id, groupId)`. `await session.db.create('folder', { ...draft, owner_group_id: groupId })`, stringifying `items`/`sessions` only if the spike found strings are required.
5. `await session.db.create('user_settings', plan.userSettings)`. `await sync()`. `close()`.
6. Mint a fresh token (the 15-minute token may be close to expiry for a large user), open a second session on `${plan.userId}-verify.db`, `sync()`, count `folder` rows, and sum elements of each row's `items` and `sessions` maps excluding entries with `__deleted`. Record whether the `user_settings` row with `id = userId` exists. Close, delete both replica files, return `ReadBack`.

- [ ] **Step 2: Implement `import-jazz-backup.ts`**

- Parse `argv` like `parseArgs` in `backend/scripts/rotate.ts:109-125`. Unknown subcommand prints usage and exits 1.
- `auth-db`: read `users.json`, `buildAuthDb(out, loadTarget(env, out), users)`, print `users=<n> accounts=<n> verifications=<n> jwks=<keyId>`.
- `lists`: require `--auth-db` to exist. `const server = await createServer(loadTarget(env, authDb).config)` and use `server.signJWT`; do not call `start()`. Read `manifest.json`; exit 1 if `failed` is non-empty. `workDir = mkdtempSync(join(tmpdir(), 'jazz-import-'))`. For each manifest user in order: read `<userId>.json`, `planUser`, `importUserLists`, then print:

```
<userId> written folders=<n> items=<n> sessions=<n>
<userId> read-back folders=<n> items=<n> sessions=<n> settings=<yes|no>
<userId> manifest folders=<n> items=<n> sessions=<n>
<userId> not-carried sibling-order-parents=<n> archivedAt=<n> foreign-folders=<n> owned-under-foreign=<n>
```

  Then print `share-invites-not-carried=<manifest.shareInvites>`. Exit 1 if any read-back differs from written counts or settings is missing. Stop at the first user whose import throws, printing the user id and error, and exit 1. `server.db.close()` and remove `workDir` at the end.

- [ ] **Step 3: Type-check and run backend tests**

`npm run type-check` in the repo root and `npm test` in `backend/`. Expected: pass.

- [ ] **Step 4: Local end-to-end run against dev rowboat**

1. `rm -rf .rowboat-dev rowboat-tenant.local.json .env.tenant.local` in the repo root (all local, gitignored dev state), then `npm run dev:rowboat` with `run_in_background`. Read `.env.tenant.local` once it exists.
2. Make a scratch dir outside the repo. Write `local.env` there with `BETTER_AUTH_SECRET=local-import-secret-local-import-secret`, `FRONTEND_URL=http://localhost:8765`, and the `ROWBOAT_DATABASE_ID` and `ROWBOAT_URL` values from `.env.tenant.local`.
3. Copy `backend/test/jazz-import/fixtures/backup/*` into `<scratch>/backup/`. Replace each `account.password` with a real hash: `node -e "import('better-auth/crypto').then(async m => console.log(await m.hashPassword('fixture-password-123')))"` run from `backend/`.
4. `npx tsx scripts/import-jazz-backup.ts auth-db --backup <scratch>/backup --env <scratch>/local.env --out <scratch>/auth.db` from `backend/`. Expected: `users=2 accounts=2 verifications=0 jwks=<id>`.
5. Start the backend on that file in the background: `AUTH_DB_PATH=<scratch>/auth.db FRONTEND_URL=http://localhost:8765 BETTER_AUTH_SECRET=local-import-secret-local-import-secret bash scripts/with-tenant-env.sh npm run --prefix backend dev`. Check `curl -s http://localhost:3001/api/auth/jwks` lists the key id from step 4.
6. `cp <scratch>/auth.db <scratch>/auth-copy.db`, then `npx tsx scripts/import-jazz-backup.ts lists --backup <scratch>/backup --env <scratch>/local.env --auth-db <scratch>/auth-copy.db`. Expected for `user-owner`: written and read-back `folders=4 items=3 sessions=2 settings=yes`, `foreign-folders=1 owned-under-foreign=1 archivedAt=1 sibling-order-parents=1`. For `user-other`: `folders=1`. `share-invites-not-carried=1`. Exit 0.
7. Run `lists` a second time. Expected: exit 1 with `already has rows`.
8. Stop background processes and delete the scratch dir and `.rowboat-dev`.

Paste the full output of steps 4, 6 and 7 into your report.

- [ ] **Step 5: Update README and backlog** as listed under **Files**. Keep the backlog change to what now exists.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/jazz-import/write-lists.ts backend/scripts/import-jazz-backup.ts backend/package.json migration/jazz-export/README.md docs/BACKLOG.md
git commit -m "feat(backend): import Jazz backup lists into a rowboat tenant as each user"
```

---

### Task 7: Final code review

**Model:** `opus` — whole-branch review for data safety.

- [ ] Review every commit on `jazz-migration` since `0336771` against the spec. Check in particular: no Jazz write path exists in `migration/jazz-export/src/`; no script prints a secret, email, password hash or list content; backup files are created 600 and the directory 700; foreign folders are never written; token signing uses the `--auth-db` file. Report findings; fix only what the controller approves.

---

## Rehearsal on checklist-test (controller-run, with the user)

These steps touch prod (read-only), the test tenant (destructive) and the apps box. The controller runs them in the main session, not a subagent, and confirms with the user before steps 2 and 4.

### Rehearsal 1: Export prod

- [ ] `mkdir -p ~/backups/checklist`
- [ ] `mkdir -m 700 ~/backups/checklist/2026-09-15`
- [ ] On apps, back up the live DB to a temp file readable by the ssh user: `ssh apps 'sudo sqlite3 /var/lib/checklist-api-data/checklist-api/data/auth.db ".backup /tmp/checklist-auth-export.db" && sudo chown $USER /tmp/checklist-auth-export.db'`
- [ ] `scp apps:/tmp/checklist-auth-export.db ~/backups/checklist/2026-09-15/auth.db`
- [ ] `ssh apps 'rm /tmp/checklist-auth-export.db'`
- [ ] `ssh apps 'sudo grep -E "^(JAZZ_PEER|JAZZ_API_KEY|VITE_JAZZ_API_KEY)=" /var/lib/checklist-api.env' > ~/backups/checklist/2026-09-15/jazz.env`, then `chmod 600` both files. If no key line exists there, look for `VITE_JAZZ_API_KEY` in the repo root `.env` and append it without printing.
- [ ] `npm run export -- --backup-dir ~/backups/checklist/2026-09-15 --secrets ../../backend/secrets.env` in `migration/jazz-export/`. Expected: 3 users with counts, `failed=0`. Stop if any user failed. A re-run after a failure needs `manifest.json` moved aside first, because the export refuses to run while it exists.

### Rehearsal 2: Reset the test tenant (confirm with the user first)

- [ ] Delete the database: `curl -s -X DELETE -H "authorization: Bearer $(pass show services/rowboat-checklist-test | head -1)" https://rowboat.rkroll.com/v1/databases/<ROWBOAT_DATABASE_ID from rowboat-tenant.test.json>`, expecting 2xx. Confirm the pass entry's first line is the management key before running.
- [ ] `mv rowboat-tenant.test.json rowboat-tenant.test.json.pre-rehearsal-2026-09-15`, then `npm run provision:test`.
- [ ] Set `ROWBOAT_DATABASE_ID` in `backend/secrets-test.env` to the new state file's `databaseId` with a script that prints nothing.
- [ ] File the new `managementKey` in `pass` at `services/rowboat-checklist-test` without printing it.

### Rehearsal 3: Build the auth DB

- [ ] `npx tsx scripts/import-jazz-backup.ts auth-db --backup ~/backups/checklist/2026-09-15 --env secrets-test.env --out ~/backups/checklist/2026-09-15/auth-test.db` in `backend/`. Expected: `users=3 accounts=3 verifications=<n> jwks=<keyId>`. Note the key id; Rehearsal 4 needs it.

### Rehearsal 4: Install on apps (confirm with the user first)

- [ ] Stop `checklist-api-test`, move its `auth.db` aside as `auth.db.pre-rehearsal-2026-09-15`, copy `auth-test.db` into place owned `checklist:checklist` mode 600. The path is `/var/lib/checklist-api-test-data/checklist-api-test/data/auth.db`; confirm it first with `ssh apps 'systemctl cat checklist-api-test'` before moving anything.
- [ ] `./deploy-full.sh test update`.
- [ ] `curl -s https://checklist-test.rkroll.com/api/auth/jwks` lists the key id printed in Rehearsal 3.
- [ ] Nobody signs in on checklist-test until Rehearsal 5 exits 0. Sign-in creates a `user_settings` row, and the import then refuses that user.

### Rehearsal 5: Import lists

- [ ] `createServer` opens `--auth-db` read-write, so pass a copy: `cp ~/backups/checklist/2026-09-15/auth-test.db ~/backups/checklist/2026-09-15/auth-test-sign.db`, then `chmod 600` it.
- [ ] `npx tsx scripts/import-jazz-backup.ts lists --backup ~/backups/checklist/2026-09-15 --env secrets-test.env --auth-db ~/backups/checklist/2026-09-15/auth-test-sign.db` in `backend/`. Expected: exit 0; read-back equals written for all 3 users. For the one accepted share: `LX7EFMws2IDxO7lZ0v4AHqUiczIQ7X9n shared-in folders=1 visible=1`, and that user's `not-carried` line shows `foreign-folders=0 carried-as-share=1`. Then `shares granted=1 non-user-members=<n> unmapped-roles=0 nested-without-parent=0`, where `non-user-members` counts server agent memberships.
- [ ] If the import fails: Rehearsal 2 (reset the tenant), then `./deploy-full.sh test update` and the JWKS check from Rehearsal 4, then this step again. The auth DB does not need rebuilding — its signing key and users are unchanged. Note that the reset changes the `databaseId` the frontend bundle and backend env carry.

### Rehearsal 6: Verify

- [ ] Read-back counts match written counts; manifest differences are explained by the not-carried lines.
- [ ] Check the `not-carried` lines: `foreign-folders`, `owned-under-foreign`, `duplicate-item-ids` and `duplicate-session-ids` should all be 0. If any is not, stop and show the ids and counts to the user before accepting the rehearsal. Owned folders reachable only through someone else's shared folder are written by nobody under the current spec rule.
- [ ] Every `shared-in` line has `visible` equal to `folders`, and `unmapped-roles` and `nested-without-parent` are 0. If not, show the `share-not-carried` lines to the user.
- [ ] The recipient signs in and sees the shared template folder at the top level with the owner's items.
- [ ] `npm run test:smoke:test` passes.
- [ ] The user signs in on checklist-test with their prod account and compares lists with prod: nesting, notes, sessions, archived.
