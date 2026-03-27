---
id: T05
parent: S09
milestone: M034
provides: []
requires: []
affects: []
key_files: [".tmp/m034-s09/rollout/target-sha.txt", ".tmp/m034-s09/rollout/remote-refs.before.txt", ".tmp/m034-s09/rollout/plan.md", ".tmp/m034-s09/rollout/target-metadata.json", ".tmp/m034-s09/rollout/apply_rollout.py", ".tmp/m034-s09/rollout/monitor_workflows.py", ".tmp/m034-s09/rollout/remote-refs.after.txt", ".tmp/m034-s09/rollout/workflow-status.json", ".tmp/m034-s09/rollout/workflow-urls.txt", ".tmp/m034-s09/rollout/failed-jobs/index.json", ".tmp/m034-s09/rollout/failed-jobs/authoritative-verification.url.txt", ".tmp/m034-s09/rollout/failed-jobs/authoritative-verification.json", ".tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log", ".gsd/KNOWLEDGE.md"]
key_decisions: ["Treat the repaired T05 rollout as a fast-forward from the already-shipped `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` remote state and ship only `.github/workflows/publish-extension.yml`, `scripts/verify-m034-s01.sh`, and `scripts/verify-m034-s03.ps1`.", "Extend the temp rollout monitor so a red hosted lane writes `failed-jobs/*.url.txt`, `failed-jobs/*.json`, and `failed-jobs/*.log` before stopping."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Confirmed that `.tmp/m034-s09/rollout/target-sha.txt`, `remote-refs.before.txt`, `remote-refs.after.txt`, `workflow-status.json`, and `workflow-urls.txt` exist and are non-empty after the reroll. Re-ran the task-plan all-green assertion against `workflow-status.json`; it failed because `authoritative-verification.yml` is `completed/failure` on the repaired SHA and the later release/extension lanes were still in progress when the monitor stopped. Confirmed that `failed-jobs/` contains the authoritative-verification run URL, status snapshot, and `gh run view --log-failed` output for the new blocker."
completed_at: 2026-03-27T19:23:54.380Z
blocker_discovered: true
---

# T05: Rolled `main`, `v0.1.0`, and `ext-v0.3.0` to repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` and captured the new authoritative-verification blocker.

> Rolled `main`, `v0.1.0`, and `ext-v0.3.0` to repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` and captured the new authoritative-verification blocker.

## What Happened
---
id: T05
parent: S09
milestone: M034
key_files:
  - .tmp/m034-s09/rollout/target-sha.txt
  - .tmp/m034-s09/rollout/remote-refs.before.txt
  - .tmp/m034-s09/rollout/plan.md
  - .tmp/m034-s09/rollout/target-metadata.json
  - .tmp/m034-s09/rollout/apply_rollout.py
  - .tmp/m034-s09/rollout/monitor_workflows.py
  - .tmp/m034-s09/rollout/remote-refs.after.txt
  - .tmp/m034-s09/rollout/workflow-status.json
  - .tmp/m034-s09/rollout/workflow-urls.txt
  - .tmp/m034-s09/rollout/failed-jobs/index.json
  - .tmp/m034-s09/rollout/failed-jobs/authoritative-verification.url.txt
  - .tmp/m034-s09/rollout/failed-jobs/authoritative-verification.json
  - .tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Treat the repaired T05 rollout as a fast-forward from the already-shipped `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` remote state and ship only `.github/workflows/publish-extension.yml`, `scripts/verify-m034-s01.sh`, and `scripts/verify-m034-s03.ps1`.
  - Extend the temp rollout monitor so a red hosted lane writes `failed-jobs/*.url.txt`, `failed-jobs/*.json`, and `failed-jobs/*.log` before stopping.
duration: ""
verification_result: mixed
completed_at: 2026-03-27T19:23:54.390Z
blocker_discovered: true
---

# T05: Rolled `main`, `v0.1.0`, and `ext-v0.3.0` to repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` and captured the new authoritative-verification blocker.

**Rolled `main`, `v0.1.0`, and `ext-v0.3.0` to repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` and captured the new authoritative-verification blocker.**

## What Happened

Recomputed the repaired rollout against live remote state, recorded a new approval payload for SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635`, and after explicit approval moved `main`, `v0.1.0`, and `ext-v0.3.0` from `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` to that repaired commit. The reroll retired the old deploy-services and duplicate extension blockers, but the hosted monitor stopped on a new `authoritative-verification.yml` failure. The saved failed log shows `scripts/verify-m034-s01.sh` got through publish, metadata, search, download, and install, then failed because the package-level `latest` metadata still pointed at the previous proof version instead of the version just published by the run. I persisted the ref maps, workflow status/URL artifacts, and a failed-job bundle under `.tmp/m034-s09/rollout/failed-jobs/`, and recorded the new registry-latest propagation gotcha in `.gsd/KNOWLEDGE.md` so the next unit can resume from the correct blocker surface.

## Verification

Confirmed that `.tmp/m034-s09/rollout/target-sha.txt`, `remote-refs.before.txt`, `remote-refs.after.txt`, `workflow-status.json`, and `workflow-urls.txt` exist and are non-empty after the reroll. Re-ran the task-plan all-green assertion against `workflow-status.json`; it failed because `authoritative-verification.yml` is `completed/failure` on the repaired SHA and the later release/extension lanes were still in progress when the monitor stopped. Confirmed that `failed-jobs/` contains the authoritative-verification run URL, status snapshot, and `gh run view --log-failed` output for the new blocker.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 .tmp/m034-s09/rollout/apply_rollout.py` | 0 | ✅ pass | 2000ms |
| 2 | `python3 .tmp/m034-s09/rollout/monitor_workflows.py 30 5400` | 1 | ❌ fail | 552300ms |
| 3 | `bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/target-sha.txt; test -s .tmp/m034-s09/rollout/remote-refs.before.txt; test -s .tmp/m034-s09/rollout/remote-refs.after.txt; test -s .tmp/m034-s09/rollout/workflow-status.json; test -s .tmp/m034-s09/rollout/workflow-urls.txt'` | 0 | ✅ pass | 1000ms |
| 4 | `python3 - <<'PY' ... assert workflow-status.json entries are completed/success on target-sha.txt ... PY` | 1 | ❌ fail | 1000ms |


## Deviations

Adjusted the repaired rollout seam to fast-forward from the live remote refs already on `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` instead of recomputing from the pre-T03 `origin/main` snapshot. Added `.tmp/m034-s09/rollout/target-metadata.json` plus failed-job artifact capture in the temp monitor so the reroll leaves a deterministic commit recipe and durable blocker evidence.

## Known Issues

`authoritative-verification.yml` failed on repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because the package-level `latest` metadata lagged the version just published by the hosted proof run. `release.yml`, `extension-release-proof.yml`, and `publish-extension.yml` were still in progress when the monitor stopped on that red lane, so the task does not claim an all-green hosted evidence set. T06 remains blocked until that new hosted failure is fixed.

## Files Created/Modified

- `.tmp/m034-s09/rollout/target-sha.txt`
- `.tmp/m034-s09/rollout/remote-refs.before.txt`
- `.tmp/m034-s09/rollout/plan.md`
- `.tmp/m034-s09/rollout/target-metadata.json`
- `.tmp/m034-s09/rollout/apply_rollout.py`
- `.tmp/m034-s09/rollout/monitor_workflows.py`
- `.tmp/m034-s09/rollout/remote-refs.after.txt`
- `.tmp/m034-s09/rollout/workflow-status.json`
- `.tmp/m034-s09/rollout/workflow-urls.txt`
- `.tmp/m034-s09/rollout/failed-jobs/index.json`
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.url.txt`
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.json`
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log`
- `.gsd/KNOWLEDGE.md`


## Deviations
Adjusted the repaired rollout seam to fast-forward from the live remote refs already on `c443270a8fe17419e9ca99b4755b90f3cb7af3a0` instead of recomputing from the pre-T03 `origin/main` snapshot. Added `.tmp/m034-s09/rollout/target-metadata.json` plus failed-job artifact capture in the temp monitor so the reroll leaves a deterministic commit recipe and durable blocker evidence.

## Known Issues
`authoritative-verification.yml` failed on repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because the package-level `latest` metadata lagged the version just published by the hosted proof run. `release.yml`, `extension-release-proof.yml`, and `publish-extension.yml` were still in progress when the monitor stopped on that red lane, so the task does not claim an all-green hosted evidence set. T06 remains blocked until that new hosted failure is fixed.
