# SDD ledger — checklist-hosted-rowboat Phase C (sharing / agent-mediated group management)

Plan: /home/john/src/checklist/docs/2026-07-18-checklist-hosted-rowboat-phase-c-sharing.md
Worktree: /home/john/src/rowboat-phase-c (branch phase-c-sharing, off rowboat main 4a87dc4)
Baseline (4a87dc4): auth 35, backend 603, rowboat-service 7, sharing 31, server 72, integration 230 — all green.
Design: agent-as-standing-admin (RBAC-pure, no mgmt-key bypass). Sharing orchestration stays in subscriber backend; rowboat = group primitives. Extra review scrutiny: Task 1 (writer core), Task 4 (security-relevant sharing routes), Task 6 (RBAC-purity proof).

BASE=4a87dc4

Task 1: complete (commit 7f0c8ce; rowboat-service 10/10, backend 603/603, gate green). grant/revoke GroupOp variants + applyGroupOp branches, {tables: GROUP_TABLES}, actor-authorized (rowboat-auth requireAdmin → AuthzError caught → {ok:false}). Writer core invariants untouched.
BASE=7f0c8ce
  REVIEW clean spec+quality (Approved). requireAdmin enforced transitively; GROUP_TABLES everywhere; inside try/catch (never escapes); writer core + backend/auth boundary untouched; tests exercise admin-success + non-admin-fail on __group*. MINOR: non-admin test asserts any-string not "requires admin" substring; no revoke-by-non-admin test (same gate).

Task 2: complete (commit 7e4ae84; rowboat-service 10/10, backend 603/603, gate green). 4 group-mgmt endpoints under ${basePath} (router-proxied), behind appData.rbac, JWT-gated: POST members (grant), DELETE members (revoke) via forwardGroupWrite (actor=author); GET role, GET members (reads via reg.stateFor + effectiveRole/__group_members, member-gated). No isolated test (worker thread) — Task 6 e2e. (await-no-effect hints = harmless sync resolveAuthor, as mint route.)
BASE=7e4ae84
  REVIEW clean spec+quality (Approved). actor=author (never client-supplied); all 4 JWT-gated; member-list gated on effectiveRole!==null BEFORE the query (no leak). MINOR: read catch blocks return err.message in 500 body (mild info-disclosure on unexpected errors — tighten to generic + server log); DELETE lacks redundant express.json (global covers); no groupId format check (pre-existing pattern).
BASE=7e4ae84

Task 3: complete (commit fb04417; rowboat-service 10/10, backend 603/603, integration 230/230, gate green). Mint requires effectiveRole(author,parentGroup)==="admin" on non-root parentGroup (parentGroup && !=author) → else 403; unset/self-parent unchanged. TOCTOU documented inline.
  CORRECT deviation: flipped Phase-B rbac-worker-e2e.test.ts assertion #4 from 200→403 (that test documented THIS gap as current behavior; Phase C closes it). Task 6 adds a new file → no conflict.
BASE=fb04417
  REVIEW Approved, no issues. Check precise (parentGroup && !=author → effectiveRole==="admin" else 403, forwards nothing on reject); normal/self-parent unchanged; TOCTOU documented (link still requires child-admin). rbac-worker-e2e flip correct + strictly stronger (mint rejected + isolation kept, no other assertion loosened).
BASE=fb04417

Task 4: complete (commit b7634f3; sharing 35/35 (31+4), type-check+build clean, gate green). GroupBackend interface + localGroupBackend (identifier-validated tables); every group op in routes.ts routed through backend.*; ShareRouteOpts += groupBackend/agent/tables; default = localGroupBackend(db,{tables,roles}) = byte-for-byte today. Agent dance behind opts.agent: invite-create installs agent admin (actor=inviter), accept grants as agent.
  CONCERN(→review/final): GET /user/memberships still queries literal group_members (account-fan-out; no GroupBackend method) → won't work under custom tables / remote. Deferrable if CheckList doesn't use it; else needs a listMemberships method + endpoint.
BASE=b7634f3
  REVIEW (opus) Approved. Default byte-for-byte unchanged; agent dance RBAC-pure; EVERY auth gate awaited (no unawaited-Promise hole); agent install by inviter (not self); accept-as-agent correct; table interpolation validated.
  IMPORTANT (fixing, not deferring): GET /user/memberships bypasses backend (account-fan-out, no interface method) → wrong under __group*/remote. FIX: add listMemberships(account) to GroupBackend+localGroupBackend+route the endpoint (Task 4 fix); Task 5 expanded to add remote listMemberships + a rowboat GET ${basePath}/memberships endpoint.
  FIX: commit ac85af8 — /user/memberships routes through backend.listMemberships; NO raw group_members SELECT remains in routes.ts (abstraction complete). sharing 36/36. Task 4 fully complete.
  (Task-4 gate: 1st attempt hit unrelated metering-e2e flake in packages/server, passed on retry — known flake, not Phase C.)
BASE=ac85af8
NOTE for Task 5: GroupBackend.listMembers(group) lacks an actor, but the rowboat member-list endpoint gates on the caller's JWT → Task 5 refines it to listMembers(actor, group) (+ local ignores actor, routes.ts collaborators-list passes the requesting member) + adds rowboat GET ${basePath}/memberships endpoint + remoteGroupBackend (all 5 methods).

Task 5: complete (commit ba9d5e0; sharing 43/43 (36+7), rowboat-service 10/10, gate green). remoteGroupBackend (all 5 methods, Bearer token(actor) per call); listMembers refined to listMembers(actor,group) + call site + local (actor unused, comment); rowboat GET ${basePath}/memberships endpoint (author fan-out).
  CONCERN(→review): remote 403 from grant/revoke → plain Error, not AuthzError → routes.ts catch (special-cases AuthzError→403) wouldn't map cleanly for remote. Assess whether remoteGroupBackend should throw AuthzError on 403 for uniform local/remote route handling.
BASE=ba9d5e0
  REVIEW: core correct/well-tested/spec-compliant (right actor-token per method, listMembers refinement + call site, memberships endpoint mirrors Task 2). NEEDS FIX (Important): remote 403 → plain Error breaks routes.ts AuthzError special-case (accept "inviter_no_longer_admin" would 500 not 403) → local/remote not interchangeable behind GroupBackend. FIX: remoteGroupBackend throws AuthzError (from @jbroll/rowboat-backend, already a dep) on 403; other non-2xx stay Error.
  FIX: commit c50040e — remoteGroupBackend throws AuthzError only on 403 (server msg carried), other non-2xx stay Error; +2 tests (instanceof AuthzError on 403; plain Error on 500). sharing 45/45. local/remote now interchangeable behind GroupBackend. Task 5 fully complete.
BASE=c50040e

Task 6: complete (commit b3e39d7; sharing-agent-e2e 1/1, full integration 231 green, type-check clean). CAPSTONE: real startServer + real sharing package (remoteGroupBackend + agent) + synthetic identity (resolveAuthor accepts Bearer OR x-author). Proves: mint G; invite-create installs agent admin on G (owner_a authority); accept grants user_b as agent → user_b RBAC pull sees G's row; non-admin grant 403; revoke → fresh cold-cursor client no longer sees G's row; mint parentGroup:G by non-admin 403.
  NOTE(honest re-scope): post-revoke visibility uses a FRESH cold-cursor client (RBAC revoke scopes FUTURE pulls; warm client retains already-delivered rows — pull is incremental, not retroactive-tombstone). Strictly stronger proof of server-side revoke.
  NOTE(infra, →final-review): packages/sharing resolves via built dist in vitest (not source-aliased) — needed a rebuild; add @jbroll/rowboat-sharing to vitest.shared.js source-alias (like @jbroll/rowboat-server) as a follow-up.
  (commit gate: 2 attempts hit unrelated pre-existing metering-e2e/residency-e2e flakes in packages/server; 3rd clean, no bypass.)
BASE=b3e39d7
  REVIEW (opus) Approved — GENUINE proof. All group ops traverse remoteGroupBackend→real endpoints→real writer grants→real __group* RBAC; every outcome re-verified by server-side reads (faked op would fail); not-visible-before/visible-after proves enforcement changed; fresh-client revoke legitimate + strictly stronger. Only fake = sanctioned IdentityProvider stub. MINOR: "as-agent" inferred not discriminated (owner_a grant would also succeed — rests on sharing routing); unclosed in-mem client handles (GC'd); non-admin-invite 403 source not server-pinned (backstopped by roleOf(AGENT)===null).

ALL 6 TASKS COMPLETE. Commits 7f0c8ce..b3e39d7 on phase-c-sharing (7f0c8ce,7e4ae84,fb04417,b7634f3,ac85af8,ba9d5e0,c50040e,b3e39d7). Next: clean-rebuild verification → final whole-branch review (opus) → land.sh.

FINAL WHOLE-BRANCH REVIEW (opus): VERDICT = READY TO MERGE. No Critical/Important. Agent dance RBAC-pure (every grant→requireAdmin, actor=JWT sub never client-supplied, no mgmt-key bypass, chicken-and-egg closed); interchangeability real at AuthzError class-identity level; default/embedded byte-for-byte unchanged; grant-AS-agent discriminated by unit test; mint fix scoped.
DEFERRED (non-blocking minors → Phase-C-cutover / follow-ups): (1) wrap agent-install grant in try/catch → AuthzError=403 (rare TOCTOU/remote-net throw currently 500); (2) "inviter_no_longer_admin" misleading in agent mode (→ grantor-neutral); (3) err.message in 500 bodies → generic; (4) add @jbroll/rowboat-sharing to vitest.shared.js source-alias (stale-dist trap); (5) CUTOVER note: agent is standing admin on all shared groups → credential rotation/scoping, optional agent removal when no pending invites; (6) confirm subscriber roles config == server lattice at cutover.
Clean-rebuild final verification: auth 35, backend 603, rowboat-service 10, sharing 45, server 72, integration 231 — ALL GREEN.
