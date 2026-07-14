#!/bin/sh
# CI environment setup callback for checklist.
# Sourced (not executed) by the ci/test and ci/e2e entry scripts.
# $WORKTREE is the job's working directory.
#
# checklist's e2e runs against the self-hosted rowboat sync backend (started by
# Playwright's webServer via `npm run dev`) plus a mock OAuth server from global
# setup. The work here: source secrets, expose ORG_HOOKS, link + build the file:
# siblings (rowboat — the @jbroll/* packages — plus the legacy jbr-jazz/jazz-mock
# still referenced by not-yet-ported code), and write a backend env.

# ── Env: secrets and service endpoints ────────────────────────────────────────
SECRETS="$HOME/.config/checklist/secrets.env"
SERVICES="$HOME/.config/checklist/services.env"
# shellcheck disable=SC1090  # runtime env files, path known only at CI time
[ -f "$SECRETS"  ] && set -a && . "$SECRETS"  && set +a
# shellcheck disable=SC1090
[ -f "$SERVICES" ] && set -a && . "$SERVICES" && set +a

# org-hooks checkout on this host.
export ORG_HOOKS="${ORG_HOOKS:-$HOME/src/org-hooks}"

# ── Sibling file: dependencies ────────────────────────────────────────────────
# checklist depends on @jbr-jazz/* and jazz-mock via file:../*. CI worktrees land
# in ~/ci-worktrees/checklist-<id>/ where these siblings don't exist; link them
# from ci-workspace so npm install resolves. Cross-filesystem symlinks break
# npm's file: resolution, so on a device mismatch rsync (without node_modules).
CI_WORKSPACE="${CI_WORKSPACE:-$HOME/ci-workspace}"
for sibling in rowboat jbr-jazz jazz-mock; do
    target="$CI_WORKSPACE/$sibling"
    link="$(dirname "$WORKTREE")/$sibling"
    [ -d "$target" ] || continue
    target_dev="$(stat -c '%d' "$target"               2>/dev/null || echo x)"
    link_dev="$(  stat -c '%d' "$(dirname "$WORKTREE")" 2>/dev/null || echo y)"
    if [ "$target_dev" = "$link_dev" ]; then
        # Same filesystem: the sibling must be a SYMLINK to the pre-built
        # ci-workspace copy (which carries dist + node_modules). Self-heal a
        # stale real-dir copy (e.g. a partial-dist leftover) that would
        # otherwise shadow the symlink and break @jbroll/* resolution.
        if [ "$(readlink "$link" 2>/dev/null)" != "$target" ]; then
            rm -rf "$link"
            ln -s "$target" "$link"
            echo "[ci/setup] symlinked $sibling -> $target"
        fi
    else
        [ -e "$link" ] && continue
        mkdir -p "$link"
        rsync -a --delete --exclude='node_modules' --exclude='.git' "$target/" "$link/"
        echo "[ci/setup] rsynced $sibling -> $link (cross-fs)"
    fi
done

# rowboat packages (@jbroll/rowboat-*) are consumed as built dist — checklist file:
# links to ../rowboat/packages/*. On this host ci-workspace and ci-worktrees share
# a filesystem, so the sibling above is a SYMLINK into ci-workspace/rowboat — a
# checkout SHARED by every consumer's CI run. So we do NOT install/build it here:
# rebuilding a shared checkout per-run races concurrent jobs and a failed --clean
# rebuild leaves its dist broken. ci-workspace/rowboat is kept current+built out of
# band (rebuilt on rowboat land). We only verify its dist is present.
ROWBOAT="$(dirname "$WORKTREE")/rowboat"
if [ -f "$ROWBOAT/packages/schema/dist/index.d.ts" ] && [ -f "$ROWBOAT/packages/auth-betterauth/dist/index.d.ts" ]; then
    echo "[ci/setup] rowboat dist present ($ROWBOAT)"
else
    echo "[ci/setup] ERROR: rowboat dist missing at $ROWBOAT — build \$CI_WORKSPACE/rowboat (git reset --hard origin/main && npm ci && npm run build)." >&2
fi

# jbr-jazz packages are consumed as built dist; ensure they're built in CI (legacy,
# for not-yet-ported code still importing @jbr-jazz/*).
JBR="$(dirname "$WORKTREE")/jbr-jazz"
if [ -d "$JBR" ]; then
    ( cd "$JBR" && npm install --silent && npm run build --silent ) \
        && echo "[ci/setup] built jbr-jazz packages" \
        || echo "[ci/setup] WARN: jbr-jazz build failed" >&2
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
