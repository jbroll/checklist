#!/usr/bin/env bash
# Local-dev harness (cutover-design sub-project A). Runs a local @jbroll/rowboat-server beside
# CheckList's frontend + auth backend so dev has a real hosted rowboat to point at. Parity with
# prod: ROWBOAT_AUTH_MODE=jwt + ROWBOAT_RBAC=on (decision 4). The server is run FROM SOURCE via tsx
# against the sibling rowboat checkout — no build step: the worker .mjs files resolve as committed
# siblings of each package's dist/. Scratch state lives in .rowboat-dev/ (gitignored); delete it to
# reset. Every env var is overridable so an integration test / alt port can reuse this script.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"          # checklist repo root
server_main="$here/../rowboat/packages/server/src/main.ts"

if [[ ! -f "$server_main" ]]; then
  echo "dev-rowboat: expected the sibling rowboat server at $server_main" >&2
  echo "dev-rowboat: is ../rowboat checked out and built (npm install && build)?" >&2
  exit 1
fi

export ROWBOAT_ROOT="${ROWBOAT_ROOT:-$here/.rowboat-dev}"
export ROUTER_PORT="${ROUTER_PORT:-3020}"
export ROUTER_SECRET="${ROUTER_SECRET:-dev-router-secret-not-for-prod}"
export AUTH_SECRET="${AUTH_SECRET:-dev-auth-secret-not-for-prod}"
export AUTH_BASE_URL="${AUTH_BASE_URL:-http://localhost:${ROUTER_PORT}/api/auth}"
export ROWBOAT_AUTH_MODE="${ROWBOAT_AUTH_MODE:-jwt}"
export ROWBOAT_RBAC="${ROWBOAT_RBAC:-on}"

env_file="$here/.env.tenant.local"
rm -f "$env_file"

echo "dev-rowboat: local rowboat-server on :${ROUTER_PORT} (root=${ROWBOAT_ROOT}, auth=${ROWBOAT_AUTH_MODE}, rbac=${ROWBOAT_RBAC})"
npx tsx "$server_main" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

# No health route on the router — any HTTP response (a 404 included) proves it is accepting.
waited=0
until curl -s -o /dev/null "http://localhost:${ROUTER_PORT}/"; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "dev-rowboat: server exited before becoming reachable" >&2
    exit 1
  fi
  if [ "$waited" -ge 60 ]; then
    echo "dev-rowboat: not reachable on :${ROUTER_PORT} after 60s" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

# Idempotent: a re-run is a schema no-op + issuer re-assert; a wiped .rowboat-dev/ re-bootstraps.
# The registered issuer is the FRONTEND origin (:8765), not the backend's :3001 — better-auth mints
# `iss` from its baseUrl, which is FRONTEND_URL (backend/src/index.ts configFromEnv), because the
# browser reaches /api/auth through vite's proxy. The jwks-url stays :3001: rowboat fetches it
# server-side and must not depend on vite being up. Mismatching them 401s every sync.
echo "dev-rowboat: provisioning the local tenant"
(cd "$here" && npm run --silent provision:local)

database_id="$(node -e "process.stdout.write(require('$here/rowboat-tenant.local.json').databaseId)")"
if [ -z "$database_id" ]; then
  echo "dev-rowboat: provision:local produced no databaseId" >&2
  exit 1
fi

cat > "$env_file" <<EOF
VITE_ROWBOAT_SYNC_BASE=http://localhost:${ROUTER_PORT}/db/${database_id}/api/sync
ROWBOAT_DATABASE_ID=${database_id}
EOF
echo "dev-rowboat: tenant ready (databaseId=${database_id}) -> .env.tenant.local"

wait "$server_pid"
