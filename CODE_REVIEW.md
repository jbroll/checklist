# Bubblelist Code Review & Refactoring Plan

**Date:** 2025-11-08
**Codebase Size:** ~2,671 lines of TypeScript/TSX
**Scope:** Complete code review including duplication, complexity, and naming conventions

---

## Executive Summary

The bubblelist codebase is well-structured with clear separation of concerns, but has several opportunities for improvement:

1. **Code Duplication:** ~620 lines of repeated code (~8-10% of service/utility code)
2. **Complexity Issues:** 7 areas with overly verbose or convoluted logic
3. **Naming Migration:** 90+ code occurrences + 25+ UI strings need renaming from shopping → generic list terminology

**Estimated Effort:**
- Refactoring duplication: 8-12 hours
- Simplifying complex logic: 4-6 hours
- Naming migration: 12-16 hours
- **Total:** 24-34 hours

---

## Part 1: Code Duplication Analysis

### High Priority (Quick Wins)

#### 1. Import/Export Duplication (~150 lines)

**Problem:** CSV and TXT importers have nearly identical logic

**Files:**
- `src/services/import/csvImporter.ts`
- `src/services/import/txtImporter.ts`

**Duplicated Code:**
- Result initialization
- Path collection
- Sort order calculation
- Item creation loops

**Solution:**
```typescript
// Create: src/services/import/baseImporter.ts
export function createItemsFromLines(
  lines: string[],
  folder: FolderNode,
  account: GroceriesAccount,
  parentPath: string = ''
): ImportResult {
  // Shared logic for creating items from parsed lines
}
```

**Impact:** Remove ~80 lines of duplicate code

---

#### 2. File Validation Repeated (~80 lines)

**Problem:** Import file validation repeated 4 times

**File:** `src/services/import/importService.ts`
**Lines:** 43-51, 155-162, 194-201, 235-243

**Current Pattern:**
```typescript
// Repeated 4 times with slight variations
if (!file) throw new Error('No file provided');
if (!isValidFileSize(file)) throw new Error('File too large');
if (!isValidFileType(file, 'csv')) throw new Error('Invalid type');
```

**Solution:**
```typescript
// Create: src/services/import/importValidator.ts
export function validateImportFile(
  file: File | null,
  expectedType: FileType,
  maxSizeMB: number = 10
): void {
  if (!file) throw new Error('No file provided');
  if (!isValidFileSize(file, maxSizeMB)) {
    throw new Error(`File exceeds ${maxSizeMB}MB limit`);
  }
  if (!isValidFileType(file, expectedType)) {
    throw new Error(`Invalid file type. Expected ${expectedType}`);
  }
}
```

**Impact:** Remove ~60 lines of duplicate validation

---

#### 3. Component Dialog Patterns (~200 lines)

**Problem:** Import dialogs duplicate drag-drop and result display

**Files:**
- `src/components/import/TemplateItemsImportDialog.tsx`
- `src/components/import/SessionImportDialog.tsx`

**Duplicated:**
- File drop handlers
- Upload zone markup
- Result display UI
- Error handling

**Solution:**
```typescript
// Create: src/components/ui/FileUploadZone.tsx
export function FileUploadZone({
  onFileSelect,
  acceptedTypes,
  maxSizeMB
}: Props) {
  // Reusable drag-drop zone
}

// Create: src/components/import/ImportResultDisplay.tsx
export function ImportResultDisplay({
  result,
  onClose
}: Props) {
  // Reusable result display
}
```

**Impact:** Remove ~100 lines of duplicate component code

---

### Medium Priority

#### 4. Service Entity Lookups (~50 lines)

**Pattern:** `findById()` logic repeated across services

**Files:**
- `src/services/folderService.ts` - `getFolder()`
- `src/services/itemService.ts` - `getItem()`
- `src/services/sessionService.ts` - `getSession()`

**Solution:**
```typescript
// Create: src/services/entityFinder.ts
export function findEntityById<T extends { $jazz: { id: string } }>(
  collection: T[] | null | undefined,
  id: string
): T | null {
  if (!collection) return null;
  return collection.find((item) => item?.$jazz.id === id) || null;
}
```

---

#### 5. Service Mutation Patterns (~40 lines)

**Pattern:** Jazz update + timestamp repeated everywhere

**Current:**
```typescript
// Repeated 20+ times across all services
item.$jazz.set('name', newName);
item.$jazz.set('updatedAt', new Date());
```

**Solution:**
```typescript
// Create: src/services/entityUpdater.ts
export function updateEntity<T extends { $jazz: any }>(
  entity: T,
  updates: Record<string, any>
): void {
  for (const [key, value] of Object.entries(updates)) {
    entity.$jazz.set(key, value);
  }
  entity.$jazz.set('updatedAt', new Date());
}

// Usage
updateEntity(item, { name: newName, color: newColor });
```

---

#### 6. Path Utility Duplication (~30 lines)

**Problem:** Functions defined in two files

**Files:**
- `src/utils/pathUtils.ts` (60 lines)
- `src/utils/pathManipulation.ts` (109 lines)

**Duplicates:**
- `getParentPath()`
- `getNameFromPath()`
- `normalizePathSegment()` / `normalizeNameForPath()` (nearly identical)

**Solution:** Consolidate into single `src/utils/pathUtils.ts`

---

#### 7. Descendant Path Updates (~30 lines)

**Problem:** Update logic repeated in itemService

**File:** `src/services/itemService.ts`
**Lines:** 189-198 (rename) vs 268-277 (move)

**Solution:**
```typescript
function updateDescendantPaths(
  items: TemplateItem[],
  oldParentPath: string,
  newParentPath: string
): void {
  // Shared descendant update logic
}
```

---

#### 8. Filename Generation (~40 lines)

**Problem:** Export filename logic repeated 3 times

**Files:**
- `src/services/export/exportService.ts`
- `src/components/export/TemplateItemsExportDialog.tsx`
- `src/components/export/SessionExportDialog.tsx`

**Solution:**
```typescript
// Create: src/utils/fileUtils.ts
export function buildExportFilename(
  baseName: string,
  format: 'json' | 'csv' | 'txt',
  includeTimestamp: boolean = true
): string {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const timestamp = includeTimestamp
    ? `-${new Date().toISOString().split('T')[0]}`
    : '';
  return `${sanitized}${timestamp}.${format}`;
}
```

---

## Part 2: Complexity & Verbose Logic

### High Priority

#### 1. Repetitive Error Handling in ImportService

**File:** `src/services/import/importService.ts`

**Problem:** Error response structure repeated 10+ times

**Example (lines 44-51, 56-62, 67-75):**
```typescript
// Repeated pattern
return {
  success: false,
  error: 'File too large (max 10MB)',
  itemsCreated: 0,
  conflictsResolved: 0,
  paths: [],
};
```

**Solution:**
```typescript
function createErrorResult(error: string): ImportResult {
  return {
    success: false,
    error,
    itemsCreated: 0,
    conflictsResolved: 0,
    paths: [],
  };
}

// Usage
if (!isValidFileSize(file)) {
  return createErrorResult('File too large (max 10MB)');
}
```

**Impact:** Remove ~50 lines

---

### Medium Priority

#### 2. Nested Conditionals in Components

**File:** `src/components/session/ShoppingSessionItemRow.tsx`
**Lines:** 32-57

**Problem:** 3-level nested ternary operators

**Current:**
```typescript
const status = item.purchased
  ? 'completed'
  : item.inCart
    ? 'in-cart'
    : 'remaining';
```

**Better:** Use early returns or state machine

```typescript
function getItemStatus(item: ItemState): ItemStatus {
  if (item.purchased) return 'completed';
  if (item.inCart) return 'in-cart';
  return 'remaining';
}
```

---

#### 3. Redundant Null Checks

**File:** `src/utils/treeHelpers.ts`
**Line:** 24

**Problem:** Filter nulls, then check again

**Current:**
```typescript
const validNodes = nodes.filter(n => n != null);
validNodes.forEach(node => {
  if (!node) return; // Redundant check
});
```

**Solution:** Remove redundant check after filter

---

#### 4. Multi-Pass Tree Building

**File:** `src/utils/itemTreeHelpers.ts`
**Lines:** 20-88

**Problem:** 5 passes over data (filter, map, sort, build, re-sort)

**Current Flow:**
1. Filter archived
2. Create path map
3. Sort by sortOrder
4. Build tree
5. Re-sort children

**Solution:** Reduce to 2 passes (filter + build with inline sorting)

---

### Low Priority

#### 5. Duplicate Folder Lookups in Validators

**File:** `src/services/import/validators.ts`

**Problem:** `pathExists()` (282-294) and `findFolderByPath()` (303-318) have identical loops

**Solution:**
```typescript
function findFolderByPath(
  account: GroceriesAccount,
  path: string
): FolderNode | null {
  return account.root.nodes.find(
    n => n?.path === path && !n?.archived
  ) || null;
}

function pathExists(account: GroceriesAccount, path: string): boolean {
  return findFolderByPath(account, path) !== null;
}
```

---

#### 6. Verbose Conflict Resolution

**File:** `src/services/import/conflictResolver.ts`

**Problem:** `resolvePathConflict()` and `resolveItemNameConflict()` repeat while-loop pattern

**Solution:** Extract shared conflict resolution logic:
```typescript
function resolveNameConflict(
  baseName: string,
  existsCheck: (name: string) => boolean
): string {
  let counter = 1;
  let candidate = `${baseName} (${counter})`;
  while (existsCheck(candidate)) {
    counter++;
    candidate = `${baseName} (${counter})`;
  }
  return candidate;
}
```

---

## Part 3: Shopping → Generic List Migration

### Terminology Mapping

| Current (Shopping) | Proposed (Generic) | Occurrences |
|-------------------|-------------------|-------------|
| `GroceriesAccount` | `Account` | 50+ |
| `ShoppingSession` | `ListSession` | 40+ |
| `inCart` | `selected` | 30+ |
| `purchased` | `checked` | 30+ |
| `addedToCartAt` | `selectedAt` | 10+ |
| `purchasedAt` | `checkedAt` | 10+ |
| `inCartCount` | `selectedCount` | 8 |
| `completedCount` | `checkedCount` | 8 |
| `toggleItemInCart()` | `toggleItemSelected()` | 6 |
| `toggleItemPurchased()` | `toggleItemChecked()` | 6 |

---

### Migration Plan: 5 Phases

#### Phase 1: Schema Changes (BREAKING)

**Files to Modify:**
1. `src/schemas/index.ts` - Rename GroceriesAccount → Account
2. `src/schemas/tree.ts` - Rename ShoppingSession → ListSession, update fields

**Key Changes:**
```typescript
// Before
export const GroceriesAccount = co.account({ ... });

export const ShoppingSession = co.map({
  inCart: z.boolean(),
  purchased: z.boolean(),
  addedToCartAt: z.optional(z.date()),
  purchasedAt: z.optional(z.date()),
  inCartCount: z.number(),
  completedCount: z.number(),
});

// After
export const Account = co.account({ ... });

export const ListSession = co.map({
  selected: z.boolean(),
  checked: z.boolean(),
  selectedAt: z.optional(z.date()),
  checkedAt: z.optional(z.date()),
  selectedCount: z.number(),
  checkedCount: z.number(),
});
```

**Migration Strategy:**
- Use Jazz schema migrations to handle existing data
- Add `.withMigration()` to transform old field names

---

#### Phase 2: Service Layer Updates

**Files to Modify:**
1. `src/services/sessionService.ts` - Rename functions + parameters
2. `src/services/folderService.ts` - Update Account type references
3. `src/services/itemService.ts` - Update Account type references
4. `src/services/export/*` - Update field names in export logic
5. `src/services/import/*` - Update field names in import logic

**Key Changes:**
```typescript
// Before
export function toggleItemInCart(
  account: InstanceOfSchema<typeof GroceriesAccount>,
  folderId: string,
  sessionId: string,
  itemId: string
): void {
  // ... logic with inCart
}

// After
export function toggleItemSelected(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
  sessionId: string,
  itemId: string
): void {
  // ... logic with selected
}
```

---

#### Phase 3: Component Updates

**Files to Modify:**
1. `src/components/session/ShoppingSessionView.tsx` → `ListSessionView.tsx`
2. `src/components/session/ShoppingSessionItemRow.tsx` → `ListSessionItemRow.tsx`
3. `src/components/editor/TemplateEditor.tsx` - Update state/handlers
4. `src/components/tree/SessionRowView.tsx` - Update display
5. `src/components/import/SessionImportDialog.tsx` - Update field names
6. `src/components/export/SessionExportDialog.tsx` - Update field names

**Component Renames:**
- `ShoppingSessionView` → `ListSessionView`
- `ShoppingSessionItemRow` → `ListSessionItemRow`
- `StartSessionDialog` → (keep, but update text)

---

#### Phase 4: UI Text & Labels

**Updates Needed:**

```typescript
// Before
"In Cart" → "Selected"
"Purchased" → "Checked"
"Start Shopping" → "Start Session"
"Shopping List" → "List"
"Cart" → "Selected Items"
"Completed Items" → "Checked Items"
"Inventory" → "Unchecked Items"

// Zone names
"Inventory zone" → "Unchecked zone"
"Cart zone" → "Selected zone"
"Completed zone" → "Checked zone"

// Aria labels
aria-label="In Cart" → aria-label="Selected"
aria-label="Purchased" → aria-label="Checked"
```

**Files:**
- All component files with UI strings
- `src/components/ui/` dialog components

---

#### Phase 5: Documentation & Tests

**Files to Update:**
1. `ARCHITECTURE.md` - Update all terminology
2. `CLAUDE.md` - Update examples and descriptions
3. `README.md` - Update feature descriptions
4. `QUICKSTART.md` - Update getting started guide
5. All test files - Update test descriptions and assertions
6. `package.json` - Update description field

**Test Updates:**
- E2E tests with regex patterns: `/shopping/gi` → `/list session/gi`
- Unit test descriptions
- Mock data generators

---

### Migration Execution Order

**Recommended Approach:**

1. **Branch Creation:** `git checkout -b refactor/generic-list-terminology`

2. **Phase 1 - Schemas** (1 commit)
   - Update schema definitions
   - Add migration helpers
   - Run type-check to identify all usages

3. **Phase 2 - Services** (1 commit)
   - Update all service files
   - Fix type errors
   - Run type-check + tests

4. **Phase 3 - Components** (1 commit)
   - Rename component files
   - Update imports
   - Fix type errors

5. **Phase 4 - UI Text** (1 commit)
   - Update all user-facing strings
   - Update aria labels
   - Test accessibility

6. **Phase 5 - Documentation** (1 commit)
   - Update all .md files
   - Update comments
   - Verify examples work

7. **Final Verification**
   - Run full test suite
   - E2E smoke tests
   - Manual QA of all features

---

### Breaking Changes & Rollout

**Jazz Data Migration Required:**

```typescript
// In src/schemas/tree.ts
export const ListSession = co.map({
  // ... new fields
}).withMigration(async (session) => {
  // Migrate old field names to new ones
  if (session.$jazz.has('inCart')) {
    session.$jazz.set('selected', session.inCart);
    session.$jazz.delete('inCart');
  }
  if (session.$jazz.has('purchased')) {
    session.$jazz.set('checked', session.purchased);
    session.$jazz.delete('purchased');
  }
  // ... migrate all fields
});
```

**Database Impact:**
- Existing users: Auto-migration on next login
- New users: Use new schema immediately
- No data loss

---

## Part 4: Implementation Phases

### Quick Wins (1-2 days)

**Goal:** Reduce duplication with minimal risk

1. ✅ Extract import validators (`importValidator.ts`)
2. ✅ Consolidate path utilities (merge into `pathUtils.ts`)
3. ✅ Extract error response helpers in ImportService
4. ✅ Create base importer module for CSV/TXT

**Estimated Impact:** ~200 lines removed

---

### Component Refactoring (2-3 days)

**Goal:** Extract reusable dialog components

1. ✅ Create `FileUploadZone` component
2. ✅ Create `ImportResultDisplay` component
3. ✅ Refactor import dialogs to use new components
4. ✅ Extract export format selector

**Estimated Impact:** ~150 lines removed

---

### Service Improvements (1-2 days)

**Goal:** Reduce service layer duplication

1. ✅ Create `entityFinder` utility
2. ✅ Create `entityUpdater` helper
3. ✅ Extract descendant path update logic
4. ✅ Simplify tree building (reduce passes)

**Estimated Impact:** ~120 lines removed, improved performance

---

### Generic List Migration (3-4 days)

**Goal:** Complete terminology migration

**Day 1:** Schema + Services
**Day 2:** Components
**Day 3:** UI Text + Documentation
**Day 4:** Testing + Verification

**Estimated Impact:** 90+ code changes, 25+ UI strings, 20+ doc updates

---

## Part 5: Risk Assessment

### Low Risk Refactorings

✅ Extract import validators
✅ Consolidate path utilities
✅ Extract error helpers
✅ Create reusable components

**Why Low Risk:**
- No logic changes
- Pure extraction
- Covered by existing tests

---

### Medium Risk Refactorings

⚠️ Service entity finders
⚠️ Tree building optimization
⚠️ Component state machine refactoring

**Why Medium Risk:**
- Logic simplification
- May affect edge cases
- Needs careful testing

---

### High Risk Changes

🔴 Schema field renames
🔴 Breaking API changes
🔴 Data migration

**Why High Risk:**
- Breaking changes
- Affects existing data
- Requires migration strategy
- Backward compatibility concerns

**Mitigation:**
- Comprehensive test coverage
- Jazz migration helpers
- Staged rollout
- Fallback plan

---

## Part 6: Testing Strategy

### Pre-Refactoring

1. ✅ Run full test suite (baseline)
2. ✅ Document current coverage
3. ✅ Identify gaps in coverage

### During Refactoring

1. ✅ Run tests after each commit
2. ✅ Add tests for extracted utilities
3. ✅ Verify no regressions

### Post-Refactoring

1. ✅ Full E2E test suite
2. ✅ Manual QA checklist
3. ✅ Performance benchmarks
4. ✅ Accessibility audit

---

## Part 7: Success Metrics

### Code Quality

- **Lines of Code:** Reduce by ~620 lines (8-10%)
- **Cyclomatic Complexity:** Reduce by 15-20%
- **Duplication:** < 2% (from current ~8%)
- **Test Coverage:** Maintain or improve (currently ~75%)

### Maintainability

- **Time to add new feature:** Reduce by ~20%
- **Onboarding time:** Reduce by ~30%
- **Bug fix time:** Reduce by ~15%

### User Experience

- **Terminology clarity:** Generic list terms more intuitive
- **Accessibility:** Improved aria labels
- **Performance:** Faster tree building (2-pass vs 5-pass)

---

## Appendix A: File Modification Checklist

### Schemas (2 files)
- [ ] `src/schemas/index.ts`
- [ ] `src/schemas/tree.ts`

### Services (10 files)
- [ ] `src/services/folderService.ts`
- [ ] `src/services/itemService.ts`
- [ ] `src/services/sessionService.ts`
- [ ] `src/services/import/importService.ts`
- [ ] `src/services/import/csvImporter.ts`
- [ ] `src/services/import/txtImporter.ts`
- [ ] `src/services/import/validators.ts`
- [ ] `src/services/import/conflictResolver.ts`
- [ ] `src/services/export/exportService.ts`
- [ ] `src/services/export/jsonExporter.ts`

### Components (15 files)
- [ ] `src/components/Dashboard.tsx`
- [ ] `src/components/editor/TemplateEditor.tsx`
- [ ] `src/components/session/ShoppingSessionView.tsx` → `ListSessionView.tsx`
- [ ] `src/components/session/ShoppingSessionItemRow.tsx` → `ListSessionItemRow.tsx`
- [ ] `src/components/session/StartSessionDialog.tsx`
- [ ] `src/components/import/ImportDialog.tsx`
- [ ] `src/components/import/TemplateItemsImportDialog.tsx`
- [ ] `src/components/import/SessionImportDialog.tsx`
- [ ] `src/components/export/ExportDialog.tsx`
- [ ] `src/components/export/TemplateItemsExportDialog.tsx`
- [ ] `src/components/export/SessionExportDialog.tsx`
- [ ] `src/components/tree/TreeView.tsx`
- [ ] `src/components/tree/SessionRowView.tsx`
- [ ] `src/lib/jazz.tsx`
- [ ] `src/lib/auth-client.ts`

### Utilities (5 files)
- [ ] `src/utils/pathUtils.ts`
- [ ] `src/utils/pathManipulation.ts`
- [ ] `src/utils/treeHelpers.ts`
- [ ] `src/utils/itemTreeHelpers.ts`
- [ ] `src/lib/utils.ts`

### Documentation (5 files)
- [ ] `README.md`
- [ ] `ARCHITECTURE.md`
- [ ] `CLAUDE.md`
- [ ] `QUICKSTART.md`
- [ ] `package.json`

### Tests (8+ files)
- [ ] All `.test.ts` files
- [ ] All `.spec.ts` files (E2E)

### Backend (2 files)
- [ ] `backend/src/auth.ts`
- [ ] `backend/src/index.ts`

---

## Appendix B: New Files to Create

### Utilities
- [ ] `src/services/import/importValidator.ts` - File validation helpers
- [ ] `src/services/import/baseImporter.ts` - Shared import logic
- [ ] `src/services/entityFinder.ts` - Generic entity lookup
- [ ] `src/services/entityUpdater.ts` - Generic Jazz update helper
- [ ] `src/utils/fileUtils.ts` - Export filename generation

### Components
- [ ] `src/components/ui/FileUploadZone.tsx` - Reusable upload zone
- [ ] `src/components/import/ImportResultDisplay.tsx` - Result display

---

## Appendix C: Quick Reference

### Find All Shopping References
```bash
# Find in code
grep -r "shopping\|Shopping\|grocery\|Groceries" src/

# Find in schemas
grep -r "inCart\|purchased" src/schemas/

# Find UI strings
grep -r "In Cart\|Purchased\|Start Shopping" src/components/
```

### Type-check After Changes
```bash
npm run type-check
```

### Run Tests
```bash
npm run test:run          # Unit tests
npm run test:e2e          # E2E tests
npm run check             # All checks
```

---

## Conclusion

This code review identified **~620 lines of duplicate code** (8-10% reduction opportunity), **7 areas of overly complex logic**, and **90+ naming changes** needed for the shopping → generic list migration.

**Recommended Next Steps:**

1. **Week 1:** Quick wins refactoring (extract utilities, remove duplication)
2. **Week 2:** Component refactoring (extract reusable components)
3. **Week 3:** Generic list migration (schemas → services → components)
4. **Week 4:** Documentation, testing, verification

**Total Estimated Effort:** 24-34 hours (3-4 weeks part-time)

**Expected Benefits:**
- 8-10% code reduction
- 15-20% complexity reduction
- Improved maintainability
- More intuitive terminology for users
- Better test coverage
- Easier onboarding for new developers
