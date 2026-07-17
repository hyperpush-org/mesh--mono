#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mesher/scripts/lib/mesh-toolchain.sh
source "$SCRIPT_DIR/lib/mesh-toolchain.sh"

PORT_VALUE="${PORT:-18180}"
WS_PORT_VALUE="${MESHER_WS_PORT:-18181}"
CLUSTER_PORT_VALUE="${MESH_CLUSTER_PORT:-19180}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT_VALUE}}"
USE_RUNNING_BACKEND="${MESHER_REUSE_RUNNING_BACKEND:-false}"
LOCAL_DATABASE_URL_DEFAULT='postgres://postgres:postgres@127.0.0.1:5432/mesher'
DATABASE_URL_VALUE="${DATABASE_URL:-$LOCAL_DATABASE_URL_DEFAULT}"
ARTIFACT_DIR="${MESHER_SEED_ARTIFACT_DIR:-$MESHER_PACKAGE_DIR/../.tmp/m060-s03/seed-live-admin-ops}"
BUILD_DIR="$ARTIFACT_DIR/build"
BINARY_PATH="$BUILD_DIR/mesher"
LOG_FILE="$ARTIFACT_DIR/mesher.log"
STARTED_SERVER='false'
SERVER_PID=''
E2E_SESSION_TOKEN="${MESHER_E2E_SESSION_TOKEN:-hyperpush-e2e-session-token-0000000000000000000000000000}"

readonly DEFAULT_ORG_SLUG='default'
readonly DEFAULT_PROJECT_SLUG='default'
readonly OWNER_USER_ID='11111111-1111-4111-8111-111111111111'
readonly ADMIN_USER_ID='22222222-2222-4222-8222-222222222222'
readonly CANDIDATE_USER_ID='33333333-3333-4333-8333-333333333333'
readonly OWNER_MEMBERSHIP_ID='44444444-4444-4444-8444-444444444444'
readonly ADMIN_MEMBERSHIP_ID='55555555-5555-4555-8555-555555555555'
readonly SEEDED_API_KEY_ID='66666666-6666-4666-8666-666666666666'
readonly SEEDED_ALERT_RULE_ID='77777777-7777-4777-8777-777777777777'
readonly SEEDED_ALERT_ID='88888888-8888-4888-8888-888888888888'
readonly OWNER_EMAIL='seed-owner@hyperpush.dev'
readonly ADMIN_EMAIL='seed-admin@hyperpush.dev'
readonly CANDIDATE_EMAIL='seed-candidate@hyperpush.dev'
readonly OWNER_NAME='Seed Owner'
readonly ADMIN_NAME='Seed Admin'
readonly CANDIDATE_NAME='Seed Candidate'
readonly SEEDED_API_KEY_LABEL='M060 seeded admin ops key'
readonly SEEDED_API_KEY_VALUE='mshr_seedadminopskey000000000000000000000000000'
readonly SEEDED_RULE_NAME='M060 seeded admin ops rule'
readonly SEEDED_ALERT_MESSAGE='M060 seeded admin ops alert'

usage() {
  echo 'usage: bash mesher/scripts/seed-live-admin-ops.sh' >&2
}

fail() {
  echo "[seed-live-admin-ops] $1" >&2
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
    echo "[seed-live-admin-ops] failure; tailing server log from $LOG_FILE" >&2
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
mesher_require_command psql
mesher_require_command python3

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

wait_for_settings() {
  for _attempt in $(seq 1 80); do
    if curl -fsS "$BASE_URL/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

pick_available_port() {
  local start_port="$1"
  python3 - "$start_port" <<'PY'
import socket
import sys

start = int(sys.argv[1])
max_base_port = 65535 - 1000


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

if start > max_base_port:
    raise SystemExit(1)

for candidate in range(start, min(start + 200, max_base_port + 1)):
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
    isolated_port="$(pick_available_port "$((PORT_VALUE + 2))")" || fail "could not find a free port for isolated seed verification"
    PORT_VALUE="$isolated_port"
    if [[ -z "${MESHER_WS_PORT:-}" ]]; then
      WS_PORT_VALUE="$((isolated_port + 1))"
    fi
    if [[ -z "${MESH_CLUSTER_PORT:-}" ]]; then
      CLUSTER_PORT_VALUE="$((isolated_port + 1000))"
    fi
    BASE_URL="http://127.0.0.1:${PORT_VALUE}"
    printf '[seed-live-admin-ops] ignoring existing backend at %s; starting isolated verification backend at %s\n' "$original_base_url" "$BASE_URL" >&2
  fi
}

start_backend() {
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  rm -f "$LOG_FILE"

  printf '[seed-live-admin-ops] applying Mesher migrations before launch\n' >&2
  DATABASE_URL="$DATABASE_URL_VALUE" bash "$SCRIPT_DIR/migrate.sh" up
  DATABASE_URL="$DATABASE_URL_VALUE" MESHER_E2E_SESSION_TOKEN="$E2E_SESSION_TOKEN" bash "$SCRIPT_DIR/seed-e2e-auth.sh"

  printf '[seed-live-admin-ops] building Mesher into %s\n' "$BUILD_DIR" >&2
  bash "$SCRIPT_DIR/build.sh" "$BUILD_DIR"

  printf '[seed-live-admin-ops] starting temporary Mesher base_url=%s\n' "$BASE_URL" >&2
  (
    cd "$BUILD_DIR"
    exec env \
      DATABASE_URL="$DATABASE_URL_VALUE" \
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
    fail "/api/v1/projects/default/settings never became ready at $BASE_URL"
  fi
}

ensure_backend() {
  if [[ "$USE_RUNNING_BACKEND" == 'true' ]] && wait_for_settings; then
    printf '[seed-live-admin-ops] reusing running Mesher at %s\n' "$BASE_URL" >&2
    return 0
  fi

  start_backend
}

psql_scalar() {
  local sql="$1"
  psql "$DATABASE_URL_VALUE" -Atqc "$sql"
}

seed_database_team_and_static_fixtures() {
  local org_id project_id
  org_id="$(psql_scalar "SELECT id::text FROM organizations WHERE slug = '${DEFAULT_ORG_SLUG}'")"
  project_id="$(psql_scalar "SELECT id::text FROM projects WHERE slug = '${DEFAULT_PROJECT_SLUG}'")"

  if [[ -z "$org_id" ]]; then
    fail "default organization slug ${DEFAULT_ORG_SLUG} is missing"
  fi

  if [[ -z "$project_id" ]]; then
    fail "default project slug ${DEFAULT_PROJECT_SLUG} is missing"
  fi

  PGPASSWORD="${PGPASSWORD:-}" psql "$DATABASE_URL_VALUE" -v ON_ERROR_STOP=1 <<SQL >/dev/null
DELETE FROM org_memberships
WHERE user_id IN (
  '${OWNER_USER_ID}'::uuid,
  '${ADMIN_USER_ID}'::uuid,
  '${CANDIDATE_USER_ID}'::uuid
);

DELETE FROM users
WHERE email IN (
  '${OWNER_EMAIL}',
  '${ADMIN_EMAIL}',
  '${CANDIDATE_EMAIL}'
);

INSERT INTO users (id, email, password_hash, display_name)
VALUES
  ('${OWNER_USER_ID}'::uuid, '${OWNER_EMAIL}', crypt('seed-password', gen_salt('bf', 12)), '${OWNER_NAME}'),
  ('${ADMIN_USER_ID}'::uuid, '${ADMIN_EMAIL}', crypt('seed-password', gen_salt('bf', 12)), '${ADMIN_NAME}'),
  ('${CANDIDATE_USER_ID}'::uuid, '${CANDIDATE_EMAIL}', crypt('seed-password', gen_salt('bf', 12)), '${CANDIDATE_NAME}');

INSERT INTO org_memberships (id, user_id, org_id, role)
VALUES
  ('${OWNER_MEMBERSHIP_ID}'::uuid, '${OWNER_USER_ID}'::uuid, '${org_id}'::uuid, 'owner'),
  ('${ADMIN_MEMBERSHIP_ID}'::uuid, '${ADMIN_USER_ID}'::uuid, '${org_id}'::uuid, 'admin');

INSERT INTO sessions (token, user_id, expires_at)
VALUES ('${E2E_SESSION_TOKEN}', '${OWNER_USER_ID}'::uuid, now() + interval '24 hours')
ON CONFLICT (token) DO UPDATE
SET user_id = EXCLUDED.user_id,
    created_at = now(),
    expires_at = EXCLUDED.expires_at;

DELETE FROM api_keys WHERE label = '${SEEDED_API_KEY_LABEL}' AND id != '${SEEDED_API_KEY_ID}'::uuid;
INSERT INTO api_keys (id, project_id, key_prefix, key_hash, label, revoked_at)
VALUES ('${SEEDED_API_KEY_ID}'::uuid, '${project_id}'::uuid, left('${SEEDED_API_KEY_VALUE}', 13), crypt('${SEEDED_API_KEY_VALUE}', gen_salt('bf', 12)), '${SEEDED_API_KEY_LABEL}', NULL)
ON CONFLICT (id) DO UPDATE
SET project_id = EXCLUDED.project_id,
    key_prefix = EXCLUDED.key_prefix,
    key_hash = EXCLUDED.key_hash,
    label = EXCLUDED.label,
    revoked_at = NULL;

INSERT INTO alert_rules (id, project_id, name, condition_json, action_json, enabled, cooldown_minutes, last_fired_at)
VALUES (
  '${SEEDED_ALERT_RULE_ID}'::uuid,
  '${project_id}'::uuid,
  '${SEEDED_RULE_NAME}',
  '{"condition_type":"new_issue","severity":"medium"}'::jsonb,
  '{"type":"email"}'::jsonb,
  true,
  1,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET project_id = EXCLUDED.project_id,
    name = EXCLUDED.name,
    condition_json = EXCLUDED.condition_json,
    action_json = EXCLUDED.action_json,
    enabled = true,
    cooldown_minutes = EXCLUDED.cooldown_minutes,
    last_fired_at = NULL;

INSERT INTO alerts (id, rule_id, project_id, status, message, condition_snapshot, acknowledged_at, resolved_at)
VALUES (
  '${SEEDED_ALERT_ID}'::uuid,
  '${SEEDED_ALERT_RULE_ID}'::uuid,
  '${project_id}'::uuid,
  'active',
  '${SEEDED_ALERT_MESSAGE}',
  '{"condition_type":"new_issue","severity":"medium","seed_case":"m060-admin-ops"}'::jsonb,
  NULL,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET rule_id = EXCLUDED.rule_id,
    project_id = EXCLUDED.project_id,
    status = 'active',
    message = EXCLUDED.message,
    condition_snapshot = EXCLUDED.condition_snapshot,
    acknowledged_at = NULL,
    resolved_at = NULL;
SQL
}

reset_live_settings() {
  local project_id
  project_id="$(psql_scalar "SELECT id::text FROM projects WHERE slug = '${DEFAULT_PROJECT_SLUG}'")"
  if [[ -z "$project_id" ]]; then
    fail "default project slug ${DEFAULT_PROJECT_SLUG} is missing while resetting settings"
  fi

  PGPASSWORD="${PGPASSWORD:-}" psql "$DATABASE_URL_VALUE" -v ON_ERROR_STOP=1 <<SQL >/dev/null
UPDATE projects
SET retention_days = 90,
    sample_rate = 1
WHERE id = '${project_id}'::uuid;
SQL
}

verify_readback_and_print() {
  local org_id project_id retention_days sample_rate member_count candidate_membership_count owner_present admin_present seeded_key_prefix seeded_rule_id seeded_alert_status
  org_id="$(psql_scalar "SELECT id::text FROM organizations WHERE slug = '${DEFAULT_ORG_SLUG}'")"
  project_id="$(psql_scalar "SELECT id::text FROM projects WHERE slug = '${DEFAULT_PROJECT_SLUG}'")"
  retention_days="$(psql_scalar "SELECT retention_days::text FROM projects WHERE id = '${project_id}'::uuid")"
  sample_rate="$(psql_scalar "SELECT sample_rate::text FROM projects WHERE id = '${project_id}'::uuid")"
  member_count="$(psql_scalar "SELECT count(*)::text FROM org_memberships WHERE org_id = '${org_id}'::uuid")"
  candidate_membership_count="$(psql_scalar "SELECT count(*)::text FROM org_memberships WHERE org_id = '${org_id}'::uuid AND user_id = '${CANDIDATE_USER_ID}'::uuid")"
  owner_present="$(psql_scalar "SELECT count(*)::text FROM org_memberships WHERE org_id = '${org_id}'::uuid AND user_id = '${OWNER_USER_ID}'::uuid")"
  admin_present="$(psql_scalar "SELECT count(*)::text FROM org_memberships WHERE org_id = '${org_id}'::uuid AND user_id = '${ADMIN_USER_ID}'::uuid")"
  seeded_key_prefix="$(psql_scalar "SELECT key_prefix FROM api_keys WHERE id = '${SEEDED_API_KEY_ID}'::uuid AND label = '${SEEDED_API_KEY_LABEL}' AND revoked_at IS NULL")"
  seeded_rule_id="$(psql_scalar "SELECT id::text FROM alert_rules WHERE id = '${SEEDED_ALERT_RULE_ID}'::uuid AND name = '${SEEDED_RULE_NAME}'")"
  seeded_alert_status="$(psql_scalar "SELECT status FROM alerts WHERE id = '${SEEDED_ALERT_ID}'::uuid AND rule_id = '${SEEDED_ALERT_RULE_ID}'::uuid")"

  python3 - "$retention_days" "$sample_rate" "$member_count" "$candidate_membership_count" "$owner_present" "$admin_present" "$seeded_key_prefix" "$seeded_rule_id" "$seeded_alert_status" "$OWNER_USER_ID" "$ADMIN_USER_ID" "$CANDIDATE_USER_ID" "$SEEDED_API_KEY_LABEL" "$SEEDED_RULE_NAME" "$SEEDED_ALERT_ID" <<'PY'
import json
import sys

(
    retention_days,
    sample_rate,
    member_count,
    candidate_membership_count,
    owner_present,
    admin_present,
    seeded_key_prefix,
    seeded_rule_id,
    seeded_alert_status,
    owner_user_id,
    admin_user_id,
    candidate_user_id,
    api_key_label,
    rule_name,
    alert_id,
) = sys.argv[1:16]

if retention_days != '90':
    raise SystemExit('expected retention_days=90 in seeded project row')
if sample_rate not in {'1', '1.0'}:
    raise SystemExit('expected sample_rate=1 in seeded project row')
if owner_present != '1' or admin_present != '1':
    raise SystemExit('expected seeded owner/admin memberships in org_memberships')
if candidate_membership_count != '0':
    raise SystemExit('candidate user_id must stay available for add-member proof')
if not seeded_key_prefix:
    raise SystemExit('expected seeded active API key row in api_keys')
if not seeded_rule_id:
    raise SystemExit('expected seeded alert rule row in alert_rules')
if seeded_alert_status != 'active':
    raise SystemExit('expected seeded alert row with active status in alerts')

masked_key = f"{seeded_key_prefix}••••"

print(json.dumps({
    'databaseUrl': 'configured',
    'settings': {
        'retentionDays': int(float(retention_days)),
        'sampleRate': float(sample_rate),
    },
    'team': {
        'orgSlug': 'default',
        'memberCount': int(member_count),
        'ownerUserId': owner_user_id,
        'adminUserId': admin_user_id,
        'candidateUserId': candidate_user_id,
    },
    'apiKeys': {
        'seededLabel': api_key_label,
        'maskedValue': masked_key,
    },
    'alerts': {
        'ruleId': seeded_rule_id,
        'ruleName': rule_name,
        'alertId': alert_id,
        'status': seeded_alert_status,
    },
}, separators=(',', ':')))
PY
}

seed_database_team_and_static_fixtures
reset_live_settings
verify_readback_and_print
