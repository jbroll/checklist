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
# checklist depends on rowboat (@jbroll/*), @jbr-jazz/* and jazz-mock via
# file:../*. CI worktrees land in ~/ci-worktrees/checklist-<id>/ where these
# siblings don't exist; provide them from ci-workspace so npm install resolves.
# Same fs → symlink. Cross fs → rsync (a cross-fs symlink of the sibling dir
# breaks npm's file: resolution). The job runs in a mount namespace where
# ci-workspace (/home) and ci-worktrees (/data) are SEPARATE devices, so in
# practice CI takes the rsync path.
CI_WORKSPACE="${CI_WORKSPACE:-$HOME/ci-workspace}"
WT_PARENT="$(dirname "$WORKTREE")"

# link_sibling NAME — refresh $WT_PARENT/NAME from $CI_WORKSPACE/NAME every run
# (a stale copy silently ships old/partial dist — the bug this replaces).
link_sibling() {
    name="$1"; target="$CI_WORKSPACE/$name"; link="$WT_PARENT/$name"
    [ -d "$target" ] || return 0
    tdev="$(stat -c '%d' "$target"    2>/dev/null || echo x)"
    ldev="$(stat -c '%d' "$WT_PARENT" 2>/dev/null || echo y)"
    if [ "$tdev" = "$ldev" ]; then
        [ "$(readlink "$link" 2>/dev/null)" = "$target" ] && return 0
        rm -rf "$link"; ln -s "$target" "$link"
        echo "[ci/setup] symlinked $name -> $target"
    else
        rm -rf "$link"; mkdir -p "$link"
        rsync -a --delete --exclude='node_modules' --exclude='.git' "$target/" "$link/"
        echo "[ci/setup] rsynced $name -> $link (cross-fs)"
    fi
}

# jbr-jazz/jazz-mock are legacy siblings still imported by not-yet-ported code;
# they get a fresh node_modules from their own build step below.
link_sibling jbr-jazz
link_sibling jazz-mock

# rowboat is consumed as PRE-BUILT dist (no per-worktree build — ci-workspace/
# rowboat is kept current+built out of band, rebuilt on rowboat land). Its dist
# imports zod/better-auth/cross-@jbroll by bare specifier, and vite resolves
# those from the package's realpath — so the copy MUST carry a node_modules.
# Same-fs symlink gets it via the whole-dir link; the cross-fs rsync excludes
# node_modules, so symlink it back to the pre-built ci-workspace copy (a cross-fs
# symlink resolves fine for node module lookup — only the file: sibling dir
# itself can't be a cross-fs symlink).
link_sibling rowboat
ROWBOAT="$WT_PARENT/rowboat"
if [ ! -e "$ROWBOAT/node_modules" ] && [ -d "$CI_WORKSPACE/rowboat/node_modules" ]; then
    ln -sfn "$CI_WORKSPACE/rowboat/node_modules" "$ROWBOAT/node_modules"
    echo "[ci/setup] linked rowboat node_modules -> $CI_WORKSPACE/rowboat/node_modules"
fi
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
