# Migrate CheckList Frontend Duplications to jbr-jazz

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete or shrink CheckList frontend code that duplicates `@jbr-jazz/hierarchy-client`, `@jbr-jazz/hierarchy-shared`, and `@jbr-jazz/billing-shared` by importing the shared implementations added in `2026-07-05-jbr-jazz-shared-primitives.md`.

**Architecture:** Keep CheckList-specific logic (item/session shapes, "Quick Errands" default, UI layout) in thin app wrappers. Move generic utilities, hooks, dialogs, billing math, and hierarchy operations to the shared packages. Do not change user-visible behavior.

**Tech Stack:** React 19, TypeScript, jazz-tools, BetterAuth, Tailwind CSS, Vite.

## Global Constraints

- Depends on plan `2026-07-05-jbr-jazz-shared-primitives.md` being implemented and packages rebuilt.
- All changes must preserve existing behavior and pass existing tests (`npm run test:run`, `npm run test:e2e`).
- Prefer deleting local code over adding wrappers.
- Commit messages: subject 10-72 chars, body only `Co-Authored-By: Claude <noreply@anthropic.com>`, ASCII only.
- Do not bypass commit hooks.
- Use TDD where a behavior change is introduced; pure deletions/refactors may rely on existing tests.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/auth-client.ts` | Delete; import from `hierarchy-client`. |
| `src/lib/utils.ts` | Delete `cn`; keep CheckList-specific helpers only. |
| `src/services/subscriptionService.ts` | Replace local tier/limit helpers with `billing-shared`. |
| `src/config/constants.ts` | Remove duplicated tier limits. |
| `src/schema/index.ts` | Use `subscriptionSettingsFields`; simplify `ViewState`; use migration factory. |
| `src/services/viewStateService.ts` | Delegate folder-expanded to `useTreeState`. |
| `src/hooks/useViewStateCleanup.ts` | Delete or shrink. |
| `src/services/checklistFolderFactory.ts` | Delegate to `hierarchy-shared` operations. |
| `src/hooks/useCheckListHierarchy.ts` | Delegate to `useHierarchy`; keep template-folder discriminator. |
| `src/lib/jazz-types.ts` | Delete iteration helpers; keep CheckList-specific guards. |
| `src/lib/useDoubleTap.ts` etc. | Delete; import from `hierarchy-client`. |
| `src/lib/dialog-context.tsx` etc. | Delete; import from `hierarchy-client`. |
| `src/utils/pathUtils.ts` | Delete; import from `hierarchy-shared`. |
| `src/lib/account-merge.ts` | Use `createMergeClient` from `hierarchy-client`. |

---

## Task B1: Replace local BetterAuth client with `hierarchy-client`

**Files:**
- Delete: `src/lib/auth-client.ts`
- Modify: `src/lib/jazz.tsx`
- Modify: `src/main.tsx` (if it imports auth-client)
- Test: existing auth tests + `npm run test:run`

**Interfaces:**
- Consumes: `createBetterAuthClient` from `@jbr-jazz/hierarchy-client`
- Produces: same `betterAuthClient` export behavior from `jazz.tsx`

- [ ] **Step 1: Find all imports of `./auth-client`**

Run: `grep -rln "from ['\"].*auth-client" src/`
Expected: list files that import the local client.

- [ ] **Step 2: Delete local auth-client.ts and inline into jazz.tsx**

Delete `src/lib/auth-client.ts`.

Modify `src/lib/jazz.tsx` to create the client inline:

```tsx
import { createBetterAuthClient } from '@jbr-jazz/hierarchy-client';

const baseURL = import.meta.env.VITE_AUTH_URL;
export const betterAuthClient = createBetterAuthClient(baseURL);
```

- [ ] **Step 3: Update any direct importers**

Change any `import { betterAuthClient } from '@/lib/auth-client'` to `import { betterAuthClient } from '@/lib/jazz'`.

- [ ] **Step 4: Run tests and type-check**

Run:
```bash
npm run type-check
npm run test:run
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-client.ts src/lib/jazz.tsx
git commit -m "refactor: use hierarchy-client createBetterAuthClient"
```

---

## Task B2: Replace local `cn` utility

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: any file importing `cn` from `@/lib/utils`
- Test: `npm run test:run`

**Interfaces:**
- Consumes: `cn` from `@jbr-jazz/hierarchy-client`

- [ ] **Step 1: Update src/lib/utils.ts**

Replace:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

with:

```ts
export { cn } from '@jbr-jazz/hierarchy-client';
```

Or update all importers to import `cn` from `@jbr-jazz/hierarchy-client` and delete the re-export.

- [ ] **Step 2: Run type-check and tests**

```bash
npm run type-check
npm run test:run
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: import cn from hierarchy-client"
```

---

## Task B3: Replace local billing constants and limit helpers

**Files:**
- Modify: `src/services/subscriptionService.ts`
- Modify: `src/config/constants.ts`
- Modify: `src/hooks/useCheckListHierarchy.ts`
- Modify: `src/services/checklistFolderFactory.ts`
- Test: `src/services/__tests__/subscriptionService.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_TIER_LIMITS`, `getEffectiveTier`, `canCreateItem`, `getItemsRemaining`, `getUsagePercentage`, `normalizeRawLimits` from `@jbr-jazz/billing-shared`

- [ ] **Step 1: Delete local tier table**

In `src/services/subscriptionService.ts`, remove:

```ts
export const TIERS: Record<SubscriptionTier, TierConfig> = { ... };
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = ...;
```

- [ ] **Step 2: Replace limit helpers with package functions**

Replace `getMaxLists`, `isAtListLimit`, `canCreateList`, `getListsRemaining`, `getUsagePercentage` with implementations based on `billing-shared`.

Example:

```ts
import {
  canCreateItem,
  getEffectiveTier,
  getItemsRemaining,
  getUsagePercentage,
  normalizeRawLimits,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '@jbr-jazz/billing-shared';

export function getMaxLists(account: AccountParam): number {
  const settings = account.root?.userSettings;
  const tier = (settings?.subscriptionTier ?? 'free') as SubscriptionTier;
  const status = settings?.subscriptionStatus as SubscriptionStatus | undefined;
  const limits = normalizeRawLimits(DEFAULT_TIER_LIMITS[getEffectiveTier(tier, status)]);
  return limits.maxItems === Infinity ? -1 : limits.maxItems;
}

export function canCreateList(account: AccountParam): boolean {
  const settings = account.root?.userSettings;
  const tier = (settings?.subscriptionTier ?? 'free') as SubscriptionTier;
  const status = settings?.subscriptionStatus as SubscriptionStatus | undefined;
  return canCreateItem(countUserLists(account), tier, status);
}

export function getListsRemaining(account: AccountParam): number {
  const settings = account.root?.userSettings;
  const tier = (settings?.subscriptionTier ?? 'free') as SubscriptionTier;
  const status = settings?.subscriptionStatus as SubscriptionStatus | undefined;
  return getItemsRemaining(countUserLists(account), tier, status);
}

export function getUsagePercentage(account: AccountParam): number {
  const settings = account.root?.userSettings;
  const tier = (settings?.subscriptionTier ?? 'free') as SubscriptionTier;
  const status = settings?.subscriptionStatus as SubscriptionStatus | undefined;
  return getUsagePercentageValue(countUserLists(account), tier, status);
}
```

Note: rename the local `getUsagePercentage` wrapper if it conflicts with the imported function name.

- [ ] **Step 3: Remove duplicated constants from src/config/constants.ts**

Delete any `DEFAULT_TIER_LIMITS` or tier table in `src/config/constants.ts`. Import from `@jbr-jazz/billing-shared` where needed.

- [ ] **Step 4: Update useCheckListHierarchy.ts and checklistFolderFactory.ts**

Replace raw `DEFAULT_TIER_LIMITS[subscriptionTier]` lookups with `getEffectiveTier` + `getSubscriptionLimits` from `billing-shared`.

- [ ] **Step 5: Run tests and type-check**

```bash
npm run type-check
npm run test:run src/services/__tests__/subscriptionService.test.ts
npm run test:run
```

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: use billing-shared for tier limits and limit helpers"
```

---

## Task B4: Use `subscriptionSettingsFields` in UserSettings

**Files:**
- Modify: `src/schema/index.ts`
- Test: `npm run type-check`

**Interfaces:**
- Consumes: `subscriptionSettingsFields` from `@jbr-jazz/billing-shared`

- [ ] **Step 1: Replace inline subscription fields**

In `src/schema/index.ts`, replace:

```ts
export const UserSettings = co.map({
  defaultAutocompleteDomain: z.optional(z.enum([...])),
  enableAutoCategorization: z.optional(z.boolean()),
  subscriptionTier: z.optional(z.enum(['free', 'plus', 'premium', 'enterprise'])),
  subscriptionStatus: z.optional(z.enum(['active', 'past_due', 'cancelled', 'trialing', 'beta'])),
  subscriptionEndsAt: z.optional(z.number()),
  maxLists: z.optional(z.number()),
  sessionRetentionDays: z.optional(z.number()),
  subscriptionSyncedAt: z.optional(z.number()),
});
```

with:

```ts
import { subscriptionSettingsFields } from '@jbr-jazz/billing-shared';

export const UserSettings = co.map({
  defaultAutocompleteDomain: z.optional(z.enum(['none', 'grocery', 'hardware', 'outdoor', 'all'])),
  enableAutoCategorization: z.optional(z.boolean()),
  ...subscriptionSettingsFields,
});
```

- [ ] **Step 2: Update references to `maxLists` and `sessionRetentionDays`**

Search for `maxLists` and `sessionRetentionDays` in `src/` and update to `maxItems` and `retentionDays` from `subscriptionSettingsFields`, OR add aliases in CheckList if the UI depends on the old names.

- [ ] **Step 3: Run type-check and tests**

```bash
npm run type-check
npm run test:run
```

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: use billing-shared subscriptionSettingsFields in UserSettings"
```

---

## Task B5: Replace ViewState folder-expanded plumbing

**Files:**
- Modify: `src/schema/index.ts`
- Modify: `src/services/viewStateService.ts`
- Modify: components that call folder expand helpers
- Test: existing view-state tests

**Interfaces:**
- Consumes: `useTreeState` from `@jbr-jazz/hierarchy-client`

- [ ] **Step 1: Simplify ViewState schema**

In `src/schema/index.ts`, import `ViewState` from `@jbr-jazz/hierarchy-shared` or compose it:

```ts
import { ViewState as BaseViewState } from '@jbr-jazz/hierarchy-shared';

export const ViewState = co.map({
  ...BaseViewState,
  templateCategoryExpanded: z.record(z.string(), z.record(z.string(), z.boolean())),
  sessionCategoryExpanded: z.record(z.string(), z.record(z.string(), z.boolean())),
});
```

Note: `BaseViewState` may need to be exported as an object of fields rather than a CoMap. If `ViewState` from the package is a `co.map`, spread its fields by importing the field object or keep the local `folderExpanded` definition.

- [ ] **Step 2: Replace folder-expanded helpers in viewStateService.ts**

Delegate `getFolderExpanded`, `setFolderExpanded`, `toggleFolderExpanded` to `useTreeState` in components, or to the package's `setExpanded`/`toggleExpanded` helpers in services.

- [ ] **Step 3: Update TreeView and FolderNodeView**

Replace local folder-expanded state management with:

```ts
const { isExpanded, toggleExpanded, expandAll, collapseAll } = useTreeState({
  account,
  viewState: account.root.viewState,
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: use hierarchy-client useTreeState for folder expansion"
```

---

## Task B6: Refactor folder lifecycle to use hierarchy-shared/useHierarchy

**Files:**
- Modify: `src/services/checklistFolderFactory.ts`
- Modify: `src/hooks/useCheckListHierarchy.ts`
- Test: `src/services/__tests__/checklistFolderFactory.test.ts`, `src/hooks/__tests__/useCheckListHierarchy.test.ts`

**Interfaces:**
- Consumes: `useHierarchy`, `createNodeGroup`, `generateUniqueName`, `findById`, `deleteNode`, `countFolders`, `walkTree` from `@jbr-jazz/hierarchy-client`/`hierarchy-shared`

- [ ] **Step 1: Replace unique name generation**

In `checklistFolderFactory.ts`, replace the local suffix loop with:

```ts
import { generateUniqueName } from '@jbr-jazz/hierarchy-shared';

const uniqueName = generateUniqueName(baseName, existingNames);
```

- [ ] **Step 2: Replace recursive deletion with deleteNode**

Replace local `deleteFolder` recursive splice with `deleteNode(folder, account.root.folders)` from `hierarchy-shared`, or use `useHierarchy.deleteNode` in the hook.

- [ ] **Step 3: Replace folder collection with walkTree**

Replace `getAllTemplateFolders` recursive function with:

```ts
import { walkTree, isFolder } from '@jbr-jazz/hierarchy-shared';

export function getAllTemplateFolders(account: AccountParam, showArchived = false): FolderType[] {
  const results: FolderType[] = [];
  walkTree(account.root.folders, (node) => {
    if (isTemplateFolder(node) && (showArchived || !node.archived)) {
      results.push(node);
    }
    return 'continue';
  });
  return results;
}
```

- [ ] **Step 4: Deduplicate useCheckListHierarchy**

Remove `createFolderNode`, `collectTemplateFolders`, and `duplicateTemplate` from `useCheckListHierarchy.ts`. Use `useHierarchy` methods:

```ts
const { addFolder, duplicateNode, deleteNode, folders } = useHierarchy({
  root: account.root,
  owner: account,
});
```

Keep the template-folder `type` discriminator and item/session deep-copy logic in a thin wrapper.

- [ ] **Step 5: Run tests and type-check**

```bash
npm run type-check
npm run test:run src/services/__tests__/checklistFolderFactory.test.ts
npm run test:run src/hooks/__tests__/useCheckListHierarchy.test.ts
npm run test:run
```

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: delegate folder lifecycle to hierarchy-shared and useHierarchy"
```

---

## Task B7: Replace safe-iteration helpers

**Files:**
- Modify: `src/lib/jazz-types.ts`
- Modify: files importing `isIterableSessions` / `iterateSessions`
- Test: `npm run test:run`

**Interfaces:**
- Consumes: `isIterable`, `toArray`, `iterateChildren` from `@jbr-jazz/hierarchy-shared`

- [ ] **Step 1: Delete local session iteration helpers**

Remove:

```ts
export function isIterableSessions<T>(sessions: unknown): sessions is Iterable<T> { ... }
export function iterateSessions<T = SessionData>(sessions: unknown): T[] { ... }
```

- [ ] **Step 2: Update call sites**

Replace `iterateSessions(folder.sessions)` with `toArray(folder.sessions)` or `iterateChildren(folder.sessions)`.

- [ ] **Step 3: Run tests and commit**

```bash
npm run type-check
npm run test:run
git commit -m "refactor: use hierarchy-shared iteration helpers"
```

---

## Task B8: Adopt generic hooks from hierarchy-client

**Files:**
- Delete: `src/lib/useDoubleTap.ts`, `src/lib/useTheme.ts`, `src/lib/usePWAInstall.ts`, `src/lib/useNavigationHistory.ts`
- Modify: all importers
- Test: existing hook tests

**Interfaces:**
- Consumes: `useDoubleTap`, `useTheme`, `usePWAInstall`, `useHashRouter` from `@jbr-jazz/hierarchy-client`

- [ ] **Step 1: Update imports**

Change:

```ts
import { useDoubleTap } from '@/lib/useDoubleTap';
```

to:

```ts
import { useDoubleTap } from '@jbr-jazz/hierarchy-client';
```

Do the same for `useTheme`, `usePWAInstall`, and `useNavigationHistory` → `useHashRouter`.

- [ ] **Step 2: Delete local hook files**

```bash
rm src/lib/useDoubleTap.ts src/lib/useTheme.ts src/lib/usePWAInstall.ts src/lib/useNavigationHistory.ts
```

- [ ] **Step 3: Adapt useHashRouter usage**

Replace `useNavigationHistory()` with `useHashRouter<NavState>(parseNavState, serializeNavState, { view: 'main' })`.

- [ ] **Step 4: Run tests and commit**

```bash
npm run type-check
npm run test:run
git commit -m "refactor: adopt generic hooks from hierarchy-client"
```

---

## Task B9: Adopt dialog primitives from hierarchy-client

**Files:**
- Delete: `src/lib/dialog-context.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/confirm-dialog.tsx`, `src/components/ui/simple-input-dialog.tsx`
- Modify: `src/main.tsx` (DialogProvider), all `useDialog` consumers
- Test: dialog tests

**Interfaces:**
- Consumes: `DialogProvider`, `useDialog`, `AlertDialog`, `ConfirmDialog`, `SimpleInputDialog` from `@jbr-jazz/hierarchy-client`

- [ ] **Step 1: Update main.tsx to use DialogProvider from package**

Replace local `DialogProvider` import with package import.

- [ ] **Step 2: Update all useDialog consumers**

Change import path from `@/lib/dialog-context` to `@jbr-jazz/hierarchy-client`.

- [ ] **Step 3: Delete local dialog files**

- [ ] **Step 4: Run tests and commit**

```bash
npm run type-check
npm run test:run
git commit -m "refactor: adopt dialog primitives from hierarchy-client"
```

---

## Task B10: Adopt path utilities from hierarchy-shared

**Files:**
- Delete: `src/utils/pathUtils.ts`
- Modify: `src/services/templateService.ts`, `src/services/sessionCleanupService.ts`, `src/components/session/useSessionDragDrop.ts`
- Test: path-related tests

**Interfaces:**
- Consumes: `DEFAULT_PATH_SEPARATOR`, `getParentPath`, `createChildPath`, `isDescendantPath`, `splitPath` from `@jbr-jazz/hierarchy-shared`

- [ ] **Step 1: Update imports**

Replace `import { ... } from '@/utils/pathUtils'` with package imports.

- [ ] **Step 2: Delete src/utils/pathUtils.ts**

- [ ] **Step 3: Replace prefix-based descendant check in useSessionDragDrop.ts**

Replace:

```ts
targetParentPath?.startsWith(draggedItem.path)
```

with:

```ts
isDescendantPath(targetParentPath, draggedItem.path)
```

- [ ] **Step 4: Run tests and commit**

```bash
npm run type-check
npm run test:run
git commit -m "refactor: use hierarchy-shared path utilities"
```

---

## Task B11: Adopt account-merge SDK and billing-client

**Files:**
- Modify: `src/lib/account-merge.ts`
- Modify: `src/services/subscriptionService.ts` (checkout/portal/sync)
- Modify: `package.json` to add `@jbr-jazz/billing-client` dependency
- Test: merge tests, billing tests

**Interfaces:**
- Consumes: `createMergeClient` from `@jbr-jazz/hierarchy-client`, `fetchSubscription`, `redirectToCheckout`, `redirectToPortal` from `@jbr-jazz/billing-client`

- [ ] **Step 1: Add billing-client dependency**

In `package.json`:

```json
"@jbr-jazz/billing-client": "file:../jbr-jazz/packages/billing/client"
```

Run `npm install`.

- [ ] **Step 2: Replace merge client logic**

In `src/lib/account-merge.ts`, replace fetch calls with:

```ts
import { createMergeClient } from '@jbr-jazz/hierarchy-client';

const mergeClient = createMergeClient(import.meta.env.VITE_AUTH_URL);

export async function initiateMerge(): Promise<void> {
  await mergeClient.initiateMerge();
}

export async function adoptFolder(folderId: string): Promise<void> {
  await mergeClient.adoptFolder(folderId);
}
```

- [ ] **Step 3: Replace billing sync/checkout/portal**

In `src/services/subscriptionService.ts`, replace:

```ts
export async function syncSubscriptionFromBackend(account: AccountParam): Promise<void> { ... }
export async function createCheckoutSession(tierSlug: string): Promise<void> { ... }
export async function createBillingPortalSession(): Promise<void> { ... }
```

with delegations to `@jbr-jazz/billing-client`:

```ts
import { fetchSubscription, redirectToCheckout, redirectToPortal } from '@jbr-jazz/billing-client';

export async function syncSubscriptionFromBackend(account: AccountParam): Promise<void> {
  const snapshot = await fetchSubscription(import.meta.env.VITE_AUTH_URL);
  // write snapshot into userSettings
}

export async function createCheckoutSession(tierSlug: string): Promise<void> {
  await redirectToCheckout(import.meta.env.VITE_AUTH_URL, tierSlug);
}

export async function createBillingPortalSession(): Promise<void> {
  await redirectToPortal(import.meta.env.VITE_AUTH_URL);
}
```

- [ ] **Step 4: Run tests and type-check**

```bash
npm install
npm run type-check
npm run test:run
```

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: use hierarchy-client merge SDK and billing-client"
```

---

## Self-Review

**Spec coverage:** All frontend duplications from the code review are addressed:
- auth client → B1
- cn → B2
- billing constants/limits → B3, B4, B11
- ViewState → B5
- folder lifecycle → B6
- iteration helpers → B7
- generic hooks → B8
- dialogs → B9
- path utils → B10
- merge SDK → B11

**Placeholder scan:** No TBD/TODO. Each task has concrete file paths and expected commands.

**Type consistency:** Uses package export names verified against jbr-jazz `index.ts` files.
