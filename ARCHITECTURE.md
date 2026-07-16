# CheckList System Architecture

A collaborative, offline-first list application built on **rowboat** (a self-hosted,
sync-native relational store), **BetterAuth**, and **Stripe**.

> **Note:** CheckList was originally built on Jazz.tools and has since been ported off it entirely —
> `jazz-tools` is no longer a frontend dependency. The rowboat provider lives in `src/lib/rowboat.tsx`
> and its narrow waist (the `@/rowboat` re-export the app imports auth + graph hooks from) in
> `src/rowboat/`.

## Core Architecture

**Template–Session model.** A *template folder* holds a reusable list (its `items`). "Using" a
template opens a *shopping session* that tracks per-item state (in-cart / checked) **separately**
from the template, so templates stay clean. One template can back many sessions.

```
📁 Folder (organizational)          type: "folder"
   └── 📋 Template Folder           type: "template-folder"
        ├── items      (the reusable list — rb.ordered keyed map of TemplateItem)
        └── sessions   (shopping trips — rb.ordered keyed map of SessionData)
```

Folders form a tree via a self-referencing `parent_id`, not a nested document.

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
(`src/services/folderListHandles.ts`). Display order is the `sortOrder` field today (the ordered
column's `__order` fracKey is the eventual home). Values are validated server-side against a
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

A single self-hosted Express server on one better-sqlite3 database, replacing the former hosted
Jazz/jbr-jazz sync service. `backend/src/index.ts` wires the rowboat packages onto that db:

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

## Authentication & identity

- **BetterAuth** (`src/lib/auth-client.ts`) — OAuth (Google + Apple) plus an email/password path
  gated behind `CHECKLIST_TEST_AUTH` for e2e.
- **Rowboat identity:** `user.id` **is** the account; the user's root scope group is named `user.id`
  and auto-provisioned at signup. Folders are scope groups linked beneath it.

### Anonymous sessions & convergence

Anonymous users get a local, never-synced store scoped to `ANON_IDENTITY`. On sign-in,
`useAnonClaim` **adopts** that store into the authenticated account's scope (`adoptAnonStore`,
crash-resume-safe), and the provider remounts on the identity flip (`key = identity`). Adopt
converges **identity-keyed singletons** (a row whose `id` equals its scope key — `user_settings`) to
the one canonical `id = user.id` row instead of duplicating it (D2). Account-init provisioning
(`RowboatBridge`, gated until the auth session and the claim have settled) then: provisions the
`user_settings` singleton, seeds the default "Quick Errands" list for genuinely-new users,
auto-archives sessions past the tier's retention window, and re-asserts the subscription tier
authoritatively from the backend so an adopted/stale cache can't leave a paying user downgraded.

### Account merge

Two accounts can be combined via rowboat's native merge (`src/lib/account-merge.ts` is a thin fetch
client over `@jbroll/rowboat-auth-betterauth`'s routes; `src/components/auth/MergeAccountFlow.tsx` is
a two-login flow requiring source-email confirmation before finalize). The merge is group `link` +
`grant` — **no data movement** — with self-merge and chained-merge deletion guards.

## Folder sharing

Folders are shared through rowboat's sharing routes (invite → accept → grant into the folder's scope
group). Delivery is **capability-gated** (`src/components/sharing/`): Copy-link is always available;
on devices with `navigator.share` the OS share sheet is offered, otherwise an Email Invite. Invites
are token-based, time-limited, and server-validated (recipient email must match the authenticated
session; the sender must still have access at acceptance). `InviteAcceptPage` handles `/invite/:token`.

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
`FolderRow` shape (no Jazz types). See `src/services/import/` and `src/services/export/`, and
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

See `CLAUDE.md` for coding standards. Open engineering items live in `docs/DEFERRED.md`.
