---
estimated_steps: 4
estimated_files: 6
skills_used:
  - github-workflows
  - gh
---

# T04: Archive first-green exactly once and rerun the full assembled verifier

**Slice:** S09 — Public freshness reconciliation and final assembly replay
**Milestone:** M034

## Description

`R046` and the slice demo are only satisfied when the canonical wrapper proves the live package-manager path, public HTTP surfaces, and extension lane together on the fresh hosted rollout state. This task preserves the first all-green hosted bundle and then runs the full assembled S05 replay.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `.env` / publish credentials for live S01 proof | Use `secure_env_collect` for missing keys, then rerun the blocked command. | N/A | Treat missing or partial env as a blocker before running S01. |
| `scripts/verify-m034-s06-remote-evidence.sh` | Stop and repair the wrapper contract before claiming `first-green`. | Treat a hung stop-after replay as verifier drift and preserve the logs. | Treat missing `manifest.json`, `remote-runs.json`, or `status.txt` as archive drift. |
| `scripts/verify-m034-s05.sh` full replay | Stop on the first failing phase and inspect the generated verifier artifacts instead of inventing partial success. | Preserve the failing phase logs and stop. | Treat missing `public-http.log` or S01 `package-version.txt` evidence as proof failure. |

## Load Profile

- **Shared resources**: registry/package publish credentials, remote workflow evidence, live public HTTP surfaces, and the `.tmp/m034-s05/verify/` / `.tmp/m034-s06/evidence/` artifact trees.
- **Per-operation cost**: one stop-after replay, one archive-helper invocation, and one full S05 assembled replay.
- **10x breakpoint**: the live S01 proof and public HTTP checks dominate first, so this task should only start after T03 proves the hosted workflow set is green.

## Negative Tests

- **Malformed inputs**: missing `.env`, pre-existing `.tmp/m034-s06/evidence/first-green/`, or a stale `workflow-status.json` that does not match the approved SHA.
- **Error paths**: remote-evidence preflight red, archive helper fails, `public-http` fails, or S01 no longer emits `package-version.txt`.
- **Boundary conditions**: `first-green` must be claimed exactly once and the final S05 replay must end in `status.txt == ok`.

## Steps

1. With `.env` loaded, rerun stop-after `remote-evidence` and confirm it is green on the freshly rolled refs.
2. If `.tmp/m034-s06/evidence/first-green/` is still absent, capture it exactly once with `scripts/verify-m034-s06-remote-evidence.sh` and validate the archived manifest plus remote-run summary.
3. Run the full `bash scripts/verify-m034-s05.sh` replay with `.env` loaded.
4. Confirm the final verifier artifacts show a green assembled proof, including `public-http.log` and S01 package-version evidence.

## Must-Haves

- [ ] `first-green` is claimed exactly once through the wrapper-owned archive path.
- [ ] `.tmp/m034-s05/verify/status.txt` is `ok` after the final replay.
- [ ] The final proof bundle includes `public-http.log` and preserves the live S01 package-version evidence.

## Verification

- `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'`
- `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s06-remote-evidence.sh first-green'`
- `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s05.sh'`
- `python3 - <<'PY'
from pathlib import Path
import json
root = Path('.tmp/m034-s06/evidence/first-green')
assert (root / 'manifest.json').exists()
assert (Path('.tmp/m034-s05/verify/status.txt').read_text().strip()) == 'ok'
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['s05ExitCode'] == 0, manifest
assert manifest['stopAfterPhase'] == 'remote-evidence', manifest
public_log = Path('.tmp/m034-s05/verify/public-http.log')
assert public_log.exists(), public_log
assert 'final\tpassed' in public_log.read_text(), public_log.read_text()
assert any(Path('.tmp/m034-s01/verify').rglob('package-version.txt'))
PY`

## Observability Impact

- Signals added/changed: the wrapper-owned `first-green` archive plus `.tmp/m034-s05/verify/*` capture the exact passing hosted evidence, public-http log, and final phase transitions.
- How a future agent inspects this: read `.tmp/m034-s06/evidence/first-green/manifest.json`, `.tmp/m034-s06/evidence/first-green/remote-runs.json`, and `.tmp/m034-s05/verify/phase-report.txt`.
- Failure state exposed: the first failing phase, missing public markers, or absent S01 package-version artifacts remain visible without rerunning the entire rollout.

## Inputs

- `scripts/verify-m034-s05.sh`
- `scripts/verify-m034-s06-remote-evidence.sh`
- `.tmp/m034-s09/rollout/remote-refs.after.txt`
- `.tmp/m034-s09/rollout/workflow-status.json`

## Expected Output

- `.tmp/m034-s06/evidence/first-green/manifest.json`
- `.tmp/m034-s05/verify/status.txt`
- `.tmp/m034-s05/verify/phase-report.txt`
- `.tmp/m034-s05/verify/public-http.log`
