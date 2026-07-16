# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CheckList - Shared Checklists. Built on **rowboat** (a self-hosted, sync-native relational store) and
BetterAuth.

> CheckList was originally built on Jazz.tools and has since been ported off it entirely — `jazz-tools`
> is no longer a frontend dependency. The rowboat provider lives in `src/lib/rowboat.tsx`; the narrow
> waist the app imports auth + graph hooks from is `src/rowboat/` (`@/rowboat`).

**Key Features**:
- Hierarchical template organization
- Session-based shopping tracking
- Real-time sync across devices, offline-first with automatic background sync
- Multi-provider OAuth (Google + Apple)
- Freemium subscription tiers with Stripe billing
- White-label branding support (CheckList, kjekit)
- Mobile apps via Capacitor (Android/iOS)

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Data / sync**: rowboat (`@jbroll/rowboat-*`) — a relational, offline-first, sync-native store
  (IndexedDB on the client, self-hosted SQLite backend)
- **Authentication**: BetterAuth via rowboat's identity provider (`@jbroll/rowboat-auth-betterauth`)
  - OAuth Providers: Google + Apple
- **Billing**: Stripe (subscriptions, customer portal)
- **UI**: Tailwind CSS + Radix UI + Framer Motion
- **Mobile**: Capacitor (Android/iOS)
- **Build Tool**: Vite

## Development Commands

```bash
npm install              # Install dependencies
npm run dev             # Start BOTH frontend (5173) and backend (3001)
npm run dev:frontend    # Start frontend only
npm run dev:backend     # Start backend only
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run Biome linting
npm run type-check      # Run TypeScript type checking
npm run test:run        # Run unit tests (Vitest)
npm run test:e2e        # Run E2E tests (Playwright)
npm run check           # Run type-check + lint + tests
```

**IMPORTANT**: The app requires BOTH frontend and backend to be running for authentication and data
persistence (sync) to work. Always use `npm run dev` to start both servers.

## Git Commit Rules

**Pre-commit**: Runs type-check, lint, unit tests, E2E tests (6-10 min).
    ALL HOOK CHECKS MUST PASS
    YOU MAY NOT BYPASS THE COMMIT HOOKS

    Non-code changes do not run the commit checking hooks

## Project Structure

```
checklist/
├── shared/
│   └── schema.ts          # rb.* schema (Folder, UserSettings) — shared frontend + backend
├── src/
│   ├── schema/
│   │   ├── folder.ts      # rowboat FolderRow types + read/parse boundary
│   │   ├── folderData.ts  # folder row parsing
│   │   └── userSettingsData.ts
│   ├── lib/
│   │   ├── auth-client.ts # BetterAuth client
│   │   ├── account-merge.ts # rowboat account-merge fetch client
│   │   ├── rowboat.tsx       # rowboat provider + sync loop + anon-claim wiring
│   │   ├── brand.ts       # White-label branding config
│   │   └── utils.ts       # Helper functions
│   ├── rowboat/              # narrow waist: re-exports the rowboat provider + auth hooks
│   ├── components/
│   │   ├── AuthGate.tsx   # Auth wrapper component
│   │   ├── tree/          # Tree view (folders and items)
│   │   ├── editor/        # App container and routing
│   │   ├── session/       # Shopping session interface
│   │   ├── sharing/ auth/ # Share dialog + invite accept; account-merge flow
│   │   ├── billing/       # Subscription and upgrade UI
│   │   ├── import/ export/
│   │   └── ui/            # Base UI components (Radix UI)
│   ├── services/
│   │   ├── folderService.ts folderListHandles.ts   # folder ops + rb.ordered handles
│   │   ├── templateService.ts sessionService.ts sessionCleanupService.ts
│   │   ├── subscriptionService.ts # Billing and tier limits
│   │   └── import/ export/
│   ├── App.tsx            # Root component
│   └── main.tsx           # Entry point
├── backend/               # rowboat auth + identity + sync + sharing + Stripe (one sqlite db)
├── public/                # Static assets
├── ARCHITECTURE.md        # System overview
├── README.md              # Getting started
├── QUICKSTART.md          # Quick setup
└── CLAUDE.md              # This file
```

## rowboat integration

Rowboat is a relational store that syncs across devices in real-time, offline-first. See
`ARCHITECTURE.md` for the system overview.

**Key concepts**:
- **Relational schema**: tables authored in Zod with `rb.*` column helpers, compiled to a sync
  manifest by `compileSchema`. Two tables: `folder` and `user_settings` (`shared/schema.ts`).
- **RelationalGraph**: the reactive client view of the synced rows (`RelationalGraph<typeof schema>`).
  Reads/writes flow through the service layer, never a Jazz-style CoValue tree.
- **Scope-group RBAC**: rows are owned by a scope group (`owner_group_id`); folders are per-folder
  groups linked under the user's root group. Authorization is scoped pull + gated push.
- **Sync**: local-first writes hit IndexedDB and sync over `/api/sync` in the background;
  conflict resolution is per-column / per-json-path last-write-wins (HLC).

### Schema syntax (rowboat `rb.*`)

Tables are hand-authored in Zod with `rb.*` column types (`shared/schema.ts`):

```typescript
import { rb } from '@jbroll/rowboat-schema';
import { z } from 'zod';

export const Folder = z.object({
  id: rb.id(),
  owner_group_id: rb.scope(),          // RBAC scope group that owns the row
  name: rb.text(),
  type: rb.text(),
  parent_id: rb.parent('folder'),      // self-FK tree
  archived: rb.bool(),
  created_at: rb.int(),                // epoch ms
  items: rb.ordered(TemplateItem, { key: 'id' }),   // mergeable keyed-map list
  sessions: rb.ordered(SessionData, { key: 'id' }),
  default_items: rb.json(z.record(z.string(), z.boolean())),
});

export const schema = { folder: Folder, user_settings: UserSettings };
```

**Key patterns**:
- Primitives: `rb.text()`, `rb.int()`, `rb.bool()`, `rb.json(zodSchema)`.
- Relations: `rb.scope()` (owner group), `rb.parent('table')` (self/other FK), `rb.ref('table')`.
- **`rb.ordered(Element, { key })`** for lists (items/sessions): stored as a keyed map
  `{ <id>: { …element, __order } }` with **field-level dotted-path merge**, so concurrent edits to
  different items don't clobber each other. Never rewrite the whole list value.

## BetterAuth integration

BetterAuth is wired as rowboat's identity provider (`@jbroll/rowboat-auth-betterauth`).

**Authentication flow**:
1. User authenticates through BetterAuth (Google/Apple OAuth; email/password for e2e).
2. `user.id` IS the account; the user's root scope group (`= user.id`) is auto-provisioned at signup.
3. Anonymous users work offline in a local store; on sign-in `useAnonClaim` adopts that data into the
   account's scope (see ARCHITECTURE.md → Anonymous sessions & convergence).

**Files**:
- `src/lib/auth-client.ts` - BetterAuth client
- `src/lib/rowboat.tsx` - the rowboat provider (`RowboatBridge`), sync loop, and account-init provisioning

## Environment Variables

Required variables (see `.env.example`):

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APPLE_CLIENT_ID=...
APPLE_CLIENT_SECRET=...
VITE_API_URL=http://localhost:3001
AUTH_DB_PATH=./data/auth.db        # backend sqlite (auth + identity + sync)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

## Common Development Patterns

### Working with the rowboat graph

Reads and writes go through the service layer (`src/services/`), which operates on the reactive
`RelationalGraph`. The graph is reactive — subscribe via the rowboat hooks; do **not** mirror graph
data into `useState`.

- **Row writes** are field-level (`g.folder.update(id, { name: 'New Name' })`), not whole-object
  replacements.
- **Ordered lists** (`items`/`sessions`) are mutated through the `orderedList` handles in
  `src/services/folderListHandles.ts` (`append` / `setField` / `move` / `remove`) — this is what makes
  concurrent item edits merge. Never `push`/`splice` a whole list value.
- **Soft delete**: mark `archived: true` (or tombstone via the handle), never hard-delete.

```typescript
// Soft delete — never splice a list
// ❌  rewrite whole list
// ✅  handle-based, field-level:
itemsList(g, folderId).setField(itemId, 'archived', true);
```

## Key Implementation Notes

### Hierarchical Organization

- **Templates** are organized in a folder tree via `parent_id` (self-FK), path strings for display.
- **Discriminated folders**: `Folder.type: "folder" | "template-folder"`.
- **TemplateItems** have `type: "category" | "item"` for internal hierarchy.

### Shopping Sessions

- Sessions track shopping state **separately** from templates (templates stay clean).
- `ItemState` maps itemId → shopping state (in-cart, checked).
- Multiple sessions can reference the same template.

### Soft Deletes

Always mark `archived: true` (via the service/handle layer) instead of removing rows or list
elements. Ordered-list removal tombstones the element (`__deleted`), never a whole-value rewrite.

## Testing & Building

```bash
npm run type-check   # TypeScript validation
npm run lint         # Code linting
npm run test:run     # Unit tests
npm run test:e2e     # E2E tests
npm run test:e2e:invite  # Invite closed-loop E2E (needs GreenMail; see e2e/INVITE_TESTING.md)
npm run build        # Production build
npm run preview      # Test production build
```

## Troubleshooting

**Build errors**:
- Clear `node_modules` and reinstall
- Check TypeScript errors: `npx tsc --noEmit`

**OAuth not working**:
- Check credentials in `.env`
- Verify redirect URIs in OAuth console

**Data not syncing**:
- Confirm the backend is running (sync is served at `/api/sync`)
- Check the network tab for `/api/sync/pull` / `/api/sync/push` calls and the browser console
- A stale backend sync DB can reject writes on a schema change — a fresh `AUTH_DB_PATH` db re-registers
  the current schema (see `docs/DEFERRED.md` D4)

## Important Notes for AI Assistants

- **The rowboat graph is reactive** — subscribe via the rowboat hooks; don't mirror it into `useState`.
- **Writes are field-level** — update individual columns / list elements; don't rewrite whole rows or
  whole ordered-list values (that reintroduces the D1 concurrency data-loss).
- **Ordered lists go through `folderListHandles`** — `append`/`setField`/`move`/`remove`.
- **Sync is automatic** — local-first writes sync in the background; no manual API calls needed.
- **Always soft delete** — `archived: true` / tombstone, never splice/remove.
- **Templates stay clean** — session state is tracked separately in `SessionData`.
- **No `jazz-tools`** in the frontend — only `src/rowboat/**` (the narrow waist) may touch the underlying
  framework; everything else imports the provider/auth hooks from `@/rowboat`.

## Documentation

- **README.md** - Getting started and setup
- **QUICKSTART.md** - Quick setup guide
- **ARCHITECTURE.md** - System architecture overview
- **DEPLOY.md** - Deployment instructions
- **docs/DEFERRED.md** - Open engineering backlog
- **docs/INDENTED_LIST_FORMAT.md** - Hierarchical text import/export format
- **BetterAuth Docs**: https://better-auth.com/docs
```
