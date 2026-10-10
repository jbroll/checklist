#!/bin/sh
# CI environment setup callback for checklist.
# Sourced (not executed) by the ci/test and ci/e2e entry scripts.
# $WORKTREE is the job's working directory.
#
# checklist's e2e runs against the self-hosted rowboat sync backend (started by
# Playwright's webServer via `npm run dev`) plus a mock OAuth server from global
# setup. The work here: source secrets, expose ORG_HOOKS, check the file:
# sibling (rowboat, the @jbroll/* packages), and write a backend env.

# ── Env: secrets and service endpoints ────────────────────────────────────────
SECRETS="$HOME/.config/checklist/secrets.env"
SERVICES="$HOME/.config/checklist/services.env"
# shellcheck disable=SC1090  # runtime env files, path known only at CI time
[ -f "$SECRETS"  ] && set -a && . "$SECRETS"  && set +a
# shellcheck disable=SC1090
[ -f "$SERVICES" ] && set -a && . "$SERVICES" && set +a

# org-hooks checkout on this host.
export ORG_HOOKS="${ORG_HOOKS:-$HOME/src/org-hooks}"

# ── Sibling file: dependency ──────────────────────────────────────────────────
# rowboat (@jbroll/*, consumed as built dist via file:../rowboat) is built at
# origin/HEAD by the CI server from CI_DEPS in ci/simple-ci.conf and linked at
# ../rowboat before this script runs.
ROWBOAT="$(dirname "$WORKTREE")/rowboat"
if [ -f "$ROWBOAT/packages/schema/dist/index.d.ts" ] && [ -f "$ROWBOAT/packages/auth-betterauth/dist/index.d.ts" ]; then
    echo "[ci/setup] rowboat dist present ($ROWBOAT)"
else
    echo "[ci/setup] ERROR: rowboat dist missing at $ROWBOAT; check the job log's dep: line and CI_DEPS in ci/simple-ci.conf." >&2
fi

# ── backend env ──────────────────────────────────────────────────────────────
# Keep default ports (backend 3001 / frontend 8765) so vite's hardcoded /api ->
# 3001 proxy and Playwright's localhost:8765 webServer line up. Remove any stale
# db first — the jbr-jazz-shaped share_invites (target_covalue_id) collides with
# rowboat's registerShareTables (target_group_id). CHECKLIST_TEST_AUTH=1 turns off
# email-verification so e2e can sign in via email/password (prod keeps it on).
rm -f "$WORKTREE/backend/data/auth.db" "$WORKTREE/backend/data/auth.db-wal" \
      "$WORKTREE/backend/data/auth.db-shm" "$WORKTREE/backend/auth.db"
cat > "$WORKTREE/backend/.env" <<ENVEOF
PORT=3001
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:8765
AUTH_DB_PATH=./data/auth.db
NODE_ENV=test
CHECKLIST_TEST_AUTH=1
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-ci-test-secret-do-not-use-in-prod}
ENVEOF
echo "[ci/setup] wrote backend/.env (backend=3001 frontend=8765, test-auth on)"
