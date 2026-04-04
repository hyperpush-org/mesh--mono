#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROOF_PAGE="website/docs/docs/production-backend-proof/index.md"
README_FILE="README.md"
RUNBOOK_FILE="reference-backend/README.md"
SIDEBAR_FILE="website/docs/.vitepress/config.mts"
GETTING_STARTED_FILE="website/docs/docs/getting-started/index.md"
PROOF_LINK="/docs/production-backend-proof/"
PROOF_URL="https://meshlang.dev/docs/production-backend-proof/"
CLUSTERED_EXAMPLE_LINK="/docs/getting-started/clustered-example/"
CLUSTERED_EXAMPLE_URL="https://meshlang.dev/docs/getting-started/clustered-example/"
README_CLUSTERED_EXAMPLE_NEXT_STEP='- **Clustered walkthrough:** use `meshc init --clustered` and then follow https://meshlang.dev/docs/getting-started/clustered-example/'
README_PROOF_NEXT_STEP='- **Production Backend Proof:** https://meshlang.dev/docs/production-backend-proof/'
GETTING_STARTED_CLUSTERED_EXAMPLE_NEXT_STEP='- [Clustered Example](/docs/getting-started/clustered-example/)'
GETTING_STARTED_PROOF_NEXT_STEP='- [Production Backend Proof](/docs/production-backend-proof/)'
RUNBOOK_REF="reference-backend/README.md"
RUNBOOK_LINK="https://github.com/snowdamiz/mesh-lang/blob/main/reference-backend/README.md"
CANONICAL_PUBLIC_PROOF_COMMANDS=(
  'cargo run -p meshc -- build reference-backend'
  'cargo run -p meshc -- fmt --check reference-backend'
  'cargo run -p meshc -- test reference-backend'
  'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_migration_status_and_apply -- --ignored --nocapture'
  'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture'
  'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_crash_recovers_job -- --ignored --nocapture'
  'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_restart_is_visible_in_health -- --ignored --nocapture'
  'DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_process_restart_recovers_inflight_job -- --ignored --nocapture'
  'bash reference-backend/scripts/verify-production-proof-surface.sh'
)
RECOVERY_RUNBOOK_STRINGS=(
  'Supervision and recovery'
  'restart_count'
  'last_exit_reason'
  'recovered_jobs'
  'last_recovery_at'
  'last_recovery_job_id'
  'last_recovery_count'
  'recovery_active'
  'Worker crash proof'
  'Process restart proof'
)
PROOF_PAGE_RECOVERY_STRINGS=(
  'restart_count'
  'last_exit_reason'
  'recovered_jobs'
  'last_recovery_at'
  'last_recovery_job_id'
  'last_recovery_count'
  'recovery_active'
  'Worker crash recovery'
  'Whole-process restart recovery'
  'Recovery window visibility'
)

phase() {
  printf '[proof-docs] %s\n' "$*"
}

fail() {
  printf '[proof-docs] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "required command missing from PATH: $command_name"
  fi
}

require_file() {
  local relative_path="$1"
  if [[ ! -f "$ROOT/$relative_path" ]]; then
    fail "missing file: $relative_path"
  fi
}

require_contains() {
  local relative_path="$1"
  local needle="$2"
  local description="$3"
  if ! rg -Fq "$needle" "$ROOT/$relative_path"; then
    fail "$relative_path missing ${description}: $needle"
  fi
}

require_not_contains() {
  local relative_path="$1"
  local needle="$2"
  local description="$3"
  if rg -Fq "$needle" "$ROOT/$relative_path"; then
    fail "$relative_path still contains ${description}: $needle"
  fi
}

require_order() {
  local relative_path="$1"
  local first="$2"
  local second="$3"
  local description="$4"
  local output
  if ! output=$(python3 - "$ROOT/$relative_path" "$first" "$second" "$description" 2>&1 <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
first = sys.argv[2]
second = sys.argv[3]
description = sys.argv[4]
text = path.read_text(errors='replace')
first_index = text.find(first)
if first_index == -1:
    raise SystemExit(f"{description}: missing first marker {first!r} in {path}")
second_index = text.find(second)
if second_index == -1:
    raise SystemExit(f"{description}: missing second marker {second!r} in {path}")
if first_index >= second_index:
    raise SystemExit(
        f"{description}: expected {first!r} before {second!r} in {path}, got indexes {first_index} >= {second_index}"
    )
print(f"{description}: {first!r} precedes {second!r}")
PY
); then
    fail "$output"
  fi
}

phase "checking prerequisites"
require_command rg
require_command python3

phase "checking canonical files exist"
require_file "$PROOF_PAGE"
require_file "$README_FILE"
require_file "$RUNBOOK_FILE"
require_file "$SIDEBAR_FILE"
require_file "$GETTING_STARTED_FILE"

phase "checking public entrypoints keep the production proof surface discoverable but secondary"
require_contains "$README_FILE" "$PROOF_URL" "production proof link"
require_contains "$README_FILE" "$RUNBOOK_REF" "reference backend runbook reference"
require_contains "$README_FILE" "$CLUSTERED_EXAMPLE_URL" "clustered example link"
require_order \
  "$README_FILE" \
  "$README_CLUSTERED_EXAMPLE_NEXT_STEP" \
  "$README_PROOF_NEXT_STEP" \
  'README keeps the clustered example ahead of the production proof path'

require_contains "$GETTING_STARTED_FILE" "$PROOF_LINK" "production proof link"
require_contains "$GETTING_STARTED_FILE" "$RUNBOOK_REF" "reference backend runbook reference"
require_contains "$GETTING_STARTED_FILE" "$CLUSTERED_EXAMPLE_LINK" "clustered example link"
require_order \
  "$GETTING_STARTED_FILE" \
  "$GETTING_STARTED_CLUSTERED_EXAMPLE_NEXT_STEP" \
  "$GETTING_STARTED_PROOF_NEXT_STEP" \
  'Getting Started keeps Clustered Example ahead of Production Backend Proof'

phase "checking the sidebar keeps the production proof surface public but secondary"
if ! python3 - "$ROOT/$SIDEBAR_FILE" "$PROOF_LINK" <<'PY'
from pathlib import Path
import re
import sys

config_path = Path(sys.argv[1])
proof_link = sys.argv[2]
text = config_path.read_text(errors='replace')
sidebar_block_match = re.search(
    r"sidebar:\s*{\s*'/docs/': \[(?P<block>[\s\S]*?)\n\s*\],\s*\n\s*},\s*\n\s*outline:",
    text,
    re.MULTILINE,
)
if not sidebar_block_match:
    raise SystemExit('unable to locate /docs/ sidebar block')
sidebar_block = sidebar_block_match.group('block')

group_pattern = re.compile(
    r"{\s*text:\s*'(?P<name>[^']+)'[\s\S]*?items:\s*\[(?P<items>[\s\S]*?)\]\s*,\s*}",
    re.MULTILINE,
)
groups = {match.group('name'): match.group('items') for match in group_pattern.finditer(sidebar_block)}

for required_group in ['Getting Started', 'Reference', 'Proof Surfaces']:
    if required_group not in groups:
        raise SystemExit(f'missing sidebar group: {required_group}')

proof_items = groups['Proof Surfaces']
proof_match = re.search(
    r"text:\s*'Production Backend Proof'[\s\S]*?link:\s*'(?P<link>[^']+)'(?P<tail>[\s\S]*?)}\s*as any",
    proof_items,
    re.MULTILINE,
)
if not proof_match:
    raise SystemExit('missing Production Backend Proof item inside Proof Surfaces')
if proof_match.group('link') != proof_link:
    raise SystemExit(
        f'production proof link drifted: expected {proof_link!r}, got {proof_match.group("link")!r}'
    )
if 'includeInFooter: false' not in proof_match.group('tail'):
    raise SystemExit('Production Backend Proof is no longer opted out of the footer chain')
if proof_link in groups['Getting Started']:
    raise SystemExit('Production Backend Proof drifted back into the Getting Started group')
if sidebar_block.count(proof_link) != 1:
    raise SystemExit(
        f'expected the production proof link exactly once in the /docs/ sidebar, found {sidebar_block.count(proof_link)} copies'
    )

reference_index = sidebar_block.find("text: 'Reference'")
proof_surfaces_index = sidebar_block.find("text: 'Proof Surfaces'")
if reference_index == -1 or proof_surfaces_index == -1:
    raise SystemExit('missing Reference or Proof Surfaces group ordering markers')
if proof_surfaces_index <= reference_index:
    raise SystemExit('Proof Surfaces no longer stays after Reference in the public docs graph')

print('proof-sidebar-secondary: ok')
PY
then
  fail "sidebar no longer keeps Production Backend Proof public-secondary"
fi

phase "checking the proof page opts out of the footer chain"
require_contains "$PROOF_PAGE" 'prev: false' 'proof-page footer prev opt-out marker'
require_contains "$PROOF_PAGE" 'next: false' 'proof-page footer next opt-out marker'

phase "checking proof page points at the real runbook and verifier"
require_contains "$PROOF_PAGE" "$RUNBOOK_REF" "reference backend runbook reference"
require_contains "$PROOF_PAGE" "$RUNBOOK_LINK" "reference backend runbook link"
require_contains "$PROOF_PAGE" "bash reference-backend/scripts/verify-production-proof-surface.sh" "doc truth verification command"

phase "checking the runbook exposes the recovery contract"
for needle in "${RECOVERY_RUNBOOK_STRINGS[@]}"; do
  require_contains "$RUNBOOK_FILE" "$needle" "recovery runbook wording"
done

phase "checking the proof page exposes the recovery-aware public contract"
for needle in "${PROOF_PAGE_RECOVERY_STRINGS[@]}"; do
  require_contains "$PROOF_PAGE" "$needle" "recovery proof wording"
done

phase "checking the runbook and proof page share the same authoritative command list"
for needle in "${CANONICAL_PUBLIC_PROOF_COMMANDS[@]}"; do
  require_contains "$RUNBOOK_FILE" "$needle" "canonical public proof command"
  require_contains "$PROOF_PAGE" "$needle" "canonical public proof command"
done

phase "checking stale phrases are gone"
require_not_contains "$GETTING_STARTED_FILE" "mesh-lang.org/install.sh" "stale install URL"
require_not_contains "$README_FILE" "placeholder link" "placeholder documentation wording"
require_not_contains "$README_FILE" "### Production Ready" "implicit production-ready heading"

phase "production proof surface verified"
