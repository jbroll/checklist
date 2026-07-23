# CheckList account cutover — design (sub-project F of the hosted-rowboat cutover)

**Date:** 2026-07-22
**Status:** design (approved 2026-07-22; plan follows)
**Depends on:** sub-projects A–E, all landed. C+D+E are on branch `cutover-cd`, held off `main`.
Engine phases A/B/C landed on rowboat `main`.
**Design/decomposition parent:** `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md` → "F".

## Goal

Cut the last two operations that still drive the now-empty local group tables — account-merge's
group step and account-deletion's group cleanup — over to the hosted data plane, then **drop
`registerAuthTables` and the three local group tables** so `cutover-cd` can merge to `main`.

D moved every real group to hosted rowboat and emptied `groups` / `group_members` /
`group_inheritance` (`@jbroll/rowboat-auth` `registerAuthTables`). E cut sharing over; these two
account routes were deferred to F (E spec, decision 1). Today their identity halves work — the group
halves are silent no-ops on the empty tables.

## Verified starting facts

Established by reading the current code, not assumed:

| Fact | Evidence |
|---|---|
| `mountAccountRoutes` deletes group rows with direct SQL (`group_members` / `groups` / `group_inheritance`) plus merge-component survivor-preservation logic (`findMergePartners`, `partnerAlive`) | `auth-betterauth/src/account-routes.ts:69-112` |
| `mountAccountMergeRoutes` `prepare` calls `link(db, {actor: source, childGroup: source, parentGroup: target})`; `finalize` calls `grant(db, {actor: target, group: target, account: source, role: admin})`, both against the local `@jbroll/rowboat-auth` tables | `account-merge-routes.ts:72,102-107` |
| `registerAuthTables` creates **only** the three group tables; `account_merge` is created separately by `registerIdentityTables` (`auth-betterauth/schema.ts:26`), and `share_invites` by `registerShareTables` (`sharing/schema.ts:5`) | `auth/src/schema.ts:4-14`; `auth-betterauth/src/schema.ts:26`; `sharing/src/schema.ts:5` |
| `identity.mountAuthRoutes` already mounts `mountAccountRoutes` **and** `mountAccountMergeRoutes`; `backend/index.ts:164`'s explicit `mountAccountRoutes(app, {provider, db})` is a **redundant double-mount** of `DELETE /api/account` | `auth-betterauth/mount.ts:29-30`; `backend/src/index.ts:144,164` |
| Rowboat's hosted group API serves `grant`/`revoke`/`role`/`members`/`memberships` + `createScopeGroup`, but **no link-two-existing-groups endpoint and no group-delete** | `rowboat-service/src/server-buildapp.mjs:56,102,128,148,164,188` |
| The writer supports ops `ensureRootGroup` / `createScopeGroup` / `grant` / `revoke` — **no `link`** | `backend/src/writer-thread.ts:26-28`; `rowboat-service/src/writer-groupops.mjs:23,33,41,54` |
| `link(actor, childGroup, parentGroup)` requires `requireAdmin(actor, childGroup)` and rejects cycles; inheritance flows parent→child (a root's members inherit its child folder-groups, exactly how `createScopeGroup` nests folders) | `auth/src/rbac.ts:181-207`; `createScopeGroup` at `rbac.ts:203` |
| `revoke` requires the actor be **admin** on the group, so a departing reader/writer cannot self-revoke a folder shared *to* them | `auth/src/rbac.ts:150-160` |
| `GroupBackend` (`effectiveRole`/`grant`/`revoke`/`listMembers`/`listMemberships`) + `local/remoteGroupBackend` live in `@jbroll/rowboat-sharing`; `remoteGroupBackend` authenticates each call as `Bearer token(actor)` against `<base>/groups/*` and `<base>/memberships` | `sharing/src/group-backend.ts:11-22`; `sharing/src/remote-group-backend.ts:26-86` |
| `@jbroll/rowboat-auth` already depends on `@jbroll/rowboat-backend` (owns `AuthzError`, `SyncDb`) and exports `link`/`grant`/`revoke`/`effectiveRole`; both `auth-betterauth` and `sharing` already depend on `auth` | `auth/package.json` deps; `auth/src/index.ts`; `auth-betterauth`/`sharing` `package.json` deps |
| E built the sharing `remoteGroupBackend` with `token: (actor) => identity.signJWT(actor)` after `createIdentity`, minting a per-actor JWT so rowboat's own `requireAdmin` decides each call | `backend/src/index.ts:153-156`; `2026-07-22-checklist-sharing-cutover-design.md` |
| The merge client only POSTs the four unchanged endpoints (`start`/`prepare`/`finalize`/`info`); the HTTP contract does not change, so F is server-side only | `src/lib/account-merge.ts:41-54` |

## Decisions

1. **Deletion is identity-only — zero rowboat group calls.** Post-cutover, all data-plane access
   requires a CheckList-issued JWT; deleting the better-auth identity means no token → no author →
   no access. The user's residual memberships and owned groups become inert orphans — the exact
   "domain-data GC deferred" category `account-routes.ts:11-13` already documents. Merged-target
   survivors keep their inherited data because inheritance is group-id-keyed, decoupled from the
   source's identity lifetime. Proactive membership-revoke + group-delete is rejected: `revoke`
   needs admin (a departing reader can't self-revoke), and it needs net-new rowboat delete endpoints
   for no access benefit.
2. **Merge keeps inheritance as the primitive — net-new rowboat `link` endpoint.** Grant-only
   (making the counterpart a direct member of the other's root) is behaviorally equivalent *only*
   under the single-member-root invariant; the faithful link survives that invariant changing and
   matches the existing deletion/merge mental model. Cost: one rowboat endpoint + writer op +
   `GroupBackend.link`.
3. **Hoist `GroupBackend` + `local/remoteGroupBackend` into `@jbroll/rowboat-auth`.** It already owns
   `link`/`grant`/`revoke`, `AuthzError`, and `SyncDb`, and both `auth-betterauth` and `sharing`
   already depend on it — so the merge routes can import the interface with no dependency cycle (an
   identity package depending on `sharing` would be backwards). `sharing` re-exports both for its
   existing consumers; the `sharing-agent-e2e` capstone must stay green.
4. **One `groupBackend`, both surfaces.** CheckList builds a single `remoteGroupBackend` after
   `createIdentity` (it needs `identity.signJWT`) and passes it to both the merge routes (via
   `identity.mountAuthRoutes(app, { groupBackend })`) and `mountShareRoutes`. No local-backend
   fallback in the account routes (NO FALLBACKS): merge with no `groupBackend` is a wiring bug, not a
   degraded mode.

## Architecture

### rowboat — the `link` primitive (lands first, on rowboat `main`)

- **Writer op.** Add `{ op: "link"; actor; childGroup; parentGroup }` to the `writer-thread.ts`
  `GroupOp` union and handle it in `writer-groupops.mjs` by calling
  `link(db, { actor, childGroup, parentGroup }, { tables: GROUP_TABLES })`.
- **HTTP endpoint.** `POST ${basePath}/groups/:childGroup/parents`, body `{ parentGroup }`, actor
  from `resolveAuthor`. Forwards `{ op: "link", actor, childGroup, parentGroup }` via
  `forwardGroupWrite`; `result.ok` → 200, `!ok` → 403. **No extra parentGroup admin check** is
  needed (unlike the `createScopeGroup` mint): `link` already gates on `requireAdmin(actor,
  childGroup)`, and inheritance is one-directional — linking your child under someone's parent only
  exposes *your* rows upward (self-authorized), never grants you access to the parent.
- **`GroupBackend.link(actor, childGroup, parentGroup)`.** `localGroupBackend.link` calls `authLink`;
  `remoteGroupBackend.link` does `POST /groups/${enc(childGroup)}/parents` `{ parentGroup }`,
  authenticated as `actor`, reusing the existing `parseJsonOrThrow` (403 → `AuthzError`).

### rowboat — the account routes (same landing)

- **`mountAccountMergeRoutes`** gains a required `groupBackend: GroupBackend` option. `prepare`
  becomes `await groupBackend.link(source, source, rec.target_user_id)`; `finalize` becomes
  `await groupBackend.grant(rec.target_user_id, rec.target_user_id, source, "admin")`. The
  `import { grant, link } from "@jbroll/rowboat-auth"` is dropped.
  **Transaction split:** each remote group call is `await`ed *before* the local `db.transaction`
  (better-sqlite3 transactions are synchronous — no `await` inside). The state/`verified_email`
  updates stay in their sync transaction, run only after the remote op succeeds.
- **`mountAccountRoutes`** drops `findMergePartners`, `partnerAlive`, and every group-table SQL
  statement. It keeps the `verified_email`, `share_invites` (inviter + `recipient_email`), and `user`
  deletes, and **adds** `DELETE FROM account_merge WHERE target_user_id = ? OR source_user_id = ?`
  for the deleted user (the survivor logic that read those rows is gone). No `groupBackend`
  dependency; the route stays fully synchronous.
- **`mountAuthRoutes` / `Identity.mountAuthRoutes`** thread the required `groupBackend` through to
  `mountAccountMergeRoutes`. The signature becomes `mountAuthRoutes(app, { groupBackend })`.

### CheckList — wiring (on `cutover-cd`)

`backend/src/index.ts`:

```ts
const identity = createIdentity({ /* unchanged */ });
await identity.registerIdentityTables();
// ...
const groupBackend = remoteGroupBackend({
  baseUrl: `${config.rowboatUrl}/db/${config.rowboatDatabaseId}/api/sync`,
  token: (actor) => identity.signJWT(actor),
});
identity.mountAuthRoutes(app, { groupBackend }); // now also feeds the merge routes
// ...
mountShareRoutes(app, db, { provider, sendEmail, groupBackend, agent: config.rowboatAgentId,
  shareUrl: (t) => `${config.frontendUrl}/invite/${t}` });
// mountAccountRoutes(app, { provider, db })  ← DELETED (double-mounted via mountAuthRoutes)
```

- Drop `registerAuthTables(db)` (`:106`) and its import. `registerShareTables` and
  `registerIdentityTables` stay — `share_invites` and `account_merge` remain local CheckList state.
- The single `groupBackend` E already builds at `:153` for sharing is now also passed to the merge
  routes via `mountAuthRoutes` — one instance, two consumers.

## Binding constraints

- **Commit hook** (CLAUDE.md) runs type-check + lint + unit tests + E2E (6–10 min) on every code
  commit; **all must pass, no bypass**.
- **Cross-repo landing.** rowboat packages are `file:`-symlinked from `../rowboat`. The rowboat
  changes land **first** via the rowboat-wt2 + `land.sh` worktree flow (never a commit on `main` in
  `~/src/rowboat`) and must be built before CheckList's `npm run check` resolves them; CI must pull +
  build rowboat on the host (see `ci-cross-repo-topology`).
- **`main` gate.** F is the last blocker: after it lands, `registerAuthTables` and the three group
  tables are gone and `cutover-cd` (C+D+E+F) can merge to `main`.
- **The `GroupBackend` hoist must not break `sharing`'s consumers** — `sharing` re-exports the moved
  symbols; the `sharing-agent-e2e` and `sharing-flow` integration tests must stay green.
- **Exact surface:** endpoint `POST /db/<databaseId>/api/sync/groups/:childGroup/parents`, writer op
  `link`, merge arg mapping `childGroup = source`, `parentGroup = target`.

## Failure contract

- **Merge `prepare` / `finalize`.** A remote group 403 → `AuthzError` → route 403; any other remote
  failure (rowboat unreachable) → 500. No degraded/fallback path — that is the point of removing the
  local backend. On partial failure (remote op succeeds, local transaction then throws) the operation
  is idempotent-safe: `link` is `ON CONFLICT DO NOTHING`, `grant` is `ON CONFLICT … DO UPDATE`, and
  the `state`/`source_user_id` guards gate re-entry, so a client retry converges.
- **`link` endpoint.** 401 (no author) / 403 (not admin on `childGroup`, or would-cycle) / 200 (ok).
- **`DELETE /api/account`.** Identity-only; no group or network calls; unchanged 200 `{ success:
  true }` contract. Access is revoked by identity deletion alone.

## Testing

- **rowboat unit.** `link` writer op links two existing groups and rejects a cycle;
  `remoteGroupBackend.link` hits `/groups/:child/parents` and maps 403 → `AuthzError`; the `link`
  endpoint returns 403 for a non-admin-on-child actor, 200 for the child's admin.
- **rowboat unit — account routes.** `account-merge-routes.test.ts` rewired to a fake/local
  `groupBackend`, asserting `prepare` → `link(source, source, target)` and `finalize` →
  `grant(target, target, source, admin)`. `account-delete.test.ts` asserts identity-only cleanup
  (no group tables touched, `account_merge` rows for the user removed). `account-delete-merged.test.ts`
  is **rewritten** (the survivor-preservation behavior it asserts is deliberately removed) or deleted.
- **rowboat integration — merge capstone.** Mirroring `sharing-agent-e2e`: against the real assembled
  server, a prepared+finalized merge lands the inheritance link and the admin grant in the hosted
  `__group*` tables, and the target can pull the source's rows.
- **CheckList E2E.** The existing `e2e/account-merge.spec.ts` must pass against the hosted data plane
  — it now exercises the real `link`/`grant` round-trip to rowboat.

## Risks

| Risk | Mitigation |
|---|---|
| `GroupBackend` hoist silently breaks a `sharing` import | `sharing` re-exports the moved symbols; `sharing-*` integration tests are the gate |
| `await` inside a better-sqlite3 transaction (merge routes) | Structural rule: remote group op awaited *before* the sync transaction; covered by decision + architecture |
| A rowboat change not built before CheckList `check` resolves it | Land + build rowboat first (binding constraint); CI pulls + builds rowboat on host |
| Ghost collaborators / orphaned owned groups after deletion | Accepted — identical to the already-deferred domain-data GC; access is revoked by identity loss |

## Non-goals

- Proactive membership-revoke or group/data deletion on account-deletion (deferred domain-data GC).
- Any change to the merge HTTP contract or the merge client (`src/lib/account-merge.ts`).
- Removing `registerShareTables` / `registerIdentityTables`, or the `account_merge` / `share_invites`
  tables — they are CheckList identity state and stay local.
- Uninstalling the sharing agent or any sharing-path change (landed in E).
