# CheckList Beta Blockers (items 4-7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four non-migration blockers identified for the `checklist-test.rkroll.com` beta: eliminate duplicate default-folder seeding on new-device login, make the JSON export/import a complete round-trip backup, clean up all lint warnings, and refresh the Capacitor mobile bundle.

**Architecture:** Keep changes inside the CheckList repo. Stop seeding default content for anonymous users (the anon store is transient and gets claimed). Bump the JSON export format to `2.1` with full folder-tree, archived-folder, item/session notes, per-folder settings, `default_items`, session ids, and `user_settings` preservation; keep `2.0` importable. Fix the 11 existing Biome warnings without changing test semantics. Regenerate mobile assets with the standard Capacitor sync command.

**Tech Stack:** React 18/19 + TypeScript + Vite, rowboat relational graph, Biome, Vitest, Capacitor 8.

## Global Constraints

- Billing stays unmounted and free during beta test; do not touch `backend/src/billing/routes.ts` or payment flows.
- Target environment is `checklist-test.rkroll.com`; do not provision prod or edit `deploy.conf`.
- Schema changes to `shared/schema.ts` are out of scope for this plan; use existing columns only.
- JSON export must remain importable by `importJson` and `importItemsFromJson`; keep backward compatibility with `2.0` inputs.
- All changes must pass `npm run type-check`, `npm run lint`, and `npm run test:run`.
- Follow the existing rowboat patterns: field-level writes, no whole-list rewrites, soft deletes via `archived`.

---

### Task 1: Stop anonymous default-folder seeding

**Files:**
- Modify: `src/services/defaultData.ts:79-91`
- Modify: `src/lib/rowboat.tsx:234`
- Test: `src/services/__tests__/defaultData.test.ts`

**Interfaces:**
- Consumes: `seedDefaultFolders(g, ownerGroupId, createdBy, isAnonymous?)` from existing call sites.
- Produces: `seedDefaultFolders` returns early when `isAnonymous` is `true`.

- [ ] **Step 1: Add the anonymous guard parameter to `seedDefaultFolders`**

Modify `src/services/defaultData.ts` so the function accepts an optional `isAnonymous` flag and is a no-op for anonymous users. Update the JSDoc to explain why.

```typescript
/**
 * Seed the default "Quick Errands" list for a brand-new user. No-op if any folder already exists
 * (a cheap second guard; the caller gates on the user being new). One write — never overwrites.
 * Anonymous users never get seeded content: their store is transient and would be claimed into
 * the signed-in account, producing a duplicate "Quick Errands" on every new device login.
 */
export async function seedDefaultFolders(
  g: Graph,
  ownerGroupId: string,
  createdBy: string,
  isAnonymous = false,
): Promise<void> {
  if (isAnonymous) return;
  if (g.folder.all().length > 0) return;
  const folder = buildQuickErrandsFolder(crypto.randomUUID(), ownerGroupId, createdBy, Date.now());
  await g.folder.create({
    ...folder,
    items: toOrderedMap(folder.items),
    sessions: {},
  } as unknown as RawFolderRow);
}
```

- [ ] **Step 2: Pass the anonymous flag from `RowboatBridge`**

In `src/lib/rowboat.tsx`, change the call at line 234 to pass `!author`.

```typescript
if (existingFolders.length === 0) {
  await seedDefaultFolders(graph, await mintGroup(), identity, !author);
}
```

- [ ] **Step 3: Write a failing test for the anonymous guard**

Add a test in `src/services/__tests__/defaultData.test.ts`.

```typescript
it('seedDefaultFolders does not create a folder for anonymous users', async () => {
  const g = makeGraph();
  expect(g.folder.all()).toHaveLength(0);

  await seedDefaultFolders(g, 'g1', 'anon', true);

  expect(g.folder.all()).toHaveLength(0);
});
```

Run: `npx vitest run src/services/__tests__/defaultData.test.ts`
Expected: FAIL if the guard is not yet implemented; PASS once the guard is in place.

- [ ] **Step 4: Run the full test suite for affected files**

Run: `npx vitest run src/services/__tests__/defaultData.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/defaultData.ts src/lib/rowboat.tsx src/services/__tests__/defaultData.test.ts
git commit -m "fix(defaults): do not seed Quick Errands for anonymous users"
```

---

### Task 2: Extend JSON export types and exporter to v2.1

**Files:**
- Modify: `src/services/export/types.ts`
- Modify: `src/services/export/jsonExporter.ts`
- Modify: `src/services/export/exportService.ts` (only if it references the version constant)
- Test: `src/services/export/jsonExporter.test.ts`

**Interfaces:**
- Consumes: `FolderRow`, `TemplateItem`, `SessionData`, `ItemState`, `UserSettingsRow` shapes.
- Produces: `ExportedData` with `version: '2.1'`, `ExportedUserSettings`, and extended `ExportedFolder`/`ExportedTemplateItem`/`ExportedSession`/`ExportedItemState` types.

- [ ] **Step 1: Extend the type definitions in `src/services/export/types.ts`**

Replace the current definitions with the v2.1 shapes. Keep `version` as a literal `'2.1'` in the type (tests will be updated to match).

```typescript
export interface ExportedData {
  version: '2.1';
  exportDate: string;
  appVersion: string;
  userSettings?: ExportedUserSettings;
  folders: ExportedFolder[];
}

export interface ExportedUserSettings {
  defaultAutocompleteDomain: string;
  enableAutoCategorization: boolean;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  subscriptionEndsAt?: string;
  maxLists?: number;
  sessionRetentionDays?: number;
  viewFolderExpanded: Record<string, boolean>;
  viewTemplateCategoryExpanded: Record<string, Record<string, boolean>>;
  viewSessionCategoryExpanded: Record<string, Record<string, boolean>>;
}

export interface ExportedFolder {
  id: string;
  name: string;
  type: 'folder' | 'template-folder';
  parentId: string | null;
  archived: boolean;
  expanded: boolean;
  items?: ExportedTemplateItem[];
  sessions?: ExportedSession[];
  currentSessionId?: string;
  createdAt: string;
  updatedAt: string;
  defaultItems: Record<string, boolean>;
  showZoneHeadings: boolean;
  autoCategorizeEnabled: boolean;
  autocompleteDomain: string;
}

export interface ExportedTemplateItem {
  id: string;
  name: string;
  type: 'category' | 'item';
  children?: ExportedTemplateItem[];
  expanded?: boolean;
  sortOrder: number;
  defaultQuantity?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedSession {
  id: string;
  name: string;
  archived: boolean;
  viewMode: 'zone-in-hierarchy' | 'flat';
  itemStates: Record<string, ExportedItemState>;
  createdAt: string;
  lastActivityAt: string;
}

export interface ExportedItemState {
  selected: boolean;
  checked: boolean;
  selectedAt?: string;
  checkedAt?: string;
  notes?: string;
}
```

- [ ] **Step 2: Update `jsonExporter.ts` to emit v2.1**

Changes:
- Export all folders (including organizational folders and archived subtrees).
- Include `id`, `parentId`, `archived`, `expanded`, `defaultItems`, `showZoneHeadings`, `autoCategorizeEnabled`, `autocompleteDomain` on folders.
- Include `notes` on items.
- Include `id` and `notes` in sessions / item states.
- Add `exportUserSettings(g)` helper.
- Bump version to `'2.1'`.

Key code changes in `src/services/export/jsonExporter.ts`:

```typescript
import type { UserSettingsRow } from '../../../shared/schema.js';

function exportUserSettings(g: Graph): ExportedUserSettings | undefined {
  const row = g.user_settings.all()[0]?.$data as UserSettingsRow | undefined;
  if (!row) return undefined;
  return {
    defaultAutocompleteDomain: row.default_autocomplete_domain,
    enableAutoCategorization: row.enable_auto_categorization,
    ...(row.subscription_tier ? { subscriptionTier: row.subscription_tier } : {}),
    ...(row.subscription_status ? { subscriptionStatus: row.subscription_status } : {}),
    ...(row.subscription_ends_at ? { subscriptionEndsAt: new Date(row.subscription_ends_at).toISOString() } : {}),
    ...(row.max_lists !== undefined ? { maxLists: row.max_lists } : {}),
    ...(row.session_retention_days !== undefined ? { sessionRetentionDays: row.session_retention_days } : {}),
    viewFolderExpanded: row.view_folder_expanded,
    viewTemplateCategoryExpanded: row.view_template_category_expanded,
    viewSessionCategoryExpanded: row.view_session_category_expanded,
  };
}

function collectFolders(g: Graph): FolderRow[] {
  return g.folder.all().map((node) => parseFolderRow(node.$data));
}

function exportTemplateFolder(folder: FolderRow): ExportedFolder {
  return {
    id: folder.id,
    name: folder.name,
    type: folder.type as 'folder' | 'template-folder',
    parentId: folder.parent_id,
    archived: folder.archived,
    expanded: folder.expanded,
    ...(isTemplateFolder(folder) ? {
      items: exportTemplateItems(folder.items),
      sessions: exportSessions(folder.sessions),
    } : {}),
    createdAt: new Date(folder.created_at).toISOString(),
    updatedAt: new Date(folder.updated_at).toISOString(),
    defaultItems: folder.default_items,
    showZoneHeadings: folder.show_zone_headings,
    autoCategorizeEnabled: folder.auto_categorize_enabled,
    autocompleteDomain: folder.autocomplete_domain,
  };
}

function convertTreeNodeToExport(node: ItemTreeNode<DatedItem>): ExportedTemplateItem {
  const { item, children } = node;
  const exportedItem: ExportedTemplateItem = {
    id: item.id,
    name: item.name,
    type: item.type,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.createdAt.toISOString(),
  };
  if (item.expanded) exportedItem.expanded = item.expanded;
  if (item.defaultQuantity) exportedItem.defaultQuantity = item.defaultQuantity;
  if (item.notes) exportedItem.notes = item.notes;
  if (item.type === 'category' && children.length > 0) {
    exportedItem.children = children.map((child) => convertTreeNodeToExport(child));
  }
  return exportedItem;
}

function exportSessions(sessions: SessionData[]): ExportedSession[] {
  const datedSessions = sessions.map(toDatedSession);
  return datedSessions.map((session) => {
    const itemStates: Record<string, ExportedItemState> = {};
    for (const [itemId, state] of Object.entries(session.itemStates)) {
      const exportedState: ExportedItemState = {
        selected: state.selected,
        checked: state.checked,
      };
      if (state.selectedAt) exportedState.selectedAt = state.selectedAt.toISOString();
      if (state.checkedAt) exportedState.checkedAt = state.checkedAt.toISOString();
      if (state.notes) exportedState.notes = state.notes;
      itemStates[itemId] = exportedState;
    }
    return {
      id: session.id,
      name: generateSessionName(session.createdAt, datedSessions),
      archived: session.archived,
      viewMode: session.viewMode,
      itemStates,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    };
  });
}

export function exportAllFolders(g: Graph): ExportedData {
  return {
    version: '2.1',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    userSettings: exportUserSettings(g),
    folders: collectFolders(g).map(exportTemplateFolder),
  };
}

export function exportTemplate(folder: FolderRow): ExportedData {
  return {
    version: '2.1',
    exportDate: new Date().toISOString(),
    appVersion: packageJson.version,
    folders: [exportTemplateFolder(folder)],
  };
}
```

- [ ] **Step 3: Update `jsonExporter.test.ts` expectations to v2.1**

Update all `version: '2.0'` literals to `'2.1'`, add assertions for the new fields, and update tests that expect archived folders to be skipped (they should now be exported). Add a test for the full folder tree including an organizational parent.

Run: `npx vitest run src/services/export/jsonExporter.test.ts`
Expected: FAIL until the exporter changes land; PASS after.

- [ ] **Step 4: Run the export tests**

Run: `npx vitest run src/services/export/jsonExporter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/export/types.ts src/services/export/jsonExporter.ts src/services/export/jsonExporter.test.ts
git commit -m "feat(export): v2.1 JSON export preserves folder tree, settings, notes and ids"
```

---

### Task 3: Update JSON import for v2.1 round-trip

**Files:**
- Modify: `src/services/import/types.ts` (add `userSettingsImported` to `ImportResult` if needed)
- Modify: `src/services/import/validators.ts`
- Modify: `src/services/import/jsonImporter.ts`
- Test: `src/services/import/jsonImporter.test.ts`
- Test: add round-trip test to `src/services/export/exportService.test.ts` or `src/services/import/jsonImporter.test.ts`

**Interfaces:**
- Consumes: v2.1 `ExportedData` from Task 2.
- Produces: `ImportResult` extended with `userSettingsImported?: boolean`; imported folders preserve hierarchy, archived state, item/session notes, `default_items`, per-folder settings, and restore `user_settings`.

- [ ] **Step 1: Extend `ImportResult` in `src/services/import/types.ts`**

```typescript
export interface ImportResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    foldersCreated?: number;
    itemsAdded?: number;
    sessionsCreated?: number;
    userSettingsImported?: boolean;
  };
  data?: {
    folderIds: string[];
  };
}
```

If `ImportResult` is defined elsewhere, update that file instead.

- [ ] **Step 2: Update validators to accept v2.1 fields**

In `src/services/import/validators.ts`:
- Add `'2.1'` to `CURRENT_VERSION` and `SUPPORTED_VERSIONS`.
- Validate new optional fields (`id`, `parentId`, `archived`, `expanded`, `defaultItems`, `showZoneHeadings`, `autoCategorizeEnabled`, `autocompleteDomain`, `notes`, session `id`, `userSettings`).

```typescript
const CURRENT_VERSION = '2.1';
const SUPPORTED_VERSIONS = ['2.0', '2.1'];
```

Keep existing required-field checks; only add optional-field type checks.

- [ ] **Step 3: Rewrite `importFolders` to rebuild the folder tree**

In `src/services/import/jsonImporter.ts`:
- Build a map from exported folder id to exported folder.
- Sort / recurse so parents are created before children.
- Track `exportedId -> newFolderId` and `exportedItemId -> newItemId` per folder.
- After items are created, remap `defaultItems` to new ids and update the folder.
- Preserve `archived`, `expanded`, `showZoneHeadings`, `autoCategorizeEnabled`, `autocompleteDomain`.
- Restore `userSettings` if present.

A concise implementation sketch:

```typescript
import { ensureUserSettings } from '../subscriptionService';
import type { UserSettingsRow } from '../../../shared/schema.js';

async function importFolders(
  g: Graph,
  data: ExportedData,
  ctx: JsonImportContext,
): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const folderIds: string[] = [];
  let foldersCreated = 0;
  let itemsAdded = 0;
  let sessionsCreated = 0;

  const folderMap = new Map(data.folders.map((f) => [f.id, f]));
  const newIdMap = new Map<string, string>(); // exported folder id -> new folder id

  async function importFolder(exported: ExportedFolder, parentNewId: string | null): Promise<void> {
    try {
      const siblingNames = new Set(
        folderOps.childrenOf(g, parentNewId).map((f) => f.name),
      );
      let finalName = exported.name;
      if (siblingNames.has(finalName)) {
        let counter = 1;
        while (siblingNames.has(`${exported.name} (${counter})`)) counter++;
        finalName = `${exported.name} (${counter})`;
        warnings.push(`Template "${exported.name}" imported as "${finalName}" due to name conflict`);
      }
      siblingNames.add(finalName);

      const ownerGroupId = await ctx.mintGroup(
        parentNewId ? folderOps.findById(g, parentNewId)?.owner_group_id : undefined,
      );
      const now = Date.now();
      const row = await folderOps.addFolder(g, {
        id: generateId(),
        name: finalName,
        parentId: parentNewId,
        type: exported.type,
        ownerGroupId,
        createdBy: ctx.createdBy,
        now,
      });
      await g.folder.update(row.id, {
        created_at: new Date(exported.createdAt).getTime(),
        updated_at: new Date(exported.updatedAt).getTime(),
        archived: exported.archived,
        expanded: exported.expanded,
        show_zone_headings: exported.showZoneHeadings,
        auto_categorize_enabled: exported.autoCategorizeEnabled,
        autocomplete_domain: exported.autocompleteDomain,
      });

      newIdMap.set(exported.id, row.id);
      folderIds.push(row.id);
      foldersCreated++;

      if (exported.type === 'template-folder') {
        const idMap = new Map<string, string>();
        const items = exported.items
          ? flattenHierarchicalItems(exported.items, undefined, idMap)
          : [];
        const sessions = (exported.sessions ?? []).map((s) => importSession(s, items, idMap));

        const itemHandle = itemsList(g, row.id);
        for (const item of items) await itemHandle.append(item);
        const sessionHandle = sessionsList(g, row.id);
        for (const session of sessions) await sessionHandle.append(session);

        itemsAdded += items.length;
        sessionsCreated += sessions.length;

        if (exported.defaultItems && Object.keys(exported.defaultItems).length > 0) {
          const remapped: Record<string, boolean> = {};
          for (const [oldId, value] of Object.entries(exported.defaultItems)) {
            const newId = idMap.get(oldId);
            if (newId) remapped[newId] = value;
          }
          await g.folder.update(row.id, { default_items: remapped });
        }
      }

      for (const child of data.folders.filter((f) => f.parentId === exported.id)) {
        await importFolder(child, row.id);
      }
    } catch (error) {
      errors.push(
        `Failed to import folder "${exported.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  const roots = data.folders.filter((f) => f.parentId === null || f.parentId === undefined);
  for (const root of roots) {
    await importFolder(root, ctx.parentId ?? null);
  }

  let userSettingsImported = false;
  if (data.userSettings) {
    try {
      await ensureUserSettings(g, ctx.createdBy, ctx.createdBy);
      const row = g.user_settings.all()[0]?.$data;
      if (row) {
        await g.user_settings.update(row.id, {
          default_autocomplete_domain: data.userSettings.defaultAutocompleteDomain,
          enable_auto_categorization: data.userSettings.enableAutoCategorization,
          view_folder_expanded: data.userSettings.viewFolderExpanded,
          view_template_category_expanded: data.userSettings.viewTemplateCategoryExpanded,
          view_session_category_expanded: data.userSettings.viewSessionCategoryExpanded,
        });
        userSettingsImported = true;
      }
    } catch (error) {
      errors.push(
        `Failed to import user settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    stats: { foldersCreated, itemsAdded, sessionsCreated, userSettingsImported },
    data: { folderIds },
  };
}
```

Also update `flattenHierarchicalItems` to include `notes`:

```typescript
items.push({
  id: newId,
  name: exportedItem.name,
  type: exportedItem.type,
  path: itemPath,
  expanded: exportedItem.expanded ?? false,
  sortOrder: exportedItem.sortOrder ?? sortOrderCounter++,
  archived: false,
  defaultQuantity: exportedItem.defaultQuantity || '',
  notes: exportedItem.notes,
  createdAt: new Date(exportedItem.createdAt).getTime(),
});
```

And `importSession` to preserve session `id` and item-state `notes`:

```typescript
return {
  id: exportedSession.id ?? generateId(),
  itemStates,
  archived: exportedSession.archived ?? false,
  viewMode: exportedSession.viewMode || 'zone-in-hierarchy',
  categoryExpanded: {},
  selectedCount,
  checkedCount,
  remainingCount,
  createdAt: new Date(exportedSession.createdAt).getTime(),
  lastActivityAt: new Date(exportedSession.lastActivityAt).getTime(),
};
```

```typescript
itemStates[newItemId] = {
  selected: exportedState.selected,
  checked: exportedState.checked,
  selectedAt: exportedState.selectedAt ? new Date(exportedState.selectedAt).getTime() : undefined,
  checkedAt: exportedState.checkedAt ? new Date(exportedState.checkedAt).getTime() : undefined,
  notes: exportedState.notes,
};
```

- [ ] **Step 4: Update `jsonImporter.test.ts` to cover v2.1**

Update existing fixtures to include required new fields (`id`, `parentId`, `archived`, `expanded`, `defaultItems`, `showZoneHeadings`, `autoCategorizeEnabled`, `autocompleteDomain`, session `id`).

Add new tests:
- Import preserves folder hierarchy (organizational parent + nested template).
- Import restores archived folders.
- Import restores item notes and session item-state notes.
- Import restores `default_items`.
- Import restores per-folder settings and `user_settings`.

Run: `npx vitest run src/services/import/jsonImporter.test.ts`
Expected: FAIL until import changes land; PASS after.

- [ ] **Step 5: Add a round-trip test**

In `src/services/import/jsonImporter.test.ts` (or a new `src/services/export/roundTrip.test.ts`):

```typescript
it('export followed by import preserves folder tree, items, sessions and settings', async () => {
  const g1 = makeGraph({
    user_settings: [{
      id: 'u1',
      owner_group_id: 'u1',
      default_autocomplete_domain: 'grocery',
      enable_auto_categorization: true,
      subscription_tier: 'free',
      subscription_status: 'beta',
      subscription_ends_at: 0,
      max_lists: -1,
      session_retention_days: -1,
      subscription_synced_at: 0,
      view_folder_expanded: {},
      view_template_category_expanded: {},
      view_session_category_expanded: {},
    }],
    folder: [
      templateFolder('org', 'Home', [], { type: 'folder' }),
      templateFolder('t1', 'Groceries', [
        item('i1', 'Milk', 'item', 'milk', 0, { notes: '2% preferred' }),
      ], [
        session('s1', { i1: { selected: true, checked: false, notes: 'check expiration' } }),
      ], {
        parent_id: 'org',
        default_items: { i1: true },
        show_zone_headings: true,
        auto_categorize_enabled: true,
        autocomplete_domain: 'grocery',
      }),
    ],
  });

  const json = toJsonString(exportAllFolders(g1), false);
  const g2 = makeGraph();
  const result = await importJson(g2, json, ctx());

  expect(result.success).toBe(true);
  expect(result.stats.foldersCreated).toBe(2);

  const importedRoot = folderOps.topLevelFolders(g2)[0];
  expect(importedRoot.name).toBe('Home');
  expect(importedRoot.type).toBe('folder');

  const importedTemplate = folderOps.childrenOf(g2, importedRoot.id)[0];
  expect(importedTemplate.name).toBe('Groceries');
  const parsed = parseFolderRow(g2.folder(importedTemplate.id)!.$data);
  expect(parsed.items[0].notes).toBe('2% preferred');
  expect(parsed.default_items[parsed.items[0].id]).toBe(true);
  expect(parsed.show_zone_headings).toBe(true);
  expect(parsed.auto_categorize_enabled).toBe(true);
  expect(parsed.autocomplete_domain).toBe('grocery');
  expect(parsed.sessions[0].itemStates[parsed.items[0].id].notes).toBe('check expiration');

  const settings = g2.user_settings.all()[0]?.$data;
  expect(settings?.default_autocomplete_domain).toBe('grocery');
  expect(settings?.enable_auto_categorization).toBe(true);
});
```

Run: `npx vitest run src/services/import/jsonImporter.test.ts`
Expected: PASS.

- [ ] **Step 6: Run all import/export tests**

Run: `npx vitest run src/services/export src/services/import`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/import/types.ts src/services/import/validators.ts src/services/import/jsonImporter.ts src/services/import/jsonImporter.test.ts
git commit -m "feat(import): v2.1 JSON import restores full folder tree, settings and notes"
```

---

### Task 4: Fix Biome lint warnings

**Files:**
- Modify: `src/components/session/SessionZone.test.tsx:50-53`
- Modify: `src/components/ui/ItemInput.test.tsx:160-167`
- Modify: `src/services/__tests__/concurrentMerge.test.ts:47`
- Modify: `src/services/import/importService.test.ts:346,366`
- Modify: `src/services/import/jsonImporter.test.ts:203`
- Modify: `src/services/sessionCleanupService.test.ts:35-36`
- Modify: `src/services/subscriptionService.test.ts:443-445`

**Interfaces:**
- No new interfaces; tests must still pass.

- [ ] **Step 1: Remove the unused helper in `SessionZone.test.tsx`**

Delete the `createMockTemplate` function (lines 50-53).

Run: `npx biome check src/components/session/SessionZone.test.tsx`
Expected: no warnings.

- [ ] **Step 2: Replace non-null assertions in `ItemInput.test.tsx`**

Use `expect(...).not.toBeNull()` guards or type assertions via `as HTMLButtonElement`. Example:

```typescript
const milkOption = within(listbox).getByText('Milk').closest('button');
expect(milkOption).not.toBeNull();
const milkCheckbox = milkOption!.querySelector('span:first-child');
expect(milkCheckbox).not.toBeNull();
expect(milkCheckbox!.className).toContain('bg-green-600');
```

Biome accepts an `!` after an `expect(...).not.toBeNull()` guard in the same block. Apply the same pattern to `almondOption`/`almondCheckbox`.

Run: `npx biome check src/components/ui/ItemInput.test.tsx`
Expected: no warnings.

- [ ] **Step 3: Replace non-null assertions in test helpers**

In `src/services/__tests__/concurrentMerge.test.ts:47`:

```typescript
const s = getSession(g, 'f', 's1');
expect(s).toBeDefined();
expect(s!.itemStates.x.checked).toBe(true);
expect(s!.itemStates.y.checked).toBe(true);
```

In `src/services/import/importService.test.ts:346,366`:

```typescript
const folderNode = g.folder(created.id);
expect(folderNode).toBeDefined();
const defaults = parseFolderRow(folderNode!.$data).default_items;
```

In `src/services/import/jsonImporter.test.ts:203`:

```typescript
const folderNode = g.folder(folderId);
expect(folderNode).toBeDefined();
const sessions = parseFolderRow(folderNode!.$data).sessions;
```

In `src/services/sessionCleanupService.test.ts:35-36`:

```typescript
const sessionsOf = (g: ReturnType<typeof makeGraph>) => {
  const folderNode = g.folder('t1');
  expect(folderNode).toBeDefined();
  return parseFolderRow(folderNode!.$data).sessions;
};
```

Run: `npx biome check src/services/__tests__/concurrentMerge.test.ts src/services/import/importService.test.ts src/services/import/jsonImporter.test.ts src/services/sessionCleanupService.test.ts`
Expected: no warnings.

- [ ] **Step 4: Fix the unused suppression in `subscriptionService.test.ts`**

The `// biome-ignore lint/suspicious/noExplicitAny` comment at line 443 no longer suppresses anything. Replace the cast with a type-safe pattern or remove the suppression.

```typescript
delete (window as { location?: Location }).location;
window.location = { href: '' } as Location;
```

Run: `npx biome check src/services/subscriptionService.test.ts`
Expected: no warnings.

- [ ] **Step 5: Run the full lint check**

Run: `npm run lint`
Expected: no warnings.

- [ ] **Step 6: Run the full unit test suite**

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/session/SessionZone.test.tsx src/components/ui/ItemInput.test.tsx src/services/__tests__/concurrentMerge.test.ts src/services/import/importService.test.ts src/services/import/jsonImporter.test.ts src/services/sessionCleanupService.test.ts src/services/subscriptionService.test.ts
git commit -m "style(tests): fix all Biome lint warnings"
```

---

### Task 5: Regenerate Capacitor mobile bundles

**Files:**
- Run command (modifies gitignored `android/app/src/main/assets/public/`).

**Interfaces:**
- No code interfaces; operational step.

- [ ] **Step 1: Run Capacitor sync**

Run: `npm run cap:sync`
Expected: completes without errors; updates `android/app/src/main/assets/public/` and `ios/App/public/`.

- [ ] **Step 2: Verify the updated asset directories exist and contain a current build**

Run:

```bash
ls -la android/app/src/main/assets/public/ | head -20
ls -la ios/App/public/ | head -20
```

Expected: `index.html`, `assets/`, and JS chunks are present with recent timestamps.

- [ ] **Step 3: Commit (optional but recommended for beta tracking)**

Because the synced assets are gitignored, there is no git diff to commit. If you want the refreshed bundles in the working tree for the beta build, the command above is sufficient. Do not create an empty commit.

---

## Self-Review

**1. Spec coverage:**
- Item 4 (duplicate seeding) → Task 1.
- Item 5 (export loses data) → Tasks 2 and 3.
- Item 6 (lint warnings) → Task 4.
- Item 7 (mobile bundles) → Task 5.

**2. Placeholder scan:** No TBD/TODO/"implement later"/"appropriate" language. All code snippets are concrete.

**3. Type consistency:**
- `ExportedData.version` is `'2.1'` in types, exporter, and tests.
- `ExportedFolder.id`/`parentId`/`archived`/`expanded`/`defaultItems`/`showZoneHeadings`/`autoCategorizeEnabled`/`autocompleteDomain` are used consistently across types, exporter, importer, and validators.
- `seedDefaultFolders` signature changes in both definition and call site.
- `ImportResult.stats` gains `userSettingsImported` in both types and importer.

**Execution handoff:** Plan complete and saved to `docs/superpowers/plans/2026-10-02-checklist-test-beta-blockers.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** - execute tasks in this session with checkpoints for review.

Which approach?
