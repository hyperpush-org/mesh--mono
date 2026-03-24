#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_DIR=".tmp/m032-s01/verify"
mkdir -p "$ARTIFACT_DIR"

declare -a SERVER_PIDS=()

cleanup() {
  for pid in "${SERVER_PIDS[@]:-}"; do
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT

fail_with_log() {
  local command_text="$1"
  local reason="$2"
  local log_path="${3:-}"

  echo "verification drift: ${reason}" >&2
  echo "failing command: ${command_text}" >&2
  if [[ -n "$log_path" && -f "$log_path" ]]; then
    echo "--- ${log_path} ---" >&2
    sed -n '1,200p' "$log_path" >&2
  fi
  exit 1
}

run_expect_success() {
  local label="$1"
  shift
  local -a cmd=("$@")
  local log_path="$ARTIFACT_DIR/${label}.log"
  local command_text="${cmd[*]}"

  echo "==> ${command_text}"
  if ! "${cmd[@]}" >"$log_path" 2>&1; then
    fail_with_log "$command_text" "expected success" "$log_path"
  fi
}

run_expect_failure_contains() {
  local label="$1"
  local expected_substring="$2"
  shift 2
  local -a cmd=("$@")
  local log_path="$ARTIFACT_DIR/${label}.log"
  local command_text="${cmd[*]}"

  echo "==> ${command_text}"
  set +e
  "${cmd[@]}" >"$log_path" 2>&1
  local status=$?
  set -e

  if [[ $status -eq 0 ]]; then
    fail_with_log "$command_text" "expected failure but command succeeded" "$log_path"
  fi
  if ! grep -Fq "$expected_substring" "$log_path"; then
    fail_with_log "$command_text" "expected stderr to contain: ${expected_substring}" "$log_path"
  fi
}

run_binary_expect_exact() {
  local label="$1"
  local expected_output="$2"
  shift 2
  local -a cmd=("$@")
  local log_path="$ARTIFACT_DIR/${label}.log"
  local expected_path="$ARTIFACT_DIR/${label}.expected"
  local diff_path="$ARTIFACT_DIR/${label}.diff"
  local command_text="${cmd[*]}"

  echo "==> ${command_text}"
  if ! "${cmd[@]}" >"$log_path" 2>&1; then
    fail_with_log "$command_text" "command failed" "$log_path"
  fi

  printf '%s' "$expected_output" >"$expected_path"
  if ! diff -u "$expected_path" "$log_path" >"$diff_path"; then
    fail_with_log "$command_text" "stdout drifted" "$diff_path"
  fi
}

wait_for_server_ready() {
  local command_text="$1"
  local pid="$2"
  local log_path="$3"

  for _ in $(seq 1 100); do
    if grep -Fq "HTTP server listening on" "$log_path"; then
      return
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      fail_with_log "$command_text" "server exited before it reported readiness" "$log_path"
    fi
    sleep 0.1
  done

  fail_with_log "$command_text" "timed out waiting for HTTP server readiness" "$log_path"
}

start_server() {
  local label="$1"
  local binary_path="$2"
  local log_path="$ARTIFACT_DIR/${label}.server.log"
  local command_text="$binary_path"

  echo "==> ${command_text}" >&2
  "$binary_path" >"$log_path" 2>&1 &
  STARTED_SERVER_PID=$!
  disown "$STARTED_SERVER_PID" 2>/dev/null || true
  SERVER_PIDS+=("$STARTED_SERVER_PID")
  wait_for_server_ready "$command_text" "$STARTED_SERVER_PID" "$log_path"
}

# Supported folklore that should keep passing on the direct CLI path.
run_expect_success build_request_query cargo run -q -p meshc -- build .tmp/m032-s01/request_query
run_binary_expect_exact request_query $'request_query_ok\n' ./.tmp/m032-s01/request_query/request_query

run_expect_success build_xmod_from_json cargo run -q -p meshc -- build .tmp/m032-s01/xmod_from_json
run_binary_expect_exact xmod_from_json $'Scout 7\n' ./.tmp/m032-s01/xmod_from_json/xmod_from_json

run_expect_success build_service_call_case cargo run -q -p meshc -- build .tmp/m032-s01/service_call_case
run_binary_expect_exact service_call_case $'yes\nno\n' ./.tmp/m032-s01/service_call_case/service_call_case

run_expect_success build_cast_if_else cargo run -q -p meshc -- build .tmp/m032-s01/cast_if_else
run_binary_expect_exact cast_if_else $'1\n2\n' ./.tmp/m032-s01/cast_if_else/cast_if_else

# Retained build/runtime limits that must stay observable until their owning slices land.
run_expect_failure_contains nested_and "PHI node entries do not match predecessors!" \
  cargo run -q -p meshc -- build .tmp/m032-s01/nested_and

run_expect_success build_xmod_identity cargo run -q -p meshc -- build .tmp/m032-s01/xmod_identity
run_binary_expect_exact xmod_identity $'7\npoly\n' ./.tmp/m032-s01/xmod_identity/xmod_identity

run_expect_success build_timer_service_cast cargo run -q -p meshc -- build .tmp/m032-s01/timer_service_cast
run_binary_expect_exact timer_service_cast $'0\n' ./.tmp/m032-s01/timer_service_cast/timer_service_cast

# Route bare-function control must stay good.
run_expect_success build_route_bare_server cargo run -q -p meshc -- build .tmp/m032-s01/route_bare_server
start_server route_bare_server ./.tmp/m032-s01/route_bare_server/route_bare_server
bare_pid="$STARTED_SERVER_PID"
BARE_REQUEST="curl -sS -i --max-time 2 http://127.0.0.1:18124/"
BARE_RESPONSE="$ARTIFACT_DIR/route_bare_server.response"
BARE_ERROR="$ARTIFACT_DIR/route_bare_server.curl.err"

echo "==> ${BARE_REQUEST}"
if ! curl -sS -i --max-time 2 http://127.0.0.1:18124/ >"$BARE_RESPONSE" 2>"$BARE_ERROR"; then
  fail_with_log "$BARE_REQUEST" "bare-function control request failed" "$BARE_ERROR"
fi
if ! grep -Fq "HTTP/1.1 200 OK" "$BARE_RESPONSE"; then
  fail_with_log "$BARE_REQUEST" "expected bare-function control to return HTTP 200" "$BARE_RESPONSE"
fi
if ! grep -Fq "bare_ok" "$BARE_RESPONSE"; then
  fail_with_log "$BARE_REQUEST" "expected bare-function control body 'bare_ok'" "$BARE_RESPONSE"
fi

# Closure route must still fail only once exercised over a live request.
run_expect_success build_route_closure_server cargo run -q -p meshc -- build .tmp/m032-s01/route_closure_server
start_server route_closure_server ./.tmp/m032-s01/route_closure_server/route_closure_server
closure_pid="$STARTED_SERVER_PID"
CLOSURE_REQUEST="curl -sS -i --max-time 2 http://127.0.0.1:18123/"
CLOSURE_RESPONSE="$ARTIFACT_DIR/route_closure_server.response"
CLOSURE_ERROR="$ARTIFACT_DIR/route_closure_server.curl.err"

echo "==> ${CLOSURE_REQUEST}"
set +e
curl -sS -i --max-time 2 http://127.0.0.1:18123/ >"$CLOSURE_RESPONSE" 2>"$CLOSURE_ERROR"
closure_status=$?
set -e
sleep 0.2
closure_exited=0
if ! kill -0 "$closure_pid" 2>/dev/null; then
  closure_exited=1
  wait "$closure_pid" 2>/dev/null || true
fi

if grep -Fq "HTTP/1.1 200 OK" "$CLOSURE_RESPONSE"; then
  fail_with_log "$CLOSURE_REQUEST" "closure route unexpectedly returned HTTP 200" "$CLOSURE_RESPONSE"
fi
if grep -Fq "closure_ok" "$CLOSURE_RESPONSE"; then
  fail_with_log "$CLOSURE_REQUEST" "closure route unexpectedly returned its success body" "$CLOSURE_RESPONSE"
fi
if [[ $closure_status -eq 0 ]]; then
  if [[ ! -s "$CLOSURE_RESPONSE" && $closure_exited -eq 0 ]]; then
    fail_with_log "$CLOSURE_REQUEST" "closure route produced neither an HTTP failure nor a crash signal" "$CLOSURE_RESPONSE"
  fi
elif [[ ! -s "$CLOSURE_ERROR" && $closure_exited -eq 0 ]]; then
  fail_with_log "$CLOSURE_REQUEST" "closure route request failed without stderr evidence or process exit" "$CLOSURE_ERROR"
fi

# Mesher baseline must stay green while the audit automation lands.
run_expect_success fmt_mesher cargo run -q -p meshc -- fmt --check mesher
run_expect_success build_mesher cargo run -q -p meshc -- build mesher

echo "verify-m032-s01: ok"
