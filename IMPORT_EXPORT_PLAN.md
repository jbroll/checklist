# Import/Export Plan

## Overview

This document outlines the design and implementation plan for importing and exporting data in the Jazz-based grocery list application. Since Jazz.tools uses CoValues for data storage with automatic syncing, the import/export mechanism is entirely browser-based using file download/upload APIs.

## Design Decisions

### Key Principles

1. **Session History Included**: All nodes in the tree are serializable, so session history is included in exports/imports
2. **Conflict Resolution**: Always create new folders with suffix on conflicts (never overwrite)
3. **Sharing Excluded**: Sharing information is not automatically imported or exported
4. **Multiple Formats**:
   - JSON for full folder/tree exports
   - TXT/CSV for single template lists
   - CSV for session imports
5. **Browser-Based Only**: No server-side auto-export (all client-side operations)

---

## Export Formats

### 1. Full Export (JSON)

Complete folder structure with all template items and session history.

**Format:**
```json
{
  "version": "1.0",
  "exportDate": "2025-11-01T12:00:00Z",
  "appVersion": "0.1.0",
  "folders": [
    {
      "name": "Wegmans",
      "path": "grocery-stores/wegmans",
      "type": "template-folder",
      "items": [
        {
          "name": "Milk",
          "category": "dairy",
          "sortOrder": 0,
          "createdAt": "2025-10-01T10:00:00Z",
          "updatedAt": "2025-10-01T10:00:00Z"
        }
      ],
      "sessions": [
        {
          "name": "[2025-10-28]",
          "status": "completed",
          "itemStates": {
            "item-id-123": {
              "inCart": true,
              "purchased": true,
              "addedToCartAt": "2025-10-28T10:00:00Z",
              "purchasedAt": "2025-10-28T10:30:00Z"
            }
          },
          "startedAt": "2025-10-28T10:00:00Z",
          "lastActivityAt": "2025-10-28T10:30:00Z",
          "completedAt": "2025-10-28T10:30:00Z"
        }
      ],
      "createdAt": "2025-10-01T10:00:00Z",
      "updatedAt": "2025-10-28T10:30:00Z"
    }
  ]
}
```

**Scope Options:**
- Export all folders
- Export single folder

**Features:**
- Include all template items
- Include all sessions (active and completed)
- Exclude sharing information
- Pretty-printed JSON for readability

### 2. Template List Export (Plain Text)

Simple list of item names, one per line.

**Format:**
```
Milk
Bread
Eggs
Cheese
Apples
```

**Use Cases:**
- Quick sharing via messaging apps
- Copy/paste workflows
- Simple backups

### 3. Template List Export (CSV)

Structured item list with metadata.

**Format:**
```csv
name,category,sortOrder
Milk,dairy,0
Bread,bakery,1
Eggs,dairy,2
Cheese,dairy,3
Apples,produce,4
```

**Use Cases:**
- Import into spreadsheets
- Bulk editing
- Data analysis

### 4. Session Export (Plain Text)

Session items with checkmark indicators.

**Format:**
```
✓ Milk
✓ Bread
  Eggs
✓ Cheese
  Apples
```

**Legend:**
- `✓` = Purchased
- ` ` (space) = Not purchased

**Use Cases:**
- Sharing completed shopping trips
- Quick review of what was purchased

### 5. Session Export (CSV)

Session with full state information.

**Format:**
```csv
name,category,inCart,purchased,addedToCartAt,purchasedAt
Milk,dairy,true,true,2025-11-01T10:00:00Z,2025-11-01T10:30:00Z
Bread,bakery,true,false,2025-11-01T10:05:00Z,
Eggs,dairy,false,false,,
Cheese,dairy,true,true,2025-11-01T10:10:00Z,2025-11-01T10:35:00Z
```

**Use Cases:**
- Re-importing sessions
- Analyzing shopping patterns
- Detailed records

---

## Import Formats

### 1. Full Import (JSON)

Import complete folder structure with sessions.

**Conflict Resolution:**
When a folder path already exists:
1. Append suffix to folder name: `" (imported)"`
2. Append to path: `"/imported"`
3. If still conflicts, add timestamp: `" (imported 2025-11-01 12:00)"`

**Example:**
```
Existing: path = "grocery-stores/wegmans"
          name = "Wegmans"

Import:   path = "grocery-stores/wegmans"
          name = "Wegmans"

Result:   path = "grocery-stores/wegmans/imported"
          name = "Wegmans (imported)"
```

**Features:**
- Validates JSON schema
- Checks version compatibility
- Creates all folders and items
- Restores session history
- Never overwrites existing data

### 2. Template List Import (TXT)

Import plain text list into existing template folder.

**Format:**
```
Milk
Bread
Eggs
```

**Behavior:**
- One item per line
- Auto-categorizes based on item name
- Assigns sequential sortOrder
- Skips duplicate items (by name)
- Adds only new items

### 3. Template List Import (CSV)

Import structured item list into existing template folder.

**Minimal Format:**
```csv
name
Milk
Bread
Eggs
```

**Full Format:**
```csv
name,category,sortOrder
Milk,dairy,0
Bread,bakery,1
Eggs,dairy,2
```

**Behavior:**
- Headers optional (auto-detected)
- Auto-categorizes if category not provided
- Auto-assigns sortOrder if not provided
- Skips duplicates by name
- Validates categories (maps invalid to "other")

### 4. Session Import (CSV)

Import session data into existing template folder.

**Minimal Format:**
```csv
name,inCart,purchased
Milk,true,true
Bread,true,false
Eggs,false,false
```

**Full Format:**
```csv
name,category,inCart,purchased,addedToCartAt,purchasedAt
Milk,dairy,true,true,2025-11-01T10:00:00Z,2025-11-01T10:30:00Z
Bread,bakery,true,false,2025-11-01T10:05:00Z,
Eggs,dairy,false,false,,
```

**Behavior:**
1. **Match Items by Name**: Find corresponding TemplateItem (case-insensitive)
2. **Handle Unmatched Items**:
   - Option 1: Skip items not in template (default)
   - Option 2: Add missing items to template first
3. **Create Session**:
   - User specifies session name (default: `[YYYY-MM-DD]`)
   - Creates ItemState for each matched item
   - Sets inCart/purchased status
   - Preserves timestamps if provided
4. **Session Status**:
   - `completed` if all items purchased
   - `active` otherwise

---

## User Interface

### Main Menu - Export/Import

```
┌─────────────────────────────────────┐
│  [⋮] More Actions                   │
├─────────────────────────────────────┤
│  📤 Export                          │
│    → Export all folders (JSON)     │
│    → Export selected folder (JSON) │
│  📥 Import                          │
│    → Import folders (JSON)         │
└─────────────────────────────────────┘
```

### Template Folder Context Menu

```
┌─────────────────────────────────────┐
│  [⋮] Wegmans                        │
├─────────────────────────────────────┤
│  📤 Export                          │
│    → Export folder (JSON)          │
│    → Export item list (TXT)        │
│    → Export item list (CSV)        │
│  📥 Import                          │
│    → Import items from TXT/CSV     │
│    → Import session from CSV       │
└─────────────────────────────────────┘
```

### Session Context Menu

```
┌─────────────────────────────────────┐
│  [⋮] [2025-10-28]                   │
├─────────────────────────────────────┤
│  📤 Export                          │
│    → Export session (TXT)          │
│    → Export session (CSV)          │
└─────────────────────────────────────┘
```

### Export Dialog - Full Export

```
┌─────────────────────────────────────┐
│  Export Grocery Data                │
├─────────────────────────────────────┤
│                                     │
│  Export scope:                      │
│  ○ All folders                     │
│  ○ Selected folder:                │
│     [Dropdown: Wegmans ▼]          │
│                                     │
│  ✓ Include all sessions            │
│  ✓ Include all items               │
│                                     │
│  Format: JSON                       │
│                                     │
│  [Cancel]  [Export & Download]     │
└─────────────────────────────────────┘
```

### Import Dialog - Full Import (JSON)

```
┌─────────────────────────────────────┐
│  Import Grocery Data (JSON)         │
├─────────────────────────────────────┤
│                                     │
│  📁 Drop JSON file here or          │
│     [Browse Files]                  │
│                                     │
│  ─── After file selected ───       │
│                                     │
│  ✓ Valid JSON format               │
│  ✓ Version 1.0 compatible          │
│                                     │
│  Preview:                           │
│  • 3 folders                       │
│  • 45 items                        │
│  • 12 sessions                     │
│                                     │
│  Conflicts:                         │
│  ⚠ 2 folders exist                 │
│     → Will create as "(imported)"  │
│                                     │
│  [Cancel]  [Import]                │
└─────────────────────────────────────┘
```

### Import Dialog - Template Items (TXT/CSV)

```
┌─────────────────────────────────────┐
│  Import Items to: Wegmans           │
├─────────────────────────────────────┤
│                                     │
│  📁 Drop TXT or CSV file or         │
│     [Browse Files]                  │
│                                     │
│  ─── After file selected ───       │
│                                     │
│  Preview (10 items):                │
│  • Milk → dairy                    │
│  • Bread → bakery                  │
│  • Eggs → dairy                    │
│  • Cheese → dairy                  │
│  • Apples → produce                │
│  ... 5 more                        │
│                                     │
│  ⚠ 2 items already exist:          │
│  • Milk (will skip)                │
│  • Bread (will skip)               │
│                                     │
│  [Cancel]  [Import 8 new items]    │
└─────────────────────────────────────┘
```

### Import Dialog - Session (CSV)

```
┌─────────────────────────────────────┐
│  Import Session to: Wegmans         │
├─────────────────────────────────────┤
│                                     │
│  📁 Drop CSV file or                │
│     [Browse Files]                  │
│                                     │
│  ─── After file selected ───       │
│                                     │
│  Session name:                      │
│  [2025-11-01 Shopping    ]         │
│                                     │
│  Preview (10 items):                │
│  • Milk (dairy)                    │
│    ✓ In cart  ✓ Purchased         │
│  • Bread (bakery)                  │
│    ✓ In cart  ✗ Not purchased     │
│  • Eggs (dairy)                    │
│    ✗ Not in cart                   │
│  ... 7 more                        │
│                                     │
│  Matching:                          │
│  ✓ 8 items matched by name         │
│  ⚠ 2 items not in template:        │
│    • Bananas → will be added       │
│    • Oranges → will be added       │
│                                     │
│  ☐ Add missing items to template   │
│                                     │
│  [Cancel]  [Import Session]        │
└─────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: JSON Export/Import (Full Data)

**Priority: High** - Core functionality for complete backups

**Tasks:**
1. Create TypeScript interfaces for export data structure
2. Implement `ExportService.exportAllFolders()`
3. Implement `ExportService.exportFolder()`
4. Implement file download helper
5. Create `ExportDialog` component
6. Implement `ImportService.validateJSON()`
7. Implement `ImportService.importJSON()`
8. Implement conflict resolution logic
9. Create `ImportDialog` component with drag & drop
10. Add export/import options to main menu
11. Add export option to folder context menu
12. Write unit tests for export/import logic

**Deliverables:**
- Full folder export to JSON
- Full folder import from JSON
- Automatic conflict resolution with "(imported)" suffix
- Validation and error handling
- UI dialogs for export/import

### Phase 2: Template List Export/Import

**Priority: Medium** - Useful for quick data entry

**Tasks:**
1. Implement `ExportService.exportTemplateItemsTxt()`
2. Implement `ExportService.exportTemplateItemsCsv()`
3. Implement `ImportService.importItemsTxt()`
4. Implement `ImportService.importItemsCsv()`
5. Implement CSV parsing utility
6. Implement duplicate detection logic
7. Create template import dialog
8. Add import/export options to template folder context menu
9. Write unit tests for TXT/CSV parsing

**Deliverables:**
- Export template items to TXT/CSV
- Import items from TXT/CSV
- Auto-categorization
- Duplicate detection and skipping

### Phase 3: Session Export/Import

**Priority: Low** - Advanced feature for power users

**Tasks:**
1. Implement `ExportService.exportSessionTxt()`
2. Implement `ExportService.exportSessionCsv()`
3. Implement `ImportService.importSessionCsv()`
4. Implement item matching logic (by name)
5. Implement session creation from imported data
6. Create session import dialog
7. Add export options to session context menu
8. Write unit tests for session import

**Deliverables:**
- Export session to TXT/CSV
- Import session from CSV
- Item matching by name
- Option to add missing items to template

---

## Technical Implementation

### File Structure

```
src/
  services/
    export/
      exportService.ts          # Main export orchestration
      jsonExporter.ts           # JSON export logic
      txtExporter.ts            # Plain text export logic
      csvExporter.ts            # CSV export logic
      types.ts                  # TypeScript interfaces for export data
    import/
      importService.ts          # Main import orchestration
      jsonImporter.ts           # JSON import logic
      txtImporter.ts            # Plain text import logic
      csvImporter.ts            # CSV import logic
      validators.ts             # Validation logic
      types.ts                  # TypeScript interfaces for import
  components/
    export/
      ExportDialog.tsx          # Main export UI
      ExportButton.tsx          # Trigger button
      ExportOptionsForm.tsx     # Export configuration
    import/
      ImportDialog.tsx          # Main import UI
      ImportButton.tsx          # Trigger button
      FileUploader.tsx          # Drag & drop component
      ImportPreview.tsx         # Preview before import
  types/
    exportImport.ts             # Shared TypeScript interfaces
  utils/
    fileDownload.ts             # Browser download helper
    fileUpload.ts               # Browser upload helper
    csvParser.ts                # CSV parsing utility
```

### Core Interfaces

```typescript
// Export Data Structure
interface ExportedData {
  version: string;              // "1.0"
  exportDate: string;           // ISO 8601 timestamp
  appVersion: string;           // App version (e.g., "0.1.0")
  folders: ExportedFolder[];
}

interface ExportedFolder {
  name: string;
  path: string;
  type: "folder" | "template-folder";
  items?: ExportedTemplateItem[];
  sessions?: ExportedSession[];
  currentSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExportedTemplateItem {
  name: string;
  category: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ExportedSession {
  name: string;
  status: "active" | "completed" | "abandoned";
  itemStates: Record<string, ExportedItemState>;
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string;
}

interface ExportedItemState {
  inCart: boolean;
  purchased: boolean;
  addedToCartAt?: string;
  purchasedAt?: string;
}

// Import Result
interface ImportResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    foldersCreated?: number;
    itemsAdded?: number;
    itemsSkipped?: number;
    sessionsCreated?: number;
    itemsMatched?: number;
  };
  data?: {
    folderIds?: string[];
    sessionId?: string;
    addedItemIds?: string[];
  };
}

// Validation Result
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalFolders?: number;
    totalItems?: number;
    totalSessions?: number;
    duplicateFolders?: number;
    duplicateItems?: number;
  };
}
```

### ExportService API

```typescript
export class ExportService {
  // JSON exports
  exportAllFolders(account: GroceriesAccount): ExportedData;
  exportFolder(folder: FolderNode): ExportedData;

  // Template list exports
  exportTemplateItemsTxt(folder: FolderNode): string;
  exportTemplateItemsCsv(folder: FolderNode): string;

  // Session exports
  exportSessionTxt(
    session: ShoppingSession,
    items: TemplateItem[]
  ): string;

  exportSessionCsv(
    session: ShoppingSession,
    items: TemplateItem[]
  ): string;

  // Download helper
  downloadFile(
    content: string,
    filename: string,
    mimeType: string
  ): void;
}
```

### ImportService API

```typescript
export class ImportService {
  // JSON import
  importJSON(
    file: File,
    account: GroceriesAccount
  ): Promise<ImportResult>;

  // Template list imports
  importItemsTxt(
    file: File,
    folder: FolderNode,
    account: GroceriesAccount
  ): Promise<ImportResult>;

  importItemsCsv(
    file: File,
    folder: FolderNode,
    account: GroceriesAccount
  ): Promise<ImportResult>;

  // Session import
  importSessionCsv(
    file: File,
    folder: FolderNode,
    account: GroceriesAccount,
    options: {
      sessionName?: string;
      addMissingItems?: boolean;
    }
  ): Promise<ImportResult>;

  // Validation
  validateJSON(data: unknown): ValidationResult;
  validateTxt(content: string): ValidationResult;
  validateCsv(content: string): ValidationResult;

  // Conflict resolution
  resolvePathConflict(
    path: string,
    existingFolders: FolderNode[]
  ): string;

  // Item matching (for session import)
  matchItemByName(
    itemName: string,
    templateItems: TemplateItem[]
  ): TemplateItem | null;
}
```

### Browser APIs Used

**File Download (Export):**
```typescript
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

**File Upload (Import):**
```typescript
// Drag & drop
function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  processFile(file);
}

// File picker
function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (file) processFile(file);
}

// Read file
async function processFile(file: File) {
  const content = await file.text();
  // Parse and import...
}
```

---

## Jazz-Specific Considerations

### Creating CoValues from Import

```typescript
// Example: Import folder with items
const importedFolder = FolderNode.create({
  name: data.name,
  path: resolvedPath, // After conflict resolution
  type: 'template-folder',
  expanded: false,
  items: co.list(
    data.items?.map(itemData =>
      TemplateItem.create({
        name: itemData.name,
        category: itemData.category,
        sortOrder: itemData.sortOrder,
        archived: false,
        addedBy: me,
        createdAt: new Date(itemData.createdAt),
        updatedAt: new Date(itemData.updatedAt),
      }, { owner: me })
    ) || []
  ),
  sessions: co.list(
    data.sessions?.map(sessionData =>
      ShoppingSession.create({
        name: sessionData.name,
        templateFolderId: '', // Will be set after folder creation
        itemStates: co.record(/* ... */),
        status: sessionData.status,
        categoryExpanded: co.record({}),
        inCartCount: 0, // Recalculated
        completedCount: 0, // Recalculated
        remainingCount: 0, // Recalculated
        owner: me,
        startedAt: new Date(sessionData.startedAt),
        lastActivityAt: new Date(sessionData.lastActivityAt),
        completedAt: sessionData.completedAt
          ? new Date(sessionData.completedAt)
          : undefined,
      }, { owner: me })
    ) || []
  ),
  owner: me,
  createdAt: new Date(),
  updatedAt: new Date(),
}, { owner: me });

// Add to root
me.root.nodes.push(importedFolder);
```

### Exporting CoValues to JSON

```typescript
function exportFolder(folder: FolderNode): ExportedData {
  return {
    version: "1.0",
    exportDate: new Date().toISOString(),
    appVersion: "0.1.0",
    folders: [{
      name: folder.name,
      path: folder.path,
      type: folder.type,
      items: folder.type === 'template-folder'
        ? folder.items?.map(item => ({
            name: item.name,
            category: item.category,
            sortOrder: item.sortOrder,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          }))
        : undefined,
      sessions: folder.type === 'template-folder'
        ? folder.sessions?.map(session => ({
            name: session.name,
            status: session.status,
            itemStates: Object.fromEntries(
              Object.entries(session.itemStates).map(([id, state]) => [
                id,
                {
                  inCart: state.inCart,
                  purchased: state.purchased,
                  addedToCartAt: state.addedToCartAt?.toISOString(),
                  purchasedAt: state.purchasedAt?.toISOString(),
                }
              ])
            ),
            startedAt: session.startedAt.toISOString(),
            lastActivityAt: session.lastActivityAt.toISOString(),
            completedAt: session.completedAt?.toISOString(),
          }))
        : undefined,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    }],
  };
}
```

---

## Security & Privacy

Since all operations are client-side:

1. **No Server Storage**: Export data never leaves the user's device except by explicit download
2. **Local Processing**: All imports processed entirely in browser
3. **Jazz Sync**: Persistence handled by Jazz's built-in sync mechanism
4. **File Size**: Practical limit of ~10MB (thousands of items) for JSON files
5. **No Credentials**: Exported data contains no authentication tokens or credentials
6. **Sharing Excluded**: Sharing/collaboration metadata explicitly excluded from export

---

## Testing Strategy

### Unit Tests

- Export service methods
- Import service methods
- Validation logic
- CSV parsing
- Conflict resolution
- Item matching

### Integration Tests

- Full export/import workflow
- Multiple format conversions
- Error handling and recovery
- Edge cases (empty data, malformed files)

### E2E Tests

- User exports data
- User imports data in new account
- Verify data integrity
- Test all UI dialogs

---

## Future Enhancements

Potential features for future iterations:

1. **Compression**: Gzip compression for large exports
2. **Selective Export**: Choose specific sessions to export
3. **Batch Import**: Import multiple files at once
4. **Import Mapping**: Map categories during import
5. **Export Templates**: Save export configurations
6. **Cloud Backup**: Optional cloud storage integration
7. **Scheduled Exports**: Browser extension for periodic backups
8. **Import from External Sources**:
   - Google Keep
   - Apple Reminders
   - AnyList
   - Out of Milk
9. **Smart Merging**: Intelligent duplicate detection and merging
10. **Version Migration**: Automatic upgrades for older export formats

---

## Questions & Decisions

### Resolved

✅ **Include session history?** Yes - all serializable data included
✅ **Conflict resolution?** Create new folders with "(imported)" suffix
✅ **Include sharing data?** No - excluded from export/import
✅ **Support TXT/CSV?** Yes - for template lists and sessions
✅ **Auto-export?** No - browser-based only
✅ **Session import from template menu?** Yes - added to design

### Open Questions

None at this time.

---

## Timeline Estimate

- **Phase 1** (JSON Export/Import): 2-3 days
- **Phase 2** (Template List): 1-2 days
- **Phase 3** (Session Export/Import): 1-2 days
- **Testing & Polish**: 1 day

**Total**: ~5-8 days of development

---

## Related Documentation

- `README.md` - Project overview
- `CLAUDE.md` - Development guide
- `PROJECT_STATUS.md` - Current implementation status
- Jazz.tools documentation: https://jazz.tools/docs
