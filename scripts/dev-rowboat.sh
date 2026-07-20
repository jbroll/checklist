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

echo "dev-rowboat: local rowboat-server on :${ROUTER_PORT} (root=${ROWBOAT_ROOT}, auth=${ROWBOAT_AUTH_MODE}, rbac=${ROWBOAT_RBAC})"
exec npx tsx "$server_main"
