# Checklist `rb.ordered` Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make template `items` and `sessions` concurrency-safe by storing them as `rb.ordered` keyed-map columns and rewriting every write path to field-level dotted-path updates, so concurrent edits merge with no lost survivor (resolves DEFERRED D1).

**Architecture:** Flip two `rb.json(z.array(...))` columns to `rb.ordered(Schema, { key: 'id' })`; parse them on read with `orderedToArray`; drive every write through an `orderedList(...)` handle so ops lower to `sessions.<sid>.itemStates.<itemId>` / `items.<id>.<field>` sub-path writes. Ordering moves from the integer `sortOrder` field to `rb.ordered`'s `__order` fracKey; `sortOrder` is removed.

**Tech Stack:** TypeScript, `@jbroll/rowboat-schema` (`rb.ordered`), `@jbroll/rowboat-client` (`orderedList`, `orderedToArray`), Vitest, Playwright.

## Global Constraints

- Rowboat packages MUST resolve to the **base repo** `/home/john/src/rowboat` (symlinked via `file:../rowboat/packages/*`), NOT `rowboat-wt2` (another session's worktree). Do not run `npm install` in a way that repoints these; if node_modules is rebuilt, verify `ls -l node_modules/@jbroll/rowboat-client` still points to `/home/john/src/rowboat/packages/client`.
- No sync-engine/backend changes: `rb.ordered` compiles to a `type:"json"` column; the server is untouched.
- No data migration: existing synced data is discarded (product decision, DEFERRED D1 + D4). Dev/CI start fresh.
- Soft-delete convention stays: archive = `archived:true` via a field write; `orderedList.remove` (the `__deleted` tombstone) is reserved for true hard deletes (sessions only).
- Timestamps are epoch-ms numbers (`Date.now()`).
- NO FALLBACKS: a missing template/item/session stays a thrown error, never a silent no-op.
- This is an atomic schema migration: intermediate tasks leave the tree non-compiling. The full `npm run check` (type-check + lint + unit) gate lands at **Task 7**; earlier tasks are gated by their own focused unit tests run with `npx vitest run <file>`.
- **Test-store fidelity:** the unit-test store (`reactiveArrayStore` + `relational`, via `src/test/rowboat.ts` `makeGraph`) does a **shallow spread** on `update` — it does NOT merge dotted json paths (only the real client `RowboatDb` does, via `applyChanges`/`deepSet` in `@jbroll/rowboat-client`). So a field-level write like `{'items.x': …}` would land as a literal `"items.x"` column and never reach the `items` json. **Task 0** adds a dotted-path merge shim to `makeGraph` (reusing `deepSet` from `@jbroll/rowboat-shared`, a public export) so field-level writes round-trip; every later task depends on it.
- **`makeGraph` seed shape** is `makeGraph({ folder: [row, …] })` (keyed by table), NOT a bare array. Seed json columns as plain objects/arrays (`items: {}`) — the helper stringifies them to the wire shape.
- The shared `item(...)` / seed builders in the service test files set `sortOrder: 0`; drop that field wherever it appears (it's removed from the schema in Task 1).

---

## File Structure

- `src/test/rowboat.ts` — add dotted-path json merge to the test store's `update`. (Task 0)
- `shared/schema.ts` — flip `items`/`sessions` columns; drop `sortOrder` from `TemplateItemSchema`. (Task 1)
- `src/schema/folderData.ts` — read boundary: `orderedToArray` parse; parsed-row type. (Task 1)
- `src/services/folderListHandles.ts` — **new**: thin factory binding `orderedList` to a folder's `items`/`sessions` columns. (Task 2)
- `src/services/templateService.ts` — write paths → handle; `sortOrder` → position/`__order`. (Task 3)
- `src/components/session/categoryTreeBuilder.ts`, `useSessionItems.ts`, `useSessionHandlers.ts` — ordering consumers off `sortOrder`. (Task 4)
- `src/services/sessionService.ts` — write paths → handle; per-item field-level `itemStates` writes. (Task 5)
- `src/services/folderOps.ts` — fresh folder writes empty maps. (Task 6)
- `src/services/__tests__/concurrentMerge.test.ts` — **new**: D1 invariant. (Task 7)
- `docs/DEFERRED.md` — mark D1 resolved. (Task 7)

---

## Task 0: Test-store dotted-path json merge shim

**Files:**
- Modify: `src/test/rowboat.ts` (`makeGraph`)
- Test: `src/test/rowboat.test.ts` (create)

**Interfaces:**
- Produces: `makeGraph(seed)` returns a graph whose `folder.update` merges dotted json-column keys (`{'items.x.checked': v}`) into the stored json string via `deepSet`, mirroring the real client `applyChanges`. Whole-object writes to a json column are stringified (string invariant preserved).

- [ ] **Step 1: Write the failing test** — `src/test/rowboat.test.ts`

Self-contained: read the raw stored json cell directly (independent of Task 1's read layer).

```ts
import { describe, expect, it } from 'vitest';
import { makeGraph } from './rowboat';

// The test store keeps json columns as JSON strings; parse the raw cell to inspect the merge.
const cell = (g: ReturnType<typeof makeGraph>, col: 'items' | 'sessions') => {
  const raw = (g.folder('f')!.$data as Record<string, unknown>)[col];
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
};

describe('makeGraph dotted-path json merge', () => {
  it('merges a dotted json write into the existing cell (no clobber of siblings)', async () => {
    const g = makeGraph({ folder: [{ id: 'f', type: 'template-folder', items: { a: { id: 'a', __order: 'g' } }, sessions: {}, default_items: {} } as never] });
    await g.folder.update('f', { 'items.b': { id: 'b', __order: 'n' } });
    expect(Object.keys(cell(g, 'items')).sort()).toEqual(['a', 'b']);   // 'a' survived, 'b' added
  });
  it('merges a deep dotted sub-path without dropping the element', async () => {
    const g = makeGraph({ folder: [{ id: 'f', type: 'template-folder', items: {}, sessions: { s1: { id: 's1', __order: 'g', itemStates: { x: { checked: false } } } }, default_items: {} } as never] });
    await g.folder.update('f', { 'sessions.s1.itemStates.x.checked': true });
    const s = cell(g, 'sessions').s1 as { itemStates: Record<string, { checked: boolean }> };
    expect(s.itemStates.x.checked).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/test/rowboat.test.ts`
Expected: FAIL (shallow spread stores a literal `"items.b"` / `"sessions.s1.itemStates.x.checked"` column; the `items`/`sessions` cell is unchanged).

- [ ] **Step 3: Add the merge shim to `src/test/rowboat.ts`.** Import `deepSet` and wrap the store's `update`:

```ts
import { deepSet } from '@jbroll/rowboat-shared';
// FOLDER_JSON_COLUMNS already exists in this file (used by stringifyFolderJsonColumns).

/** Wrap a MutableStore so dotted json-column keys deep-merge into the stored JSON string,
 *  mirroring the real client's applyChanges (the in-memory arrayStore only shallow-spreads). */
function withJsonPathMerge(store: MutableStore & ReactiveStore): MutableStore & ReactiveStore {
  const jsonCols = new Set(FOLDER_JSON_COLUMNS);
  const mergeChanges = (table: string, id: string, changes: Record<string, unknown>): Record<string, unknown> => {
    const row = store.all(table).find((r) => r.id === id);
    const groups = new Map<string, Map<string, unknown>>();
    const plain: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      const dot = key.indexOf('.');
      const col = dot === -1 ? key : key.slice(0, dot);
      if (dot !== -1 && jsonCols.has(col)) {
        if (!groups.has(col)) groups.set(col, new Map());
        groups.get(col)!.set(key.slice(dot + 1), value);
      } else if (dot === -1 && jsonCols.has(col) && value !== null && typeof value === 'object') {
        plain[col] = JSON.stringify(value);            // whole-object json write → string invariant
      } else {
        plain[key] = value;
      }
    }
    for (const [col, paths] of groups) {
      const baseStr = plain[col] ?? row?.[col];
      const blob = typeof baseStr === 'string' ? JSON.parse(baseStr) : ({ ...(baseStr as object) } ?? {});
      for (const [path, value] of paths) deepSet(blob as Record<string, unknown>, path, value);
      plain[col] = JSON.stringify(blob);
    }
    return plain;
  };
  return {
    ...store,
    update: (t: string, idOrItems: string | Array<{ id: string; changes: Record<string, unknown> }>, changes?: Record<string, unknown>) =>
      Array.isArray(idOrItems)
        ? store.update(t, idOrItems.map((it) => ({ id: it.id, changes: mergeChanges(t, it.id, it.changes) })))
        : store.update(t, idOrItems, mergeChanges(t, idOrItems, changes ?? {})),
  };
}
```

Then change `makeGraph`:
```ts
export function makeGraph(seed?: Record<string, Row[]>): Graph {
  return relational(schema, withJsonPathMerge(reactiveArrayStore(stringifyFolderJsonColumns(seed))));
}
```
(Import `MutableStore`, `ReactiveStore` types from `@jbroll/rowboat-schema` alongside the existing imports.)

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/test/rowboat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/rowboat.ts src/test/rowboat.test.ts
git commit -m "test(rb-ordered): dotted-path json merge in the test store"
```

---

## Task 1: Schema flip + read boundary

**Files:**
- Modify: `shared/schema.ts` (TemplateItemSchema, Folder.items, Folder.sessions)
- Modify: `src/schema/folderData.ts`
- Test: `src/schema/folderData.test.ts` (create)

**Interfaces:**
- Produces: `Folder.items`/`Folder.sessions` are `rb.ordered(Schema, { key: 'id' })`; `TemplateItem` no longer has `sortOrder`. `parseFolderRow(row)` returns `ParsedFolderRow` with `items: TemplateItem[]`, `sessions: SessionData[]` (sorted by `__order`, tombstones filtered).

- [ ] **Step 1: Write the failing test** — `src/schema/folderData.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { parseFolderRow } from './folderData';
import type { FolderRow } from './folder';

// A raw rb.ordered column persists as a JSON string of a keyed map.
const rawItems = JSON.stringify({
  b: { id: 'b', name: 'Bananas', type: 'item', path: 'b', expanded: false, archived: false, defaultQuantity: '', createdAt: 1, __order: 'n' },
  a: { id: 'a', name: 'Apples', type: 'item', path: 'a', expanded: false, archived: false, defaultQuantity: '', createdAt: 1, __order: 'g' },
  z: { id: 'z', name: 'Gone', type: 'item', path: 'z', expanded: false, archived: false, defaultQuantity: '', createdAt: 1, __order: 'a', __deleted: true },
});

describe('parseFolderRow ordered columns', () => {
  it('sorts items by __order, drops tombstones, strips reserved keys', () => {
    const row = { id: 'f', type: 'template-folder', items: rawItems, sessions: '{}', default_items: '{}', archived: 0, expanded: 0, show_zone_headings: 0, auto_categorize_enabled: 0 } as unknown as FolderRow;
    const parsed = parseFolderRow(row);
    expect(parsed.items.map((i) => i.id)).toEqual(['a', 'b']); // z tombstoned; a(__order g) < b(__order n)
    expect((parsed.items[0] as Record<string, unknown>).__order).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/schema/folderData.test.ts`
Expected: FAIL (parse still returns the raw map / array, `__order` present or ids unsorted).

- [ ] **Step 3: Edit `shared/schema.ts`** — remove `sortOrder`, flip columns.

In `TemplateItemSchema` delete the line:
```ts
  sortOrder: z.number(),
```
In `Folder`, replace:
```ts
  items: rb.json(z.array(TemplateItemSchema)),
  sessions: rb.json(z.array(SessionDataSchema)),
```
with:
```ts
  items: rb.ordered(TemplateItemSchema, { key: 'id' }),
  sessions: rb.ordered(SessionDataSchema, { key: 'id' }),
```

- [ ] **Step 4: Edit `src/schema/folderData.ts`** — parse via `orderedToArray`, add parsed type.

Add import at top:
```ts
import { orderedToArray, type OrderedElement } from '@jbroll/rowboat-client';
import type { FolderRow, SessionData, TemplateItem } from './folder.js';
```
Add an exported parsed-row type (the raw `FolderRow['items']` now infers to the element type, so the app works off this):
```ts
export type ParsedFolderRow = Omit<FolderRow, 'items' | 'sessions' | 'default_items'> & {
  items: TemplateItem[];
  sessions: SessionData[];
  default_items: Record<string, boolean>;
};
```
Change `parseFolderRow` to return `ParsedFolderRow` and parse the ordered columns:
```ts
export function parseFolderRow(row: FolderRow): ParsedFolderRow {
  const itemMap = parseJsonColumn<Record<string, OrderedElement>>(row.items as unknown, {});
  const sessionMap = parseJsonColumn<Record<string, OrderedElement>>(row.sessions as unknown, {});
  return {
    ...(row as unknown as ParsedFolderRow),
    items: orderedToArray(itemMap) as unknown as TemplateItem[],
    sessions: orderedToArray(sessionMap) as unknown as SessionData[],
    default_items: parseJsonColumn(row.default_items as unknown, {}),
    archived: coerceBool(row.archived),
    expanded: coerceBool(row.expanded),
    show_zone_headings: coerceBool(row.show_zone_headings),
    auto_categorize_enabled: coerceBool(row.auto_categorize_enabled),
  };
}
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx vitest run src/schema/folderData.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts src/schema/folderData.ts src/schema/folderData.test.ts
git commit -m "feat(rb-ordered): items/sessions ordered columns + read boundary"
```

---

## Task 2: `folderListHandles` — bind `orderedList` to a folder

**Files:**
- Create: `src/services/folderListHandles.ts`
- Test: `src/services/folderListHandles.test.ts`

**Interfaces:**
- Consumes: `orderedList`, `OrderedElement` from `@jbroll/rowboat-client`; the graph `g` (`RelationalGraph<typeof schema>`).
- Produces:
  - `itemsList(g, folderId): OrderedListHandle` — path `'items'`, key `'id'`.
  - `sessionsList(g, folderId): OrderedListHandle` — path `'sessions'`, key `'id'`.
  - Both `read()` the **raw** keyed map from `g.folder(id).$data` (JSON-string tolerant), and `update()` via `g.folder.update(id, { ...changes, updated_at: Date.now() })`.

- [ ] **Step 1: Write the failing test** — `src/services/folderListHandles.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { makeGraph } from '@/test/rowboat';           // existing test helper (see sessionService tests)
import { itemsList } from './folderListHandles';

describe('itemsList handle', () => {
  it('append lowers to a field-level dotted-path write on a new key', async () => {
    const g = makeGraph({ folder: [{ id: 'f', type: 'template-folder', items: {}, sessions: {}, default_items: {} } as never] });
    const spy = vi.spyOn(g.folder, 'update');
    const items = itemsList(g, 'f');
    await items.append({ id: 'x', name: 'X' });
    const [, changes] = spy.mock.calls[0];
    expect(Object.keys(changes)).toContain('items.x');           // per-key, not whole "items"
    expect((changes as Record<string, unknown>)['items.x']).toMatchObject({ id: 'x', __order: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/services/folderListHandles.test.ts`
Expected: FAIL ("Cannot find module './folderListHandles'").

- [ ] **Step 3: Implement `src/services/folderListHandles.ts`**

```ts
/**
 * Bind `@jbroll/rowboat-client`'s `orderedList` to a folder row's ordered json columns
 * (`items`, `sessions`). Every list op lowers to a FIELD-LEVEL dotted-path write via
 * `g.folder.update` — never a whole-cell write — so concurrent edits merge (rb.ordered / D1).
 * `read()` resolves the RAW keyed map from `$data` (rb.json columns come back as JSON strings
 * from the real store, already-parsed objects from the test store — tolerate both).
 */
import { orderedList, type OrderedElement, type OrderedListHandle } from '@jbroll/rowboat-client';
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '@/schema/folder';

type Graph = RelationalGraph<typeof schema>;

function rawMap(value: unknown): Record<string, OrderedElement> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, OrderedElement>;
  return (value as Record<string, OrderedElement> | null | undefined) ?? {};
}

function handle(g: Graph, folderId: string, path: 'items' | 'sessions'): OrderedListHandle {
  return orderedList({
    path,
    key: 'id',
    read: () => rawMap((g.folder(folderId)?.$data as Record<string, unknown> | undefined)?.[path]),
    update: (changes) => g.folder.update(folderId, { ...changes, updated_at: Date.now() }),
  });
}

export const itemsList = (g: Graph, folderId: string): OrderedListHandle => handle(g, folderId, 'items');
export const sessionsList = (g: Graph, folderId: string): OrderedListHandle => handle(g, folderId, 'sessions');
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/services/folderListHandles.test.ts`
Expected: PASS. (If `makeGraph` stringifies seed columns, the `read()` string branch is exercised — good.)

- [ ] **Step 5: Commit**

```bash
git add src/services/folderListHandles.ts src/services/folderListHandles.test.ts
git commit -m "feat(rb-ordered): folder items/sessions list handles"
```

---

## Task 3: templateService write paths + position-based insertion

**Files:**
- Modify: `src/services/templateService.ts`
- Test: `src/services/templateService.test.ts` (update existing)

**Interfaces:**
- Consumes: `itemsList` from Task 2; `parseFolderRow`/`ParsedFolderRow` from Task 1.
- Produces (signature changes):
  - `calculateInsertionPoint(g, templateId, selectedItemId): { parentPath: string | undefined; after?: string; before?: string }` — returns a **neighbour position**, not a numeric sortOrder.
  - `createCategory`/`createItem` gain an optional trailing `position?: { after?: string; before?: string }` in place of the `sortOrder` params.
  - `reorderItem(g, templateId, itemId, position: { after?: string; before?: string })`.
  - `moveItem(g, templateId, itemId, newParentPath, position?)`.

- [ ] **Step 1: Update the failing test first** — in `templateService.test.ts` replace `sortOrder` assertions with order-by-array and add:

```ts
it('createItem appends in __order; reorderItem moves before a sibling', async () => {
  const g = makeGraph({ folder: [{ id: 'f', type: 'template-folder', items: {}, sessions: {}, default_items: {} } as never] });
  const a = await templateService.createItem(g, 'f', 'A');
  const b = await templateService.createItem(g, 'f', 'B');
  expect(templateService.getItems(g, 'f').map((i) => i.name)).toEqual(['A', 'B']);
  await templateService.reorderItem(g, 'f', b, { before: a });
  expect(templateService.getItems(g, 'f').map((i) => i.name)).toEqual(['B', 'A']);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/services/templateService.test.ts -t 'reorderItem moves'`
Expected: FAIL (old `reorderItem(…, number)` signature / sortOrder gone).

- [ ] **Step 3: Rewrite the write paths in `templateService.ts`.** Apply this pattern to every `g.folder.update(templateId, { items: … })` site (lines 131–141, 230, 247, 268, 308, 336, 363 in the pre-change file):

  - **`createTemplateItem`** — drop `sortOrder` from `newItem`; append then optionally move:
    ```ts
    const list = itemsList(g, templateId);
    await list.append(newItem);                       // newItem has NO sortOrder now
    if (options?.position) await list.move(newItem.id, options.position);
    if (options?.addToDefaults) {
      await g.folder.update(templateId, { [`default_items.${newItem.id}`]: true, updated_at: Date.now() });
    }
    ```
    Keep the existing `getItem` read-back wait loop (append is field-level, but consecutive creates still read `$data`).
  - **`renameItem`** — `list.setField(itemId, 'name', newName)` then `list.setField(itemId, 'path', newPath)`; for a category, one `setField(child.id, 'path', newChildPath)` per descendant (loop over `updateDescendantPaths` result).
  - **`updateItemNotes`** — `list.setField(itemId, 'notes', notes || undefined)`.
  - **`archiveItem`** — `list.setField(itemId, 'archived', true)` for the item and (category) each descendant.
  - **`moveItem`** — `list.setField(itemId, 'path', newPath)` (+ descendants); if `position` given, `list.move(itemId, position)`.
  - **`setCategoryExpanded`** — `list.setField(itemId, 'expanded', expanded)`.
  - **`reorderItem`** — `list.move(itemId, position)`.
  - **`calculateInsertionPoint`** — return neighbour ids instead of numbers. Full replacement:
    ```ts
    export function calculateInsertionPoint(
      g: Graph, templateId: string, selectedItemId: string | null,
    ): { parentPath: string | undefined; after?: string; before?: string } {
      const items = requireTemplate(g, templateId).items.filter((i) => !i.archived);
      const siblingsOf = (parentPath: string | undefined) =>
        items.filter((i) => getParentPath(i.path) === parentPath); // already in __order
      if (!selectedItemId) {
        const roots = siblingsOf(undefined);
        return roots.length ? { parentPath: undefined, before: roots[0].id } : { parentPath: undefined };
      }
      const selected = items.find((i) => i.id === selectedItemId);
      if (!selected) return { parentPath: undefined };
      if (selected.type === 'category') {
        const children = siblingsOf(selected.path);
        return children.length ? { parentPath: selected.path, before: children[0].id } : { parentPath: selected.path };
      }
      const parentPath = getParentPath(selected.path);
      return { parentPath, after: selected.id }; // insert right after the selected item
    }
    ```
  - Update `createCategory`/`createItem` to accept `position?` and pass it through `options.position`; remove their `sortOrder` params.

- [ ] **Step 4: Run the templateService suite — expect PASS**

Run: `npx vitest run src/services/templateService.test.ts`
Expected: PASS. (Consumers in `src/components` still reference `sortOrder`/old signatures and will fail type-check — that's Task 4.)

- [ ] **Step 5: Commit**

```bash
git add src/services/templateService.ts src/services/templateService.test.ts
git commit -m "feat(rb-ordered): templateService field-level writes + position insertion"
```

---

## Task 4: ordering consumers off `sortOrder`

**Files:**
- Modify: `src/components/session/categoryTreeBuilder.ts`
- Modify: `src/components/session/useSessionItems.ts`
- Modify: `src/components/session/useSessionHandlers.ts`
- Test: `src/components/session/categoryTreeBuilder.test.ts` (update)

**Interfaces:**
- Consumes: `TemplateItem[]` from `parseFolderRow` (already in `__order` order); `calculateInsertionPoint` (position shape) from Task 3.

- [ ] **Step 1: Update `categoryTreeBuilder.test.ts`** — seed items in an explicit array order (no `sortOrder`) and assert the tree preserves incoming order. Replace any `sortOrder:` seed fields; assert `buildCategoryTree(items).flatMap(...)` matches the input order within each path group.

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/session/categoryTreeBuilder.test.ts`
Expected: FAIL (builder still sorts by `sortOrder`, which is `undefined` now).

- [ ] **Step 3: Edit `categoryTreeBuilder.ts`.** Remove `sortOrder` from `CategoryNode` and all sort comparators. Since `items` arrive pre-sorted by `__order`, preserve input order:
  - Delete the `sortOrder` field (lines 10, 42, 61, 78) — set no sortOrder on nodes.
  - Replace `sortItems` with a stable index map built once from the incoming `items` array:
    ```ts
    const orderOf = new Map(items.map((it, idx) => [it.id, idx]));
    const sortItems = (a: TemplateItem, b: TemplateItem) =>
      (orderOf.get(a.id) ?? 0) - (orderOf.get(b.id) ?? 0);
    ```
  - Replace `sortCategoryTree`'s comparator: order categories by their first child's incoming index, else by name:
    ```ts
    const firstIdx = (c: CategoryNode): number =>
      Math.min(...[...c.items.map((i) => orderOf.get(i.id) ?? Infinity),
                    ...c.children.map(firstIdx)], Infinity);
    const sortCategoryTree = (cats: CategoryNode[]): CategoryNode[] =>
      cats.sort((a, b) => firstIdx(a) - firstIdx(b) || a.name.localeCompare(b.name))
          .map((c) => ({ ...c, items: c.items.sort(sortItems), children: sortCategoryTree(c.children) }));
    ```
- [ ] **Step 4: Edit `useSessionItems.ts`** — delete its `sortOrder` comparator (lines 5–8); items are already ordered, so return them as-is (or reuse the incoming-order map if it locally re-sorts).
- [ ] **Step 5: Edit `useSessionHandlers.ts`** — `calculateInsertionPoint` now returns `{ parentPath, after?, before? }`; pass `{ after, before }` as the new `position` arg to `createItem`/`createCategory` (lines ~140–177) instead of `sortOrder`.

- [ ] **Step 6: Run the component tests — expect PASS**

Run: `npx vitest run src/components/session/categoryTreeBuilder.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/session/
git commit -m "feat(rb-ordered): order items by __order, drop sortOrder consumers"
```

---

## Task 5: sessionService field-level writes

**Files:**
- Modify: `src/services/sessionService.ts`
- Test: `src/services/sessionService.core.test.ts`, `sessionService.lifecycle.test.ts`, `sessionService.batchSelect.test.ts` (update)

**Interfaces:**
- Consumes: `sessionsList` from Task 2.
- Produces: item-state changes write the **single** changed item's sub-path (`sessions.<sid>.itemStates.<itemId>`), never the whole `itemStates` map.

- [ ] **Step 1: Write the failing test** — in `sessionService.core.test.ts`:

```ts
it('setItemChecked writes only the changed item sub-path', async () => {
  const g = makeGraph({ folder: [{ id: 'f', type: 'template-folder', items: {}, sessions: {}, default_items: {} } as never] });
  const sid = await sessionService.createSession(g, 'f');
  const spy = vi.spyOn(g.folder, 'update');
  await sessionService.setItemChecked(g, 'f', sid, 'item1', true);
  const changed = spy.mock.calls.flatMap(([, c]) => Object.keys(c as object));
  expect(changed.some((k) => k.startsWith(`sessions.${sid}.itemStates.item1`))).toBe(true);
  expect(changed).not.toContain('sessions');           // no whole-cell write
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/services/sessionService.core.test.ts -t 'only the changed item sub-path'`
Expected: FAIL (current path rewrites whole `sessions` via `updateSession`).

- [ ] **Step 3: Rewrite `sessionService.ts`.**
  - **`updateSession`** — replace the whole-array rewrite with per-field writes through the handle:
    ```ts
    async function updateSession(g, templateId, sessionId, updates: Partial<SessionData>): Promise<void> {
      const list = sessionsList(g, templateId);
      const map = (list as unknown as { toArray(): SessionData[] }).toArray();
      if (!map.some((s) => s.id === sessionId)) throw new Error(`Session ${sessionId} not found in template ${templateId}`);
      for (const [field, value] of Object.entries(updates)) await list.setField(sessionId, field, value);
    }
    ```
  - **`setItemChecked` / `setItemSelected` / `toggleItemChecked` / `toggleItemSelected` / `updateSessionItemNotes`** — write the specific item's state sub-path instead of rebuilding `itemStates` and calling `updateSession`:
    ```ts
    const list = sessionsList(g, templateId);
    await list.setField(sessionId, `itemStates.${itemId}`, createOrUpdateItemState(current, checked, now));
    await list.setField(sessionId, 'lastActivityAt', now);
    ```
  - **`updateSessionCounts` / `updateViewMode` / `archiveSession` / `unarchiveSession` / `clearSessionState`** — keep going through `updateSession` (whole-field writes on scalar fields are fine; counts are a derived cache).
  - **`batchSelectItems` / `toggleSelectAllItems` / `invertItemSelection`** — loop `setField(sessionId, \`itemStates.${id}\`, state)` per touched item (many field writes, each mergeable).
  - **`createSession`** (L130) — `await sessionsList(g, templateId).append(newSession)`.
  - **`deleteSession`** (L451) — `await sessionsList(g, templateId).remove(sessionId)` (true tombstone).

- [ ] **Step 4: Run the session suites — expect PASS**

Run: `npx vitest run src/services/sessionService.core.test.ts src/services/sessionService.lifecycle.test.ts src/services/sessionService.batchSelect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/sessionService.ts src/services/sessionService.*.test.ts
git commit -m "feat(rb-ordered): sessionService field-level itemState writes"
```

---

## Task 6: folderOps fresh-folder empty maps

**Files:**
- Modify: `src/services/folderOps.ts:44-48`
- Test: `src/services/__tests__/` (existing folderOps coverage, if any) or add an assertion to Task 7's test.

**Interfaces:**
- Consumes: nothing new.
- Produces: a fresh folder row seeds `items: {}`, `sessions: {}`, `default_items: {}` (empty keyed maps, not `[]`).

- [ ] **Step 1: Edit `folderOps.ts`** — in the create payload change:
```ts
    items: [],
    sessions: [],
    default_items: {},
```
to:
```ts
    items: {},
    sessions: {},
    default_items: {},
```

- [ ] **Step 2: Verify create round-trips** — quick check that a freshly created folder reads back empty:

Run: `npx vitest run src/services/templateService.test.ts -t 'append'`
Expected: PASS (append into a fresh `{}` folder works).

- [ ] **Step 3: Commit**

```bash
git add src/services/folderOps.ts
git commit -m "feat(rb-ordered): seed fresh folders with empty ordered maps"
```

---

## Task 7: D1 concurrent-merge invariant + full gate + DEFERRED update

**Files:**
- Create: `src/services/__tests__/concurrentMerge.test.ts`
- Modify: `docs/DEFERRED.md` (mark D1 resolved)

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Write the D1 invariant test.** Two guarantees prove D1 at the checklist level: (a) every item-state write is **per-path** (so the engine merges — the whole-cell clobber is structurally impossible), and (b) two different-item writes **compose** through the store's real `deepSet` merge (the same semantics the server applies per-path). The Task 0 shim gives (b) faithfully; no sync-engine reimpl needed.

```ts
import { describe, expect, it, vi } from 'vitest';
import { makeGraph } from '@/test/rowboat';
import * as sessionService from '../sessionService';

const fresh = () => makeGraph({ folder: [{ id: 'f', type: 'template-folder', items: {}, sessions: {}, default_items: {} } as never] });

describe('D1: concurrent checks on different items merge with no lost survivor', () => {
  it('two different-item checks both survive (compose per-path)', async () => {
    const g = fresh();
    const sid = await sessionService.createSession(g, 'f');
    await sessionService.setItemChecked(g, 'f', sid, 'x', true);   // "client A"
    await sessionService.setItemChecked(g, 'f', sid, 'y', true);   // "client B" — different item
    const s = sessionService.getSession(g, 'f', sid)!;
    expect(s.itemStates.x?.checked).toBe(true);
    expect(s.itemStates.y?.checked).toBe(true);                    // neither clobbered
  });

  it('each item-state write is a single sub-path op, never a whole-cell write', async () => {
    const g = fresh();
    const sid = await sessionService.createSession(g, 'f');
    const spy = vi.spyOn(g.folder, 'update');
    await sessionService.setItemChecked(g, 'f', sid, 'x', true);
    const keys = spy.mock.calls.flatMap(([, c]) => Object.keys(c as object));
    expect(keys.some((k) => k.startsWith(`sessions.${sid}.itemStates.x`))).toBe(true);
    expect(keys).not.toContain('sessions');
  });
});
```

> The engine-level multi-peer LWW guarantee (two synced clients, server-side per-path merge) is already proven in rowboat: `@jbroll/rowboat-integration/json-merge-characterization.test.ts` + the `rb.ordered concurrent-merge invariant` test (`1be08e4`). This task asserts the checklist write paths feed that guarantee (per-path ops) and compose under the same merge locally.

- [ ] **Step 2: Run it — expect PASS**

Run: `npx vitest run src/services/__tests__/concurrentMerge.test.ts`
Expected: PASS. If the first case FAILS with one check lost, a write path still does a whole-cell rewrite — grep the services for any remaining `{ items:` / `{ sessions:` object-value update (not a dotted key) and convert it to the handle.

- [ ] **Step 3: Full gate**

Run: `npm run check`
Expected: type-check + lint + unit tests all green. Fix any remaining `sortOrder` references or array-typed reads surfaced by type-check.

- [ ] **Step 4: E2E gate**

Run: `npm run test:e2e`
Expected: PASS (fresh dev DB; no migration). Investigate any failure before proceeding.

- [ ] **Step 5: Mark D1 resolved in `docs/DEFERRED.md`** — remove the `## D1 …` section (or move it under a new `## Resolved` heading with the commit ref). Update the intro if it references D1 as open.

- [ ] **Step 6: Commit**

```bash
git add src/services/__tests__/concurrentMerge.test.ts docs/DEFERRED.md
git commit -m "test(rb-ordered): D1 concurrent-merge invariant; close D1"
```

---

## Self-Review notes (author)

- **Spec coverage:** schema flip (T1), read boundary (T1), `sortOrder`→`__order` (T3+T4), handle/field-level writes (T2/T3/T5), default_items field writes (T3), itemStates field writes (T5), folderOps empty maps (T6), concurrent-merge test (T7), no migration + DEFERRED close (T7). All spec sections mapped.
- **Type consistency:** `itemsList`/`sessionsList` return `OrderedListHandle` (client type) used identically in T3/T5; `calculateInsertionPoint` returns `{ parentPath, after?, before? }` in T3 and is consumed with that shape in T4; `ParsedFolderRow` defined in T1 is the read type everywhere.
- **Known risk to verify during execution:** the exact shape of `makeGraph`/test store seeding (does it stringify ordered columns?) — confirm in T1/T2; and whether a synced-pair helper exists — add in T7 if not.
