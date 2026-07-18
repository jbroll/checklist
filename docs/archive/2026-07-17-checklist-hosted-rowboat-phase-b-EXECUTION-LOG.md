# SDD ledger — checklist-hosted-rowboat Phase B (scope-group RBAC in the worker)

Plan: /home/john/src/checklist/docs/superpowers/plans/2026-07-17-checklist-hosted-rowboat-phase-b-rbac.md
Worktree: /home/john/src/rowboat-phase-b (branch phase-b-rbac, off rowboat main f7e54fa)
Baseline (f7e54fa): auth 30, backend 578, control-plane 68, server 66, integration 225, rowboat-service 4 — all green.
Extra review scrutiny on Tasks 2-4 (single-writer core) and Task 1 (security-critical SQL interpolation).

BASE=f7e54fa

Task 1: complete (commit 3236862; auth 35/35, full gate passed, no hardcoded group-table names remain).
  NOTE(process): original implementer hit the session API limit right after RED; controller completed Steps 3-7 from the plan's verbatim code (tables.ts/schema/effective-role/rbac/index) + fixed an unused `grant` import in the test. Commit needed a retry (first gate run reformatted files but didn't finalize).
BASE=3236862
  REVIEW: clean spec+quality (Approved). No hardcoded names remain; resolveTables validated on every call path; defaults byte-identical. ⚠️ positional-caller shift resolved (params trailing-optional; gate type-checked all dependents). MINOR: resolveTables throws plain Error not AuthzError; export order cosmetic.

Task 2: complete (commit 46b391e; backend 580 + gate green). Writer-core group-write channel.
  REVIEW (opus): clean spec+quality (Approved), all single-writer invariants verified correct by inspection (fenced short-circuit covers groupWrite before stateFor; exactly-once replies; rebuffer prepared-only; per-item failure isolation; no auth import).
  MINOR→hardening: adding regression tests for fenced+groupWrite (the critical invariant), absent-runner, throwing-runner (were verified by inspection, not asserted).
  NOTE(process): implementer got stuck ~47min polling the commit gate + a nohup commit died mid-gate; controller ran the foreground commit. ts-deadcode passed the new index re-exports.
BASE=46b391e
  HARDENED: commit 846063d — fenced+groupWrite (runner not invoked), absent-runner, throwing-runner tests added (writer-group-write 5/5). Task 2 fully complete.
BASE=846063d

Task 3: complete (commit 05e5c05, review clean spec+quality; backend 583/583, rowboat-service 4/4, gate green).
  groupOpsModule threads startCoreService→serveSync writerData→serve-threads spread→writer.worker dynamic-import. Unset=current behavior (verified by inspection). No static auth import in backend. (start-core-service.ts:51 diagnostic was stale.)
BASE=05e5c05

Task 4: complete (commit 334c933; backend 588/588, type-check clean, gate green). Per-db authFactory + ensureProvisioned on mountSyncRoutes.
  PLAN-ERROR CORRECTED by implementer: brief said import createRbacAuth/registerAuthTables from @jbroll/rowboat-auth in the backend test → would be an auth→backend→auth CYCLE (caught by sci gate). Implementer used a local fake SyncAuth instead (mirrors auth-seam.test.ts). Correct. (Task 10 integration test, in packages/integration, CAN import auth — no cycle there.)
  Push ensureProvisioned guard omits `&& author` (author already non-null-narrowed in push); pull keeps it.
BASE=334c933
  REVIEW (opus): security CLEAN (no leak, fails closed, reads scoped + writes gated at sole call sites, ordering/guards correct). NEEDS FIX (Important): per-databaseId SyncAuth cache never invalidated vs ResidenceRegistry LRU eviction → evicted-then-reopened db returns SyncAuth on a CLOSED handle → 500 for that db in the multi-DB topology authFactory targets. FIX: drop cache, build per-request (createRbacAuth does no work at construction). Plan mandated the cache but it's a buggy optimization → corrected. Minor: `as SyncAuth` cast (removed by fix); provisioning-before-version-gate (acceptable, idempotent).
  FIX: commit 41e8ecd — dropped the cache, build SyncAuth per-request from the live handle at both pull+push sites; +1 eviction regression test (capacity 1, evict-then-re-pull asserts 200 + correct scoped payload; verified it fails with the cache reintroduced). Re-review: Resolved, Approved, no regression. Task 4 fully complete.
BASE=41e8ecd

Task 5: complete (commit c3dd619; rowboat-service 7/7, type-check clean, gate green incl local-ts-circular = no cycle from the new @jbroll/rowboat-auth dep).
  writer-groupops.mjs is a hand-written .mjs in src (same as server-buildapp.mjs) → dynamic-importable by URL in Task 9. GROUP_TABLES=__group*. ensureRootGroup idempotent; never throws (returns {ok:false} on dup). (writer-groupops.mjs diagnostic was stale.)
  MINOR: _databaseId unused (interface shape); dup-group collapses to generic {ok:false}; no unknown-op test.
BASE=c3dd619

Task 5: REVIEW clean spec+quality (Approved). Nested link config threading verified (GROUP_TABLES → inheritance edge); never-throws holds; signature byte-compatible with ApplyGroupOp/GroupResult; tests assert real DB state. 3 acknowledged Minors only.
BASE=c3dd619

Task 6: complete (commit b35abf0; backend 589/589, push path green end-to-end, gate green). makeWriterClient shares one pending map → forwardPush + forwardGroupWrite; prepared msgs now carry kind:"prepared" (writer accepts explicit + absent). Task 3 dynamic-import untouched. forwardGroupWrite unused until Task 7.
BASE=b35abf0

Task 6: REVIEW Approved, no issues. Shared correlation correct (one counter, resolve-before-delete, rejectAll covers push+groupWrite), push path green. (My "preserve groupOpsModule in this file" note was mis-scoped — that's in writer.worker.mjs, harmless.)
BASE=b35abf0

Task 7: complete (commit 05785a3; rowboat-service 7/7, backend 589/589, gate green). RBAC enforcement + provisioning + mint endpoint wired in server-buildapp.mjs, all behind if(appData.rbac); off=byte-for-byte unchanged.
  authFactory=createRbacAuth(db,{tables:GROUP_TABLES}); ensureProvisioned=provisionOnce(Set, forwards ensureRootGroup, throws on !ok=fails closed); mint POST ${basePath}/groups (router splat proxies), author-gated 401, 403 on !ok. No isolated test (worker thread) — Task 10 covers e2e (acceptable per brief).
  MINOR: `await resolveAuthor(req)` redundant (verify sync) — harmless await-no-effect hint; double express.json() on mint route (idempotent). Mint failure 403 (brief allowed 403|409).
BASE=05785a3

Task 7: REVIEW (opus) Approved. RBAC-off byte-for-byte unchanged; fails-closed with correct post-success caching; enforcement+provisioning wired as a pair (no enforce-without-provision path); mint actor is server-resolved (can't mint as another principal).
  *** PHASE-C MUST-FIX (Important, in-spec/deferred, NOT a Phase-B confidentiality break): mint route does NOT check admin on a caller-supplied parentGroup. createScopeGroup's link only requires admin on the CHILD (the new group). Upward inheritance ⇒ no read-escalation against existing data (actor gains nothing on parent), but an integrity/injection vector: a user can parent their new group under a victim's group, surfacing their own rows into the victim's view. Matches CheckList's existing createScopeGroup semantics (parentGroup ?? author). Phase C fix: require actor admin/link rights on parentGroup when it != actor's root, else 403. ***
  MINOR: mint doesn't ensureProvisioned first (clients sync before minting — ordering assumption); redundant express.json on mint route (no-op, removable); mint failure 403 not 409.
BASE=05785a3

Task 8: complete (commit 86cd23b; control-plane 69/69, gate green incl local-ts-circular = new @jbroll/rowboat-auth dep is cycle-free). registerAuthTables(sdb, __group*) at createDatabase (inside try, after registerSyncTable loop). Tables un-synced (not in sync_tables).
  NOTE(process): implementer returned mid-commit (nohup pattern); controller waited on the in-flight commit pid — it landed clean.
BASE=86cd23b

Task 8: REVIEW clean spec+quality (Approved). Placement correct (inside try, rides error-cleanup); tables un-synced (raw CREATE, test asserts absent from sync_tables); real on-disk integration test. By-design Minors only (unconditional creation, new control-plane→auth dep edge).
BASE=86cd23b

Task 9: complete (commit 7ab41e0; server 70/70, rowboat-service 7/7, type-check clean, gate green). configFromEnv reads ROWBOAT_RBAC (on/off default off, unknown throws /ROWBOAT_RBAC/) → ServerConfig.rbac → startCoreService → appData.rbac (server-buildapp reads it). groupOpsModule defaulted to writer-groupops.mjs sibling in start-core-service (owns the file; mirrors listenerApp). Deviation (endorsed): edited start-core-service.ts (appData assembled there).
BASE=7ab41e0

Task 9: REVIEW clean spec+quality (Approved). Fail-loud 3-way parse (on/off/throw); config.rbac→startCoreService→appData.rbac→server-buildapp gating traced; groupOpsModule mirrors listenerApp URL; default-off unchanged. Cosmetic Minors only.
BASE=7ab41e0

Task 10: complete (commit 02a5b7c; rbac-worker-e2e 4/4, integration 229/229, server 70/70, full workspace test:run exits 0). CAPSTONE PROOF via real startServer (router+worker threads), synthetic x-author identity, rbac:true.
  #1 root-group auto-provision + self access ✓; #2 isolation (user_b can't read user_a rows; push to user_a group 403) ✓; #3 folder-group mint + nested read (user_a yes, user_b no) ✓; #4 mint parentGroup:user_a by user_b SUCCEEDS (documented Phase-C gap) — test asserts actual behavior + confirms #2 invariant still holds. Assertions NOT weakened.
  TEST-INFRA: added @jbroll/rowboat-server to vitest.shared.js source-alias (its noExternal tsup bundle breaks new URL("../src/..") worker-entry resolution when imported by package name from outside). Test-only; verified vs full workspace + console-web e2e.
BASE=02a5b7c

Task 10: REVIEW (opus) Approved — GENUINE proof. test1-vs-test2 contrast makes enforcement non-bypassable (can't go green under RBAC-off); isolation strict both directions; provisioning genuinely lazy (no manual inserts); inheritance read is a true server-side read. #4 honest.
  IMPORTANT (packaging, NOT a proof defect, PRE-EXISTING not introduced by Phase B, and MOOT given no deployments): built @jbroll/rowboat-server dist mis-resolves worker-entry new URL("../src/*.mjs") when imported by package name → proof runs from SRC (workspace test convention; vitest.build-workers.js covers built paths). Surfaced by Task 10 being first external importer.
  MINOR (non-weakening, backstopped): test "pull back" of self-authored rows trivially true (real round-trips proven elsewhere); rejects.toThrow not asserting 403 specifically (backstopped by re-pull non-application); .not.toContain vs toEqual([]).

ALL 10 TASKS COMPLETE. Commits 3236862..02a5b7c on phase-b-rbac. Next: clean-rebuild verification → final whole-branch review (opus) → finishing-a-development-branch.

FINAL WHOLE-BRANCH REVIEW (opus): VERDICT = READY TO MERGE. No Critical/Important. End-to-end composition sound + fail-closed; single-writer preserved (group writes same writer, listener read-only, fenced short-circuit); backend auth-free (no cycle); eviction fix guarded; provisioning ordering/WAL visibility holds; downward-only readability isolates users; RBAC-off byte-for-byte unchanged. Phase-C mint parentGroup gap CONFIRMED confidentiality-safe (integrity-only). Minors: redundant express.json (mint route); mint 403-not-409; mint-before-sync self-heals; ROWBOAT_RBAC env dead-weight-given-no-deployments (keep-or-drop, user's call); groupOpsModule always imported (no side effects).
Clean-rebuild final verification: auth 35, backend 589, control-plane 69, rowboat-service 7, server 70, integration 229 — ALL GREEN.
