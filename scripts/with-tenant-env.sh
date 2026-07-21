#!/usr/bin/env bash
# Blocks until dev:rowboat has provisioned the local tenant and written .env.tenant.local, then
# sources it and execs the real command. Frontend and backend both need the provisioned databaseId
# (as VITE_ROWBOAT_SYNC_BASE and ROWBOAT_DATABASE_ID respectively), which does not exist until the
# local rowboat is up. dev-rowboat.sh deletes the file before starting, so its presence always means
# "provisioned this run" — never a stale id left over from a wiped .rowboat-dev/.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$here/.env.tenant.local"
timeout_sec="${TENANT_ENV_TIMEOUT:-120}"

if [ ! -f "$env_file" ]; then
  echo "with-tenant-env: waiting for $env_file (dev:rowboat provisions it)" >&2
fi

waited=0
while [ ! -f "$env_file" ]; do
  if [ "$waited" -ge "$timeout_sec" ]; then
    echo "with-tenant-env: timed out after ${timeout_sec}s waiting for $env_file" >&2
    echo "with-tenant-env: is 'npm run dev:rowboat' running? did provision:local fail?" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

exec "$@"
