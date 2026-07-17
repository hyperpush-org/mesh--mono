#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mesher/scripts/lib/mesh-toolchain.sh
source "$SCRIPT_DIR/lib/mesh-toolchain.sh"

PORT_VALUE="${PORT:-18080}"
WS_PORT_VALUE="${MESHER_WS_PORT:-18081}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT_VALUE}}"
SESSION_TOKEN="${MESHER_SMOKE_SESSION_TOKEN:-hyperpush-e2e-session-token-0000000000000000000000000000}"
ARTIFACT_DIR="${MESHER_SMOKE_ARTIFACT_DIR:-$MESHER_PACKAGE_DIR/../.tmp/m055-s02/mesher-smoke}"
BUILD_DIR="$ARTIFACT_DIR/build"
BINARY_PATH="$BUILD_DIR/mesher"
LOG_FILE="$ARTIFACT_DIR/mesher.log"
SETTINGS_RESPONSE_PATH="$ARTIFACT_DIR/project-settings-last-response.txt"
rm -f "$SETTINGS_RESPONSE_PATH"
SERVER_PID=''
LAST_RESPONSE=''

usage() {
  echo 'usage: bash mesher/scripts/smoke.sh' >&2
}

fail() {
  echo "[mesher-smoke] $1" >&2
  exit 1
}

json_field() {
  local field="$1"
  python3 -c '
import json
import sys

field = sys.argv[1]
try:
    value = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)
for key in field.split("."):
    if not isinstance(value, dict):
        raise SystemExit(1)
    value = value.get(key)
    if value is None:
        raise SystemExit(1)
if isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":")))
else:
    print(value)
' "$field"
}

cleanup() {
  local status=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ $status -ne 0 ]]; then
    echo "[mesher-smoke] failure; tailing server log from $LOG_FILE" >&2
    tail -n 200 "$LOG_FILE" >&2 || true
  fi
}
trap cleanup EXIT

if [[ $# -ne 0 ]]; then
  usage
  exit 1
fi

mesher_require_command curl
mesher_require_command psql
mesher_require_command python3
mesher_require_database_url

if [[ ! "$PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "PORT must be a positive integer, got: $PORT_VALUE"
fi

if [[ ! "$WS_PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "MESHER_WS_PORT must be a positive integer, got: $WS_PORT_VALUE"
fi

case "$BASE_URL" in
  http://*|https://*) ;;
  *) fail "BASE_URL must start with http:// or https://, got: $BASE_URL" ;;
esac

ARTIFACT_DIR="$(mesher_prepare_bundle_dir "$ARTIFACT_DIR")"
BUILD_DIR="$ARTIFACT_DIR/build"
BINARY_PATH="$BUILD_DIR/mesher"
LOG_FILE="$ARTIFACT_DIR/mesher.log"
SETTINGS_RESPONSE_PATH="$ARTIFACT_DIR/project-settings-last-response.txt"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
rm -f "$LOG_FILE" "$SETTINGS_RESPONSE_PATH"

seed_exists="$(psql "$DATABASE_URL" -Atqc "SELECT count(*)::text FROM projects WHERE slug = 'default'")"
if [[ "$seed_exists" != '1' ]]; then
  fail "seeded default project is missing; run bash mesher/scripts/migrate.sh up first"
fi

DATABASE_URL="$DATABASE_URL" MESHER_E2E_SESSION_TOKEN="$SESSION_TOKEN" \
  bash "$SCRIPT_DIR/seed-e2e-auth.sh"

printf '[mesher-smoke] building Mesher into %s\n' "$BUILD_DIR" >&2
bash "$SCRIPT_DIR/build.sh" "$BUILD_DIR"

printf '[mesher-smoke] starting Mesher base_url=%s\n' "$BASE_URL" >&2
(
  cd "$BUILD_DIR"
  DATABASE_URL="$DATABASE_URL" \
  PORT="$PORT_VALUE" \
  MESHER_WS_PORT="$WS_PORT_VALUE" \
  MESHER_RATE_LIMIT_WINDOW_SECONDS="${MESHER_RATE_LIMIT_WINDOW_SECONDS:-60}" \
  MESHER_RATE_LIMIT_MAX_EVENTS="${MESHER_RATE_LIMIT_MAX_EVENTS:-1000}" \
  MESH_CLUSTER_COOKIE="${MESH_CLUSTER_COOKIE:-dev-cookie}" \
  MESH_NODE_NAME="${MESH_NODE_NAME:-mesher@127.0.0.1:4370}" \
  MESH_DISCOVERY_SEED="${MESH_DISCOVERY_SEED:-localhost}" \
  MESH_CLUSTER_PORT="${MESH_CLUSTER_PORT:-4370}" \
  MESH_CONTINUITY_ROLE="${MESH_CONTINUITY_ROLE:-primary}" \
  MESH_CONTINUITY_PROMOTION_EPOCH="${MESH_CONTINUITY_PROMOTION_EPOCH:-0}" \
  "$BINARY_PATH" >"$LOG_FILE" 2>&1
) &
SERVER_PID=$!

printf '[mesher-smoke] waiting for readiness base_url=%s\n' "$BASE_URL" >&2
for attempt in $(seq 1 80); do
  if LAST_RESPONSE="$(curl -fsS "$BASE_URL/health/ready" 2>/dev/null)"; then
    ready_status="$(printf '%s' "$LAST_RESPONSE" | json_field status || true)"
    printf '[mesher-smoke] readiness poll=%s status=%s\n' "$attempt" "${ready_status:-missing}" >&2
    if [[ "$ready_status" == 'ready' ]]; then
      break
    fi
  fi
  sleep 0.25
  if [[ "$attempt" == '80' ]]; then
    printf '%s\n' "$LAST_RESPONSE" >"$SETTINGS_RESPONSE_PATH"
    fail "/health/ready never became ready at $BASE_URL (last response: $SETTINGS_RESPONSE_PATH)"
  fi
done

live_response="$(curl -fsS "$BASE_URL/health/live")"
live_status="$(printf '%s' "$live_response" | json_field status || true)"
if [[ "$live_status" != 'live' ]]; then
  fail "liveness probe was missing the live status"
fi

metrics_response="$(curl -fsS "$BASE_URL/metrics")"
rate_limit_max_units="$(printf '%s' "$metrics_response" | json_field rate_limit_max_units || true)"
websocket_connections="$(printf '%s' "$metrics_response" | json_field websocket_connections || true)"
if [[ -z "$rate_limit_max_units" || -z "$websocket_connections" ]]; then
  fail "metrics probe was missing expected counters"
fi

settings_response="$(curl -fsS -H "Authorization: Bearer $SESSION_TOKEN" "$BASE_URL/api/v1/projects/default/settings")"
retention_days="$(printf '%s' "$settings_response" | json_field retention_days || true)"
sample_rate="$(printf '%s' "$settings_response" | json_field sample_rate || true)"
if [[ "$retention_days" != '90' || -z "$sample_rate" ]]; then
  fail "authenticated settings readback was missing expected fields"
fi

storage_response="$(curl -fsS -H "Authorization: Bearer $SESSION_TOKEN" "$BASE_URL/api/v1/projects/default/storage")"
event_count="$(printf '%s' "$storage_response" | json_field event_count || true)"
estimated_bytes="$(printf '%s' "$storage_response" | json_field estimated_bytes || true)"
if [[ -z "$event_count" || -z "$estimated_bytes" ]]; then
  fail "storage readback was missing expected fields"
fi

printf '[mesher-smoke] storage event_count=%s estimated_bytes=%s\n' "$event_count" "$estimated_bytes" >&2
printf '%s\n' "$storage_response"
