#!/bin/sh
# CI environment setup callback for checklist.
# Sourced (not executed) by the ci/test and ci/e2e entry scripts.
# $WORKTREE is the job's working directory.
#
# checklist's e2e runs against the public Jazz cloud peer (wss://cloud.jazz.tools)
# and a mock OAuth server started by Playwright's global setup — so this needs NO
# local jazz-sync service, version-lock, or per-job Jazz account minting. The work
# here: source secrets, expose ORG_HOOKS, link the file: siblings (jbr-jazz,
# jazz-mock), and write a backend env.

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
for sibling in jbr-jazz jazz-mock; do
    target="$CI_WORKSPACE/$sibling"
    link="$(dirname "$WORKTREE")/$sibling"
    [ -d "$target" ] || continue
    [ -e "$link"   ] && continue
    target_dev="$(stat -c '%d' "$target"               2>/dev/null || echo x)"
    link_dev="$(  stat -c '%d' "$(dirname "$WORKTREE")" 2>/dev/null || echo y)"
    if [ "$target_dev" = "$link_dev" ]; then
        ln -s "$target" "$link"
        echo "[ci/setup] symlinked $sibling -> $target"
    else
        mkdir -p "$link"
        rsync -a --delete --exclude='node_modules' --exclude='.git' "$target/" "$link/"
        echo "[ci/setup] rsynced $sibling -> $link (cross-fs)"
    fi
done

# jbr-jazz packages are consumed as built dist; ensure they're built in CI.
JBR="$(dirname "$WORKTREE")/jbr-jazz"
if [ -d "$JBR" ]; then
    ( cd "$JBR" && npm install --silent && npm run build --silent ) \
        && echo "[ci/setup] built jbr-jazz packages" \
        || echo "[ci/setup] WARN: jbr-jazz build failed" >&2
fi

# ── backend env ──────────────────────────────────────────────────────────────
# Keep default ports (backend 3001 / frontend 8765) so vite's hardcoded /api ->
# 3001 proxy and Playwright's localhost:8765 webServer line up.
cat > "$WORKTREE/backend/.env" <<ENVEOF
PORT=3001
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:8765
AUTH_DB_PATH=./data/auth.db
NODE_ENV=test
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-ci-test-secret-do-not-use-in-prod}
VITE_JAZZ_PEER=${VITE_JAZZ_PEER:-wss://cloud.jazz.tools}
ENVEOF
echo "[ci/setup] wrote backend/.env (backend=3001 frontend=8765)"
