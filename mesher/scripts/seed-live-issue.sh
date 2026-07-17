#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mesher/scripts/lib/mesh-toolchain.sh
source "$SCRIPT_DIR/lib/mesh-toolchain.sh"

PORT_VALUE="${PORT:-18080}"
WS_PORT_VALUE="${MESHER_WS_PORT:-18081}"
CLUSTER_PORT_VALUE="${MESH_CLUSTER_PORT:-19080}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT_VALUE}}"
USE_RUNNING_BACKEND="${MESHER_REUSE_RUNNING_BACKEND:-false}"
API_KEY="${MESHER_SEED_API_KEY:-mshr_devdefaultapikey000000000000000000000000000}"
E2E_SESSION_TOKEN="${MESHER_E2E_SESSION_TOKEN:-hyperpush-e2e-session-token-0000000000000000000000000000}"
AUTHORIZATION_HEADER="authorization: Bearer ${E2E_SESSION_TOKEN}"
ARTIFACT_DIR="${MESHER_SEED_ARTIFACT_DIR:-$MESHER_PACKAGE_DIR/../.tmp/m060-s02/seed-live-issue}"
BUILD_DIR="$ARTIFACT_DIR/build"
BINARY_PATH="$BUILD_DIR/mesher"
LOG_FILE="$ARTIFACT_DIR/mesher.log"
SETTINGS_RESPONSE_PATH="$ARTIFACT_DIR/project-settings-last-response.txt"
SEED_TAG_KEY="seed_case"
READ_CASE_NAME='read'
READ_TITLE='M060 seeded live issue read seam'
READ_FINGERPRINT='m060-seeded-live-issue-read-seam'
READ_TAG_VALUE='m060-live-read-seam'
READ_STACK_FILE='seed/live-issue-read.ts'
READ_BREADCRUMB_MESSAGE='Seeded live issue read breadcrumb'
READ_SURFACE='issues-live-read'
ACTION_CASE_NAME='action'
ACTION_TITLE='M060 seeded live issue action seam'
ACTION_FINGERPRINT='m060-seeded-live-issue-action-seam'
ACTION_TAG_VALUE='m060-live-action-seam'
ACTION_STACK_FILE='seed/live-issue-action.ts'
ACTION_BREADCRUMB_MESSAGE='Seeded live issue action breadcrumb'
ACTION_SURFACE='issues-live-actions'
SERVER_PID=''
STARTED_SERVER='false'
LAST_RESPONSE=''

usage() {
  echo 'usage: bash mesher/scripts/seed-live-issue.sh' >&2
}

fail() {
  echo "[seed-live-issue] $1" >&2
  exit 1
}

json_field() {
  local field="$1"
  python3 -c '
import json
import sys

field = sys.argv[1]
value = json.load(sys.stdin)
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
  if [[ "$STARTED_SERVER" == 'true' ]] && [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ $status -ne 0 ]]; then
    echo "[seed-live-issue] failure; tailing server log from $LOG_FILE" >&2
    if [[ -f "$LOG_FILE" ]]; then
      tail -n 200 "$LOG_FILE" >&2 || true
    fi
  fi
}
trap cleanup EXIT

if [[ $# -ne 0 ]]; then
  usage
  exit 1
fi

mesher_require_command curl
mesher_require_command python3

if [[ ! "$PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "PORT must be a positive integer, got: $PORT_VALUE"
fi

if [[ ! "$WS_PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "MESHER_WS_PORT must be a positive integer, got: $WS_PORT_VALUE"
fi

if [[ ! "$CLUSTER_PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "MESH_CLUSTER_PORT must be a positive integer, got: $CLUSTER_PORT_VALUE"
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
rm -f "$SETTINGS_RESPONSE_PATH"

wait_for_settings() {
  local last_response=''
  for attempt in $(seq 1 80); do
    if last_response="$(curl -fsS "$BASE_URL/health/ready" 2>/dev/null)"; then
      LAST_RESPONSE="$last_response"
      return 0
    fi
    sleep 0.25
  done

  LAST_RESPONSE="$last_response"
  return 1
}

pick_available_port() {
  local start_port="$1"
  python3 - "$start_port" <<'PY'
import socket
import sys

start = int(sys.argv[1])
max_base_port = 65535 - 1000
scan_width = 200
fallback_starts = (18080, 28080, 38080, 48080, 58080, 10240)


def can_bind(family: int, host: str, port: int) -> bool:
    try:
        sock = socket.socket(family, socket.SOCK_STREAM)
    except OSError:
        return False

    with sock:
        if family == socket.AF_INET6:
            try:
                sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            except (AttributeError, OSError):
                pass
        try:
            sock.bind((host, port))
        except OSError:
            return False
        return True


CHECKS = [
    (socket.AF_INET, "127.0.0.1"),
    (socket.AF_INET, "0.0.0.0"),
]
if socket.has_ipv6:
    CHECKS.extend(
        [
            (socket.AF_INET6, "::1"),
            (socket.AF_INET6, "::"),
        ]
    )


search_starts = []
for candidate_start in (start, *fallback_starts):
    if candidate_start < 1024 or candidate_start > max_base_port:
        continue
    if candidate_start in search_starts:
        continue
    search_starts.append(candidate_start)

for base_start in search_starts:
    for candidate in range(base_start, min(base_start + scan_width, max_base_port + 1)):
        required_ports = (candidate, candidate + 1, candidate + 1000)
        if all(all(can_bind(family, host, port) for family, host in CHECKS) for port in required_ports):
            print(candidate)
            raise SystemExit(0)
raise SystemExit(1)
PY
}

configure_backend_endpoint() {
  if [[ "$USE_RUNNING_BACKEND" == 'true' ]]; then
    return 0
  fi

  if wait_for_settings; then
    local original_base_url="$BASE_URL"
    local isolated_port
    isolated_port="$(pick_available_port "$((PORT_VALUE + 2))")" || fail "could not find a free port for isolated issue-seed verification"
    PORT_VALUE="$isolated_port"
    if [[ -z "${MESHER_WS_PORT:-}" ]]; then
      WS_PORT_VALUE="$((isolated_port + 1))"
    fi
    if [[ -z "${MESH_CLUSTER_PORT:-}" ]]; then
      CLUSTER_PORT_VALUE="$((isolated_port + 1000))"
    fi
    BASE_URL="http://127.0.0.1:${PORT_VALUE}"
    LAST_RESPONSE=''
    printf '[seed-live-issue] ignoring existing backend at %s; starting isolated verification backend at %s\n' "$original_base_url" "$BASE_URL" >&2
  fi
}

start_backend() {
  mesher_require_database_url

  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  rm -f "$LOG_FILE" "$SETTINGS_RESPONSE_PATH"

  printf '[seed-live-issue] applying migrations and auth fixtures before launch\n' >&2
  DATABASE_URL="$DATABASE_URL" bash "$SCRIPT_DIR/migrate.sh" up
  DATABASE_URL="$DATABASE_URL" MESHER_E2E_SESSION_TOKEN="$E2E_SESSION_TOKEN" bash "$SCRIPT_DIR/seed-e2e-auth.sh"

  printf '[seed-live-issue] building Mesher into %s\n' "$BUILD_DIR" >&2
  bash "$SCRIPT_DIR/build.sh" "$BUILD_DIR"

  printf '[seed-live-issue] starting temporary Mesher base_url=%s\n' "$BASE_URL" >&2
  (
    cd "$BUILD_DIR"
    exec env \
      DATABASE_URL="$DATABASE_URL" \
      PORT="$PORT_VALUE" \
      MESHER_WS_PORT="$WS_PORT_VALUE" \
      MESHER_RATE_LIMIT_WINDOW_SECONDS="${MESHER_RATE_LIMIT_WINDOW_SECONDS:-60}" \
      MESHER_RATE_LIMIT_MAX_EVENTS="${MESHER_RATE_LIMIT_MAX_EVENTS:-1000}" \
      MESH_CLUSTER_COOKIE="${MESH_CLUSTER_COOKIE:-dev-cookie}" \
      MESH_NODE_NAME="${MESH_NODE_NAME:-mesher@127.0.0.1:${CLUSTER_PORT_VALUE}}" \
      MESH_DISCOVERY_SEED="${MESH_DISCOVERY_SEED:-localhost}" \
      MESH_CLUSTER_PORT="${CLUSTER_PORT_VALUE}" \
      MESH_CONTINUITY_ROLE="${MESH_CONTINUITY_ROLE:-primary}" \
      MESH_CONTINUITY_PROMOTION_EPOCH="${MESH_CONTINUITY_PROMOTION_EPOCH:-0}" \
      "$BINARY_PATH" >"$LOG_FILE" 2>&1
  ) &
  SERVER_PID=$!
  STARTED_SERVER='true'

  if ! wait_for_settings; then
    printf '%s\n' "$LAST_RESPONSE" >"$SETTINGS_RESPONSE_PATH"
    fail "/api/v1/projects/default/settings never became ready at $BASE_URL (last response: $SETTINGS_RESPONSE_PATH)"
  fi
}

ensure_backend() {
  configure_backend_endpoint

  if [[ "$USE_RUNNING_BACKEND" == 'true' ]] && wait_for_settings; then
    printf '[seed-live-issue] reusing running Mesher at %s\n' "$BASE_URL" >&2
    return 0
  fi

  start_backend
}

build_seed_payload() {
  local title="$1"
  local fingerprint="$2"
  local stack_file="$3"
  local breadcrumb_message="$4"
  local tag_value="$5"
  local surface="$6"

  python3 - "$title" "$fingerprint" "$stack_file" "$breadcrumb_message" "$tag_value" "$surface" <<'PY'
import json
import sys

title, fingerprint, stack_file, breadcrumb_message, tag_value, surface = sys.argv[1:7]
payload = {
    "message": title,
    "level": "error",
    "fingerprint": fingerprint,
    "stacktrace": [
        {
            "filename": stack_file,
            "function_name": "seedLiveIssueSeam",
            "lineno": 42,
            "colno": 7,
            "context_line": f"throw new Error({title!r})",
            "in_app": True,
        }
    ],
    "breadcrumbs": [
        {
            "timestamp": "2026-04-11T12:00:00.000Z",
            "category": "seed",
            "message": breadcrumb_message,
            "level": "error",
            "data": "{}",
        }
    ],
    "tags": json.dumps(
        {
            "environment": "seeded-local",
            "seed_case": tag_value,
            "surface": "issues-dashboard",
        },
        separators=(",", ":"),
    ),
    "extra": json.dumps(
        {
            "seeded_by": "mesher/scripts/seed-live-issue.sh",
            "surface": surface,
        },
        separators=(",", ":"),
    ),
    "user_context": json.dumps(
        {
            "id": "seed-user",
            "username": "seeded-reader",
        },
        separators=(",", ":"),
    ),
    "sdk_name": "mesher-seed-script",
    "sdk_version": "1.0.0",
}
print(json.dumps(payload, separators=(",", ":")))
PY
}

find_issue_snapshot() {
  local title="$1"
  python3 -c '
import json
import sys

title = sys.argv[1]
payload = json.load(sys.stdin)
for issue in payload.get("data", []):
    if issue.get("title") != title:
        continue
    issue_id = issue.get("id")
    status = issue.get("status")
    if isinstance(issue_id, str) and issue_id and isinstance(status, str) and status:
        print(f"{issue_id}\t{status}")
        raise SystemExit(0)
raise SystemExit(1)
' "$title"
}

find_latest_event_id() {
  python3 -c '
import json
import sys
payload = json.load(sys.stdin)
data = payload.get("data", [])
if not data:
    raise SystemExit(1)
first = data[0]
event_id = first.get("id")
if not isinstance(event_id, str) or not event_id:
    raise SystemExit(1)
print(event_id)
'
}

lookup_issue_across_statuses() {
  local title="$1"
  local status=''
  local response=''
  local issue_snapshot=''

  for status in unresolved resolved archived; do
    response="$(curl -fsS -H "$AUTHORIZATION_HEADER" "$BASE_URL/api/v1/projects/default/issues?status=$status")"
    issue_snapshot="$(printf '%s' "$response" | find_issue_snapshot "$title" || true)"
    if [[ -n "$issue_snapshot" ]]; then
      printf '%s\n' "$issue_snapshot"
      return 0
    fi
  done

  return 1
}

latest_event_id_for_issue() {
  local issue_id="$1"
  local events_response=''
  local event_id=''

  for attempt in $(seq 1 40); do
    if events_response="$(curl -fsS -H "$AUTHORIZATION_HEADER" "$BASE_URL/api/v1/issues/$issue_id/events?limit=1")"; then
      event_id="$(printf '%s' "$events_response" | find_latest_event_id || true)"
      if [[ -n "$event_id" ]]; then
        printf '%s\n' "$event_id"
        return 0
      fi
    fi
    sleep 0.25
  done

  return 1
}

reset_issue_to_open() {
  local case_name="$1"
  local issue_id="$2"
  local issue_status="$3"

  if [[ "$issue_status" == 'unresolved' ]]; then
    return 0
  fi

  printf '[seed-live-issue] resetting %s issue_id=%s from status=%s to unresolved\n' "$case_name" "$issue_id" "$issue_status" >&2
  local action_response
  action_response="$(curl -fsS -H "$AUTHORIZATION_HEADER" -X POST "$BASE_URL/api/v1/issues/$issue_id/unresolve")"
  local action_status
  action_status="$(printf '%s' "$action_response" | json_field status || true)"
  case "$action_status" in
    accepted|ok)
      ;;
    *)
      fail "$case_name reset returned an unexpected response"
      ;;
  esac

  for attempt in $(seq 1 40); do
    local current_snapshot=''
    current_snapshot="$(lookup_issue_across_statuses "$4" || true)"
    if [[ -n "$current_snapshot" ]]; then
      local current_issue_id="${current_snapshot%%$'\t'*}"
      local current_status="${current_snapshot#*$'\t'}"
      if [[ "$current_issue_id" == "$issue_id" ]] && [[ "$current_status" == 'unresolved' ]]; then
        return 0
      fi
    fi
    sleep 0.25
  done

  fail "$case_name issue did not return to unresolved after reset"
}

verify_detail_and_timeline() {
  local case_name="$1"
  local issue_id="$2"
  local event_id="$3"
  local expected_title="$4"
  local expected_stack_file="$5"

  printf '[seed-live-issue] verifying %s detail and timeline for issue_id=%s event_id=%s\n' "$case_name" "$issue_id" "$event_id" >&2
  local detail_response
  detail_response="$(curl -fsS -H "$AUTHORIZATION_HEADER" "$BASE_URL/api/v1/events/$event_id")"
  local detail_message
  detail_message="$(printf '%s' "$detail_response" | json_field event.message || true)"
  local detail_stack_file
  detail_stack_file="$(printf '%s' "$detail_response" | python3 -c 'import json,sys
payload=json.load(sys.stdin)
frames=payload.get("event",{}).get("stacktrace") or []
if frames and isinstance(frames, list):
    first=frames[0]
    if isinstance(first, dict) and isinstance(first.get("filename"), str):
        print(first["filename"])
        raise SystemExit(0)
raise SystemExit(1)
' || true)"
  if [[ "$detail_message" != "$expected_title" ]]; then
    fail "$case_name seeded event detail did not round-trip the expected message"
  fi
  if [[ "$detail_stack_file" != "$expected_stack_file" ]]; then
    fail "$case_name seeded event detail did not round-trip the expected stacktrace"
  fi

  local timeline_response
  timeline_response="$(curl -fsS -H "$AUTHORIZATION_HEADER" "$BASE_URL/api/v1/issues/$issue_id/timeline")"
  local timeline_count
  timeline_count="$(printf '%s' "$timeline_response" | python3 -c 'import json,sys
payload=json.load(sys.stdin)
if not isinstance(payload, list):
    raise SystemExit(1)
print(len(payload))
')"
  if [[ -z "$timeline_count" || "$timeline_count" -lt 1 ]]; then
    fail "$case_name seeded issue timeline did not return any entries"
  fi

  printf '%s\n' "$timeline_count"
}

seed_case() {
  local case_name="$1"
  local title="$2"
  local fingerprint="$3"
  local tag_value="$4"
  local stack_file="$5"
  local breadcrumb_message="$6"
  local surface="$7"

  printf '[seed-live-issue] posting %s deterministic seed event\n' "$case_name" >&2
  local seed_payload
  seed_payload="$(build_seed_payload "$title" "$fingerprint" "$stack_file" "$breadcrumb_message" "$tag_value" "$surface")"
  local seed_response
  seed_response="$(curl -fsS \
    -X POST \
    "$BASE_URL/api/v1/events" \
    -H 'Content-Type: application/json' \
    -H "x-sentry-auth: $API_KEY" \
    -d "$seed_payload")"

  local seed_status
  seed_status="$(printf '%s' "$seed_response" | json_field status || true)"
  case "$seed_status" in
    accepted|ok)
      ;;
    *)
      fail "$case_name seed event ingest returned an unexpected response"
      ;;
  esac

  printf '[seed-live-issue] locating %s seeded issue row\n' "$case_name" >&2
  local issue_snapshot=''
  local issue_id=''
  local issue_status=''
  for attempt in $(seq 1 40); do
    issue_snapshot="$(lookup_issue_across_statuses "$title" || true)"
    if [[ -n "$issue_snapshot" ]]; then
      issue_id="${issue_snapshot%%$'\t'*}"
      issue_status="${issue_snapshot#*$'\t'}"
      break
    fi
    sleep 0.25
    if [[ "$attempt" == '40' ]]; then
      fail "$case_name seeded issue did not appear in /api/v1/projects/default/issues"
    fi
  done

  reset_issue_to_open "$case_name" "$issue_id" "$issue_status" "$title"

  printf '[seed-live-issue] locating latest %s event for issue_id=%s\n' "$case_name" "$issue_id" >&2
  local event_id=''
  event_id="$(latest_event_id_for_issue "$issue_id" || true)"
  if [[ -z "$event_id" ]]; then
    fail "$case_name seeded issue events did not appear in /api/v1/issues/$issue_id/events?limit=1"
  fi

  local timeline_count=''
  timeline_count="$(verify_detail_and_timeline "$case_name" "$issue_id" "$event_id" "$title" "$stack_file")"

  printf '[seed-live-issue] %s seeded issue_id=%s event_id=%s timeline_count=%s base_url=%s\n' "$case_name" "$issue_id" "$event_id" "$timeline_count" "$BASE_URL" >&2
  printf '%s\t%s\t%s\n' "$issue_id" "$event_id" "$timeline_count"
}

ensure_backend

read_result="$(seed_case "$READ_CASE_NAME" "$READ_TITLE" "$READ_FINGERPRINT" "$READ_TAG_VALUE" "$READ_STACK_FILE" "$READ_BREADCRUMB_MESSAGE" "$READ_SURFACE")"
action_result="$(seed_case "$ACTION_CASE_NAME" "$ACTION_TITLE" "$ACTION_FINGERPRINT" "$ACTION_TAG_VALUE" "$ACTION_STACK_FILE" "$ACTION_BREADCRUMB_MESSAGE" "$ACTION_SURFACE")"

read_issue_id="${read_result%%$'\t'*}"
read_rest="${read_result#*$'\t'}"
read_event_id="${read_rest%%$'\t'*}"
read_timeline_count="${read_rest##*$'\t'}"

action_issue_id="${action_result%%$'\t'*}"
action_rest="${action_result#*$'\t'}"
action_event_id="${action_rest%%$'\t'*}"
action_timeline_count="${action_rest##*$'\t'}"

printf '{"read":{"issueId":"%s","eventId":"%s","timelineCount":%s,"title":"%s","tag":"%s:%s"},"action":{"issueId":"%s","eventId":"%s","timelineCount":%s,"title":"%s","tag":"%s:%s"},"baseUrl":"%s"}\n' \
  "$read_issue_id" \
  "$read_event_id" \
  "$read_timeline_count" \
  "$READ_TITLE" \
  "$SEED_TAG_KEY" \
  "$READ_TAG_VALUE" \
  "$action_issue_id" \
  "$action_event_id" \
  "$action_timeline_count" \
  "$ACTION_TITLE" \
  "$SEED_TAG_KEY" \
  "$ACTION_TAG_VALUE" \
  "$BASE_URL"
