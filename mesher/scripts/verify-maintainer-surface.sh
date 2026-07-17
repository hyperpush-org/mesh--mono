#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_ROOT="$ROOT_DIR/.tmp/m051-s01"
ARTIFACT_DIR="$ARTIFACT_ROOT/verify"
PHASE_REPORT_PATH="$ARTIFACT_DIR/phase-report.txt"
STATUS_PATH="$ARTIFACT_DIR/status.txt"
CURRENT_PHASE_PATH="$ARTIFACT_DIR/current-phase.txt"
LATEST_PROOF_BUNDLE_PATH="$ARTIFACT_DIR/latest-proof-bundle.txt"
POSTGRES_META_PATH="$ARTIFACT_DIR/postgres.meta.json"
POSTGRES_INSPECT_PATH="$ARTIFACT_DIR/postgres.inspect.json"
POSTGRES_LOGS_PATH="$ARTIFACT_DIR/postgres.logs.txt"
PACKAGE_ROOT_METADATA_PATH="$ARTIFACT_DIR/package-root.meta.json"
RETAINED_PROOF_BUNDLE_DIR="$ARTIFACT_DIR/retained-proof-bundle"
BUILD_ARTIFACT_DIR="$ARTIFACT_DIR/build-proof"
SMOKE_ARTIFACT_DIR="$ARTIFACT_DIR/runtime-smoke"
POSTGRES_IMAGE="postgres:16"
POSTGRES_CONTAINER_PREFIX="mesh-m051-s01-maintainer"
PHASE_TIMEOUT_SECONDS=1800
POSTGRES_START_TIMEOUT_SECONDS=25
POSTGRES_CONTAINER_NAME=""
DATABASE_URL=""
POSTGRES_HOST_PORT=""

repo_rel() {
  local candidate="$1"
  if [[ "$candidate" == "$ROOT_DIR/"* ]]; then
    printf '%s\n' "${candidate#"$ROOT_DIR"/}"
  else
    printf '%s\n' "$candidate"
  fi
}

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

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail_phase init "required command missing from PATH: ${command_name}"
  fi
}

require_file() {
  local phase="$1"
  local path="$2"
  local description="$3"
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
  fail_phase "$phase" "missing required file: $(repo_rel "$path")" "$log_path"
}

pick_unused_port() {
  python3 - <<'PY'
import socket

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

capture_postgres_state() {
  if [[ -z "$POSTGRES_CONTAINER_NAME" ]]; then
    return 0
  fi

  local logs_output inspect_output
  logs_output="$(docker logs "$POSTGRES_CONTAINER_NAME" 2>&1 || true)"
  printf '%s\n' "$logs_output" >"$POSTGRES_LOGS_PATH"

  inspect_output="$(docker inspect "$POSTGRES_CONTAINER_NAME" 2>/dev/null || true)"
  if [[ -n "$inspect_output" ]]; then
    printf '%s\n' "$inspect_output" >"$POSTGRES_INSPECT_PATH"
  fi
}

cleanup_postgres_container() {
  if [[ -z "$POSTGRES_CONTAINER_NAME" ]]; then
    return 0
  fi
  capture_postgres_state
  docker rm -f "$POSTGRES_CONTAINER_NAME" >/dev/null 2>&1 || true
}

on_exit() {
  local exit_code=$?
  cleanup_postgres_container
  if [[ $exit_code -eq 0 ]]; then
    printf 'ok\n' >"$STATUS_PATH"
    printf 'complete\n' >"$CURRENT_PHASE_PATH"
  elif [[ ! -f "$STATUS_PATH" || "$(<"$STATUS_PATH")" != "failed" ]]; then
    printf 'failed\n' >"$STATUS_PATH"
  fi
}
trap on_exit EXIT

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
  if ! python3 - "$log_path" "$label" >"$ARTIFACT_DIR/${label}.test-count.log" 2>&1 <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(errors="replace")
label = sys.argv[2]
running_counts = [int(value) for value in re.findall(r"running (\d+) test", text)]
passed_counts = [int(value) for value in re.findall(r"(\d+)\s+passed", text)]
if running_counts:
    if max(running_counts) <= 0:
        raise SystemExit(f"{label}: test filter ran 0 tests")
    print(f"{label}: running-counts={running_counts}")
    raise SystemExit(0)
if passed_counts:
    if max(passed_counts) <= 0:
        raise SystemExit(f"{label}: mesh test output reported 0 passed")
    print(f"{label}: passed-counts={passed_counts}")
    raise SystemExit(0)
raise SystemExit(f"{label}: missing test-count evidence")
PY
  then
    fail_phase "$phase" "named test filter ran 0 tests or produced malformed output" "$ARTIFACT_DIR/${label}.test-count.log"
  fi
}

run_expect_success() {
  local phase="$1"
  local label="$2"
  local require_tests="$3"
  local timeout_secs="$4"
  shift 4
  local -a cmd=("$@")
  local log_path="$ARTIFACT_DIR/${label}.log"
  record_phase "$phase" started
  printf '%s\n' "$phase" >"$CURRENT_PHASE_PATH"
  echo "==> ${cmd[*]}"
  if ! run_command "$timeout_secs" "$log_path" "${cmd[@]}"; then
    record_phase "$phase" failed
    fail_phase "$phase" "expected success within ${timeout_secs}s" "$log_path"
  fi
  if [[ "$require_tests" == "yes" ]]; then
    assert_test_filter_ran "$phase" "$log_path" "$label"
  fi
  record_phase "$phase" passed
}

start_postgres_container() {
  local phase="$1"
  local log_path="$ARTIFACT_DIR/${phase}.log"
  begin_phase "$phase"

  POSTGRES_HOST_PORT="$(pick_unused_port)"
  POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_PREFIX}-${POSTGRES_HOST_PORT}"
  DATABASE_URL="postgres://mesh:mesh@127.0.0.1:${POSTGRES_HOST_PORT}/mesher"

  local run_status=0
  run_command "$PHASE_TIMEOUT_SECONDS" "$log_path" \
    docker run --rm -d --name "$POSTGRES_CONTAINER_NAME" \
      -e POSTGRES_USER=mesh \
      -e POSTGRES_PASSWORD=mesh \
      -e POSTGRES_DB=mesher \
      -p "127.0.0.1:${POSTGRES_HOST_PORT}:5432" \
      "$POSTGRES_IMAGE" || run_status=$?
  if [[ $run_status -ne 0 ]]; then
    record_phase "$phase" failed
    if [[ $run_status -eq 124 ]]; then
      fail_phase "$phase" "timed out while starting temporary Postgres" "$log_path"
    fi
    fail_phase "$phase" "failed to start temporary Postgres container" "$log_path"
  fi

  python3 - "$POSTGRES_META_PATH" "$POSTGRES_CONTAINER_NAME" "$POSTGRES_IMAGE" "$POSTGRES_HOST_PORT" <<'PY'
from pathlib import Path
import json
import sys

Path(sys.argv[1]).write_text(
    json.dumps(
        {
            "container_name": sys.argv[2],
            "image": sys.argv[3],
            "host_port": int(sys.argv[4]),
            "database_url": "<redacted:DATABASE_URL>",
        },
        indent=2,
    )
    + "\n"
)
PY

  local ready=0
  local ready_log="$ARTIFACT_DIR/${phase}.ready.log"
  : >"$ready_log"
  for _ in $(seq 1 "$POSTGRES_START_TIMEOUT_SECONDS"); do
    if PGPASSWORD=mesh psql "$DATABASE_URL" -c 'select 1' >/dev/null 2>>"$ready_log"; then
      ready=1
      break
    fi
    sleep 1
  done

  if [[ $ready -ne 1 ]]; then
    record_phase "$phase" failed
    fail_phase "$phase" "temporary Postgres never became ready" "$ready_log" "$POSTGRES_META_PATH"
  fi

  record_phase "$phase" passed
}

run_contract_checks() {
  local log_path="$1"
  python3 - "$ROOT_DIR" >"$log_path" 2>&1 <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
runbook = root / 'mesher/README.md'
env_file = root / 'mesher/.env.example'
root_readme = root / 'README.md'
wrapper = root / 'scripts/verify-m051-s01.sh'
package_verifier = root / 'mesher/scripts/verify-maintainer-surface.sh'
landing_verifier = root / 'scripts/verify-landing-surface.sh'
ci_workflow = root / '.github/workflows/ci.yml'

def read(path: Path) -> str:
    return path.read_text(errors='replace')

texts = {
    'runbook': read(runbook),
    'env': read(env_file),
    'root_readme': read(root_readme),
    'wrapper': read(wrapper),
    'package_verifier': read(package_verifier),
    'landing_verifier': read(landing_verifier),
    'ci_workflow': read(ci_workflow),
}


def require_contains(label: str, needle: str, description: str) -> None:
    if needle not in texts[label]:
        raise SystemExit(f"{description}: missing {needle!r} in {label}")


def require_not_contains(label: str, needle: str, description: str) -> None:
    if needle in texts[label]:
        raise SystemExit(f"{description}: stale {needle!r} still present in {label}")

for needle in [
    'bash mesher/scripts/test.sh',
    'bash mesher/scripts/build.sh .tmp/mesher-build',
    'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/migrate.sh status',
    'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/migrate.sh up',
    'bash mesher/scripts/verify-maintainer-surface.sh',
    'bash scripts/verify-m051-s01.sh',
]:
    require_contains('runbook', needle, 'Mesher runbook command')

for needle in [
    'cargo test -p meshc --test e2e_m051_s01 -- --nocapture',
    'compiler/meshc/tests/e2e_m051_s01.rs',
    'reference-backend',
]:
    require_not_contains('runbook', needle, 'Mesher runbook boundary')
    require_not_contains('env', needle, '.env boundary')
    require_not_contains('wrapper', needle, 'product wrapper boundary')

for key in [
    'DATABASE_URL',
    'PORT',
    'MESHER_WS_PORT',
    'MESHER_RATE_LIMIT_WINDOW_SECONDS',
    'MESHER_RATE_LIMIT_MAX_EVENTS',
]:
    require_contains('runbook', key, 'Mesher runbook env contract')
    require_contains('env', key, '.env contract')

for needle in [
    'Hyperpush',
    'mesher/client',
    'does **not** own the Mesh language/compiler/runtime/docs/registry/packages-site tree',
    'bash mesher/scripts/verify-maintainer-surface.sh',
    'bash scripts/verify-landing-surface.sh',
]:
    require_contains('root_readme', needle, 'product root README marker')

for needle in [
    '[verify-m051-s01] product-root wrapper delegating to bash mesher/scripts/verify-maintainer-surface.sh',
    'DELEGATED_VERIFIER="$ROOT_DIR/mesher/scripts/verify-maintainer-surface.sh"',
    'require_phase_marker "$expected_phase"',
    "product-contract",
    'verify-m051-s01: ok',
]:
    require_contains('wrapper', needle, 'product wrapper marker')

for needle in [
    'bash mesher/scripts/test.sh',
    'bash mesher/scripts/build.sh "$BUILD_ARTIFACT_DIR"',
    'bash mesher/scripts/migrate.sh status',
    'bash mesher/scripts/migrate.sh up',
    'bash mesher/scripts/smoke.sh',
    'mesher-package-tests',
    'mesher-package-build',
    'mesher-postgres-start',
    'mesher-migrate-status',
    'mesher-migrate-up',
    'mesher-runtime-smoke',
    'mesher-bundle-shape',
    'verify-maintainer-surface: ok',
]:
    require_contains('package_verifier', needle, 'package verifier marker')

for needle in [
    'name: Product CI',
    'Verify Mesher maintainer surface',
    'bash scripts/verify-m051-s01.sh',
    'bash scripts/verify-landing-surface.sh',
    'npm --prefix mesher/landing ci',
    'npm --prefix mesher/client ci',
    'npm --prefix mesher/client run build',
]:
    require_contains('ci_workflow', needle, 'product CI marker')

print('product maintainer contract: ok')
PY
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
        f'latest-proof-bundle pointer drifted: expected {expected_pointer!r}, got {actual_pointer!r}'
    )

required_files = [
    'mesher.scripts.verify-maintainer-surface.sh',
    'mesher.scripts.test.sh',
    'mesher.scripts.build.sh',
    'mesher.scripts.migrate.sh',
    'mesher.scripts.smoke.sh',
    'mesher.scripts.lib.mesh-toolchain.sh',
    'scripts.verify-m051-s01.sh',
    'package-root.meta.json',
    'postgres.meta.json',
    'postgres.logs.txt',
    'retained-build/mesher',
    'retained-runtime-smoke/build/mesher',
    'retained-runtime-smoke/mesher.log',
]
for relative in required_files:
    if not (bundle_root / relative).exists():
        raise SystemExit(f"{bundle_root}: missing required retained file {relative}")

print('retained bundle shape: ok')
PY
  then
    fail_phase "$phase" "retained bundle pointer or artifact shape drifted" "$log_path" "$bundle_root"
  fi
}

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"
exec > >(tee "$ARTIFACT_DIR/full-contract.log") 2>&1

: >"$PHASE_REPORT_PATH"
printf 'running\n' >"$STATUS_PATH"
printf 'init\n' >"$CURRENT_PHASE_PATH"

record_phase init started
for command_name in bash docker psql python3; do
  require_command "$command_name"
done
for path in \
  "$ROOT_DIR/mesher/mesh.toml" \
  "$ROOT_DIR/mesher/scripts/test.sh" \
  "$ROOT_DIR/mesher/scripts/build.sh" \
  "$ROOT_DIR/mesher/scripts/migrate.sh" \
  "$ROOT_DIR/mesher/scripts/smoke.sh" \
  "$ROOT_DIR/scripts/verify-m051-s01.sh" \
  "$ROOT_DIR/.github/workflows/ci.yml"; do
  require_file init "$path" "required product maintainer surface"
done
python3 - "$PACKAGE_ROOT_METADATA_PATH" "$ROOT_DIR/mesher" <<'PY'
from pathlib import Path
import json
import sys

package_root = Path(sys.argv[2]).resolve()
Path(sys.argv[1]).write_text(
    json.dumps(
        {
            "package_root": str(package_root),
            "toolchain_script": str((package_root / 'scripts/lib/mesh-toolchain.sh').resolve()),
            "test_script": str((package_root / 'scripts/test.sh').resolve()),
            "build_script": str((package_root / 'scripts/build.sh').resolve()),
            "migrate_script": str((package_root / 'scripts/migrate.sh').resolve()),
            "smoke_script": str((package_root / 'scripts/smoke.sh').resolve()),
            "product_wrapper": str((package_root.parent / 'scripts/verify-m051-s01.sh').resolve()),
        },
        indent=2,
    )
    + "\n"
)
PY
record_phase init passed

run_expect_success mesher-package-tests mesher-package-tests yes "$PHASE_TIMEOUT_SECONDS" \
  bash mesher/scripts/test.sh
run_expect_success mesher-package-build mesher-package-build no "$PHASE_TIMEOUT_SECONDS" \
  bash mesher/scripts/build.sh "$BUILD_ARTIFACT_DIR"

record_phase product-contract started
printf '%s\n' 'product-contract' >"$CURRENT_PHASE_PATH"
if ! run_contract_checks "$ARTIFACT_DIR/product-contract.log"; then
  record_phase product-contract failed
  fail_phase product-contract "product maintainer contract drifted" "$ARTIFACT_DIR/product-contract.log"
fi
record_phase product-contract passed

start_postgres_container mesher-postgres-start
run_expect_success mesher-migrate-status mesher-migrate-status no "$PHASE_TIMEOUT_SECONDS" \
  env DATABASE_URL="$DATABASE_URL" bash mesher/scripts/migrate.sh status
run_expect_success mesher-migrate-up mesher-migrate-up no "$PHASE_TIMEOUT_SECONDS" \
  env DATABASE_URL="$DATABASE_URL" bash mesher/scripts/migrate.sh up
SMOKE_CLUSTER_PORT="$(pick_unused_port)"
run_expect_success mesher-runtime-smoke mesher-runtime-smoke no "$PHASE_TIMEOUT_SECONDS" \
  env DATABASE_URL="$DATABASE_URL" PORT="$(pick_unused_port)" MESHER_WS_PORT="$(pick_unused_port)" MESHER_SMOKE_ARTIFACT_DIR="$SMOKE_ARTIFACT_DIR" MESH_CLUSTER_PORT="$SMOKE_CLUSTER_PORT" MESH_NODE_NAME="mesher@127.0.0.1:${SMOKE_CLUSTER_PORT}" bash mesher/scripts/smoke.sh

begin_phase mesher-bundle-shape
capture_postgres_state
rm -rf "$RETAINED_PROOF_BUNDLE_DIR"
mkdir -p "$RETAINED_PROOF_BUNDLE_DIR"
cp "$ROOT_DIR/mesher/scripts/verify-maintainer-surface.sh" "$RETAINED_PROOF_BUNDLE_DIR/mesher.scripts.verify-maintainer-surface.sh"
cp "$ROOT_DIR/mesher/scripts/test.sh" "$RETAINED_PROOF_BUNDLE_DIR/mesher.scripts.test.sh"
cp "$ROOT_DIR/mesher/scripts/build.sh" "$RETAINED_PROOF_BUNDLE_DIR/mesher.scripts.build.sh"
cp "$ROOT_DIR/mesher/scripts/migrate.sh" "$RETAINED_PROOF_BUNDLE_DIR/mesher.scripts.migrate.sh"
cp "$ROOT_DIR/mesher/scripts/smoke.sh" "$RETAINED_PROOF_BUNDLE_DIR/mesher.scripts.smoke.sh"
cp "$ROOT_DIR/mesher/scripts/lib/mesh-toolchain.sh" "$RETAINED_PROOF_BUNDLE_DIR/mesher.scripts.lib.mesh-toolchain.sh"
cp "$ROOT_DIR/scripts/verify-m051-s01.sh" "$RETAINED_PROOF_BUNDLE_DIR/scripts.verify-m051-s01.sh"
cp "$PACKAGE_ROOT_METADATA_PATH" "$RETAINED_PROOF_BUNDLE_DIR/package-root.meta.json"
cp "$POSTGRES_META_PATH" "$RETAINED_PROOF_BUNDLE_DIR/postgres.meta.json"
cp "$POSTGRES_LOGS_PATH" "$RETAINED_PROOF_BUNDLE_DIR/postgres.logs.txt"
if [[ -f "$POSTGRES_INSPECT_PATH" ]]; then
  cp "$POSTGRES_INSPECT_PATH" "$RETAINED_PROOF_BUNDLE_DIR/postgres.inspect.json"
fi
cp -R "$BUILD_ARTIFACT_DIR" "$RETAINED_PROOF_BUNDLE_DIR/retained-build"
cp -R "$SMOKE_ARTIFACT_DIR" "$RETAINED_PROOF_BUNDLE_DIR/retained-runtime-smoke"
printf '%s\n' "$RETAINED_PROOF_BUNDLE_DIR" >"$LATEST_PROOF_BUNDLE_PATH"
assert_retained_bundle_shape mesher-bundle-shape "$RETAINED_PROOF_BUNDLE_DIR" "$LATEST_PROOF_BUNDLE_PATH"
record_phase mesher-bundle-shape passed

for expected_phase in \
  init \
  mesher-package-tests \
  mesher-package-build \
  product-contract \
  mesher-postgres-start \
  mesher-migrate-status \
  mesher-migrate-up \
  mesher-runtime-smoke \
  mesher-bundle-shape; do
  if ! grep -Fq -- "${expected_phase}	passed" "$PHASE_REPORT_PATH"; then
    fail_phase final-phase-report "phase report missing passed marker for ${expected_phase}" "$PHASE_REPORT_PATH"
  fi
done

echo "verify-maintainer-surface: ok"
echo "artifacts: $(repo_rel "$ARTIFACT_DIR")"
echo "proof bundle: $(repo_rel "$RETAINED_PROOF_BUNDLE_DIR")"
