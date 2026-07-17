#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_ROOT="$ROOT_DIR/mesher/client"
LANDING_ROOT="$ROOT_DIR/mesher/landing"
VERIFY_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hyperpush-platform-verify.XXXXXX")"
PG_DATA_DIR="$VERIFY_TMP_DIR/postgres"
BUILD_DIR="$VERIFY_TMP_DIR/mesher-build"
PG_LOG="$VERIFY_TMP_DIR/postgres.log"
PG_STARTED=false

readonly ROOT_DIR CLIENT_ROOT LANDING_ROOT VERIFY_TMP_DIR PG_DATA_DIR BUILD_DIR PG_LOG

find_pg_bindir() {
  local candidate
  if command -v postgres >/dev/null 2>&1; then
    dirname "$(command -v postgres)"
    return
  fi
  if command -v pg_config >/dev/null 2>&1; then
    candidate="$(pg_config --bindir)"
    if [[ -x "$candidate/postgres" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  fi

  if command -v brew >/dev/null 2>&1; then
    local formula
    for formula in postgresql@18 postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
      candidate="$(brew --prefix "$formula" 2>/dev/null || true)/bin"
      if [[ -x "$candidate/postgres" ]]; then
        printf '%s\n' "$candidate"
        return
      fi
    done
  fi

  for candidate in /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /usr/lib/postgresql/*/bin; do
    if [[ -x "$candidate/postgres" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  printf 'verify-platform: PostgreSQL server toolchain not found (postgres/initdb/pg_ctl/createdb)\n' >&2
  exit 1
}

PG_BIN_DIR="$(find_pg_bindir)"
INITDB="$PG_BIN_DIR/initdb"
PG_CTL="$PG_BIN_DIR/pg_ctl"
CREATEDB="$PG_BIN_DIR/createdb"
for required_binary in "$INITDB" "$PG_CTL" "$CREATEDB"; do
  if [[ ! -x "$required_binary" ]]; then
    printf 'verify-platform: incomplete PostgreSQL toolchain: %s is not executable\n' "$required_binary" >&2
    exit 1
  fi
done
readonly PG_BIN_DIR INITDB PG_CTL CREATEDB

cleanup() {
  local status=$?
  if [[ "$PG_STARTED" == true ]]; then
    "$PG_CTL" -D "$PG_DATA_DIR" -m fast -w stop >/dev/null 2>&1 || true
  fi
  case "$VERIFY_TMP_DIR" in
    "${TMPDIR:-/tmp}"/hyperpush-platform-verify.*) rm -rf -- "$VERIFY_TMP_DIR" ;;
    *) printf 'verify-platform: refusing to remove unexpected temp path: %s\n' "$VERIFY_TMP_DIR" >&2 ;;
  esac
  exit "$status"
}
trap cleanup EXIT INT TERM

read -r PG_PORT BACKEND_PORT WS_PORT < <(python3 - <<'PY'
import socket

ports = []
for _ in range(3):
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    ports.append(sock.getsockname()[1])
    sock.close()
print(*ports)
PY
)

printf 'verify-platform: initializing isolated PostgreSQL on port %s\n' "$PG_PORT"
"$INITDB" -D "$PG_DATA_DIR" -A trust --username=postgres >/dev/null
"$PG_CTL" -D "$PG_DATA_DIR" -l "$PG_LOG" -o "-h 127.0.0.1 -p $PG_PORT" -w start >/dev/null
PG_STARTED=true
"$CREATEDB" -h 127.0.0.1 -p "$PG_PORT" -U postgres mesher

export DATABASE_URL="postgres://postgres@127.0.0.1:${PG_PORT}/mesher"
export MESHER_BACKEND_ORIGIN="http://127.0.0.1:${BACKEND_PORT}"
export MESHER_WS_PORT="$WS_PORT"

cd "$ROOT_DIR"

printf 'verify-platform: installing locked frontend dependencies\n'
npm --prefix "$CLIENT_ROOT" ci
npm --prefix "$LANDING_ROOT" ci

printf 'verify-platform: running backend build, unit tests, and migrations\n'
bash mesher/scripts/test.sh
bash mesher/scripts/migrate.sh up
bash mesher/scripts/migrate.sh status
bash mesher/scripts/build.sh "$BUILD_DIR"

printf 'verify-platform: running dashboard release gates\n'
npm --prefix "$CLIENT_ROOT" run verify:route-inventory
npm --prefix "$CLIENT_ROOT" run typecheck
npm --prefix "$CLIENT_ROOT" run lint
npm --prefix "$CLIENT_ROOT" run build
npm --prefix "$CLIENT_ROOT" run budget
npm --prefix "$CLIENT_ROOT" run test:server
npm --prefix "$CLIENT_ROOT" audit --audit-level=low
npm --prefix "$CLIENT_ROOT" exec -- playwright install chromium
npm --prefix "$CLIENT_ROOT" run test:e2e

printf 'verify-platform: running landing release gates\n'
npm --prefix "$LANDING_ROOT" run typecheck
npm --prefix "$LANDING_ROOT" run lint
npm --prefix "$LANDING_ROOT" run build
npm --prefix "$LANDING_ROOT" run budget
npm --prefix "$LANDING_ROOT" audit --audit-level=low
npm --prefix "$LANDING_ROOT" exec -- playwright install chromium firefox webkit
npm --prefix "$LANDING_ROOT" run test:e2e

printf 'verify-platform: all gates passed\n'
