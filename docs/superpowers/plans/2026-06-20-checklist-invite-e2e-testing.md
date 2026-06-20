# Checklist Invite E2E Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, closed-loop E2E invite test suite (two real authenticated accounts + real backend + real Jazz) modeled on wickedmap's canvasser-invite tests, where an organizer generates a real invite and a recipient accepts it and verifiably gains folder access.

**Architecture:** A Playwright `auth-setup` project provisions real email/password test accounts (verified via the gpu GreenMail test server over IMAP) and persists each as `storageState`. A dependent, email-gated `invite` project runs the closed-loop spec against the real authenticated UI: organizer creates a folder, generates a copy-link invite via the real backend, recipient (second `storageState`) opens the link and accepts, and the spec asserts the shared folder appears in the recipient's tree. Both projects self-exclude when mail infra is unreachable.

**Tech Stack:** Playwright, TypeScript, BetterAuth (email/password + email verification), Jazz.tools, nodemailer (SMTP → GreenMail), `imap-tool` CLI (IMAP → GreenMail), GreenMail test mail server on the gpu.

## Global Constraints

- Invite delivery is **copy-link only** — checklist does not email invites. GreenMail is used solely to verify the test accounts' signup emails so they can log in.
- Test accounts: `checklist-test1@checklist.rkroll.com` (organizer), `checklist-test2@checklist.rkroll.com` (recipient), `checklist-test3@checklist.rkroll.com` (third party / email mismatch). Shared password `CheckList-Test-2026!` (>= 8 chars per `minPasswordLength: 8`).
- GreenMail: gpu `SMTP 127.0.0.1:3025`, `IMAP 127.0.0.1:3143`, catch-all, per-recipient mailboxes, any password. Reach from the laptop via SSH tunnel; reach on the gpu via localhost.
- E2E base URL: `http://localhost:8765` (existing `webServer: npm run dev`). Backend dev mode disables CSRF + uses non-secure `lax` cookies.
- `window.__testServices` exists ONLY on `/test` (anonymous `TestPage`). The authenticated closed loop must drive the real app UI; do not rely on `__testServices` for authenticated actions or sync flushes.
- Soft-delete only (`archived: true`), never hard-delete (CLAUDE.md).
- Commit messages: subject 10-72 chars, body only `Co-Authored-By: Claude <noreply@anthropic.com>`, ASCII only (CLAUDE.md).
- Do not bypass commit hooks. Non-code changes (docs) skip the hooks.

---

## Task 0: Branch + scaffolding (env runner, gitignore, mail-infra gate)

**Files:**
- Create: `e2e/.auth/.gitkeep`
- Modify: `.gitignore`
- Create: `e2e/helpers/mail-env.ts`
- Modify: `package.json` (scripts)
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: `hasEmailInfra` gating in `playwright.config.ts`; npm scripts `test:e2e:invite` and `test:e2e:invite:tunnel`; the `auth-setup` + `invite` Playwright projects (storageState paths `e2e/.auth/test{1,2,3}.json`).

- [ ] **Step 1: Create branch**

```bash
git checkout -b invite-e2e-closed-loop
```

- [ ] **Step 2: Ignore persisted auth state**

Append to `.gitignore`:

```
# Playwright persisted auth sessions (real test-account sessions)
e2e/.auth/
```

Create `e2e/.auth/.gitkeep` (empty file) so the dir exists but contents are ignored — then force-add only the keep file:

```bash
mkdir -p e2e/.auth && touch e2e/.auth/.gitkeep
git add -f e2e/.auth/.gitkeep
```

- [ ] **Step 3: Add the invite runner scripts**

In `package.json` `scripts`, add (keep existing scripts):

```json
"test:e2e:invite": "playwright test --project=invite",
"test:e2e:invite:tunnel": "ssh -f -N -o ExitOnForwardFailure=yes -L 3025:127.0.0.1:3025 -L 3143:127.0.0.1:3143 gpu; SMTP_HOST=127.0.0.1 SMTP_PORT=3025 SMTP_USER=greenmail SMTP_PASS=greenmail IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USERNAME=greenmail IMAP_PASSWORD=greenmail IMAP_PER_RECIPIENT=1 playwright test --project=invite"
```

Rationale: `test:e2e:invite` assumes mail env is already exported (gpu-local CI). `test:e2e:invite:tunnel` opens an SSH tunnel to the gpu GreenMail and sets the env for laptop iteration. GreenMail accepts any SMTP/IMAP credentials and auto-creates the per-recipient mailbox on first access.

- [ ] **Step 4: Add the mail-infra gate + projects to `playwright.config.ts`**

Replace the file body with (preserves smoke-test mode and the existing chromium project):

```ts
import { defineConfig, devices } from '@playwright/test';

const isSmokeTest = process.env.SMOKE_TEST === 'true';
const baseURL = isSmokeTest
  ? process.env.BASE_URL || 'http://localhost:8765'
  : 'http://localhost:8765';

// The invite closed-loop needs SMTP+IMAP (GreenMail) to verify test-account
// signup emails. When unset, the auth-setup + invite projects self-exclude so
// normal/CI runs without mail infra are unaffected.
const hasEmailInfra = Boolean(process.env.IMAP_HOST && process.env.IMAP_USERNAME);

export default defineConfig({
  testDir: './e2e',
  testIgnore: isSmokeTest ? undefined : ['**/deploy-smoke.spec.ts'],
  globalSetup: isSmokeTest ? undefined : './playwright-global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI || isSmokeTest ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Invite + setup specs run under their own projects below.
      testIgnore: ['**/invite.setup.ts', '**/invite-closed-loop.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    ...(hasEmailInfra
      ? [
          {
            name: 'auth-setup',
            testMatch: /invite\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
          },
          {
            name: 'invite',
            testMatch: /invite-closed-loop\.spec\.ts/,
            dependencies: ['auth-setup'],
            use: {
              ...devices['Desktop Chrome'],
              // Default actor = organizer (test1); recipient/third-party specs
              // open their own context with the matching storageState.
              storageState: 'e2e/.auth/test1.json',
            },
          },
        ]
      : []),
  ],
  webServer: isSmokeTest
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:8765',
        reuseExistingServer: !process.env.CI,
        // Pass mail env through to the backend so verification emails are sent
        // to GreenMail. Playwright forwards process.env to the webServer by default.
        timeout: 120000,
      },
});
```

- [ ] **Step 5: Verify gating works both ways**

Run (no mail env): `npx playwright test --list 2>&1 | grep -c invite-closed-loop || true`
Expected: `0` (invite project absent without mail infra).

Run (with mail env): `IMAP_HOST=x IMAP_USERNAME=y npx playwright test --list 2>&1 | grep -c "invite"`
Expected: `> 0` (auth-setup + invite projects registered).

- [ ] **Step 6: Commit**

```bash
git add .gitignore e2e/.auth/.gitkeep package.json playwright.config.ts
git commit -m "test: scaffold invite e2e projects and mail gate"
```

---

## Task 1: IMAP helper (GreenMail via Python imaplib)

**Files:**
- Create: `e2e/helpers/greenmail-imap.py`
- Create: `e2e/helpers/imap-helper.ts`

**DEVIATION (verified during execution):** `imap-tool --no-ssl` has an internal bug
(`AttributeError: property 'file' of 'IMAP4WithTimeout' object has no setter`) against
GreenMail's plain IMAP. Python stdlib `imaplib` works (verified: login/select/search on
`127.0.0.1:3143`). So the helper shells to a tiny `greenmail-imap.py` (zero deps) instead
of `imap-tool`. Interface and all other tasks unchanged.

**Interfaces:**
- Produces: `waitForEmail(subjectQuery, recipientEmail, opts?) -> Promise<ImapEmailBody>`, `extractVerificationLink(body) -> string | null`, `deleteEmail(uid, folder?, mailboxUser?)`, `mailboxFor(email) -> string | undefined`, `latestUid(email) -> number`. `ImapEmailBody` has `{ uid, subject, from, to, date, body }`.

- [ ] **Step 0: Write the Python IMAP reader**

Create `e2e/helpers/greenmail-imap.py`:

```python
#!/usr/bin/env python3
"""Minimal IMAP reader for GreenMail (plain IMAP). Zero deps (stdlib imaplib).
Reads IMAP_HOST, IMAP_PORT, IMAP_USERNAME, IMAP_PASSWORD from env.
Usage: greenmail-imap.py emails <folder> | read <folder> <uid> | delete <folder> <uid>
Outputs JSON on stdout."""
import email, imaplib, json, os, sys
from email.header import decode_header, make_header


def _conn():
    host = os.environ.get("IMAP_HOST")
    port = int(os.environ.get("IMAP_PORT", "3143"))
    user = os.environ.get("IMAP_USERNAME")
    pw = os.environ.get("IMAP_PASSWORD", "greenmail")
    if not host or not user:
        print(json.dumps({"error": "IMAP_HOST and IMAP_USERNAME required"}))
        sys.exit(1)
    m = imaplib.IMAP4(host, port)
    m.login(user, pw)
    return m


def _hdr(v):
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return v or ""


def cmd_emails(folder):
    m = _conn()
    m.select(folder)
    typ, data = m.search(None, "ALL")
    out = []
    for num in data[0].split():
        typ, msg_data = m.fetch(num, "(UID BODY.PEEK[HEADER])")
        uid = int(num)
        for part in msg_data:
            if isinstance(part, tuple):
                if b"UID" in part[0]:
                    try:
                        uid = int(part[0].split(b"UID")[1].split()[0].strip(b" )"))
                    except Exception:
                        pass
                msg = email.message_from_bytes(part[1])
                out.append({"uid": uid, "subject": _hdr(msg.get("Subject")),
                            "from": _hdr(msg.get("From")), "to": _hdr(msg.get("To")),
                            "date": _hdr(msg.get("Date"))})
    m.logout()
    print(json.dumps(out))


def _body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                return p.get_payload(decode=True).decode("utf-8", "replace")
        for p in msg.walk():
            if p.get_content_type() == "text/html":
                return p.get_payload(decode=True).decode("utf-8", "replace")
        return ""
    payload = msg.get_payload(decode=True)
    return payload.decode("utf-8", "replace") if payload else ""


def cmd_read(folder, uid):
    m = _conn()
    m.select(folder)
    typ, msg_data = m.uid("fetch", str(uid), "(BODY.PEEK[])")
    raw = next((p[1] for p in msg_data if isinstance(p, tuple)), None)
    if not raw:
        print(json.dumps({"error": "not found"})); m.logout(); return
    msg = email.message_from_bytes(raw)
    print(json.dumps({"uid": int(uid), "subject": _hdr(msg.get("Subject")),
                      "from": _hdr(msg.get("From")), "to": _hdr(msg.get("To")),
                      "date": _hdr(msg.get("Date")), "body": _body(msg)}))
    m.logout()


def cmd_delete(folder, uid):
    m = _conn()
    m.select(folder)
    m.uid("store", str(uid), "+FLAGS", "(\\Deleted)")
    m.expunge()
    m.logout()
    print(json.dumps({"deleted": int(uid)}))


if __name__ == "__main__":
    args = sys.argv[1:]
    try:
        if args and args[0] == "emails":
            cmd_emails(args[1] if len(args) > 1 else "INBOX")
        elif args and args[0] == "read":
            cmd_read(args[1], args[2])
        elif args and args[0] == "delete":
            cmd_delete(args[1], args[2])
        else:
            print(json.dumps({"error": "unknown command"})); sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": repr(e)})); sys.exit(1)
```

- [ ] **Step 1: Write the helper (shells to greenmail-imap.py)**

Create `e2e/helpers/imap-helper.ts`:

```ts
/**
 * IMAP Helper — CLI wrapper around imap-tool for Playwright E2E tests.
 * Reads IMAP_HOST / IMAP_USERNAME / IMAP_PASSWORD from env (GreenMail on the gpu).
 * In IMAP_PER_RECIPIENT mode (GreenMail), logs into each recipient's own mailbox.
 */
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'greenmail-imap.py');

interface ImapEmail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
}

export interface ImapEmailBody {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

function imapEnv(mailboxUser?: string): NodeJS.ProcessEnv {
  const host = process.env.IMAP_HOST;
  const username = mailboxUser ?? process.env.IMAP_USERNAME;
  const password = process.env.IMAP_PASSWORD ?? 'greenmail';
  if (!host || !username) {
    throw new Error('IMAP not configured: set IMAP_HOST, IMAP_USERNAME (and IMAP_PER_RECIPIENT for GreenMail)');
  }
  return { ...process.env, IMAP_HOST: host, IMAP_USERNAME: username, IMAP_PASSWORD: password };
}

function py(args: string[], mailboxUser?: string): string {
  return execSync(`python3 ${SCRIPT} ${args.map((a) => `"${a}"`).join(' ')}`, {
    env: imapEnv(mailboxUser),
    timeout: 20000,
  }).toString();
}

export function mailboxFor(recipientEmail: string): string | undefined {
  return process.env.IMAP_PER_RECIPIENT ? recipientEmail : undefined;
}

export function listEmails(folder = 'INBOX', mailboxUser?: string): ImapEmail[] {
  const out = JSON.parse(py(['emails', folder], mailboxUser));
  if (out && out.error) throw new Error(out.error);
  return out;
}

export function latestUid(recipientEmail: string): number {
  const mailbox = mailboxFor(recipientEmail);
  let max = 0;
  try {
    for (const email of listEmails('INBOX', mailbox)) if (email.uid > max) max = email.uid;
  } catch {
    // empty/absent mailbox
  }
  return max;
}

export function readEmail(uid: number, folder = 'INBOX', mailboxUser?: string): ImapEmailBody {
  const out = JSON.parse(py(['read', folder, String(uid)], mailboxUser));
  if (out && out.error) throw new Error(out.error);
  return out;
}

export function extractVerificationLink(emailBody: string): string | null {
  const match = emailBody.match(/https?:\/\/[^\s"<]+\/api\/auth\/verify-email\?[^\s"<]+/);
  return match?.[0] ?? null;
}

const SEARCH_FOLDERS = ['INBOX', 'Junk'];

export async function waitForEmail(
  subjectQuery: string,
  recipientEmail: string,
  { timeoutMs = 30000, pollMs = 3000, sinceUid = 0 } = {},
): Promise<ImapEmailBody> {
  const deadline = Date.now() + timeoutMs;
  const queryLower = subjectQuery.toLowerCase();
  const recipientLower = recipientEmail.toLowerCase();
  const mailbox = mailboxFor(recipientEmail);

  while (Date.now() < deadline) {
    for (const folder of SEARCH_FOLDERS) {
      try {
        const emails = listEmails(folder, mailbox);
        for (const email of [...emails].reverse()) {
          if (email.uid <= sinceUid) continue;
          if (!email.subject.toLowerCase().includes(queryLower)) continue;
          const body = readEmail(email.uid, folder, mailbox);
          if (body.to.toLowerCase().includes(recipientLower)) return body;
        }
      } catch {
        // folder may not exist
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for "${subjectQuery}" to ${recipientEmail} (${timeoutMs}ms)`);
}

export function deleteEmail(uid: number, folder = 'INBOX', mailboxUser?: string): void {
  py(['delete', folder, String(uid)], mailboxUser);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (no new errors from `e2e/helpers/imap-helper.ts`).

- [ ] **Step 3: Smoke-test the IMAP wiring (requires tunnel/gpu)**

Run:
```bash
ssh -f -N -L 3143:127.0.0.1:3143 gpu
IMAP_HOST=127.0.0.1 IMAP_PORT=3143 IMAP_USERNAME=checklist-test1@checklist.rkroll.com IMAP_PASSWORD=greenmail IMAP_PER_RECIPIENT=1 \
  python3 e2e/helpers/greenmail-imap.py emails INBOX
```
Expected: prints `[]` (empty mailbox) with no error. If it errors, fix env/tunnel before continuing.

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/imap-helper.ts
git commit -m "test: add imap helper for invite e2e"
```

---

## Task 2: Unique-name helper

**Files:**
- Create: `e2e/helpers/folder-name.ts`
- Test: `e2e/helpers/folder-name.test.ts`

**Interfaces:**
- Produces: `uniqueFolderName(prefix: string) -> string` — `${prefix} ${timestamp}-${rand}` so concurrent runs against the shared Jazz peer never collide.

- [ ] **Step 1: Write the failing test**

Create `e2e/helpers/folder-name.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { uniqueFolderName } from './folder-name';

describe('uniqueFolderName', () => {
  it('includes the prefix', () => {
    expect(uniqueFolderName('Invite Test')).toContain('Invite Test');
  });
  it('produces distinct names on repeated calls', () => {
    const a = uniqueFolderName('X');
    const b = uniqueFolderName('X');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run e2e/helpers/folder-name.test.ts`
Expected: FAIL (`uniqueFolderName` not found).

- [ ] **Step 3: Implement**

Create `e2e/helpers/folder-name.ts`:

```ts
let counter = 0;
/** Collision-safe name for folders created against the shared Jazz peer. */
export function uniqueFolderName(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix} ${Date.now()}-${counter}-${rand}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run e2e/helpers/folder-name.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/folder-name.ts e2e/helpers/folder-name.test.ts
git commit -m "test: add unique folder-name helper"
```

---

## Task 3: Auth helper (checklist email/password flow)

**Files:**
- Create: `e2e/helpers/auth-helper.ts`

**Interfaces:**
- Consumes: `waitForEmail`, `extractVerificationLink` from `imap-helper.ts`.
- Produces: `TEST_ACCOUNTS` (`organizer`, `recipient`, `thirdParty`, each `{ email, name, password }`); `signUpTestUser(page, email, password, name)`, `verifyTestUserEmail(page, email)`, `loginTestUser(page, email, password)`, `isSignedIn(page) -> Promise<boolean>`, `waitForHomeReady(page)`.

Note on UI flow (from `src/components/AuthGate.tsx`, `SignInDialog.tsx`, `EmailAuthDialog.tsx`): the in-app "Sign In" entry opens `SignInDialog` (Google/Apple/**Continue with Email**); "Continue with Email" opens `EmailAuthDialog` (signin mode), which links to "Create account". Email field id `signin-email`/`signup-email`, password id `signin-password`/`signup-password`, name id `signup-name`. Signup uses `callbackURL=${origin}?verified=true`; the verify link (`/api/auth/verify-email?...`) redirects back to `?verified=true`, which makes `AuthGate` auto-open `EmailAuthDialog` for sign-in. After sign-in the dialog calls `window.location.reload()`.

- [ ] **Step 1: Write the helper**

Create `e2e/helpers/auth-helper.ts`:

```ts
import type { Page } from '@playwright/test';
import { waitForEmail, extractVerificationLink } from './imap-helper';

const TEST_PASSWORD = 'CheckList-Test-2026!';

export const TEST_ACCOUNTS = {
  organizer: { email: 'checklist-test1@checklist.rkroll.com', name: 'Test Organizer', password: TEST_PASSWORD },
  recipient: { email: 'checklist-test2@checklist.rkroll.com', name: 'Test Recipient', password: TEST_PASSWORD },
  thirdParty: { email: 'checklist-test3@checklist.rkroll.com', name: 'Test Third Party', password: TEST_PASSWORD },
} as const;

export type TestAccountRole = keyof typeof TEST_ACCOUNTS;

/** Open SignInDialog, then the EmailAuthDialog (signin mode). */
async function openEmailAuthDialog(page: Page): Promise<void> {
  // The "Sign In" affordance lives in the app header/menu (onSignIn -> SignInDialog).
  await page.getByRole('button', { name: /sign in/i }).first().click({ timeout: 15000 });
  await page.getByRole('button', { name: /continue with email/i }).click({ timeout: 10000 });
  await page.getByRole('heading', { name: /sign in with email/i }).waitFor({ timeout: 10000 });
}

export async function signUpTestUser(page: Page, email: string, password: string, name: string): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openEmailAuthDialog(page);
  // signin -> "Create account"
  await page.getByRole('button', { name: /create account/i }).click();
  await page.getByRole('heading', { name: /create account/i }).waitFor({ timeout: 5000 });
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(password);
  await page.getByRole('button', { name: /create account/i }).last().click();
  // "Check Your Email" confirmation
  await page.getByText(/check your email/i).waitFor({ timeout: 10000 }).catch(() => {});
}

export async function verifyTestUserEmail(page: Page, email: string): Promise<void> {
  const verificationEmail = await waitForEmail('verify', email, { timeoutMs: 40000 });
  const link = extractVerificationLink(verificationEmail.body);
  if (!link) throw new Error(`No verification link in email to ${email}:\n${verificationEmail.body.slice(0, 500)}`);
  await page.goto(link);
  await page.waitForLoadState('networkidle');
}

export async function loginTestUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  if (await isSignedIn(page)) return;
  // After verify redirect, EmailAuthDialog may already be open (signin mode).
  const emailField = page.locator('#signin-email');
  if (!(await emailField.isVisible().catch(() => false))) {
    await openEmailAuthDialog(page);
  }
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  // EmailAuthDialog reloads the page on success; wait for the reload + app shell.
  await page.waitForLoadState('networkidle');
}

export async function isSignedIn(page: Page): Promise<boolean> {
  // Authenticated app shows the folder tree "New" affordance and no "Sign In".
  for (let attempt = 0; attempt < 3; attempt++) {
    const signInVisible = await page
      .getByRole('button', { name: /sign in/i })
      .first()
      .isVisible()
      .catch(() => false);
    if (!signInVisible) {
      // Confirm the app shell actually mounted (not a transient loading screen).
      const ready = await page
        .getByRole('button', { name: /new folder|new list|add folder/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (ready) return true;
    }
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  return false;
}

/** Wait for the authenticated home tree to be interactive, with reload-retry. */
export async function waitForHomeReady(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isSignedIn(page)) return;
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  throw new Error('Home not ready / not signed in after reload retries');
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Selector verification (manual, against running app)**

Start the app (`npm run dev`), open `http://localhost:8765`, click Sign In, and confirm: SignInDialog shows "Continue with Email"; EmailAuthDialog has `#signin-email`, `#signup-email`, `#signup-name`, `#signup-password`; the "New folder"/"New list" affordance text. Adjust the regexes in `auth-helper.ts` to match the real labels if they differ. (No commit yet if changes are pending — commit after Step 4.)

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/auth-helper.ts
git commit -m "test: add email/password auth helper"
```

---

## Task 4: Auth-setup project (provision accounts -> storageState)

**Files:**
- Create: `e2e/invite.setup.ts`

**Interfaces:**
- Consumes: `TEST_ACCOUNTS`, `signUpTestUser`, `verifyTestUserEmail`, `loginTestUser`, `isSignedIn` from `auth-helper.ts`.
- Produces: `e2e/.auth/test1.json`, `test2.json`, `test3.json` (authenticated sessions).

- [ ] **Step 1: Write the setup spec**

Create `e2e/invite.setup.ts`:

```ts
/**
 * Playwright auth-setup — runs once before the invite suite.
 * Provisions the three checklist test accounts (sign up -> verify via GreenMail
 * IMAP -> login) and persists each session to storageState.
 */
import { test as setup, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_ACCOUNTS, signUpTestUser, verifyTestUserEmail, loginTestUser, isSignedIn } from './helpers/auth-helper';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.auth');

setup.describe.configure({ mode: 'serial' });
setup.setTimeout(120_000);

setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

async function setupAccount(page: Page, account: { email: string; name: string; password: string }, stateFile: string) {
  // Account may already exist from a prior run — try logging in first.
  await loginTestUser(page, account.email, account.password);
  if (await isSignedIn(page)) {
    await page.context().storageState({ path: stateFile });
    return;
  }
  await signUpTestUser(page, account.email, account.password, account.name);
  await verifyTestUserEmail(page, account.email);
  await loginTestUser(page, account.email, account.password);
  expect(await isSignedIn(page)).toBe(true);
  await page.context().storageState({ path: stateFile });
}

setup('authenticate test1 (organizer)', async ({ page }) => {
  await setupAccount(page, TEST_ACCOUNTS.organizer, path.join(AUTH_DIR, 'test1.json'));
});

setup('authenticate test2 (recipient)', async ({ page }) => {
  await setupAccount(page, TEST_ACCOUNTS.recipient, path.join(AUTH_DIR, 'test2.json'));
});

setup('authenticate test3 (third party)', async ({ page }) => {
  await setupAccount(page, TEST_ACCOUNTS.thirdParty, path.join(AUTH_DIR, 'test3.json'));
});
```

- [ ] **Step 2: Run auth-setup against GreenMail (tunnel)**

Run:
```bash
npm run test:e2e:invite:tunnel -- --project=auth-setup
```
Expected: 3 setup tests pass; `e2e/.auth/test1.json`, `test2.json`, `test3.json` created and non-empty (`ls -la e2e/.auth`).
If signup selectors fail, fix `auth-helper.ts` (Task 3 Step 3) and re-run. If the verify email never arrives, confirm the backend received GreenMail env (SMTP_HOST/PORT) — check backend logs for `[Email] Failed` vs sent.

- [ ] **Step 3: Commit**

```bash
git add e2e/invite.setup.ts
git commit -m "test: add invite auth-setup project"
```

---

## Task 5: Invite helper (authenticated share UI)

**Files:**
- Create: `e2e/helpers/invite-helper.ts`

**Interfaces:**
- Consumes: nothing from other helpers.
- Produces: `createFolder(page, name)`, `openShareDialog(page, folderName)`, `generateInvite(page, recipientEmail, permission) -> Promise<string>` (returns the real shareUrl), `revokeInvite(page, recipientEmail)`, `assertFolderVisible(page, folderName)`, `archiveFolder(page, folderName)`.

Note (from `src/components/sharing/ShareDialog.tsx`): the dialog input id is `#email`, permission `select#permission`, the generate button is labelled "Get Link", and on success a readonly input holds the `shareUrl` (and `input[value*="/invite/"]`). The folder menu → "Share" pattern is established in `e2e/sharing-ui.spec.ts` (`getByRole('menuitem', { name: 'Share' })`). The "Get Link" button is disabled until a valid email is entered.

- [ ] **Step 1: Write the helper**

Create `e2e/helpers/invite-helper.ts`:

```ts
import { expect, type Page } from '@playwright/test';

/** Create a template folder via the authenticated app UI. */
export async function createFolder(page: Page, name: string): Promise<void> {
  // "New folder"/"Add folder" affordance — adjust to the real label if needed.
  await page.getByRole('button', { name: /new folder|add folder|new list/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('textbox').first().fill(name);
  await dialog.getByRole('button', { name: /create|add|save/i }).last().click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 20000 });
}

/** Open the Share dialog from a folder's row menu (pattern from sharing-ui.spec). */
export async function openShareDialog(page: Page, folderName: string): Promise<void> {
  const folderText = page.getByText(folderName).first();
  await folderText.hover();
  const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
  const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Share' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
}

/** Generate a real copy-link invite; returns the shareUrl. */
export async function generateInvite(
  page: Page,
  recipientEmail: string,
  permission: 'reader' | 'writer' | 'admin',
): Promise<string> {
  await page.locator('#email').fill(recipientEmail);
  await page.locator('select#permission').selectOption(permission);
  await page.getByRole('button', { name: 'Get Link' }).click();
  await expect(page.getByText(/invite link generated/i)).toBeVisible({ timeout: 20000 });
  const linkInput = page.locator('input[value*="/invite/"]');
  await expect(linkInput).toBeVisible({ timeout: 10000 });
  const url = await linkInput.inputValue();
  expect(url).toContain('/invite/');
  return url;
}

/** Revoke the pending invite for a recipient (the X button on its row). */
export async function revokeInvite(page: Page, recipientEmail: string): Promise<void> {
  page.once('dialog', (d) => d.accept()); // confirm() prompt
  const row = page.locator('div').filter({ hasText: recipientEmail }).last();
  await row.getByRole('button', { name: /revoke invite/i }).click();
  await expect(page.getByText(recipientEmail)).toHaveCount(0, { timeout: 10000 });
}

export async function assertFolderVisible(page: Page, folderName: string): Promise<void> {
  await expect(page.getByText(folderName).first()).toBeVisible({ timeout: 30000 });
}

/** Soft-delete (archive) a folder via its row menu. */
export async function archiveFolder(page: Page, folderName: string): Promise<void> {
  const folderText = page.getByText(folderName).first();
  if (!(await folderText.isVisible().catch(() => false))) return;
  await folderText.hover();
  const folderRow = folderText.locator('xpath=ancestor::div[contains(@class, "group")]').first();
  const menuButton = folderRow.locator('button').filter({ has: page.locator('svg') }).last();
  await menuButton.click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('menuitem', { name: /delete|archive|remove/i }).click().catch(() => {});
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/invite-helper.ts
git commit -m "test: add authenticated share/invite helper"
```

---

## Task 6: Closed-loop happy path

**Files:**
- Create: `e2e/invite-closed-loop.spec.ts`

**Interfaces:**
- Consumes: `TEST_ACCOUNTS`, `waitForHomeReady` (auth-helper); `createFolder`, `openShareDialog`, `generateInvite`, `assertFolderVisible`, `archiveFolder` (invite-helper); `uniqueFolderName` (folder-name).

- [ ] **Step 1: Write the happy-path spec**

Create `e2e/invite-closed-loop.spec.ts`:

```ts
/**
 * Real closed-loop invite E2E. Organizer (test1, default storageState) creates a
 * folder and a real copy-link invite for the recipient (test2); the recipient
 * opens the link, accepts, and the shared folder appears in their tree.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_ACCOUNTS, waitForHomeReady } from './helpers/auth-helper';
import { createFolder, openShareDialog, generateInvite, assertFolderVisible, archiveFolder } from './helpers/invite-helper';
import { uniqueFolderName } from './helpers/folder-name';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.auth');
const FOLDER = uniqueFolderName('Invite Test Folder');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let shareUrl: string | undefined;

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test1.json') });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await waitForHomeReady(page);
    await archiveFolder(page, FOLDER);
  } finally {
    await ctx.close();
  }
});

test.describe('Invite closed loop', () => {
  test('organizer creates a folder and generates a real invite', async ({ page }) => {
    await page.goto('/');
    await waitForHomeReady(page);
    await createFolder(page, FOLDER);
    await openShareDialog(page, FOLDER);
    shareUrl = await generateInvite(page, TEST_ACCOUNTS.recipient.email, 'writer');
    expect(shareUrl).toContain('/invite/');
  });

  test('recipient opens the link, accepts, and gains access', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test2.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      // Real validated invite details from the backend.
      await expect(page.getByText(/has invited you to collaborate/i)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(TEST_ACCOUNTS.organizer.email)).toBeVisible();
      await page.getByRole('button', { name: /accept invite/i }).click();
      await expect(page.getByText(/access granted/i)).toBeVisible({ timeout: 20000 });
      // Redirects to dashboard; the shared folder syncs into the recipient's tree.
      await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
      await waitForHomeReady(page);
      await assertFolderVisible(page, FOLDER);
    } finally {
      await ctx.close();
    }
  });
});
```

- [ ] **Step 2: Run the happy path (tunnel)**

Run:
```bash
npm run test:e2e:invite:tunnel
```
Expected: auth-setup (3) + the two happy-path tests pass. The recipient ends with the shared folder visible.
If the folder doesn't appear for the recipient, increase the `assertFolderVisible` timeout and confirm the real Jazz peer (`VITE_JAZZ_PEER`) is reachable in dev; cross-account sync depends on it.

- [ ] **Step 3: Commit**

```bash
git add e2e/invite-closed-loop.spec.ts
git commit -m "test: add invite closed-loop happy path"
```

---

## Task 7: Negative / edge paths

**Files:**
- Modify: `e2e/invite-closed-loop.spec.ts`

**Interfaces:**
- Consumes: same as Task 6, plus `revokeInvite` (invite-helper).

- [ ] **Step 1: Add the unauthenticated path**

Append inside the `describe`:

```ts
  test('unauthenticated visitor sees invite details + sign-in prompt', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/folder invitation|has invited you to collaborate/i)).toBeVisible({ timeout: 20000 });
      await page.getByRole('button', { name: /accept invite/i }).click();
      await expect(page.getByText(/sign in to continue/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/continue with google/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
```

- [ ] **Step 2: Add the email-mismatch path**

```ts
  test('wrong account (test3) sees email mismatch', async ({ browser }) => {
    expect(shareUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test3.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(shareUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/wrong account/i)).toBeVisible({ timeout: 20000 });
    } finally {
      await ctx.close();
    }
  });
```

- [ ] **Step 3: Add the revoked-invite path (separate folder/invite to avoid disturbing the accepted one)**

Add a second module-scoped name near the top: `const REVOKE_FOLDER = uniqueFolderName('Invite Revoke Folder');` and `let revokeUrl: string | undefined;`. Add the folder to `afterAll` archival. Then append:

```ts
  test('revoked invite shows an error to the recipient', async ({ page }) => {
    await page.goto('/');
    await waitForHomeReady(page);
    await createFolder(page, REVOKE_FOLDER);
    await openShareDialog(page, REVOKE_FOLDER);
    revokeUrl = await generateInvite(page, TEST_ACCOUNTS.recipient.email, 'reader');
    await revokeInvite(page, TEST_ACCOUNTS.recipient.email);
  });

  test('recipient opening a revoked link gets an error', async ({ browser }) => {
    expect(revokeUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test2.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(revokeUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/invite error|no longer valid|invalid or has been revoked/i)).toBeVisible({ timeout: 20000 });
    } finally {
      await ctx.close();
    }
  });
```

Update the import to include `revokeInvite`, and update `afterAll` to also `await archiveFolder(page, REVOKE_FOLDER);`.

- [ ] **Step 4: Run the full suite (tunnel)**

Run: `npm run test:e2e:invite:tunnel`
Expected: auth-setup (3) + all closed-loop tests pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/invite-closed-loop.spec.ts
git commit -m "test: add invite negative paths"
```

---

## Task 8: Reader permission path (capability gating analog)

**Files:**
- Modify: `e2e/invite-closed-loop.spec.ts`

**Interfaces:** same as Task 6.

- [ ] **Step 1: Add a reader-permission acceptance test**

Add `const READER_FOLDER = uniqueFolderName('Invite Reader Folder');` and `let readerUrl: string | undefined;`, include it in `afterAll` archival, then append:

```ts
  test('reader invite grants visible (read) access', async ({ page }) => {
    await page.goto('/');
    await waitForHomeReady(page);
    await createFolder(page, READER_FOLDER);
    await openShareDialog(page, READER_FOLDER);
    readerUrl = await generateInvite(page, TEST_ACCOUNTS.recipient.email, 'reader');
  });

  test('recipient accepts reader invite and sees the folder', async ({ browser }) => {
    expect(readerUrl).toBeTruthy();
    const ctx = await browser.newContext({ storageState: path.join(AUTH_DIR, 'test2.json') });
    const page = await ctx.newPage();
    try {
      await page.goto(readerUrl!);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/reader/i)).toBeVisible({ timeout: 20000 });
      await page.getByRole('button', { name: /accept invite/i }).click();
      await expect(page.getByText(/access granted/i)).toBeVisible({ timeout: 20000 });
      await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
      await waitForHomeReady(page);
      await assertFolderVisible(page, READER_FOLDER);
    } finally {
      await ctx.close();
    }
  });
```

Note: this asserts the reader gains *visible* access (the permission label and folder presence). Read-only *enforcement* in the UI is out of scope unless it already exists; if `ShareDialog`/tree enforce reader read-only, add an assertion that an edit affordance is absent — otherwise leave as-is and note the follow-up.

- [ ] **Step 2: Run the full suite (tunnel)**

Run: `npm run test:e2e:invite:tunnel`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/invite-closed-loop.spec.ts
git commit -m "test: add reader-permission invite path"
```

---

## Task 9: Docs + final verification

**Files:**
- Create: `e2e/INVITE_TESTING.md`
- Modify: `CLAUDE.md` (Testing section — one line pointing to the invite suite + how to run it)

- [ ] **Step 1: Write `e2e/INVITE_TESTING.md`**

Document: what the suite covers, the GreenMail dependency (gpu SMTP 3025 / IMAP 3143), how to run (`npm run test:e2e:invite` on gpu, `npm run test:e2e:invite:tunnel` on laptop), the `hasEmailInfra` self-exclusion, the test accounts, and that invites are copy-link (GreenMail only verifies signup emails).

- [ ] **Step 2: Add a CLAUDE.md pointer**

Under "Testing & Building", add:

```
npm run test:e2e:invite        # Invite closed-loop E2E (needs gpu GreenMail; see e2e/INVITE_TESTING.md)
```

- [ ] **Step 3: Full local verification (non-invite suite must stay green)**

Run: `npm run check`
Expected: type-check + lint + unit tests PASS. (The invite project self-excludes without mail env, so `npm run test:e2e` is unaffected.)

- [ ] **Step 4: Full invite suite green (tunnel)**

Run: `npm run test:e2e:invite:tunnel`
Expected: auth-setup (3) + all closed-loop tests PASS. Capture the output as evidence.

- [ ] **Step 5: Commit**

```bash
git add e2e/INVITE_TESTING.md CLAUDE.md
git commit -m "docs: document invite e2e suite"
```

---

## Self-Review

**Spec coverage:**
- Real closed-loop (two real accounts, real backend, real Jazz, verified access) → Tasks 4–6, 8.
- Copy-link only (no email delivery) → Global Constraints; invite generated via `generateInvite` (Get Link), GreenMail only for signup verification.
- Email/password + IMAP (wickedmap-literal) → Tasks 1, 3, 4.
- Dedicated mailbox via gpu GreenMail (no provider mailbox) → Global Constraints, Task 0 runner.
- Negative paths (unauthenticated, mismatch, revoked) → Task 7. Permission gating → Task 8.
- Reliability (serial, unique names, reload-retry, soft-delete cleanup) → Tasks 2, 3, 6, 7, 8.
- CI gating / self-exclusion → Task 0 (`hasEmailInfra`).
- Risk: `waitForSync` stub → addressed by reload-retry (`waitForHomeReady`) + real peer (no false dependency on `__testServices`).
- Risk: test hooks only on `/test` → addressed by driving the real authenticated UI.

**Placeholder scan:** No TBD/TODO. Selector-verification steps (Task 3 Step 3, Task 6 Step 2) are explicit live-iteration steps inherent to E2E, with concrete fallbacks — not placeholders.

**Type consistency:** Helper names are consistent across tasks: `waitForEmail`, `extractVerificationLink`, `TEST_ACCOUNTS.{organizer,recipient,thirdParty}`, `signUpTestUser`, `verifyTestUserEmail`, `loginTestUser`, `isSignedIn`, `waitForHomeReady`, `createFolder`, `openShareDialog`, `generateInvite`, `revokeInvite`, `assertFolderVisible`, `archiveFolder`, `uniqueFolderName`.
