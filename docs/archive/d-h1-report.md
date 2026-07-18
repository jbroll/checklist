# D-H1: rowboat unit test harness + slice-1 test port

Branch `rowboat-port-slice-1`. Goal: swap checklist's unit test harness from the Jazz mock
(`jazz-mock`) to rowboat, port the slice-1 tests, and quarantine (skip-pending, not delete)
anything still on the Jazz path. `npx vitest run` is green (0 failing); `npx tsc --noEmit` is
0 errors.

## Harness design

**`src/test/setup.ts`** (rewritten): kept the jsdom globals (`alert`/`confirm`/`matchMedia`/
`localStorage`) and the `vi.mock('@/lib/auth-client', ...)` stub, expanded to mirror the full
shape `@jbroll/rowboat-auth-betterauth-react`'s `createBetterAuthClient()` exposes
(`signIn.social`/`signIn.email`/`signUp.email`/`signOut`/`getSession`/`requestPasswordReset`/
`resetPassword`/`sendVerificationEmail` — checked against every `betterAuthClient.*` call site
under `src/components/auth/`). Removed the `jazz-mock`/`jazz-mock/vitest` imports and
`JazzTestContext` re-export entirely. Dropped the Jazz console-noise filter — `console.error`/
`console.warn` are real now (only `log`/`info` are suppressed, same as before, unless
`VITEST_DEBUG`), so a genuine React/test error is never swallowed.

**`src/test/jazz-testing.ts`**: deleted (the `JazzTestContext`/mock-CoValue Group-RBAC
harness). Its only consumer was `folderPermissions.test.ts`, retired below.

**`src/test/rowboat.ts`** (new): the actual rowboat harness.
- `makeGraph(seed?)` = `relational(schema, reactiveArrayStore(seed))` over `@/schema/folder` —
  identical to the pattern already proven in `folderOps.test.ts`.
- `renderWithRowboat(ui, { seed })` — renders a component against a fresh in-memory graph.
- `rowboatJazzMock(options?)` — the body for `vi.mock('@/jazz', ...)`. Component/hook tests
  that need the graph do:
  ```ts
  vi.mock('@/jazz', async () => {
    const { rowboatJazzMock } = await import('@/test/rowboat');
    return rowboatJazzMock();
  });
  ```
  (dynamic `import()` inside the factory, not a static top-level import, because `vi.mock`
  factories run before other top-level bindings are guaranteed initialized — a plain import
  reference there is not reliable). `useRowboat()`/`useSelect()` in the mock resolve against
  whatever graph `renderWithRowboat`/`setActiveGraph` last activated; **`useSelect` is the
  real `@jbroll/rowboat-react` selector**, so subscription/re-render behavior matches
  production — only the React-context plumbing that `@/lib/jazz.tsx`'s `JazzProvider` would
  normally supply (which needs a live IndexedDB `RowboatDb` and a `syncWithServer` interval,
  neither available nor desired under jsdom) is faked.

  Deviation from the task's literal ask ("a test provider that supplies the same graph the
  hook reads"): `@/jazz`'s `PortContext` is not exported from `src/lib/jazz.tsx` (deliberately
  — see that file's header), so there's no way to inject into the *real* context from a test.
  `vi.mock('@/jazz', ...)` is the practical equivalent: same effect (the hook reads the test
  graph), different mechanism (module mock instead of a React Provider wrapping the tree).

- `getActiveGraph()`/`setActiveGraph()` are exported directly too, for tests (like the new
  hook test) that call `renderHook` themselves instead of using `renderWithRowboat`.
- Hard-errors (no fallback) if a component reaches for the graph before a test graph is
  active — a real bug (missing `renderWithRowboat`/`setActiveGraph`), not something to paper
  over with an empty graph.

## Slice-1 tests ported

- **`src/components/AuthGate.test.tsx`**: re-targeted from `jazz-tools/react`
  (`useAccount`/`useIsAuthenticated`/`useLogOut`) to `vi.mock('@/jazz', ...)` providing
  `useAuthor`/`useSession`/`signIn`/`signOut` directly (AuthGate no longer calls
  `useCheckListHierarchy`/`deleteAllUserData` at all — that plumbing was dropped when the
  component was ported, so the old "cleans up Jazz data" assertions were dropped too). Loading
  state changed from "renders `LoadingScreen`" to "renders nothing" (`session.isPending`) to
  match the current component. All 19 tests pass.
- **`src/components/tree/FolderNodeView.test.tsx`**: rewritten to render against plain
  `FolderRow` literals (mirrors `ShareDialog.test.tsx`'s pattern) instead of jazz-mock
  CoValues — the component takes `folder: FolderRow` as a prop and never touches
  `useRowboat`/`useSelect` itself, so no graph/provider is needed at all. Dropped
  item-count/duplicate/import/export/share/autocomplete-domain assertions (those menu items
  were removed from the component along with the Jazz items/sessions surface); kept
  rename/archive/restore/delete, drag-and-drop stubs, selection, and edit-mode coverage, plus
  one added case (`hides archive/restore option when hideArchiveAction is true`). 17 tests
  pass.
- **NEW `src/hooks/__tests__/useCheckListHierarchy.test.tsx`**: `renderHook` over
  `@/jazz`-mocked `useRowboat`/`useSelect` and a fresh `makeGraph()`. Covers: `addFolder`
  (mints via an injected `mintGroup` stub, hard-errors without one — asserts the "NO
  FALLBACKS" contract documented in the hook's header), `renameNode`, `moveNode` (+
  `childrenOf` reflecting the reparent), `deleteNode`, and `archiveNode`/`unarchiveNode`
  interacting with `showArchived` — all reactive through `folders`/`findById`, i.e. exercising
  the real `useSelect` subscription, not just the underlying `folderOps` functions (those have
  their own direct coverage in `folderOps.test.ts`). 6 tests pass.
- **`src/App.test.tsx`**: rewritten. Its only prior test asserted `?merge=` routes to
  `MergeAccountFlow` — but that routing was removed entirely when `App.tsx` was ported (merge
  still reads a Jazz `Account`; deferred to rowboat C3, see App.tsx's own header TODO). Replaced
  with two tests matching what's actually wired now: default route renders `AuthGate`, and the
  in-app-browser gate still blocks it. 2 tests pass.

## folderPermissions.test.ts — disposition: RETIRED (deleted)

`src/services/folderPermissions.test.ts` tested Jazz per-node `Group` RBAC
(`ctx.canAdmin`/`canRead`/`canWrite`, `shareFolder`, nested-group inheritance) entirely through
`JazzTestContext`. That concern doesn't exist in checklist anymore — scope/role resolution for
rowboat folders lives in the rowboat auth/sharing packages
(`@jbroll/rowboat-auth-betterauth-react`, `@jbroll/rowboat-sharing-react`), which have their own
test coverage upstream. There is no rowboat-side equivalent to port in checklist (a folder's
`owner_group_id` is just a plain string column — `shared/schema.ts`'s `rb.scope()` — not a
CoValue `Group` with methods), so I deleted the file rather than writing a placebo smoke test.
Its sibling `src/test/jazz-testing.ts` (the harness it exclusively used) was deleted alongside
it.

## Quarantined files (skip-pending, NOT deleted)

All wrapped in `describe.skip(...)` with a `TODO(slice-2): ... (see
docs/superpowers/d-t4-report.md)` comment at the skip site, tracking the later-slice feature
each depends on. Where a file's top-level code called the now-removed `@/test/setup`
`createMockCoMap`/`createMockCoList` re-exports, I replaced the import with a small local
stub of the same two functions (plain-object-returning, no `jazz-mock` dependency) — needed
because a few call sites ran eagerly during `describe()` collection (before `.skip` has a
chance to matter), not just inside `it()`/`beforeEach()` bodies.

| File | Feature (slice) |
|---|---|
| `src/components/billing/UpgradeBanner.test.tsx` | billing/subscription UI (slice-2) |
| `src/components/billing/UpgradeDialog.test.tsx` | billing/subscription UI (slice-2) |
| `src/components/session/SessionView.test.tsx` | sessions/items (slice-2) |
| `src/components/session/SessionZone.test.tsx` | sessions/items (slice-2) |
| `src/services/sessionService.batchSelect.test.ts` | sessions/items (slice-2) |
| `src/services/sessionService.core.test.ts` | sessions/items (slice-2) |
| `src/services/sessionService.lifecycle.test.ts` | sessions/items (slice-2) |
| `src/services/subscriptionService.test.ts` (2 `describe` blocks) | billing/subscription (slice-2) |
| `src/services/export/exportService.test.ts` | export (slice-2/3) |
| `src/services/export/jsonExporter.test.ts` | export (slice-2/3) |
| `src/services/itemService.test.ts` | items (via `templateService`, slice-2) |
| `src/services/templateService.test.ts` | items/templates (slice-2) |

12 files, 13 `describe.skip` blocks total, 390 individual tests skipped.

**Checked but left untouched (already green, out of scope for this task):**
`src/lib/__tests__/account-merge.test.ts` and
`src/components/auth/__tests__/MergeAccountFlow.test.tsx` — both currently pass (they don't
touch the removed `@/test/setup` jazz-mock exports), so no quarantine action was needed despite
being named as a "check if failing" item in the task. Likewise
`src/components/session/SessionItemRow.test.tsx` and the several `src/components/session/*.test.ts`
pure-logic files (`categoryTreeBuilder`, `categoryTreeUtils`, `useNoteEditor`,
`useScrollPreservation`, `useSessionHandlers`, `useSessionItems`, `useViewMode`) — jazz-agnostic
and still green, left as-is. `src/services/import/**`, `src/services/userSettingsService.test.ts`,
`src/services/viewStateService.test.ts`, `src/services/sessionCleanupService.test.ts` all define
their own local `createMockAccount`-style helpers (never touched `@/test/setup`), so they were
unaffected by the harness swap and remain green without any edit.

## Final `vitest run` counts

```
Test Files  59 passed | 12 skipped (71)
     Tests  1183 passed | 390 skipped (1573)
```

0 failing. `npx tsc --noEmit`: 0 errors.

## Concerns / follow-ups

- The `vi.mock('@/jazz', ...)` pattern (module mock instead of a real context Provider) means
  a test can't exercise `JazzProvider` itself — that's expected (it needs a live browser
  IndexedDB + timers) but worth flagging in case a future slice wants an
  `@jbroll/rowboat-client`/fake-IndexedDB integration test instead of a unit test for the
  provider's own sync-loop wiring.
- `folderPermissions.test.ts` deletion means checklist now has **zero** local test coverage
  asserting that a folder's `owner_group_id` actually gates read/write — that coverage now
  lives entirely upstream in rowboat's own packages. If checklist ever wants a smoke-level
  regression guard for "a folder created with group A is not writable under group B", it
  would need to be written fresh against the real `@jbroll/rowboat-sharing-react`/backend
  routes, not resurrected from the deleted Jazz-RBAC test.
- 390 skipped tests is a large quarantined surface (mostly items/sessions/export/billing,
  i.e. exactly the slice-2/3 backlog). None were deleted; every skip site names the tracking
  doc.
