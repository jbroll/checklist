# Invite E2E Testing

Real, closed-loop end-to-end tests for the folder-sharing invite flow, modeled on
wickedmap's canvasser-invite suite. Unlike the mocked `e2e/sharing-ui.spec.ts`
(which stubs every `/api/shares/*` call), this suite uses **two real authenticated
accounts + the real backend + real rowboat sync**.

## What it covers

`e2e/invite-closed-loop.spec.ts` (project `invite`, depends on `auth-setup`):

| Test | What it exercises | Status |
|------|-------------------|--------|
| organizer creates a folder and generates a real invite | Real folder creation + Share dialog + backend invite creation | ✅ |
| recipient sees the real validated invite details | Real backend `validate` + recipient session → "valid" state | ✅ |
| unauthenticated visitor sees invite details + sign-in prompt | Signed-out accept page → Google/Apple sign-in | ✅ |
| wrong account (test3) sees the email-mismatch state | Logged-in email ≠ invite recipient → "Wrong Account" | ✅ |
| revoked invite shows an error to the recipient | Organizer revokes → recipient gets `not_found` error | ✅ |
| recipient accepts and gains folder access | Accept → RBAC grant → folder appears in recipient tree | ✅ |

Invites are **copy-link only** — checklist does not email invites. GreenMail is
used solely to verify the test accounts' signup emails so they can log in.

## Infrastructure

- **Auth**: `e2e/invite.setup.ts` (project `auth-setup`) provisions three real
  email/password accounts — sign up → verify the signup email via GreenMail IMAP →
  log in — and persists each session to `e2e/.auth/test{1,2,3}.json` (gitignored).
  Test accounts: `checklist-test{1,2,3}@checklist.rkroll.com`.
- **Mail**: a GreenMail test server on the **gpu** (SMTP `127.0.0.1:3025`, IMAP
  `127.0.0.1:3143`), catch-all with per-recipient mailboxes. The IMAP reader is
  `e2e/helpers/greenmail-imap.py` (stdlib `imaplib`; `imap-tool`'s `--no-ssl` path
  crashes against GreenMail), wrapped by `e2e/helpers/imap-helper.ts`.
- **Gating**: `playwright.config.ts` registers the `auth-setup` + `invite` projects
  only when `IMAP_HOST` + `IMAP_USERNAME` are set (`hasEmailInfra`). Without mail
  env the suite self-excludes, so normal `npm run test:e2e` / CI is unaffected.

## Running

GreenMail binds to localhost on the gpu, so run on the gpu or via an SSH tunnel.

```bash
# On the gpu (GreenMail is local):
SMTP_HOST=127.0.0.1 SMTP_PORT=3025 SMTP_USER=greenmail SMTP_PASS=greenmail \
IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USERNAME=greenmail IMAP_PASSWORD=greenmail \
IMAP_PER_RECIPIENT=1 npm run test:e2e:invite

# From the laptop (opens an SSH tunnel to gpu GreenMail, then runs):
npm run test:e2e:invite:tunnel
```

GreenMail needs no real credentials — any username/password works and the
per-recipient mailbox is auto-created on first access.

## Fixed: invite accept (stale Jazz API in agent.ts)

The accept flow was returning **500** ("Failed to grant access") because
checklist's custom `backend/src/agent.ts` used **Jazz v0.18 APIs** that no longer
exist in v0.19, diverging from the canonical `@jbr-jazz/hierarchy-backend`:

| Stale (v0.18) | Correct (v0.19) |
|---|---|
| `(target as any)._owner` / `'_owner' in target` | `target.$jazz.owner` |
| `'id' in account` / `'loadingState' in account` | `'$jazz' in account` (`isLoadedAccount`) |
| `ownerGroup.waitForSync()` | `ownerGroup.$jazz.waitForSync()` |

The agent grant itself always worked — the worker could load the folder fine; the
code just read the wrong property and threw "Target not found" before reaching the
grant. Fixed in `addToGroup`, `getGroupMembers`, `validateSenderAccess`, and
`removeFromGroup`. The closed-loop accept test now passes end-to-end.

## Related fix

While building this suite, a real bug was found and fixed in
`src/components/sharing/InviteAcceptPage.tsx`: the validate `useEffect` depended on
the unstable `me`/`sharing` object refs, causing an **infinite re-validation loop**
(~1600 `/validate` calls in 8s) that tripped the token rate limiter and left
authenticated users on an "Invite Error" page. It now keys on the stable account
id (`meId`) and validates twice (pre/post account load).
