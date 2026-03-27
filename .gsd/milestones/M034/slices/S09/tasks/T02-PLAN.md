---
estimated_steps: 4
estimated_files: 6
skills_used:
  - github-workflows
---

# T02: Isolate the exact rollout target and approval payload

**Slice:** S09 — Public freshness reconciliation and final assembly replay
**Milestone:** M034

## Description

S08 proved that local `HEAD` contains more than the two original rollout-fix commits, so S09 needs one deliberate target SHA before any outward GitHub action. This task produces the exact rollout scope and approval payload without mutating the remote.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `git diff` / `git log` against `origin/main` | Stop and preserve the exact comparison output; do not guess the rollout scope. | Treat it as a local repo-state problem and stop the task. | Treat ambiguous commit ancestry as a blocker that must be documented in `plan.md`. |
| `git ls-remote` for current refs | Fail closed and capture the before-state gap in the rollout artifacts. | Treat it as a remote reachability blocker and stop before writing approval text. | Treat missing or duplicated ref lines as rollout-state ambiguity. |
| `.tmp/m034-s09/rollout/` artifact writes | Stop and repair the local artifact path before later tasks depend on it. | N/A | Treat partial files as plan drift and rewrite them atomically. |

## Load Profile

- **Shared resources**: local git history, remote refs, and the `.tmp/m034-s09/rollout/` planning artifact directory.
- **Per-operation cost**: a handful of `git diff`, `git log`, and `git ls-remote` calls plus small text artifacts.
- **10x breakpoint**: not scale-bound; the real failure mode is commit-scope ambiguity, not compute cost.

## Negative Tests

- **Malformed inputs**: missing `origin/main`, empty target SHA, or a rollout plan that omits one of `main`, `v0.1.0`, or `ext-v0.3.0`.
- **Error paths**: current remote refs do not match the research baseline, or the isolated commit set still pulls unrelated files.
- **Boundary conditions**: the chosen target SHA must be one concrete commit, and the approval payload must state exactly which refs move and why.

## Steps

1. Compare `origin/main..HEAD` and isolate the exact commit set required for hosted `release.yml`, `deploy-services.yml`, and freshness-gated `remote-evidence`.
2. Record the current remote refs under `.tmp/m034-s09/rollout/remote-refs.before.txt` and the proposed rollout SHA under `.tmp/m034-s09/rollout/target-sha.txt`.
3. Write `.tmp/m034-s09/rollout/plan.md` with the exact outward action, affected refs, and why the selected SHA is the truthful rollout target.
4. Stop before any push or tag mutation.

## Must-Haves

- [ ] The task leaves one concrete rollout SHA in `.tmp/m034-s09/rollout/target-sha.txt`.
- [ ] The remote before-state is preserved in `.tmp/m034-s09/rollout/remote-refs.before.txt`.
- [ ] `.tmp/m034-s09/rollout/plan.md` tells the user exactly what would be pushed or retagged.

## Verification

- `bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/target-sha.txt; test -s .tmp/m034-s09/rollout/remote-refs.before.txt; test -s .tmp/m034-s09/rollout/plan.md'`
- `python3 - <<'PY'
from pathlib import Path
import re
sha = Path('.tmp/m034-s09/rollout/target-sha.txt').read_text().strip()
assert re.fullmatch(r'[0-9a-f]{40}', sha), sha
plan = Path('.tmp/m034-s09/rollout/plan.md').read_text()
for needle in ['main', 'v0.1.0', 'ext-v0.3.0']:
    assert needle in plan, needle
PY`

## Inputs

- `packages-website/Dockerfile`
- `.github/workflows/release.yml`
- `scripts/verify-m034-s05.sh`

## Expected Output

- `.tmp/m034-s09/rollout/target-sha.txt`
- `.tmp/m034-s09/rollout/remote-refs.before.txt`
- `.tmp/m034-s09/rollout/plan.md`
