# D-T5: ShareDialog + InviteAcceptPage on rowboat `useSharing`

## Scope

Rewired checklist's folder-sharing UI off `@jbr-jazz/hierarchy-client`'s Jazz-agent-based
`useSharing`/`SharePanel` onto rowboat's `@jbroll/rowboat-sharing-react` `useSharing`, keyed by
a folder's rowboat scope group (`FolderRow.owner_group_id`) instead of a Jazy CoValue id
(`folder.$jazz.id`).

## Changes

- `src/components/sharing/ShareDialog.tsx` — rewritten. Props unchanged
  (`open`/`onOpenChange`/`folder`) except `folder` is now `FolderRow` (from `@/schema/folder`,
  the rowboat table row) instead of `InstanceOfSchema<typeof FolderNode>` (the old Jazz CoValue).
  `useSharing({ apiBaseUrl: '/api/shares', fetchFn: (u,i) => fetch(u, {...i, credentials:
  'include'}) })`. All calls key on `folder.owner_group_id`: `getCollaborators`,
  `getPendingInvites`, `createInvite(groupId, email, role, {sendEmail, expiresInDays})`,
  `revokeInvite(token)`, `removeCollaborator(groupId, accountId)`. The `@jbr-jazz` `SharePanel`
  component is gone — the panel (recipient input, role/expiry selects, collaborator list,
  pending-invite list, remove/revoke buttons) is now rendered directly in `ShareDialog.tsx` using
  the app's own `Dialog`/`Button`/`Input` primitives, not a reused external component. Types
  (`Collaborator`, `InviteToken`) are imported directly from `@jbroll/rowboat-sharing-react`
  rather than redefined locally, since rowboat already exports the exact return shapes.

- `src/components/sharing/InviteAcceptPage.tsx` — rewritten, same `PageState` structure as
  before but simplified to match rowboat's actual error surface:
  - Auth check is done locally via `useAuthor()`/`useSession()` from `@/jazz` (mirroring
    `AuthGate`'s pattern) *before* calling `validateInvite`, rather than inferring
    "unauthenticated" from a `{error: "unauthenticated"}` field the rowboat backend doesn't
    return (rowboat's `/validate/:token` 401s outright when unauthenticated — `requireAuth`
    writes the response itself).
  - Rowboat's `/validate/:token` deliberately returns `{valid:false}` for *both* an
    invalid/expired token *and* a valid token addressed to a different email (no-leak-to-non-
    owners, see `packages/sharing/src/routes.ts`) — there is no server-distinguishable
    "email_mismatch at validate time" state anymore, only a generic "This invite link is no
    longer valid." error. The wrong-account recovery screen only surfaces from `acceptInvite`
    throwing with the message `"this invite was not sent to your account"` (matched via
    `/not sent to your account/i`), same as before but against the new message text.
  - Dropped the Jazy-specific "load the shared `FolderNode` CoValue and push it onto
    `me.root.folders`" step entirely — under rowboat, folder visibility follows scope-group
    membership; once `acceptInvite` grants the group, the shared folder shows up automatically
    on the client's next periodic sync (`src/lib/jazz.tsx`'s 5s `syncWithServer` loop), no
    explicit client-side "add to my list" call needed.
  - Sign-in/sign-out now go through `signIn`/`signOut` from `@/jazz` instead of
    `betterAuthClient` directly (same underlying better-auth client, just through the app's
    waist), and the mismatch screen's current-user email comes from the already-subscribed
    `useSession()` hook instead of a separate `betterAuthClient.getSession()` call.
- `src/App.tsx` — re-enabled the `/invite/:token` route (regex-parsed from `pathname`, same as
  the pre-port version recovered from git history at commit `fa0b565`), rendered inside
  `<JazzProvider>` as a sibling branch to `<AuthGate>`, lazy-loaded via `Suspense`.
- `tsconfig.json` — removed `src/components/sharing/InviteAcceptPage.tsx` from the slice-1
  exclude list (it no longer reads the old Jazz `Account`/`useAccount`, so it's back under
  `tsc --noEmit`).
- `src/components/sharing/__tests__/ShareDialog.test.tsx` — rewritten against the new
  implementation (mocks `@jbroll/rowboat-sharing-react` instead of `@jbr-jazz/hierarchy-client`
  + its `SharePanel`; folder fixture uses `owner_group_id`/`id`/`name` instead of `$jazz.id`).

## Verification

- `npx tsc --noEmit` (root): 0 errors.
- `npx vite build`: succeeds; `InviteAcceptPage` is its own lazy chunk again
  (`dist/assets/InviteAcceptPage-*.js`), confirming the route re-enable took effect.
- `npx vitest run src/components/sharing`: 10/10 pass.
- `npx vitest run` (full suite): 205 failing / 1376 passing, identical to the pre-change
  baseline (verified via `git stash`) — no regressions from this change. The 205 pre-existing
  failures are unrelated (jsonExporter v2.0 export tests against the old Jazy schema, and one
  known-stale `FolderNodeView` Import/Export menu-items test, both pre-dating this task).

## Concerns / follow-ups

- `ShareDialog` is still not rendered anywhere in the live UI — `FolderNodeView`'s dropdown menu
  has a `TODO(slice-2)` comment for Share (items/sessions/sharing are explicitly out of slice-1
  scope per `docs/superpowers/d-t4-report.md`). This task only covers making the dialog and
  invite-accept page themselves work against rowboat; wiring a "Share" menu entry into the tree
  UI is a separate, not-yet-requested step.
- No manual "sync now" call after `acceptInvite` — the newly shared folder appears within the
  existing 5s sync interval, not instantly. Not adding a fallback/immediate-sync path was a
  deliberate choice (NO FALLBACKS — better to rely on the one real sync mechanism than bolt on
  a second one for this case).
