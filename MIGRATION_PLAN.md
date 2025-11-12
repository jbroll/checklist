# Generic List Terminology Migration Plan

**Status:** ✅ COMPLETED
**Completed Date:** 2025-11-08
**Actual Effort:** ~2 hours (with AI assistance)
**Commit:** `6f2a666` - "refactor: migrate shopping terminology to generic list"

**Goal:** Transform bubblelist from shopping-specific to generic list application ✅

**Approach:** Systematic renaming from shopping/grocery terminology to generic list terms ✅

---

## Migration Summary

**Files Changed:** 36 files
**Lines Modified:** 389 insertions, 352 deletions
**Components Renamed:** 2 (ShoppingSessionView → ListSessionView, ShoppingSessionItemRow → ListSessionItemRow)

**Quality Gates (All Passed):**
- ✅ TypeScript type checking (0 errors)
- ✅ Biome linting (0 issues)
- ✅ Unit tests (81 tests passing)
- ✅ E2E tests (30 tests passing)

---

## Terminology Mapping (COMPLETED)

### Core Entities

| Old | New | Status |
|-----|-----|--------|
| `GroceriesAccount` | `Account` | ✅ Migrated |
| `ShoppingSession` | `ListSession` | ✅ Migrated |
| `shopping session` | `list session` | ✅ Migrated |

### Item States

| Old | New | Status |
|-----|-----|--------|
| `inCart` | `selected` | ✅ Migrated |
| `purchased` | `checked` | ✅ Migrated |
| `addedToCartAt` | `selectedAt` | ✅ Migrated |
| `purchasedAt` | `checkedAt` | ✅ Migrated |
| `inCartCount` | `selectedCount` | ✅ Migrated |
| `completedCount` | `checkedCount` | ✅ Migrated |

### Functions

| Old | New | Status |
|-----|-----|--------|
| `toggleItemInCart()` | `toggleItemSelected()` | ✅ Migrated |
| `toggleItemPurchased()` | `toggleItemChecked()` | ✅ Migrated |
| `createSession()` | (kept - generic enough) | ✅ No change needed |

### UI Text (Not yet updated - Phase 4 pending)

| Current | Proposed New |
|---------|--------------|
| "In Cart" | "Selected" |
| "Purchased" | "Checked" |
| "Completed" | "Checked" |
| "Start Shopping" | "Start Session" |
| "Shopping List" | "List" |
| "Cart" | "Selected Items" |
| "Inventory" | "Unchecked Items" |

**Note:** UI text updates are deferred to a future phase as they are cosmetic and don't affect functionality.

---

## Implementation Details

### Phase 1: Schema Changes ✅ COMPLETED

**Files Modified:**
- `src/schemas/index.ts` - Renamed GroceriesAccount → Account
- `src/schemas/tree.ts` - Renamed ShoppingSession → ListSession, updated all field names

**Key Changes:**
- Added data migration logic using `.withMigration()` to automatically convert old field names
- Used type assertions with biome-ignore comments for migration code accessing legacy fields

### Phase 2: Service Layer Updates ✅ COMPLETED

**Files Modified (18 service files):**
- `src/services/sessionService.ts` - Renamed functions, updated field accesses
- `src/services/folderService.ts` - Updated Account type references
- `src/services/templateService.ts` - Updated Account type references (formerly itemService.ts)
- `src/services/export/*` (4 files) - Updated field names in export logic
- `src/services/import/*` (8 files) - Updated field names in import logic
- `src/services/testHelpers.ts` - Updated function references

### Phase 3: Component Updates ✅ COMPLETED

**Components Renamed:**
- `ShoppingSessionView.tsx` → `ListSessionView.tsx`
- `ShoppingSessionItemRow.tsx` → `ListSessionItemRow.tsx`

**Files Modified (14 component files):**
- All component imports updated to use `Account` instead of `GroceriesAccount`
- All `ListSession` references updated
- All prop names updated (`onToggleInCart` → `onToggleSelected`, etc.)
- Function calls updated to use new function names

### Phase 4: UI Text & Labels ⏸️ DEFERRED

This phase is deferred for now as it's purely cosmetic and doesn't affect functionality. Can be done in a future update.

### Phase 5: Documentation & Tests ⏸️ PARTIALLY COMPLETED

**Completed:**
- ✅ Updated MIGRATION_PLAN.md
- ✅ Updated CODE_REVIEW.md

**Deferred:**
- ARCHITECTURE.md updates
- CLAUDE.md updates
- README.md updates
- QUICKSTART.md updates

---

## Data Migration Strategy

Implemented automatic migration in `ListSession.withMigration()`:

```typescript
.withMigration((session) => {
  // Migrate item state fields
  // inCart → selected
  // purchased → checked
  // addedToCartAt → selectedAt
  // purchasedAt → checkedAt

  // Migrate count fields
  // inCartCount → selectedCount
  // completedCount → checkedCount
})
```

**Benefits:**
- Existing data automatically migrated on first access
- No data loss
- No manual intervention required
- Backward compatible

---

## Lessons Learned

1. **AI-Assisted Migration:** Using Claude Code with systematic planning reduced effort from estimated 12-16 hours to ~2 hours
2. **Quality Gates:** Running tests at each phase caught issues early
3. **Type System:** TypeScript caught most issues during migration
4. **Data Migration:** Jazz.tools `.withMigration()` made data migration seamless
5. **Testing:** Having comprehensive test coverage (81 unit + 30 E2E tests) gave confidence in changes

---

## Next Steps (Optional)

1. Update UI text labels (Phase 4) - cosmetic improvements
2. Update remaining documentation files (Phase 5)
3. Consider additional refactoring from CODE_REVIEW.md (code deduplication)

---

## Files Changed (Complete List)

**Schemas (2 files):**
- src/schemas/index.ts
- src/schemas/tree.ts

**Services (18 files):**
- src/services/sessionService.ts
- src/services/folderService.ts
- src/services/templateService.ts (formerly itemService.ts)
- src/services/testHelpers.ts
- src/services/export/exportService.ts
- src/services/export/jsonExporter.ts
- src/services/export/csvExporter.ts
- src/services/export/txtExporter.ts
- src/services/import/importService.ts
- src/services/import/jsonImporter.ts
- src/services/import/sessionImporter.ts
- src/services/import/csvImporter.ts
- src/services/import/txtImporter.ts
- src/services/import/validators.ts
- src/services/import/conflictResolver.ts

**Components (14 files):**
- src/components/Dashboard.tsx
- src/components/TestPage.tsx
- src/components/editor/TemplateEditor.tsx
- src/components/editor/TemplateItemsView.tsx
- src/components/session/ListSessionView.tsx (renamed)
- src/components/session/ListSessionItemRow.tsx (renamed)
- src/components/session/SessionZone.tsx
- src/components/session/index.ts
- src/components/tree/TreeView.tsx
- src/components/tree/FolderNodeView.tsx
- src/components/tree/SessionRowView.tsx
- src/components/import/*.tsx (3 files)
- src/components/export/*.tsx (3 files)

**Library (2 files):**
- src/lib/jazz.tsx
- src/lib/utils.ts
