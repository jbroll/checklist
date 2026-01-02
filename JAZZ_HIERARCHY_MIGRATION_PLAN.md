# Jazz Package Migration Plan

This document outlines the plan to migrate CheckList and WicketMap to use a unified package ecosystem, sharing code while preserving app-specific features.

## Migration Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 0** | Package restructuring | **COMPLETE** |
| **Phase 1** | Schema alignment | **COMPLETE** |
| **Phase 2** | Backend consolidation | **COMPLETE** |
| **Phase 3** | Frontend migration | **ASSESSED - DEFERRED** |
| Phase 4 | SharedReference implementation | Pending |
| Phase 5 | Publication system | Pending |

### Phase 0 Completed Work

1. Created `@jazz-billing/*` package structure (shared, client, backend)
2. Created `@jazz-registry/*` package structure (shared, backend)
3. Extracted billing code from jazz-hierarchy to jazz-billing
4. Extracted registry code from jazz-hierarchy to jazz-registry
5. Updated jazz-hierarchy base fields to use Date objects
6. Removed billing/registry exports from jazz-hierarchy
7. Updated wicketmap root package.json with new workspaces

### Phase 2 Completed

1. Contributed CheckList security features to jbr-jazz:
   - Enhanced RateLimiter with cleanup interval and destroy()
   - Added PersistentRateLimiter for SQLite-backed rate limiting
   - Added ApiErrors helper for consistent error responses (with generic types)
   - Added request ID and CSRF protection middleware
   - Added webhook idempotency checking to billing
   - Added token validation rate limiting to shares
   - Added periodic expired invite cleanup to shares

2. CheckList backend now uses jbr-jazz shared utilities:
   - Added @jbr-jazz/hierarchy-backend as dependency
   - Re-exported: RateLimiter, PersistentRateLimiter, ApiErrors
   - Re-exported: verification-token utilities, email-matching utilities

3. App-specific modules remain in CheckList (by design):
   - `auth.ts` - CheckList-specific branding/email templates
   - `agent.ts` - Uses "folder" naming vs jbr-jazz "target" naming
   - `shares.ts` - Uses `/folders/` API paths vs `/targets/`
   - `verified-emails.ts` - Direct SMTP config vs config object

**Future consolidation opportunities:**
- Unify API paths (requires frontend changes)
- Extract common auth configuration patterns
- Share agent logic with configurable naming

### Phase 3 Assessment (Deferred)

**Analysis of jbr-jazz client packages:**

1. **useHierarchy hook** - Generic hook for folder CRUD, move, archive, subscription limits
   - CheckList uses `folderService.ts` (plain functions, not a hook)
   - Migration would require refactoring all components that call folderService
   - Assessment: Low value, high effort

2. **useSharing hook** - API client for sharing operations
   - jbr-jazz uses `/api/shares/targets/*` endpoints
   - CheckList uses `/api/shares/folders/*` endpoints
   - Assessment: Cannot use without backend API path changes

3. **useSubscription hook** - Subscription tier checking
   - CheckList's `subscriptionService.ts` is more comprehensive
   - Includes TIERS config, beta mode, Stripe checkout/portal integration
   - Assessment: CheckList's version is better suited to its needs

4. **UI Components** - Button, Dialog, TreeView, etc.
   - CheckList already has these via Radix UI
   - Different styling/branding needs
   - Assessment: Keep separate for flexibility

**Conclusion:** Full frontend migration provides low value for high effort. The apps have:
- Different API paths (folder vs target naming)
- Different service architectures (hooks vs plain functions)
- Different styling/branding requirements

**Deferred work (if needed later):**
- Unify API paths to enable useSharing hook adoption
- Refactor folderService to useHierarchy hook pattern
- Create shared component library with brand theming

### Phase 1 Completed Work

1. Renamed WicketMap schema fields from snake_case to camelCase:
   - `created_at` → `createdAt`
   - `updated_at` → `updatedAt`
   - `created_by` → `createdBy`
   - `imported_at` → `importedAt`
2. Added data migration in WicketMapAccount.withMigration() to:
   - Copy values from old field names to new field names
   - Set defaults for required fields if missing
3. Updated 72 files with new field names

---

## Executive Summary

The unified package ecosystem provides:
- **@jazz-hierarchy/*** - Hierarchical folder/item storage, sharing, tree components
- **@jazz-billing/*** - Subscription tiers, Stripe integration, usage limits
- **@jazz-registry/*** - Public item discovery, publication, search

This separation allows apps to pick only what they need while sharing common functionality.

---

## Package Architecture

```
@jazz-hierarchy/
├── shared/           # Base fields, types, archive/path utilities
├── client/           # useHierarchy, useSharing, TreeView, CollaboratorList
└── backend/          # Sharing routes, agent, verified emails

@jazz-billing/
├── shared/           # Tier types, limits, canCreateItem, shouldPurge
├── client/           # useSubscription hook
└── backend/          # Stripe integration, billing routes, webhooks

@jazz-registry/
├── shared/           # Publication types, search types
└── backend/          # Registry routes, search, copy tracking
```

### Package Dependencies

```
App (CheckList/WicketMap)
├── @jazz-hierarchy/shared    (required)
├── @jazz-hierarchy/client    (required)
├── @jazz-hierarchy/backend   (required)
├── @jazz-billing/shared      (optional - if using subscriptions)
├── @jazz-billing/client      (optional)
├── @jazz-billing/backend     (optional)
├── @jazz-registry/shared     (optional - if using publication)
└── @jazz-registry/backend    (optional)
```

---

## Unified Schema Conventions

These conventions apply to all packages:

| Aspect | Convention | Rationale |
|--------|------------|-----------|
| **Timestamps** | `createdAt: z.date()` (camelCase, Date objects) | JavaScript convention, type-safe |
| **Type discriminator** | Explicit `type` field | Enables exhaustive type checking |
| **Sharing mode** | `sharingMode: "private" \| "shared" \| "public"` | Required for UI and Jazz `makePublic()` |
| **Permissions** | `reader / writer / admin` | Matches Jazz's native role names |
| **Archive fields** | `archived: boolean`, `archivedAt: z.date()` | Soft-delete with retention support |
| **Parent reference** | Explicit `parent` getter | Enables path computation, breadcrumbs |
| **SharedReference** | Apps define own with typed `targetRef` | Package can't reference app types |

---

## @jazz-hierarchy/shared

### Base Fields

```typescript
// @jazz-hierarchy/shared/src/base-fields.ts

import { z } from "jazz-tools";

/**
 * Base fields for hierarchy folders.
 * Apps spread this and add app-specific fields.
 */
export const hierarchyFolderBaseFields = {
  // Identity
  name: z.string(),
  type: z.literal("folder"),  // Apps override: "template-folder", "map", etc.

  // Sharing
  sharingMode: z.enum(["private", "shared", "public"]),

  // UI state
  expanded: z.boolean().optional(),

  // Archive (soft-delete)
  archived: z.boolean().optional(),
  archivedAt: z.date().optional(),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
} as const;

/**
 * Base fields for shared references.
 * Apps add typed `targetRef` getter.
 */
export const sharedReferenceBaseFields = {
  targetId: z.string(),
  targetPath: z.string(),
  targetName: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  role: z.enum(["admin", "writer", "reader"]),
  sharedAt: z.date(),
} as const;

/**
 * Base fields for view state (per-user UI preferences).
 */
export const viewStateBaseFields = {
  folderExpanded: z.record(z.string(), z.boolean()),
} as const;
```

### Utilities

```typescript
// Archive utilities
export { archiveFolder, unarchiveFolder, isArchived, filterActiveNodes } from "./archive.js";

// Path utilities
export { getNodePath, isDescendantOf, findNodeByPath } from "./path.js";

// Migration helpers
export { ensureFolderBaseFields, migrateAllFolders } from "./migration.js";
```

---

## @jazz-billing/shared

### Types and Limits

```typescript
// @jazz-billing/shared/src/types.ts

export type SubscriptionTier = "free" | "plus" | "premium" | "enterprise";
export type SubscriptionStatus = "active" | "past_due" | "cancelled" | "trialing" | "beta";

export interface SubscriptionLimits {
  maxItems: number;      // -1 for unlimited
  retentionDays: number; // -1 for unlimited
}

// @jazz-billing/shared/src/constants.ts

export const DEFAULT_TIER_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  free: { maxItems: 3, retentionDays: 7 },
  plus: { maxItems: 30, retentionDays: 30 },
  premium: { maxItems: 300, retentionDays: 365 },
  enterprise: { maxItems: -1, retentionDays: -1 },
};
```

### Base Fields for UserSettings

```typescript
// @jazz-billing/shared/src/base-fields.ts

/**
 * Subscription fields for UserSettings schema.
 * Apps spread this into their UserSettings.
 */
export const subscriptionSettingsFields = {
  subscriptionTier: z.optional(z.enum(["free", "plus", "premium", "enterprise"])),
  subscriptionStatus: z.optional(z.enum(["active", "past_due", "cancelled", "trialing", "beta"])),
  subscriptionEndsAt: z.optional(z.number()),  // Unix timestamp
  maxItems: z.optional(z.number()),
  retentionDays: z.optional(z.number()),
  subscriptionSyncedAt: z.optional(z.number()),
} as const;
```

### Utilities

```typescript
// @jazz-billing/shared/src/limits.ts

export function getSubscriptionLimits(tier: SubscriptionTier): SubscriptionLimits;
export function canCreateItem(currentCount: number, tier: SubscriptionTier, status?: SubscriptionStatus): boolean;
export function shouldPurge(archivedAt: Date | undefined, tier: SubscriptionTier, status?: SubscriptionStatus): boolean;
```

---

## App Schema Extensions

### CheckList Extension

```typescript
// checklist/src/schemas/folder.ts

import { co, z } from "jazz-tools";
import { hierarchyFolderBaseFields, sharedReferenceBaseFields } from "@jazz-hierarchy/shared";
import { subscriptionSettingsFields } from "@jazz-billing/shared";

// Override type enum for CheckList
const checklistFolderType = z.enum(["folder", "template-folder"]);

export const CheckListFolder = co.map({
  ...hierarchyFolderBaseFields,
  type: checklistFolderType,

  // Hierarchy (self-referential)
  get children() { return co.optional(co.list(CheckListFolder)); },
  get parent() { return co.optional(CheckListFolder); },

  // Template data (template-folders only)
  items: z.optional(z.array(TemplateItemSchema)),
  sessions: z.optional(z.array(SessionDataSchema)),
  showZoneHeadings: z.optional(z.boolean()),
  defaultItems: z.optional(z.record(z.string(), z.boolean())),

  // Settings
  autocompleteDomain: z.optional(z.enum(["none", "grocery", "hardware", "outdoor", "all"])),
  autoCategorizeEnabled: z.optional(z.boolean()),

  // Owner
  get owner() { return co.account(); },
});

// Typed SharedReference for CheckList
export const CheckListSharedReference = co.map({
  ...sharedReferenceBaseFields,
  get targetRef() { return co.optional(CheckListFolder); },
});

// UserSettings with subscription support
export const UserSettings = co.map({
  ...subscriptionSettingsFields,
  // CheckList-specific settings
  defaultAutocompleteDomain: z.optional(z.enum(["none", "grocery", "hardware", "outdoor", "all"])),
  enableAutoCategorization: z.optional(z.boolean()),
});

// Root schema
export const ListsRoot = co.map({
  createdAt: z.date(),
  folders: co.list(CheckListFolder),
  sharedReferences: co.optional(co.list(CheckListSharedReference)),
  viewState: co.optional(ViewState),
  userSettings: co.optional(UserSettings),
});
```

### WicketMap Extension

```typescript
// wicketmap/src/schemas/folder.ts

import { co, z } from "jazz-tools";
import { hierarchyFolderBaseFields, sharedReferenceBaseFields } from "@jazz-hierarchy/shared";
import { subscriptionSettingsFields } from "@jazz-billing/shared";

// Override type enum for WicketMap
const wicketMapFolderType = z.enum(["folder", "map"]);

export const MapFolderNode = co.map({
  ...hierarchyFolderBaseFields,
  type: wicketMapFolderType,

  // Hierarchy
  get children() { return co.optional(co.list(MapFolderNode)); },
  get parent() { return co.optional(MapFolderNode); },

  // Map data (maps only)
  pois: co.list(POIData).optional(),
  schemas: co.record(z.string(), MapFieldSchemaData).optional(),
  templates: co.record(z.string(), POITemplateData).optional(),
  mapConfig: MapConfigSchema.optional(),

  // Permissions
  permissions: PathPermissions,

  // Publication
  publicEntryId: z.string().optional(),

  // Creator
  createdBy: z.string(),
});

// Typed SharedReference for WicketMap
export const MapSharedReference = co.map({
  ...sharedReferenceBaseFields,
  get targetRef() { return co.optional(MapFolderNode); },
});
```

---

## Migration Phases

### Phase 0: Package Publishing

**Goal**: Make packages available for consumption.

#### 0.1 Update Package Structure

Restructure jazz-hierarchy monorepo:

```
packages/
├── jazz-hierarchy/
│   ├── shared/
│   ├── client/
│   └── backend/
├── jazz-billing/
│   ├── shared/
│   ├── client/
│   └── backend/
└── jazz-registry/
    ├── shared/
    └── backend/
```

#### 0.2 Update Base Fields

Change from ISO strings to Date objects:

```typescript
// Before (current)
createdAt: z.string(),  // ISO string

// After (unified)
createdAt: z.date(),    // Date object
```

#### 0.3 Publishing Strategy

Option A: **npm publish** - Publish to npm registry
Option B: **Workspace references** - Use npm workspaces/file references for monorepo

---

### Phase 1: Schema Alignment

**Goal**: Align app schemas with unified conventions.

#### 1.1 CheckList Schema Updates

| Field | Current | Target | Action |
|-------|---------|--------|--------|
| `type` | Missing | `"folder" \| "template-folder"` | Add field |
| `sharingMode` | Missing | `"private" \| "shared" \| "public"` | Add field |
| `parent` | Optional | Required pattern | Already present |
| `archivedAt` | Present | Present | No change |

#### 1.2 WicketMap Schema Updates

| Field | Current | Target | Action |
|-------|---------|--------|--------|
| `created_at` | snake_case | `createdAt` | Rename |
| `updated_at` | snake_case | `updatedAt` | Rename |
| `created_by` | snake_case | `createdBy` | Rename |
| Timestamps | Date objects | Date objects | No change |

#### 1.3 Data Migration

```typescript
// CheckList migration
export function migrateCheckListFolder(folder: any) {
  // Add type discriminator
  if (!folder.type) {
    folder.type = folder.items ? "template-folder" : "folder";
  }

  // Add sharing mode
  if (!folder.sharingMode) {
    folder.sharingMode = "private";
  }
}

// WicketMap migration
export function migrateWicketMapFolder(folder: any) {
  // Rename timestamp fields
  if (folder.created_at && !folder.createdAt) {
    folder.createdAt = folder.created_at;
  }
  if (folder.updated_at && !folder.updatedAt) {
    folder.updatedAt = folder.updated_at;
  }
}
```

---

### Phase 2: Backend Consolidation

**Goal**: Both apps use unified backend packages.

#### 2.1 CheckList Backend Changes

```typescript
// backend/src/index.ts

import { createHierarchyServer } from "@jazz-hierarchy/backend";
import { setupBillingRoutes, setupStripeWebhook } from "@jazz-billing/backend";
import { setupRegistryRoutes } from "@jazz-registry/backend";

const server = createHierarchyServer({
  port: 3001,
  frontendUrl: process.env.FRONTEND_URL,

  // Auth config
  authSecret: process.env.AUTH_SECRET,
  providers: [
    { name: "google", clientId: "...", clientSecret: "..." },
    { name: "apple", clientId: "...", clientSecret: "..." },
  ],

  // Jazz agent
  jazzAgentAccountId: process.env.JAZZ_AGENT_ACCOUNT_ID,
  jazzAgentSecret: process.env.JAZZ_AGENT_SECRET,

  // Rate limits (app-specific)
  rateLimits: {
    shareInvitesPerHour: 30,
  },
});

// Add billing (optional)
setupBillingRoutes(server.app, server.db, {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  frontendUrl: process.env.FRONTEND_URL,
  tiers: {
    free: { maxItems: 3, retentionDays: 7, priceCents: 0 },
    plus: { maxItems: 30, retentionDays: 30, priceCents: 999 },
    premium: { maxItems: 300, retentionDays: 365, priceCents: 1999 },
  },
});

// Add registry (optional)
setupRegistryRoutes(server.app, server.db, {
  frontendUrl: process.env.FRONTEND_URL,
  categories: ["grocery", "household", "travel", "moving", "shopping"],
});

server.start();
```

#### 2.2 Database Migration

```sql
-- Rename column for compatibility (CheckList)
ALTER TABLE share_invites RENAME COLUMN folder_covalue_id TO target_covalue_id;

-- Update permission values (CheckList)
UPDATE share_invites SET permission = 'reader' WHERE permission = 'view';
UPDATE share_invites SET permission = 'writer' WHERE permission = 'edit';
```

#### 2.3 Permission Mapping (Temporary)

During transition, map UI-facing names to internal names:

```typescript
// For UI display only - internal storage uses reader/writer/admin
const PERMISSION_DISPLAY_NAMES = {
  reader: "Can view",
  writer: "Can edit",
  admin: "Full access",
};
```

---

### Phase 3: Frontend Migration

**Goal**: Apps use unified client hooks and components.

#### 3.1 Hook Adoption

```typescript
// CheckList - use unified hooks
import { useHierarchy, useSharing } from "@jazz-hierarchy/client";
import { useSubscription } from "@jazz-billing/client";

function App() {
  const { folders, addFolder, moveNode } = useHierarchy({
    root: me.root,
    owner: me,
  });

  const { createInvite, collaborators } = useSharing({
    apiBaseUrl: import.meta.env.VITE_API_URL,
  });

  const { canCreate, itemsRemaining, tier } = useSubscription({
    userSettings: me.root.userSettings,
    itemCount: countFolders(folders),
    apiBaseUrl: import.meta.env.VITE_API_URL,
  });
}
```

#### 3.2 Component Adoption (Optional)

Apps can use provided components or keep custom ones:

```typescript
// Option A: Use provided components
import { DraggableTreeView, CollaboratorList } from "@jazz-hierarchy/client";

// Option B: Use hooks with custom components
import { useHierarchy } from "@jazz-hierarchy/client";
// ... render with custom TreeView
```

---

### Phase 4: SharedReference Implementation

**Goal**: Track shared items separately from owned items.

#### 4.1 Define App-Specific SharedReference

```typescript
// Each app defines its own typed SharedReference
export const CheckListSharedReference = co.map({
  ...sharedReferenceBaseFields,
  get targetRef() { return co.optional(CheckListFolder); },
});
```

#### 4.2 Update Root Schema

```typescript
export const ListsRoot = co.map({
  createdAt: z.date(),
  folders: co.list(CheckListFolder),
  sharedReferences: co.optional(co.list(CheckListSharedReference)),
  // ...
});
```

#### 4.3 UI Section for Shared Items

```typescript
function TreeView({ root }) {
  return (
    <>
      <Section title="My Lists">
        {root.folders.filter(f => !f.archived).map(f => (
          <FolderRow folder={f} />
        ))}
      </Section>

      <Section title="Shared with Me">
        {root.sharedReferences?.map(ref => (
          <SharedFolderRow
            reference={ref}
            // Use typed targetRef for immediate access
            folder={ref.targetRef}
          />
        ))}
      </Section>
    </>
  );
}
```

---

### Phase 5: Publication System (Optional)

**Goal**: Enable public template/map sharing.

#### 5.1 Add Registry Backend

```typescript
import { setupRegistryRoutes } from "@jazz-registry/backend";

setupRegistryRoutes(app, db, {
  frontendUrl: process.env.FRONTEND_URL,
  categories: ["grocery", "household", "travel"],  // CheckList
  // or
  categories: ["hiking", "travel", "local"],       // WicketMap
});
```

#### 5.2 Publication Flow

```typescript
async function publishTemplate(folder: CheckListFolder) {
  // 1. Make publicly readable via Jazz
  folder._owner.makePublic("reader");
  folder.sharingMode = "public";

  // 2. Register in backend
  await fetch(`${API_URL}/api/registry/publish`, {
    method: "POST",
    body: JSON.stringify({
      itemId: folder.id,
      name: folder.name,
      category: "grocery",
      tags: ["weekly", "family"],
    }),
  });
}
```

---

## File Changes Summary

### Package Changes

| Package | Action |
|---------|--------|
| `@jazz-hierarchy/shared` | Update base fields to use Date objects, camelCase |
| `@jazz-billing/*` | Extract from jazz-hierarchy into separate package |
| `@jazz-registry/*` | Extract from jazz-hierarchy into separate package |

### CheckList Changes

| File | Changes |
|------|---------|
| `src/schemas/tree.ts` | Add `type`, `sharingMode`; use base fields |
| `src/schemas/index.ts` | Add `sharedReferences`; compose with billing fields |
| `backend/src/index.ts` | Use `createHierarchyServer()` + billing/registry routes |
| `backend/src/shares.ts` | Delete - replaced by package |
| `backend/src/agent.ts` | Delete - replaced by package |

### WicketMap Changes

| File | Changes |
|------|---------|
| `src/schema/definitions.ts` | Rename `created_at` → `createdAt` etc. |
| `src/schema/definitions.ts` | Use base fields from package |

---

## Testing Strategy

### Unit Tests

1. **Base field spreading** - Verify apps can extend base fields
2. **Type discrimination** - Verify exhaustive type checking works
3. **Utility functions** - Verify `canCreateItem`, `shouldPurge`, etc.

### Integration Tests

1. **Sharing flow** - Create invite → accept → verify access
2. **Billing flow** - Checkout → webhook → tier update
3. **Registry flow** - Publish → search → copy

### E2E Tests

1. **Cross-app schema compatibility** - Verify shared packages work in both apps
2. **Permission enforcement** - Reader can't edit
3. **Subscription limits** - Free tier blocked at limit

---

## Rollback Plan

Each phase is independently reversible:

1. **Phase 0**: Keep existing packages, use file references
2. **Phase 1**: Schema fields are additive; old code ignores new fields
3. **Phase 2**: Keep old backend alongside new during transition
4. **Phase 3**: Wrapper hooks allow gradual migration
5. **Phase 4**: SharedReferences are parallel; folders list still works
6. **Phase 5**: Registry is optional; removal doesn't break core features

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Timestamp format | Date objects with camelCase |
| Permission names | `reader/writer/admin` internally; UI can display differently |
| SharedReference targetRef | Apps define own typed version |
| Subscription package | Separate `@jazz-billing/*` package |
| Registry package | Separate `@jazz-registry/*` package |
| Rate limits | Configurable per-app via backend options |

## Open Questions

1. **Session tracking contribution**
   - Should CheckList's session/item state be generalized?
   - Could benefit task-tracking apps

2. **TemplateItem as CoValue**
   - Currently plain JSON in folder
   - CoValue would enable per-item permissions but adds complexity

3. **Package publishing**
   - npm registry vs monorepo workspace references?
   - Versioning strategy across packages?

4. **WicketMap snake_case migration**
   - Big-bang rename or gradual with compatibility layer?
   - Impact on existing user data?
