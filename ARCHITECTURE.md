# System Architecture

A collaborative grocery list application built with Jazz.tools and BetterAuth.

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
2. **Hierarchical Items**: Templates use a category/item tree structure (see `src/schemas/tree.ts:26-49`)
3. **Path-Based Organization**: Folders and items use path strings for hierarchy (e.g., "grocery-stores/wegmans")
4. **Soft Deletes**: Items marked `archived: true`, never hard deleted
5. **Jazz CoValues**: Real-time sync, offline-first, end-to-end encrypted

## Data Model

**Schemas** (see `src/schemas/`):
- `FolderNode` - Organizational folder or template folder (`tree.ts:151-177`)
- `TemplateItem` - Hierarchical category or item (`tree.ts:26-49`)
- `ShoppingSession` - Shopping trip state tracker (`tree.ts:78-110`)
- `ItemState` - Per-item shopping state (`tree.ts:56-71`)
- `GroceriesAccount` - User account with root folder list (`index.ts:19-31`)

**Discriminated Unions**:
- FolderNode has `type: "folder" | "template-folder"`
- TemplateItem has `type: "category" | "item"`

## UI Components

**Tree Navigation** (`src/components/tree/`):
- `TreeView.tsx` - Main folder tree
- `FolderNodeView.tsx` - Folder/template row
- `SessionRowView.tsx` - Session list item

**Template Editor** (`src/components/editor/`):
- `TemplateEditor.tsx` - Manage template items
- `TemplateItemsView.tsx` - Item list with hierarchy

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
│   ├── import/           # Import dialogs
│   └── export/           # Export dialogs
├── services/
│   ├── folderService.ts  # Folder operations
│   ├── import/           # Import logic
│   └── export/           # Export logic
└── lib/
    ├── auth-client.ts    # BetterAuth config
    └── jazz.tsx          # Jazz provider
```

## Development Workflow

See `AUTONOMOUS_EXECUTION_PLAN.md` for quality gates and commit workflow.
See `CLAUDE.md` for Jazz-specific patterns and coding standards.
