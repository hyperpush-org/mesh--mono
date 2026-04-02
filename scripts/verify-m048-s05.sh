#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NEOVIM_BIN="${NEOVIM_BIN:-nvim}"
ARTIFACT_ROOT=".tmp/m048-s05"
ARTIFACT_DIR="$ARTIFACT_ROOT/verify"
PHASE_REPORT_PATH="$ARTIFACT_DIR/phase-report.txt"
STATUS_PATH="$ARTIFACT_DIR/status.txt"
CURRENT_PHASE_PATH="$ARTIFACT_DIR/current-phase.txt"
LATEST_PROOF_BUNDLE_PATH="$ARTIFACT_DIR/latest-proof-bundle.txt"
RETAINED_PROOF_BUNDLE_DIR="$ARTIFACT_DIR/retained-proof-bundle"

repo_rel() {
  local candidate="$1"
  if [[ "$candidate" == "$ROOT_DIR/"* ]]; then
    printf '%s\n' "${candidate#$ROOT_DIR/}"
  else
    printf '%s\n' "$candidate"
  fi
}

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"
exec > >(tee "$ARTIFACT_DIR/full-contract.log") 2>&1

: >"$PHASE_REPORT_PATH"
printf 'running\n' >"$STATUS_PATH"
printf 'init\n' >"$CURRENT_PHASE_PATH"

on_exit() {
  local exit_code=$?
  if [[ $exit_code -eq 0 ]]; then
    printf 'ok\n' >"$STATUS_PATH"
    printf 'complete\n' >"$CURRENT_PHASE_PATH"
  elif [[ ! -f "$STATUS_PATH" || "$(<"$STATUS_PATH")" != "failed" ]]; then
    printf 'failed\n' >"$STATUS_PATH"
  fi
}
trap on_exit EXIT

record_phase() {
  printf '%s\t%s\n' "$1" "$2" >>"$PHASE_REPORT_PATH"
}

begin_phase() {
  record_phase "$1" started
  printf '%s\n' "$1" >"$CURRENT_PHASE_PATH"
}

print_log_excerpt() {
  local log_path="$1"
  python3 - "$log_path" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
if not path.exists():
    print(f"missing log: {path}")
    raise SystemExit(0)
lines = path.read_text(errors="replace").splitlines()
for line in lines[:220]:
    print(line)
if len(lines) > 220:
    print(f"... truncated after 220 lines (total {len(lines)})")
PY
}

fail_phase() {
  local phase="$1"
  local reason="$2"
  local log_path="${3:-}"
  local artifact_hint="${4:-}"

  printf 'failed\n' >"$STATUS_PATH"
  printf '%s\n' "$phase" >"$CURRENT_PHASE_PATH"
  echo "verification drift: ${reason}" >&2
  if [[ -n "$artifact_hint" ]]; then
    echo "artifact hint: $(repo_rel "$artifact_hint")" >&2
  fi
  if [[ -n "$log_path" ]]; then
    echo "failing log: $(repo_rel "$log_path")" >&2
    echo "--- $(repo_rel "$log_path") ---" >&2
    print_log_excerpt "$log_path" >&2
  fi
  exit 1
}

resolve_tool_path() {
  local candidate="$1"
  if [[ -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  command -v "$candidate" 2>/dev/null || return 1
}

require_file() {
  local phase="$1"
  local path="$2"
  local description="$3"
  local artifact_hint="${4:-}"
  if [[ -f "$path" ]]; then
    return 0
  fi

  local log_path="$ARTIFACT_DIR/${phase}.preflight.log"
  {
    echo "preflight: missing required file"
    echo "description: ${description}"
    echo "path: $(repo_rel "$path")"
  } >"$log_path"
  record_phase "$phase" failed
  fail_phase "$phase" "missing required file: $(repo_rel "$path")" "$log_path" "$artifact_hint"
}

require_executable() {
  local phase="$1"
  local path="$2"
  local description="$3"
  local artifact_hint="${4:-}"
  if [[ -x "$path" ]]; then
    return 0
  fi

  local log_path="$ARTIFACT_DIR/${phase}.preflight.log"
  {
    echo "preflight: missing required executable"
    echo "description: ${description}"
    echo "path: $(repo_rel "$path")"
  } >"$log_path"
  record_phase "$phase" failed
  fail_phase "$phase" "missing required executable: $(repo_rel "$path")" "$log_path" "$artifact_hint"
}

require_resolvable_tool() {
  local phase="$1"
  local candidate="$2"
  local description="$3"
  local artifact_hint="${4:-}"
  local resolved_path

  if resolved_path="$(resolve_tool_path "$candidate")"; then
    printf '%s\n' "$resolved_path" >"$ARTIFACT_DIR/${phase}.resolved-tool.txt"
    return 0
  fi

  local log_path="$ARTIFACT_DIR/${phase}.preflight.log"
  {
    echo "preflight: missing required tool"
    echo "description: ${description}"
    echo "tool: ${candidate}"
  } >"$log_path"
  record_phase "$phase" failed
  fail_phase "$phase" "missing required executable: ${candidate}" "$log_path" "$artifact_hint"
}

require_package_script() {
  local phase="$1"
  local package_json_path="$2"
  local script_name="$3"
  local artifact_hint="${4:-}"
  local log_path="$ARTIFACT_DIR/${phase}.script-check.log"

  if ! python3 - "$package_json_path" "$script_name" >"$log_path" 2>&1 <<'PY'
import json
import sys
from pathlib import Path

package_path = Path(sys.argv[1])
script_name = sys.argv[2]

package_json = json.loads(package_path.read_text())
scripts = package_json.get("scripts") or {}
if script_name not in scripts:
    raise SystemExit(f"missing npm script {script_name!r} in {package_path}")
print(scripts[script_name])
PY
  then
    record_phase "$phase" failed
    fail_phase "$phase" "missing npm script ${script_name} in $(repo_rel "$package_json_path")" "$log_path" "$artifact_hint"
  fi
}

require_grep() {
  local phase="$1"
  local target_path="$2"
  local pattern="$3"
  local reason="$4"
  local artifact_hint="${5:-}"

  if grep -Fq "$pattern" "$target_path"; then
    return 0
  fi

  local log_path="$ARTIFACT_DIR/${phase}.postcheck.log"
  {
    echo "postcheck: pattern missing"
    echo "path: $(repo_rel "$target_path")"
    echo "pattern: ${pattern}"
    echo "reason: ${reason}"
  } >"$log_path"
  record_phase "$phase" failed
  fail_phase "$phase" "$reason" "$log_path" "$artifact_hint"
}

run_command() {
  local timeout_secs="$1"
  local log_path="$2"
  shift 2
  local -a cmd=("$@")
  {
    printf '$'
    printf ' %q' "${cmd[@]}"
    printf '\n'
    "${cmd[@]}"
  } >"$log_path" 2>&1 &
  local cmd_pid=$!
  local deadline=$((SECONDS + timeout_secs))
  while kill -0 "$cmd_pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      echo "command timed out after ${timeout_secs}s" >>"$log_path"
      kill -TERM "$cmd_pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$cmd_pid" 2>/dev/null || true
      wait "$cmd_pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
  done
  wait "$cmd_pid"
}

assert_test_filter_ran() {
  local phase="$1"
  local log_path="$2"
  local label="$3"
  local artifact_hint="${4:-}"
  local count_log="$ARTIFACT_DIR/${label}.test-count.log"

  if ! python3 - "$log_path" "$label" >"$count_log" 2>&1 <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(errors="replace")
label = sys.argv[2]
counts = [int(value) for value in re.findall(r"running (\d+) test", text)]
if not counts:
    raise SystemExit(f"{label}: missing 'running N test' line")
if max(counts) <= 0:
    raise SystemExit(f"{label}: test filter ran 0 tests")
print(f"{label}: running-counts={counts}")
PY
  then
    record_phase "$phase" failed
    fail_phase "$phase" "named test filter ran 0 tests or produced malformed output" "$count_log" "$artifact_hint"
  fi
}

run_expect_success() {
  local phase="$1"
  local label="$2"
  local require_tests="$3"
  local timeout_secs="$4"
  local artifact_hint="$5"
  shift 5
  local -a cmd=("$@")
  local log_path="$ARTIFACT_DIR/${label}.log"

  begin_phase "$phase"
  echo "==> ${cmd[*]}"
  if ! run_command "$timeout_secs" "$log_path" "${cmd[@]}"; then
    record_phase "$phase" failed
    fail_phase "$phase" "expected success within ${timeout_secs}s" "$log_path" "$artifact_hint"
  fi
  if [[ "$require_tests" == "yes" ]]; then
    assert_test_filter_ran "$phase" "$log_path" "$label" "$artifact_hint"
  fi
  record_phase "$phase" passed
}

capture_snapshot() {
  local source_root="$1"
  local snapshot_path="$2"
  python3 - "$source_root" "$snapshot_path" <<'PY'
from pathlib import Path
import sys

source_root = Path(sys.argv[1])
snapshot_path = Path(sys.argv[2])
names = []
if source_root.exists():
    names = sorted(path.name for path in source_root.iterdir() if path.is_dir())
snapshot_path.write_text(''.join(f"{name}\n" for name in names))
PY
}

copy_new_artifacts_or_fail() {
  local phase="$1"
  local before_snapshot="$2"
  local source_root="$3"
  local dest_root="$4"
  local manifest_path="$5"
  local expected_message="$6"
  local log_path="$ARTIFACT_DIR/${phase}.artifact-check.log"

  if ! python3 - "$before_snapshot" "$source_root" "$dest_root" "$manifest_path" "$expected_message" >"$log_path" 2>&1 <<'PY'
from pathlib import Path
import shutil
import sys

before_snapshot = Path(sys.argv[1])
source_root = Path(sys.argv[2])
dest_root = Path(sys.argv[3])
manifest_path = Path(sys.argv[4])
expected_message = sys.argv[5]

if not source_root.is_dir():
    raise SystemExit(f"missing artifact source root: {source_root}")

before = {
    line.strip()
    for line in before_snapshot.read_text(errors='replace').splitlines()
    if line.strip()
}
after_paths = {
    path.name: path
    for path in source_root.iterdir()
    if path.is_dir()
}
new_names = sorted(name for name in after_paths if name not in before)
if not new_names:
    raise SystemExit(expected_message)

if dest_root.exists():
    shutil.rmtree(dest_root)
dest_root.parent.mkdir(parents=True, exist_ok=True)
dest_root.mkdir(parents=True, exist_ok=True)
manifest_lines = []
for name in new_names:
    src = after_paths[name]
    if not any(src.iterdir()):
        raise SystemExit(f"{src}: expected non-empty artifact directory")
    dst = dest_root / name
    shutil.copytree(src, dst, symlinks=True)
    manifest_lines.append(f"{name}\t{src}")
    for child in sorted(src.rglob('*')):
        if child.is_file():
            manifest_lines.append(f"  - {child}")

manifest_path.write_text('\n'.join(manifest_lines) + ('\n' if manifest_lines else ''))
print(f"copied {len(new_names)} artifact directories into {dest_root}")
PY
  then
    record_phase "$phase" failed
    fail_phase "$phase" "missing or malformed copied artifacts" "$log_path" "$source_root"
  fi
}

copy_fixed_dir_or_fail() {
  local phase="$1"
  local source_dir="$2"
  local dest_dir="$3"
  local description="$4"
  shift 4
  local log_path="$ARTIFACT_DIR/${phase}.$(basename "$dest_dir").copy.log"

  if ! python3 - "$source_dir" "$dest_dir" "$description" "$@" >"$log_path" 2>&1 <<'PY'
from pathlib import Path
import shutil
import sys

source_dir = Path(sys.argv[1])
dest_dir = Path(sys.argv[2])
description = sys.argv[3]
required = sys.argv[4:]

if not source_dir.is_dir():
    raise SystemExit(f"{description}: missing source directory {source_dir}")
for rel in required:
    if not (source_dir / rel).exists():
        raise SystemExit(f"{description}: missing {rel} in {source_dir}")
if dest_dir.exists():
    shutil.rmtree(dest_dir)
dest_dir.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(source_dir, dest_dir, symlinks=True)
print(f"copied {source_dir} -> {dest_dir}")
PY
  then
    record_phase "$phase" failed
    fail_phase "$phase" "$description" "$log_path" "$source_dir"
  fi
}

assert_retained_bundle_shape() {
  local phase="$1"
  local bundle_root="$2"
  local pointer_path="$3"
  local log_path="$ARTIFACT_DIR/${phase}.bundle-check.log"

  if ! python3 - "$bundle_root" "$pointer_path" >"$log_path" 2>&1 <<'PY'
from pathlib import Path
import sys

bundle_root = Path(sys.argv[1])
pointer_path = Path(sys.argv[2])
expected_pointer = str(bundle_root)
actual_pointer = pointer_path.read_text(errors='replace').strip()
if actual_pointer != expected_pointer:
    raise SystemExit(
        f"latest-proof-bundle pointer drifted: expected {expected_pointer!r}, got {actual_pointer!r}"
    )

required_fixed = {
    'retained-m036-s02-lsp': [
        'neovim-smoke.log',
        'upstream-lsp.log',
    ],
    'retained-m036-s02-syntax': [
        'neovim-smoke.log',
        'corpus/materialized-corpus.json',
    ],
    'retained-m036-s03-vscode-smoke': [
        'context.json',
        'smoke.log',
        'workspace/mesh-smoke.code-workspace',
    ],
}
for rel_dir, required_files in required_fixed.items():
    base = bundle_root / rel_dir
    if not base.is_dir():
        raise SystemExit(f"{bundle_root}: missing {rel_dir}")
    for rel in required_files:
        if not (base / rel).exists():
            raise SystemExit(f"{base}: missing {rel}")

lsp_log = (bundle_root / 'retained-m036-s02-lsp' / 'neovim-smoke.log').read_text(errors='replace')
if '[m036-s02] phase=lsp result=pass' not in lsp_log:
    raise SystemExit('retained-m036-s02-lsp/neovim-smoke.log missing lsp pass marker')
syntax_log = (bundle_root / 'retained-m036-s02-syntax' / 'neovim-smoke.log').read_text(errors='replace')
if '[m036-s02] phase=syntax result=pass' not in syntax_log:
    raise SystemExit('retained-m036-s02-syntax/neovim-smoke.log missing syntax pass marker')
vscode_log = (bundle_root / 'retained-m036-s03-vscode-smoke' / 'smoke.log').read_text(errors='replace')
if 'Extension Development Host smoke passed' not in vscode_log:
    raise SystemExit('retained-m036-s03-vscode-smoke/smoke.log missing pass marker')

manifest_paths = {
    'retained-m048-s01-artifacts': bundle_root / 'retained-m048-s01-artifacts.manifest.txt',
    'retained-m048-s03-artifacts': bundle_root / 'retained-m048-s03-artifacts.manifest.txt',
}
for label, manifest_path in manifest_paths.items():
    lines = [line for line in manifest_path.read_text(errors='replace').splitlines() if line.strip()]
    if not lines:
        raise SystemExit(f"{manifest_path}: expected non-empty manifest for {label}")

s01_root = bundle_root / 'retained-m048-s01-artifacts'
if not s01_root.is_dir():
    raise SystemExit(f"{bundle_root}: missing retained-m048-s01-artifacts")
s01_expectations = {
    'fixture-writer-rejects-missing-entry-': ['setup.error.txt'],
    'default-control-build-and-run-': ['build.command.txt', 'build.status.txt', 'run.command.txt', 'run.status.txt', 'project/main.mpl'],
    'override-precedence-build-and-run-': ['build.command.txt', 'build.status.txt', 'run.command.txt', 'run.status.txt', 'project/mesh.toml', 'project/lib/start.mpl'],
    'override-only-build-and-run-': ['build.command.txt', 'build.status.txt', 'run.command.txt', 'run.status.txt', 'project/mesh.toml', 'project/lib/start.mpl'],
    'meshc-test-project-dir-': ['meshc-test.command.txt', 'meshc-test.status.txt', 'project/tests/override_entry.test.mpl'],
    'meshc-test-tests-dir-': ['meshc-test.command.txt', 'meshc-test.status.txt', 'project/tests/override_entry.test.mpl'],
    'meshc-test-specific-file-': ['meshc-test.command.txt', 'meshc-test.status.txt', 'project/tests/override_entry.test.mpl'],
}
children = [path for path in s01_root.iterdir() if path.is_dir()]
for prefix, required_files in s01_expectations.items():
    matches = [path for path in children if path.name.startswith(prefix)]
    if len(matches) != 1:
        raise SystemExit(f"{s01_root}: expected exactly one retained artifact for {prefix}, found {[path.name for path in matches]}")
    for rel in required_files:
        if not (matches[0] / rel).exists():
            raise SystemExit(f"{matches[0]}: missing {rel}")

s03_root = bundle_root / 'retained-m048-s03-artifacts'
if not s03_root.is_dir():
    raise SystemExit(f"{bundle_root}: missing retained-m048-s03-artifacts")
s03_expectations = {
    'staged-meshc-update-': ['meshc-update.json', 'installed-meshc-version.json', 'installed-meshpkg-version.json', 'release-layout.json'],
    'installed-meshpkg-update-': ['meshpkg-update.json', 'post-update-meshc-version.json', 'post-update-meshpkg-version.json', 'credential-before.json', 'credential-after.json'],
}
children = [path for path in s03_root.iterdir() if path.is_dir()]
for prefix, required_files in s03_expectations.items():
    matches = [path for path in children if path.name.startswith(prefix)]
    if len(matches) != 1:
        raise SystemExit(f"{s03_root}: expected exactly one retained artifact for {prefix}, found {[path.name for path in matches]}")
    for rel in required_files:
        if not (matches[0] / rel).exists():
            raise SystemExit(f"{matches[0]}: missing {rel}")

print('retained-bundle-shape: ok')
PY
  then
    record_phase "$phase" failed
    fail_phase "$phase" "missing retained proof artifacts or malformed bundle pointer" "$log_path" "$bundle_root"
  fi
}

record_phase init passed

SNAPSHOT_BEFORE_S01="$ARTIFACT_DIR/m048-s01-before.snapshot"
SNAPSHOT_BEFORE_S03="$ARTIFACT_DIR/m048-s03-before.snapshot"
capture_snapshot ".tmp/m048-s01" "$SNAPSHOT_BEFORE_S01"
capture_snapshot ".tmp/m048-s03" "$SNAPSHOT_BEFORE_S03"

begin_phase docs-contract
require_file docs-contract "$ROOT_DIR/scripts/tests/verify-m048-s05-contract.test.mjs" "M048 S05 public-truth contract test"
DOCS_CONTRACT_LOG="$ARTIFACT_DIR/docs-contract.log"
echo "==> node --test scripts/tests/verify-m048-s05-contract.test.mjs"
if ! run_command 120 "$DOCS_CONTRACT_LOG" node --test scripts/tests/verify-m048-s05-contract.test.mjs; then
  record_phase docs-contract failed
  fail_phase docs-contract "expected success within 120s" "$DOCS_CONTRACT_LOG"
fi
record_phase docs-contract passed

run_expect_success m048-s01-entrypoint m048-s01-entrypoint yes 3600 ".tmp/m048-s01" \
  cargo test -p meshc --test e2e_m048_s01 m048_s01 -- --nocapture

begin_phase m048-s02-lsp-neovim
require_file m048-s02-lsp-neovim "$ROOT_DIR/scripts/verify-m036-s02.sh" "M036 S02 retained Neovim verifier" ".tmp/m036-s02/lsp"
require_file m048-s02-lsp-neovim "$ROOT_DIR/tools/editors/neovim-mesh/tests/smoke.lua" "Neovim retained smoke runner" ".tmp/m036-s02/lsp"
require_file m048-s02-lsp-neovim "$ROOT_DIR/tools/editors/neovim-mesh/lua/mesh.lua" "Neovim runtime support file" ".tmp/m036-s02/lsp"
require_resolvable_tool m048-s02-lsp-neovim "$NEOVIM_BIN" "Neovim binary for retained LSP/host replay" ".tmp/m036-s02/lsp"
M048_S02_LSP_LOG="$ARTIFACT_DIR/m048-s02-lsp-neovim.log"
echo "==> NEOVIM_BIN=${NEOVIM_BIN} bash scripts/verify-m036-s02.sh lsp"
if ! run_command 2400 "$M048_S02_LSP_LOG" env "NEOVIM_BIN=$NEOVIM_BIN" bash scripts/verify-m036-s02.sh lsp; then
  record_phase m048-s02-lsp-neovim failed
  fail_phase m048-s02-lsp-neovim "expected success within 2400s" "$M048_S02_LSP_LOG" ".tmp/m036-s02/lsp"
fi
record_phase m048-s02-lsp-neovim passed

begin_phase m048-s02-vscode
require_file m048-s02-vscode "$ROOT_DIR/tools/editors/vscode-mesh/package.json" "VS Code extension package manifest" ".tmp/m036-s03/vscode-smoke"
require_package_script m048-s02-vscode "$ROOT_DIR/tools/editors/vscode-mesh/package.json" test:smoke ".tmp/m036-s03/vscode-smoke"
require_executable m048-s02-vscode "$ROOT_DIR/target/debug/meshc" "repo-local meshc binary required by VS Code smoke" ".tmp/m036-s03/vscode-smoke"
M048_S02_VSCODE_LOG="$ARTIFACT_DIR/m048-s02-vscode.log"
echo "==> npm --prefix tools/editors/vscode-mesh run test:smoke"
if ! run_command 2400 "$M048_S02_VSCODE_LOG" npm --prefix tools/editors/vscode-mesh run test:smoke; then
  record_phase m048-s02-vscode failed
  fail_phase m048-s02-vscode "expected success within 2400s" "$M048_S02_VSCODE_LOG" ".tmp/m036-s03/vscode-smoke"
fi
require_file m048-s02-vscode "$ROOT_DIR/.tmp/m036-s03/vscode-smoke/context.json" "VS Code smoke context artifact" ".tmp/m036-s03/vscode-smoke"
require_file m048-s02-vscode "$ROOT_DIR/.tmp/m036-s03/vscode-smoke/smoke.log" "VS Code smoke log artifact" ".tmp/m036-s03/vscode-smoke"
require_grep m048-s02-vscode "$ROOT_DIR/.tmp/m036-s03/vscode-smoke/smoke.log" "Extension Development Host smoke passed" "VS Code smoke completed without the expected pass marker" ".tmp/m036-s03/vscode-smoke"
record_phase m048-s02-vscode passed

run_expect_success m048-s02-publish m048-s02-publish yes 2400 "" \
  cargo test -p meshpkg publish_archive_members_ -- --nocapture
run_expect_success m048-s03-toolchain-update-core m048-s03-toolchain-update-core yes 2400 ".tmp/m048-s03" \
  cargo test -p mesh-pkg --test toolchain_update -- --nocapture
run_expect_success m048-s03-toolchain-update-help m048-s03-toolchain-update-help yes 1800 ".tmp/m048-s03" \
  cargo test -p meshc --test tooling_e2e test_update -- --nocapture
run_expect_success m048-s03-toolchain-update-cli m048-s03-toolchain-update-cli yes 1800 ".tmp/m048-s03" \
  cargo test -p meshpkg --test update_cli -- --nocapture
run_expect_success m048-s03-toolchain-update-e2e m048-s03-toolchain-update-e2e yes 3600 ".tmp/m048-s03" \
  cargo test -p meshc --test e2e_m048_s03 m048_s03 -- --nocapture
run_expect_success m048-s04-shared-grammar m048-s04-shared-grammar no 900 "" \
  bash scripts/verify-m036-s01.sh

begin_phase m048-s04-neovim-syntax
require_file m048-s04-neovim-syntax "$ROOT_DIR/scripts/verify-m036-s02.sh" "M036 S02 retained Neovim verifier" ".tmp/m036-s02/syntax"
require_file m048-s04-neovim-syntax "$ROOT_DIR/tools/editors/neovim-mesh/tests/smoke.lua" "Neovim retained smoke runner" ".tmp/m036-s02/syntax"
require_file m048-s04-neovim-syntax "$ROOT_DIR/tools/editors/neovim-mesh/lua/mesh.lua" "Neovim runtime support file" ".tmp/m036-s02/syntax"
require_resolvable_tool m048-s04-neovim-syntax "$NEOVIM_BIN" "Neovim binary for retained syntax replay" ".tmp/m036-s02/syntax"
M048_S04_NEOVIM_SYNTAX_LOG="$ARTIFACT_DIR/m048-s04-neovim-syntax.log"
echo "==> NEOVIM_BIN=${NEOVIM_BIN} bash scripts/verify-m036-s02.sh syntax"
if ! run_command 2400 "$M048_S04_NEOVIM_SYNTAX_LOG" env "NEOVIM_BIN=$NEOVIM_BIN" bash scripts/verify-m036-s02.sh syntax; then
  record_phase m048-s04-neovim-syntax failed
  fail_phase m048-s04-neovim-syntax "expected success within 2400s" "$M048_S04_NEOVIM_SYNTAX_LOG" ".tmp/m036-s02/syntax"
fi
record_phase m048-s04-neovim-syntax passed

begin_phase m048-s04-neovim-contract
require_file m048-s04-neovim-contract "$ROOT_DIR/scripts/tests/verify-m036-s02-contract.test.mjs" "retained Neovim contract test"
M048_S04_NEOVIM_CONTRACT_LOG="$ARTIFACT_DIR/m048-s04-neovim-contract.log"
echo "==> node --test scripts/tests/verify-m036-s02-contract.test.mjs"
if ! run_command 120 "$M048_S04_NEOVIM_CONTRACT_LOG" node --test scripts/tests/verify-m036-s02-contract.test.mjs; then
  record_phase m048-s04-neovim-contract failed
  fail_phase m048-s04-neovim-contract "expected success within 120s" "$M048_S04_NEOVIM_CONTRACT_LOG"
fi
record_phase m048-s04-neovim-contract passed

begin_phase m048-s04-skill-contract
require_file m048-s04-skill-contract "$ROOT_DIR/scripts/tests/verify-m048-s04-skill-contract.test.mjs" "retained Mesh skill contract test"
M048_S04_SKILL_CONTRACT_LOG="$ARTIFACT_DIR/m048-s04-skill-contract.log"
echo "==> node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs"
if ! run_command 120 "$M048_S04_SKILL_CONTRACT_LOG" node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs; then
  record_phase m048-s04-skill-contract failed
  fail_phase m048-s04-skill-contract "expected success within 120s" "$M048_S04_SKILL_CONTRACT_LOG"
fi
record_phase m048-s04-skill-contract passed

begin_phase docs-build
require_file docs-build "$ROOT_DIR/website/package.json" "website package manifest"
require_package_script docs-build "$ROOT_DIR/website/package.json" build
DOCS_BUILD_LOG="$ARTIFACT_DIR/docs-build.log"
echo "==> npm --prefix website run build"
if ! run_command 2400 "$DOCS_BUILD_LOG" npm --prefix website run build; then
  record_phase docs-build failed
  fail_phase docs-build "expected success within 2400s" "$DOCS_BUILD_LOG"
fi
record_phase docs-build passed

begin_phase retain-fixed-m036-artifacts
rm -rf "$RETAINED_PROOF_BUNDLE_DIR"
mkdir -p "$RETAINED_PROOF_BUNDLE_DIR"
copy_fixed_dir_or_fail retain-fixed-m036-artifacts \
  "$ROOT_DIR/.tmp/m036-s02/lsp" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m036-s02-lsp" \
  "retained M036 S02 LSP artifacts are missing or malformed" \
  neovim-smoke.log \
  upstream-lsp.log
copy_fixed_dir_or_fail retain-fixed-m036-artifacts \
  "$ROOT_DIR/.tmp/m036-s02/syntax" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m036-s02-syntax" \
  "retained M036 S02 syntax artifacts are missing or malformed" \
  neovim-smoke.log \
  corpus/materialized-corpus.json
copy_fixed_dir_or_fail retain-fixed-m036-artifacts \
  "$ROOT_DIR/.tmp/m036-s03/vscode-smoke" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m036-s03-vscode-smoke" \
  "retained M036 S03 VS Code smoke artifacts are missing or malformed" \
  context.json \
  smoke.log \
  workspace/mesh-smoke.code-workspace
record_phase retain-fixed-m036-artifacts passed

begin_phase retain-m048-s01-artifacts
copy_new_artifacts_or_fail \
  retain-m048-s01-artifacts \
  "$SNAPSHOT_BEFORE_S01" \
  "$ROOT_DIR/.tmp/m048-s01" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m048-s01-artifacts" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m048-s01-artifacts.manifest.txt" \
  "expected fresh .tmp/m048-s01 artifact directories from the override-entry replay"
record_phase retain-m048-s01-artifacts passed

begin_phase retain-m048-s03-artifacts
copy_new_artifacts_or_fail \
  retain-m048-s03-artifacts \
  "$SNAPSHOT_BEFORE_S03" \
  "$ROOT_DIR/.tmp/m048-s03" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m048-s03-artifacts" \
  "$RETAINED_PROOF_BUNDLE_DIR/retained-m048-s03-artifacts.manifest.txt" \
  "expected fresh .tmp/m048-s03 artifact directories from the toolchain-update replay"
record_phase retain-m048-s03-artifacts passed

begin_phase m048-s05-bundle-shape
printf '%s\n' "$RETAINED_PROOF_BUNDLE_DIR" >"$LATEST_PROOF_BUNDLE_PATH"
assert_retained_bundle_shape m048-s05-bundle-shape "$RETAINED_PROOF_BUNDLE_DIR" "$LATEST_PROOF_BUNDLE_PATH"
record_phase m048-s05-bundle-shape passed

for expected_phase in \
  docs-contract \
  m048-s01-entrypoint \
  m048-s02-lsp-neovim \
  m048-s02-vscode \
  m048-s02-publish \
  m048-s03-toolchain-update-core \
  m048-s03-toolchain-update-help \
  m048-s03-toolchain-update-cli \
  m048-s03-toolchain-update-e2e \
  m048-s04-shared-grammar \
  m048-s04-neovim-syntax \
  m048-s04-neovim-contract \
  m048-s04-skill-contract \
  docs-build \
  retain-fixed-m036-artifacts \
  retain-m048-s01-artifacts \
  retain-m048-s03-artifacts \
  m048-s05-bundle-shape; do
  if ! rg -q "^${expected_phase}\\tpassed$" "$PHASE_REPORT_PATH"; then
    fail_phase verifier-status "missing ${expected_phase} pass marker" "$ARTIFACT_DIR/full-contract.log" "$PHASE_REPORT_PATH"
  fi
done

echo "verify-m048-s05: ok"
echo "artifacts: $(repo_rel "$ARTIFACT_DIR")"
echo "proof bundle: $(repo_rel "$RETAINED_PROOF_BUNDLE_DIR")"
