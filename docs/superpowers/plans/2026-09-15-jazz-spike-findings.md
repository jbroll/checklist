# rb.ordered write spike findings

Verifies the write/read/render path Jazz-import mapping code will depend on: `db.create('folder', row)`
through `openDataSession` from `@jbroll/rowboat-cli`, against a local rowboat tenant, signed by
`createServer(...).signJWT` from `backend/src/index.ts`.

Setup: local rowboat via `npm run dev:rowboat` (databaseId `db_CxtOxRE94L5-`), backend on a scratch
auth DB (`/tmp/claude-1000/jazz-spike/auth.db`, port 3001), one signed-up user
(`spike@example.com`, id `VeDHyIh6ZJoKqQhXOtfPkwmNYmkF7ZsE`). Spike script at
`backend/scripts/jazz-import/spike.ts` (deleted after this run — see Step 5 below for its shape).

## (1) Does `db.create('folder', row)` accept `items`/`sessions` as ordered-map objects, or does it need JSON strings?

Plain JS objects work directly — no `JSON.stringify` needed. `items`/`sessions` are declared with
`rb.ordered(...)`, which compiles to manifest column type `"json"`; `db.create` accepted the object
values on the first try:

```
mint status 200
groupId 65c98029-2746-485d-a6dc-046318cbf4c0
db.create (object values): OK
```

The fallback path (`JSON.stringify` before `db.create`) was never exercised — object values worked,
so the "if it rejects, try stringify" branch in the spike script did not fire.

## (2) Does a second fresh replica pull back the elements with `__order`?

Yes. A second session (`b`, fresh sqlite file, same `syncUrl`/`author`/`token`) synced and read the
row back with both `i1`/`i2` and `s1` present, each carrying its `__order` fracKey:

```
raw items column: {"i1":{"id":"i1","name":"Milk","type":"item","path":"Milk","expanded":false,"sortOrder":0,"archived":false,"defaultQuantity":"","notes":"two percent","createdAt":1789484331498,"__order":"6pdMeAU"},"i2":{"id":"i2","name":"Eggs","type":"item","path":"Eggs","expanded":false,"sortOrder":1,"archived":true,"defaultQuantity":"","createdAt":1789484331498,"__order":"NwSsJzP"}}
raw sessions column: {"s1":{"id":"s1","itemStates":{"i1":{"selected":true,"checked":false,"selectedAt":1789484331498,"notes":"store brand"}},"archived":false,"categoryExpanded":{},"viewMode":"flat","selectedCount":1,"checkedCount":0,"remainingCount":1,"createdAt":1789484331498,"lastActivityAt":1789484331498,"__order":"6pdMeAU"}}
```

`decodeRow` (from `@jbroll/rowboat-cli/src/column-types.js`) parses these `json`-typed columns from
their stored string form into plain objects with `__order` intact — no extra ordered-list decoding
step is required to get the raw keyed map back; `orderedToArray` (from `@jbroll/rowboat-client`,
client-side only) is what turns the keyed map into a sorted array for app consumption.

## (3) Does top-level `POST /groups` with no `parentGroup` succeed right after the first sync?

Yes:

```
mint status 200
```

(`fetch` to `${syncBase}/groups` with body `{}` and no `parentGroup`, called right after `a.sync()`
following `openDataSession`.) The response body contained a `groupId`
(`65c98029-2746-485d-a6dc-046318cbf4c0`), which was used as `owner_group_id` on the `folder` create.

## (4) Does the app show the folder and its items after signing in?

Yes, automated end-to-end with Playwright (chromium). After sign-in (Sign In → Continue with Email →
`spike@example.com` / `spike-password-123`) the list view shows "Spike list"; opening it shows "Milk"
with its session note "store brand" and its template note "two percent" rendered inline. Screenshot
saved during the run at `/tmp/claude-1000/jazz-spike/spike-list-rendered.png` (scratch dir, deleted
along with the rest of `/tmp/claude-1000/jazz-spike/` per Step 7 — reproduce by rerunning the
Playwright steps below if a fresh screenshot is needed).

Console during this run showed five `409 Conflict` and one `404 Not Found` resource-load errors.
These were not investigated further — they did not prevent data from rendering — but later tasks
that check app behavior end-to-end should watch for the same pattern and confirm it is a benign
sync-retry/dev-PWA artifact rather than something the import needs to route around.

## (5) Exact import path and call shape for reading rows back from a session

Copied from `../rowboat/packages/rowboat-cli/src/verbs/get.ts`:

```ts
import { decodeRow } from '@jbroll/rowboat-cli/src/column-types.js';
import { openDataSession } from '@jbroll/rowboat-cli/src/data-session.js';

const session = await openDataSession({ manifest, filename, syncUrl, author, token });
await session.sync();
const row = session.sqlite
  .prepare(`select * from "folder" where id = ?`)
  .get(rowId) as Record<string, unknown> | undefined;
const decoded = row ? decodeRow(manifest, 'folder', row) : undefined;
session.close();
```

`session.sqlite` is the raw `better-sqlite3` handle (`DataSession.sqlite`); reads go straight
against it with a `select *`, then `decodeRow(manifest, table, row)` converts booleans (0/1) and
json/set columns (stored as TEXT) to their JS shapes and drops the internal bookkeeping columns
(`__deleted`, `__server_updated_at`, ...). No separate read verb or query builder is involved for a
by-id lookup; writes go through `session.db` (`RowboatDb`, e.g. `db.create(...)`), reads go straight
through `session.sqlite`.

## Setup notes for later tasks

- `openDataSession` (`@jbroll/rowboat-cli/src/data-session.ts`) takes
  `{ manifest, migrations?, filename, syncUrl, author, token, appVersion?, fetchFn? }` and returns
  `{ db, sqlite, sync(), close() }`. `sync()` both pushes local writes and pulls server state
  (`syncWithServer` under the hood); reads should happen after a `sync()` call.
- `compileSchema(schema).manifest` (from `@jbroll/rowboat-schema`, `schema` from
  `shared/schema.ts`) is the manifest to pass to `openDataSession`.
- `fracKey.between(lower, upper)` (from `@jbroll/rowboat-client`) mints `__order` keys;
  `fracKey.between(undefined, undefined)` gives the first key, `fracKey.between(k1, undefined)` the
  next one after it.
- The backend's own `createServer(...)` (from `backend/src/index.ts`) is enough to mint a JWT via
  `signJWT(userId)` without going through the HTTP auth flow — no separate token-minting utility
  needed for scripts that already have a `userId`.

## Conclusion

`db.create` writes `rb.ordered` `items`/`sessions` columns as plain JS objects, a second replica
reads them back intact with `__order`, top-level group creation works right after first sync, and
the app renders the imported folder and item/session data after sign-in. No blocker found for the
Jazz-import mapping work.
