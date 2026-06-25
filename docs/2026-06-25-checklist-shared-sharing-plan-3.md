# Unified Invite & Sharing — Plan 3: CheckList migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate CheckList's `ShareDialog` onto the shared `@jbr-jazz/hierarchy-client` `SharePanel`, retiring its local `ShareAccessList`, so both WicketMap and CheckList share one invite/sharing component set. This also fixes a latent CheckList bug: the expiration dropdown is currently never sent (`createForChannel` calls `createInviteAndGrantAgent` with 5 args, omitting `expiresInDays`).

**Architecture:** `ShareDialog` composes `SharePanel` (InviteRow + ShareDeliveryButtons + CollaboratorList) instead of its hand-rolled invite form + `ShareAccessList`. CheckList already uses the backend `reader/writer/admin` vocabulary and the root `useSharing` hook, so this is a near-mechanical adoption mirroring WicketMap's `ShareFolderDialog` (`file:///home/john/src/wicketmap-wt2/src/components/ShareFolderDialog.tsx`).

**Tech Stack:** TypeScript, React 18, Vitest, the shared `@jbr-jazz/hierarchy-client` (consumed via `file:../jbr-jazz` symlink), CheckList design tokens (`src/tokens.css`).

**Reference:** WicketMap `ShareFolderDialog.tsx` + `src/test/components/ShareFolderDialog.test.tsx` (the landed Plan 2a pattern: compose `SharePanel`, stub it in tests, `onCreateInvite` returns `{shareUrl}`).

## Global Constraints

- **Repo:** all work in `/home/john/src/checklist`. CheckList commits go through its own lefthook gate. Run `git commit` per CheckList's convention; do NOT push/land without explicit user instruction (the user will instruct the push at the end).
- **Permission vocabulary:** backend `Permission = 'reader' | 'writer' | 'admin'` (CheckList already uses it). Display labels `Reader/Writer/Admin` (keep CheckList's existing labels from `ShareAccessList.getPermissionBadge`).
- **Expiration:** options `[1, 7, 14, 30]`, capped at 30; default 7. (The shared `InviteRow` enforces the cap; this also activates CheckList's previously-dead expiration control.)
- **The shared `SharePanel`/`Collaborator` come from `@jbr-jazz/hierarchy-client/components`; `Permission` from `@jbr-jazz/hierarchy-client`.** jbr-jazz `main` already carries `expiresInDays` on `useSharing` and `Collaborator.permission: string`.
- **No `any`. Comment sparingly.** Sync the jbr-jazz dist first: `cd /home/john/src/checklist && npm run build:jbr-jazz` if CheckList has that script, else `cd ../jbr-jazz && npm run build`.

---

## File Structure
- Modify: `src/tokens.css` — add a `:root` block defining `--jh-*` tokens mapped to CheckList's palette (Task 1).
- Rewrite: `src/components/sharing/ShareDialog.tsx` — compose `SharePanel` (Task 2).
- Modify: `src/components/sharing/__tests__/ShareDialog.test.tsx` — match the new structure (Task 2).
- Delete: `src/components/sharing/ShareAccessList.tsx` and its `__tests__` if present (Task 2).

---

## Task 1: `--jh-*` design tokens for CheckList

**Files:** Modify `src/tokens.css`.

- [ ] **Step 1: Add the token block.** Append a `:root { --jh-*: … }` block to `src/tokens.css` mapping the shared-component CSS variables to CheckList's palette. Use CheckList's existing token values (read `src/tokens.css` for its `--color-*` / surface / content tokens and map: `--jh-primary` → CheckList's primary, `--jh-danger`/`--jh-success`/`--jh-warning`, `--jh-bg-*`, `--jh-border-*`, `--jh-text-*`, `--jh-focus-ring`). Mirror the WicketMap token set (`file:///home/john/src/wicketmap-wt2/src/index.css` `:root` `--jh-*` block) for the full list of variables to define; substitute CheckList's colors.

- [ ] **Step 2: Verify build.** `cd /home/john/src/checklist && npm run build` — succeeds, no CSS errors.

- [ ] **Step 3: Commit.** `git add src/tokens.css && git commit -m "style: define --jh-* tokens for shared sharing components"`

---

## Task 2: `ShareDialog` composes `SharePanel`; retire `ShareAccessList`

**Files:**
- Rewrite: `src/components/sharing/ShareDialog.tsx`
- Modify: `src/components/sharing/__tests__/ShareDialog.test.tsx`
- Delete: `src/components/sharing/ShareAccessList.tsx` (+ any `__tests__/ShareAccessList.test.tsx`)

**Interfaces:**
- Consumes: `SharePanel` from `@jbr-jazz/hierarchy-client/components`; `Permission` + `useSharing` from `@jbr-jazz/hierarchy-client`.

- [ ] **Step 1: Delete the local access list.** `git rm src/components/sharing/ShareAccessList.tsx` (and its test if present).

- [ ] **Step 2: Write/adjust the failing test.** Update `src/components/sharing/__tests__/ShareDialog.test.tsx`: stub `@jbr-jazz/hierarchy-client/components`'s `SharePanel` (a functional stub mirroring WicketMap's `ShareFolderDialog.test.tsx` — renders the recipient input, fires `onCreateInvite` on an "Email invite" click, renders `collaborators`). Assert: opening the dialog loads collaborators + pending invites; sending an email invite calls `createInviteAndGrantAgent(folder, email, <Permission>, undefined, true, <number>)` (note the now-present `expiresInDays`); the access list shows collaborators + pending invites; remove/revoke wired. Read the existing test first; reuse its `useSharing` mock.

- [ ] **Step 3: Run → fail.** `cd /home/john/src/checklist && npx vitest run src/components/sharing/__tests__/ShareDialog.test.tsx` — FAIL (dialog not yet rewritten).

- [ ] **Step 4: Rewrite `ShareDialog.tsx`.** Replace the custom invite form (recipient/permission/expiration inputs + Copy/Share/Email buttons) and `<ShareAccessList>` with a `<SharePanel>`:
  - `permissions={["reader","writer","admin"]}`, `permissionLabels={{reader:"Reader",writer:"Writer",admin:"Admin"}}` (keep CheckList's existing label wording), `permissionColors` mapped from CheckList's `getPermissionBadge` colors to `{bg,text}` objects, `defaultPermission="writer"` (CheckList's current default), `expirations={[1,7,14,30]}`, `defaultExpiresInDays={7}`.
  - `collaborators` + `pendingInvites` from the existing `loadAccessData` (`sharing.getCollaborators` / `getPendingInvites`); keep the `useEffect(open)` load.
  - `onCreateInvite={async ({ recipient, permission, expiresInDays, sendEmail }) => { const r = await sharing.createInviteAndGrantAgent(folder, recipient, permission as Permission, undefined, sendEmail, expiresInDays); await loadAccessData(); return { shareUrl: r.shareUrl }; }}` — **note the 6th arg `expiresInDays`**, fixing the dropped-expiration bug.
  - `onRemoveCollaborator` / `onRevokeInvite` → the existing `sharing.removeCollaborator` / `sharing.revokeInvite` handlers (preserve any confirmation UX CheckList had).
  - `webShareTitle`, `successMessageFor={({recipient, sendEmail}) => sendEmail ? \`Invite emailed to ${recipient}\` : "Invite link ready"}` (branch on sendEmail — do not claim "emailed" for the Copy/Share channels).
  - Keep the dialog shell (`open`/`onOpenChange`, title `Share "${folder.name}"`).
  - Mirror the `ShareFolderDialog` composition exactly; carry over CheckList-specific bits (e.g. `InAppBrowserWarning` if rendered).

- [ ] **Step 5: Run → pass + type-check.** `cd /home/john/src/checklist && npx vitest run src/components/sharing/__tests__/ShareDialog.test.tsx && npm run type-check` (or CheckList's type-check script) — green.

- [ ] **Step 6: Commit.** `git add src/components/sharing/ShareDialog.tsx src/components/sharing/__tests__/ShareDialog.test.tsx && git commit -m "refactor(sharing): ShareDialog composes shared SharePanel; retire local ShareAccessList"` — through CheckList's gate; verify HEAD advanced.

---

## Self-Review
- ShareDialog → SharePanel; ShareAccessList retired; expiration now sent (6-arg call) → Task 2. ✓
- `--jh-*` tokens → Task 1. ✓
- Permission vocabulary unchanged (`reader/writer/admin`); display labels preserved. ✓
- **Risk:** CheckList's CI/coverage gate differs from WicketMap's — if a coverage/lint gate trips, follow CheckList's conventions; the SharePanel barrel runs `createBetterAuthClient()` at module load (jsdom), so any non-stubbing transitive importer of ShareDialog may need a stub (mirror WicketMap's `MapRowContextMenuPlugin.test` precedent). Check for CheckList tests that import ShareDialog without stubbing `@jbr-jazz/hierarchy-client/components`.

## Done
This completes the unified invite/sharing initiative across both apps.
