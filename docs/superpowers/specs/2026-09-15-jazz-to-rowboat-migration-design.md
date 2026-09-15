# Jazz-era users and lists to rowboat: export, import, rehearsal

## Goal

Carry prod checklist-app's Jazz-era users and their lists into the rowboat-era backend, with a
complete backup taken first. Rehearse the whole path on checklist-test before prod.

## Scope

In scope:

- A read-only export of prod's better-auth `auth.db` and every user's Jazz data to a JSON backup.
- An import that builds a fresh rowboat-era auth DB and writes each user's lists into a rowboat
  tenant as that user.
- A rehearsal run against checklist-test, starting from an empty test auth DB and an empty test
  tenant.

Out of scope:

- The prod cutover itself. It reuses both scripts and gets its own plan.
- Pending invites. They are reported, not migrated.
- Fixing the in-app JSON export; that is a separate backlog item.

## Facts the design rests on

- Prod `checklist-api` uses `AUTH_DB_PATH=/var/lib/checklist-api-data/checklist-api/data/auth.db`.
  It holds 3 users (all with `accountID`), 3 `account` rows, 18 sessions and 1 `share_invites` row.
- The local `backend/secrets.env` `BETTER_AUTH_SECRET` matches prod's (SHA-256 of both lines are
  equal). `JAZZ_PEER` exists only in prod's env file on apps, `/var/lib/checklist-api.env`.
- The Jazz-era app (commit `d51a192`) pins `jazz-tools` 0.20.18 and `better-auth` 1.5.6. Both are on
  npm.
- The jazz-tools better-auth plugin stores `user.encryptedCredentials`, which holds
  `{accountID, secretSeed, accountSecret, provider}` encrypted with `symmetricEncrypt` from
  `better-auth/crypto`, and `symmetricDecrypt({ key: BETTER_AUTH_SECRET, data })` reverses it.
  The cipher is XChaCha20-Poly1305 with a managed nonce, derived from a SHA-256 hash of the secret,
  and the output is hex.
- `startWorker({ accountID, accountSecret, syncServer, AccountSchema, skipInboxLoad })`
  (`jazz-tools/dist/worker/index.js`) acts as an existing account. The sync server URL is
  `${JAZZ_PEER}/?key=${apiKey}`.
- The Jazz-era `AccountSchema` (`d51a192:src/schema/index.ts:103-219`) has a migration that creates
  a root and pushes a "Quick Errands" list when `folders` is empty. Loading with it can write to prod.
- Nested folder `children` are not deep-loaded by the schema's default resolve; they autoload only in
  React hooks.
- Each Jazz folder has its own Group with the owning account as admin. An accepted invite pushes
  another user's folder into the recipient's `root.folders`, so a folder can appear in several roots.
- The rowboat `folder` and `user_settings` columns (`shared/schema.ts`) map 1:1 from the Jazz fields,
  with Dates as epoch-ms. Jazz fields with no column: `archivedAt` and sibling folder order.
- `createServer(config)` in `backend/src/index.ts` creates a fully migrated auth DB and returns
  `signJWT` without listening. The jwt plugin creates its signing key in the `jwks` table on first
  use, encrypted with the auth secret.
- rowboat verifies tokens against `${FRONTEND_URL}/api/auth/jwks`. The signing key must therefore be
  the one the deployed backend serves, so the import must mint from the same DB file that is
  installed.
- `openDataSession` from `@jbroll/rowboat-cli` writes rows through a SQLite replica with no
  IndexedDB and exposes `sync()`. Checklist sends `appVersion: 0`.
- `POST <sync base>/groups {parentGroup}` mints a scope group and requires admin on a non-root parent.
  The first push or pull provisions the user's root group, whose id is the user id.
- Better-auth 1.5.6 hashes passwords with scrypt (`salt:hexkey`), with no secret input, so copied
  hashes verify on the new backend.
- `provision-tenant` with a state file pointing at a deleted database still reports the database as
  existing. The state file must be moved aside before re-provisioning.

## Export

Location: `migration/jazz-export/` in this repo, a standalone package with its own `package.json`
pinning `jazz-tools@0.20.18`, `better-auth@1.5.6` and `better-sqlite3`. It is not part of the app
build or type-check, and is deleted after the prod cutover.

Inputs:

- A `sqlite3 .backup` copy of prod's `auth.db`, made on apps into a temp file, copied to
  `~/backups/checklist/<date>/auth.db`, and removed from the box.
- `BETTER_AUTH_SECRET` read from `backend/secrets.env`.
- `JAZZ_PEER` copied from `/var/lib/checklist-api.env` on apps into `~/backups/checklist/<date>/jazz.env`.

The backup directory is mode 700, its files mode 600. No command prints a secret.

For each user with `encryptedCredentials`:

1. Decrypt the credentials.
2. `startWorker` with jazz-tools' default `Account` schema and `skipInboxLoad: true`. Never the
   checklist `AccountSchema`, whose migration writes.
3. Load `root`, `root.folders`, `root.userSettings` and `root.viewState`, then load every folder's
   `children` recursively.
4. Write nothing to Jazz.

Output, in the backup directory:

- `<userId>.json`: every stored field.
  - Folders: ids, owner account and group ids, `createdBy`, `sharingMode`, `expanded`, `archived`,
    `archivedAt`, timestamps, nesting, `defaultItems`, `showZoneHeadings`, `autocompleteDomain`,
    `autoCategorizeEnabled`.
  - Items with notes and paths.
  - Sessions with ids, item states and their notes.
  - `userSettings` and `viewState`.
- `users.json`: the `user` and `account` rows from the auth DB copy.
- `manifest.json`: per-user folder, item and session counts, and any user whose account failed to
  load, with the error.

The script prints counts and failures only, never list contents.

## Import

Location: `backend/scripts/import-jazz-backup.ts`, run with `tsx` from the backend so it uses the
backend's own `createServer`. `@jbroll/rowboat-cli` is added as a backend devDependency by `file:`
link.

Inputs:

- The backup directory.
- The target's `BETTER_AUTH_SECRET`, `FRONTEND_URL`, `ROWBOAT_DATABASE_ID` and `ROWBOAT_URL`, from
  `backend/secrets-test.env` for the rehearsal.

Step A, auth DB (offline):

1. Create a fresh `auth.db` at an output path with `createServer(targetConfig)`.
2. Insert `user` rows without `accountID` and `encryptedCredentials`, plus `account` and
   `verification` rows, keeping ids and `emailVerified`. Do not copy sessions.
3. Call `signJWT` once so the `jwks` signing key exists in the file.

Step B, lists (after the DB file is installed and the backend serves its JWKS). For each user:

1. Mint a token with `signJWT(user.id)` from the installed DB file's copy, immediately before the
   user's writes.
2. Open a data session on a temp SQLite replica and sync once, which provisions the root group.
3. Import only folders whose owner account is this user's Jazz account. A shared folder is written
   once, under its owner.
4. For each folder, parents before children, mint its group via `POST /groups`: top level under the
   root group, nested under the parent's `owner_group_id`.
5. Create the `folder` row:
   - `id` is the Jazz folder id, kept so `viewState` keys and session references need no remap.
   - `parent_id` is the parent's Jazz id.
   - `created_by` is remapped from the Jazz account id to the better-auth user id.
   - Dates are epoch-ms, and missing optionals get the app's defaults (`folderOps.ts:32-50`).
   - `items` and `sessions` are `rb.ordered` maps whose `__order` follows `sortOrder`, then
     `createdAt`.
6. Create the `user_settings` row with `id` and `owner_group_id` equal to the user id, mapping
   `userSettings` and the three `viewState` maps.
7. Sync, then pull back and compare counts with `manifest.json`.

Step C, accepted collaborator shares (after every user is written and read back):

1. The export records each folder group's direct members and their Jazz roles.
2. For each folder written under its owner, every member who is another migrated user gets a grant.
   Map Jazz `reader`, `writer` and `admin` to the rowboat roles of the same name (`DEFAULT_ROLES`).
3. As the owner, `POST <sync base>/groups/<group>/members {account, role}` on the folder's minted
   group, as rowboat's invite accept does.
4. Per recipient, sync a fresh replica and check every granted folder id is visible.

Not carried by step C, and reported:

- Jazz `manager` and `writeOnly` members, which have no rowboat role
- members who are not migrated users, such as the Jazz-era server agent
- a share of a nested folder when the recipient gets no ancestor. rowboat would expose it, but the
  app lists only top-level folders and reaches nested ones through their parent

A granted folder's descendants become visible to the recipient through group inheritance.

The script reports per user: counts written, counts read back, and anything not carried:

- sibling folder order
- `archivedAt`
- folders owned by another account, split into those carried as a share and those not
- owned folders under another account's folder
- the share invite

## Rehearsal run on checklist-test

1. Run the export against prod. Stop if `manifest.json` lists any failed user.
2. Reset the test tenant:
   - Delete the `checklist-test` database via the control plane with the management key from `pass`
     at `services/rowboat-checklist-test`.
   - Move `rowboat-tenant.test.json` aside and run `npm run provision:test`.
   - Update `ROWBOAT_DATABASE_ID` in `backend/secrets-test.env` without printing values.
   - File the new management key in `pass`.
3. Run import step A with the new tenant's config.
4. Install the DB on apps:
   - Stop `checklist-api-test`.
   - Move the current `auth.db` aside as `auth.db.pre-rehearsal-<date>`.
   - Copy the new file into place, owned `checklist:checklist`, mode 600.
   - Run `./deploy-full.sh test update`, which rebuilds the frontend with the new sync base and
     restarts the backend.
   - Confirm `/api/auth/jwks` serves the key id in the file.
5. Run import step B.
6. Verify:
   - read-back counts match the manifest
   - `npm run test:smoke:test` passes
   - the user signs in on checklist-test with their prod account and compares their lists with prod
     (nesting, notes, sessions, archived)

Rollback is limited to checklist-test: the old test tenant is deleted in step 2. Prod is never
written.

## Exposure

Until checklist-test is reset again, prod users' real accounts and lists live on a public test site,
where their passwords work. The backup directory on the laptop holds every user's lists and the
Jazz peer key.

## Testing

- **Spike before building.** Against the local dev rowboat (`npm run dev:rowboat`, :3020), confirm
  that `openDataSession` + `db.create('folder', ...)` writes `rb.ordered` items and sessions, and
  that the app renders them.
- **Mapping.** A pure function from the export JSON to rowboat rows, unit-tested with fixture
  exports covering:
  - nesting
  - notes
  - archived items and sessions
  - missing optionals
  - a folder owned by another account
- **Decryption.** A unit test round-trips `symmetricEncrypt` and `symmetricDecrypt` with a fixture
  secret.
- **Shares.** `planShares` is unit-tested with inline exports covering reader, writer and admin
  recipients, a non-user member, an unmapped role, a nested share without its parent, and members of
  folders that are not written.
- **Import end to end.** Run against the local dev rowboat with a fixture backup; assert read-back
  counts and that the fixture's one share is granted and visible to its recipient.
- **Export.** Verified by the rehearsal's manifest, since it needs real Jazz accounts.

## Risks

- **Jazz Cloud access.** Accounts may no longer load from `JAZZ_PEER`, or the API key may be
  revoked. The export reports this per user before anything else changes.
- **`rb.ordered` through `db.create`** is unverified. The spike settles it first.
- **OAuth sign-in on test.** Google and Apple may not work with copied `account` rows if the test
  OAuth clients issue different subject ids. Password sign-in is unaffected.
- **JWKS caching.** rowboat's jose cache may hold an old key after the auth DB changes. Step 4
  confirms the served key before step B.

## Cleanup after the prod cutover

Delete `migration/jazz-export/`, `backend/scripts/import-jazz-backup.ts` and the rowboat-cli
devDependency. Keep the backup directory until the user decides otherwise.
