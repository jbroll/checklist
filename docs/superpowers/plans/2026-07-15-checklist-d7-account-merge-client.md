# Checklist D7 — Account-Merge Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead Jazz `MergeAccountFlow` with a thin two-login client over the landed rowboat account-merge routes (`start`/`prepare`/`info`/`finalize`), including the required source-account confirmation before finalize (resolves DEFERRED D7; unblocks D8).

**Architecture:** The rowboat backend does all the work server-side (prepare = `link`, finalize = `grant` + email consolidation), so the client is a two-login state machine: target starts → sign in as source → `prepare` → sign back in as target → `info` (show source email) → human confirms → `finalize`. The merge routes are already live in checklist's backend (rowboat `@jbroll/rowboat-auth-betterauth` via the `file:` symlink); this plan is frontend-only.

**Tech Stack:** React + TypeScript, `betterAuthClient` (`@/lib/auth-client`) for `signIn.social/email({ callbackURL })` + `signOut`, `fetch` to `/api/account/merge/*`, localStorage for cross-login state.

## Global Constraints

- Design: rowboat spec `docs/superpowers/specs/2026-07-15-rowboat-account-merge-c3-design.md` §5 (flow), §6 (the confirmation is REQUIRED — never finalize without the human confirming the returned `sourceEmail`), §11.
- Backend routes (already live): `POST /api/account/merge/start` → `{ nonce }` (authed as target); `POST .../prepare { nonce }` (authed as source; server does the `link`); `POST .../info { nonce }` → `{ state, sourceEmail }` (authed as target); `POST .../finalize { nonce }` (authed as target). All are same-origin, `credentials: 'include'`.
- No Jazz. Delete every `jazz-tools`/`@jbr-jazz`/`@/schema`/`@/schema/tree` reference from the merge client + flow.
- The nonce rides in the post-login callback URL (`/?merge=<nonce>`) — that's the existing mechanism; keep it, but the security gate is the `info`+confirm step (spec §6), not the URL.
- Follow existing patterns: App.tsx's `pathname`/`search` → lazy+`<Suspense>` render pattern; the flow component's existing screen/`FlowState` structure; Tailwind classes already used in the file.

---

## File Structure

- `src/lib/account-merge.ts` — rewrite: rowboat client (localStorage state + `start`/`prepare`/`info`/`finalize`); delete all Jazz. (Task 1)
- `src/components/auth/MergeAccountFlow.tsx` — rewrite the flow: drop client share/adopt, add the `confirm` state. (Task 2)
- `src/App.tsx` — render `MergeAccountFlow` on `?merge`; `tsconfig.json` — drop the `MergeAccountFlow` exclude. (Task 3)
- `src/components/auth/ProfileDialog.tsx` — add the "Combine another account" entry. (Task 4)
- `src/lib/__tests__/account-merge.test.ts`, `src/components/auth/__tests__/MergeAccountFlow.test.tsx` — replace the dead Jazz tests. (Tasks 1–2)
- `docs/DEFERRED.md` — mark D7 resolved. (Task 5)

---

## Task 1: rewrite the merge client (`lib/account-merge.ts`)

**Files:**
- Rewrite: `src/lib/account-merge.ts`
- Rewrite: `src/lib/__tests__/account-merge.test.ts`

**Interfaces:**
- Produces: `MergeState = { nonce: string; phase: 'awaiting-source' | 'awaiting-target' }`; `saveMergeState`/`loadMergeState`/`clearMergeState`; `startMerge(): Promise<{ nonce: string }>`; `prepareMerge(nonce: string): Promise<void>`; `mergeInfo(nonce: string): Promise<{ state: string; sourceEmail: string | null }>`; `finalizeMerge(nonce: string): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/account-merge.test.ts` (mock `fetch`):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeMerge, mergeInfo, prepareMerge, startMerge } from '../account-merge';

const mockFetch = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response);
afterEach(() => vi.restoreAllMocks());

describe('account-merge client', () => {
  it('startMerge posts and returns the nonce', async () => {
    const f = mockFetch({ nonce: 'n1' });
    expect(await startMerge()).toEqual({ nonce: 'n1' });
    expect(f).toHaveBeenCalledWith('/api/account/merge/start', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });
  it('mergeInfo returns state + sourceEmail', async () => {
    mockFetch({ state: 'prepared', sourceEmail: 's@x.com' });
    expect(await mergeInfo('n1')).toEqual({ state: 'prepared', sourceEmail: 's@x.com' });
  });
  it('prepare/finalize post the nonce; a non-ok response throws', async () => {
    mockFetch({ success: true }); await expect(prepareMerge('n1')).resolves.toBeUndefined();
    mockFetch({ success: true }); await expect(finalizeMerge('n1')).resolves.toBeUndefined();
    mockFetch({ error: 'boom' }, false); await expect(finalizeMerge('n1')).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/lib/__tests__/account-merge.test.ts`
Expected: FAIL (old signatures / Jazz imports; `mergeInfo` missing).

- [ ] **Step 3: Rewrite `src/lib/account-merge.ts`** — keep `postJson` + the localStorage helpers; replace the rest; delete ALL Jazz (`@/schema`, `@/schema/tree`, `getJson`, `getMergeAgentAccountId`, `shareTopLevelFoldersTo`, `adoptFolders`, `JazzGroup`/`JazzFolder`/`JazzAccount`):

```ts
const MERGE_KEY = 'checklist:merge';

export interface MergeState {
  nonce: string;
  phase: 'awaiting-source' | 'awaiting-target';
}

export function saveMergeState(s: MergeState): void {
  localStorage.setItem(MERGE_KEY, JSON.stringify(s));
}
export function loadMergeState(): MergeState | null {
  const raw = localStorage.getItem(MERGE_KEY);
  return raw ? (JSON.parse(raw) as MergeState) : null;
}
export function clearMergeState(): void {
  localStorage.removeItem(MERGE_KEY);
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Request failed: ${res.status}`);
  return data;
}

export async function startMerge(): Promise<{ nonce: string }> {
  const d = await postJson('/api/account/merge/start', {});
  return { nonce: d.nonce as string };
}
export async function prepareMerge(nonce: string): Promise<void> {
  await postJson('/api/account/merge/prepare', { nonce });
}
export async function mergeInfo(nonce: string): Promise<{ state: string; sourceEmail: string | null }> {
  const d = await postJson('/api/account/merge/info', { nonce });
  return { state: d.state as string, sourceEmail: (d.sourceEmail as string | null) ?? null };
}
export async function finalizeMerge(nonce: string): Promise<void> {
  await postJson('/api/account/merge/finalize', { nonce });
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/lib/__tests__/account-merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/account-merge.ts src/lib/__tests__/account-merge.test.ts
git commit -m "feat(d7): rowboat account-merge client (drop Jazz)"
```

---

## Task 2: rewrite the flow component (`MergeAccountFlow.tsx`)

**Files:**
- Rewrite: `src/components/auth/MergeAccountFlow.tsx`
- Rewrite: `src/components/auth/__tests__/MergeAccountFlow.test.tsx`

**Interfaces:**
- Consumes: the Task 1 client (`startMerge`/`prepareMerge`/`mergeInfo`/`finalizeMerge` + state helpers), `betterAuthClient` (`@/lib/auth-client`), `useSession` (from `@/jazz` or the auth client — match how the app reads the current session/user id elsewhere).
- Produces: `default` `MergeAccountFlow()` — a full-screen two-login flow.

- [ ] **Step 1: Write the failing test** — component test. Mock `@/lib/account-merge` and `@/lib/auth-client`. Cover: (a) after target login (phase `awaiting-target`), the component calls `mergeInfo`, shows the returned `sourceEmail`, and only calls `finalizeMerge` after the confirm button is clicked; (b) an error from a step shows the error screen. Example skeleton:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MergeAccountFlow from '../MergeAccountFlow';
import * as client from '@/lib/account-merge';

vi.mock('@/lib/account-merge');
// mock session as an authed user + loadMergeState({ nonce, phase:'awaiting-target' })

describe('MergeAccountFlow confirm gate', () => {
  it('shows source email and requires confirm before finalize', async () => {
    vi.mocked(client.loadMergeState).mockReturnValue({ nonce: 'n1', phase: 'awaiting-target' });
    vi.mocked(client.mergeInfo).mockResolvedValue({ state: 'prepared', sourceEmail: 's@x.com' });
    vi.mocked(client.finalizeMerge).mockResolvedValue();
    render(<MergeAccountFlow />);
    expect(await screen.findByText(/s@x.com/)).toBeInTheDocument();
    expect(client.finalizeMerge).not.toHaveBeenCalled();      // not before confirm
    await userEvent.click(screen.getByRole('button', { name: /confirm|combine|finish/i }));
    await waitFor(() => expect(client.finalizeMerge).toHaveBeenCalledWith('n1'));
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/auth/__tests__/MergeAccountFlow.test.tsx`
Expected: FAIL (current component uses Jazz + no confirm step).

- [ ] **Step 3: Rewrite `MergeAccountFlow.tsx`.** Start from the existing file's structure; keep the screens and `FlowState`, **add `'confirm'`**, and replace the Jazz effect with the rowboat flow:
  - `FlowState = 'entry' | 'processing' | 'awaiting-source-login' | 'awaiting-target-login' | 'confirm' | 'success' | 'error'`.
  - **`handleStartMerge`** (from the `entry` screen, run as target): `const { nonce } = await startMerge(); saveMergeState({ nonce, phase: 'awaiting-source' });` → show `awaiting-source-login`.
  - **`awaiting-source-login` / `awaiting-target-login`** screens: reuse the existing social/email sign-in handlers with `callbackURL = ${origin}/?merge=${nonce}`; before sign-in, `betterAuthClient.signOut()` (switch identities), same as today.
  - **On mount** (`useEffect`), read `?merge=<nonce>` from `window.location.search` and `loadMergeState()`:
    - `phase === 'awaiting-source'` and session is present (now authed as source): `await prepareMerge(nonce); saveMergeState({ nonce, phase: 'awaiting-target' });` → `awaiting-target-login`.
    - `phase === 'awaiting-target'` and session present (authed as target): `const { sourceEmail } = await mergeInfo(nonce);` → store it → `confirm` state (do NOT finalize yet).
    - Any thrown error → `error` state with the message.
  - **`confirm`** screen: show "You're combining the account **{sourceEmail}** into this one." + a Confirm button → `await finalizeMerge(nonce); clearMergeState();` → `success`. (If `sourceEmail` is null, still show the confirm with a generic "the other account" label — the record is valid.)
  - **`success`** screen: done + a button back to `/` (clear the `?merge` param).
  - Drop the Jazz `me.$jazz?.id === targetJazzId` self-merge check (the server guards self-merge at `prepare`; surface its 409 as the error screen).
  - Remove all Jazz imports.

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/components/auth/__tests__/MergeAccountFlow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/MergeAccountFlow.tsx src/components/auth/__tests__/MergeAccountFlow.test.tsx
git commit -m "feat(d7): two-login merge flow with source-email confirm"
```

---

## Task 3: route the flow in `App.tsx` + drop the tsconfig exclude

**Files:**
- Modify: `src/App.tsx`
- Modify: `tsconfig.json` (remove the `MergeAccountFlow` exclude)

**Interfaces:**
- Consumes: `MergeAccountFlow` (Task 2).

- [ ] **Step 1: Remove the `tsconfig.json` exclude** — delete the `"src/components/auth/MergeAccountFlow.tsx"` line (and its now-stale comment) from the `exclude` array. Run `npm run type-check` — it must stay green (Task 2 made the file rowboat-typed).

- [ ] **Step 2: Wire `App.tsx`** — mirror the existing lazy + `pathname`/`search` flag + `<Suspense>` pattern:
  - Add: `const MergeAccountFlow = lazy(() => import('./components/auth/MergeAccountFlow'));`
  - Compute: `const isMergePage = new URLSearchParams(window.location.search).has('merge');`
  - In the render branch tree (next to `isTestPage` / `inviteMatch`), add: when `isMergePage`, render `<Suspense fallback={<LoadingScreen/>}><MergeAccountFlow/></Suspense>` — BEFORE the auth-gated app content (the flow manages its own auth screens). A signed-out `?merge=<nonce>` must reach `MergeAccountFlow`, not the login gate.

- [ ] **Step 3: Verify** — `npm run type-check` green; a quick manual check that `/?merge=start` and `/?merge=<x>` render the flow (drive with the app if convenient, else rely on the Task 2 component test).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx tsconfig.json
git commit -m "feat(d7): route MergeAccountFlow on ?merge; drop tsconfig exclude"
```

---

## Task 4: settings entry ("Combine another account")

**Files:**
- Modify: `src/components/auth/ProfileDialog.tsx` (near the `<LinkedEmailsSection />` render)

**Interfaces:**
- Consumes: nothing new (navigates to the flow).

- [ ] **Step 1: Add the entry** — in `ProfileDialog.tsx`, below `<LinkedEmailsSection />`, add a section with a short explanation ("Combine another account's lists into this one") and a button that starts the flow by navigating to it as the target: `onClick={() => { window.location.href = '/?merge=start'; }}` (the flow's `entry` screen renders when `?merge` is present with no active `MergeState`/nonce). Match the surrounding Tailwind/section styling.

- [ ] **Step 2: Verify** — `npm run type-check` + lint green. (No new test required; the flow itself is tested in Task 2. If ProfileDialog has an existing test, keep it green.)

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/ProfileDialog.tsx
git commit -m "feat(d7): settings entry to combine another account"
```

---

## Task 5: close-out — gate + DEFERRED

**Files:**
- Modify: `docs/DEFERRED.md`

- [ ] **Step 1: Confirm no dead Jazz merge refs remain**

Run: `grep -rnE "shareTopLevelFoldersTo|adoptFolders|merge/agent|targetJazzId" src/ --include=*.ts --include=*.tsx | grep -v '\.test\.'`
Expected: empty.

- [ ] **Step 2: Full gate**

Run: `npm run check` (type-check + lint + unit). Expected: green. Then `npm run test:e2e` if the merge flow has (or you add) an e2e; otherwise note it as manual.

- [ ] **Step 3: Mark D7 resolved in `docs/DEFERRED.md`** — change the `## D7` heading to RESOLVED with a one-line summary (rowboat C3 backend consumed; two-login client + source-email confirm; dead Jazz `MergeAccountFlow`/`account-merge` replaced). Update D8's note (D7 no longer pins the Jazz schema files — only D9 remains).

- [ ] **Step 4: Commit**

```bash
git add docs/DEFERRED.md
git commit -m "docs(deferred): close D7 (account-merge client)"
```

---

## Self-Review notes (author)

- **Spec coverage:** client (T1), two-login flow + the REQUIRED source-email confirm before finalize per §6 (T2), routing incl. signed-out `?merge` reaching the flow (T3), entry point near LinkedEmailsSection per §11 (T4), close-out + D7/D8 bookkeeping (T5).
- **Type consistency:** `MergeState` (`{nonce, phase}`), `startMerge()→{nonce}`, `mergeInfo(nonce)→{state,sourceEmail}`, `prepareMerge/finalizeMerge(nonce)→void` are used identically in T1→T2.
- **Verify during execution:** how the app reads the current session/user id (which hook — mirror an existing authed component); whether `betterAuthClient.signIn.social` supports `callbackURL` exactly as the old file used it; the ProfileDialog section styling; that a signed-out `?merge=<nonce>` deep-link renders the flow rather than the auth gate.
