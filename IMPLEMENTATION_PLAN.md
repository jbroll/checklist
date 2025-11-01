# Grocery List App - Implementation Action Plan

## Executive Summary

Transform the grocery list app from a simple list manager into a **template-based shopping system** with:
- **Hierarchical organization** - Folders containing template-folders
- **Template-session model** - Templates are reusable, sessions track shopping state
- **Three-zone shopping view** - Items move between inventory → cart → completed
- **Dual-checkbox system** - Left checkbox (add to cart), right checkbox (purchased)

---

## Core Architecture

### Data Model

**Folder Structure:**
```
📁 Organizational Folder
   ├── 📁 Sub-folder (can nest)
   └── 📋 Template Folder (leaf node)
        ├── items: [TemplateItem]
        └── sessions: [ShoppingSession]
```

**Key Concepts:**
1. **FolderNode** - Two types: `"folder"` (organizational) or `"template-folder"` (contains items)
2. **Template folders are leaf nodes** - Cannot have child folders
3. **Items stored in template-folder** - Clean, no shopping state
4. **Sessions reference template items** - Only track state (inCart, purchased) by item ID
5. **Soft delete only** - Items marked `archived: true`, never truly deleted

---

## Schema Design

### 1. FolderNode (Organizational)
```typescript
export const FolderNode = co.map({
  name: z.string(),
  type: z.literal("folder"),
  path: z.string(),              // e.g., "grocery-stores/wegmans"
  expanded: z.boolean(),

  // Sharing (from pin-maker)
  permissions: PathPermissions,
  sharingMode: z.enum(["private", "shared", "public"]).optional(),

  owner: GroceriesAccount,
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

### 2. TemplateFolderNode (Leaf Node with Items)
```typescript
export const TemplateFolderNode = co.map({
  name: z.string(),
  type: z.literal("template-folder"),
  path: z.string(),              // e.g., "grocery-stores/wegmans/weekly-groceries"
  expanded: z.boolean(),

  // Template items (master list)
  items: co.list(TemplateItem),

  // Shopping sessions (not in tree UI)
  sessions: co.list(ShoppingSession),
  currentSessionId: z.optional(z.string()),  // Active session ID

  // Sharing
  permissions: PathPermissions,
  sharingMode: z.enum(["private", "shared", "public"]).optional(),

  owner: GroceriesAccount,
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

### 3. TemplateItem (Clean, No State)
```typescript
export const TemplateItem = co.map({
  name: z.string(),
  category: z.literal(['produce', 'dairy', 'meat', 'pantry', 'frozen',
                       'household', 'bakery', 'beverages', 'other'] as const),
  sortOrder: z.number(),
  archived: z.boolean(),         // Soft delete flag

  addedBy: GroceriesAccount,
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

### 4. ShoppingSession (State Tracker)
```typescript
export const ShoppingSession = co.map({
  name: z.string(),              // "[2025-01-15]" or "[2025-01-15 14:30]"
  templateFolderId: z.string(),  // Reference to parent template folder

  // State tracking by item ID
  itemStates: co.record(z.string(), ItemState),

  // Session metadata
  status: z.enum(["active", "completed", "abandoned"]),
  categoryExpanded: co.record(z.string(), z.boolean()),

  // Cached counts (for UI performance)
  inCartCount: z.number(),
  completedCount: z.number(),
  remainingCount: z.number(),

  owner: GroceriesAccount,
  startedAt: z.date(),
  lastActivityAt: z.date(),
  completedAt: z.optional(z.date()),
});
```

### 5. ItemState (Session-Specific State)
```typescript
export const ItemState = co.map({
  itemId: z.string(),            // Reference to TemplateItem.$jazz.id

  // Shopping state
  inCart: z.boolean(),           // Left checkbox
  purchased: z.boolean(),        // Right checkbox

  // Timestamps
  addedToCartAt: z.optional(z.date()),
  purchasedAt: z.optional(z.date()),

  checkedBy: co.optional(GroceriesAccount),
});
```

### 6. Update Root Schema
```typescript
export const ListsRoot = co.map({
  nodes: co.list(FolderNode),    // All folders and template-folders
});

export const GroceriesAccount = co
  .account({
    root: ListsRoot,
    profile: co.profile(),
  })
  .withMigration((account) => {
    if (!account.$jazz.has('root')) {
      account.$jazz.set('root', {
        nodes: [],
      });
    }
  });
```

---

## UI Component Structure

### Tree View (Home)
```
TreeView
├── TreeNode (recursive for folders)
│   ├── Chevron icon
│   ├── Folder name
│   ├── Share badge
│   └── Children (nested TreeNodes or TemplateRows)
└── TemplateRow (for template-folders)
    ├── Template name
    ├── Item count badge
    ├── Active session indicator (blue dot)
    └── Buttons: [Use List] [Edit Template] [View History]
```

### Template Editor View
```
TemplateEditor
├── Header (back button, template name)
├── Add Item Form
└── Category Groups (expandable)
    └── ItemRow
        ├── Drag handle
        ├── Item name (inline edit)
        ├── Category selector
        └── Delete button (soft delete)
```

### Shopping Session View
```
ShoppingSessionView
├── Header (back button, session name, finish button)
├── Zone 1: In Cart
│   └── CategoryGroup (expandable)
│       └── ItemRow
│           ├── [✓] Left checkbox (in cart)
│           ├── Item name
│           └── [☐] Right checkbox (purchased)
├── Zone 2: Completed
│   └── (Collapsed by default, expandable)
│       └── ItemRow (both checkboxes checked)
└── Zone 3: Template Inventory
    └── CategoryGroup (expandable)
        └── ItemRow
            ├── [☐] Left checkbox (add to cart)
            └── Item name
```

---

## Implementation Phases

### **Phase 1: Schema Migration** ✅

**Goal**: Define new schemas, update root structure

**Tasks**:
1. Create new schema file: `src/schemas/tree.ts`
   - Define FolderNode (organizational)
   - Define TemplateFolderNode (with items + sessions)
   - Define TemplateItem (clean template)
   - Define ShoppingSession
   - Define ItemState

2. Update `src/schemas/index.ts`
   - Remove old GroceryList, GroceryItem schemas
   - Update ListsRoot to use `nodes: co.list(FolderNode)`
   - Update GroceriesAccount migration

3. Copy PathPermissions from pin-maker if needed

**Files**:
- `src/schemas/tree.ts` (new)
- `src/schemas/index.ts` (update)

**Time estimate**: 2-3 hours

---

### **Phase 2: Tree View Components** 📋

**Goal**: Build hierarchical tree navigation

**Tasks**:
1. Create tree utilities (from pin-maker pattern):
   - `src/utils/treeHelpers.ts` - buildTreeStructure()
   - `src/utils/pathUtils.ts` - getParentPath(), createFullPath()

2. Create tree components:
   - `src/components/tree/TreeView.tsx` - Container
   - `src/components/tree/TreeNode.tsx` - Recursive folder node
   - `src/components/tree/TemplateRow.tsx` - Template folder row
   - `src/components/tree/EmptyState.tsx` - No templates yet

3. Replace `src/components/lists/ListsView.tsx` with tree view

4. Add actions:
   - Create folder
   - Create template folder
   - Delete folder/template
   - Rename (inline edit)

**Files**:
- `src/utils/treeHelpers.ts` (new)
- `src/utils/pathUtils.ts` (new)
- `src/components/tree/TreeView.tsx` (new)
- `src/components/tree/TreeNode.tsx` (new)
- `src/components/tree/TemplateRow.tsx` (new)
- `src/components/lists/ListsView.tsx` (replace content)

**Time estimate**: 4-6 hours

---

### **Phase 3: Template Editor** 📝

**Goal**: Manage items in template folders

**Tasks**:
1. Create template editor components:
   - `src/components/templates/TemplateEditor.tsx` - Main view
   - `src/components/templates/AddItemForm.tsx` - Add new item
   - `src/components/templates/TemplateItemRow.tsx` - Editable item row
   - `src/components/templates/CategorySection.tsx` - Grouped by category

2. Implement item operations:
   - Add item to template
   - Edit item name/category
   - Soft delete (set archived = true)
   - Reorder items (drag-drop optional)

3. Add routing: `/templates/:templateId/edit`

**Files**:
- `src/components/templates/TemplateEditor.tsx` (new)
- `src/components/templates/AddItemForm.tsx` (new)
- `src/components/templates/TemplateItemRow.tsx` (new)
- `src/components/templates/CategorySection.tsx` (new)
- `src/App.tsx` (add route)

**Time estimate**: 3-4 hours

---

### **Phase 4: Shopping Session** 🛒

**Goal**: Create and use shopping sessions

**Tasks**:
1. Session creation logic:
   - `src/utils/sessionHelpers.ts` - generateSessionName(), createSession()

2. Create shopping session components:
   - `src/components/sessions/ShoppingSessionView.tsx` - Main view
   - `src/components/sessions/SessionZone.tsx` - Zone container
   - `src/components/sessions/SessionItemRow.tsx` - Item with dual checkboxes
   - `src/components/sessions/CategoryGroup.tsx` - Expandable category

3. Implement three-zone logic:
   - Zone 1 (In Cart): inCart=true, purchased=false
   - Zone 2 (Completed): purchased=true
   - Zone 3 (Inventory): inCart=false

4. Implement dual-checkbox logic:
   - Left checkbox: Toggle inCart
   - Right checkbox: Toggle purchased (only in Zone 1)
   - Item floating between zones based on state

5. Add routing: `/sessions/:sessionId`

6. Update counts when state changes

**Files**:
- `src/utils/sessionHelpers.ts` (new)
- `src/components/sessions/ShoppingSessionView.tsx` (new)
- `src/components/sessions/SessionZone.tsx` (new)
- `src/components/sessions/SessionItemRow.tsx` (new)
- `src/components/sessions/CategoryGroup.tsx` (new)
- `src/App.tsx` (add route)

**Time estimate**: 5-7 hours

---

### **Phase 5: Session History** 📚

**Goal**: View and resume past shopping sessions

**Tasks**:
1. Create history components:
   - `src/components/sessions/SessionHistory.tsx` - Modal or panel
   - `src/components/sessions/SessionCard.tsx` - Session summary card

2. Implement history view:
   - List past sessions with dates
   - Show session stats (items purchased, etc.)
   - Click to view read-only session

3. Add "View History" button to TemplateRow

4. Read-only session view:
   - Same as shopping view but no editing
   - Show what was purchased and when

**Files**:
- `src/components/sessions/SessionHistory.tsx` (new)
- `src/components/sessions/SessionCard.tsx` (new)
- Update `src/components/tree/TemplateRow.tsx`

**Time estimate**: 2-3 hours

---

### **Phase 6: Sharing & Permissions** 🔒

**Goal**: Add folder-level sharing (pin-maker pattern)

**Tasks**:
1. Copy permission schemas from pin-maker:
   - PathPermissions
   - Sharing modes (private, shared, public)

2. Add sharing UI:
   - Share dialog/modal
   - Permission badges in tree
   - Inheritance from parent folders

3. Implement access control:
   - Check permissions before edit/delete
   - Show shared folders differently

**Files**:
- `src/schemas/permissions.ts` (new, from pin-maker)
- `src/components/sharing/ShareDialog.tsx` (new)
- Update tree components to show share status

**Time estimate**: 4-5 hours

---

## Migration Strategy

### Handling Existing Data

**Current Schema:**
```typescript
GroceryList {
  name: string
  items: GroceryItem[]
  archived: boolean
}

GroceryItem {
  name: string
  quantity?: string
  category: Category
  checked: boolean
  archived: boolean
  // ... timestamps, references
}
```

**Migration Plan:**

1. **On first load with new schema:**
   ```typescript
   function migrateOldListsToNewStructure(account: GroceriesAccount) {
     const oldRoot = account.root;

     if (oldRoot.myLists) {
       // Old structure detected
       oldRoot.myLists.forEach(oldList => {
         // Create template folder
         const templateFolder = TemplateFolderNode.create({
           name: oldList.name,
           type: "template-folder",
           path: nameToPath(oldList.name),
           expanded: false,
           items: [],
           sessions: [],
           owner: account,
           createdAt: new Date(),
           updatedAt: new Date(),
         });

         // Convert old items to template items
         oldList.items.forEach(oldItem => {
           if (!oldItem.archived) {
             const templateItem = TemplateItem.create({
               name: oldItem.name,
               category: oldItem.category,
               sortOrder: templateFolder.items.length,
               archived: false,
               addedBy: account,
               createdAt: oldItem.createdAt,
               updatedAt: oldItem.updatedAt,
             });
             templateFolder.items.$jazz.push(templateItem);
           }
         });

         // Add to new structure
         oldRoot.nodes.$jazz.push(templateFolder);
       });

       // Clear old lists
       oldRoot.myLists = [];
       oldRoot.sharedLists = [];
     }
   }
   ```

2. **Run migration in account migration hook:**
   ```typescript
   export const GroceriesAccount = co
     .account({
       root: ListsRoot,
       profile: co.profile(),
     })
     .withMigration((account) => {
       if (!account.$jazz.has('root')) {
         account.$jazz.set('root', { nodes: [] });
       } else {
         // Migrate old data if present
         migrateOldListsToNewStructure(account);
       }
     });
   ```

---

## Testing Checklist

### Phase 1: Schema
- [ ] New schemas compile without errors
- [ ] Account migration creates empty nodes array
- [ ] Old list data (if exists) is not lost

### Phase 2: Tree View
- [ ] Can create organizational folders
- [ ] Can create template folders
- [ ] Can nest folders hierarchically
- [ ] Template folders cannot have children (validation)
- [ ] Expand/collapse works
- [ ] Path-based hierarchy correct

### Phase 3: Template Editor
- [ ] Can add items to template
- [ ] Can edit item name/category
- [ ] Can soft delete items (archived = true)
- [ ] Archived items hidden in template view
- [ ] Items save properly

### Phase 4: Shopping Session
- [ ] "Use List" creates new session with date prefix
- [ ] If session exists today, adds time to name
- [ ] Three zones render correctly
- [ ] Left checkbox moves item to Zone 1 (cart)
- [ ] Right checkbox moves item to Zone 2 (completed)
- [ ] Unchecking left checkbox returns item to Zone 3
- [ ] Categories expand/collapse
- [ ] Counts update correctly
- [ ] "Finish Shopping" completes session

### Phase 5: Session History
- [ ] Can view past sessions
- [ ] Sessions display correct date/stats
- [ ] Can open read-only session view
- [ ] Active session shows in tree with indicator

### Phase 6: Sharing
- [ ] Can share folders
- [ ] Permissions inherited by children
- [ ] Share badges appear in tree
- [ ] Access control works

---

## File Cleanup

**Files to Remove:**
- `src/components/items/AddItemForm.tsx` (replaced)
- `src/components/items/ItemRow.tsx` (replaced)
- `src/components/lists/ListView.tsx` (replaced)

**Files to Keep (for reference until migration complete):**
- `src/schemas/index.ts` (update, keep categories)
- `src/components/Dashboard.tsx` (update routing)

---

## Key Implementation Notes

1. **Use Jazz Best Practices:**
   - Access IDs via `$jazz.id`, not `.id`
   - Mutate with `$jazz.set()`, not direct assignment
   - Use `undefined` for clearing optional CoValues, not `null`
   - Soft delete with `archived` flag, never hard delete

2. **Session Name Generation:**
   ```typescript
   function generateSessionName(templateName: string, existingSessions: ShoppingSession[]) {
     const today = new Date().toISOString().split('T')[0];
     const baseName = `[${today}]`;

     const todaySessions = existingSessions.filter(s => s.name.startsWith(baseName));

     if (todaySessions.length === 0) {
       return baseName;  // "[2025-01-15]"
     }

     const now = new Date();
     const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
     return `[${today} ${time}]`;  // "[2025-01-15 14:30]"
   }
   ```

3. **Item Floating Logic:**
   ```typescript
   function getItemZone(itemState: ItemState | undefined): 1 | 2 | 3 {
     if (!itemState || (!itemState.inCart && !itemState.purchased)) {
       return 3;  // Zone 3: Inventory
     }
     if (itemState.purchased) {
       return 2;  // Zone 2: Completed
     }
     if (itemState.inCart) {
       return 1;  // Zone 1: In Cart
     }
     return 3;
   }
   ```

4. **Soft Delete Pattern:**
   ```typescript
   // Never do this:
   templateFolder.items.splice(index, 1);  // ❌ Hard delete

   // Always do this:
   item.$jazz.set('archived', true);  // ✅ Soft delete
   item.$jazz.set('updatedAt', new Date());
   ```

---

## Success Criteria

✅ Users can organize templates in hierarchical folders
✅ Templates stay clean (no session state pollution)
✅ Shopping sessions track state separately by item ID
✅ Three-zone shopping view works smoothly
✅ Items float between zones based on checkbox state
✅ Sessions can be resumed from tree view
✅ Past shopping sessions viewable in history
✅ No orphaned data (soft delete prevents it)
✅ Folder-level sharing works like pin-maker
✅ Existing user data migrated successfully

---

## Estimated Total Time

- Phase 1 (Schema): 2-3 hours
- Phase 2 (Tree View): 4-6 hours
- Phase 3 (Template Editor): 3-4 hours
- Phase 4 (Shopping Session): 5-7 hours
- Phase 5 (Session History): 2-3 hours
- Phase 6 (Sharing): 4-5 hours

**Total: 20-28 hours** of focused development time

---

## Next Immediate Steps

1. ✅ Review this plan with user
2. Start Phase 1: Create new schema file
3. Test schema compilation
4. Begin Phase 2: Build tree view components

Ready to begin implementation!
