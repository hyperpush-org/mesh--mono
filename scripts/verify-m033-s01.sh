#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_DIR=".tmp/m033-s01/verify"
mkdir -p "$ARTIFACT_DIR"

fail_with_log() {
  local command_text="$1"
  local reason="$2"
  local log_path="${3:-}"

  echo "verification drift: ${reason}" >&2
  echo "failing command: ${command_text}" >&2
  if [[ -n "$log_path" && -f "$log_path" ]]; then
    echo "--- ${log_path} ---" >&2
    sed -n '1,220p' "$log_path" >&2
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

run_python_check() {
  local label="$1"
  local log_path="$ARTIFACT_DIR/${label}.log"

  if ! python3 >"$log_path" 2>&1 <<'PY'
from pathlib import Path

queries = Path("mesher/storage/queries.mpl").read_text()
writer = Path("mesher/storage/writer.mpl").read_text()

def fn_block(text: str, name: str) -> str:
    marker = f"pub fn {name}("
    start = text.index(marker)
    end = text.find("\npub fn ", start + 1)
    return text[start:] if end == -1 else text[start:end]

owned = [
    "revoke_api_key",
    "upsert_issue",
    "assign_issue",
    "acknowledge_alert",
    "resolve_fired_alert",
    "update_project_settings",
]
for name in owned:
    block = fn_block(queries, name)
    if "Repo.execute_raw" in block or "Repo.query_raw" in block:
        raise SystemExit(f"{name} still uses raw SQL:\n{block}")

for name in ["create_alert_rule", "fire_alert"]:
    block = fn_block(queries, name)
    if "Repo.execute_raw" not in block and "Repo.query_raw" not in block:
        raise SystemExit(f"{name} should still be an explicit PG keep-site for S02:\n{block}")

insert_event = fn_block(writer, "insert_event")
if "Repo.execute_raw" not in insert_event:
    raise SystemExit(f"insert_event should still be an explicit PG JSONB keep-site for S02:\n{insert_event}")

print("raw keep-list ok")
PY
  then
    fail_with_log "python keep-list sweep" "raw keep-list drifted" "$log_path"
  fi
}

run_expect_success e2e_m033_s01 cargo test -p meshc --test e2e_m033_s01 -- --nocapture
run_expect_success fmt_mesher cargo run -q -p meshc -- fmt --check mesher
run_expect_success build_mesher cargo run -q -p meshc -- build mesher
run_python_check raw_keep_list

echo "verify-m033-s01: ok"
