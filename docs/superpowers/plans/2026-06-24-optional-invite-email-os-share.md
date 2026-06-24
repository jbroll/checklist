# Optional Invite Email + OS-Share Discoverability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the folder ShareDialog deliver invites via a capability-swapped action row (Copy + Share on mobile, Copy + Email Invite on desktop), and send the backend invite email **only** when the user picks Email Invite.

**Architecture:** Add a backward-compatible `sendEmail` flag (default `true`) to the jbr-jazz `/api/shares/invite` endpoint and its `useSharing` client method, gating only the invite email. The checklist ShareDialog selects the primary button off `navigator.share` and passes `sendEmail` accordingly.

**Tech Stack:** React 18 + TypeScript + Vite (checklist frontend), Express + better-sqlite3 + Zod + nodemailer (jbr-jazz backend), Vitest (+ Testing Library) on all three packages.

## Global Constraints

- jbr-jazz packages are `file:`-linked into checklist via symlink realpath (`../../jbr-jazz/...`). **Do NOT use a git worktree** for this work — it would break the symlink. Execute in-place on branches.
- After editing a jbr-jazz package's `src`, **rebuild it** (`npm run build` in that package dir) so checklist's symlinked `dist` reflects the change. Build the **client** before checklist type-checks against it.
- `sendEmail` default is **`true`** everywhere (other jbr-jazz consumers, e.g. wicketmap, must be unaffected).
- Checklist commit messages: ASCII only, subject 10–72 chars, body only `Co-Authored-By: Claude <noreply@anthropic.com>`. Checklist pre-commit runs type-check/lint/unit/E2E and must pass (do not bypass).
- Branch first (both repos are on their default branch): checklist branch `feat/share-optional-email`; jbr-jazz branch `feat/invite-optional-email`.

---

### Task 0: Branch both repos

**Files:** none (git only)

- [ ] **Step 1: Branch checklist**

```bash
cd /home/john/src/checklist && git checkout -b feat/share-optional-email
```

- [ ] **Step 2: Branch jbr-jazz**

```bash
cd /home/john/src/jbr-jazz && git checkout -b feat/invite-optional-email
```

Expected: both print `Switched to a new branch ...`.

---

### Task 1: Backend — gate invite email behind `sendEmail`

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/shares.ts` (schema line 64-70; handler line 153 + 195-220)
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/shares-email.test.ts` (create)

**Interfaces:**
- Produces: `inviteSchema` now includes `sendEmail: boolean` (default `true`). New exported helper:
  `maybeSendInviteEmail(transporter: Transporter | null, smtpFrom: string | undefined, params: { sendEmail: boolean; recipientEmail: string; senderDisplay: string; senderEmail: string; shareUrl: string; expiresInDays: number }): boolean` — returns `true` iff it dispatched a send (fire-and-forget), `false` when suppressed or SMTP unavailable.

- [ ] **Step 1: Write the failing test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/backend/src/__tests__/shares-email.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { inviteSchema, maybeSendInviteEmail } from '../shares.js';

const params = {
  recipientEmail: 'r@example.com',
  senderDisplay: 'Alice',
  senderEmail: 'alice@example.com',
  shareUrl: 'https://app.example.com/invite/tok',
  expiresInDays: 7,
};

describe('inviteSchema.sendEmail', () => {
  const base = {
    recipientEmail: 'r@example.com',
    targetId: 'co_zAbc123',
    permission: 'writer' as const,
  };
  it('defaults sendEmail to true', () => {
    expect(inviteSchema.parse(base).sendEmail).toBe(true);
  });
  it('respects sendEmail false', () => {
    expect(inviteSchema.parse({ ...base, sendEmail: false }).sendEmail).toBe(false);
  });
  it('rejects non-boolean sendEmail', () => {
    expect(() => inviteSchema.parse({ ...base, sendEmail: 'no' })).toThrow();
  });
});

describe('maybeSendInviteEmail', () => {
  it('does not send when sendEmail is false', () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const ok = maybeSendInviteEmail({ sendMail } as never, 'from@x.com', { ...params, sendEmail: false });
    expect(ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('sends when sendEmail is true and SMTP is configured', () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const ok = maybeSendInviteEmail({ sendMail } as never, 'from@x.com', { ...params, sendEmail: true });
    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'r@example.com', from: 'from@x.com' });
  });
  it('does not send when transporter is null', () => {
    expect(maybeSendInviteEmail(null, 'from@x.com', { ...params, sendEmail: true })).toBe(false);
  });
  it('does not send when smtpFrom is missing', () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const ok = maybeSendInviteEmail({ sendMail } as never, undefined, { ...params, sendEmail: true });
    expect(ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/shares-email.test.ts`
Expected: FAIL — `inviteSchema`/`maybeSendInviteEmail` are not exported.

- [ ] **Step 3: Add `sendEmail` to the schema and export it**

In `shares.ts`, change the schema (lines 64-70) to export it and add the field:

```ts
export const inviteSchema = z.object({
  recipientEmail: z.string().email().max(255),
  targetId: z.string().regex(/^co_z[a-zA-Z0-9]+$/, 'Invalid Jazz CoValue ID format'),
  permission: z.enum(['admin', 'writer', 'reader']),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  appRole: z.string().max(64).optional(),
  sendEmail: z.boolean().default(true),
});
```

- [ ] **Step 4: Add the `maybeSendInviteEmail` helper**

In `shares.ts`, add this exported helper above `setupSharingRoutes` (it reuses the existing `escapeHtml` import and `Transporter` type from nodemailer — add `import type { Transporter } from 'nodemailer';` if not already present):

```ts
export function maybeSendInviteEmail(
  transporter: Transporter | null,
  smtpFrom: string | undefined,
  params: {
    sendEmail: boolean;
    recipientEmail: string;
    senderDisplay: string;
    senderEmail: string;
    shareUrl: string;
    expiresInDays: number;
  },
): boolean {
  if (!params.sendEmail || !transporter || !smtpFrom) return false;
  transporter
    .sendMail({
      from: smtpFrom,
      to: params.recipientEmail,
      subject: `${params.senderDisplay} invited you to collaborate`,
      text: [
        `${params.senderDisplay} (${params.senderEmail}) has invited you to collaborate.`,
        ``,
        `Accept the invite: ${params.shareUrl}`,
        ``,
        `This link expires in ${params.expiresInDays} days.`,
      ].join('\n'),
      html: [
        `<p>${escapeHtml(params.senderDisplay)} (${escapeHtml(params.senderEmail)}) has invited you to collaborate.</p>`,
        `<p><a href="${escapeHtml(params.shareUrl)}">Accept the invite</a></p>`,
        `<p>This link expires in ${params.expiresInDays} days.</p>`,
      ].join('\n'),
    })
    .catch((err) => console.error('[shares] Failed to send invite email:', err));
  return true;
}
```

- [ ] **Step 5: Use the helper in the handler and thread `sendEmail`**

In the handler, change the destructure (line 153) to include `sendEmail`:

```ts
const { recipientEmail, targetId, permission, expiresInDays, appRole, sendEmail } = parseResult.data;
```

Replace the inline email block (current lines 197-220) with:

```ts
      // Send invite email only when requested and SMTP is configured (fire-and-forget)
      const transporter = getSmtpTransporter();
      maybeSendInviteEmail(transporter, config.smtpFrom, {
        sendEmail,
        recipientEmail,
        senderDisplay: session.user.name || session.user.email,
        senderEmail: session.user.email,
        shareUrl,
        expiresInDays,
      });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npx vitest run src/__tests__/shares-email.test.ts`
Expected: PASS (7 assertions across 7 tests).

- [ ] **Step 7: Build the backend package**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/backend && npm run build`
Expected: tsup completes, `dist/` regenerated, no type errors.

- [ ] **Step 8: Commit (jbr-jazz)**

```bash
cd /home/john/src/jbr-jazz && git add packages/hierarchy/backend && \
git commit -m "feat: gate invite email behind optional sendEmail flag"
```

---

### Task 2: Client — thread `sendEmail` through `useSharing`

**Files:**
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useSharing.ts` (interface 33-52; impls 79-134; deps array ~134)

**Interfaces:**
- Consumes: `/api/shares/invite` now accepts `sendEmail` in the body (Task 1).
- Produces: client signatures gain a trailing optional param:
  `createInvite(targetId, recipientEmail, permission, appRole?, sendEmail?)` and
  `createInviteAndGrantAgent(target, recipientEmail, permission, appRole?, sendEmail?)`. Default behavior (omitted) sends email, matching the backend default.

- [ ] **Step 1: Update the interface types**

In `useSharing.ts`, add `sendEmail?: boolean` as the last param to both signatures in `UseSharingResult` (lines 33-38 and 47-52):

```ts
  createInvite: (
    targetId: string,
    recipientEmail: string,
    permission: Permission,
    appRole?: string,
    sendEmail?: boolean,
  ) => Promise<CreateInviteResult>;
```

```ts
  createInviteAndGrantAgent: (
    target: InviteTarget,
    recipientEmail: string,
    permission: Permission,
    appRole?: string,
    sendEmail?: boolean,
  ) => Promise<CreateInviteResult>;
```

- [ ] **Step 2: Thread `sendEmail` through `createInvite`**

Replace the `createInvite` impl (lines 79-93) body so the param is accepted and included only when explicitly provided (preserving backend default when omitted):

```ts
  const createInvite = useCallback(
    async (
      targetId: string,
      recipientEmail: string,
      permission: Permission,
      appRole?: string,
      sendEmail?: boolean,
    ): Promise<CreateInviteResult> => {
      return call<CreateInviteResult>({
        path: '/api/shares/invite',
        method: 'POST',
        body: {
          targetId,
          recipientEmail,
          permission,
          ...(appRole ? { appRole } : {}),
          ...(sendEmail === undefined ? {} : { sendEmail }),
        },
      });
    },
    [call],
  );
```

- [ ] **Step 3: Thread `sendEmail` through `createInviteAndGrantAgent`**

Update its signature (lines 95-101) and the inner `createInvite` call (line 102):

```ts
  const createInviteAndGrantAgent = useCallback(
    async (
      target: InviteTarget,
      recipientEmail: string,
      permission: Permission,
      appRole?: string,
      sendEmail?: boolean,
    ): Promise<CreateInviteResult> => {
      const result = await createInvite(target.$jazz.id, recipientEmail, permission, appRole, sendEmail);
```

(Leave the rest of the function — the agent-grant logic — unchanged.)

- [ ] **Step 4: Build the client package**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/client && npm run build`
Expected: tsup completes, `dist/` + `.d.ts` regenerated, no type errors.

- [ ] **Step 5: Verify checklist sees the new param**

Run: `cd /home/john/src/checklist && npx tsc --noEmit 2>&1 | head -20`
Expected: no NEW errors referencing `useSharing`/`createInviteAndGrantAgent` (baseline unrelated errors, if any, unchanged). This confirms the symlinked `dist` picked up the rebuilt types.

- [ ] **Step 6: Commit (jbr-jazz)**

```bash
cd /home/john/src/jbr-jazz && git add packages/hierarchy/client && \
git commit -m "feat: pass optional sendEmail through useSharing client"
```

---

### Task 3: Frontend — capability-swapped delivery action row

**Files:**
- Modify: `/home/john/src/checklist/src/components/sharing/ShareDialog.tsx`
- Test: `/home/john/src/checklist/src/components/sharing/__tests__/ShareDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `sharing.createInviteAndGrantAgent(folder, email, permission, appRole?, sendEmail?)` (Task 2).
- Produces: UI behavior only. Capability computed at render: `const hasWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'`. Delivery via `createForChannel(sendEmail: boolean)`.

- [ ] **Step 1: Write the failing component test**

Create `/home/john/src/checklist/src/components/sharing/__tests__/ShareDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createInviteAndGrantAgent = vi.fn().mockResolvedValue({
  shareUrl: 'https://app/invite/tok',
  token: 'tok',
  agentAccountId: 'co_agent',
});

vi.mock('@jbr-jazz/hierarchy-client', () => ({
  useSharing: () => ({
    createInviteAndGrantAgent,
    getCollaborators: vi.fn().mockResolvedValue([]),
    getPendingInvites: vi.fn().mockResolvedValue([]),
    removeCollaborator: vi.fn(),
    revokeInvite: vi.fn(),
    error: null,
  }),
}));

import { ShareDialog } from '../ShareDialog';

const folder = { name: 'Groceries', $jazz: { id: 'co_zTest' } } as never;

function setShareCapability(present: boolean) {
  if (present) {
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
  } else if ('share' in navigator) {
    // @ts-expect-error test cleanup
    delete navigator.share;
  }
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
}

afterEach(() => {
  createInviteAndGrantAgent.mockClear();
  if ('share' in navigator) {
    // @ts-expect-error test cleanup
    delete navigator.share;
  }
});

describe('ShareDialog delivery row', () => {
  it('desktop (no Web Share): shows Email invite, sends with sendEmail=true', async () => {
    setShareCapability(false);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
    const email = screen.getByPlaceholderText(/colleague@example.com/i);
    fireEvent.change(email, { target: { value: 'r@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    const args = createInviteAndGrantAgent.mock.calls[0];
    expect(args[1]).toBe('r@example.com');
    expect(args[4]).toBe(true); // sendEmail
  });

  it('mobile (Web Share): shows Share, shares with sendEmail=false', async () => {
    setShareCapability(true);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    expect(screen.queryByRole('button', { name: /email invite/i })).toBeNull();
    const email = screen.getByPlaceholderText(/colleague@example.com/i);
    fireEvent.change(email, { target: { value: 'r@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    expect(createInviteAndGrantAgent.mock.calls[0][4]).toBe(false); // sendEmail
    expect(navigator.share).toHaveBeenCalled();
  });

  it('Copy never sends email (sendEmail=false)', async () => {
    setShareCapability(false);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), { target: { value: 'r@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    expect(createInviteAndGrantAgent.mock.calls[0][4]).toBe(false);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app/invite/tok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/checklist && npx vitest run src/components/sharing/__tests__/ShareDialog.test.tsx`
Expected: FAIL — buttons "Email invite"/"Copy link" not found / `args[4]` undefined (old signature, old UI).

- [ ] **Step 3: Move capability checks into the component**

In `ShareDialog.tsx`, delete the module-level constants (lines 11-15):

```ts
// Check if Contact Picker API is available
const hasContactPicker = 'contacts' in navigator && 'ContactsManager' in window;

// Check if Web Share API is available
const hasWebShare = 'share' in navigator;
```

and add, at the top of the `ShareDialog` component body (just after the `useSharing` call):

```ts
  const hasWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasContactPicker =
    typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
```

- [ ] **Step 4: Add `emailSentTo` state and reset-on-change**

Add state near the other `useState` calls:

```ts
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
```

Update the recipient/permission/expiry `onChange` handlers to clear stale results. Replace the email input `onChange` (line 193) and the two `<select>` `onChange`s (lines 218, 233) so each also resets:

```ts
  onChange={(e) => {
    setRecipientEmail(e.target.value);
    setShareUrl(null);
    setEmailSentTo(null);
  }}
```

```ts
  onChange={(e) => {
    setPermission(e.target.value as Permission);
    setShareUrl(null);
    setEmailSentTo(null);
  }}
```

```ts
  onChange={(e) => {
    setExpiresInDays(Number(e.target.value));
    setShareUrl(null);
    setEmailSentTo(null);
  }}
```

- [ ] **Step 5: Replace the create/copy/share handlers**

Delete `handleGenerateInvite` (lines 113-138), `handleCopyLink` (lines 140-150), and `handleWebShare` (lines 218-234 of the original handlers block). Add in their place:

```ts
  const createForChannel = async (sendEmail: boolean): Promise<string | null> => {
    setError(null);
    setIsCreatingInvite(true);
    try {
      const result = await sharing.createInviteAndGrantAgent(
        folder,
        recipientEmail.trim(),
        permission,
        undefined,
        sendEmail,
      );
      setShareUrl(result.shareUrl);
      loadAccessData();
      return result.shareUrl;
    } catch (err) {
      console.error('Failed to create invite:', err);
      setError(err instanceof Error ? err.message : 'Failed to create invite');
      return null;
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopy = async () => {
    const url = await createForChannel(false);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link to clipboard');
    }
  };

  const handleShare = async () => {
    const url = await createForChannel(false);
    if (!url) return;
    try {
      await navigator.share({
        title: `Join ${folder.name}`,
        text: `You've been invited to collaborate on "${folder.name}"`,
        url,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
        setError('Failed to share link');
      }
    }
  };

  const handleEmailInvite = async () => {
    const recipient = recipientEmail.trim();
    const url = await createForChannel(true);
    if (!url) return;
    setEmailSentTo(recipient);
  };
```

- [ ] **Step 6: Replace the Get-Link button + result block with the action row**

Replace the invite "Get Link" button (lines 244-251) and the `{shareUrl && (...)}` result block (lines 253-281) with:

```tsx
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleCopy}
                disabled={isCreatingInvite || !isRecipientValid()}
                className="h-10"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Copy link
              </Button>

              {hasWebShare ? (
                <Button
                  onClick={handleShare}
                  disabled={isCreatingInvite || !isRecipientValid()}
                  className="h-10"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              ) : (
                <Button
                  onClick={handleEmailInvite}
                  disabled={isCreatingInvite || !isRecipientValid()}
                  className="h-10"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email invite
                </Button>
              )}
            </div>

            {shareUrl && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
                <p className="text-sm font-medium text-green-900 dark:text-green-300">
                  {emailSentTo ? `Invite emailed to ${emailSentTo}` : 'Invite link ready'}
                </p>
                <Input
                  value={shareUrl}
                  readOnly
                  className="font-mono text-xs bg-surface-primary"
                />
              </div>
            )}
```

(The standalone `Get Link` button is gone; the `Permission`/`Expires` selectors above it stay. `Mail` is already imported at line 3.)

- [ ] **Step 7: Run the component test to verify it passes**

Run: `cd /home/john/src/checklist && npx vitest run src/components/sharing/__tests__/ShareDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Type-check and lint the changed files**

Run: `cd /home/john/src/checklist && npm run type-check && npx biome check src/components/sharing/ShareDialog.tsx src/components/sharing/__tests__/ShareDialog.test.tsx`
Expected: no errors. Remove any now-unused imports Biome flags (e.g. if `Contact`/`Loader2`/`X`/`Users`/`Clock` become unused — only remove ones actually unused).

- [ ] **Step 9: Commit (checklist)**

```bash
cd /home/john/src/checklist && git add src/components/sharing docs/superpowers && \
git commit -m "feat: capability-swapped share row, optional invite email"
```

(Checklist pre-commit runs the full check suite; let it run, do not bypass.)

---

## Manual verification (after all tasks)

- Desktop browser (no `navigator.share`): open a folder's Share dialog → row shows **Copy link** + **Email invite**. Enter an address, click **Email invite** → backend sends the PurelyMail invite; UI shows "Invite emailed to …".
- Mobile/PWA (`navigator.share` present): row shows **Copy link** + **Share** → Share opens the OS sheet; confirm via backend logs that **no** invite email was sent.
- Copy on either platform: link copied, no email sent.

## Self-review notes

- Spec coverage: capability swap (Task 3 Step 6), `sendEmail` flag end-to-end (Tasks 1-2), email only via Email invite (Task 3 handlers), disabled-until-valid (Task 3 Step 6 `disabled` props), auth emails untouched (Task 1 leaves lines 320/1258 paths alone). ✅
- Type consistency: `sendEmail?: boolean` trailing param identical across client interface + impls + ShareDialog call; `maybeSendInviteEmail` signature matches its test. ✅
