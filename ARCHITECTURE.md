# CheckList System Architecture

A collaborative, offline-first list application built on **rowboat** (a self-hosted,
sync-native relational store), **BetterAuth**, and **Stripe**.

> **Note:** CheckList's data/sync layer is **rowboat** — a relational, offline-first sync store.
> The rowboat provider lives in `src/lib/rowboat.tsx`
> and its narrow waist (the `@/rowboat` re-export the app imports auth + graph hooks from) in
> `src/rowboat/`.

## Core Architecture

**Template–Session model.** A *template folder* holds a reusable list (its `items`). "Using" a
template opens a *shopping session* that tracks per-item state (in-cart / checked) **separately**
from the template, so templates stay clean. One template can back many sessions. A session is
labelled by its creation date unless the user names it (`SessionData.name`; an empty string clears
the name, since an `undefined` field write would not survive the sync wire). JSON export marks a
user-set name with `customName: true`, and import restores only those, so older exports that carry
a generated date name import as unnamed.

```
📁 Folder (organizational)          type: "folder"
   └── 📋 Template Folder           type: "template-folder"
        ├── items      (the reusable list — rb.ordered keyed map of TemplateItem)
        └── sessions   (shopping trips — rb.ordered keyed map of SessionData)
```

Folders form a tree via a self-referencing `parent_id`, not a nested document.

The top-level view (folder tree vs. an open session) is driven by a hash-based history state
(`src/lib/useNavigationHistory.ts`, threaded through `AppContainer` and into `SessionView`), so
browser back/forward toggle tree↔session and the in-session edit mode. It is **nav-only**: opening a
session pushes a history entry, but a reload / pasted `#session/…` URL lands on the tree (no
deep-link/id-resolution restore).

The session view's keyboard shortcuts (`src/components/session/useSessionKeyboard.ts`) are one
`keydown` listener on `document`, off while the edit form is open. It skips events from text
fields, events with Ctrl/Alt/Meta held, already-handled events, and any event while a dialog or menu
is mounted, so Radix overlays and `ItemInput` keep their own Escape. Arrow keys move DOM focus
through the rendered `[data-item-id]` rows, so collapsed zones are skipped.

## Data model (rowboat relational schema)

The schema is authored once in Zod with rowboat's `rb.*` column helpers and shared by frontend and
backend (`shared/schema.ts`), compiled to a sync manifest via `compileSchema`. Two tables:

- **`Folder`** — `id`, `owner_group_id` (`rb.scope()` — the RBAC scope group that owns the row),
  `name`, `type`, `parent_id` (`rb.parent('folder')` — self-FK tree), `sharing_mode`, `archived`,
  `expanded`, `created_by`, `created_at`/`updated_at` (epoch-ms), `show_zone_headings`,
  `auto_categorize_enabled`, `autocomplete_domain`, `default_items` (`rb.json`), and the two
  template payloads:
  - **`items`** — `rb.ordered(TemplateItem, { key: 'id' })`
  - **`sessions`** — `rb.ordered(SessionData, { key: 'id' })`
- **`user_settings`** — the per-user singleton (subscription tier/status/cache + view-expansion
  state). Its `id` equals the user's scope group (`= user.id`), which makes it an *identity-keyed
  singleton* (see Anonymous sessions & convergence).

`TemplateItem` (category/item tree, `path`-based) and `SessionData` (per-item `itemStates`, view
mode, counts) are the element schemas of the ordered columns. Read-side parsing lives in
`src/schema/folder.ts` / `folderData.ts` / `userSettingsData.ts`.

### `rb.ordered` — mergeable ordered lists

`items` and `sessions` are stored as **keyed maps** (`{ <id>: { …element, __order, __deleted? } }`),
not JSON arrays. Every mutation is a **field-level dotted-path write** (`items.<id>.checked`), so two
clients editing *different* items in the same list merge with no lost survivor — the fix for the
D1 whole-cell-LWW data-loss. The app reads/writes them through `orderedList` handles
(`src/services/folderListHandles.ts`). Display order is the `sortOrder` field in manual mode
(the ordered column's `__order` fracKey is the eventual home); a global display-only sort
preference (`manual` | `ascending` | `descending`, `src/lib/sortPreference.ts`, localStorage) switches the
`buildItemTree` / `buildCategoryTree` / `useSessionItems` comparators to `name` order (A-Z or Z-A) without
rewriting `sortOrder`. Values are validated server-side against a
keyed-map jsonSchema on push.

**Soft deletes** everywhere: rows/items are marked `archived: true` (or tombstoned), never hard
deleted.

## Sync & persistence

Rowboat is offline-first: all reads/writes hit the local store (IndexedDB in the browser) and sync
in the background over `/api/sync` (push/pull). Conflict resolution is **per-column / per-json-path
last-write-wins keyed on an HLC stamp**, so concurrent edits converge deterministically. A short
epoch handshake reconciles a fresh client with the server generation. Cross-tab updates propagate
via `BroadcastChannel`. `src/lib/rowboat.tsx` hosts the rowboat provider (`RowboatBridge`), the sync
loop, and account-init provisioning.

## Backend (`backend/src/`)

A single self-hosted Express server on one better-sqlite3 database, serving sync over
`/api/sync` via the rowboat packages.
`backend/src/index.ts` wires the rowboat packages onto that db:

- `@jbroll/rowboat-auth` — RBAC scope groups (`createRbacAuth`, `createScopeGroup`,
  `registerAuthTables`); `group_members` / `groups` / `group_inheritance` with `effectiveRole`
  walking a group's ancestor chain.
- `@jbroll/rowboat-auth-betterauth` — the BetterAuth identity provider + `registerIdentityTables`.
- `@jbroll/rowboat-backend` — sync tables + `/api/sync` (`compileSchema` → `registerSyncTable` →
  `mountSyncRoutes`).
- `@jbroll/rowboat-sharing` — share invites/accept/grant (`registerShareTables`, `mountShareRoutes`).
- `backend/src/billing/` — Stripe client, webhooks, and the `/api/billing/*` routes.

The folder's `owner_group_id` is a per-folder scope group, minted server-side via
`POST /api/folders/group` (`createScopeGroup`) and linked as a child of the user's root group so
`effectiveRole` grants the owner admin.

Every mint at hosted rowboat's `POST <sync base>/groups` sends a `requestKey`, and rowboat answers
a repeated key with the group its first mint made. `mintGroup(requestKey, parentGroupId?)` takes the
key from its caller, never a default: a new folder (tree, JSON and text import) keys on its new row
id (`folder:<id>`), the first-run seed on `seed:<identity>`, and the Jazz import on the source list
(`jazz:<listId>`), so a re-run after a partial import reuses the groups it already made. The
anonymous claim's `mintScope(anonScope, requestKey)` sends the key rowboat's claim gives it, which
stays the same across a lost reply and a resume.

> **Direction — hosted rowboat (StaaS).** The embedded backend above is being superseded by running
> CheckList against a hosted `@jbroll/rowboat-server` (sync/storage/RBAC/sharing move to rowboat;
> CheckList keeps branded auth + billing + JWT issuance). The auth bridge (JWKS) and per-database
> RBAC now exist on rowboat's side (phases A & B landed); sharing + the CheckList client repoint are
> phase C. See [`docs/HOSTED_ROWBOAT.md`](docs/HOSTED_ROWBOAT.md).

## Authentication & identity

- **BetterAuth** (`src/lib/auth-client.ts`) — OAuth (Google + Apple) plus an email/password path
  gated behind `CHECKLIST_TEST_AUTH` for e2e.
- **Rowboat identity:** `user.id` **is** the account; the user's root scope group is named `user.id`
  and auto-provisioned at signup. Folders are scope groups linked beneath it.

### Anonymous sessions & convergence

Anonymous users get a local, never-synced store scoped to `ANON_IDENTITY`. On sign-in,
`useAnonClaim` **adopts** that store into the authenticated account's scope (`adoptAnonStore`,
crash-resume-safe), and the provider remounts on the identity flip (`key = identity`). Each
anonymous folder's local group is replaced by a newly minted server group (`mintScope`), because
folders in the root group could not be shared: the sharing server refuses invites to a root group,
which holds every private row.

The anonymous store opens only under a shared Web Lock named after it (`src/lib/anonStoreHold.ts`):
`RowboatBridge` renders nothing until the lock is granted and gives it back with its debounced
`db.close()`. A claim takes that lock exclusively, so no tab writes the anonymous store while the
claim copies and deletes it. In the signing-in tab the bridge remounts to the account store and
releases the lock; a claim queued behind another tab's claim waits it out. Another tab still open
on the anonymous store blocks the claim: past rowboat's bound `useAnonClaim` reports
`blockedByOtherTab`, nothing is copied, `claiming` stays true (so first-run provisioning keeps
waiting), and `ClaimBlockedBanner` asks the user to close that tab and offers Retry (`retry()`).
Web Locks needs iOS 15.4, so the iOS app's deployment target is 15.4
(`IPHONEOS_DEPLOYMENT_TARGET` in every configuration of `ios/App/App.xcodeproj`): without it the
anonymous store cannot open and signed-in sync (`syncWithServer`) refuses to run. The generated
`ios/App/CapApp-SPM/Package.swift` keeps Capacitor's own `.iOS(.v15)` floor, which the app's
higher target overrides.

Adopt
converges **identity-keyed singletons** (a row whose `id` equals its scope key — `user_settings`) to
the one canonical `id = user.id` row instead of duplicating it (D2). Account-init provisioning
(`RowboatBridge`, gated until the auth session and the claim have settled) then: provisions the
`user_settings` singleton, seeds the default "Quick Errands" list for genuinely-new
authenticated users (anonymous stores are never seeded — they are transient and claimed on
sign-in, which duplicated the seed on every new-device login), auto-archives sessions past the tier's retention window, and re-asserts the subscription tier
authoritatively from the backend so an adopted/stale cache can't leave a paying user downgraded.

### Account merge

Two accounts can be combined via rowboat's native merge (`src/lib/account-merge.ts` is a thin fetch
client over `@jbroll/rowboat-auth-betterauth`'s routes; `src/components/auth/MergeAccountFlow.tsx` is
a two-login flow requiring source-email confirmation before finalize). The merge is group `link` +
`grant` — **no data movement** — with self-merge and chained-merge deletion guards. The confirm
screen reads the prepared source from `/api/account/merge/info` (`sourceUserId`, `sourceEmail`), and
finalize sends that `sourceUserId` back; rowboat refuses a finalize naming any other account, so a
source that prepared after the user looked is never granted admin. A merge with no prepared source
shows an error instead of a confirm.

## Folder sharing

Folders are shared through rowboat's sharing routes (invite → accept → grant into the folder's scope
group). `src/components/sharing/` holds only markup; the state comes from
`@jbroll/rowboat-sharing-react`. `ShareDialog` uses `useShareManager` for the collaborator and
pending-invite lists and for invite, remove and revoke. It offers Copy link (`sendEmail: false`) and
Email invite, and sends the folder name as `targetName` (folded to one line, cut to 200 characters)
so the email and the accept page name the list. Collaborators show by name, or by email when the
name is null; a member whose account was deleted still holds the membership and shows as "Deleted
account (<account id>)" with Remove. Errors are shown by `SharingError.code`:
`root_group` (the folder is still in the account's private root group), `forbidden` (not an admin of
the folder), otherwise a generic message. Every message on the dialog and the invite page ends with
the error code, or the HTTP status when there is none (`sharingErrorText.ts`), and the full error
goes to the browser console. The server's own error text is never shown; rowboat's share routes
write it to the backend log.

Invites are token-based, time-limited, and server-validated (recipient email must match the
authenticated session; the sender must still have access at acceptance). `App.tsx` routes
`/invite/<64-hex token>` (`inviteTokenFromPath`) to `InviteAcceptPage`, which maps
`useInviteAcceptance` states onto its screens and redirects to `/` two seconds after an accept.
Validate answers an invite addressed to another email with `wrong_account`, which shows the Wrong
Account screen before any accept; an expired, revoked, used or unknown token, or one whose inviter's
account was deleted, shows "This invite link is no longer valid." Accept refusals each get a
sentence: `inviter_no_longer_admin` (rowboat deletes the invite, so it asks for a new one),
`grant_refused` (the sharing agent lost admin), `blocked` (the account blocked the sender),
`unknown_role` (the invite's role left the role list) and `root_group`. A 503 `undo_pending` on
accept means an undo of an earlier grant to the account in the folder's group is still owed; the
page says the invite is still valid, to try again in a minute, and to ask the owner to remove and
re-invite them if it persists. A validate answer the
invite hook cannot read shows its own message instead of a half-filled invite. A signed-out
visitor signs in first: the token is stashed in `sessionStorage` (`stashInviteToken`) so it stays
out of the OAuth callback URL, and `AuthGate` returns to the invite page with
`takeStashedInviteToken`, which drops a malformed value. When the browser refuses
`sessionStorage`, the stash returns false and the OAuth callback URL is the invite page itself.

An accept whose grant may have landed after the invite was removed, or whose grant failed partway,
is undone; an undo that fails is kept in `share_pending_revokes` and retried. The backend's
`start()` calls `retryPendingRevokes()` once, then again 60 s after each call settles, never on an
interval, since a call waits on hosted rowboat without a bound. The timer is `unref`'d and cleared
when the server `start()` returned closes. A failed call is logged as `[sharing] retrying owed
invite undos failed:`; a failed undo inside it is logged by rowboat and stays owed.

## Billing & subscriptions

Freemium tiers (Free / Plus / Premium) enforced in `src/services/subscriptionService.ts`. The active
tier is cached in `user_settings` and treated as authoritative from the Stripe-backed
`/api/billing/subscription` endpoint (`syncSubscriptionFromBackend`, re-run on login and after
checkout). Stripe client/webhooks live in `backend/src/billing/`. During **beta**
(`subscription_status: 'beta'`) all users get Plus-tier limits.

## White-label branding

`src/lib/brand.ts` switches app name, colors, logos, support addresses, and storage-key prefixes by
runtime domain (CheckList default; kjekit).

## Import / export

Full folder backup/restore (JSON) and per-list/session TXT·CSV, re-typed against the rowboat
`FolderRow` shape (plain typed rows). See `src/services/import/` and `src/services/export/`, and
`docs/INDENTED_LIST_FORMAT.md` for the hierarchical text format.

## File structure reference

```
shared/
└── schema.ts             # rb.* schema (Folder, UserSettings) — shared frontend + backend
src/
├── schema/
│   ├── folder.ts         # rowboat FolderRow types + parse boundary
│   ├── folderData.ts     # folder row parsing
│   └── userSettingsData.ts
├── components/
│   ├── tree/ editor/ session/   # folder nav, app shell, shopping UI
│   ├── sharing/ auth/           # share dialog + invite accept; merge flow
│   ├── billing/ import/ export/
├── services/
│   ├── folderService.ts folderListHandles.ts   # folder ops + rb.ordered handles
│   ├── templateService.ts sessionService.ts
│   ├── subscriptionService.ts sessionCleanupService.ts
│   └── import/ export/
└── lib/
    ├── auth-client.ts    # BetterAuth client
    ├── account-merge.ts  # rowboat account-merge fetch client
    ├── brand.ts          # white-label branding
    └── rowboat.tsx          # rowboat provider + sync loop + anon-claim wiring
backend/src/
├── index.ts              # rowboat auth + identity + sync + sharing on one sqlite db
└── billing/              # Stripe client, webhooks, /api/billing routes
```

## Development workflow

See `CLAUDE.md` for coding standards. Outstanding features and engineering items live in `docs/BACKLOG.md`.
