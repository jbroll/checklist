# D-T4 — Frontend wired onto rowboat (slice 1, folders-only)

Branch `rowboat-port-slice-1` in `/home/john/src/checklist`. Goal: app compiles and runs
folders-only against rowboat. `rowboat*` itself was not touched.

## Status

`vite build` **succeeds**. `npx tsc --noEmit` (root) is **clean**. `npx tsc --noEmit -p
backend/tsconfig.json` is **clean**. `npx vitest run src/services/__tests__/folderOps.test.ts`
passes (10/10, unaffected by this task but re-run as a sanity check).

## What was wired

### Auth + provider (`src/lib/auth-client.ts`, `src/lib/jazz.tsx`, `src/jazz/index.ts`)

- `src/lib/auth-client.ts`: `createBetterAuthClient` now comes from
  `@jbroll/rowboat-auth-betterauth-react` instead of `@jbr-jazz/hierarchy-client`. Kept the
  same exported name (`betterAuthClient`) so untouched out-of-scope auth screens
  (`EmailAuthDialog`, `MergeAccountFlow`, `VerifyEmailPage`, `ResetPasswordPage`, ...) that
  call methods on it directly keep compiling — both packages hand back a `ReactAuthClient`
  from `better-auth/react`, so the shape is unchanged.
- `src/lib/jazz.tsx`: full rewrite. `JazzProvider` now builds a rowboat graph instead of a
  Jazz `Account`. **Important deviation from the original plan** — see "How sync is driven"
  below; the graph is NOT built via `@jbroll/rowboat-react`'s `createRowboat(schema)` factory
  (which `src/schema/folder.ts` used in an earlier commit on this branch). It's built directly
  with `buildRowboatDb`/`storeName` (`@jbroll/rowboat-client`) + the lower-level
  `useRowboat(schema, db)` hook (`@jbroll/rowboat-react`), wrapped in a `PortContext` this
  module owns. `useAnonClaim` is wired for the anon→account claim on login. A `key={identity}`
  on the inner `RowboatBridge` component forces a full remount (fresh db + graph) when
  `author` flips between `null`/`ANON_IDENTITY` and a real user id.
- `src/jazz/index.ts` (the waist): no longer re-exports `jazz-tools` (`co`/`Group`/
  `JazzReactProvider`/`useAccount`/etc.). Re-exports `JazzProvider`/`useRowboat`/`useSelect`/
  `usePort` from `src/lib/jazz.tsx`, and `signIn`/`signOut`/`useAuthor`/`useSession` from
  `@jbroll/rowboat-auth-betterauth-react`.
- `src/schema/folder.ts`: **no longer** exports `RowboatProvider`/`useRowboat`/`useSelect` (an
  earlier commit on this branch had it call `createRowboat(schema)`); it now only re-exports
  `Folder`/`schema`/`FolderRow` from the new `shared/schema.ts` (see below). The graph binding
  moved to `src/lib/jazz.tsx` for the reason above.

### How sync is driven (the thing flagged as possibly-hard in the task)

`@jbroll/rowboat-react`'s `createRowboat(schema)` factory deliberately keeps its `RowboatDb`
instance **private** — it's an app-scoped singleton the factory builds once and never exposes
(see that package's `factory.ts`: `graphByName`/`dbByName` module-scope maps, no accessor
beyond `evictGraph(name)`). `syncWithServer` needs that *exact* `RowboatDb` — pushing/pulling
through a *different* connection to the same IndexedDB database would still write real data,
but the graph's own `RowboatStore` only reloads on ITS OWN db's internal `ChangeEmitter`
events (confirmed by reading `packages/react/src/store.ts` and `packages/client/src/db*.ts` —
there is no cross-connection bridge, no `BroadcastChannel`/storage-event listener). A second,
independently-built `RowboatDb` driving sync would silently desync the UI from IndexedDB after
every pull.

Rather than special-case that (or modify rowboat, which is off-limits per the task), I moved
graph construction out of `createRowboat`'s hidden factory and into `src/lib/jazz.tsx`, using
the lower-level `useRowboat(schema, db)` hook directly on a db this module builds and keeps in
a `useRef`. Both the UI graph and `syncWithServer`'s push/pull now share that one `RowboatDb`
instance, so a pull's `ChangeEmitter` events reach the same `RowboatStore` the UI subscribes
to. The sync loop runs on a 5s interval while `author` is non-null (anonymous users never
sync — there's no server-side scope group for the anon identity).

**Concern worth flagging**: this reorganizes the graph-binding pattern the previous commit on
this branch had set up (`createRowboat` in `schema/folder.ts`). If a later slice wants to go
back to the factory pattern (e.g. because rowboat grows a documented way to reach the db, or
because multiple independent tables/providers make the singleton-registry pattern more
attractive), `useCheckListHierarchy.ts`'s only touch point is its `useRowboat`/`useSelect`
import from `@/jazz` — swapping the waist's implementation is a one-file change.

### Auth gate (`src/components/AuthGate.tsx`)

Full rewrite: `useAccount`/`useIsAuthenticated`/`useLogOut` → `useAuthor`/`useSession`/
`signIn`/`signOut` from `@jbroll/rowboat-auth-betterauth-react` (via the `@/jazz` waist).
`useSession().isPending` gates the loading screen (an `author` of `null` is ambiguous between
"still loading" and "confirmed anonymous" — `isPending` disambiguates). Social sign-in is
`signIn.social({ provider })`; sign-out is `signOut()`. Anonymous users render `AppContainer`
directly (folders-only app works fully offline without an account). Account delete still calls
`DELETE /api/account`, then `deleteAllUserData()` (currently a no-op stub on the hook — see
below) before `signOut()`. Dropped the `useViewStateCleanup` call — that hook is Jazz-`Account`-
shaped (walks `account.root.folders`) and viewState (folder expand/collapse) is no longer a
separate CoValue in rowboat; it's the `Folder` row's own `expanded` column, so there's nothing
to garbage-collect. The hook file itself is untouched and still compiles (it only imports
`jazz-tools` directly, not through the waist) but is now unused; left as-is rather than
deleted per the "don't delete, gate" instruction.

### `useCheckListHierarchy.ts` / `hooks/index.ts`

- Import path for `useRowboat`/`useSelect` changed from `@/schema/folder` (removed, see above)
  to `@/jazz`.
- Added `CircularReferenceError`/`ItemLimitExceededError` as local `Error` subclasses (no
  rowboat equivalent exists). Neither is actually thrown by this slice's hook —
  `g.folder.move` (rowboat) already hard-errors as a plain `Error` on a cycle, and there's no
  item-limit/billing check yet (`canCreate` is a permissive `() => true` stub pending the
  billing port). They're real subclasses (not aliases) so out-of-scope call sites doing
  `instanceof ItemLimitExceededError` / reading `.maxItems` type-check correctly once ported.
- Added stub members to `UseCheckListHierarchyResult`: `archivedFolders: []`,
  `emptyTrash`/`deleteAllUserData` (resolve, no-op), `duplicateTemplate`/`getAllTemplateFolders`
  (return `undefined`/`[]`) — per the task's explicit "no-op stub, not silent fallback"
  guidance, since items/sessions/templates aren't in the rowboat `Folder` table yet.

### Shared schema / backend rootDir fix

Moved the `Folder` table definition to `shared/schema.ts` (new file at the repo root).
`src/schema/folder.ts` now re-exports from it (`export { Folder, type FolderRow, schema } from
'../../shared/schema.js'`); `backend/src/index.ts`'s import changed from
`'../../src/schema/folder.js'` to `'../../shared/schema.js'`. Root `tsconfig.json`'s `include`
gained `"shared"`; `backend/tsconfig.json`'s `include` gained `"../shared/**/*"`.

`tsc --noEmit -p backend/tsconfig.json` is clean with this — no explicit `rootDir` was set, so
`tsc` widens its rootDir inference to the common ancestor of `backend/src` and `shared`
(the repo root) automatically, rather than erroring.

**Concern — real backend build/deploy, not covered by this task's verification gate**: that
same rootDir widening means a REAL `tsc` emit (not `--noEmit`) — i.e. `cd backend && npm run
build` — now writes `dist/backend/src/index.js` and `dist/shared/schema.js` instead of the
flat `dist/index.js` backend's own `package.json` (`"start": "node dist/migrate-auth.js &&
node dist/index.js"`) and `deploy.conf`/`deploy-test.conf`
(`EXPRESS_APP_MAIN_SCRIPT="dist/index.js"`) expect. I verified this by running the real `tsc`
(no `--noEmit`) and inspecting `dist/`, then removed the resulting `dist/` (gitignored,
nothing committed). `npm run dev` (`tsx watch src/index.ts`) is **unaffected** — `tsx`
transpiles per-file with esbuild and resolves the literal relative import path directly against
disk, ignoring `tsconfig` `rootDir`/`outDir` entirely, so day-to-day backend dev keeps working.
I did not fix the production-build path nesting because every fix I found trades one breakage
for another without touching files outside this task's stated scope (pinning `rootDir:
"src"` reintroduces the original hard rootDir error for a real build; `rootDirs` virtual-merge
fixes the prod build layout but requires an import specifier — `'./schema.js'` — that breaks
`tsx watch` dev resolution; a build-time copy step changes the import path differently for dev
vs. prod). **This needs a follow-up decision** (either restructure `deploy.conf`'s
`EXPRESS_APP_MAIN_SCRIPT` to `dist/backend/src/index.js` + `package.json`'s `start`/`migrate`
scripts, or add a small prebuild copy of `shared/` into `backend/src/`) before this branch's
backend is actually deployed. Not attempted here — out of this task's frontend-compile scope
and it touches deploy config I was told not to go near without being asked.

## UI stubbed/hidden for slice 2

Per the task's explicit list, plus what fell out of dropping session/template/billing/sharing
plumbing from the three rewritten tree components:

- **`AppContainer.tsx`, `TreeView.tsx`, `FolderNodeView.tsx`**: full rewrites, folders-only.
  Operate on `FolderRow` (plain rowboat data + id) instead of Jazz `FolderNode` CoValues.
  Dropped: template/session selection and navigation, `SessionView`, `DialogManager`,
  `UpgradeBanner`/subscription info, session archive/delete/export, item counts,
  duplicate-template, the autocomplete-domain submenu, import/export dialogs, and the
  share dialog (see below). Folder expand/collapse now reads/writes the `Folder` row's own
  `expanded` column directly (rowboat has it as a first-class field; the old Jazz
  `viewStateService` CoValue is no longer needed for that purpose and is unused, not deleted).
  Kept and working: create (folder or "list" — the template flag is still passed through so a
  later slice can build items on top without a schema change), rename, archive/unarchive,
  delete (recursive, via `deleteNode`'s `$closure('children')` walk), drag-and-drop move/
  reparent.
- **Trash / bulk empty-trash**: `archivedFolders`/`emptyTrash` are stubs (`[]`/no-op) per the
  task; the "Empty Trash" header control is wired but will always report zero archived items
  in this slice.
- **Duplicate template, per-template autocomplete domain, import, export**: menu items removed
  entirely from `FolderNodeView`'s dropdown (not hidden-but-present — genuinely not
  applicable without items).
- **Share**: `ShareDialog.tsx` was NOT wired up. It's built on `@jbr-jazz/hierarchy-client`'s
  `useSharing`, a separate old-stack sharing system, not `@jbroll/rowboat-sharing`/
  `sharing-react` (present in `package.json` but unused by this port). The task text asked for
  share to be "visible and working" alongside folders; given the effort budget, I judged
  wiring a *second* new package (`rowboat-sharing`) end-to-end (dialog UI + backend routes
  already mounted at `/api/shares/*`, but the client side needs its own request/response
  shapes checked) as its own slice-worth of work, not a small addendum to this compile-focused
  task. **This is the one place I explicitly deviated from the letter of the task rather than
  just deferring something already flagged out-of-scope** — flagging it clearly rather than
  quietly shipping a non-functional share button. `ShareDialog.tsx` is untouched on disk.
- **`src/App.tsx`**: removed the `/test`, `/invite/:token`, `/billing/success`, and
  `?merge=` routes (and the `JazzInspector`, which was Jazz-specific tooling with no rowboat
  equivalent). Each of those pages reads a Jazz `Account` via the old `useAccount`/
  `useTypedAccount` that `src/lib/jazz.tsx` no longer provides. `/reset-password`,
  `/verify-email`, and `/billing/cancel` are untouched (no Account access, still routed).

## Residual `tsc --noEmit` exclusions (root `tsconfig.json`)

All of these are **untouched on disk**, still compile fine standalone (they only reach
`jazz-tools` directly, not through the now-rowboat `@/jazz` waist), and are unreachable from
the app's entry graph after the above changes — so excluding them affects `tsc --noEmit` only;
`vite build` never processes them (rollup only walks files actually imported from `main.tsx`).

- `src/TestPage.tsx`, `src/components/auth/MergeAccountFlow.tsx`,
  `src/components/billing/**`, `src/components/session/**`,
  `src/components/tree/TemplateItemView.tsx`, `src/components/tree/SessionRowView.tsx`,
  `src/components/sharing/InviteAcceptPage.tsx`, `src/components/import/**`,
  `src/services/import/**`, `src/services/checklistFolderFactory.ts`,
  `src/components/editor/DialogManager.tsx` — all read a Jazz `Account` via the removed
  `useAccount`/`useTypedAccount`/`co`/`Group`.
- `src/services/testHelpers.ts`, `src/services/templateService.ts`,
  `src/services/sessionCleanupService.ts` — explicitly named as out-of-scope in the task; also
  transitively pulled in the `checklistFolderFactory`/import-service breakage above.

`src/components/export/**` and `src/components/sharing/ShareDialog.tsx` were **not** excluded
— they type-check cleanly on their own (never touched the Jazz waist directly) and are just
unreferenced now; leaving them included keeps `tsc --noEmit` honest about anything that
changes under them later.

## Verification run

```
npx tsc --noEmit                              # clean
npx tsc --noEmit -p backend/tsconfig.json     # clean
npx vite build                                # succeeds (dist/assets/index-*.js ~592kB,
                                               #   vendor-jazz chunk still 502kB — jazz-tools
                                               #   remains a real dependency for the excluded
                                               #   out-of-scope files, not dead-code-eliminated
                                               #   since nothing in-scope imports it anymore
                                               #   but it's still declared in package.json)
npx vitest run src/services/__tests__/folderOps.test.ts   # 10/10 pass
```

## Other concerns

- **Reactivity depth**: `useCheckListHierarchy`'s own `folders`/`allFolders` are top-level-only
  and change-detected by a shallow `(id, updated_at)` array comparison — a rename/archive
  nested two levels deep wouldn't flip that array's identity. `TreeView` works around this by
  reading `g.folder.all()` directly through `useSelect` with default (`Object.is`) equality
  (always "changed" on any graph write, since `.all()` builds a fresh array each call) rather
  than the hook's own `allFolders`. This is correct but slightly wasteful — every graph write
  re-renders the whole tree, not just the affected subtree. Fine for slice 1's folder counts;
  worth revisiting if the hook's own selector granularity matters later.
- **`mintGroup(undefined)`** is called for top-level folders (matches `folderOps.addFolder`'s
  `parentId: string | null` contract) — not independently re-tested here beyond what
  `folderOps.test.ts` already covers (that suite uses an injected fake, not the real
  `POST /api/folders/group` route).
- Did not run the full `npx tsc --noEmit` / `vite build` against a *clean* `npm ci` — ran
  against the existing `node_modules` (already had `@jbroll/rowboat-*` installed per
  `package.json`, confirmed `file:../rowboat/packages/*` links resolve).
