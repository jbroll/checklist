# CheckList sharing cutover — design (sub-project E of the hosted-rowboat cutover)

**Date:** 2026-07-22
**Status:** design (approved 2026-07-22; plan follows)
**Depends on:** sub-projects A–D, all landed. C+D are on branch `cutover-cd` (`6524ae7`…`987bd12`),
held off `main`. Engine phases A/B/C landed on rowboat `main`.
**Design/decomposition parent:** `docs/2026-07-18-checklist-hosted-rowboat-cutover-design.md` → "E".

## Goal

Restore sharing on top of the hosted data plane. `mountShareRoutes` still runs in CheckList's
backend — invites are identity-, email- and token-bound, which rowboat deliberately knows nothing
about — but its group reads and writes move from the now-empty local tables to hosted rowboat over
HTTP, authenticated per acting user.

Sharing broke by design in D: `mountShareRoutes` defaults to `localGroupBackend(db, …)`
(`sharing/src/routes.ts:53`), and D emptied those tables by moving every real group to rowboat.

## Verified starting facts

Established by reading the current code, not assumed:

| Fact | Evidence |
|---|---|
| `remoteGroupBackend` already implements the whole `GroupBackend` interface against `<base>/groups/*` and `<base>/memberships`, authenticating each call as `Bearer token(actor)` | `sharing/src/remote-group-backend.ts:26-86` |
| rowboat serves all five endpoints it calls, on the same `/db/<id>/api/sync` base the browser syncs to | `rowboat-service/src/server-buildapp.mjs:102,128,148,164,188` |
| The agent dance is already implemented in `routes.ts`: invite-create installs the agent as admin, accept grants as the agent | `sharing/src/routes.ts:118-120,203-208` |
| The whole chain has a passing capstone test against the real assembled server — `mountShareRoutes` + `remoteGroupBackend` + real RBAC + real pull visibility | `integration/src/sharing-agent-e2e.test.ts` |
| better-auth's `signJWT` endpoint is created **without a path**, so it is never routed over HTTP — only `auth.api.signJWT(…)` reaches it | `better-auth/dist/plugins/jwt/index.mjs:146` vs `getJwks` at `:31`; `@better-auth/core/dist/api/index.mjs:18-29` (`path` undefined → `createEndpoint` without a route) |
| `signJWT` honors `payload.sub` and defaults `iss`/`aud` from the plugin options CheckList already registered | `better-auth/dist/plugins/jwt/sign.mjs` (`setSubject`, `defaultIss`, `defaultAud`) |
| `createIdentity` exposes the built better-auth instance as `identity.auth` | `auth-betterauth/src/index.ts:39-47` |
| The client's invite route is `/invite/:token`, but `routes.ts` builds `${shareUrlBase ?? ""}?token=${token}` — and CheckList sets no `shareUrlBase`, so today's link is the bare string `?token=<tok>` | `App.tsx:161`; `sharing/src/routes.ts:141`; `backend/src/index.ts:143` |
| ShareDialog renders that value both as the copy-link input and as the emailed link's source | `ShareDialog.tsx:219`; `sharing/src/routes.ts:152` |
| ShareDialog can create an invite **without** sending email ("Copy link", `sendEmail: false`) | `ShareDialog.tsx:196,204` |

The capstone test is the template for this work. It fakes exactly one thing — identity, via
`token: (actor) => actor` against a server that accepts the raw actor string — and that fake is
precisely CheckList's half of the job.

## Decisions

1. **Scope is sharing only.** Account-merge's group link and account-deletion's group cleanup stay
   broken on the empty local tables, as sub-project F. `registerAuthTables` and the local group
   tables stay wired for them, so `cutover-cd` still cannot merge to `main` after E.
2. **Mint per acting user.** `token(actor)` mints a JWT with `sub = actor`, so rowboat's
   `requireAdmin` checks the real user on every call. Granting everything as the agent would make
   the caller always-admin, leaving rowboat's checks vacuous and the backend the sole authority —
   which is the arrangement C+D existed to end. It also has no answer for `listMemberships(user)`.
3. **The invite URL comes from the subscriber's own site.** rowboat gains an optional formatter;
   CheckList points it at its frontend origin. Nothing in the sharing path emits rowboat's origin.
4. **The agent stays a standing admin** on every group it is installed on. Uninstalling it when a
   group's last invite resolves would shrink the blast radius, but needs a revoke-as-agent path plus
   hooks on accept, revoke and the opportunistic expiry sweep — and the sweep only runs when some
   later accept touches it, so stragglers keep the agent regardless. The residual risk is that
   whoever holds CheckList's signing key is admin on every shared group; that key already mints any
   user's data-plane token, so the agent adds little marginal exposure. Recorded as accepted in
   `docs/HOSTED_ROWBOAT.md`.

## Architecture

### Agent principal

A constant from config (`ROWBOAT_AGENT_ID`, default `agent:checklist`). It has no better-auth user
row: rowboat is identity-free and takes the token's `sub` verbatim. The colon makes collision with a
better-auth user id impossible. The agent never syncs, so it never gets a root group, and
`principalOwnsEmail` / `lookupDirectory` never resolve it.

### Token minting

```ts
const mintActorToken = async (actor: string): Promise<string> =>
  (await identity.auth.api.signJWT({ body: { payload: { sub: actor } } })).token;
```

`iss`/`aud`/`expirationTime` come from the same `jwt` plugin options Task 4 registered, so these
tokens are indistinguishable to rowboat from the ones the browser carries. No cache: group calls
happen only on sharing operations (opening ShareDialog costs two), and a cache would have to track
per-actor expiry to save a local signature.

That `signJWT` is unroutable is load-bearing — an HTTP route minting for an arbitrary `sub` would
let anyone impersonate anyone on the data plane. It gets a test, not a comment.

### Backend wiring

```ts
const groupBackend = remoteGroupBackend({
  baseUrl: `${config.rowboatUrl}/db/${config.rowboatDatabaseId}/api/sync`,
  token: mintActorToken,
});
mountShareRoutes(app, db, {
  provider, sendEmail, groupBackend,
  agent: config.rowboatAgentId,
  shareUrl: (t) => `${config.frontendUrl}/invite/${t}`,
});
```

`ROWBOAT_URL` is new (the backend so far knows only `ROWBOAT_DATABASE_ID`); composing it with the
existing database id yields the identical base the browser uses.

### rowboat-side changes

One commit, landed before the CheckList side:

- **`shareUrl?: (token: string) => string`** on `ShareRouteOpts`, defaulting to today's
  `${shareUrlBase ?? ""}?token=${token}`. No existing consumer changes.
- **Hide the agent from the collaborator surface.** Filter `opts.agent` out of
  `GET /targets/:groupId/collaborators`, and reject `DELETE …/collaborators/<agent>`. Without this
  the UI lists a nameless admin collaborator that an owner can "remove", silently breaking every
  pending invite on that folder.
- **Wrap the agent-install grant** (`routes.ts:119`) so a TOCTOU or network throw is a clean 403
  rather than a 500.
- **Stop returning `inviter_no_longer_admin` in agent mode** (`routes.ts:211`). In that mode the
  grant is the agent's and the inviter's admin is irrelevant, so the string misreports the failure.

## Error handling

`remoteGroupBackend` already maps a remote 403 to `AuthzError` and everything else to a plain
`Error` (`remote-group-backend.ts:13-21`), and `routes.ts` branches on `AuthzError` for 403 vs 500.
Rowboat being unreachable therefore surfaces as a 500 on the sharing route — correct: sharing has no
degraded mode, and a fallback would hand out access the server never authorized.

## Testing

- **Backend unit.** `mintActorToken` yields the registered `sub`/`iss`/`aud`; and — the load-bearing
  one — no HTTP route under `/api/auth` mints a token for a caller-supplied `sub`.
- **rowboat unit.** Formatter default vs override; the agent filtered from collaborators; revoking
  the agent rejected; agent-install failure → 403.
- **E2E, default gate, no GreenMail.** Two-account closed loop: A creates a folder, invites B's
  address via "Copy link", B signs up with that address, opens `/invite/<token>`, accepts, and then
  sees and syncs the shared folder. The last step is the assertion; the rest is setup. Existing
  helpers cover the signups (`e2e/helpers/rowboat-auth.ts`) and folder creation
  (`e2e/helpers/invite-helper.ts`); `generateInvite`'s `input[value*="/invite/"]` expectation starts
  passing once the formatter is wired.
- The GreenMail `invite` project stays as the email-delivery proof.

## Risks

| Risk | Mitigation |
|---|---|
| `signJWT` reachable over HTTP would let anyone impersonate anyone | Explicit backend test asserting it is not routed |
| `ROWBOAT_URL` unset in production → sharing 500s on first use | Documented in `.env.example`; belongs in the gitignored `backend/secrets.env` |
| An orphaned agent membership survives folder deletion | Groups outlive folders already (D); no new failure mode |

## Non-goals

- Account-merge and account-deletion group operations (sub-project F).
- Removing `registerAuthTables` or the local group tables.
- Revocation propagation to clients that already pulled — pull is cursor-based and does not
  retroactively tombstone (documented in the capstone test at `sharing-agent-e2e.test.ts:257-262`).
- Invite email copy, which still names the raw group id rather than the folder.
