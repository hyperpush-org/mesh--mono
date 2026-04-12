#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mesher/scripts/lib/mesh-toolchain.sh
source "$SCRIPT_DIR/lib/mesh-toolchain.sh"

PORT_VALUE="${PORT:-18180}"
CLIENT_PORT_VALUE="${MESHER_CLIENT_PORT:-3000}"
BACKEND_ORIGIN="${MESHER_BACKEND_ORIGIN:-http://127.0.0.1:${PORT_VALUE}}"

usage() {
  echo 'usage: bash mesher/scripts/dev-client.sh' >&2
}

fail() {
  echo "[mesher-client-dev] $1" >&2
  exit 1
}

if [[ $# -ne 0 ]]; then
  usage
  exit 1
fi

mesher_require_command npm

if [[ ! "$PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "PORT must be a positive integer, got: $PORT_VALUE"
fi

if [[ ! "$CLIENT_PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "MESHER_CLIENT_PORT must be a positive integer, got: $CLIENT_PORT_VALUE"
fi

case "$BACKEND_ORIGIN" in
  http://*|https://*) ;;
  *) fail "MESHER_BACKEND_ORIGIN must start with http:// or https://, got: $BACKEND_ORIGIN" ;;
esac

printf '[mesher-client-dev] starting TanStack client on http://127.0.0.1:%s (proxy=%s)\n' "$CLIENT_PORT_VALUE" "$BACKEND_ORIGIN" >&2

cd "$MESHER_PACKAGE_DIR/client"
exec env MESHER_BACKEND_ORIGIN="$BACKEND_ORIGIN" npm run dev -- --host 127.0.0.1 --port "$CLIENT_PORT_VALUE"
