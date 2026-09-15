# jazz-export

One-time migration of prod CheckList's Jazz-era users and lists into the rowboat-era backend, in two scripts:

- **Export** (this package): reads a copy of the prod `auth.db`, decrypts each user's stored Jazz credentials with `BETTER_AUTH_SECRET`, logs in to Jazz Cloud as that account, and writes the account's folder tree to JSON. It writes no list data.
- **Import** (`backend/scripts/import-jazz-backup.ts`): step `auth-db` builds the new auth database from `users.json`; step `lists` writes each user's folders into rowboat.

## Backup directory

| File | Written by | Contents |
|---|---|---|
| `auth.db` | you | copy of the prod auth database |
| `jazz.env` | you | `JAZZ_PEER` and `JAZZ_API_KEY` (or `VITE_JAZZ_API_KEY`) |
| `users.json` | export | all `user`, `account` and `verification` rows, credentials included |
| `manifest.json` | export | export time, share invite count, per-user counts, failures |
| `<userId>.json` | export | one user's root folder order, folders (with their group's direct members and roles), settings and view state |

The export sets the directory to mode 0700 and every file it writes to 0600. These files hold password hashes, Jazz account secrets and list content. The export refuses to run when `manifest.json` already exists.

## Export

```bash
cd migration/jazz-export
npm install --legacy-peer-deps
npm run export -- --backup-dir <dir> --secrets ../../backend/secrets.env
```

The export logs in with an account class whose migration does nothing, so jazz-tools does not create a missing profile inbox. Logging in as an account can still rewrite its root's metadata (cojson stores the root reference as `trusting`), which is a no-op for accounts already used under jazz-tools 0.20.18.

Each folder's `members` lists the accounts added directly to its group, from `getDirectMembers()`. The recorded role is the member's effective role: the highest of its direct role and any role inherited from a parent group (`cojson/src/coValues/group.ts:451-487`). Members a group gets through a parent group are not listed. Member accounts are not loaded.

It prints one line per user, `<userId> folders=<n> items=<n> sessions=<n>`, then `failed=<n>` and one `<userId> <error>` line per failure, and exits 1 when any user failed.

## Import

From `backend/`:

```bash
npx tsx scripts/import-jazz-backup.ts auth-db --backup <dir> --env <env file> --out <auth.db>
npx tsx scripts/import-jazz-backup.ts lists   --backup <dir> --env <env file> --auth-db <copy of the installed auth.db>
```

`--env` is a standalone env file for the target deploy with `BETTER_AUTH_SECRET`, `FRONTEND_URL`, `ROWBOAT_DATABASE_ID` and `ROWBOAT_URL`. `npm run import-jazz -- <step> ...` runs the same script.

`auth-db` refuses an existing `--out`, writes it at mode 0600, and prints `users=<n> accounts=<n> verifications=<n> jwks=<keyId>`. Install that file as the backend's auth DB and start the backend, so rowboat can fetch its JWKS.

`lists` signs each user's token from `--auth-db` without serving HTTP; pass a copy of the installed file. It refuses a manifest with failed exports. For each manifest user in order it mints a rowboat group per folder (parents first, a nested folder under its parent's group), writes the folders and the `user_settings` row as that user, then reads them back from a fresh replica and prints:

```
<userId> written folders=<n> items=<n> sessions=<n>
<userId> read-back folders=<n> items=<n> sessions=<n> settings=<yes|no>
<userId> manifest folders=<n> items=<n> sessions=<n>
<userId> not-carried sibling-order-parents=<n> archivedAt=<n> foreign-folders=<n> carried-as-share=<n> owned-under-foreign=<n> duplicate-item-ids=<n> duplicate-session-ids=<n>
```

A folder owned by another account is written once, under its owner. In the owner's export, each member of that folder's group who is another migrated user becomes a share: after every user is written and read back, `lists` grants the recipient a role on the folder's rowboat group as the owner (`POST <sync base>/groups/<group>/members`), then syncs a fresh replica as each recipient and checks every granted folder is visible. `carried-as-share` counts this user's foreign folders carried that way. `foreign-folders` counts the rest, which this user loses.

Jazz `reader`, `writer` and `admin` map to the rowboat roles of the same name. Not carried:

- members with Jazz role `manager` or `writeOnly`, which have no rowboat equivalent
- members that are not migrated users, such as the Jazz-era server agent
- a share of a nested folder when the recipient gets none of its ancestors, since the app reaches a nested folder only through its parent
- owned folders under someone else's folder (`owned-under-foreign`)
- pending invites

After the user lines it prints:

```
<recipientUserId> shared-in folders=<n> visible=<n>
share grant owner=<userId> folder=<id> recipient=<userId> role=<role>
shares granted=<n> admin-grants=<n> non-user-members=<n> unmapped-roles=<n> nested-without-parent=<n>
share-not-carried folder=<id> member=<accountId> reason=not-a-migrated-user
share-not-carried folder=<id> member=<accountId> role=<role> reason=unmapped-role
share-not-carried folder=<id> recipient=<userId> reason=nested-without-parent
share-invites-not-carried=<n>
```

A rowboat `admin` can revoke or demote any other admin of the group, including the owner, which a Jazz admin could not do. Check every `role=admin` grant before accepting an import.

Manifest folder counts include folders owned by other accounts, which are not written. It exits 1 when a granted folder is not visible to its recipient, and stops with exit 1 when a grant fails. It exits 1 when a read-back differs from the written counts, and stops with exit 1 at the first user whose import throws. A user who already has rows in the tenant throws `user <id> already has rows in this tenant`, so a second run fails at the first user instead of writing duplicates.

## Removal

Delete this directory, `backend/scripts/import-jazz-backup.ts` and `backend/scripts/jazz-import/` after the prod cutover. Also remove the `@jbroll/rowboat-cli` devDependency and the `import-jazz` script from `backend/package.json`.
