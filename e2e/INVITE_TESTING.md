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
| unauthenticated visitor is asked to sign in and sees no invite details | Signed-out accept page → Google/Apple sign-in, no folder, inviter or Accept button | ✅ |
| wrong account (test3) gets the invalid-invite error and sees no details | `validate` answers a non-recipient `{ valid: false }` → "Invite Error" | ✅ |
| revoked invite shows an error to the recipient | Organizer revokes → `validate` answers `{ valid: false }` → "Invite Error" | ✅ |
| recipient accepts and gains folder access | Accept → RBAC grant → folder appears in recipient tree | ✅ |

The "Wrong Account" screen follows only an accept refused with `wrong_account`, which a
non-recipient never reaches here, so `InviteAcceptPage.test.tsx` covers it.

The suite does not read the invite email, which names the folder (its subject is
`<inviter> invited you to <folder name>`). GreenMail is used to verify the test
accounts' signup emails so they can log in.

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
  With mail env the dev server runs with `CHECKLIST_TEST_AUTH=0`, so email verification is
  required and signup sends the verification email the setup reads. Without it, `1` turns
  verification off for the default suites and marks each new signup's email verified, since
  rowboat lets an account validate or accept an invite only for a verified address.

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
