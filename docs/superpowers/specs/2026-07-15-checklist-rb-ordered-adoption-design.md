# Checklist adoption of `rb.ordered` — concurrency-safe `items` / `sessions`

**Date:** 2026-07-15
**Status:** design (approved to plan+implement)
**Repo:** checklist. Depends on rowboat `rb.ordered` (LANDED, rowboat main `0324c4f`; schema `ordered`/`rb.ordered` + client `orderedList` are in the installed `@jbroll/rowboat-*` dists).
**Resolves:** `docs/DEFERRED.md` **D1** (concurrency data-loss on lists). See rowboat design `docs/superpowers/specs/2026-07-15-rb-ordered-design.md`.

## Problem

`shared/schema.ts` stores each template folder's `items` and `sessions` as `rb.json(z.array(...))`
columns. Every mutation rewrites the **whole column**:

- `sessionService.updateSession` → `g.folder.update(id, { sessions: entireArray })`
- `templateService` item ops → `g.folder.update(id, { items: entireArray })`
- `default_items` writes → whole-record rewrite

A whole-cell write is a clockless op the engine resolves as **whole-value LWW**. Two clients
(multi-device, or a shared list) editing **different** items concurrently **silently clobber each
other** — one edit is lost. Verified by the rowboat characterization suite
(`@jbroll/rowboat-integration/json-merge-characterization.test.ts`, scenario 1). Positional
`z.array` indexing is also unstable under concurrent insert/move.

`rb.ordered` stores the list as a **keyed map** and lowers every operation to a **field-level
dotted-path write**, so concurrent edits merge via the engine's existing per-path LWW. The engine is
untouched.

## Goals / non-goals

**Goals**
- `items` and `sessions` become `rb.ordered`; every update is a field-level write (no whole-cell clobber).
- Ordering moves to `rb.ordered`'s `__order` fracKey; the integer `sortOrder` field is removed.
- `default_items` and per-session `itemStates` stay keyed-map records, but their **writes** become field-level.
- App-level concurrent-merge test mirroring the rowboat integration invariant.

**Non-goals**
- No sync-engine / backend changes (`rb.ordered` compiles to a `type:"json"` column).
- No data migration — existing synced data is discarded (product decision; DEFERRED D1 + D4).
- No change to the `path`-based category hierarchy (`TemplateItem.path`, `PATH_SEPARATOR`) — that stays.

## Schema (`shared/schema.ts`)

```ts
// before
items: rb.json(z.array(TemplateItemSchema)),
sessions: rb.json(z.array(SessionDataSchema)),
// after
items: rb.ordered(TemplateItemSchema, { key: 'id' }),
sessions: rb.ordered(SessionDataSchema, { key: 'id' }),
```

- Remove `sortOrder: z.number()` from `TemplateItemSchema` (ordering is now `__order`).
- `default_items: rb.json(z.record(z.string(), z.boolean()))` — **unchanged shape**; writes become field-level.
- `SessionDataSchema.itemStates: z.record(...)` — **unchanged shape** (nested keyed map); writes become field-level.
- Sessions have no manual reorder; they display by `lastActivityAt` (a normal field). For sessions, `__order` only provides stable append order — display sorting continues to use `lastActivityAt`.

### Storage shape

Each ordered column persists as one JSON cell, per-path mergeable:
```
{ [element.id]: { ...element, __order: "<fracKey>", __deleted?: true } }
```
`create` still writes the whole (empty) cell — correct, there is no base to merge; only *updates*
must be field-level, and the `orderedList` API only ever emits field-level ops on update.

## Read layer (`src/schema/folderData.ts`)

`items`/`sessions` now deserialize from a keyed map, not an array:
```ts
items:    orderedToArray(parseJsonColumn(row.items, {})),
sessions: orderedToArray(parseJsonColumn(row.sessions, {})),
```
`orderedToArray` (from `@jbroll/rowboat-client`) returns elements sorted by `__order`, with
`__deleted` tombstones filtered out and `__order`/`__deleted` stripped. The surfaced shape stays a
plain `TemplateItem[]` / `SessionData[]`, so most consumers are unaffected.

## Ordering: `sortOrder` → `__order` (the main read-path change)

Checklist already does hand-rolled fractional indexing on a float `sortOrder`
(`templateService.calculateInsertionPoint` averages neighbours; `reorderTemplateItem` too).
`__order` is the robust string fracKey version of the same idea. Removing `sortOrder` touches:

- **`templateService.ts`**
  - `createTemplateItem` — drop `sortOrder` assignment; append via `orderedList.append` (mints `__order`).
  - `calculateInsertionPoint` — return a **position** (`{ parentPath, after?: id, before?: id }`) instead of a numeric `sortOrder`; callers pass it to `orderedList.append`/`move`.
  - `reorderTemplateItem` — `orderedList.move(id, { after | before })`.
  - `moveTemplateItem` — path change via `setField('path', …)`; reorder via `move`.
- **`categoryTreeBuilder.ts`** — items already arrive in `__order` order from `orderedToArray`; within a `path` group, sort by their index in that array (preserves relative `__order`). Category order derives from its first child's array index (replacing the current "first item's sortOrder" fallback), then name.
- **`useSessionItems.ts` / `useSessionHandlers.ts`** — replace `sortOrder` comparisons/insertion with array-order + the new position-based insertion point.

## Write layer — field-level via `orderedList`

Wire a helper per column:
```ts
const items = orderedList({
  path: 'items', key: 'id',
  read: () => (g.folder(id).$data.items ?? {}) as Record<string, OrderedElement>,
  update: (changes) => g.folder.update(id, { ...changes, updated_at: Date.now() }),
});
```
Rewrite the write paths off whole-array/whole-record writes:

| service | op | new call |
|---|---|---|
| `templateService` | add item | `items.append(el)` |
| `templateService` | edit field (name/qty/notes/archive) | `items.setField(id, field, value)` |
| `templateService` | reorder / move | `items.move(id, { after \| before })` |
| `templateService` | delete | `items.remove(id)` (soft delete stays `archived:true` via `setField`; `remove` reserved for true tombstone if needed) |
| `templateService` | default toggle | `g.folder.update(id, { ['default_items.'+itemId]: bool })` |
| `sessionService` | create session | `sessions.append(sessionObj)` |
| `sessionService` | check / select item | `sessions.setField(sid, 'itemStates.'+itemId+'.checked', true)` (dotted sub-path) |
| `sessionService` | session field (counts, viewMode, archived) | `sessions.setField(sid, field, value)` |
| `folderOps` | fresh folder | `create` with `items: {}`, `sessions: {}`, `default_items: {}` |

`setField`'s `field` is interpolated into the path, so nested sub-paths
(`itemStates.<itemId>.checked`) work directly — no whole-`itemStates` rewrite.

## Migration / rollout

**None.** Existing synced data is discarded (product decision; DEFERRED D1 + D4). Dev/CI start
fresh. This lands as its own spec→plan→implement cycle; the schema column-type change (array→map) is
not backward-compatible with existing rows and is not migrated.

## Testing strategy

- **App-level concurrent-merge test** (new) — two graphs over the same folder: client A checks item X
  while client B checks item Y; after sync both survive (mirrors the rowboat integration invariant at
  app level). Same for concurrent add + reorder.
- **Read layer** — `folderData` maps a keyed-map cell → sorted, tombstone-filtered array.
- **Ordering** — `categoryTreeBuilder` / `useSessionItems` produce correct order from `__order` array
  order with no `sortOrder`; insertion-point positions land items between the right neighbours.
- **Existing suites** — `sessionService.*.test.ts`, `templateService.test.ts`, `categoryTreeBuilder.test.ts`
  updated for the new schema/order model; full `npm run check` green.

## Risks / open

- **`sortOrder` removal breadth** — it threads through templateService insertion, categoryTreeBuilder,
  and the session hooks/tests. The plan enumerates every site; this is the largest surface.
- **`create` empty-cell shape** — verify `rb.ordered` create takes an empty map (`{}`); folderOps
  currently passes `[]`. Confirm during the plan's first task.
- **`orderedList` read source** — `read()` must resolve the live keyed map from `g.folder(id).$data`
  (raw cell), not the already-`orderedToArray`'d value exposed by `folderData`.
- **fracKey exhaustion / rebalance** on pathological insert patterns — reuse rowboat `frac-key.ts`
  strategy; not new to this feature.
