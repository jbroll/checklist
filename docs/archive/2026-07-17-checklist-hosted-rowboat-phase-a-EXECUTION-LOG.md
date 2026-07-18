# SDD ledger — checklist-hosted-rowboat Phase A (JWKS data-plane auth bridge)

Plan: /home/john/src/checklist/docs/superpowers/plans/2026-07-17-checklist-hosted-rowboat-phase-a-jwks-bridge.md
Worktree: /home/john/src/rowboat-phase-a (branch phase-a-jwks-bridge, off rowboat main)
Baseline (a6dfa8d): control-plane 60, router 27, server 54, auth-betterauth 42, integration 221 — all green.

BASE=a6dfa8d

Task 1: complete (commit ca8ff4d, review clean spec+quality; 64/64 control-plane green).
  NOTE(final-review): control-plane.ts pre-existing 540>500 line-cap → grandfathered via .size-cap-allow (documented mechanism, not --no-verify); plan mandated adding accessors to this file. Consider a ControlPlane split as a separate refactor.
  MINOR: setDatabaseAuthConfig is all-three-or-none; a later key-rotation task must re-supply all fields.
BASE=ca8ff4d

Task 2: complete (commit ce0e6e6, review clean spec+quality; 68/68 control-plane green, full sci gate passed no bypass).
  MINOR: setDatabaseAuthConfig try/catch unreachable after ownership guard (harmless DiD); audience↔databaseId tie is a registration convention, not route-enforced (by design).
BASE=ce0e6e6

Task 3: complete (commit 5072e65, review clean spec+quality; router 28/28, server 54/54, full gate passed).
  Deviation (correct): ResolveAuthorContext also re-exported from router/src/index.ts so dist surfaces the type for server. ⚠️ resolved: synthetic stub verified by server 54/54; integration resolveAuthorFromBody feeds the backend mountSyncRoutes seam (different type), unaffected.
  NOTE(process): implementer first returned prematurely (staged, uncommitted, no report) — re-engaged same agent to build+test+commit foreground. Landed clean.
BASE=5072e65

Task 4: complete (commits 537d595 + fix 0a052da, review clean spec+quality after fix; server 63/63, jwt-author 9/9, full gate passed).
  Fix: moved new URL(jwksUrl)+createRemoteJWKSet inside try/catch (malformed jwksUrl → null, not throw) + regression test. Verified resolved, no regression.
  Latent Task-1 gap fixed in 537d595: DatabaseAuthConfig now re-exported from control-plane/src/index.ts (plan assumed it was).
BASE=0a052da

Task 5: complete (commit b432056, review clean spec+quality; server 66/66, full gate passed).
  Fail-loud on unknown ROWBOAT_AUTH_MODE (no silent synthetic default); default stays synthetic; JWT_CLOCK_TOLERANCE_SEC via optionalInt.
BASE=b432056

Task 6: complete (commit 710317c, review clean spec+quality; auth-betterauth 45/45, type-check clean, full gate passed).
  Opt-in jwt plugin; EdDSA/Ed25519 default + sub=user.id independently verified vs better-auth source. Deviations (both fine): test-only JwtPluginApi cast (auth.api generic collapse, pre-existing); jose added to auth-betterauth devDeps (knip).
BASE=710317c

Task 7: complete (commit efae603, review clean spec+quality; jwt-bridge 4/4, integration 225/225, full gate passed).
  Capstone proof verified: real better-auth JWT + real HTTP JWKS + real control-plane lookup → author=sub; absent/wrong-tenant(aud)/tampered → null. Real verifier imported from @jbroll/rowboat-server (re-exported from server index.ts).
  IMPORTANT(final-review, not a code defect): integration suite requires dist built first (auth-betterauth, server) — monorepo build-ordering; CI must `npm run build` before tests. Resolving via a clean rebuild+retest below.
  MINOR: test casts ctx/req `as unknown as` (bypasses shape type-check); JwtPluginApi cast duplicated from auth-betterauth test.
BASE=efae603

ALL 7 TASKS COMPLETE — commits a6dfa8d..efae603 (ca8ff4d, ce0e6e6, 5072e65, 537d595, 0a052da, b432056, 710317c, efae603). Next: clean-build final verification, then whole-branch review (opus), then finishing-a-development-branch.

FINAL WHOLE-BRANCH REVIEW (opus): VERDICT = READY TO MERGE. No Critical, no blocking Important. End-to-end composition traced clean (config→router seam→verifier→CP lookup, same database_id key); fail-closed layered; backward-compat real (default synthetic, 1-arg seams compile); tenant isolation proven; nullable ALTERs safe.
DEFERRED to Phase B cutover (reviewer-recommended, non-blocking — matter when ROWBOAT_AUTH_MODE=jwt becomes default):
  1. jwt-author.ts: pin `algorithms: ["EdDSA"]` in jwtVerify (DiD vs alg-confusion; not exploitable now — JWKS serves only EdDSA keys).
  2. jwt-author.ts: debug-log the failure REASON (not the token) so a JWKS outage is distinguishable from a bad token (both are 401 today).
  3. PUT /auth-issuer: optional new URL()/https validation on jwksUrl for registration-time feedback (verifier fails closed regardless).
  4. audience==database_id is a convention, not route-enforced (deliberate flexibility; one-line note only).
Clean-rebuild final verification: control-plane 68, router 28, server 66, auth-betterauth 45, integration 225 — ALL GREEN.
