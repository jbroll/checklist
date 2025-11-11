# Folder & Template Migration Plan: Path-Based to Hierarchical

**Status**: Planning Phase
**Date**: 2025-11-11
**Goal**: Migrate from path-based flat structure to true hierarchical CoValues with granular permissions

---

## Overview

This plan migrates from the current path-based directory system to a fully hierarchical structure where:

1. **Folders are CoValues** at each level with their own Jazz groups for permissions
2. **Templates extend folders** with polymorphic children (SessionStorage vs child folders)
3. **Sessions are plain JSON** stored in SessionStorage CoValue (not independently shareable)
4. **Items are plain JSON** with stable IDs (not Jazz CoValue IDs)
5. **JSON export format** remains compatible with current structure

**Key Benefits**:
- Granular permissions at any folder level
- O(1) move/rename operations (no path recalculation)
- Atomic template+sessions loading for simple re-renders
- Clean separation of concerns (structure vs data vs state)

---

## Current System Limitations

```
ListsRoot
├── directory: DirectoryEntry[]     // Flat array with paths (strings)
└── templates: CoList<Template>     // Flat list, O(n) lookup
```

**Problems**:
- No true hierarchy (paths simulate nesting via `\x01` separator)
- Move/rename requires updating all descendant paths (O(n))
- No granular permissions (all-or-nothing at root)
- Template lookup by ID requires searching entire list
- Path conflicts require name munging

---

## New Hierarchical Structure

### Core Schemas

```typescript
// Root of user's data
ListsRoot {
  folders: CoList<Folder>,     // Root-level folders only
  owner: Account,
}

// Organizational folder (container)
Folder {
  name: string,
  type: 'organizational',
  children: CoList<Folder>,    // Nested folders
  parent?: Folder,             // Back-reference for breadcrumbs
  expanded: boolean,
  archived: boolean,
  owner: Account,
  createdAt: Date,
  updatedAt: Date,
}

// Template folder (leaf in folder tree, has template+sessions)
Template extends Folder {
  type: 'template',
  children: SessionStorage,    // Polymorphic! Not folders, but sessions
  items: TemplateItem[],       // Plain JSON array (nested hierarchy)
  showZoneHeadings: boolean,
}

// Session storage (CoValue for atomic loading)
SessionStorage {
  sessions: Session[],         // Plain JSON array
}

// Template item (plain JSON, not CoValue)
TemplateItem {
  id: string,                  // Stable nanoid (exported, not Jazz CoValue ID)
  name: string,
  type: 'category' | 'item',
  children: TemplateItem[],    // Plain JSON nested
  sortOrder: number,
  expanded: boolean,
  defaultQuantity?: string,
  color?: string,
  archived: boolean,
}

// Session (plain JSON, not CoValue)
Session {
  itemStates: Record<string, ItemState>,  // Plain JSON Record (itemId → state)
  viewMode: 'zone-in-hierarchy' | 'hierarchy-in-zones' | 'flat',
  categoryExpanded: Record<string, boolean>,
  archived: boolean,
  createdAt: Date,
  lastActivityAt: Date,        // This IS updatedAt
}

// Item state (plain JSON, not CoValue)
ItemState {
  selected: boolean,
  checked: boolean,
  selectedAt?: Date,
  checkedAt?: Date,
}
```

---

## Key Design Decisions

### 1. Polymorphic Children Field

The `children` field is **type-dependent**:
- **Organizational folder**: `children: CoList<Folder>` (nested folders)
- **Template folder**: `children: SessionStorage` (sessions)

**Why?**
- Elegant: single field for "child content"
- Atomic loading: loading template = loading its sessions
- Simple re-render: one subscription point
- Template folders are **leaves** in folder tree (no child folders)
- Sessions are **conceptual children** (via SessionStorage, not folder hierarchy)

### 2. Template Extends Folder

```typescript
Template extends Folder {
  type: 'template',            // Override discriminant
  children: SessionStorage,    // Override type
  items: TemplateItem[],       // Add fields
  showZoneHeadings: boolean,
}
```

**Why?**
- DRY: reuse folder fields (name, parent, expanded, etc.)
- Type system: discriminated union with `type` field
- Single type hierarchy for navigation

**Note**: If Jazz `co.map()` doesn't support inheritance, use discriminated union with conditional types.

### 3. Items Are Plain JSON (Not CoValues)

**Why?**
- **Granularity**: Too many CoValues (hundreds per template)
- **Coupling**: Items are tightly bound to template structure
- **Performance**: Sync overhead outweighs benefits
- **Simplicity**: Current approach works well

Items have **stable nanoid IDs** (not Jazz CoValue IDs):
- IDs are part of the data (stored, exported, imported)
- Session states reference these stable IDs
- IDs survive export/import without remapping

### 4. Sessions Are Plain JSON in SessionStorage

**Why?**
- **Not independently shareable**: Sessions are bound to template
- **No back-references needed**: Navigation is always folder → template → sessions
- **Atomic loading**: SessionStorage is one CoValue, loads all sessions together
- **Simpler**: No CoValue management per session

SessionStorage is a **separate CoValue** (like inode block list):
- Sessions sync independently from template structure
- Can load sessions on-demand (if needed)
- Clean separation of concerns

### 5. No Session Names (Just createdAt)

Sessions don't have custom names:
- Display formatted `createdAt` date
- One less field to manage
- Current approach works fine

### 6. CurrentSessionId Is Local UI State

**Critical**: `currentSessionId` is **NOT stored in Jazz**:
- Stored in React local state only
- Each user tracks their own active session
- Avoids conflicts when multiple users view same template

### 7. No CoValue IDs in Exports

Exports are **portable** (not Jazz-specific):
- Use stable nanoid IDs for items
- Don't export Jazz CoValue IDs
- Exports are for backup/restore/interchange

### 8. Computed Paths

Paths are **computed on-demand** from hierarchy:

```typescript
function getPath(folder: Folder): string[] {
  const segments: string[] = [];
  let current = folder;
  while (current) {
    segments.unshift(current.name);
    current = current.parent;
  }
  return segments;
}
```

**Benefits**:
- No synchronization needed
- Rename/move doesn't update paths (they don't exist!)
- Always consistent

### 9. Parent Back-References

Folders have `parent?: Folder` back-reference:
- Enables upward navigation (breadcrumbs)
- Simplifies path computation
- Must maintain on move operations

---

## CoValue Boundaries

**CoValues** (sync units with Jazz groups):
1. **Folder** (organizational folders)
2. **Template** (extends Folder, template folders)
3. **SessionStorage** (one per template)

**Plain JSON** (syncs as part of parent CoValue):
1. **TemplateItem** (array in Template)
2. **Session** (array in SessionStorage)
3. **ItemState** (Record in Session)

This minimizes CoValue overhead while maintaining necessary sync granularity.

---

## Permissions Model

Each **Folder** (including Template) is a CoValue with its own Jazz group:

1. **Granular sharing**: Share any folder independently
2. **Inheritance**: Sharing folder includes all descendants
3. **Role-based access**: admin/writer/reader (Jazz built-in)

**Example**:
```typescript
// Share "Grocery Stores" folder → includes all nested templates
await groceryStoresFolder.addMember(otherUser, 'reader');

// Share single "Wegmans" template → just that template
await wegmansTemplate.addMember(otherUser, 'writer');
```

Sessions are **not independently shareable** (they're part of template's SessionStorage).

---

## JSON Export Format

The JSON format **remains unchanged** (backwards compatible):

```json
{
  "version": "2.0",
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
              "id": "item_abc123",
              "name": "Produce",
              "type": "category",
              "children": [
                {
                  "id": "item_def456",
                  "name": "Apples",
                  "type": "item",
                  "defaultQuantity": "5 lbs",
                  "color": "#ff0000",
                  "sortOrder": 0
                }
              ],
              "sortOrder": 0
            }
          ],
          "sessions": [
            {
              "viewMode": "hierarchy-in-zones",
              "itemStates": {
                "item_def456": {
                  "selected": true,
                  "checked": false,
                  "selectedAt": "2024-11-01T10:00:00.000Z"
                }
              },
              "archived": false,
              "createdAt": "2024-11-01T10:00:00.000Z",
              "lastActivityAt": "2024-11-01T11:00:00.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

**Key Points**:
- Hierarchical structure (nested `folders` array)
- Items use stable IDs (`id` field, not Jazz CoValue IDs)
- Session states reference item IDs
- No paths stored (hierarchy is explicit)
- No Jazz-specific data (portable)

### Import/Export Process

**Export**: Hierarchical → JSON
1. Walk folder tree recursively
2. For each template, export items with nested children
3. Export sessions with itemStates (using stable item IDs)
4. No Jazz CoValue IDs included

**Import**: JSON → Hierarchical
1. Parse and validate JSON structure
2. Create Folder CoValues recursively
3. Create Template CoValues (extends Folder)
4. Create SessionStorage CoValues
5. Build items array (plain JSON with nested children)
6. Build sessions array (plain JSON)
7. Preserve item IDs from JSON (no remapping needed)

---

## Key Operations

### Create Folder

```typescript
const folder = Folder.create({
  name: 'New Folder',
  type: 'organizational',
  children: [],
  parent: parentFolder,
  expanded: false,
  archived: false,
  owner: me,
  createdAt: new Date(),
  updatedAt: new Date(),
}, { owner: me });

parentFolder.children.push(folder);
```

**Complexity**: O(1)

### Move Folder

```typescript
// Remove from old parent
currentParent.children.remove(folder);

// Add to new parent
newParent.children.push(folder);
folder.parent = newParent;
folder.updatedAt = new Date();
```

**Complexity**: O(1) — no descendant path updates!

### Rename Folder

```typescript
folder.name = newName;
folder.updatedAt = new Date();
```

**Complexity**: O(1) — no descendant path updates!

### Find Template by Path

```typescript
let current: Folder | undefined = root;
const segments = displayPath.split('/');

for (const segment of segments) {
  current = current.children.find(f => f.name === segment);
  if (!current) return null;
}

return current.type === 'template' ? current : null;
```

**Complexity**: O(d) for depth d (typically <5 levels)

### Add Item to Template

```typescript
const item: TemplateItem = {
  id: nanoid(),
  name: 'Apples',
  type: 'item',
  children: [],
  sortOrder: 0,
  expanded: false,
  defaultQuantity: '5 lbs',
  color: '#ff0000',
  archived: false,
};

// Add to parent category (or template.items if root)
parentCategory.children.push(item);
```

**Complexity**: O(1)

### Update Session Item State

```typescript
session.itemStates[itemId] = {
  selected: true,
  checked: false,
  selectedAt: new Date(),
};
session.lastActivityAt = new Date();
```

**Complexity**: O(1)

---

## Visual Hierarchy

```
Root
├── Grocery Stores (organizational folder, CoValue)
│   ├── Wegmans (template folder, CoValue extends Folder)
│   │   ├── items: TemplateItem[] (plain JSON, nested)
│   │   │   └── Produce → Fruits → Apples
│   │   └── children: SessionStorage (CoValue)
│   │       └── sessions: Session[] (plain JSON)
│   │           └── { createdAt: 2024-11-01, itemStates: {...} }
│   └── Trader Joe's (template folder)
│       └── ...
└── Meal Planning (organizational folder)
    └── Week 1 (template folder)
        └── ...
```

**Navigation**:
- Folder tree: `root.folders` → `folder.children` (CoList)
- Template items: `template.items` → `item.children` (plain arrays)
- Sessions: `template.children` (SessionStorage) → `sessionStorage.sessions` (plain array)

**Two hierarchies**:
1. Folder hierarchy: organizational folders → template folders (tree)
2. Item hierarchy: categories → items (nested, within each template)

Sessions are conceptual children of template, accessed via polymorphic `children` field.

---

## Internal Service APIs

**Maintain current API signatures** (implementation changes, but interfaces stay stable):

```typescript
// folderService.ts
createFolder(parent: Folder, name: string, type: 'organizational' | 'template')
moveFolder(folder: Folder, newParent: Folder)
renameFolder(folder: Folder, newName: string)
deleteFolder(folder: Folder)  // soft delete (archived)

// templateService.ts
createItem(template: Template, parent: TemplateItem | null, name: string)
moveItem(item: TemplateItem, newParent: TemplateItem | null)
updateItem(item: TemplateItem, updates: Partial<TemplateItem>)

// sessionService.ts
createSession(template: Template)
updateItemState(session: Session, itemId: string, state: Partial<ItemState>)
archiveSession(session: Session)

// importService.ts
importFromJSON(data: ExportData): Folder[]

// exportService.ts
exportToJSON(folders: Folder[]): ExportData
```

**Implementation** changes to use hierarchy, but **API contracts** stay the same.

---

## Migration Approach (Future)

**Note**: Not concerned with migrating existing data, but documenting for reference.

### Strategy

1. **Dual read**: Support both path-based and hierarchical structures
2. **Convert on load**: Migrate user's data on first access with new version
3. **Validate**: Ensure no data loss
4. **Clean up**: Remove old path-based code after rollout

### Conversion Logic

```
Old: DirectoryEntry[] + templates
  ↓
Parse paths to reconstruct hierarchy
  ↓
Create Folder CoValues with parent-child references
  ↓
Embed Template in template folders
  ↓
Convert items to nested structure (already have paths)
  ↓
Create SessionStorage CoValue per template
  ↓
Copy sessions into SessionStorage
```

---

## What This Enables

### 1. Granular Permissions
- Share entire folder trees OR individual templates
- Role-based access (admin/writer/reader)
- Collaborative editing (multiple users, real-time sync)

### 2. Simpler Operations
- Move/rename: O(1) instead of O(n)
- No path synchronization bugs
- Cleaner code (direct references instead of path strings)

### 3. Better Performance
- Efficient lookups (walk hierarchy, not search flat list)
- Atomic loading (template + sessions together)
- Fine-grained sync (only changed folders sync)

### 4. Future Features
- Folder descriptions/tags
- Usage statistics per template
- Version history (Jazz supports this)
- Public template sharing
- Template marketplace

---

## Implementation Notes

### Jazz Schema Syntax

If Jazz `co.map()` doesn't support inheritance:

```typescript
// Use discriminated union instead of inheritance
type FolderOrTemplate = OrganizationalFolder | Template;

const OrganizationalFolder = co.map({
  type: z.literal('organizational'),
  name: z.string(),
  children: co.list(() => FolderOrTemplate),
  ...
});

const Template = co.map({
  type: z.literal('template'),
  name: z.string(),
  children: SessionStorage,  // Different type!
  items: z.array(...),
  ...
});
```

TypeScript conditional types handle polymorphic `children` field.

### Parent Reference Management

When moving folders, **must update both sides**:

```typescript
// Remove from old parent
currentParent.children.remove(folder);

// Add to new parent
newParent.children.push(folder);

// Update back-reference
folder.parent = newParent;
```

Consider helper functions to encapsulate this logic.

### Path Computation Caching

Paths are computed on-demand. If profiling shows this is expensive:

```typescript
// Add computed path cache (invalidate on rename/move)
const pathCache = new WeakMap<Folder, string[]>();

function getPath(folder: Folder): string[] {
  if (pathCache.has(folder)) return pathCache.get(folder)!;

  const path = computePath(folder);
  pathCache.set(folder, path);
  return path;
}
```

Start **without caching** (simpler, always correct).

---

## Success Criteria

1. ✅ Folders are CoValues with own Jazz groups
2. ✅ Parent-child references replace paths
3. ✅ Template folders are leaves (children is SessionStorage)
4. ✅ Items are plain JSON with stable IDs
5. ✅ Sessions are plain JSON (not independently shareable)
6. ✅ JSON export format unchanged
7. ✅ Internal service APIs maintain signatures
8. ✅ Move/rename operations are O(1)
9. ✅ No CoValue IDs in exports
10. ✅ currentSessionId is local UI state

---

## Summary

This migration establishes a true hierarchical structure:

**CoValue Boundaries**:
- Folder (organizational)
- Template (extends Folder)
- SessionStorage (one per template)

**Plain JSON**:
- TemplateItem (stable nanoid IDs)
- Session (no back-refs, not shareable)
- ItemState (minimal)

**Key Benefits**:
- Granular permissions (Jazz groups per folder)
- O(1) operations (no path recalculation)
- Clean architecture (structure vs data vs state)
- JSON compatibility (portable exports)
- Simpler code (direct references)

**Elegant Design**:
- Polymorphic `children` field (folders vs sessions)
- Template extends Folder (DRY)
- Atomic loading (template + sessions)
- Computed paths (always consistent)

Next: Validate with team, prototype schemas, implement.
