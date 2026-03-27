---
estimated_steps: 4
estimated_files: 5
skills_used:
  - github-workflows
  - gh
---

# T03: Roll approved refs onto GitHub and wait for hosted green

**Slice:** S09 — Public freshness reconciliation and final assembly replay
**Milestone:** M034

## Description

The verifier hardening in T01 only matters if `main`, `v0.1.0`, and `ext-v0.3.0` are actually rerun on the intended rollout SHA, and `R047` still depends on the extension lane staying inside that hosted evidence set. This task performs the approved remote mutation, then waits for the hosted workflow set to turn green on the correct refs and `headSha`.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `git push` / tag mutation to `origin` | Stop immediately, preserve stderr, and do not claim hosted progress. | Treat it as a remote transport blocker and preserve the last attempted ref state. | Treat unexpected remote SHA or missing remote tag as failure even if the local ref exists. |
| `gh run list` / `gh run view` hosted monitoring | Keep the last observed run URL and status payload, then stop with a blocker artifact. | Preserve the timeout artifact and stop instead of looping forever. | Treat wrong `headBranch`, wrong `headSha`, or missing required jobs as failure, not eventual-consistency success. |
| User confirmation gate | Do not mutate any remote ref before explicit approval. | N/A | Treat ambiguous confirmation as `no` and stop cleanly. |

## Load Profile

- **Shared resources**: remote git refs, GitHub Actions queues, and the `.tmp/m034-s09/rollout/` status artifacts.
- **Per-operation cost**: one approved push / retag sequence plus repeated `gh run list/view` checks for six workflows.
- **10x breakpoint**: hosted polling and queue latency dominate first, so the task must use bounded waits and durable JSON snapshots.

## Negative Tests

- **Malformed inputs**: missing approval, wrong target SHA, or a rollout plan that omits one required ref.
- **Error paths**: push rejected, tag already exists remotely on the wrong SHA, or a required hosted workflow finishes red.
- **Boundary conditions**: all required workflows must be green on the same intended `headSha`, not just on the right branch/tag names.

## Steps

1. Show `.tmp/m034-s09/rollout/plan.md` to the user and get explicit approval before any `git push` or tag mutation.
2. Push or retarget `main`, `v0.1.0`, and `ext-v0.3.0` onto the approved SHA using the least-destructive allowed path, then record the resulting refs in `.tmp/m034-s09/rollout/remote-refs.after.txt`.
3. Monitor `deploy.yml`, `authoritative-verification.yml`, `release.yml`, `deploy-services.yml`, `extension-release-proof.yml`, and `publish-extension.yml` until they are green on the expected refs and `headSha`.
4. Persist the final URLs and status payloads into `.tmp/m034-s09/rollout/workflow-status.json` and `.tmp/m034-s09/rollout/workflow-urls.txt`.

## Must-Haves

- [ ] No remote mutation happens before explicit user approval.
- [ ] `.tmp/m034-s09/rollout/remote-refs.after.txt` shows the intended SHA on `main`, `v0.1.0`, and `ext-v0.3.0`.
- [ ] `.tmp/m034-s09/rollout/workflow-status.json` records all six required workflows as green on the correct ref and `headSha`.

## Verification

- `bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/remote-refs.after.txt; test -s .tmp/m034-s09/rollout/workflow-status.json; test -s .tmp/m034-s09/rollout/workflow-urls.txt'`
- `python3 - <<'PY'
from pathlib import Path
import json
sha = Path('.tmp/m034-s09/rollout/target-sha.txt').read_text().strip()
obj = json.loads(Path('.tmp/m034-s09/rollout/workflow-status.json').read_text())
expected = {
    'deploy.yml': 'main',
    'authoritative-verification.yml': 'main',
    'release.yml': 'v0.1.0',
    'deploy-services.yml': 'v0.1.0',
    'extension-release-proof.yml': 'ext-v0.3.0',
    'publish-extension.yml': 'ext-v0.3.0',
}
for workflow, ref_name in expected.items():
    entry = obj[workflow]
    assert entry['headBranch'] == ref_name, (workflow, entry)
    assert entry['headSha'] == sha, (workflow, entry)
    assert entry['status'] == 'completed', (workflow, entry)
    assert entry['conclusion'] == 'success', (workflow, entry)
PY`

## Observability Impact

- Signals added/changed: `.tmp/m034-s09/rollout/workflow-status.json` and `.tmp/m034-s09/rollout/workflow-urls.txt` record per-workflow ref, `headSha`, status, conclusion, and URLs.
- How a future agent inspects this: compare `.tmp/m034-s09/rollout/remote-refs.before.txt` to `remote-refs.after.txt`, then inspect `workflow-status.json` for any non-green lane.
- Failure state exposed: wrong-ref pushes, stale reruns, and still-red hosted workflows are preserved as durable rollout artifacts instead of ephemeral terminal output.

## Inputs

- `scripts/verify-m034-s05.sh`
- `.tmp/m034-s09/rollout/target-sha.txt`
- `.tmp/m034-s09/rollout/remote-refs.before.txt`
- `.tmp/m034-s09/rollout/plan.md`

## Expected Output

- `.tmp/m034-s09/rollout/remote-refs.after.txt`
- `.tmp/m034-s09/rollout/workflow-status.json`
- `.tmp/m034-s09/rollout/workflow-urls.txt`
