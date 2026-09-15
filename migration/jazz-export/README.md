# jazz-export

One-time migration of prod CheckList's Jazz-era users and lists into the rowboat-era backend, in two scripts:

- **Export** (this package): reads a copy of the prod `auth.db`, decrypts each user's stored Jazz credentials with `BETTER_AUTH_SECRET`, logs in to Jazz Cloud as that account, and writes the account's folder tree to JSON. It only reads Jazz data.
- **Import** (`backend/scripts/import-jazz-backup.ts`): step `auth-db` builds the new auth database from `users.json`; step `lists` writes each user's folders into rowboat.

## Backup directory

| File | Written by | Contents |
|---|---|---|
| `auth.db` | you | copy of the prod auth database |
| `jazz.env` | you | `JAZZ_PEER` and `JAZZ_API_KEY` (or `VITE_JAZZ_API_KEY`) |
| `users.json` | export | all `user`, `account` and `verification` rows, credentials included |
| `manifest.json` | export | export time, share invite count, per-user counts, failures |
| `<userId>.json` | export | one user's root folder order, folders, settings and view state |

The export sets the directory to mode 0700 and every file it writes to 0600. These files hold password hashes, Jazz account secrets and list content. The export refuses to run when `manifest.json` already exists.

## Export

```bash
cd migration/jazz-export
npm install --legacy-peer-deps
npm run export -- --backup-dir <dir> --secrets ../../backend/secrets.env
```

The export logs in with an account class whose migration does nothing, so jazz-tools does not create a missing profile inbox. Logging in as an account can still rewrite its root's metadata (cojson stores the root reference as `trusting`), which is a no-op for accounts already used under jazz-tools 0.20.18.

It prints one line per user, `<userId> folders=<n> items=<n> sessions=<n>`, then `failed=<n>` and one `<userId> <error>` line per failure, and exits 1 when any user failed.

## Import

From `backend/`:

```bash
npx tsx scripts/import-jazz-backup.ts auth-db ...
npx tsx scripts/import-jazz-backup.ts lists ...
```

## Removal

Delete this directory, `backend/scripts/import-jazz-backup.ts` and `backend/scripts/jazz-import/` after the prod cutover.
