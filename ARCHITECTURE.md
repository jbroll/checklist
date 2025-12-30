# CheckList System Architecture

A collaborative list application built with Jazz.tools, BetterAuth, and Stripe.

## Core Architecture

**Hierarchical Template-Session Model**

Templates are reusable shopping lists organized in folders. When you "use" a template, it creates a shopping session that tracks what's in your cart and what you've purchased, without modifying the template.

```
📁 Folder (organizational)
   └── 📋 Template Folder (contains items)
        ├── Template Items (master list)
        └── Shopping Sessions (state tracking)
```

## Key Design Decisions

1. **Templates Stay Clean**: Shopping state (checked/purchased) lives in sessions, never in template items
2. **Hierarchical Items**: Templates use a category/item tree structure (see `TemplateItem` in `src/schemas/tree.ts`)
3. **Path-Based Organization**: Folders and items use path strings for hierarchy (e.g., "stores/wegmans")
4. **Soft Deletes**: Items marked `archived: true`, never hard deleted
5. **Jazz CoValues**: Real-time sync, offline-first, encrypted data storage

## Data Model

**Schemas** (see `src/schemas/`):
- `FolderNode` - Organizational folder or template folder (`tree.ts`)
- `TemplateItem` - Hierarchical category or item (`tree.ts`)
- `SessionData` - Shopping trip state tracker (`tree.ts`)
- `ItemState` - Per-item shopping state (`tree.ts`)
- `Account` - User account with root folder list (`index.ts`)

**Discriminated Unions**:
- FolderNode has `type: "folder" | "template-folder"`
- TemplateItem has `type: "category" | "item"`

## UI Components

**Tree Navigation** (`src/components/tree/`):
- `TreeView.tsx` - Main folder tree
- `FolderNodeView.tsx` - Folder/template row
- `SessionRowView.tsx` - Session list item

**App Container** (`src/components/editor/`):
- `AppContainer.tsx` - Main app shell and view routing
- `AddFolderDialog.tsx` - Create new folder dialog

**Shopping Session** (`src/components/session/`):
- `ShoppingSessionView.tsx` - Active shopping interface
- `ShoppingSessionItemRow.tsx` - Dual-checkbox item row
- `SessionZone.tsx` - Zone container (Inventory → In Cart → Completed)

**Import/Export** (`src/components/import/`, `src/components/export/`):
- Full folder backup/restore (JSON)
- Template items import/export (TXT/CSV)
- Session export (TXT/CSV)

## Services

**Folder Operations** (`src/services/folderService.ts`):
- Create/delete/rename folders
- Path hierarchy management

**Import/Export** (`src/services/import/`, `src/services/export/`):
- JSON serialization/deserialization
- CSV/TXT parsing
- Conflict resolution

## Authentication

**BetterAuth Integration** (`src/lib/auth-client.ts`):
- OAuth providers: Google + Apple
- Jazz plugin stores account keys
- Session management

**Jazz Provider** (`src/lib/jazz.tsx`):
- Wraps app with authentication context
- Connects to Jazz sync server

## Folder Sharing

**Overview**:
Folders (both organizational and template folders) can be shared via email invitations. The sharing system uses Jazz's built-in CoValue groups with an invite-based access control layer.

**Architecture** (`backend/src/`):
- `shares.ts` - API endpoints for invite creation, validation, and acceptance
- `agent.ts` - Jazz agent for adding users to folder groups
- `migrations/shares.sql` - SQLite table for tracking invitations

**Flow**:
1. **Invite Creation**: Owner generates a shareable link with recipient email and permissions
2. **Invite Acceptance**: Recipient clicks link, logs in, and gains access via Jazz groups
3. **Access Control**: Jazz automatically syncs folder to recipient's device

**Security**:
- Email validation: Recipient email must match authenticated session
- Sender validation: Sender must still have folder access when invite is accepted
- Token-based: 32-byte cryptographic tokens for invite URLs
- Expiration: Time-limited invites enforced server-side

**Components** (`src/components/sharing/`):
- `ShareDialog.tsx` - Create and manage folder invitations
- `InviteAcceptPage.tsx` - Accept invitation and join folder group

**Routes**:
- `/invite/:token` - Invitation acceptance page

## Billing & Subscriptions

**Freemium Model** (`src/services/subscriptionService.ts`):
- Starter (Free): 3 lists, 7-day session history
- Plus ($9.99/yr): 30 lists, 30-day history
- Premium ($19.99/yr): Unlimited lists, unlimited history

**Stripe Integration** (`backend/src/billing/`):
- `stripe.ts` - Stripe client and webhook handling
- `subscription.ts` - Tier management and limit enforcement

**Components** (`src/components/billing/`):
- `UpgradeDialog.tsx` - Tier comparison and checkout
- `UpgradeBanner.tsx` - Soft limit warning banner
- `BillingSuccessPage.tsx` / `BillingCancelPage.tsx` - Post-checkout pages

**Beta Mode**: During beta, all users get Plus tier limits free. Controlled via `subscriptionStatus: 'beta'` in user settings.

## White-Label Branding

**Brand Configuration** (`src/lib/brand.ts`):
- Runtime domain detection for brand switching
- CheckList (default): checklist-app.rkroll.com
- kjekit: app.kjekit.com

**Configurable Elements**:
- App name, tagline, colors
- Logo assets and favicon
- Support/sales email addresses
- Storage key prefixes

## File Structure Reference

```
src/
├── schemas/
│   ├── index.ts          # Account and root schemas
│   └── tree.ts           # Folder/item/session schemas
├── components/
│   ├── tree/             # Folder navigation
│   ├── editor/           # Template editing
│   ├── session/          # Shopping interface
│   ├── sharing/          # Folder sharing UI
│   ├── billing/          # Subscription and upgrade UI
│   ├── import/           # Import dialogs
│   └── export/           # Export dialogs
├── services/
│   ├── folderService.ts        # Folder operations
│   ├── subscriptionService.ts  # Billing and tier limits
│   ├── import/                 # Import logic
│   └── export/                 # Export logic
└── lib/
    ├── auth-client.ts    # BetterAuth config
    ├── brand.ts          # White-label branding
    └── jazz.tsx          # Jazz provider

backend/src/
├── billing/
│   ├── stripe.ts         # Stripe client and webhooks
│   └── subscription.ts   # Tier management
├── migrations/
│   └── shares.sql        # Share invites table
├── agent.ts              # Jazz agent for groups
├── shares.ts             # Sharing API endpoints
└── auth.ts               # BetterAuth config
```

## Development Workflow

See `CLAUDE.md` for Jazz-specific patterns and coding standards.
