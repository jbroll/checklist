# Checklist Invite E2E Testing — Design

**Date:** 2026-06-20
**Status:** Approved (pending user spec review)

## Goal

Add a real, closed-loop end-to-end invite test suite for checklist, modeled on
wickedmap's canvasser-invite testing. Today checklist's invite coverage is either
fully API-mocked (`e2e/sharing-ui.spec.ts` — every `/api/shares/*` call stubbed via
`page.route`) or in-process backend tests (`backend/test/sharing*.test.ts`). The
**missing layer** is the wickedmap-equivalent: two real authenticated accounts +
the real backend + real Jazz, where an organizer creates a folder, generates a real
invite, a recipient opens the link and accepts, and we **verify the recipient
actually gained access** (the shared folder appears in their tree, with access
matching the granted permission).

## Reference: how wickedmap approaches auth for testing

Read from `/home/john/src/wicketmap-wt2`:

- **Real persistent accounts**, not anonymous: `test1` (organizer), `test2`
  (recipient/canvasser), `test3` (third party, for email-mismatch). Address
  extensions on one mailbox; IMAP filters by `To:`.
- **A `auth-setup` Playwright project runs once** (`tests/auth.setup.ts`,
  `testMatch: /auth\.setup\.ts/`). Per account: try login → if not signed in, sign
  up → verify email by fetching the verification link via `imap-tool` → login →
  assert signed in.
- **Flush Jazz to the peer before saving:** after login it calls
  `window.__testAPI.waitForSync()` so the freshly-migrated account CoValues
  (`root`, `sharedMapReferences`) upload before `storageState` is saved. Skipping
  this makes a later context fail with "Account unavailable".
- **Persist `storageState`** → `tests/.auth/test1.json`, `test2.json`, `test3.json`
  (BetterAuth session cookie/localStorage; IndexedDB re-syncs from the peer).
- **The `invite` project depends on it:** `dependencies: ["auth-setup"]`,
  `use.storageState: ".auth/test1.json"` (default = organizer). Tests needing the
  recipient spin up `browser.newContext({ storageState: ".auth/test2.json" })`.
- **Setup is serial** (`mode: "serial"`) so three account migrations don't contend
  on the CI Jazz peer / app-shell mount budget. Runs once → doesn't slow the suite.
- **Cold-load race mitigation:** loading a persisted account in a fresh context can
  hit a Jazz auth race even after `isReady`; the specs `reload()` to re-init Jazz
  from local creds and retry (`waitForHomeReady`).
- **Mail-infra gating:** the invite + auth-setup projects register only when
  `hasEmailInfra` (SMTP_HOST + IMAP_* present); a targeted runner `ci/e2e-invite`
  runs `--project=invite` (+ its `auth-setup` dependency) against the GPU mail
  handler.

This structure transfers 1:1 to checklist.

## Decisions (from brainstorming)

1. **Layer:** real closed-loop E2E (two real accounts, real backend, real Jazz,
   verified access). Not just deepening mocked/backend tests.
2. **Invite delivery:** **copy-link flow only.** Checklist does not email invites
   (the backend has no invite-email send; `ShareDialog` shows a URL to copy). The
   mail handler is therefore used **only to verify the test accounts' emails at
   signup** so they can log in — *not* to deliver invites.
3. **Auth mechanism:** **email/password + IMAP** (wickedmap-literal). Checklist
   already supports `emailAndPassword` + email verification (`EmailAuthDialog.tsx`,
   `backend/src/auth.ts`). The GPU mail handler + `/home/john/bin/imap-tool`
   already exist, and wickedmap's `auth-helper.ts` + `imap-helper.ts` are directly
   portable.
4. **Test mailbox:** **gpu GreenMail test server** — no real provider mailbox.
   GreenMail runs on the gpu (SMTP `127.0.0.1:3025`, IMAP `127.0.0.1:3143`) as a
   catch-all: it accepts mail to any address and gives each recipient its own IMAP
   mailbox. Test accounts use `checklist-test1@checklist.rkroll.com`, `-test2`,
   `-test3`; the helper reads each via `IMAP_PER_RECIPIENT` mode (logs into the
   recipient's own mailbox, any password — GreenMail auto-creates users). No
   credentials to provision. Because GreenMail binds to localhost on the gpu, the
   invite E2E runs **on the gpu** (wickedmap's `ci-run.sh` model) or via an SSH
   tunnel for laptop iteration.

## Architecture

```
e2e/
├── .auth/                            # gitignored — persisted storageState
│   ├── test1.json   (organizer)
│   ├── test2.json   (recipient)
│   └── test3.json   (third party — email mismatch)
├── helpers/
│   ├── auth-helper.ts                # ported: TEST_ACCOUNTS, signUp/verify/login,
│   │                                 #         isSignedIn, waitForHomeReady
│   ├── imap-helper.ts                # ported: waitForEmail, extractVerificationLink,
│   │                                 #         deleteEmail, mailboxFor
│   ├── invite-helper.ts             # checklist-specific: openShareDialog,
│   │                                 #   generateInvite() -> real shareUrl,
│   │                                 #   revokeInvite(), folder-visible assertions
│   └── folder-name.ts               # uniqueFolderName() — collision-safe per run
├── invite.setup.ts                   # auth-setup project: log in test1/2/3, flush
│                                     #   sync, save storageState
└── invite-closed-loop.spec.ts        # the real closed-loop suite (serial)

playwright.config.ts                  # + auth-setup + invite projects (email-gated),
                                      #   serial, invite dependsOn auth-setup
```

Plus configuration/infra:

- **E2E mail env** (mirrors wickedmap): point the backend SMTP transport and
  `imap-tool` at the gpu GreenMail. For gpu-local runs: `SMTP_HOST=127.0.0.1`,
  `SMTP_PORT=3025`, `IMAP_HOST=127.0.0.1`, `IMAP_USERNAME=<recipient>`,
  `IMAP_PASSWORD=<any>`, `IMAP_PER_RECIPIENT=1`. For laptop runs: same via an SSH
  tunnel to `gpu:3025`/`gpu:3143`. The Playwright `webServer` command sources these
  so both the backend (sending verification mail) and `imap-helper` see them.
  GreenMail needs no real credentials; the backend SMTP transport must tolerate a
  no-auth / dummy-auth server (verify nodemailer config doesn't force auth).
- **`hasEmailInfra`** gate in `playwright.config.ts`: register `auth-setup` +
  `invite` projects only when `IMAP_HOST` + `IMAP_USERNAME` are present (GreenMail
  needs no password, so gate on host+username, defaulting password to a dummy).
  Where mail infra is unreachable, the suite self-excludes (no failure).
- **`ci/e2e-invite`-equivalent** targeted runner (optional, nice-to-have) to run
  just `--project=invite` against the GPU mail handler.

## Components

### auth-setup (`e2e/invite.setup.ts`)
Serial. For each of test1/test2/test3: `loginTestUser` → if not signed in,
`signUpTestUser` → `verifyTestUserEmail` (IMAP) → login → assert `isSignedIn` →
**flush sync** → `context.storageState({ path })`. Idempotent across runs (accounts
persist; re-login path skips signup).

### Closed-loop spec (`e2e/invite-closed-loop.spec.ts`), `describe.configure({ mode: "serial" })`
Happy path:
1. **Organizer** (default storageState = test1) creates a folder
   (`uniqueFolderName()`), opens the Share dialog.
2. **Organizer generates a real invite** for `test2`'s email with a chosen
   permission → capture the real `shareUrl` from the readonly input. **No
   `page.route` mocks** — the real backend issues the token + grants the agent.
3. **Recipient** (`newContext({ storageState: test2.json })`) opens the link, sees
   real validated invite details (sender email, permission), clicks **Accept
   Invite** → `Access Granted!`.
4. **Verify access:** recipient redirected to `/`; the shared folder **appears by
   name in the recipient's tree** (real Jazz grant + sync — the actual product
   outcome).

### Negative / edge paths
- **Unauthenticated** visitor on a real link → invite details + sign-in prompt
  (not Accept). (Use an empty-storage context so it isn't signed in as organizer.)
- **Email mismatch** → signed in as `test3` on `test2`'s invite → "Wrong Account".
- **Revoked invite** → organizer revokes; recipient opening the link gets the
  revoked / `not_found` error (real backend).
- **Permission gating** → invite as `reader`; verify recipient gains access but the
  folder is read-only. *(See risk below — assertion strength depends on whether the
  UI enforces read-only for readers; if not, assert "folder visible + reader role"
  and file a follow-up.)*

### Reliability & cleanup
- Suite runs **serial / single worker** (ordered loop), `test.setTimeout(120_000)`.
- `uniqueFolderName()` per run so concurrent CI jobs / the shared real Jazz peer
  never collide.
- `afterAll` soft-deletes (`archived: true`, per CLAUDE.md) the folders this run
  created, via the organizer context.
- `waitForHomeReady()` reload-retry absorbs the Jazz cold-load auth race.

## Verification of the work itself

Run via the email-gated `invite` project against the real backend+frontend
(existing `npm run dev` webServer) with the GPU mail handler reachable. Confirm
green locally; the pre-commit hook (type-check + lint + unit + E2E) must pass.

## Risks / open items

1. **`waitForSync` is a stub.** Checklist's `window.__testServices.util.waitForSync`
   is `setTimeout(100)` — not a real Jazz upload flush like wickedmap's
   `__testAPI.waitForSync()`. Without a real flush, storageState reuse can race
   ("account unavailable"). **Plan:** implement a real `waitForSync` (await account
   CoValue sync) exposed for E2E, and/or rely on `waitForHomeReady` reload-retry.
   Decide during implementation; prefer a real flush for stability.
2. **Test hooks on the authenticated app.** `window.__testServices` is set by
   `setupTestHelpers()`; confirm it's exposed in the authenticated app build used by
   E2E (not only `/test`). If gated, expose a minimal hook (account info / folder
   list / waitForSync) for auth-setup + access verification.
3. **GreenMail reachability / run location.** GreenMail binds to localhost on the
   gpu, so the invite E2E must run on the gpu or through an SSH tunnel
   (`gpu:3025`/`gpu:3143`). On the laptop without a tunnel the suite self-excludes
   via `hasEmailInfra`. Confirm the backend nodemailer transport connects to a
   no-auth GreenMail server (may need `secure:false` + tolerate missing auth).
4. **Reader read-only enforcement** may not exist in the UI yet (see Permission
   gating). Keep that assertion light if unenforced.

## Out of scope

- Emailing invites (copy-link only).
- Mobile / Capacitor invite flows.
- Replacing or removing the existing mocked `sharing-ui.spec.ts` (it stays as the
  fast UI-rendering layer).
