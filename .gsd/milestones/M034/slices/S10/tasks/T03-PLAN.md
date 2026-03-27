---
estimated_steps: 6
estimated_files: 6
skills_used:
  - github-workflows
  - debug-like-expert
---

# T03: Rerun the two hosted blocker lanes on the rollout SHA and refresh the evidence bundle

**Slice:** S10 — Hosted verification blocker remediation
**Milestone:** M034

## Description

Once T01 and T02 are green locally, refresh the hosted evidence on the already-approved rollout SHA so S10 ends with truthful green hosted lanes rather than only local fixes.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| GitHub workflow rerun / dispatch path | Stop before mutation until explicit user confirmation is granted, then preserve the exact command/API used and any rerun failure output under `.tmp/m034-s10/hosted-refresh/`. | Keep polling bounded, capture the last observed run state, and fail with the workflow URL plus current `headSha`. | Treat missing `headSha`, run URL, or conclusion fields as evidence drift and keep the task red. |
| Canonical remote-evidence replay | Preserve `remote-runs.json`, `workflow-status.json`, and failed logs from the current attempt instead of claiming success from stale artifacts. | Stop after `remote-evidence` and record which workflow remained incomplete. | Fail closed if the refreshed artifact set does not match `.tmp/m034-s09/rollout/target-sha.txt`. |

## Load Profile

- **Shared resources**: GitHub workflow runs for `authoritative-verification.yml` and `release.yml`, remote refs already pointed at the rollout SHA, and the local `.tmp/` evidence tree.
- **Per-operation cost**: two hosted reruns/monitors plus one canonical stop-after `remote-evidence` replay.
- **10x breakpoint**: repeated reruns without preserved artifacts or `headSha` checks will blur which hosted state is authoritative and can consume the blocker evidence without producing a truthful green bundle.

## Negative Tests

- **Malformed inputs**: missing rollout SHA file, missing workflow names, absent run URL / head SHA from hosted responses.
- **Error paths**: rerun denied, workflow stays red, workflow stays on the wrong head SHA, or stop-after `remote-evidence` remains non-zero.
- **Boundary conditions**: current rollout SHA already green vs needs rerun, duplicate rerun requests, and stop-after replay with preexisting `.tmp` artifacts from older attempts.

## Steps

1. Read `.tmp/m034-s09/rollout/target-sha.txt` and the existing blocker logs, then prepare the exact outward-action summary the executor will show the user before any GitHub rerun/dispatch call.
2. After explicit user confirmation, rerun or dispatch `authoritative-verification.yml` and `release.yml` on that SHA using the least-destructive path available, and monitor both until they settle with recorded URLs, conclusions, and `headSha` values.
3. Refresh `.tmp/m034-s05/verify/remote-runs.json` and `.tmp/m034-s09/rollout/workflow-status.json` through the canonical `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` replay, then archive the new blocker/success logs under `.tmp/m034-s10/hosted-refresh/`.
4. Stop red if either workflow is still failing or on the wrong SHA; only mark the task complete when both hosted lanes and the canonical stop-after replay agree on the rollout SHA.

## Must-Haves

- [ ] No outward GitHub action happens without an explicit user confirmation recorded in the task narrative.
- [ ] The refreshed hosted runs for `authoritative-verification.yml` and `release.yml` both land on `.tmp/m034-s09/rollout/target-sha.txt`.
- [ ] `.tmp/m034-s05/verify/remote-runs.json` and `.tmp/m034-s09/rollout/workflow-status.json` are refreshed from the new hosted state, not reused from S09.
- [ ] The new hosted success or failure logs are preserved under `.tmp/m034-s10/hosted-refresh/` so S11 can trust the outcome.

## Verification

- `gh run list -R snowdamiz/mesh-lang --workflow authoritative-verification.yml --limit 1 --json databaseId,status,conclusion,headSha,url`
- `gh run list -R snowdamiz/mesh-lang --workflow release.yml --limit 1 --json databaseId,status,conclusion,headSha,url`
- `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'`

## Observability Impact

- Signals added/changed: refreshed hosted run URLs, conclusions, and `headSha` checks are persisted into the canonical remote-evidence bundle plus a dedicated S10 refresh directory.
- How a future agent inspects this: read `.tmp/m034-s05/verify/remote-runs.json`, `.tmp/m034-s09/rollout/workflow-status.json`, and `.tmp/m034-s10/hosted-refresh/*` after the rerun settles.
- Failure state exposed: wrong-SHA runs, still-red hosted lanes, and rerun/dispatch failures remain attributable instead of being overwritten by stale artifacts.

## Inputs

- `.tmp/m034-s09/rollout/target-sha.txt` — approved rollout SHA that the hosted lanes must match.
- `.tmp/m034-s09/rollout/workflow-status.json` — current hosted-status snapshot from S09.
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log` — current authoritative blocker log.
- `.tmp/m034-s09/t06-blocker/23663179715-failed.log` — current Windows release-smoke blocker log.
- `scripts/verify-m034-s05.sh` — canonical remote-evidence replay wrapper.
- `.env` — required for the local stop-after replay once hosted reruns have settled.

## Expected Output

- `.tmp/m034-s05/verify/remote-runs.json` — refreshed canonical remote-evidence summary.
- `.tmp/m034-s09/rollout/workflow-status.json` — refreshed per-workflow status payload on the rollout SHA.
- `.tmp/m034-s10/hosted-refresh/authoritative-verification.json` — captured hosted authoritative-verification status/result payload.
- `.tmp/m034-s10/hosted-refresh/release.json` — captured hosted release status/result payload.
- `.tmp/m034-s10/hosted-refresh/authoritative-verification.log` — refreshed authoritative-verification success or failure log.
- `.tmp/m034-s10/hosted-refresh/release.log` — refreshed release success or failure log.
