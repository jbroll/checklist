# CheckList Sharing Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore sharing on the hosted data plane by pointing `mountShareRoutes`' group backend at hosted rowboat, authenticated per acting user.

**Architecture:** `mountShareRoutes` stays in CheckList's backend (invites are identity-, email- and token-bound). Its `GroupBackend` becomes `remoteGroupBackend`, whose `token(actor)` mints a JWT with `sub = actor` via better-auth's server-only `signJWT` — so rowboat's `requireAdmin` checks the real user on every call. An agent principal, installed as admin at invite-create, performs the grant at accept time when the inviter is offline.

**Tech Stack:** Express 5, better-auth 1.5.6 (`jwt` plugin), `@jbroll/rowboat-sharing`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-checklist-sharing-cutover-design.md`

## Global Constraints

- **Two repos.** Task 1 lands in `/home/john/src/rowboat` on `main` (its commit gate runs the full `sci-full-gate`, ~2–3 min). Tasks 2–4 land in `/home/john/src/checklist` on the existing `cutover-cd` branch. **Do not merge `cutover-cd` to `main`** — account-merge and account-deletion group ops are still broken (sub-project F).
- **Task 1 must land AND `npm run build` must run in the rowboat repo before Task 2**, or CheckList's type-check will not see the new `shareUrl` option (`file:`-linked `dist`).
- **Pre-commit hooks run type-check, lint, unit tests and E2E and MUST pass. Never bypass them** (`CLAUDE.md` → Git Commit Rules). Docs-only commits skip them.
- **Config values, exact:** `ROWBOAT_URL` (backend, e.g. `http://localhost:3020` in dev, `https://rowboat.rkroll.com` in prod); `ROWBOAT_AGENT_ID` (backend, default `agent:checklist`). The group-backend base URL is `${ROWBOAT_URL}/db/${ROWBOAT_DATABASE_ID}/api/sync`.
- **Scope is sharing only.** Do not touch `mountAccountRoutes`, `registerAuthTables`, or the local group tables — they are sub-project F.
- **No fallbacks.** A missing config value or a non-ok remote response must throw or return an error status, never silently degrade.
- Comments are sparse in both codebases and explain *why*, never *what*. Match that density.

## File Structure

| File | Responsibility |
|---|---|
| `../rowboat/packages/sharing/src/routes.ts` | + `shareUrl` formatter; agent hidden from the collaborator surface; agent-mode grant errors |
| `../rowboat/packages/sharing/src/__tests__/agent-mode.test.ts` | new — the four Task-1 behaviours |
| `backend/src/index.ts` | + `rowboatUrl`/`rowboatAgentId` config; `mintActorToken`; `mountShareRoutes` wired to `remoteGroupBackend` |
| `backend/src/__tests__/host.test.ts` | + `signJWT` claims and the not-routed assertion |
| `e2e/sharing-closed-loop.spec.ts` | new — two-account invite→accept→shared-folder-visible, no GreenMail |
| `.env.example`, `docs/HOSTED_ROWBOAT.md`, `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md` | env + status docs |

---

### Task 1: rowboat — agent-mode correctness and a subscriber-supplied invite URL

**Files:**
- Modify: `/home/john/src/rowboat/packages/sharing/src/routes.ts`
- Test: `/home/john/src/rowboat/packages/sharing/src/__tests__/agent-mode.test.ts` (create)

**Model:** `sonnet` — four coordinated edits in one file, each with an authorization consequence.

**Interfaces:**
- Produces: `ShareRouteOpts.shareUrl?: (token: string) => string`. When set it replaces the `${shareUrlBase ?? ""}?token=${token}` construction for both the response body and the email. No other signature changes.

**Context:** All four changes are in `mountShareRoutes`. Work in `/home/john/src/rowboat`; it is on `main` and clean. The existing tests in `packages/sharing/src/__tests__/` show the harness style — an in-memory better-sqlite3 db, `registerAuthTables` + `registerShareTables`, a `stubProvider`, and supertest against a bare express app.

- [ ] **Step 1: Write the failing test**

Create `/home/john/src/rowboat/packages/sharing/src/__tests__/agent-mode.test.ts`:

```ts
import { registerAuthTables } from "@jbroll/rowboat-auth";
import { AuthzError } from "@jbroll/rowboat-backend";
import type { IdentityProvider, ResponseLike, Session } from "@jbroll/rowboat-identity-shared";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { type GroupBackend, localGroupBackend } from "../group-backend.js";
import { mountShareRoutes } from "../routes.js";
import { registerShareTables } from "../schema.js";

const AGENT = "agent:test";
const EMAILS: Record<string, string> = {
  alice: "alice@x.com",
  bob: "bob@x.com",
};

function stubProvider(state: { currentUserId: string | null }): IdentityProvider {
  return {
    resolveAuthor: async () => state.currentUserId,
    requireAuth: async (_req, res: ResponseLike): Promise<Session | null> => {
      if (state.currentUserId === null) {
        res.status(401).json({ error: "unauthenticated" });
        return null;
      }
      return { user: { id: state.currentUserId, email: EMAILS[state.currentUserId] } };
    },
    principalOwnsEmail: (accountId, email) =>
      EMAILS[accountId]?.toLowerCase() === email.toLowerCase(),
    lookupDirectory: (accountIds) =>
      accountIds
        .filter((id) => EMAILS[id] !== undefined)
        .map((id) => ({ accountId: id, email: EMAILS[id] })),
  };
}

describe("mountShareRoutes: agent mode + shareUrl formatter", () => {
  let db: Database.Database;
  let app: express.Express;
  let state: { currentUserId: string | null };

  beforeEach(() => {
    db = new Database(":memory:");
    registerAuthTables(db);
    registerShareTables(db);

    db.prepare("INSERT INTO groups (id) VALUES (?)").run("g1");
    db.prepare("INSERT INTO group_members (group_id, account_id, role) VALUES (?, ?, ?)").run(
      "g1",
      "alice",
      "admin",
    );

    state = { currentUserId: null };
    app = express();
    mountShareRoutes(app, db, {
      provider: stubProvider(state),
      groupBackend: localGroupBackend(db),
      agent: AGENT,
      shareUrl: (t) => `https://app.example/invite/${t}`,
    });
  });

  function roleOf(account: string, group: string): string | undefined {
    return (
      db
        .prepare("SELECT role FROM group_members WHERE group_id = ? AND account_id = ?")
        .get(group, account) as { role: string } | undefined
    )?.role;
  }

  it("builds the shareUrl with the supplied formatter", async () => {
    state.currentUserId = "alice";
    const res = await request(app)
      .post("/api/shares/invite")
      .send({ targetGroupId: "g1", recipientEmail: "bob@x.com", role: "writer" });

    expect(res.status).toBe(200);
    expect(res.body.shareUrl).toBe(`https://app.example/invite/${res.body.token}`);
  });

  it("hides the agent from the collaborator list", async () => {
    state.currentUserId = "alice";
    await request(app)
      .post("/api/shares/invite")
      .send({ targetGroupId: "g1", recipientEmail: "bob@x.com", role: "writer" });

    const res = await request(app).get("/api/shares/targets/g1/collaborators");
    expect(res.status).toBe(200);
    const ids = (res.body.collaborators as { accountId: string }[]).map((c) => c.accountId);
    expect(ids).toContain("alice");
    expect(ids).not.toContain(AGENT);
  });

  it("refuses to remove the agent as a collaborator", async () => {
    state.currentUserId = "alice";
    await request(app)
      .post("/api/shares/invite")
      .send({ targetGroupId: "g1", recipientEmail: "bob@x.com", role: "writer" });

    const res = await request(app).delete(
      `/api/shares/targets/g1/collaborators/${encodeURIComponent(AGENT)}`,
    );
    expect(res.status).toBe(400);
    // Still admin — a "successful" removal would break every pending invite on g1.
    expect(roleOf(AGENT, "g1")).toBe("admin");
  });

  it("does not blame the inviter when an agent-mode grant is refused", async () => {
    state.currentUserId = "alice";
    const invite = await request(app)
      .post("/api/shares/invite")
      .send({ targetGroupId: "g1", recipientEmail: "bob@x.com", role: "writer" });
    expect(invite.status).toBe(200);

    // Strip the agent's admin behind the route's back, so the accept-time grant is refused.
    db.prepare("DELETE FROM group_members WHERE group_id = ? AND account_id = ?").run("g1", AGENT);

    state.currentUserId = "bob";
    const accept = await request(app)
      .post("/api/shares/accept")
      .send({ token: invite.body.token });

    expect(accept.status).toBe(403);
    expect(accept.body.error).not.toBe("inviter_no_longer_admin");
  });

  it("turns a refused agent install into a 403, not an unhandled rejection", async () => {
    // The route's own admin check reads effectiveRole, so a backend that reports admin but refuses
    // the grant is the only way to reach the install's failure path — i.e. the real race, where the
    // inviter loses admin between the check and the install.
    const refusingBackend: GroupBackend = {
      ...localGroupBackend(db),
      grant: () => {
        throw new AuthzError("refused");
      },
    };
    const refusingApp = express();
    mountShareRoutes(refusingApp, db, {
      provider: stubProvider(state),
      groupBackend: refusingBackend,
      agent: AGENT,
    });

    state.currentUserId = "alice";
    const res = await request(refusingApp)
      .post("/api/shares/invite")
      .send({ targetGroupId: "g1", recipientEmail: "bob@x.com", role: "writer" });

    expect(res.status).toBe(403);
    // The invite must not be persisted when its agent install failed — accepting it later would
    // grant as an agent that holds nothing.
    expect(db.prepare("SELECT COUNT(*) AS n FROM share_invites").get()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /home/john/src/rowboat && npx vitest run packages/sharing/src/__tests__/agent-mode.test.ts
```
Expected: FAIL. The first case fails on `shareUrl` not existing in `ShareRouteOpts` (a type error) — the whole file fails to type-check, which is the correct red state.

- [ ] **Step 3: Add the `shareUrl` option**

In `packages/sharing/src/routes.ts`, add to `ShareRouteOpts` (after `shareUrlBase`):

```ts
  // Builds the invite URL the recipient receives. Subscribers own their own routing (CheckList's
  // is /invite/:token), and the emailed link is built here, so no client-side change can fix it.
  shareUrl?: (token: string) => string;
```

and replace line 141:

```ts
    const shareUrl = opts.shareUrl
      ? opts.shareUrl(token)
      : `${opts.shareUrlBase ?? ""}?token=${token}`;
```

- [ ] **Step 4: Make the agent install fail cleanly**

Replace the agent-install block (currently lines 118-120):

```ts
    // Agent-mediated mode: install the agent as admin on the target group now, while the
    // inviter's own admin role authorizes it. The accept step later grants AS the agent, so it
    // must already hold admin on this group by the time any invite against it is accepted.
    if (opts.agent !== undefined) {
      try {
        await backend.grant(s.user.id, body.targetGroupId, opts.agent, TOP(roles));
      } catch (err) {
        // The admin check above already passed, so an AuthzError here is a lost race (or a remote
        // backend disagreeing) — a 403 the caller can act on, not an unhandled rejection.
        if (err instanceof AuthzError) {
          res.status(403).json({ error: `requires ${TOP(roles)} on ${body.targetGroupId}` });
          return;
        }
        throw err;
      }
    }
```

- [ ] **Step 5: Stop blaming the inviter in agent mode**

Replace the accept-time `AuthzError` branch (currently line 211):

```ts
        if (err instanceof AuthzError) {
          // In agent mode the grant is the AGENT's, so the inviter's current admin is irrelevant —
          // reporting it would misdescribe the failure.
          res
            .status(403)
            .json({ error: opts.agent === undefined ? "inviter_no_longer_admin" : "grant_refused" });
          return;
        }
```

- [ ] **Step 6: Hide the agent from the collaborator surface**

In `GET ${base}/targets/:groupId/collaborators`, replace the `listMembers` call:

```ts
    // The agent is an implementation detail of the invite dance, not a person: it holds admin on
    // every shared group and has no directory entry to render.
    const members = (await backend.listMembers(s.user.id, groupId)).filter(
      (m) => m.account_id !== opts.agent,
    );
```

In `DELETE ${base}/targets/:groupId/collaborators/:accountId`, add after the `accountId === s.user.id` check:

```ts
      if (accountId === opts.agent) {
        res.status(400).json({ error: "cannot remove the sharing agent" });
        return;
      }
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
cd /home/john/src/rowboat && npx vitest run packages/sharing/src/__tests__/agent-mode.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 8: Run the sharing package's whole suite**

Run:
```bash
cd /home/john/src/rowboat && npx vitest run packages/sharing
```
Expected: PASS. `invite-accept.test.ts:246` still expects `inviter_no_longer_admin` — it runs without `agent`, so that branch is unchanged.

- [ ] **Step 9: Commit**

```bash
cd /home/john/src/rowboat
git add packages/sharing/src/routes.ts packages/sharing/src/__tests__/agent-mode.test.ts
git commit -m "feat(sharing): subscriber-supplied invite URLs; contain the agent in agent mode

shareUrl lets the subscriber build the link its own router understands — the
emailed link is built here, so no client-side change can reach it.

The agent is now hidden from the collaborator list and cannot be removed
through it: it holds admin on every shared group, has no directory entry, and
'removing' it would silently break every pending invite on that group. A
refused agent install is a 403 rather than an unhandled rejection, and an
agent-mode grant refusal no longer blames the inviter, whose admin is not what
authorized it."
```

- [ ] **Step 10: Rebuild the linked dist**

Run:
```bash
cd /home/john/src/rowboat && npm run build
```
Expected: success. CheckList consumes `dist` over a `file:` link, so Task 2 cannot type-check without this.

---

### Task 2: CheckList backend — point sharing at hosted rowboat

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/__tests__/host.test.ts`

**Model:** `sonnet` — config, a new minting helper, and a rewiring, with a security assertion that must be written carefully.

**Interfaces:**
- Consumes: `ShareRouteOpts.shareUrl` from Task 1; `remoteGroupBackend({ baseUrl, token })` from `@jbroll/rowboat-sharing`; `identity.auth` from `createIdentity`.
- Produces: `ServerConfig` gains `rowboatUrl: string` and `rowboatAgentId: string`. No route signatures change.

**Context:** `createIdentity` returns `{ provider, auth, registerIdentityTables, mountAuthRoutes }` (`auth-betterauth/src/index.ts:39-47`), so `identity.auth.api.signJWT` is reachable. `signJWT` takes `{ body: { payload } }`, honors `payload.sub`, and fills `iss`/`aud`/`exp` from the `jwt` plugin options already configured at `backend/src/index.ts:111-115` — the same claims the browser's token carries.

`remoteGroupBackend`'s `baseUrl` is the sync base, not a separate API: its endpoints are `<base>/groups/:id/{role,members}`, `<base>/groups/:id/members/:account` and `<base>/memberships`, all served by rowboat at `rowboat-service/src/server-buildapp.mjs:102,128,148,164,188`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/host.test.ts`, add `rowboatUrl` and `rowboatAgentId` to `testConfig()`'s returned object, immediately after `rowboatDatabaseId: DATABASE_ID,`:

```ts
    rowboatUrl: 'http://rowboat.test',
    rowboatAgentId: 'agent:test',
```

Then add this block at the end of the file:

```ts
// The sharing group backend authenticates to rowboat as the ACTING USER, so the backend must be
// able to mint a token for an arbitrary subject. That capability is only safe because better-auth's
// signJWT is server-only: an HTTP route reaching it would let anyone impersonate anyone on the data
// plane. Both halves are asserted here.
describe('actor-token minting for the sharing group backend', () => {
  it('mints a token for an arbitrary subject with the registered iss/aud', async () => {
    server = await createServer(testConfig());

    const { token } = await server.auth.api.signJWT({
      body: { payload: { sub: 'agent:test' } },
    });

    const claims = claimsOf(token);
    expect(claims.sub).toBe('agent:test');
    expect(claims.iss).toBe('http://localhost:5173/api/auth');
    expect(claims.aud).toBe(DATABASE_ID);
  });

  it('exposes no HTTP route that mints for a caller-supplied subject', async () => {
    server = await createServer(testConfig());
    const u = await signUpAndSignIn(server.app, 'impersonator@x.com', 'correct-horse-battery');

    for (const path of ['/api/auth/sign-jwt', '/api/auth/signJWT', '/api/auth/jwt/sign']) {
      const res = await u.agent.post(path).send({ payload: { sub: 'victim' } });
      expect(res.status).toBe(404);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd /home/john/src/checklist/backend && npx vitest run src/__tests__/host.test.ts
```
Expected: FAIL — `rowboatUrl`/`rowboatAgentId` are not on `ServerConfig` (type error), and `server.auth` does not exist.

- [ ] **Step 3: Add the config fields**

In `backend/src/index.ts`, add to `ServerConfig` after `rowboatDatabaseId`:

```ts
  /** Origin of the hosted rowboat that serves this tenant's data plane and group API. */
  rowboatUrl: string;
  /** The standing principal that performs invite grants when the inviter is offline. */
  rowboatAgentId: string;
```

In `configFromEnv`, after the `rowboatDatabaseId` check (currently lines 195-198):

```ts
  const rowboatUrl = process.env.ROWBOAT_URL;
  if (!rowboatUrl) {
    throw new Error('ROWBOAT_URL is required (the hosted rowboat origin, e.g. http://localhost:3020)');
  }
```

and in the returned object, after `rowboatDatabaseId,`:

```ts
    rowboatUrl,
    // A colon cannot occur in a better-auth user id, so this can never collide with a real account.
    rowboatAgentId: process.env.ROWBOAT_AGENT_ID || 'agent:checklist',
```

- [ ] **Step 4: Expose the auth instance on the server handle**

In `backend/src/index.ts`, add to `RowboatServer`:

```ts
  auth: Identity['auth'];
```

Import the type by extending the existing `@jbroll/rowboat-auth-betterauth` import to include `type Identity`, and add `auth: identity.auth,` to the object `createServer` returns, immediately after `app,`.

- [ ] **Step 5: Run the tests to verify the minting case passes**

Run:
```bash
cd /home/john/src/checklist/backend && npx vitest run src/__tests__/host.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 6: Wire the remote group backend**

In `backend/src/index.ts`, extend the `@jbroll/rowboat-sharing` import:

```ts
import { mountShareRoutes, registerShareTables, remoteGroupBackend } from '@jbroll/rowboat-sharing';
```

Replace the `mountShareRoutes` call (currently line 143):

```ts
  // Sharing's group reads/writes go to hosted rowboat, authenticated AS THE ACTING USER — so
  // rowboat's own requireAdmin decides every grant, exactly as it does for the browser. The agent
  // is just another actor: invite-create installs it as admin (authorized by the inviter's real
  // admin), and accept grants as the agent because the inviter may be long gone by then.
  const groupBackend = remoteGroupBackend({
    baseUrl: `${config.rowboatUrl}/db/${config.rowboatDatabaseId}/api/sync`,
    token: async (actor) =>
      (await identity.auth.api.signJWT({ body: { payload: { sub: actor } } })).token,
  });
  mountShareRoutes(app, db, {
    provider,
    sendEmail,
    groupBackend,
    agent: config.rowboatAgentId,
    shareUrl: (token) => `${config.frontendUrl}/invite/${token}`,
  });
```

- [ ] **Step 7: Run the backend suite**

Run:
```bash
cd /home/john/src/checklist/backend && npx vitest run
```
Expected: PASS, all files.

- [ ] **Step 8: Type-check**

Run:
```bash
cd /home/john/src/checklist && npm run type-check
```
Expected: clean.

- [ ] **Step 9: Give dev and E2E the new variable**

In `scripts/dev-rowboat.sh`, add `ROWBOAT_URL` to the generated env file — change the `cat > "$env_file"` heredoc body to:

```
VITE_ROWBOAT_SYNC_BASE=http://localhost:${ROUTER_PORT}/db/${database_id}/api/sync
ROWBOAT_DATABASE_ID=${database_id}
ROWBOAT_URL=http://localhost:${ROUTER_PORT}
```

`scripts/with-tenant-env.sh` sources that file for both dev processes and Playwright's `webServer` runs `npm run dev`, so no further wiring is needed.

- [ ] **Step 10: Commit**

```bash
cd /home/john/src/checklist
git add backend/src/index.ts backend/src/__tests__/host.test.ts scripts/dev-rowboat.sh
git commit -m "feat(sharing)!: point the share routes at hosted rowboat's group API

mountShareRoutes keeps the invites (identity, email, tokens, SMTP) and moves
its group reads/writes to remoteGroupBackend, authenticated per acting user with
a JWT minted through better-auth's server-only signJWT. Invite links are now
built from the subscriber's own frontend origin.

New required env: ROWBOAT_URL. ROWBOAT_AGENT_ID defaults to agent:checklist."
```

---

### Task 3: E2E — the two-account closed loop, without email infrastructure

**Files:**
- Create: `e2e/sharing-closed-loop.spec.ts`

**Model:** `sonnet` — Playwright multi-context orchestration built from existing helpers.

**Interfaces:**
- Consumes: `signUpAndSignIn`, `uniqueAuthedEmail` (`e2e/helpers/rowboat-auth.ts`); `createFolder`, `openShareDialog` (`e2e/helpers/invite-helper.ts`); `uniqueFolderName` (`e2e/helpers/folder-name.ts`).
- Produces: nothing other tasks consume.

**Context:** The existing invite closed-loop needs GreenMail and self-excludes from the default gate (`playwright.config.ts:32`), so the cutover would otherwise ship unproven by CI. ShareDialog's "Copy link" button creates an invite with `sendEmail: false` and renders the URL in a readonly input (`ShareDialog.tsx:196,219`), which makes an email-free closed loop possible. `AuthGate.tsx:55` stashes the pending token and returns to `/invite/<token>` after sign-in, so B can open the link before having an account.

The recipient must own the invited address: `principalOwnsEmail` gates accept (`sharing/src/routes.ts:187`). Generate B's address first and invite exactly that.

- [ ] **Step 1: Write the spec**

Create `e2e/sharing-closed-loop.spec.ts`:

```ts
/**
 * Sharing closed loop on the hosted data plane, with no mail infrastructure: A invites B by
 * address and hands over the copy-link, B signs up as that address and accepts, and B's own
 * synced tree then shows A's folder. That last assertion is the point — it can only pass if the
 * grant reached hosted rowboat's RBAC and widened B's read scope, which is the whole of
 * sub-project E. The GreenMail `invite` project still covers the email delivery path.
 */
import { type Browser, expect, test } from '@playwright/test';
import { uniqueFolderName } from './helpers/folder-name';
import { createFolder, openShareDialog } from './helpers/invite-helper';
import { signUpAndSignIn, uniqueAuthedEmail } from './helpers/rowboat-auth';

const PASSWORD = 'Checklist-Sharing-Test-2026!';
const A_EMAIL = uniqueAuthedEmail('share-a');
const B_EMAIL = uniqueAuthedEmail('share-b');
const FOLDER = uniqueFolderName('Shared Folder');

test.setTimeout(180_000);

async function freshPage(browser: Browser) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return { ctx, page };
}

test('an invited user accepts and sees the shared folder', async ({ browser }) => {
  let shareUrl: string;

  // --- A: create a folder and an invite for B's address.
  {
    const { ctx, page } = await freshPage(browser);
    try {
      await signUpAndSignIn(page, { email: A_EMAIL, password: PASSWORD, name: 'Share Owner' });
      await createFolder(page, FOLDER);
      await openShareDialog(page, FOLDER);

      const dialog = page.getByRole('dialog');
      await dialog.locator('input[type="email"]').fill(B_EMAIL);
      await page.getByLabel('Permission').selectOption('writer');
      await page.getByRole('button', { name: 'Copy link' }).click();

      const linkInput = page.locator('input[value*="/invite/"]');
      await expect(linkInput).toBeVisible({ timeout: 20000 });
      shareUrl = await linkInput.inputValue();
      expect(shareUrl).toContain('/invite/');

      // The agent holds admin on this group but must never surface as a collaborator.
      await expect(dialog.getByText(/agent:/i)).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  }

  // --- B: sign up as the invited address, accept, and see the folder.
  {
    const { ctx, page } = await freshPage(browser);
    try {
      await signUpAndSignIn(page, { email: B_EMAIL, password: PASSWORD, name: 'Share Recipient' });
      await expect(page.getByText(FOLDER)).toHaveCount(0);

      await page.goto(new URL(shareUrl).pathname);
      await page.locator('button:has-text("Accept Invite")').click();

      await expect(page.getByText(FOLDER).first()).toBeVisible({ timeout: 30000 });
    } finally {
      await ctx.close();
    }
  }
});
```

- [ ] **Step 2: Run it**

Run:
```bash
cd /home/john/src/checklist && npx playwright test e2e/sharing-closed-loop.spec.ts
```
Expected: PASS. If B lands on the folder tree without the shared folder, check the backend log for a 5xx from `/api/shares/accept` — a remote grant failure surfaces there, never as a client-side fallback.

- [ ] **Step 3: Run the whole default gate**

Run:
```bash
cd /home/john/src/checklist && npm run test:e2e
```
Expected: PASS, 95 tests (94 + this one).

- [ ] **Step 4: Commit**

```bash
cd /home/john/src/checklist
git add e2e/sharing-closed-loop.spec.ts
git commit -m "test(e2e): prove the sharing closed loop without mail infrastructure

A invites B by address, B accepts through the copy-link and then sees A's folder
in their own synced tree — which can only happen if the grant reached hosted
rowboat's RBAC. The GreenMail invite project still covers email delivery, but it
self-excludes from the default gate, so the cutover would otherwise ship unproven."
```

---

### Task 4: Environment and status documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/HOSTED_ROWBOAT.md`
- Modify: `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md`

**Model:** `haiku` — the exact prose is supplied below.

**Interfaces:** none.

**Context:** Docs-only, so the commit skips the hooks. The backend's runtime environment comes from the gitignored `backend/secrets.env`, so `ROWBOAT_URL` is an operator step for production, recorded here rather than committed.

- [ ] **Step 1: Document the new variables**

In `.env.example`, replace the `ROWBOAT_DATABASE_ID=db_xxx` line with:

```env
ROWBOAT_DATABASE_ID=db_xxx
# Backend-only: the hosted rowboat origin. The sharing routes call its group API as the acting
# user. Dev derives it in .env.tenant.local; production reads it from backend/secrets.env.
ROWBOAT_URL=https://rowboat.rkroll.com
# The standing principal that grants invites when the inviter is offline. Defaults to
# agent:checklist; set it only to change the id, which would strand grants on already-shared groups.
ROWBOAT_AGENT_ID=agent:checklist
```

- [ ] **Step 2: Record the sub-project in `docs/HOSTED_ROWBOAT.md`**

Insert immediately before the `## Non-goals` heading:

```markdown
### Sub-project E — sharing cutover (landed)

`mountShareRoutes` still runs in CheckList's backend — invites are identity-, email- and
token-bound, which rowboat deliberately knows nothing about — but its `GroupBackend` is now
`remoteGroupBackend` against `<rowboatUrl>/db/<databaseId>/api/sync`. Each call authenticates as the
**acting user**, via a JWT minted with better-auth's server-only `signJWT`, so rowboat's own
`requireAdmin` decides every grant. Granting everything as the agent would have made the caller
always-admin and rowboat's checks vacuous.

The agent (`ROWBOAT_AGENT_ID`, default `agent:checklist`) is installed as admin at invite-create,
authorized by the inviter's real admin, and performs the accept-time grant when the inviter is long
gone. It is **a standing admin on every shared group, and that is accepted**: whoever holds
CheckList's signing key is already able to mint any user's data-plane token, so the agent adds
little marginal exposure. It has no better-auth user row, never syncs, and is filtered out of the
collaborator list and protected from removal — an owner "removing" it would silently break every
pending invite on that group.

Invite links are built from the subscriber's own frontend origin (`shareUrl` on `ShareRouteOpts`),
never rowboat's.

**Still broken until sub-project F:** account-merge's group link and account-deletion's group
cleanup, both of which still drive the empty local group tables. `registerAuthTables` and those
tables stay wired for them, so `cutover-cd` cannot merge to `main` yet.
```

- [ ] **Step 3: Mark E landed in the parent design**

In `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md`, change the `### E — Sharing cutover (Phase C's deferred client half)` heading to:

```markdown
### E — Sharing cutover (Phase C's deferred client half) — LANDED
```

and append to that section's final paragraph:

```markdown
**Landed 2026-07-22.** Dropping the local group management moved to sub-project F, which also owns
account-merge and account-deletion; agent-credential rotation was resolved as *not needed* (the
agent is a standing admin by design — see `docs/HOSTED_ROWBOAT.md`).
```

- [ ] **Step 4: Commit**

```bash
cd /home/john/src/checklist
git add .env.example docs/HOSTED_ROWBOAT.md docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md
git commit -m "docs: record the sharing cutover and its new backend env

ROWBOAT_URL is required by the backend from now on; ROWBOAT_AGENT_ID is
optional. Both are operator steps for production (backend/secrets.env)."
```
