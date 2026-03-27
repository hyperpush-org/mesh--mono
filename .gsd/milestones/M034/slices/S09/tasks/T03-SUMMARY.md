---
id: T03
parent: S09
milestone: M034
provides: []
requires: []
affects: []
key_files: [".tmp/m034-s09/rollout/target-sha.txt", ".tmp/m034-s09/rollout/plan.md", ".tmp/m034-s09/rollout/apply_rollout.py", ".tmp/m034-s09/rollout/monitor_workflows.py", ".tmp/m034-s09/rollout/remote-refs.after.txt", ".tmp/m034-s09/rollout/workflow-status.json", ".tmp/m034-s09/rollout/workflow-urls.txt", ".gsd/KNOWLEDGE.md", ".gsd/milestones/M034/slices/S09/tasks/T03-SUMMARY.md"]
key_decisions: ["Use the GitHub-created equivalent commit `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` as the rollout target after the GitHub commit API normalized the local synthetic commit timestamp to UTC and changed the SHA."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Confirmed that `.tmp/m034-s09/rollout/remote-refs.after.txt`, `.tmp/m034-s09/rollout/workflow-status.json`, and `.tmp/m034-s09/rollout/workflow-urls.txt` exist. Confirmed that the after-state ref map shows `main`, `v0.1.0`, and `ext-v0.3.0` on `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`. Ran the task-plan status assertion against `workflow-status.json`; it failed because `release.yml` was still `in_progress` and `publish-extension.yml` completed with `conclusion: failure`. The bounded workflow monitor preserved the exact run URLs and final blocker state in the rollout artifacts."
completed_at: 2026-03-27T18:37:23.895Z
blocker_discovered: true
---

# T03: Retargeted `main`, `v0.1.0`, and `ext-v0.3.0` to the approved rollout SHA and captured hosted workflow evidence up to the red `publish-extension.yml` blocker.

> Retargeted `main`, `v0.1.0`, and `ext-v0.3.0` to the approved rollout SHA and captured hosted workflow evidence up to the red `publish-extension.yml` blocker.

## What Happened
---
id: T03
parent: S09
milestone: M034
key_files:
  - .tmp/m034-s09/rollout/target-sha.txt
  - .tmp/m034-s09/rollout/plan.md
  - .tmp/m034-s09/rollout/apply_rollout.py
  - .tmp/m034-s09/rollout/monitor_workflows.py
  - .tmp/m034-s09/rollout/remote-refs.after.txt
  - .tmp/m034-s09/rollout/workflow-status.json
  - .tmp/m034-s09/rollout/workflow-urls.txt
  - .gsd/KNOWLEDGE.md
  - .gsd/milestones/M034/slices/S09/tasks/T03-SUMMARY.md
key_decisions:
  - Use the GitHub-created equivalent commit `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` as the rollout target after the GitHub commit API normalized the local synthetic commit timestamp to UTC and changed the SHA.
duration: ""
verification_result: mixed
completed_at: 2026-03-27T18:37:23.897Z
blocker_discovered: true
---

# T03: Retargeted `main`, `v0.1.0`, and `ext-v0.3.0` to the approved rollout SHA and captured hosted workflow evidence up to the red `publish-extension.yml` blocker.

**Retargeted `main`, `v0.1.0`, and `ext-v0.3.0` to the approved rollout SHA and captured hosted workflow evidence up to the red `publish-extension.yml` blocker.**

## What Happened

Presented the recorded rollout plan, obtained explicit approval, and discovered that recreating the local synthetic rollout commit through GitHub's Git data API changed the hash because the API normalized the author/committer timestamp to UTC. After a second explicit approval for the equivalent GitHub-created commit, updated the rollout artifacts to the approved SHA `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`, moved `main`, `v0.1.0`, and `ext-v0.3.0` onto that commit, and persisted the resulting ref map. Then polled the six required hosted workflows into durable status/URL artifacts. The reroll succeeded for `deploy.yml`, `deploy-services.yml`, `authoritative-verification.yml`, and the reusable `extension-release-proof.yml` evidence on the correct head SHA, but the caller workflow `publish-extension.yml` completed red and `release.yml` was still in progress when the monitor stopped. That makes the remaining slice plan invalid as written: waiting longer is not enough, and the failing hosted lane now needs follow-up work or replan.

## Verification

Confirmed that `.tmp/m034-s09/rollout/remote-refs.after.txt`, `.tmp/m034-s09/rollout/workflow-status.json`, and `.tmp/m034-s09/rollout/workflow-urls.txt` exist. Confirmed that the after-state ref map shows `main`, `v0.1.0`, and `ext-v0.3.0` on `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`. Ran the task-plan status assertion against `workflow-status.json`; it failed because `release.yml` was still `in_progress` and `publish-extension.yml` completed with `conclusion: failure`. The bounded workflow monitor preserved the exact run URLs and final blocker state in the rollout artifacts.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 - <<'PY' ... bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/remote-refs.after.txt; test -s .tmp/m034-s09/rollout/workflow-status.json; test -s .tmp/m034-s09/rollout/workflow-urls.txt' ... PY` | 0 | ✅ pass | 28ms |
| 2 | `python3 - <<'PY' ... assert workflow-status.json entries are completed/success on target-sha.txt ... PY` | 1 | ❌ fail | 198ms |
| 3 | `python3 .tmp/m034-s09/rollout/monitor_workflows.py 30 3600` | 1 | ❌ fail | 567600ms |


## Deviations

Switched the rollout target from the local synthetic SHA `05ab52f6353c0b44824f66edff0f41da1d625b9b` to the user-approved GitHub-created equivalent SHA `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`, because T03 had to avoid `git push` and GitHub's commit API rewrote the timestamp enough to change the hash. Added temporary rollout helper scripts under `.tmp/m034-s09/rollout/` so the remote mutation and hosted polling stayed reproducible and left durable status files behind.

## Known Issues

`publish-extension.yml` completed with `conclusion: failure` on the correct rollout SHA (`c443270a8fe17419e9ca99b4755b90f3cb7af3a0`), so the slice cannot claim an all-green hosted evidence set. `release.yml` was still `in_progress` when the monitor stopped on the red extension caller lane, so its final conclusion was not captured by this task. Because the all-green hosted contract did not pass, T04’s planned `first-green` archive and full S05 replay are blocked pending investigation and likely replan of the failing hosted workflow lane.

## Files Created/Modified

- `.tmp/m034-s09/rollout/target-sha.txt`
- `.tmp/m034-s09/rollout/plan.md`
- `.tmp/m034-s09/rollout/apply_rollout.py`
- `.tmp/m034-s09/rollout/monitor_workflows.py`
- `.tmp/m034-s09/rollout/remote-refs.after.txt`
- `.tmp/m034-s09/rollout/workflow-status.json`
- `.tmp/m034-s09/rollout/workflow-urls.txt`
- `.gsd/KNOWLEDGE.md`
- `.gsd/milestones/M034/slices/S09/tasks/T03-SUMMARY.md`


## Deviations
Switched the rollout target from the local synthetic SHA `05ab52f6353c0b44824f66edff0f41da1d625b9b` to the user-approved GitHub-created equivalent SHA `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`, because T03 had to avoid `git push` and GitHub's commit API rewrote the timestamp enough to change the hash. Added temporary rollout helper scripts under `.tmp/m034-s09/rollout/` so the remote mutation and hosted polling stayed reproducible and left durable status files behind.

## Known Issues
`publish-extension.yml` completed with `conclusion: failure` on the correct rollout SHA (`c443270a8fe17419e9ca99b4755b90f3cb7af3a0`), so the slice cannot claim an all-green hosted evidence set. `release.yml` was still `in_progress` when the monitor stopped on the red extension caller lane, so its final conclusion was not captured by this task. Because the all-green hosted contract did not pass, T04’s planned `first-green` archive and full S05 replay are blocked pending investigation and likely replan of the failing hosted workflow lane.
