# Self-Service Account Merge (Dual-Login Adoption)

**Status:** Design approved, pending implementation plan
**Date:** 2026-06-24
**Author:** John Roll (with Claude)

## 1. Goal

Let a user who has ended up with **two separate accounts** — each with its own
Jazz data (folders/lists) — combine them into one, self-service, with proper
verification. After merging, the user has a single body of data and *both* sets
of login credentials continue to work.

## 2. Background & the key constraint

This is a Jazz.tools app. User data (folders, lists, sessions) lives in
end-to-end-encrypted **Jazz CoValues** owned by each account's Jazz keys.
BetterAuth is only the identity + key-storage layer:

- The Jazz plugin adds two columns to the BetterAuth `user` table — `accountID`
  (the Jazz account id) and `encryptedCredentials` (the Jazz secret, encrypted).
  See `node_modules/jazz-tools/src/better-auth/auth/server.ts:48-63`.
- `encryptedCredentials` is encrypted with the **global** server secret
  (`ctx.context.secret` = `BETTER_AUTH_SECRET`), via `SHA-256(secret)` →
  XChaCha20-Poly1305. It is **not** derived from anything per-user (id, email,
  password, salt). Encrypt: `server.ts:143`. Decrypt at login: `server.ts:325`.

**Consequence #1 (verification):** the only way to read/move an account's
encrypted data is to genuinely log into it. Email-only proof yields nothing
decryptable. So verification and data-access are the same act: a real login.

**Consequence #2 (the merge mechanism):** because `encryptedCredentials` is
portable across rows (global key), copying the target's `accountID` +
`encryptedCredentials` onto the source `user` row makes the **source login open
the target's Jazz account**. This is the core trick of this design.

Existing building blocks we reuse:

- Multi-email linking — `verified_email` table
  (`jbr-jazz/.../backend/src/db.ts:93-109`), routes in
  `jbr-jazz/.../backend/src/verified-emails.ts`, HMAC tokens in
  `.../backend/src/lib/verification-token.ts`.
- Sharing — `group.addMember(account, "admin")` primitive in
  `jbr-jazz/.../backend/src/shares.ts` (and client share UI
  `checklist/src/components/sharing/ShareDialog.tsx`).
- Invite/email matching — `getAllUserEmails` / `canUserAccessShareEmail` in
  `jbr-jazz/.../backend/src/lib/email-matching.ts` (matches invites against the
  **logged-in row's** primary + verified emails).
- Account deletion cascade — `jbr-jazz/.../backend/src/accounts.ts`.

> **Repo note:** backend routes live in the shared library
> `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/` (wired up by
> `/home/john/src/checklist/backend/src/index.ts`). Frontend lives in
> `/home/john/src/checklist/src/`.

## 3. Terminology

- **Target** — the account the user is logged into and *keeping*. The merge
  pulls data *into* it.
- **Source** — the account being absorbed. Its data is adopted into the target
  and its login becomes a second door into the target's Jazz account.

## 4. User flow (two logins, ends on target)

Ordered so the user finishes logged into the target naturally:

1. In **target** settings → "Combine another account into this one." The client
   captures `targetJazzAccountId` (public, safe to stash) under a one-time
   `nonce` and persists it (localStorage + backend merge record).
2. "Sign in to the account you want to absorb." → **source** login (reuses the
   existing login UI, flagged `?merge=<nonce>`). On success the client is now
   authenticated as source, with source's Jazz keys loaded.
3. As source, the client runs the **share-out** step (§6) and calls
   `POST /api/account/merge/prepare`.
4. "Now sign back into your main account to finish." → **target** login.
5. As target, the client runs the **adopt** step (§6) and calls
   `POST /api/account/merge/finalize`.
6. Success screen.

If the user abandons after step 3 but before finalize, nothing is destroyed
(data was only *shared*, never deleted); the merge record expires by TTL.

## 5. Verification model & security analysis

Verification is **full re-authentication of both accounts** (each login is a
real BetterAuth auth — OAuth redirect or email+password). This is forced by
encryption: only a real source login unlocks source data; the closing target
login re-confirms target control.

- **Guard:** abort if `source.accountID == target.accountID` (already merged /
  same account).
- **No new attack surface:** the operation only ever takes *source's* data and
  shares it *into target*, and it requires fully authenticating *both* accounts.
  An actor who can do that already controls both accounts and could read
  everything anyway.

## 6. Data transfer — adopt via re-sharing (client-side)

The group-membership mutation must run **as source** (only source is admin of
its folder groups); adoption must run **as target** (only target can write its
own root). The two-login order makes this clean and requires holding only one
key-set at a time (adding a member needs only the target's *public* account id).

**Share-out (as source, step 3):**
- For each top-level folder in `source.root.folders`, take its Jazz group and
  `group.addMember(targetJazzAccountId, "admin")` — the same primitive used by
  `shares.ts`.
- Collect the adopted folder CoValue ids; send them to `prepare`.

**Adopt (as target, step 5):**
- For each adopted folder id (read from the merge record), load the now-readable
  folder and push it into `target.root.folders`.
- As the new admin, `group.removeMember(sourceAccount)` on each adopted group so
  the now-detached source Jazz account does not linger as a ghost admin.

**Properties:** preserves CoValue ids, edit history, and existing collaborators.
Folder-name collisions in the target root are fine (folders coexist; no dedup).
After adoption + removeMember + the finalize repoint (§7), the original source
Jazz account is fully detached and its secret is no longer stored anywhere.

## 7. Backend coordination

A short-lived `account_merge` record carries state across the two logins:

| column | meaning |
| --- | --- |
| `nonce` | one-time id (PK) |
| `target_user_id`, `target_jazz_id` | the keep account |
| `source_user_id`, `source_jazz_id` | the absorb account |
| `adopted_folder_ids` | JSON array of CoValue ids shared out in §6 |
| `state` | `prepared` \| `finalized` |
| `created_at`, `expires_at` | TTL (e.g. 30 min) |

- `POST /api/account/merge/prepare` — authed as **source**. Records
  `source_user_id`/`source_jazz_id` (from session), `target_jazz_id`,
  `adopted_folder_ids`. Validates `source_jazz_id != target_jazz_id`. Nothing
  destructive.
- `POST /api/account/merge/finalize` — authed as **target**; validate the
  session's jazz id equals `target_jazz_id` and the record is `prepared` and not
  expired. Then, in one transaction:
  1. **Repoint the source row's Jazz pointer:** overwrite the source `user`
     row's `accountID` and `encryptedCredentials` with the **target's** values.
     This makes the source login (password *and* OAuth) open the target's Jazz
     account + profile.
  2. **Consolidate verified emails onto the target** (see §8): `UPDATE
     verified_email SET user_id = <target_user_id> WHERE user_id =
     <source_user_id>`, then insert the source row's primary `user.email` as a
     new `verified_email` on the target. Handle `UNIQUE(email)` collisions by
     dropping the redundant source copy (see §10), never failing the merge.
  3. Mark the record `finalized`.

  Finalize does **not** delete the source `user` row, move its primary
  `user.email`, or re-point its OAuth `account` rows. Idempotent on `state`.

## 8. Email & invite behavior — consolidate onto target

Verified emails are **auth-DB table data**, not Jazz profile data: SQLite table
`verified_email`, keyed by `user_id`, with `UNIQUE(email)`
(`jbr-jazz/.../backend/src/db.ts:93-109`). They live in the auth DB by
necessity — invite acceptance is a backend authz decision that matches the
invite's recipient email against the accepting user's verified emails
(`email-matching.ts` → `getAllUserEmails(db, userId, primaryEmail)`, used by
`shares.ts`). Jazz profile data is client-controlled and cannot be trusted for
this, so verified emails cannot move to the profile.

Because matching is per-`user_id` and `UNIQUE(email)` forbids the same address on
two rows, we **consolidate all emails onto the target row** during finalize
(§7.2):

- **Move** the source's `verified_email` rows to the target
  (`UPDATE ... SET user_id = target`).
- **Add** the source's primary `user.email` as a new `verified_email` on the
  target.
- The source row keeps its own primary `user.email` (its login identity) but
  ends up with **no** verified emails.

Resulting invite behavior:

- **Target door:** sees every email (its own primary + all consolidated
  verified emails) → can accept invites addressed to any of the merged
  addresses.
- **Source door:** sees only its own primary email → can accept invites to that
  address. Either way the accepted folder lands in the **same** shared Jazz
  account, since both doors open it.

This treats the **target as the canonical account**; the source login is a
long-term convenience door with a narrower email view. (The fully-symmetric
alternative — account-scoped matching that unions emails by `accountID` — was
considered and rejected for simplicity.)

## 9. Account-deletion guard (required)

Once two rows share an `accountID`, the existing delete cascade
(`accounts.ts`) becomes dangerous: it deletes `share_invites` by
`jazz_account_id` and `verified_email` by `user_id`. Deleting *either* merged
row could nuke the shared account's invites.

**Guard:** before the existing cascade runs, detect whether another `user` row
shares this row's `accountID`. If so, deleting this row must remove **only that
login door** (the `user` row, its `session`s and OAuth `account` rows) and must
**not** delete `share_invites`/data tied to the shared `jazz_account_id`, nor
the other row. Only when this is the **last** row pointing at the `accountID`
does the full data cascade run.

## 10. Edge cases

- **Self-merge:** `source.accountID == target.accountID` → abort at `prepare`.
- **Source has no folders:** still valid — finalize repoints the login door so
  the source credentials become an alias into target. (No data to adopt.)
- **Interrupted before finalize:** data only shared, never destroyed; record
  expires; safe to retry from step 1.
- **Re-running finalize:** idempotent via `state == finalized`.
- **`accountID` shared by 2+ rows:** allowed (identical to one user on multiple
  devices — Jazz treats it as another client of the same account). Verify no
  hidden uniqueness assumption on `accountID` during implementation.
- **Duplicate email across the two accounts:** if both accounts verified the
  same address (or the source's primary already exists as a `verified_email`),
  the consolidation `UPDATE`/insert hits `UNIQUE(email)`. Resolve by dropping the
  redundant source-side copy; never fail the merge over it (§7.2, §8).
- **Stripe / billing:** out of scope (see §12). Because nothing is deleted,
  there is no orphaned-customer risk.

## 11. Affected components

**Backend** (`/home/john/src/jbr-jazz/packages/hierarchy/backend/src/`):
- new `account-merge.ts` — `prepare` + `finalize` routes, merge-record CRUD.
- new `account_merge` table in `db.ts`.
- `accounts.ts` — add the shared-`accountID` deletion guard (§9).
- reuse `verification-token.ts` / rate limiters as needed.

**Backend wiring** (`/home/john/src/checklist/backend/src/index.ts`): register
the new routes.

**Frontend** (`/home/john/src/checklist/src/`):
- account/settings UI entry "Combine another account" (near
  `components/auth/LinkedEmailsSection.tsx`).
- a small merge state machine driving the two-login flow + Jazz group operations
  (reuses Jazz group APIs already used by sharing) + `prepare`/`finalize` calls.
- login UI: honor `?merge=<nonce>` to route back into the merge flow after each
  login.

## 12. Out of scope

- **Billing/subscription merge.** Both Stripe customers/subscriptions are left
  untouched; reconciled manually if ever needed. (No orphaned customer arises
  because no `user` row is deleted.)
- Bulk/admin-driven merges; login-time auto-detection of duplicate accounts.

## 13. Testing

- **Unit:** self-merge guard; merge-record validation + TTL + idempotent
  finalize; the deletion guard (shared `accountID` → door-only delete vs
  last-row → full cascade); repoint writes correct `accountID`/
  `encryptedCredentials`; email consolidation moves source `verified_email` rows
  + adds source primary to target, dropping `UNIQUE(email)` duplicates without
  failing.
- **Integration (headless workflow):** create two accounts each with data → run
  share-out + prepare + adopt + finalize → assert target root holds both folder
  sets, source removed from adopted groups, source row's Jazz pointer now equals
  target's, all merged emails are verified on the **target** row, and the source
  row has no verified emails left.
- **Cross-login assertion:** after merge, a fresh login via the **source**
  credentials restores the **target** Jazz account (same `accountID`).
- **Invite parity:** an invite to the (now-consolidated) source email, accepted
  while logged into the **target**, deposits the folder into the shared account.
- **E2E:** two-login happy path through the UI.
