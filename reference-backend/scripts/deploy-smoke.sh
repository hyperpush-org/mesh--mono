#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PORT="18080"
PORT_VALUE="${PORT:-$DEFAULT_PORT}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT_VALUE}}"
LAST_RESPONSE=""

if [[ $# -ne 0 ]]; then
  echo "usage: bash deploy-smoke.sh" >&2
  exit 1
fi

for required_command in curl python3; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "[deploy-smoke] required command missing from PATH: $required_command" >&2
    exit 1
  fi
done

json_field() {
  local field="$1"
  python3 -c '
import json
import sys

field = sys.argv[1]
data = json.load(sys.stdin)
value = data.get(field)
if value is None:
    sys.exit(1)
if isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":")))
else:
    print(value)
' "$field"
}

read_processed_at() {
  python3 -c '
import json
import sys

value = json.load(sys.stdin).get("processed_at")
print("" if value is None else value)
'
}

printf '[deploy-smoke] waiting for health base_url=%s\n' "$BASE_URL"
for attempt in $(seq 1 80); do
  if health_response="$(curl -fsS "$BASE_URL/health" 2>/dev/null)"; then
    printf '[deploy-smoke] health ready body=%s\n' "$health_response"
    break
  fi
  sleep 0.25
  if [[ "$attempt" == "80" ]]; then
    echo "[deploy-smoke] /health never became ready at $BASE_URL" >&2
    exit 1
  fi
done

payload='{"kind":"deploy-smoke","attempt":1,"source":"deploy-smoke.sh"}'
printf '[deploy-smoke] creating job via POST %s/jobs\n' "$BASE_URL"
create_response="$(curl -fsS -X POST "$BASE_URL/jobs" -H 'content-type: application/json' -d "$payload")"
printf '[deploy-smoke] created job body=%s\n' "$create_response"
JOB_ID="$(printf '%s' "$create_response" | json_field id)"

if [[ -z "$JOB_ID" ]]; then
  echo "[deploy-smoke] created job response did not include id" >&2
  exit 1
fi

printf '[deploy-smoke] polling job id=%s\n' "$JOB_ID"
for attempt in $(seq 1 80); do
  LAST_RESPONSE="$(curl -fsS "$BASE_URL/jobs/$JOB_ID")"
  job_status="$(printf '%s' "$LAST_RESPONSE" | json_field status)"
  processed_at="$(printf '%s' "$LAST_RESPONSE" | read_processed_at)"
  printf '[deploy-smoke] poll=%s status=%s processed_at=%s\n' "$attempt" "$job_status" "${processed_at:-null}"
  if [[ "$job_status" == "processed" && -n "$processed_at" ]]; then
    attempts="$(printf '%s' "$LAST_RESPONSE" | json_field attempts)"
    printf '[deploy-smoke] processed job id=%s attempts=%s\n' "$JOB_ID" "$attempts"
    printf '%s\n' "$LAST_RESPONSE"
    exit 0
  fi
  sleep 0.25
done

echo "[deploy-smoke] job $JOB_ID never reached processed state" >&2
echo "[deploy-smoke] final response: ${LAST_RESPONSE:-<none>}" >&2
exit 1
