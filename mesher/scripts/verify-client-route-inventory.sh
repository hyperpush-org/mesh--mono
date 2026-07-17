#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MESHER_ROOT="$ROOT_DIR/mesher"
CLIENT_ROOT="$MESHER_ROOT/client"
ARTIFACT_DIR="$MESHER_ROOT/.tmp/m061-s01/verify-client-route-inventory"
PHASE_REPORT_PATH="$ARTIFACT_DIR/phase-report.txt"
STATUS_PATH="$ARTIFACT_DIR/status.txt"
CURRENT_PHASE_PATH="$ARTIFACT_DIR/current-phase.txt"
FULL_LOG_PATH="$ARTIFACT_DIR/full-contract.log"
LATEST_BUNDLE_PATH="$ARTIFACT_DIR/latest-proof-bundle.txt"
BUNDLE_DIR="$ARTIFACT_DIR/retained-proof-bundle"

readonly ROOT_DIR MESHER_ROOT CLIENT_ROOT ARTIFACT_DIR PHASE_REPORT_PATH STATUS_PATH
readonly CURRENT_PHASE_PATH FULL_LOG_PATH LATEST_BUNDLE_PATH BUNDLE_DIR

record_phase() {
  printf '%s\t%s\n' "$1" "$2" >>"$PHASE_REPORT_PATH"
}

begin_phase() {
  printf '%s\n' "$1" >"$CURRENT_PHASE_PATH"
  record_phase "$1" started
}

fail_phase() {
  local phase="$1"
  local log_path="$2"
  printf 'failed\n' >"$STATUS_PATH"
  printf '%s\n' "$phase" >"$CURRENT_PHASE_PATH"
  record_phase "$phase" failed
  printf 'verify-client-route-inventory: %s failed\n' "$phase" >&2
  sed -n '1,220p' "$log_path" >&2
  exit 1
}

run_phase() {
  local phase="$1"
  shift
  local log_path="$ARTIFACT_DIR/${phase}.log"
  begin_phase "$phase"
  if "$@" >"$log_path" 2>&1; then
    record_phase "$phase" passed
    return
  fi
  fail_phase "$phase" "$log_path"
}

on_exit() {
  local status=$?
  if [[ $status -eq 0 ]]; then
    printf 'ok\n' >"$STATUS_PATH"
    printf 'complete\n' >"$CURRENT_PHASE_PATH"
  elif [[ ! -f "$STATUS_PATH" || "$(<"$STATUS_PATH")" != 'failed' ]]; then
    printf 'failed\n' >"$STATUS_PATH"
  fi
}
trap on_exit EXIT

rm -rf -- "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"
: >"$PHASE_REPORT_PATH"
printf 'running\n' >"$STATUS_PATH"
printf 'init\n' >"$CURRENT_PHASE_PATH"
exec > >(tee "$FULL_LOG_PATH") 2>&1

begin_phase init
for required in \
  "$MESHER_ROOT/capabilities.json" \
  "$MESHER_ROOT/capabilities.runtime.json" \
  "$MESHER_ROOT/landing/lib/capabilities.public.json" \
  "$CLIENT_ROOT/ROUTE-INVENTORY.md" \
  "$CLIENT_ROOT/tests/e2e/mock-surface-closeout.spec.ts" \
  "$MESHER_ROOT/scripts/tests/verify-client-route-inventory.test.mjs"; do
  if [[ ! -f "$required" ]]; then
    fail_phase init "$FULL_LOG_PATH"
  fi
done
record_phase init passed

run_phase route-inventory-structure \
  node --test "$MESHER_ROOT/scripts/tests/verify-client-route-inventory.test.mjs"

# Preserve the legacy phase names consumed by scripts/verify-m061-s04.sh. The browser suite owns
# deterministic fixture creation now; these phases validate the seed entry points before that suite.
run_phase seed-live-issue bash -n "$MESHER_ROOT/scripts/seed-live-issue.sh"
run_phase seed-live-admin-ops bash -n "$MESHER_ROOT/scripts/seed-live-admin-ops.sh"

run_phase route-inventory-dev \
  env PLAYWRIGHT_PROJECT=dev npm --prefix "$CLIENT_ROOT" run test:e2e:dev -- --grep "mock surface closeout"

run_phase route-inventory-prod \
  env PLAYWRIGHT_PROJECT=prod npm --prefix "$CLIENT_ROOT" run test:e2e:prod -- --grep "mock surface closeout"

begin_phase retained-proof-bundle
rm -rf -- "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/proof-inputs"
for artifact in \
  full-contract.log \
  phase-report.txt \
  route-inventory-structure.log \
  seed-live-issue.log \
  seed-live-admin-ops.log \
  route-inventory-dev.log \
  route-inventory-prod.log; do
  cp "$ARTIFACT_DIR/$artifact" "$BUNDLE_DIR/$artifact"
done
cp "$MESHER_ROOT/capabilities.json" "$BUNDLE_DIR/proof-inputs/capabilities.json"
cp "$MESHER_ROOT/capabilities.runtime.json" "$BUNDLE_DIR/proof-inputs/capabilities.runtime.json"
cp "$MESHER_ROOT/landing/lib/capabilities.public.json" "$BUNDLE_DIR/proof-inputs/capabilities.public.json"
cp "$CLIENT_ROOT/ROUTE-INVENTORY.md" "$BUNDLE_DIR/proof-inputs/client.ROUTE-INVENTORY.md"
cp "$CLIENT_ROOT/tests/e2e/mock-surface-closeout.spec.ts" "$BUNDLE_DIR/proof-inputs/mock-surface-closeout.spec.ts"
cp "$MESHER_ROOT/scripts/tests/verify-client-route-inventory.test.mjs" "$BUNDLE_DIR/proof-inputs/verify-client-route-inventory.test.mjs"
printf '%s\n' "$BUNDLE_DIR" >"$LATEST_BUNDLE_PATH"
record_phase retained-proof-bundle passed

for phase in init route-inventory-structure seed-live-issue seed-live-admin-ops route-inventory-dev route-inventory-prod retained-proof-bundle; do
  grep -Fq -- "${phase}"$'\tpassed' "$PHASE_REPORT_PATH" || fail_phase final-phase-report "$PHASE_REPORT_PATH"
done

printf 'verify-client-route-inventory: ok\n'
printf 'artifacts: %s\n' "${ARTIFACT_DIR#"$ROOT_DIR"/}"
