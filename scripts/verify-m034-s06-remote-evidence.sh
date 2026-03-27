#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERIFY_SCRIPT_PATH="${M034_S05_VERIFY_SCRIPT:-$ROOT_DIR/scripts/verify-m034-s05.sh}"
VERIFY_ROOT="${M034_S05_VERIFY_ROOT:-$ROOT_DIR/.tmp/m034-s05/verify}"
EVIDENCE_ROOT="${M034_S06_EVIDENCE_ROOT:-$ROOT_DIR/.tmp/m034-s06/evidence}"
STOP_AFTER_PHASE="remote-evidence"
ARCHIVE_LABEL="${1:-}"

print_usage() {
  cat <<'EOF' >&2
usage: bash scripts/verify-m034-s06-remote-evidence.sh <label>
EOF
}

fail() {
  local message="$1"
  echo "verify-m034-s06-remote-evidence: ${message}" >&2
  exit 1
}

require_file() {
  local file_path="$1"
  local description="$2"

  if [[ ! -f "$file_path" ]]; then
    fail "missing ${description} at ${file_path#$ROOT_DIR/}"
  fi
}

if [[ "$#" -ne 1 || -z "$ARCHIVE_LABEL" ]]; then
  print_usage
  exit 64
fi

if [[ ! "$ARCHIVE_LABEL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  fail "archive label must match ^[A-Za-z0-9][A-Za-z0-9._-]*$: ${ARCHIVE_LABEL}"
fi

if [[ ! -f "$VERIFY_SCRIPT_PATH" ]]; then
  fail "missing S05 verifier at ${VERIFY_SCRIPT_PATH#$ROOT_DIR/}"
fi

mkdir -p "$EVIDENCE_ROOT"

ARCHIVE_PATH="$EVIDENCE_ROOT/$ARCHIVE_LABEL"
STAGING_PATH="$EVIDENCE_ROOT/.${ARCHIVE_LABEL}.tmp.$$"

if [[ -e "$ARCHIVE_PATH" || -e "$STAGING_PATH" ]]; then
  fail "archive label already exists at ${ARCHIVE_PATH#$ROOT_DIR/}"
fi

cleanup() {
  rm -rf "$STAGING_PATH"
}
trap cleanup EXIT

S05_EXIT_CODE=0
if VERIFY_M034_S05_STOP_AFTER="$STOP_AFTER_PHASE" bash "$VERIFY_SCRIPT_PATH"; then
  S05_EXIT_CODE=0
else
  S05_EXIT_CODE=$?
fi

require_file "$VERIFY_ROOT/current-phase.txt" "current phase file"
require_file "$VERIFY_ROOT/status.txt" "status file"
require_file "$VERIFY_ROOT/phase-report.txt" "phase report"
require_file "$VERIFY_ROOT/candidate-tags.json" "candidate tags artifact"
require_file "$VERIFY_ROOT/remote-runs.json" "remote runs artifact"

if ! grep -Eq '^candidate-tags	passed$' "$VERIFY_ROOT/phase-report.txt"; then
  fail "candidate-tags did not complete before archive capture"
fi

if ! grep -Eq '^remote-evidence	started$' "$VERIFY_ROOT/phase-report.txt"; then
  fail "remote-evidence never started before archive capture"
fi

if ! grep -Eq '^remote-evidence	(passed|failed)$' "$VERIFY_ROOT/phase-report.txt"; then
  fail "remote-evidence did not emit a terminal status before archive capture"
fi

if grep -Eq '^(public-http|s01-live-proof)	' "$VERIFY_ROOT/phase-report.txt"; then
  fail "stop-after remote-evidence drifted into later S05 phases"
fi

mkdir -p "$STAGING_PATH"
cp -R "$VERIFY_ROOT"/. "$STAGING_PATH"/

python3 - "$ROOT_DIR" "$ARCHIVE_LABEL" "$VERIFY_ROOT" "$STAGING_PATH" "$ARCHIVE_PATH" "$VERIFY_SCRIPT_PATH" "$S05_EXIT_CODE" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import json
import sys

root = Path(sys.argv[1]).resolve()
label = sys.argv[2]
verify_root = Path(sys.argv[3]).resolve()
archive_stage_root = Path(sys.argv[4]).resolve()
archive_final_root = Path(sys.argv[5]).resolve()
verify_script_path = Path(sys.argv[6]).resolve()
s05_exit_code = int(sys.argv[7])


def relative(path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def read_text(name: str):
    path = archive_stage_root / name
    if not path.is_file():
        return None
    return path.read_text().strip() or None


def load_json(name: str):
    path = archive_stage_root / name
    if not path.is_file():
        return None, f"missing {name}"
    try:
        return json.loads(path.read_text()), None
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON in {name}: {exc}"


def resolve_git_dir(repo_root: Path):
    dot_git = repo_root / '.git'
    if dot_git.is_dir():
        return dot_git.resolve()
    if dot_git.is_file():
        text = dot_git.read_text().strip()
        prefix = 'gitdir: '
        if text.startswith(prefix):
            return (repo_root / text[len(prefix):]).resolve()
    return None


def read_packed_ref(git_dir: Path, ref_name: str):
    packed_refs = git_dir / 'packed-refs'
    if not packed_refs.is_file():
        return None
    for line in packed_refs.read_text().splitlines():
        if not line or line.startswith('#') or line.startswith('^'):
            continue
        sha, name = line.split(' ', 1)
        if name == ref_name:
            return sha
    return None


def resolve_head(repo_root: Path):
    git_dir = resolve_git_dir(repo_root)
    if git_dir is None:
        return {'error': 'missing .git metadata'}

    head_path = git_dir / 'HEAD'
    if not head_path.is_file():
        return {'error': 'missing HEAD file', 'gitDir': relative(git_dir)}

    head_value = head_path.read_text().strip()
    result = {'gitDir': relative(git_dir), 'head': head_value}
    if head_value.startswith('ref: '):
        ref_name = head_value[len('ref: '):]
        ref_path = git_dir / ref_name
        sha = ref_path.read_text().strip() if ref_path.is_file() else read_packed_ref(git_dir, ref_name)
        result['ref'] = ref_name
        result['sha'] = sha
    else:
        result['sha'] = head_value
    return result


candidate_tags, candidate_tags_error = load_json('candidate-tags.json')
remote_runs, remote_runs_error = load_json('remote-runs.json')
phase_report = (archive_stage_root / 'phase-report.txt').read_text().splitlines()
remote_run_summaries = []
manifest_errors = []
required_freshness_fields = [
    'workflowFile',
    'status',
    'requiredHeadBranch',
    'expectedRef',
    'expectedHeadSha',
    'observedHeadSha',
    'freshnessStatus',
    'freshnessFailure',
]

if candidate_tags_error:
    manifest_errors.append(candidate_tags_error)
if remote_runs_error:
    manifest_errors.append(remote_runs_error)
if remote_runs is not None and not isinstance(remote_runs, dict):
    manifest_errors.append('remote-runs.json must decode to a JSON object')

if isinstance(remote_runs, dict):
    for workflow in remote_runs.get('workflows', []):
        if not isinstance(workflow, dict):
            manifest_errors.append('remote-runs.json contains a non-object workflow entry')
            continue

        missing_fields = [field for field in required_freshness_fields if field not in workflow]
        if missing_fields:
            workflow_name = workflow.get('workflowFile', '<unknown-workflow>')
            manifest_errors.append(
                f'{workflow_name} missing freshness fields in remote-runs.json: {missing_fields}'
            )
            continue

        summary = {
            'workflowFile': workflow.get('workflowFile'),
            'status': workflow.get('status'),
            'requiredHeadBranch': workflow.get('requiredHeadBranch'),
            'expectedRef': workflow.get('expectedRef'),
            'expectedHeadSha': workflow.get('expectedHeadSha'),
            'observedHeadSha': workflow.get('observedHeadSha'),
            'freshnessStatus': workflow.get('freshnessStatus'),
            'freshnessFailure': workflow.get('freshnessFailure'),
            'headShaMatchesExpected': workflow.get('headShaMatchesExpected'),
            'runUrl': None,
            'failure': workflow.get('failure'),
        }
        run_summary = workflow.get('runSummary')
        if isinstance(run_summary, dict):
            summary['headSha'] = run_summary.get('headSha')
            summary['headBranch'] = run_summary.get('headBranch')
            summary['runUrl'] = run_summary.get('url')
        latest_available = workflow.get('latestAvailableRun')
        if isinstance(latest_available, dict):
            summary['latestAvailableHeadSha'] = latest_available.get('headSha')
            summary['latestAvailableHeadBranch'] = latest_available.get('headBranch')
            summary['latestAvailableRunUrl'] = latest_available.get('url')
        remote_run_summaries.append(summary)

if manifest_errors:
    raise SystemExit('archive manifest drift:\n- ' + '\n- '.join(manifest_errors))

contents = sorted(path.relative_to(archive_stage_root).as_posix() for path in archive_stage_root.rglob('*') if path.is_file())
contents_with_manifest = sorted(contents + ['manifest.json'])
manifest = {
    'label': label,
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'sourceVerifyRoot': relative(verify_root),
    'archiveRoot': relative(archive_final_root),
    'verifyScript': relative(verify_script_path),
    'stopAfterPhase': 'remote-evidence',
    's05ExitCode': s05_exit_code,
    's05Status': read_text('status.txt'),
    'currentPhase': read_text('current-phase.txt'),
    'failedPhase': read_text('failed-phase.txt'),
    'phaseReport': phase_report,
    'gitRefs': {
      'localHead': resolve_head(root),
      'binaryTag': candidate_tags.get('binaryTag') if isinstance(candidate_tags, dict) else None,
      'extensionTag': candidate_tags.get('extensionTag') if isinstance(candidate_tags, dict) else None,
    },
    'artifacts': {
      'candidateTagsPath': 'candidate-tags.json',
      'candidateTagsParseError': candidate_tags_error,
      'remoteRunsPath': 'remote-runs.json',
      'remoteRunsParseError': remote_runs_error,
      'contents': contents_with_manifest,
    },
    'remoteRunsSummary': remote_run_summaries,
}
(archive_stage_root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
PY

require_file "$STAGING_PATH/manifest.json" "archive manifest"

mv "$STAGING_PATH" "$ARCHIVE_PATH"

ARCHIVE_STATUS="$(<"$ARCHIVE_PATH/status.txt")"
ARCHIVE_PHASE="$(<"$ARCHIVE_PATH/current-phase.txt")"

echo "archive: ${ARCHIVE_PATH#$ROOT_DIR/}"
echo "status: ${ARCHIVE_STATUS}"
echo "current-phase: ${ARCHIVE_PHASE}"
echo "s05-exit-code: ${S05_EXIT_CODE}"

if [[ "$S05_EXIT_CODE" -ne 0 ]]; then
  exit "$S05_EXIT_CODE"
fi
