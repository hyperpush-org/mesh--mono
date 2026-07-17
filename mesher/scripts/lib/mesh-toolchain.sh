#!/usr/bin/env bash
set -euo pipefail

MESHER_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESHER_SCRIPTS_DIR="$(cd "$MESHER_LIB_DIR/.." && pwd)"
MESHER_PACKAGE_DIR="$(cd "$MESHER_SCRIPTS_DIR/.." && pwd)"
MESHER_MANIFEST_PATH="$MESHER_PACKAGE_DIR/mesh.toml"

readonly MESHER_LIB_DIR
readonly MESHER_SCRIPTS_DIR
readonly MESHER_PACKAGE_DIR
readonly MESHER_MANIFEST_PATH

mesher_toolchain_log() {
  printf '[mesher-toolchain] %s\n' "$*" >&2
}

mesher_toolchain_fail() {
  mesher_toolchain_log "$1"
  exit 1
}

mesher_require_file() {
  local label="$1"
  local path="$2"
  if [[ ! -f "$path" ]]; then
    mesher_toolchain_fail "missing required ${label}: ${path}"
  fi
}

mesher_require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    mesher_toolchain_fail "required command missing from PATH: ${command_name}"
  fi
}

mesher_require_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    mesher_toolchain_fail 'DATABASE_URL must be set'
  fi
}

mesher_abs_path() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys

print(Path(sys.argv[1]).expanduser().resolve(strict=False))
PY
}

mesher_path_within() {
  python3 - "$1" "$2" <<'PY'
from pathlib import Path
import os
import sys

child = str(Path(sys.argv[1]).expanduser().resolve(strict=False))
parent = str(Path(sys.argv[2]).expanduser().resolve(strict=False))
try:
    matches = os.path.commonpath([child, parent]) == parent
except ValueError:
    matches = False
raise SystemExit(0 if matches else 1)
PY
}

mesher_prepare_bundle_dir() {
  local raw_path="$1"
  local bundle_dir

  if [[ -z "$raw_path" ]]; then
    mesher_toolchain_fail 'build bundle path must not be empty'
  fi

  bundle_dir="$(mesher_abs_path "$raw_path")"
  if mesher_path_within "$bundle_dir" "$MESHER_PACKAGE_DIR"; then
    mesher_toolchain_fail "build bundle path must stay outside package root ${MESHER_PACKAGE_DIR}: ${bundle_dir}"
  fi

  if [[ -e "$bundle_dir" && ! -d "$bundle_dir" ]]; then
    mesher_toolchain_fail "build bundle path exists but is not a directory: ${bundle_dir}"
  fi

  mkdir -p "$bundle_dir"
  printf '%s\n' "$bundle_dir"
}

mesher_is_mesh_lang_root() {
  local candidate="$1"
  [[ -f "$candidate/Cargo.toml" && -f "$candidate/compiler/meshc/Cargo.toml" ]]
}

mesher_find_enclosing_mesh_lang_root() {
  local current="$MESHER_PACKAGE_DIR"
  while [[ "$current" != "/" ]]; do
    if [[ "$(basename "$current")" == 'mesh-lang' ]] && mesher_is_mesh_lang_root "$current"; then
      printf '%s\n' "$current"
      return 0
    fi
    current="$(dirname "$current")"
  done
  return 1
}

mesher_find_nested_workspace_mesh_lang_root() {
  local product_root="$1"
  local blessed_sibling_root
  blessed_sibling_root="$(dirname "$product_root")/mesh-lang"
  local stale_direct_sibling_root="$MESHER_PACKAGE_DIR/../mesh-lang"
  local blessed_abs_root
  blessed_abs_root="$(mesher_abs_path "$blessed_sibling_root")"

  if mesher_is_mesh_lang_root "$stale_direct_sibling_root"; then
    local stale_abs_root
    stale_abs_root="$(mesher_abs_path "$stale_direct_sibling_root")"
    if [[ "$stale_abs_root" != "$blessed_abs_root" ]]; then
      mesher_toolchain_fail "toolchain contract drift: nested product root ${product_root} must resolve sibling-workspace via ${blessed_abs_root}, not stale direct-sibling ${stale_abs_root}"
    fi
  fi

  if mesher_is_mesh_lang_root "$blessed_sibling_root"; then
    printf '%s\n' "$blessed_abs_root"
    return 0
  fi

  mesher_toolchain_fail "toolchain contract drift: nested product root ${product_root} expected sibling mesh-lang repo at ${blessed_abs_root}"
}

mesher_resolve_toolchain() {
  if [[ -n "${MESHER_MESHC_BIN:-}" ]]; then
    MESHER_MESHC_BIN="$(mesher_abs_path "$MESHER_MESHC_BIN")"
    if [[ ! -x "$MESHER_MESHC_BIN" ]]; then
      mesher_toolchain_fail "configured MESHER_MESHC_BIN is not executable: ${MESHER_MESHC_BIN}"
    fi
    MESHER_MESHC_SOURCE="${MESHER_MESHC_SOURCE:-explicit}"
    export MESHER_MESHC_BIN MESHER_MESHC_SOURCE
    return 0
  fi

  local source_root=''
  local source_name=''
  local candidate=''
  local product_root
  product_root="$(mesher_abs_path "$MESHER_PACKAGE_DIR/..")"

  if source_root="$(mesher_find_enclosing_mesh_lang_root)"; then
    source_name='enclosing-source'
    candidate="$source_root/target/debug/meshc"
    if [[ ! -x "$candidate" ]]; then
      mesher_toolchain_fail "toolchain contract drift: source=${source_name} root=${source_root} expected executable meshc at ${candidate}"
    fi
  elif [[ "$(basename "$product_root")" == 'hyperpush-mono' || "$(basename "$product_root")" == 'hyperpush' ]]; then
    source_name='sibling-workspace'
    source_root="$(mesher_find_nested_workspace_mesh_lang_root "$product_root")"
    candidate="$source_root/target/debug/meshc"
    if [[ ! -x "$candidate" ]]; then
      mesher_toolchain_fail "toolchain contract drift: source=${source_name} root=${source_root} expected executable meshc at ${candidate} for nested product root ${product_root}"
    fi
  elif command -v meshc >/dev/null 2>&1; then
    source_name='PATH'
    candidate="$(mesher_abs_path "$(command -v meshc)")"
  else
    mesher_toolchain_fail 'toolchain contract missing: no enclosing-source mesh-lang checkout, no sibling-workspace mesh-lang checkout for nested hyperpush-mono/mesher or hyperpush/mesher, and no meshc on PATH fallback'
  fi

  MESHER_MESHC_SOURCE="$source_name"
  MESHER_MESHC_BIN="$candidate"
  export MESHER_MESHC_SOURCE
  export MESHER_MESHC_BIN

  if [[ -z "${CARGO_TARGET_DIR:-}" && -n "$source_root" && "$source_name" != 'PATH' ]]; then
    CARGO_TARGET_DIR="$source_root/target"
    export CARGO_TARGET_DIR
  fi

  mesher_toolchain_log "resolved meshc source=${MESHER_MESHC_SOURCE} path=${MESHER_MESHC_BIN} package_root=${MESHER_PACKAGE_DIR} cargo_target_dir=${CARGO_TARGET_DIR:-<unset>}"
}

mesher_run_meshc() {
  local label="$1"
  local timeout_secs="$2"
  shift 2

  mesher_require_file 'Mesher manifest' "$MESHER_MANIFEST_PATH"
  mesher_require_command python3
  mesher_resolve_toolchain

  local -a command=("$MESHER_MESHC_BIN" "$@")
  local rendered_command
  rendered_command="$(printf '%q ' "${command[@]}")"
  rendered_command="${rendered_command% }"
  mesher_toolchain_log "${label}: cwd=${MESHER_PACKAGE_DIR} timeout=${timeout_secs}s command=${rendered_command}"

  set +e
  python3 - "$MESHER_PACKAGE_DIR" "$timeout_secs" "$label" "${command[@]}" <<'PY'
import subprocess
import sys

cwd = sys.argv[1]
timeout_seconds = int(sys.argv[2])
label = sys.argv[3]
command = sys.argv[4:]

try:
    completed = subprocess.run(command, cwd=cwd, check=False, timeout=timeout_seconds)
except subprocess.TimeoutExpired:
    print(f"[mesher-toolchain] {label} timed out after {timeout_seconds}s", file=sys.stderr)
    raise SystemExit(124)

raise SystemExit(completed.returncode)
PY
  local status=$?
  set -e

  if [[ $status -eq 0 ]]; then
    return 0
  fi

  if [[ $status -eq 124 ]]; then
    mesher_toolchain_fail "${label} timed out after ${timeout_secs}s: ${rendered_command}"
  fi
  mesher_toolchain_fail "${label} failed exit=${status}: ${rendered_command}"
}
