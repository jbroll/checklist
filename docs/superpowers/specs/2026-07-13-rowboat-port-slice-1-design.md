# Checklist → rowboat port, Slice 1 (folders tree + per-folder sharing) — design

**Date:** 2026-07-13
**Status:** DESIGN. **Sub-project D** of the checklist→rowboat port. Ports checklist off Jazz/`jbr-jazz`
onto the rowboat packages (A/B/C1/C2, all landed on rowboat `main`). This is **slice 1** of an incremental
port: the **folders tree (create/rename/move/delete) + per-folder sharing**, end-to-end on rowboat.
Items/sessions/templates/subscription/import-export and the profile/view-state store are **later slices**.

## Context

checklist runs on Jazz: `FolderNode` (a recursive `co.map`) hanging off `Account.root.folders`, a Jazz
sync peer (`wss://cloud.jazz.tools`), better-auth via `jazz-tools/better-auth`, and `jbr-jazz`'s
`useHierarchy`/`useSharing`/`createNodeGroup`. rowboat now provides equivalents: a scope-column + group-RBAC
model (A), sharing (B), a better-auth identity core with the first real self-hosted session sync boundary
(C1), and anonymous-claim (C2). **The port is a rewrite of the data layer, not a swap** — Jazz's `$jazz.*`
CoValue-mutation API maps onto rowboat's relational graph + `create/update/remove/move` (A).

## Slice-1 scope

**In:** the folders tree on rowboat — model `Folder` as an `rb.*` table; folder CRUD + move via the
relational graph; a `useCheckListHierarchy`-compatible adapter so the tree UI is minimally changed; the
provider/auth/anon wiring (RowboatProvider + C1 auth + C2 anon-claim); the self-hosted backend (rowboat
mount fns replacing `createHierarchyServer`); per-folder sharing via B's `useSharing`.

**Out (later slices):** `items[]`/`sessions[]`/templates (the folder payload), subscription/billing limits,
import/export, autocomplete/categorization, the `profile`/`ViewState` synced store (slice 2 — but the
scope-group convention is established here), account-merge (rowboat C3).

## Data model — `Folder` (`rb.*`), replacing `FolderNode`

Flat table (rowboat forbids nested CoLists; the tree is a self-FK):
```
Folder = {
  id:           rb.id(),
  owner_group_id: rb.scope(),         // THIS folder's own scope group (per-node group, see sharing)
  name:         rb.text(),
  type:         rb.text(),            // "folder" | "template-folder"
  parent_id:    rb.parent("folder"),  // the tree: .children()/.parent()/cycle-checked move()
  sharing_mode: rb.text(),            // "private" | "shared" | "public"
  archived:     rb.bool(),
  expanded:     rb.bool(),            // NOTE: per-folder expand persists here for slice-1 simplicity;
                                       // slice-2 may move per-device expand to a local store
  created_by:   rb.text(),
  created_at:   rb.int(), updated_at: rb.int(),
}
```
- **No account-root object.** The tree isn't `root.folders`; top-level folders are `parent_id IS NULL`
  within the user's scope. `hierarchyNodeBaseFields` (spread from `@jbr-jazz/hierarchy-shared`) is replaced
  by these explicit columns (same names where they carry over: name/sharingMode→sharing_mode/archived/
  createdBy→created_by/timestamps).
- Compile with `compileSchema`; drive React with `createRowboat(schema)` → `{ RowboatProvider, useRowboat,
  useSelect }`.

## Per-folder scope groups (sharing granularity)

Each folder is **its own scope group** so it can be shared independently (checklist's per-node model):
- `addFolder` → `createScopeGroup(actor=user.id, group=<newFolderGroupId>, parentGroup=<parentFolderGroup
  || user.id>)` (A's ergonomic; the parent's group gives inheritance — collaborators on a parent folder see
  children), then `g.folder.create({ id, owner_group_id: newFolderGroupId, parent_id, name, type, ... })`.
- The user's **root group = `user.id`** (auto-provisioned at signup, C2); top-level folders link under it.
- `createScopeGroup` is a **server** call (rowboat-auth) — the client can't run it directly. So the backend
  exposes it: a small `POST /api/folders/group` (or fold into the create flow) that mints the folder's
  scope group under its parent, admin = the caller. (Slice-1 detail: the group-mint must happen server-side
  before/with the folder create; the client calls a route, then creates the row scoped to the returned
  group. Alternatively defer per-folder groups and scope all folders to the root group `user.id`,
  supporting share-the-whole-account only — REJECTED: loses per-folder sharing. So: a folder-group mint
  route.)

## The adapter — `useCheckListHierarchy` on rowboat

Preserve the hook's consumed surface (`addFolder`, `renameNode`, `deleteNode`, `moveNode`,
`moveNodeToIndex`, `archiveNode`/`unarchiveNode`, `generateUniqueName`, `findById`, `canCreate`) so
`AppContainer`/`TreeView`/`FolderNodeView` change minimally. Implement over `useRowboat()` (the graph) +
`useSelect`:
- reads: `useSelect(() => g.folder.all().filter(f => !f.$data.archived))`, `.children()`/`.parent()` for
  the tree, `$closure` for subtree ops.
- `addFolder(name, parent?, isTemplate?)` → mint folder group (route) → `g.folder.create(...)`.
- `renameNode(node,name)` → `g.folder.update(id,{name, updated_at})`; `deleteNode` → `g.folder.remove(id)`
  (+ subtree, via `$closure("children")`); `moveNode`/`moveNodeToIndex` → `g.folder.move(id, parentId)`
  (cycle-checked) + a `fracKey` position column if ordering is needed (slice-1 may skip explicit ordering).
- Drop the `billing`/subscription limit wiring (later slice) — `canCreate` returns true for now.
- The parallel `checklistFolderFactory.ts` (services path) is ported to the same graph ops or removed.

## Provider / auth / anon wiring

- Replace `src/jazz/index.ts` (the "waist") — re-export rowboat's `createRowboat`/hooks instead of Jazz's.
  `co`/`Group` value-imports disappear (the schema uses `rb.*`, not `co.map`).
- `src/lib/jazz.tsx` → a rowboat provider: `<RowboatProvider key={author ?? "anon"} config={{ name:
  "checklist", identity: author ?? ANON_IDENTITY, options }}>`, with `useAnonClaim({ app:"checklist",
  tables, options, onClaimed })` (C2) driving the anon→login claim, and `syncWithServer` to the local
  `/api/sync` (Vite proxy → backend) using the session cookie + `author`.
- `src/lib/auth-client.ts` → `createBetterAuthClient` from `@jbroll/rowboat-auth-betterauth-react`.
- `AuthGate.tsx` → `useAuthor()`/`useSession()`/`signIn`/`signOut` from `@jbroll/rowboat-auth-betterauth-react`
  (replacing Jazz's `useAccount`/`useIsAuthenticated`/`useLogOut`). Anonymous users render the app on the
  anon store (no sync); on login, `useAnonClaim` migrates their folders.

## Backend — self-hosted rowboat sync host

Replace `createHierarchyServer` in `backend/src/index.ts` with an Express app mounting, on one better-sqlite3
db (`registerAuthTables` + `registerIdentityTables` + `registerShareTables` + the Folder sync table):
- **C1 auth**: `createIdentity({ db, authSecret, baseUrl, providers, smtp?, emailAuth? })` → `mountAuthRoutes`
  (better-auth at `/api/auth`, before json) — includes the root-group-at-signup hook.
- **`mountSyncRoutes(app, db, { auth: createRbacAuth(db), resolveAuthor: provider.resolveAuthor })`** — the
  self-hosted LWW sync (replaces jazz.tools cloud; `jazzApiKey`/agent/`wss://cloud.jazz.tools` all deleted).
- **`mountShareRoutes(app, db, { provider })`** (B) + the `DELETE /api/account` route (C2) + the folder-group
  mint route.
- Vite proxy (`vite.config.ts`) already forwards `/api` → `:3001`; the `x-jazz-auth` header forwarding is
  dropped (cookie session instead).

## Sharing UI

`ShareDialog.tsx` → B's `useSharing` from `@jbroll/rowboat-sharing-react`, keyed by the **folder's scope
group id** (`folder.owner_group_id`) instead of `folder.$jazz.id`. `createInvite(groupId, email, role)` /
`acceptInvite`/`getCollaborators`/`revokeInvite`/`removeCollaborator`. `InviteAcceptPage` posts the token to
`/api/shares/accept`. `createInviteAndGrantAgent` (the Jazz agent) is gone — plain `createInvite`.

## Package wiring

Add to `package.json` + `backend/package.json` (same `file:` pattern as the existing `@jbr-jazz` links):
`@jbroll/rowboat-{schema,client,react,shared,sharing,sharing-react,auth,auth-betterauth,auth-betterauth-react,
backend}: file:../rowboat/packages/<pkg>`. **Prerequisite: `~/src/rowboat` must be at latest `main` and
built** (consumers import `dist/`). Remove `jazz-tools`/`@jbr-jazz/*` deps as their imports are ported.
(The `ts-jazz-waist` lefthook gate keys on `jazz-tools`; it won't constrain rowboat imports — updating it is
out of slice-1 scope.)

## "Done" for slice 1

The checklist app **runs on rowboat** (Vite dev + the rowboat backend): sign up / sign in, create/rename/
move/delete folders (persisted + synced to the server, visible on reload), use the app anonymously and have
folders **claimed on sign-in**, and **share a folder** by email (invitee accepts → sees it). Items/sessions
inside folders are out of scope (folders render empty or with a placeholder).

## Testing / validation

- **Unit** (checklist vitest): the `useCheckListHierarchy` adapter's folder ops against an in-memory rowboat
  graph (headless `arrayStore`/`reactiveArrayStore` from `@jbroll/rowboat-schema`, no IndexedDB), mirroring
  rowboat's own graph tests. The backend host wiring (a supertest that folder create→sync→pull works with a
  session) — reuse rowboat's integration patterns.
- **End-to-end (the real proof):** run the app — `dev:backend` (rowboat host) + `dev:frontend` (Vite) — and
  drive the folders + anon-claim + share flow (Playwright or manual). This is the slice's acceptance gate and
  cannot be replaced by unit tests.

## Anchors (checklist)

- Schema: `src/schema/tree.ts:70-140`, `src/schema/index.ts`. Waist: `src/jazz/index.ts`.
- Hook/factory: `src/hooks/useCheckListHierarchy.ts`, `src/services/checklistFolderFactory.ts`.
- Provider/auth: `src/lib/jazz.tsx`, `src/lib/auth-client.ts`, `src/components/AuthGate.tsx`, `src/App.tsx`.
- Tree UI: `src/components/editor/AppContainer.tsx`, `src/components/tree/{TreeView,FolderNodeView}.tsx`.
- Sharing: `src/components/sharing/{ShareDialog,InviteAcceptPage}.tsx`.
- Backend: `backend/src/index.ts`, `vite.config.ts:221-236` (proxy).
- rowboat APIs: `~/src/rowboat/packages/*` (schema `rb.*`/`createRowboat`; client `syncWithServer`/adopt;
  auth-betterauth `createIdentity`/`mountAuthRoutes`; backend `mountSyncRoutes`; sharing `mountShareRoutes`/
  `useSharing`; auth `createScopeGroup`/`createRbacAuth`).
