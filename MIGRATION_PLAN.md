# Generic List Terminology Migration Plan

**Goal:** Transform bubblelist from shopping-specific to generic list application

**Approach:** Systematic renaming from shopping/grocery terminology to generic list terms

---

## Terminology Mapping

### Core Entities

| Current | New | Rationale |
|---------|-----|-----------|
| `GroceriesAccount` | `Account` | Generic account name |
| `ShoppingSession` | `ListSession` | Generic session name |
| `shopping session` | `list session` | Lowercase variant |

### Item States

| Current | New | Usage Context |
|---------|-----|---------------|
| `inCart` | `selected` | First checkbox state |
| `purchased` | `checked` | Second checkbox state |
| `addedToCartAt` | `selectedAt` | Timestamp field |
| `purchasedAt` | `checkedAt` | Timestamp field |
| `inCartCount` | `selectedCount` | Counter field |
| `completedCount` | `checkedCount` | Counter field |

### Functions

| Current | New |
|---------|-----|
| `toggleItemInCart()` | `toggleItemSelected()` |
| `toggleItemPurchased()` | `toggleItemChecked()` |
| `createSession()` | (keep - generic enough) |

### UI Text

| Current | New |
|---------|-----|
| "In Cart" | "Selected" |
| "Purchased" | "Checked" |
| "Completed" | "Checked" |
| "Start Shopping" | "Start Session" |
| "Shopping List" | "List" |
| "Cart" | "Selected Items" |
| "Inventory" | "Unchecked Items" |

### Zone Names

| Current | New |
|---------|-----|
| "Inventory zone" | "Unchecked zone" |
| "Cart zone" | "Selected zone" |
| "Completed zone" | "Checked zone" |

### View Modes

| Current | New |
|---------|-----|
| `zone-in-hierarchy` | (keep - still accurate) |
| `hierarchy-in-zones` | (keep - still accurate) |
| `flat` | (keep - still accurate) |

---

## Migration Phases

### Phase 1: Schema Changes (BREAKING)

**Branch:** `refactor/generic-list-terminology`

**Duration:** 4-6 hours

#### 1.1 Update `src/schemas/tree.ts`

**Changes:**
```typescript
// Line 3: Update comment
- // Forward reference to GroceriesAccount (defined in index.ts)
+ // Forward reference to Account (defined in index.ts)

// Line 6: Rename variable
- let GroceriesAccount: any;
+ let Account: any;

// Line 10: Rename function
- export function setGroceriesAccountReference(account: any) {
-   GroceriesAccount = account;
+ export function setAccountReference(account: any) {
+   Account = account;
}

// Line 14-19: Update comments
- * Shopping state is tracked separately in ShoppingSession.
+ * Item state is tracked separately in ListSession.

// Line 41-42: Update getter
  get addedBy() {
-   return GroceriesAccount;
+   return Account;
  },

// Line 51-53: Update ItemState comment
- * ItemState - Shopping session state for a template item
- * Tracks the shopping state (in cart, purchased) for a specific item in a session.
+ * ItemState - List session state for a template item
+ * Tracks the item state (selected, checked) for a specific item in a session.

// Line 58-59: Rename fields
- inCart: z.boolean(), // Left checkbox - item added to cart
- purchased: z.boolean(), // Right checkbox - item marked as purchased
+ selected: z.boolean(), // Left checkbox - item selected
+ checked: z.boolean(), // Right checkbox - item marked as checked

// Line 63-64: Rename timestamp fields
- addedToCartAt: z.optional(z.date()),
- purchasedAt: z.optional(z.date()),
+ selectedAt: z.optional(z.date()),
+ checkedAt: z.optional(z.date()),

// Line 67-69: Update getter
  get checkedBy() {
-   return co.optional(GroceriesAccount);
+   return co.optional(Account);
  },

// Line 73-76: Update ShoppingSession → ListSession
- /**
-  * ShoppingSession - Tracks state for a shopping trip
-  * Sessions reference template items and track their state.
-  * Name format: "[2025-01-15]" or "[2025-01-15 14:30]" if multiple sessions per day.
-  */
- export const ShoppingSession = co.map({
+ /**
+  * ListSession - Tracks state for a list session
+  * Sessions reference template items and track their state.
+  * Name format: "[2025-01-15]" or "[2025-01-15 14:30]" if multiple sessions per day.
+  */
+ export const ListSession = co.map({

// Line 99-101: Rename count fields
- inCartCount: z.number(),
- completedCount: z.number(),
+ selectedCount: z.number(),
+ checkedCount: z.number(),

// Line 104-106: Update getter
  get owner() {
-   return GroceriesAccount;
+   return Account;
  },

// Line 113-126: Update TemplateFolderNode comments
- // Shopping sessions
- sessions: co.list(ShoppingSession),
+ // List sessions
+ sessions: co.list(ListSession),

// Line 135-137, 175-177: Update FolderNode getters
  get owner() {
-   return GroceriesAccount;
+   return Account;
  },
```

#### 1.2 Update `src/schemas/index.ts`

**Changes:**
```typescript
// Line 3-9: Update imports
import {
  FolderNode,
  ItemState,
- ShoppingSession,
- setGroceriesAccountReference,
+ ListSession,
+ setAccountReference,
  TemplateFolderNode,
  TemplateItem,
} from './tree';

// Line 19-38: Rename GroceriesAccount → Account
- export const GroceriesAccount = co
+ export const Account = co
    .account({
      root: ListsRoot,
      profile: co.profile(),
    })
    .withMigration(async (account) => {
      // Initialize root for new accounts
      if (!account.$jazz.has('root')) {
        const nodes = co.list(FolderNode).create([], { owner: account });
        account.$jazz.set('root', ListsRoot.create({ nodes }, { owner: account }));
        return;
      }

      // Fix existing accounts with broken root.nodes
      const { root } = await account.$jazz.ensureLoaded({ resolve: { root: {} } });
      if (root && !root.$jazz.has('nodes')) {
        const nodes = co.list(FolderNode).create([], { owner: account });
        root.$jazz.set('nodes', nodes);
      }
    });

// Line 40-41: Update reference wiring
- // Wire up the forward reference from tree.ts to GroceriesAccount
- setGroceriesAccountReference(GroceriesAccount);
+ // Wire up the forward reference from tree.ts to Account
+ setAccountReference(Account);

// Line 48: Update export
- export { FolderNode, TemplateFolderNode, TemplateItem, ShoppingSession, ItemState };
+ export { FolderNode, TemplateFolderNode, TemplateItem, ListSession, ItemState };
```

#### 1.3 Add Data Migration

Add to `src/schemas/tree.ts` after ListSession definition:

```typescript
export const ListSession = co.map({
  // ... fields
}).withMigration(async (session) => {
  // Migrate old shopping terminology to generic list terminology

  // Migrate item states
  if (session.$jazz.has('itemStates')) {
    const itemStates = session.itemStates;
    if (itemStates) {
      for (const [itemId, state] of Object.entries(itemStates)) {
        if (!state) continue;

        // Migrate inCart → selected
        if (state.$jazz.has('inCart')) {
          const inCart = state.inCart;
          state.$jazz.set('selected', inCart);
          // Don't delete old field for backward compatibility
        }

        // Migrate purchased → checked
        if (state.$jazz.has('purchased')) {
          const purchased = state.purchased;
          state.$jazz.set('checked', purchased);
        }

        // Migrate addedToCartAt → selectedAt
        if (state.$jazz.has('addedToCartAt')) {
          const addedToCartAt = state.addedToCartAt;
          state.$jazz.set('selectedAt', addedToCartAt);
        }

        // Migrate purchasedAt → checkedAt
        if (state.$jazz.has('purchasedAt')) {
          const purchasedAt = state.purchasedAt;
          state.$jazz.set('checkedAt', purchasedAt);
        }
      }
    }
  }

  // Migrate count fields
  if (session.$jazz.has('inCartCount')) {
    session.$jazz.set('selectedCount', session.inCartCount);
  }

  if (session.$jazz.has('completedCount')) {
    session.$jazz.set('checkedCount', session.completedCount);
  }
});
```

**Test:**
```bash
npm run type-check
# Expected: Many type errors from services/components
# This is expected - we'll fix in next phases
```

---

### Phase 2: Service Layer Updates

**Duration:** 4-6 hours

#### 2.1 Update `src/services/sessionService.ts`

**File Rename:** (keep as `sessionService.ts` - name is generic enough)

**Changes:**
```typescript
// Line 1-11: Update imports and types
import type { InstanceOfSchema } from 'jazz-tools';
- import type { GroceriesAccount } from '../schemas';
- import { ItemState, ShoppingSession } from '../schemas/tree';
+ import type { Account } from '../schemas';
+ import { ItemState, ListSession } from '../schemas/tree';
import { getFolder } from './folderService';

// Line 14: Update comment
- * Create a new shopping session for a template folder
+ * Create a new list session for a template folder

// Line 16-19: Update function signature
export function createSession(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionName?: string,
): string {

// Line 44: Update comment
- // Create new shopping session
+ // Create new list session

// Line 45: Update schema usage
- const newSession = ShoppingSession.create(
+ const newSession = ListSession.create(

// Line 53: Update count field
-     inCartCount: 0,
-     completedCount: 0,
+     selectedCount: 0,
+     checkedCount: 0,

// Line 74-78: Update function signature
export function getSession(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
- ): InstanceOfSchema<typeof ShoppingSession> | null {
+ ): InstanceOfSchema<typeof ListSession> | null {

// Line 88-91: Update function signature
export function getSessions(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,
  folderId: string,
- ): Array<InstanceOfSchema<typeof ShoppingSession>> {
+ ): Array<InstanceOfSchema<typeof ListSession>> {

  // ... also update return type cast on line 95-97
  return folder.sessions.filter((s) => s != null) as Array<
-   InstanceOfSchema<typeof ShoppingSession>
+   InstanceOfSchema<typeof ListSession>
  >;

// Line 100-108: Rename function + update signature
- /**
-  * Toggle item's "in cart" state
-  */
- export function toggleItemInCart(
-   account: InstanceOfSchema<typeof GroceriesAccount>,
+ /**
+  * Toggle item's "selected" state
+  */
+ export function toggleItemSelected(
+   account: InstanceOfSchema<typeof Account>,

// Line 127-128: Update field names
-       inCart: true,
-       purchased: false,
-       addedToCartAt: new Date(),
+       selected: true,
+       checked: false,
+       selectedAt: new Date(),

// Line 140-149: Update field names
    const newInCart = !currentState.inCart;
-   currentState.$jazz.set('inCart', newInCart);
+   currentState.$jazz.set('selected', newInCart);
    if (newInCart) {
-     currentState.$jazz.set('addedToCartAt', new Date());
+     currentState.$jazz.set('selectedAt', new Date());
    } else {
-     // If removing from cart, also clear purchased state
-     currentState.$jazz.set('purchased', false);
-     currentState.$jazz.set('purchasedAt', undefined);
+     // If deselecting, also clear checked state
+     currentState.$jazz.set('checked', false);
+     currentState.$jazz.set('checkedAt', undefined);
    }

// Line 156-164: Rename function + update signature
- /**
-  * Toggle item's "purchased" state
-  */
- export function toggleItemPurchased(
-   account: InstanceOfSchema<typeof GroceriesAccount>,
+ /**
+  * Toggle item's "checked" state
+  */
+ export function toggleItemChecked(
+   account: InstanceOfSchema<typeof Account>,

// Line 171-178: Update field names
- const newPurchasedState = !currentState.purchased;
- currentState.$jazz.set('purchased', newPurchasedState);
+ const newCheckedState = !currentState.checked;
+ currentState.$jazz.set('checked', newCheckedState);
  if (newPurchasedState) {
-   currentState.$jazz.set('purchasedAt', new Date());
+   currentState.$jazz.set('checkedAt', new Date());
    currentState.$jazz.set('checkedBy', account);
  } else {
-   currentState.$jazz.set('purchasedAt', undefined);
+   currentState.$jazz.set('checkedAt', undefined);
  }

// Line 184-190: Update function signature
export function updateSessionCounts(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,

// Line 198-213: Update field names and logic
  let inCartCount = 0;
- let completedCount = 0;
+ let checkedCount = 0;
  let remainingCount = 0;

  activeItems.forEach((item) => {
    const state = session.itemStates?.[item.$jazz.id];
-   if (!state || (!state.inCart && !state.purchased)) {
+   if (!state || (!state.selected && !state.checked)) {
      remainingCount++;
-   } else if (state.purchased) {
-     completedCount++;
-   } else if (state.inCart) {
+   } else if (state.checked) {
+     checkedCount++;
+   } else if (state.selected) {
      inCartCount++;
    }
  });

- session.$jazz.set('inCartCount', inCartCount);
- session.$jazz.set('completedCount', completedCount);
+ session.$jazz.set('selectedCount', inCartCount);
+ session.$jazz.set('checkedCount', checkedCount);
  session.$jazz.set('remainingCount', remainingCount);

// Line 221-233: Update function signature (2 occurrences)
export function completeSession(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,

export function abandonSession(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,

// Line 253-258: Update function signature
export function updateViewMode(
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,
```

#### 2.2 Update `src/services/folderService.ts`

**Changes:**
```typescript
// Line 8-9: Update import
- import type { GroceriesAccount } from '../schemas';
+ import type { Account } from '../schemas';

// All function signatures (11 occurrences):
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,
```

#### 2.3 Update `src/services/itemService.ts`

**Changes:**
```typescript
// Line 8-9: Update import
- import type { GroceriesAccount } from '../schemas';
+ import type { Account } from '../schemas';

// All function signatures (14 occurrences):
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,
```

#### 2.4 Update Import/Export Services

**Files:**
- `src/services/import/importService.ts`
- `src/services/import/jsonImporter.ts`
- `src/services/import/csvImporter.ts`
- `src/services/import/txtImporter.ts`
- `src/services/import/validators.ts`
- `src/services/export/exportService.ts`
- `src/services/export/jsonExporter.ts`
- `src/services/export/csvExporter.ts`
- `src/services/export/txtExporter.ts`

**Pattern for all files:**
```typescript
// Update imports
- import type { GroceriesAccount } from '../schemas';
+ import type { Account } from '../schemas';

- import { ShoppingSession } from '../schemas/tree';
+ import { ListSession } from '../schemas/tree';

// Update all function signatures
- account: InstanceOfSchema<typeof GroceriesAccount>,
+ account: InstanceOfSchema<typeof Account>,

// Update field access in export logic
- session.inCart → session.selected
- session.purchased → session.checked
- session.inCartCount → session.selectedCount
- session.completedCount → session.checkedCount
```

**Test:**
```bash
npm run type-check
# Should have fewer errors - mainly in components now
```

---

### Phase 3: Component Updates

**Duration:** 6-8 hours

#### 3.1 Rename Component Files

```bash
# Rename session components
mv src/components/session/ShoppingSessionView.tsx \
   src/components/session/ListSessionView.tsx

mv src/components/session/ShoppingSessionItemRow.tsx \
   src/components/session/ListSessionItemRow.tsx
```

#### 3.2 Update `src/components/session/ListSessionView.tsx`

**Changes:**
```typescript
// Line 1: Update component name in comment
- * ShoppingSessionView - Main shopping session interface
+ * ListSessionView - Main list session interface

// Line 15-20: Update imports
- import { GroceriesAccount, ShoppingSession } from '../../schemas';
+ import { Account, ListSession } from '../../schemas';
- import { toggleItemInCart, toggleItemPurchased, updateSessionCounts } from '../../services/sessionService';
+ import { toggleItemSelected, toggleItemChecked, updateSessionCounts } from '../../services/sessionService';

// Line 30-35: Update component name and props
- export function ShoppingSessionView({
+ export function ListSessionView({
  folderId,
  sessionId,
  onBack,
}: {
  folderId: string;
  sessionId: string;
  onBack: () => void;
}) {

// Line 40: Update hook type
- const { me } = useAccount(GroceriesAccount);
+ const { me } = useAccount(Account);

// Line 60: Update schema reference
- useCoState(ShoppingSession, sessionId);
+ useCoState(ListSession, sessionId);

// Line 80-90: Update UI text
- <h2>Shopping Session</h2>
+ <h2>List Session</h2>

- <div>In Cart: {session.inCartCount}</div>
- <div>Completed: {session.completedCount}</div>
+ <div>Selected: {session.selectedCount}</div>
+ <div>Checked: {session.checkedCount}</div>
  <div>Remaining: {session.remainingCount}</div>

// Line 120-130: Update function calls
- const handleToggleInCart = (itemId: string) => {
-   toggleItemInCart(me, folderId, sessionId, itemId);
+ const handleToggleSelected = (itemId: string) => {
+   toggleItemSelected(me, folderId, sessionId, itemId);
    updateSessionCounts(me, folderId, sessionId);
  };

- const handleTogglePurchased = (itemId: string) => {
-   toggleItemPurchased(me, folderId, sessionId, itemId);
+ const handleToggleChecked = (itemId: string) => {
+   toggleItemChecked(me, folderId, sessionId, itemId);
    updateSessionCounts(me, folderId, sessionId);
  };

// Line 150-160: Update prop passing
  <ShoppingSessionItemRow
    item={item}
    state={state}
-   onToggleInCart={handleToggleInCart}
-   onTogglePurchased={handleTogglePurchased}
+   onToggleSelected={handleToggleSelected}
+   onToggleChecked={handleToggleChecked}
  />

// Line 200: Update aria-labels
- aria-label="In Cart"
+ aria-label="Selected"

- aria-label="Purchased"
+ aria-label="Checked"
```

#### 3.3 Update `src/components/session/ListSessionItemRow.tsx`

**Changes:**
```typescript
// Component name
- export function ShoppingSessionItemRow({
+ export function ListSessionItemRow({

// Props interface
  interface Props {
    item: TemplateItem;
    state: ItemState;
-   onToggleInCart: (itemId: string) => void;
-   onTogglePurchased: (itemId: string) => void;
+   onToggleSelected: (itemId: string) => void;
+   onToggleChecked: (itemId: string) => void;
  }

// Field access
- const isInCart = state?.inCart || false;
- const isPurchased = state?.purchased || false;
+ const isSelected = state?.selected || false;
+ const isChecked = state?.checked || false;

// Event handlers
- onClick={() => onToggleInCart(item.$jazz.id)}
+ onClick={() => onToggleSelected(item.$jazz.id)}

- onClick={() => onTogglePurchased(item.$jazz.id)}
+ onClick={() => onToggleChecked(item.$jazz.id)}

// UI text and aria labels
- aria-label="Add to cart"
+ aria-label="Select item"

- aria-label="Mark as purchased"
+ aria-label="Mark as checked"

// Status classes
- const status = isPurchased ? 'completed' : isInCart ? 'in-cart' : 'remaining';
+ const status = isChecked ? 'checked' : isSelected ? 'selected' : 'unchecked';
```

#### 3.4 Update `src/components/session/index.ts`

```typescript
- export { ShoppingSessionView } from './ShoppingSessionView';
- export { ShoppingSessionItemRow } from './ShoppingSessionItemRow';
+ export { ListSessionView } from './ListSessionView';
+ export { ListSessionItemRow } from './ListSessionItemRow';
export { StartSessionDialog } from './StartSessionDialog';
export { SessionZone } from './SessionZone';
```

#### 3.5 Update `src/components/editor/TemplateEditor.tsx`

**Changes:**
```typescript
// Line 10-15: Update imports
- import { GroceriesAccount } from '../../schemas';
- import { ShoppingSessionView } from '../session';
+ import { Account } from '../../schemas';
+ import { ListSessionView } from '../session';

// Line 30: Update hook
- const { me } = useAccount(GroceriesAccount);
+ const { me } = useAccount(Account);

// Line 150: Update component usage
- <ShoppingSessionView
+ <ListSessionView
    folderId={activeSessionFolderId}
    sessionId={activeSessionId}
    onBack={handleBackFromSession}
  />
```

#### 3.6 Update `src/components/Dashboard.tsx`

**Changes:**
```typescript
// Line 8: Update import
- import { GroceriesAccount } from '../schemas';
+ import { Account } from '../schemas';

// Line 20: Update hook
- const { me, logIn } = useAccount(GroceriesAccount);
+ const { me, logIn } = useAccount(Account);

// UI text (if any shopping references)
- "Start Shopping" → "Start Session"
```

#### 3.7 Update `src/components/tree/` Components

**Files:**
- `TreeView.tsx`
- `TreeNode.tsx`
- `SessionRowView.tsx`

**Changes:**
```typescript
// Update imports in all files
- import { GroceriesAccount } from '../../schemas';
+ import { Account } from '../../schemas';

// Update hook calls
- const { me } = useAccount(GroceriesAccount);
+ const { me } = useAccount(Account);

// Update UI text in SessionRowView
- "Shopping session" → "List session"
- Status indicators (if showing "shopping" text)
```

#### 3.8 Update Import/Export Components

**Files:**
- `src/components/import/ImportDialog.tsx`
- `src/components/import/TemplateItemsImportDialog.tsx`
- `src/components/import/SessionImportDialog.tsx`
- `src/components/export/ExportDialog.tsx`
- `src/components/export/TemplateItemsExportDialog.tsx`
- `src/components/export/SessionExportDialog.tsx`

**Changes:**
```typescript
// Update imports
- import { GroceriesAccount, ShoppingSession } from '../../schemas';
+ import { Account, ListSession } from '../../schemas';

// Update hooks
- const { me } = useAccount(GroceriesAccount);
+ const { me } = useAccount(Account);

// Update UI text
- "Import shopping session" → "Import list session"
- "Export shopping list" → "Export list"
```

#### 3.9 Update `src/lib/jazz.tsx`

**Changes:**
```typescript
// Line 5: Update import
- import { GroceriesAccount } from '../schemas';
+ import { Account } from '../schemas';

// Line 20: Update schema reference
  return (
    <JazzReactProvider
-     schema={GroceriesAccount}
+     schema={Account}
      auth={betterAuthClient.auth}
      peer={peerUrl}
    >
      {children}
    </JazzReactProvider>
  );
```

**Test:**
```bash
npm run type-check
# Should have no TypeScript errors now
```

---

### Phase 4: UI Text & Accessibility

**Duration:** 2-3 hours

#### 4.1 Search and Replace UI Strings

**Commands:**
```bash
# Find all "In Cart" references
grep -r "In Cart" src/components/

# Find all "Purchased" references
grep -r "Purchased" src/components/

# Find all "Shopping" references
grep -r "Shopping" src/components/
```

#### 4.2 Update Zone Labels

**File:** `src/components/session/SessionZone.tsx`

```typescript
// Zone header text
const zoneLabels = {
- inventory: "Inventory",
- cart: "In Cart",
- completed: "Completed",
+ unchecked: "Unchecked",
+ selected: "Selected",
+ checked: "Checked",
};
```

#### 4.3 Update Aria Labels

**All component files with checkboxes:**

```typescript
// Before
<input
  type="checkbox"
  aria-label="In Cart"
  checked={inCart}
/>

// After
<input
  type="checkbox"
  aria-label="Select item"
  checked={selected}
/>
```

#### 4.4 Update Button Labels

**Files:** All dialog and action components

```typescript
// StartSessionDialog
- "Start Shopping" → "Start Session"
- "Begin shopping session" → "Begin session"

// TemplateEditor
- "Use Template for Shopping" → "Use Template"
- "Create Shopping List" → "Create List"

// ExportDialog
- "Export Shopping Data" → "Export List Data"
```

#### 4.5 Update Toast/Error Messages

**Search for:**
```bash
grep -r "shopping\|cart\|purchased" src/components/ | grep -i "error\|toast\|message"
```

**Replace patterns:**
- "shopping session" → "list session"
- "in cart" → "selected"
- "purchased" → "checked"

**Test:**
```bash
npm run dev
# Manual testing:
# 1. Create a list session
# 2. Select/check items
# 3. Verify all UI text is generic
# 4. Check aria labels with screen reader
```

---

### Phase 5: Documentation & Tests

**Duration:** 3-4 hours

#### 5.1 Update Documentation Files

**`README.md`:**
```markdown
# Before
A collaborative grocery list application

## Features
- Session-based shopping tracking
- Dual-checkbox system (in cart + purchased)

# After
A collaborative list management application

## Features
- Session-based list tracking
- Dual-checkbox system (selected + checked)
```

**`ARCHITECTURE.md`:**
- Replace all instances of "shopping session" → "list session"
- Replace "GroceriesAccount" → "Account"
- Replace "ShoppingSession" → "ListSession"
- Update diagrams and data flow examples

**`CLAUDE.md`:**
```markdown
# Project Overview

- A collaborative grocery list application
+ A collaborative list management application

## Key Features

- - Session-based shopping tracking
+ - Session-based list tracking

## Jazz.tools Integration

- **ShoppingSession** - Shopping trip state tracker
+ **ListSession** - List session state tracker

## Common Development Patterns

### Working with Jazz CoValues

- // Update shopping data
- session.inCart = true;
+ // Update list data
+ session.selected = true;
```

**`QUICKSTART.md`:**
- Update getting started examples
- Replace shopping terminology
- Update screenshot descriptions (if any)

**`package.json`:**
```json
{
- "description": "A collaborative grocery list application",
+ "description": "A collaborative list management application",
}
```

#### 5.2 Update Test Files

**Unit Tests:**

**File:** `src/services/sessionService.test.ts`

```typescript
// Update imports
- import { GroceriesAccount, ShoppingSession } from '../schemas';
+ import { Account, ListSession } from '../schemas';

// Update test descriptions
- describe('createSession', () => {
-   it('should create a new shopping session', () => {
+ describe('createSession', () => {
+   it('should create a new list session', () => {

- describe('toggleItemInCart', () => {
-   it('should toggle item in cart state', () => {
+ describe('toggleItemSelected', () => {
+   it('should toggle item selected state', () => {

- describe('toggleItemPurchased', () => {
-   it('should toggle item purchased state', () => {
+ describe('toggleItemChecked', () => {
+   it('should toggle item checked state', () => {

// Update assertions
- expect(session.inCartCount).toBe(1);
+ expect(session.selectedCount).toBe(1);

- expect(state.inCart).toBe(true);
+ expect(state.selected).toBe(true);

- expect(state.purchased).toBe(true);
+ expect(state.checked).toBe(true);
```

**Similar updates for:**
- `src/services/folderService.test.ts`
- `src/services/itemService.test.ts`
- `src/services/export/exportService.test.ts`
- `src/services/import/importService.test.ts`

**E2E Tests:**

**File:** `e2e/smoke.spec.ts`

```typescript
test('should create and use a shopping session', async ({ page }) => {
  // ...
- await page.click('button:has-text("Start Shopping")');
+ await page.click('button:has-text("Start Session")');

- await expect(page.locator('h2:has-text("Shopping Session")')).toBeVisible();
+ await expect(page.locator('h2:has-text("List Session")')).toBeVisible();

  // Check item
- await page.click('[aria-label="In Cart"]');
- await expect(page.locator('.in-cart-count')).toHaveText('1');
+ await page.click('[aria-label="Select item"]');
+ await expect(page.locator('.selected-count')).toHaveText('1');

- await page.click('[aria-label="Purchased"]');
- await expect(page.locator('.completed-count')).toHaveText('1');
+ await page.click('[aria-label="Checked"]');
+ await expect(page.locator('.checked-count')).toHaveText('1');
});
```

**File:** `e2e/export-import.spec.ts`

```typescript
- test('export and import grocery data', async ({ page }) => {
+ test('export and import list data', async ({ page }) => {
  // ...
- await page.click('button:has-text("Export Grocery Data")');
+ await page.click('button:has-text("Export List Data")');
});
```

**File:** `e2e/jazz-services.spec.ts`

```typescript
- test('shopping session sync', async ({ page }) => {
+ test('list session sync', async ({ page }) => {
  // Test session synchronization
- expect(session.inCartCount).toBe(1);
+ expect(session.selectedCount).toBe(1);
});
```

**Test:**
```bash
npm run test:run       # Unit tests
npm run test:e2e       # E2E tests
npm run check          # All checks
```

---

## Pre-Migration Checklist

Before starting migration:

- [ ] Create feature branch: `git checkout -b refactor/generic-list-terminology`
- [ ] Backup database: Copy Jazz local storage (if needed)
- [ ] Run full test suite: `npm run check` (record baseline)
- [ ] Document current test coverage
- [ ] Review this plan with team
- [ ] Set aside 3-4 days for focused work
- [ ] Plan for potential rollback strategy

---

## Phase Execution Checklist

### Phase 1: Schemas ✓
- [ ] Update `src/schemas/tree.ts` - rename types and fields
- [ ] Update `src/schemas/index.ts` - rename Account
- [ ] Add data migration logic
- [ ] Run `npm run type-check` (expect many errors)
- [ ] Commit: `git commit -m "refactor: rename schemas to generic list terminology"`

### Phase 2: Services ✓
- [ ] Update `src/services/sessionService.ts` - rename functions and fields
- [ ] Update `src/services/folderService.ts` - update Account refs
- [ ] Update `src/services/itemService.ts` - update Account refs
- [ ] Update all import services (5 files)
- [ ] Update all export services (4 files)
- [ ] Run `npm run type-check` (expect component errors only)
- [ ] Commit: `git commit -m "refactor: update services for generic list terminology"`

### Phase 3: Components ✓
- [ ] Rename session component files
- [ ] Update `ListSessionView.tsx` - component name and logic
- [ ] Update `ListSessionItemRow.tsx` - props and state
- [ ] Update `session/index.ts` - exports
- [ ] Update `TemplateEditor.tsx` - imports and usage
- [ ] Update `Dashboard.tsx` - Account reference
- [ ] Update tree components (3 files)
- [ ] Update import/export components (6 files)
- [ ] Update `src/lib/jazz.tsx` - schema reference
- [ ] Run `npm run type-check` (expect zero errors)
- [ ] Commit: `git commit -m "refactor: update components for generic list terminology"`

### Phase 4: UI Text ✓
- [ ] Update zone labels in `SessionZone.tsx`
- [ ] Update all aria labels (search and replace)
- [ ] Update button labels (dialogs and actions)
- [ ] Update toast/error messages
- [ ] Manual UI testing
- [ ] Commit: `git commit -m "refactor: update UI text for generic list terminology"`

### Phase 5: Documentation & Tests ✓
- [ ] Update `README.md`
- [ ] Update `ARCHITECTURE.md`
- [ ] Update `CLAUDE.md`
- [ ] Update `QUICKSTART.md`
- [ ] Update `package.json` description
- [ ] Update unit tests (4+ files)
- [ ] Update E2E tests (3 files)
- [ ] Run `npm run test:run`
- [ ] Run `npm run test:e2e`
- [ ] Run `npm run check` (all should pass)
- [ ] Commit: `git commit -m "docs: update documentation for generic list terminology"`

---

## Post-Migration Verification

### Automated Tests
- [ ] `npm run type-check` - zero errors
- [ ] `npm run lint` - zero errors
- [ ] `npm run test:run` - all unit tests pass
- [ ] `npm run test:e2e` - all E2E tests pass
- [ ] `npm run build` - production build succeeds

### Manual Testing

**Session Creation:**
- [ ] Create new list session
- [ ] Verify session name format
- [ ] Check initial counts (0 selected, 0 checked)

**Item State:**
- [ ] Select an item (left checkbox)
- [ ] Verify "Selected" zone updates
- [ ] Check an item (right checkbox)
- [ ] Verify "Checked" zone updates
- [ ] Deselect an item
- [ ] Verify both checkboxes clear

**UI Text:**
- [ ] All buttons show generic text (no "shopping")
- [ ] Zone headers show "Unchecked/Selected/Checked"
- [ ] Dialogs show generic terminology
- [ ] Tooltips use generic terms

**Import/Export:**
- [ ] Export list as JSON
- [ ] Verify field names in JSON (selected, checked)
- [ ] Import exported JSON
- [ ] Verify item states preserved

**Data Migration:**
- [ ] Test with existing user data
- [ ] Verify old sessions auto-migrate
- [ ] Check count fields updated
- [ ] Verify no data loss

**Accessibility:**
- [ ] Screen reader announces generic labels
- [ ] Keyboard navigation works
- [ ] Focus indicators visible

### Performance
- [ ] Session loading time (< 500ms)
- [ ] Item toggle response (< 100ms)
- [ ] Export/import speed (comparable to before)

---

## Rollback Plan

If critical issues arise:

### Immediate Rollback
```bash
git reset --hard HEAD~5  # Undo last 5 commits
git push -f origin refactor/generic-list-terminology
```

### Gradual Rollback
1. Identify problematic phase
2. Revert specific commits
3. Fix issues
4. Re-apply remaining phases

### Data Recovery
- Jazz automatically handles schema migrations
- Old field names still accessible for backward compatibility
- No manual data recovery needed

---

## Success Criteria

### Code Quality
- [ ] Zero TypeScript errors
- [ ] Zero linting errors
- [ ] All tests passing (100% previous coverage maintained)
- [ ] No console errors in dev/production

### Functionality
- [ ] All features work as before
- [ ] Data migration successful
- [ ] Export/import compatible with old format
- [ ] No performance regression

### Documentation
- [ ] All docs updated
- [ ] No shopping/grocery references in UI
- [ ] README reflects generic purpose
- [ ] API docs use generic terms

### User Experience
- [ ] Terminology is intuitive
- [ ] UI is consistent
- [ ] Accessibility maintained
- [ ] No breaking changes for existing users

---

## Timeline Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Schemas | 4-6 hours | 6 hours |
| Phase 2: Services | 4-6 hours | 12 hours |
| Phase 3: Components | 6-8 hours | 20 hours |
| Phase 4: UI Text | 2-3 hours | 23 hours |
| Phase 5: Docs & Tests | 3-4 hours | 27 hours |
| Testing & QA | 4-6 hours | 33 hours |

**Total:** 27-33 hours (3.5-4 workdays)

---

## Notes

**Backward Compatibility:**
- Keep old field names in Jazz schema during migration
- Use dual-field access during transition period
- Remove old fields in future version

**Communication:**
- Notify users of terminology change
- Explain benefits (more generic, flexible)
- Provide migration guide if needed

**Future Enhancements:**
- Consider making state labels configurable
- Allow custom zone names per template
- Support multiple checkbox modes

---

## Conclusion

This migration plan provides a systematic approach to transforming bubblelist from a shopping-specific to a generic list application. The phased approach minimizes risk while ensuring thorough testing at each stage.

**Key Principles:**
1. **Systematic:** Follow phases in order
2. **Testable:** Verify after each phase
3. **Reversible:** Can rollback if needed
4. **Complete:** Covers code, UI, docs, tests

**Next Steps:**
1. Review this plan
2. Set aside dedicated time
3. Create feature branch
4. Execute Phase 1
5. Proceed methodically through remaining phases
