# Folder & Template Migration Plan: Path-Based to Hierarchical

**Status**: Planning Phase
**Date**: 2025-11-11
**Goal**: Migrate from path-based flat structure to true hierarchical CoValues with per-level permissions

---

## Executive Summary

This plan outlines the migration from the current path-based directory system to a fully hierarchical structure where:

1. **Folders are CoValues** at each level with their own Jazz groups for permissions
2. **Templates are standalone CoValues** with a list of session references
3. **Sessions have back-references** to templates for independent sharing
4. **JSON format compatibility** is maintained with current import/export structure

**Key Benefits**:
- Granular permissions management at any folder level
- Efficient parent-child navigation without path parsing
- Templates and sessions can be shared independently
- Simpler move/copy operations without path recalculation
- Better alignment with Jazz's permission model

---

## Current System Analysis

### Current Structure
```
ListsRoot
├── directory: DirectoryEntry[]        # Flat array with paths
└── templates: CoList<Template>        # Flat list of templates
```

### Key Limitations
1. **No true hierarchy**: Paths simulate nesting
2. **No folder CoValues**: Can't attach permissions to folder levels
3. **Inefficient operations**: Move/rename requires path updates
4. **Monolithic permissions**: All-or-nothing at root level
5. **Template lookup**: O(n) search through flat list

---

## New Hierarchical Data Structure

### 1. Root Structure

```typescript
export const ListsRoot = co.map({
  // Root-level folders (each is a CoValue with own group)
  folders: co.list(Folder),

  // Metadata
  owner: () => Account,
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

**Changes from Current**:
- ❌ Remove: `directory` (flat array)
- ❌ Remove: `templates` (flat list)
- ✅ Add: `folders` (CoList of Folder CoValues)

---

### 2. Folder CoValue

Each folder is a CoValue with its own Jazz group for granular permissions.

```typescript
export const Folder = co.map({
  // Identity
  name: z.string(),
  description: z.optional(z.string()),

  // Type discrimination
  type: z.enum(['organizational', 'template']),

  // Hierarchical relationships
  children: co.list(Folder),           // Nested folders (CoList)
  parent: co.optional(Folder),         // Back-reference for navigation

  // Template data (only if type === 'template')
  template: co.optional(Template),     // The actual template CoValue

  // UI state
  expanded: z.boolean(),

  // Metadata
  archived: z.boolean(),
  owner: () => Account,
  createdAt: z.date(),
  updatedAt: z.date(),

  // Tags/categorization (future)
  tags: z.optional(z.array(z.string())),
});
```

**Key Design Decisions**:

1. **Discriminated Union**: `type` determines if folder contains a template
   - `'organizational'`: Container folder (has children, no template)
   - `'template'`: Leaf folder (has template, may have children for organization)

2. **Bidirectional References**:
   - `children`: Forward references to child folders
   - `parent`: Back reference for upward navigation

3. **Template Embedding**: Template is a property of folder (1:1 relationship)
   - Each template folder owns exactly one template
   - Template can't exist without its folder

4. **Own Jazz Group**: Each Folder is a CoValue with its own group
   - Permissions can be set at any folder level
   - Shared folder automatically includes all descendants

5. **No Paths**: Hierarchy is explicit through parent-child references
   - Paths can be computed on-demand for display
   - No path synchronization needed on moves/renames

---

### 3. Template CoValue

The actual template data structure with items and session references.

```typescript
export const Template = co.map({
  // Items (hierarchical structure)
  items: co.list(TemplateItem),        // CoList of items

  // Session management
  sessions: co.list(SessionRef),       // CoList of session references
  currentSessionId: z.optional(z.string()),

  // Settings
  showZoneHeadings: z.boolean(),

  // Metadata
  owner: () => Account,
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

**Changes from Current**:
- ❌ Remove: `name` (now in Folder)
- ✅ Change: `items` from plain array to `co.list(TemplateItem)`
- ✅ Change: `sessions` from `co.list(Session)` to `co.list(SessionRef)`

**Key Design Decisions**:

1. **Items as CoList**: Enables better sync and reactivity
   - Currently plain JSON array
   - CoList allows individual item updates to sync efficiently

2. **Session References**: Template holds references, not full sessions
   - Sessions are independent CoValues
   - Can be shared separately from template
   - Template maintains list of session IDs/refs

3. **No Name**: Name lives in parent Folder
   - Template is data, Folder is container/metadata
   - One source of truth for naming

---

### 4. TemplateItem CoValue

Individual items within a template, now as CoValues instead of plain JSON.

```typescript
export const TemplateItem = co.map({
  // Identity
  name: z.string(),

  // Type discrimination
  type: z.enum(['category', 'item']),

  // Hierarchical relationships
  children: co.list(TemplateItem),     // Nested items
  parent: co.optional(TemplateItem),   // Back-reference

  // Item properties (only for type === 'item')
  defaultQuantity: z.optional(z.string()),
  color: z.optional(z.string()),

  // Ordering & UI
  sortOrder: z.number(),
  expanded: z.boolean(),               // For categories

  // Metadata
  archived: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

**Changes from Current**:
- ❌ Remove: `path` (replaced by parent-child refs)
- ❌ Remove: `id` (Jazz CoValue ID is sufficient)
- ✅ Add: `children` (co.list for nested items)
- ✅ Add: `parent` (back-reference)
- ✅ Upgrade: From plain JSON to CoValue

**Key Design Decisions**:

1. **CoValue Instead of JSON**: Enables individual item sync
   - Currently entire items array syncs as one unit
   - CoValue items sync individually

2. **Explicit Hierarchy**: Parent-child references replace paths
   - Root items have `parent: undefined`
   - Categories contain `children` list

3. **No Separate ID**: Jazz CoValue ID serves as unique identifier
   - Session states reference by CoValue ID
   - Import/export uses CoValue IDs

4. **Category vs Item**: Same schema, discriminated by `type`
   - Categories have children
   - Items have defaultQuantity and color

---

### 5. Session CoValue

Shopping session with back-reference to template.

```typescript
export const Session = co.map({
  // Identity & back-reference
  name: z.string(),                           // Custom name (not auto-generated date)
  template: Template,                         // Back-reference to parent template
  templateFolder: Folder,                     // Back-reference to folder (for sharing context)

  // Item states (keyed by TemplateItem CoValue ID)
  itemStates: co.map({
    // Dynamic keys: CoValue ID → ItemState CoValue
  }),

  // View state
  viewMode: z.enum(['zone-in-hierarchy', 'hierarchy-in-zones', 'flat']),
  categoryExpanded: z.record(z.string(), z.boolean()),

  // Computed counts (can be removed if computed on-demand)
  selectedCount: z.number(),
  checkedCount: z.number(),
  remainingCount: z.number(),

  // Metadata
  archived: z.boolean(),
  owner: () => Account,
  createdAt: z.date(),
  lastActivityAt: z.date(),
});
```

**Changes from Current**:
- ✅ Add: `name` (custom session naming)
- ✅ Add: `template` (back-reference)
- ✅ Add: `templateFolder` (back-reference for context)
- ✅ Change: `itemStates` from Record to co.map

**Key Design Decisions**:

1. **Back-References**: Session knows its template and folder
   - Enables independent session sharing
   - User receives session → can navigate to template
   - Provides context for shared sessions

2. **Named Sessions**: Custom names instead of auto-generated dates
   - More meaningful for sharing ("Weekly Shopping")
   - Date still available in `createdAt`

3. **ItemStates as CoMap**: Better sync granularity
   - Currently plain Record
   - CoMap allows per-item state updates to sync

4. **Stable Item IDs**: References TemplateItem CoValue IDs
   - IDs don't change on import (if importing with same IDs)
   - No ID remapping needed

---

### 6. SessionRef Schema

Lightweight reference from Template to Session.

```typescript
export const SessionRef = co.map({
  session: Session,                    // Reference to actual Session CoValue
  isPinned: z.boolean(),               // Pin important sessions
  createdAt: z.date(),
});
```

**Why Separate Schema?**

1. **Metadata**: Attach data to the reference (pinning, ordering)
2. **Indirection**: Template can list sessions without loading them all
3. **Permissions**: Can grant/revoke access by managing references

---

### 7. ItemState CoValue

Individual item state within a session, now as CoValue.

```typescript
export const ItemState = co.map({
  // State flags
  selected: z.boolean(),               // Left checkbox (in cart)
  checked: z.boolean(),                // Right checkbox (purchased)

  // Timestamps
  selectedAt: z.optional(z.date()),
  checkedAt: z.optional(z.date()),

  // Custom modifications (future)
  customQuantity: z.optional(z.string()),   // Override template default
  notes: z.optional(z.string()),            // Per-session notes
});
```

**Changes from Current**:
- ✅ Upgrade: From plain JSON to CoValue
- ✅ Add: `customQuantity` (per-session overrides)
- ✅ Add: `notes` (per-session notes)

**Key Design Decisions**:

1. **CoValue**: Enables atomic updates per item state
   - Currently entire itemStates Record syncs together
   - CoValue allows individual state changes to sync

2. **Extensible**: Room for session-specific customizations
   - Quantity overrides
   - Notes per item per session

---

## Computed vs Stored Data

### Paths (Computed)

**Not Stored**: Paths are computed on-demand from hierarchy

```typescript
// Pseudo-code for path computation
function getPath(folder: Folder): string[] {
  const segments: string[] = [];
  let current = folder;

  while (current) {
    segments.unshift(current.name);
    current = current.parent;
  }

  return segments;
}

// Display as: "Grocery Stores / Wegmans / Weekly"
const displayPath = getPath(folder).join(' / ');
```

**Benefits**:
- No synchronization needed
- Rename/move operations are simple (update parent ref)
- No path conflicts to manage

### Counts (Computed)

**Consider Removing**: `selectedCount`, `checkedCount`, `remainingCount`

These can be computed on-demand from `itemStates`:

```typescript
function getCounts(session: Session) {
  let selected = 0, checked = 0;

  for (const state of session.itemStates.values()) {
    if (state.selected) selected++;
    if (state.checked) checked++;
  }

  return {
    selectedCount: selected,
    checkedCount: checked,
    remainingCount: selected - checked,
  };
}
```

**Trade-off**: CPU vs storage/sync overhead
- Storing: Faster reads, must update on every state change
- Computing: Slower reads (O(n)), always accurate

**Recommendation**: Compute on-demand (current sync approach is error-prone)

---

## Permissions Model

### Jazz Group per Folder

Each Folder CoValue has its own Jazz group, enabling:

1. **Granular Sharing**: Share any folder independently
2. **Inheritance**: Sharing folder includes all descendants
3. **Role-Based Access**: Different permissions per folder
   - Admin: Can modify, delete, share
   - Write: Can modify items/sessions
   - Read: Can view only

### Sharing Scenarios

#### Scenario 1: Share Entire Folder Tree
```typescript
// Share "Grocery Stores" folder with all templates
await groceryStoresFolder.addMember(otherUser, 'reader');
// → otherUser can see all nested folders and templates
```

#### Scenario 2: Share Single Template
```typescript
// Share "Wegmans Weekly" template only
await wegmansWeeklyFolder.addMember(otherUser, 'reader');
// → otherUser sees just this template, not siblings
```

#### Scenario 3: Share Session Independently
```typescript
// Share "2024-11-11 Shopping" session
await session.addMember(otherUser, 'writer');
// → otherUser can check off items
// → Back-reference lets them navigate to template (if they have access)
```

#### Scenario 4: Collaborative Template
```typescript
// Multiple users editing same template
await templateFolder.addMember(alice, 'writer');
await templateFolder.addMember(bob, 'writer');
// → Alice and Bob can both modify items
// → Changes sync in real-time
```

### Permission Levels (Jazz Built-in)

Jazz supports these permission levels:
- `admin`: Full control (modify, delete, share)
- `writer`: Can modify content
- `reader`: Read-only access

---

## JSON Import/Export Compatibility

### Export Format (Unchanged)

The JSON export format remains the same:

```json
{
  "version": "2.0",
  "exportDate": "2025-11-11T12:00:00.000Z",
  "folders": [
    {
      "name": "Grocery Stores",
      "type": "organizational",
      "folders": [
        {
          "name": "Wegmans",
          "type": "template",
          "items": [
            {
              "name": "Produce",
              "type": "category",
              "children": [
                {
                  "name": "Apples",
                  "type": "item",
                  "defaultQuantity": "5 lbs",
                  "color": "#ff0000",
                  "sortOrder": 0
                }
              ],
              "sortOrder": 0,
              "color": "#00ff00"
            }
          ],
          "sessions": [
            {
              "name": "Weekly Shopping",
              "viewMode": "hierarchy-in-zones",
              "itemStates": {
                "co_abc123": {
                  "selected": true,
                  "checked": false
                }
              },
              "createdAt": "2024-11-01T10:00:00.000Z"
            }
          ],
          "currentSessionId": "co_session_xyz"
        }
      ]
    }
  ]
}
```

**Key Points**:

1. **Hierarchical Structure**: Nested folders with `folders` array
2. **Item Hierarchy**: Nested items with `children` array
3. **CoValue IDs**: Export includes CoValue IDs for item states
4. **Type Discrimination**: `organizational` vs `template` folders

### Import Mapping

```
JSON Folder
  ↓
Folder CoValue (with group)
  ├─ children → nested Folder CoValues
  └─ template → Template CoValue
       ├─ items → TemplateItem CoValues (with hierarchy)
       └─ sessions → Session CoValues
            └─ itemStates → ItemState CoValues (keyed by TemplateItem ID)
```

**Import Process**:

1. **Parse JSON**: Validate structure and version
2. **Create Folder Hierarchy**: Recursively create Folder CoValues
3. **Create Template Items**: Build TemplateItem tree with parent-child refs
4. **Map Session States**: Use exported CoValue IDs (or generate new ones)
5. **Create Sessions**: Build Session CoValues with back-references
6. **Link Everything**: Connect all references (parent, template, session)

**ID Handling**:

- **Option A** (Preserve IDs): If JSON includes CoValue IDs, reuse them
  - Enables cross-device imports without session state remapping
  - Requires ID collision detection

- **Option B** (Generate New IDs): Always create new CoValue IDs
  - Simpler, no collisions
  - Requires session state remapping (old ID → new ID)

**Recommendation**: Option A for better user experience

---

## Migration Strategy (Future)

**Note**: Not concerned with migrating current data, but documenting approach for reference.

### Phase 1: Read Both Formats
- Support reading old path-based structure
- Support reading new hierarchical structure
- Detect format version on load

### Phase 2: Dual-Write
- Write to both old and new structures
- Validate consistency
- Allows rollback if issues found

### Phase 3: Migrate Data
- Convert path-based to hierarchical for each user
- Run in background on first load
- Mark migration complete

### Phase 4: Remove Old Code
- Remove path-based code
- Remove migration code
- Clean up unused schemas

---

## Key Operations: Before & After

### 1. Create Folder

**Before (Path-Based)**:
```typescript
// Create directory entry
const entry: DirectoryEntry = {
  id: nanoid(),
  name: 'New Folder',
  type: 'folder',
  path: parentPath + '\x01' + 'New Folder',  // Must compute path
  expanded: false,
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

me.root.directory.push(entry);
```

**After (Hierarchical)**:
```typescript
// Create Folder CoValue
const folder = Folder.create({
  name: 'New Folder',
  type: 'organizational',
  children: [],
  parent: parentFolder,      // Direct reference
  expanded: false,
  archived: false,
  owner: me,
  createdAt: new Date(),
  updatedAt: new Date(),
}, { owner: me });

parentFolder.children.push(folder);  // Add to parent's children
```

**Complexity**: Before: O(1) | After: O(1)
**Benefits**: No path computation, cleaner code

---

### 2. Move Folder

**Before (Path-Based)**:
```typescript
// Must update paths for folder and ALL descendants
const oldPath = folder.path;
const newPath = calculateNewPath(targetParent.path, folder.name);

// Update folder
folder.path = newPath;
folder.updatedAt = new Date();

// Update ALL descendants (requires finding them)
const descendants = me.root.directory.filter(e =>
  e.path.startsWith(oldPath + '\x01')
);

for (const desc of descendants) {
  desc.path = desc.path.replace(oldPath, newPath);
  desc.updatedAt = new Date();
}
```

**After (Hierarchical)**:
```typescript
// Simply update parent references
currentParent.children.remove(folder);  // Remove from old parent
newParent.children.push(folder);        // Add to new parent
folder.parent = newParent;              // Update back-reference
folder.updatedAt = new Date();

// No descendant updates needed!
```

**Complexity**: Before: O(n) for n descendants | After: O(1)
**Benefits**: Dramatically simpler, no path recalculation

---

### 3. Rename Folder

**Before (Path-Based)**:
```typescript
// Must update paths for folder and ALL descendants
const oldPath = folder.path;
const newPath = oldPath.replace(/[^\x01]+$/, newName);  // Replace last segment

folder.path = newPath;
folder.name = newName;
folder.updatedAt = new Date();

// Update ALL descendants
const descendants = me.root.directory.filter(e =>
  e.path.startsWith(oldPath + '\x01')
);

for (const desc of descendants) {
  desc.path = desc.path.replace(oldPath, newPath);
  desc.updatedAt = new Date();
}
```

**After (Hierarchical)**:
```typescript
// Just update the name
folder.name = newName;
folder.updatedAt = new Date();

// That's it! Descendants unaffected.
```

**Complexity**: Before: O(n) for n descendants | After: O(1)
**Benefits**: Instant renames, no side effects

---

### 4. Find Template by Path

**Before (Path-Based)**:
```typescript
// Find directory entry by path
const entry = me.root.directory.find(e =>
  e.path === targetPath && e.type === 'template-ref'
);

if (!entry?.templateId) return null;

// Search templates list for ID
const template = me.root.templates.find(t =>
  t.id === entry.templateId
);

return template;
```

**After (Hierarchical)**:
```typescript
// Walk hierarchy from root
let current = me.root;
const segments = targetPath.split('/');

for (const segment of segments) {
  current = current.folders.find(f => f.name === segment);
  if (!current) return null;
}

// Template is right there
return current.type === 'template' ? current.template : null;
```

**Complexity**: Before: O(n) + O(m) | After: O(d) for d depth
**Benefits**: No ID lookup, follows natural structure

---

### 5. List All Templates (Flat)

**Before (Path-Based)**:
```typescript
// Templates are already in flat list
const templates = me.root.templates;
```

**After (Hierarchical)**:
```typescript
// Must walk hierarchy recursively
function* iterateTemplates(folder: Folder): Iterable<Template> {
  if (folder.type === 'template' && folder.template) {
    yield folder.template;
  }

  for (const child of folder.children) {
    yield* iterateTemplates(child);
  }
}

const templates = Array.from(iterateTemplates(me.root));
```

**Complexity**: Before: O(1) | After: O(n) for n folders
**Trade-off**: Hierarchical structure requires traversal for flat views

**Mitigation**: Cache flat list if needed frequently

---

### 6. Get Folder Path (Display)

**Before (Path-Based)**:
```typescript
// Path is stored directly
const displayPath = folder.path.replace(/\x01/g, ' / ');
```

**After (Hierarchical)**:
```typescript
// Compute from hierarchy
function getDisplayPath(folder: Folder): string {
  const segments: string[] = [];
  let current = folder;

  while (current) {
    segments.unshift(current.name);
    current = current.parent;
  }

  return segments.join(' / ');
}

const displayPath = getDisplayPath(folder);
```

**Complexity**: Before: O(1) | After: O(d) for d depth
**Trade-off**: Path computation vs storage

**Benefits**:
- Paths always consistent (no sync issues)
- No updates needed on rename/move
- Can cache computed paths if needed

---

### 7. Add Item to Template

**Before (Path-Based)**:
```typescript
const item: TemplateItem = {
  id: nanoid(),
  name: 'Apples',
  type: 'item',
  path: parentPath + '\x01' + 'Apples',  // Compute path
  expanded: false,
  sortOrder: 0,
  archived: false,
  defaultQuantity: '5 lbs',
  color: '#ff0000',
  createdAt: new Date(),
};

template.items.push(item);  // Push to array
```

**After (Hierarchical)**:
```typescript
const item = TemplateItem.create({
  name: 'Apples',
  type: 'item',
  children: [],
  parent: parentCategory,    // Direct reference
  expanded: false,
  sortOrder: 0,
  archived: false,
  defaultQuantity: '5 lbs',
  color: '#ff0000',
  owner: me,
  createdAt: new Date(),
  updatedAt: new Date(),
}, { owner: me });

template.items.push(item);           // Add to template's items list
parentCategory.children.push(item);   // Add to parent's children (if not root)
```

**Complexity**: Before: O(1) | After: O(1)
**Benefits**: Better sync granularity (individual item updates)

---

### 8. Update Session Item State

**Before (Path-Based)**:
```typescript
// Update plain object in Record
session.itemStates[itemId] = {
  selected: true,
  checked: false,
  selectedAt: new Date(),
};

// Update counts manually
session.selectedCount++;
session.updatedAt = new Date();
```

**After (Hierarchical)**:
```typescript
// Update CoValue in CoMap
const state = session.itemStates.get(itemId);
if (state) {
  state.selected = true;
  state.checked = false;
  state.selectedAt = new Date();
} else {
  const newState = ItemState.create({
    selected: true,
    checked: false,
    selectedAt: new Date(),
    owner: me,
  }, { owner: me });

  session.itemStates.set(itemId, newState);
}

// Counts computed on-demand (no manual updates)
```

**Complexity**: Before: O(1) + manual count update | After: O(1)
**Benefits**:
- Finer-grained sync (only changed state syncs)
- No count synchronization bugs
- Simpler code (no count management)

---

## Implementation Phases (Future Reference)

### Phase 1: Schema Design & Review
- ✅ Define new schemas (this document)
- Review with team
- Validate JSON compatibility
- Consider edge cases

### Phase 2: Core Data Structures
- Implement Folder CoValue
- Implement Template CoValue
- Implement TemplateItem CoValue
- Implement Session & SessionRef CoValues
- Implement ItemState CoValue
- Write unit tests for each

### Phase 3: Service Layer
- Create folderService.ts (hierarchical operations)
- Update importService.ts (JSON → hierarchical)
- Update exportService.ts (hierarchical → JSON)
- Implement path computation utilities
- Write integration tests

### Phase 4: UI Updates
- Update folder tree component (use hierarchy)
- Update template editor (use TemplateItem CoValues)
- Update session view (use new session structure)
- Update import/export dialogs
- Update all references to paths

### Phase 5: Permissions UI
- Add sharing dialogs
- Add permission management
- Add member lists
- Implement permission checking

### Phase 6: Testing & Migration
- Comprehensive E2E tests
- Performance testing
- Migration script (if needed)
- Rollout plan

---

## Open Questions & Decisions Needed

### 1. Item State Storage

**Question**: Should itemStates be a CoMap or Record?

**Options**:
- **CoMap**: Better sync, each state is CoValue
  - Pro: Atomic per-item updates
  - Con: More CoValues to manage

- **Record**: Simpler, current approach
  - Pro: Fewer CoValues
  - Con: Entire map syncs on any change

**Recommendation**: CoMap for better sync granularity

---

### 2. Count Caching

**Question**: Store or compute selectedCount/checkedCount?

**Options**:
- **Store**: Faster reads, risk of desync
- **Compute**: Always accurate, O(n) cost

**Recommendation**: Compute on-demand (counts are cheap to calculate)

---

### 3. Organizational vs Template Folders

**Question**: Can template folders have children?

**Options**:
- **No Children**: Template folders are always leaves
  - Pro: Simpler model
  - Con: Can't organize templates hierarchically

- **Allow Children**: Template folders can have subfolders
  - Pro: Flexible organization ("Wegmans" template + "Wegmans/Seasonal" template)
  - Con: More complex

**Recommendation**: Allow children (more flexible)

---

### 4. Session Back-References

**Question**: Should sessions reference both template AND folder?

**Current Design**: Yes, both references

**Rationale**:
- `template`: Access template data when using session
- `templateFolder`: Access folder context (name, location, permissions)

**Alternative**: Just reference folder, access template via folder.template
- Pro: One less reference to manage
- Con: Assumes folder.template always exists

**Recommendation**: Keep both for robustness

---

### 5. Import ID Handling

**Question**: Preserve CoValue IDs on import or generate new?

**Options**:
- **Preserve**: Use IDs from JSON
  - Pro: Session states don't need remapping
  - Con: Requires collision detection

- **Generate New**: Always create new IDs
  - Pro: Simpler, no collisions
  - Con: Session states require remapping

**Recommendation**: Preserve IDs when possible, remap only on collision

---

### 6. Path Caching

**Question**: Should we cache computed paths for performance?

**Options**:
- **No Cache**: Compute on-demand every time
  - Pro: Always correct, no invalidation needed
  - Con: O(d) computation per access

- **Cache**: Store computed path in memory
  - Pro: O(1) lookups
  - Con: Must invalidate on rename/move

**Recommendation**: Start without cache, add if profiling shows need

---

### 7. Template Item vs Folder Item

**Question**: Should template items also have permissions (own groups)?

**Current Design**: No, items are properties of template
- Sharing template includes all items
- Items don't have independent permissions

**Alternative**: Each item is CoValue with own group
- Pro: Could share individual items
- Con: Much more complex, unclear use case

**Recommendation**: Keep items as template properties (current design)

---

## Risk Assessment

### High Risk
1. **Migration Complexity**: Converting existing data without loss
   - Mitigation: Not concerned with data migration for this phase

2. **Permission Model Mismatch**: Jazz permissions may not map perfectly
   - Mitigation: Study Jazz permissions deeply before implementation

### Medium Risk
1. **Performance**: More CoValues = more network overhead
   - Mitigation: Profile before/after, optimize hot paths

2. **Import/Export Compatibility**: Breaking existing exports
   - Mitigation: Version exports, support reading both formats

### Low Risk
1. **UI Complexity**: More complex state management
   - Mitigation: Jazz handles reactivity, should be simpler

2. **Path Computation**: Computing paths on-demand may be slow
   - Mitigation: Paths are shallow (typically <5 levels), O(d) is fine

---

## Success Criteria

1. **Functional Requirements**:
   - ✅ Folders are true CoValues with own groups
   - ✅ Parent-child references replace paths
   - ✅ Templates embed in folders (1:1)
   - ✅ Sessions have back-references
   - ✅ JSON import/export maintains compatibility

2. **Performance Requirements**:
   - Move/rename operations: O(1) instead of O(n)
   - Template lookup: O(d) instead of O(n)
   - Sync efficiency: Only changed items sync

3. **Usability Requirements**:
   - No visible changes to users (same features)
   - Sharing works at any folder level
   - Import/export still works with old exports

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Validate Jazz permissions** model (ensure it supports our needs)
3. **Prototype key schemas** to validate approach
4. **Test JSON roundtrip** (export → import → export should match)
5. **Plan implementation timeline** (when ready to code)

---

## Appendix: Schema Comparison

### Current (Path-Based)

```
ListsRoot
├── directory: DirectoryEntry[]     // Flat array with paths
│   ├── { type: 'folder', path: 'stores' }
│   └── { type: 'template-ref', path: 'stores\x01wegmans', templateId: 'T1' }
└── templates: CoList<Template>     // Flat list
    └── Template (id: 'T1')
        ├── items: TemplateItem[]           // Plain JSON array (with paths)
        └── sessions: CoList<Session>
            └── Session
                └── itemStates: Record<id, ItemState>   // Plain JSON Record
```

### New (Hierarchical)

```
ListsRoot
└── folders: CoList<Folder>         // Hierarchical CoValues
    └── Folder (type: 'organizational')
        ├── children: CoList<Folder>
        └── Folder (type: 'template')
            ├── template: Template          // Embedded template
            │   ├── items: CoList<TemplateItem>     // CoList with hierarchy
            │   │   └── TemplateItem
            │   │       └── children: CoList<TemplateItem>
            │   └── sessions: CoList<SessionRef>
            │       └── SessionRef
            │           └── session: Session        // Independent CoValue
            │               ├── template: Template          // Back-ref
            │               ├── templateFolder: Folder      // Back-ref
            │               └── itemStates: CoMap<id, ItemState>    // CoMap
            └── children: CoList<Folder>    // Can still have subfolders
```

**Key Differences**:
- ❌ No flat directory array
- ❌ No paths stored
- ✅ True parent-child references
- ✅ CoValues at every level
- ✅ Back-references for navigation
- ✅ Granular permissions (folder level)

---

## Appendix: Example Hierarchy

### Visual Representation

```
Root
├── Grocery Stores (organizational folder)
│   ├── Wegmans (template folder)
│   │   ├── template: Weekly Shopping Template
│   │   │   ├── items:
│   │   │   │   ├── Produce (category)
│   │   │   │   │   ├── Fruits (category)
│   │   │   │   │   │   └── Apples (item)
│   │   │   │   │   └── Vegetables (category)
│   │   │   │   │       └── Carrots (item)
│   │   │   │   └── Dairy (category)
│   │   │   │       └── Milk (item)
│   │   │   └── sessions:
│   │   │       ├── "2024-11-01 Trip"
│   │   │       └── "2024-11-08 Trip"
│   │   └── Seasonal (template folder)
│   │       └── template: Holiday Shopping
│   │           └── items: [...]
│   └── Trader Joe's (template folder)
│       └── template: TJ's Favorites
│           └── items: [...]
└── Meal Planning (organizational folder)
    └── Week 1 (template folder)
        └── template: Weekly Meal Plan
            └── items: [...]
```

### Sharing Example

1. **Share "Grocery Stores" folder** → recipient sees all templates (Wegmans, TJ's)
2. **Share "Wegmans" template** → recipient sees just that template + sessions
3. **Share "2024-11-01 Trip" session** → recipient can check off items
   - Back-reference lets them view template (if they have access)
   - Back-reference shows context ("Wegmans Weekly Shopping")

---

## Conclusion

This migration plan establishes a true hierarchical structure with:

1. **CoValues at every level** (folders, templates, items, sessions, states)
2. **Parent-child references** instead of path strings
3. **Granular permissions** via Jazz groups per folder
4. **Independent sharing** of templates and sessions
5. **JSON compatibility** with current import/export format

The new structure is:
- **Simpler**: No path synchronization
- **Faster**: O(1) operations instead of O(n)
- **More powerful**: Granular sharing and permissions
- **Better aligned**: Matches Jazz's permission model
- **Future-proof**: Supports collaboration and sharing

Next step: Review and validate this design before implementation.
