# Integration & Testing Guide: FolderNode Hierarchy Migration

## Overview
The core migration to FolderNode hierarchy is complete. This guide outlines remaining integration work, testing requirements, and validation needed before production deployment.

---

## 1. Testing Infrastructure (HIGH PRIORITY)

### Test Helpers Rewrite
**File:** `src/services/testHelpers.ts.OLD`
**Status:** Disabled, needs complete rewrite

**Required Changes:**
- Remove all `DirectoryEntry` references → use `FolderNode`
- Replace `root.directory` and `root.templates` → use `root.folders`
- Update folder creation: use `folderService.createFolder()` instead of `directoryService.createDirectoryEntry()`
- Fix folder navigation: traverse hierarchy instead of path-based lookups
- Update type signatures: `Template` → `FolderNode` throughout

**New API Surface:**
```typescript
folder: {
  create: (name, isTemplate, parentFolderId?) => folderId
  get: (folderId) => FolderNode | null
  getAll: () => FolderNode[]
  getAllTemplates: () => FolderNode[]
  move: (folderId, newParentId?) => void
  rename: (folderId, newName) => void
}
```

### E2E Tests Update
**Files:** All tests in `tests/` directory
**Dependencies:** Requires testHelpers rewrite first

**Key Changes:**
- Update test selectors if folder UI structure changed
- Test folder creation in hierarchy (root + nested)
- Test folder move operations (drag-drop, service calls)
- Verify import/export round-trips preserve hierarchy
- Test conflict resolution (duplicate folder names)

---

## 2. Unit Tests

### FolderService Tests
**New file needed:** `src/services/folderService.test.ts`

**Critical Test Cases:**
- `createFolder()` - organizational vs template folders
- `moveFolder()` - parent updates, circular reference prevention
- `renameFolder()` - name validation, conflict detection
- `deleteFolder()` - soft delete (archive), children handling
- `getAllTemplateFolders()` - recursive traversal, archived filtering
- `getFolderPath()` - breadcrumb generation from parent chain
- Edge cases: deeply nested hierarchies (10+ levels), null parents

### Import/Export Tests
**Update existing tests:**
- `src/services/import/jsonImporter.test.ts`
- `src/services/export/jsonExporter.test.ts`

**New Test Scenarios:**
- Import into nested folder (parentFolder parameter)
- Name conflict resolution (append " (N)")
- Export preserves folder hierarchy metadata
- Round-trip: export → import → verify structure matches

### Template Service Tests
**File:** `src/services/templateService.test.ts`
**Update:** Change all `Template` references to `FolderNode`

---

## 3. Data Migration (if needed)

### Existing User Data
**Question:** Do we need to migrate existing user data or start fresh?

**If migration required:**
1. Create `migrations/` directory
2. Write migration script: `001_directory_to_folders.ts`
3. Logic:
   - Read `root.directory` and `root.templates`
   - Build FolderNode tree from path hierarchy
   - Create parent/child relationships
   - Preserve all template items and sessions
   - Set `root.folders` and clear old fields
4. Test migration with production data snapshots

**If starting fresh:**
- Add schema version check in `Account` migration
- Clear old data on schema version bump
- Show user notification about data reset

---

## 4. Performance Optimization

### Current Concerns (from TypeScript warnings)
- Jazz v0.18.x causes ~70 implicit 'any' types
- CoList type inference issues in some components

### Optimization Opportunities:
1. **Memoize folder operations:**
   - `getAllTemplateFolders()` - cache result until folders change
   - `getFolderPath()` - cache breadcrumb paths

2. **Lazy loading for deep hierarchies:**
   - Load children on expand, not upfront
   - Virtualize folder tree if 100+ folders

3. **Index parent-child relationships:**
   - Build Map<folderId, FolderNode[]> for children lookup
   - Avoid repeated Array.from(folders) iterations

4. **Batch updates:**
   - Move multiple folders in single transaction
   - Bulk import with deferred Jazz sync

---

## 5. Error Handling & Edge Cases

### Circular Reference Prevention
**Risk:** User moves folder A into its descendant B
**Fix:** In `folderService.moveFolder()`, add ancestor check:
```typescript
if (isAncestor(newParent, folder)) {
  throw new Error('Cannot move folder into its own descendant')
}
```

### Deep Nesting Limits
**Risk:** Infinite recursion with 100+ level hierarchies
**Fix:** Add depth limit (e.g., 20 levels) in `createFolder()`

### Orphaned Data
**Risk:** Parent folder deleted but children still reference it
**Fix:** Cascade delete - when archiving folder, archive all children

### Name Conflicts
**Status:** Partially implemented
**Gaps:**
- Test with special characters in names
- Test case-sensitivity (currently case-sensitive)
- Consider case-insensitive matching for UX

---

## 6. Documentation Updates

### Code Documentation
- ✅ folderService.ts - well documented
- ❌ ARCHITECTURE.md - update to reflect new schema
- ❌ README.md - update data model section
- ❌ Add JSDoc examples to complex functions

### User Documentation
- Import/Export guide - mention hierarchy preservation
- Folder organization best practices
- Migration guide (if data reset required)

---

## 7. Validation Checklist

### Before Merging to Main:
- [ ] All E2E tests passing
- [ ] Unit test coverage >80% for folderService
- [ ] No TypeScript errors (warnings acceptable if Jazz-related)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual testing:
  - [ ] Create 3-level folder hierarchy
  - [ ] Move folders between levels
  - [ ] Import JSON with nested folders
  - [ ] Export and verify JSON structure
  - [ ] Delete folder (verify soft delete)
  - [ ] Session functionality unchanged

### Before Production:
- [ ] Performance test: 100+ folders, 1000+ items
- [ ] Load test: Multiple users creating folders simultaneously
- [ ] Data migration tested (if applicable)
- [ ] Rollback plan documented

---

## 8. Known Technical Debt

### Disabled Files
1. `testHelpers.ts.OLD` - needs rewrite
2. `treeHelpers.ts.OLD` - no longer needed (can delete)
3. `directoryService.ts.OLD2` - no longer needed (can delete)

### TypeScript Warnings
- 70+ implicit 'any' types (Jazz v0.18.x limitation)
- Non-blocking, but affects IDE autocomplete
- Consider upgrading Jazz when v0.19+ available

### UI/UX Gaps
- No visual feedback for folder move operations
- No undo for folder operations
- No bulk folder operations (multi-select)

---

## Estimated Timeline

**Critical Path (2-3 days):**
1. Rewrite testHelpers.ts - 4 hours
2. Update E2E tests - 6 hours
3. Write folderService unit tests - 4 hours
4. Manual validation testing - 2 hours

**Optional (1-2 days):**
5. Performance optimizations - 4 hours
6. Documentation updates - 2 hours
7. Data migration script (if needed) - 6 hours

**Total: 3-5 days** to production-ready state.
