# D / slice 1 — Folder data layer: Jazz → rowboat

Branch: `rowboat-port-slice-1` (checklist repo). Does not touch `/home/john/src/rowboat*`.

## What was built

1. **`src/schema/folder.ts`** — the rowboat `rb.*` table for the folder hierarchy:
   `id, owner_group_id, name, type, parent_id (rb.parent("folder")), sharing_mode, archived,
   expanded, created_by, created_at, updated_at`. Exports `schema = { folder: Folder }`,
   `FolderRow` (via `RowOf`), and `{ RowboatProvider, useRowboat, useSelect } =
   createRowboat(schema)` — the shared binding the hook and (later) the app provider use.
   Item/session fields from the old jazz `FolderNode` (items, sessions, showZoneHeadings,
   defaultItems, autocompleteDomain, autoCategorizeEnabled) are **not** in this table —
   out of scope for slice 1 (hierarchy only).

2. **`src/services/folderOps.ts`** — pure, headless functions over the rowboat graph `g:
   RelationalGraph<typeof schema>`:
   - `addFolder(g, { id, name, parentId, type, ownerGroupId, createdBy, now })` — group
     minting is explicitly the CALLER's job (no server calls here).
   - `renameNode(g, id, name, now)`, `setArchived(g, id, archived, now)`
   - `deleteNode(g, id)` — removes the node's subtree via `$closure("children")` then the
     node itself; hard-errors (throws) if `id` doesn't exist.
   - `moveNode(g, id, newParentId, now)` — delegates to `g.folder.move` (cycle-checked,
     throws on a cycle) then stamps `updated_at`.
   - `generateUniqueName(g, baseName, parentId)` — dedupes against sibling names,
     `"Name"`, `"Name (2)"`, `"Name (3)"`, ...
   - `topLevelFolders(g)`, `childrenOf(g, parentId)`, `findById(g, id)` — read helpers.
   - Every mutator hard-errors on a missing id via a shared `requireFolder` guard — no
     fallback/no-op path (per CLAUDE.md's NO FALLBACKS rule).

3. **`src/hooks/useCheckListHierarchy.ts`** (rewritten) — thin React wrapper: `useRowboat()`
   for `g`, `useSelect` for the reactive top-level-folders list, delegates every operation
   to `folderOps`. Signature changed from `useCheckListHierarchy(account)` to
   `useCheckListHierarchy(options: { showArchived?, createdBy, mintGroup? })` — there is no
   Jazz `Account` in the rowboat world. `addFolder` requires `mintGroup` and throws if it's
   not supplied (NO FALLBACKS — no silent local-only group). `canCreate` is `() => true`
   (billing deferred, per task spec). `isTemplateFolder`/`isOrganizationalFolder` kept as
   module-level predicate exports for parity with the old hook.

   **Scope cut, deliberately not ported here** (they depend on items/sessions data not yet
   in the `Folder` table): `duplicateTemplate`, `getAllTemplateFolders`, `deleteAllUserData`,
   `emptyTrash`, and jazz's `ItemLimitExceededError`/`CircularReferenceError` re-exports.
   `moveNodeToIndex` is kept as a name (TreeView calls it) but is currently identical to
   `moveNode` — the `Folder` table has no sibling-ordering column yet, so `index` is ignored.

## TDD: RED → GREEN

Wrote `src/services/__tests__/folderOps.test.ts` first (vitest, no React/IndexedDB) using
`relational(schema, reactiveArrayStore())`. First run was genuinely RED — not because
`folderOps` was unwritten (both were authored together per the delegated task), but because
the test called `reactiveArrayStore(schema)`, which doesn't match its real signature
(`reactiveArrayStore(seed?: Record<string, Row[]>)`); the store received the schema object
as a seed and blew up on the first `.all()` call:

```
FAIL src/services/__tests__/folderOps.test.ts > folderOps > setArchived toggles the archived flag
TypeError: rows is not iterable
 ❯ makeGraph src/services/__tests__/folderOps.test.ts:17:29
```

Fixed the call to `reactiveArrayStore()` (no seed) and reran — GREEN:

```
✓ src/services/__tests__/folderOps.test.ts (10 tests) 12ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Coverage: addFolder top-level + child (parent_id set), renameNode, setArchived,
generateUniqueName dedup, moveNode reparent, moveNode cycle THROWS
(`move(parent, itsOwnChild)`), deleteNode removes node + subtree, deleteNode hard-errors on
a missing node, topLevelFolders/childrenOf reads.

## Typecheck

`npx tsc --noEmit -p .` — **zero errors** on `src/schema/folder.ts`, `src/services/folderOps.ts`,
`src/services/__tests__/folderOps.test.ts`, `src/hooks/useCheckListHierarchy.ts`. `npx biome
check` on the same four files: clean, no fixes needed.

The rest of the repo does **not** fully typecheck yet (expected — pre-port state per the task
brief). The errors are exactly the follow-up call sites below, plus pre-existing jazz-side
issues unrelated to this port.

## UI call sites needing follow-up type fixes (next task — provider/UI wiring)

- `src/hooks/index.ts` — re-exports `CircularReferenceError`/`ItemLimitExceededError` from
  `./useCheckListHierarchy`, which no longer exports them (TS2305 ×2).
- `src/components/tree/TreeView.tsx` — destructures `archivedFolders`/`emptyTrash` (not on
  the new result); calls `useCheckListHierarchy(account)` (new signature is an options
  object, not a Jazz account); passes whole `FolderRow` objects to `moveNode`/`moveNodeToIndex`
  where the new ops take an `id: string`; reads `.children` off a `FolderRow` (use
  `childrenOf(id)` from the hook instead).
- `src/components/editor/AppContainer.tsx` — calls `useCheckListHierarchy(me)` (signature
  mismatch); destructures `getAllTemplateFolders` (not ported); reads `.parent` off a
  `FolderRow` (doesn't exist — use `parent_id` + `findById`); calls `addFolder(name, parent,
  isTemplate: boolean)` where the new `addFolder(name, parentId, type: string)` takes a type
  string, not a boolean flag.
- `src/components/tree/FolderNodeView.tsx` — calls `useCheckListHierarchy(account)`
  (signature mismatch); destructures `duplicateTemplate` (not ported — needs the items/session
  port first).
- `src/components/AuthGate.tsx` — destructures `deleteAllUserData` (not ported).
- Not yet exercised by `tsc` but will need attention when items/sessions land:
  `src/services/sessionCleanupService.ts`, `src/services/templateService.ts`,
  `src/services/testHelpers.ts` — all reference jazz `FolderType`/`getAllTemplateFolders`
  shapes that don't exist on the rowboat `Folder` row.

None of the above were edited, per the task brief (only `folder.ts`/`folderOps.ts`/the hook
file were added/rewritten this slice).

## Concerns

- **No sibling ordering column.** `moveNodeToIndex`'s `index` argument is currently ignored;
  reordering needs a `position`/`fracKey` column (per `docs/data-layer.md` §1a "Ordered
  list") added to `Folder` in a follow-up slice, or TreeView's drag-reorder UX regresses to
  "always append."
- **`addFolder`'s `mintGroup` is unimplemented** at the call-site level — this hook throws if
  it's omitted, which is correct per NO FALLBACKS, but means `addFolder` is not callable
  from real UI until the backend folder-group route (a later task) is wired in and passed
  through the provider.
- **Items/sessions are out of `Folder` entirely** — `isTemplateFolder`/`type` still exist as
  a discriminator, but nothing in this slice stores template contents. That's the correct
  scope per the task ("slice 1"), but it means `duplicateTemplate`/`getAllTemplateFolders`
  can't be honestly ported until that data model exists — they're not stubbed with a
  fallback, they're simply absent, and consumers will TS-error until the next slice.
- **`createdBy`/`mintGroup` sourcing** — the hook now requires an options object
  (`{ createdBy, mintGroup, showArchived }`) instead of a Jazz `Account`. There is no
  rowboat auth/identity concept wired up yet in this repo to source `createdBy` from, so
  callers will need to thread it through from whatever auth context lands alongside the
  provider task.
