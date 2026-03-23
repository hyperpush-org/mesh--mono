#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-18080}"
JOB_POLL_MS="${JOB_POLL_MS:-500}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
LOG_FILE="$(mktemp -t reference-backend-smoke.XXXXXX.log)"
SERVER_PID=""

: "${DATABASE_URL:?set DATABASE_URL}"

cleanup() {
  local status=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ $status -ne 0 ]]; then
    echo "[smoke] failure; tailing server log from $LOG_FILE" >&2
    tail -n 200 "$LOG_FILE" >&2 || true
  else
    rm -f "$LOG_FILE"
  fi
}
trap cleanup EXIT

if [[ "$(psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.jobs') IS NOT NULL")" != "t" ]]; then
  echo "[smoke] jobs table is missing; run either: cargo run -p meshc -- migrate reference-backend up OR bash reference-backend/scripts/apply-deploy-migrations.sh reference-backend/deploy/reference-backend.up.sql" >&2
  exit 1
fi

echo "[smoke] building reference-backend"
(
  cd "$ROOT"
  cargo run -p meshc -- build reference-backend
)

echo "[smoke] starting reference-backend on :$PORT"
(
  cd "$ROOT"
  PORT="$PORT" JOB_POLL_MS="$JOB_POLL_MS" DATABASE_URL="$DATABASE_URL" ./reference-backend/reference-backend >"$LOG_FILE" 2>&1
) &
SERVER_PID=$!

echo "[smoke] probing running instance via deploy-smoke.sh"
BASE_URL="$BASE_URL" PORT="$PORT" bash "$ROOT/reference-backend/scripts/deploy-smoke.sh"
