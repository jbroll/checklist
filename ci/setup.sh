#!/bin/sh
# CI environment setup for checklist.
# Sourced by simple-ci's ci-run.sh before npm install and test execution.
# $WORKTREE is set by ci-run.sh to the job's working directory.
#
# Unlike wicketmap, checklist's e2e runs against the public Jazz cloud peer
# (wss://cloud.jazz.tools) and a mock OAuth server started by Playwright's
# global setup — so this needs NO local jazz-sync service, version-lock, or
# per-job Jazz account minting. The only CI-specific work is: source secrets,
# expose ORG_HOOKS, link the file: siblings (jbr-jazz, jazz-mock), and write a
# per-job backend env.

# ── Env: secrets and service endpoints ────────────────────────────────────────
SECRETS="$HOME/.config/checklist/secrets.env"
SERVICES="$HOME/.config/checklist/services.env"
# shellcheck disable=SC1090  # runtime env files, path known only at CI time
[ -f "$SECRETS"  ] && set -a && . "$SECRETS"  && set +a
# shellcheck disable=SC1090
[ -f "$SERVICES" ] && set -a && . "$SERVICES" && set +a

# org-hooks checkout on this host (used by hook scripts if a job runs them).
export ORG_HOOKS="${ORG_HOOKS:-$HOME/src/org-hooks}"

# Playwright e2e drives backend routes; enable test-only affordances if the app
# gates them (no-op otherwise). Production deploys MUST NOT set this.
export ENABLE_TEST_ROUTES=true

# ── backend env — per-job ports via simple-ci slot ───────────────────────────
# simple-ci sets CI_SLOT_INDEX (0..CI_WORKERS-1) so concurrent jobs don't
# collide on ports. Base ports match local dev (frontend 8765, backend 3001).
SLOT="${CI_SLOT_INDEX:-0}"
CI_BACKEND_PORT=$((3001 + SLOT))
CI_FRONTEND_PORT=$((8765 + SLOT))
ENV_LOCAL="$WORKTREE/backend/.env"
cat > "$ENV_LOCAL" <<ENVEOF
PORT=$CI_BACKEND_PORT
BASE_URL=http://localhost:$CI_BACKEND_PORT
FRONTEND_URL=http://localhost:$CI_FRONTEND_PORT
AUTH_DB_PATH=./data/auth.db
NODE_ENV=test
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-ci-test-secret-do-not-use-in-prod}
ENVEOF
echo "[ci/setup] slot=$SLOT backend=$CI_BACKEND_PORT frontend=$CI_FRONTEND_PORT"

# ── Sibling file: dependencies ────────────────────────────────────────────────
# checklist depends on @jbr-jazz/* and jazz-mock via file:../*. CI worktrees
# land where these siblings don't exist; create them so npm install resolves.
# Cross-filesystem symlinks break npm's file: resolution, so detect a device
# mismatch and rsync (without node_modules) to stay on one mount.
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
if [ -d "$(dirname "$WORKTREE")/jbr-jazz" ]; then
    ( cd "$(dirname "$WORKTREE")/jbr-jazz" && npm install --silent && npm run build --silent ) \
        && echo "[ci/setup] built jbr-jazz packages" \
        || echo "[ci/setup] WARN: jbr-jazz build failed" >&2
fi
