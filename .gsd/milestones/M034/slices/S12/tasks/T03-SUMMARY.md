---
id: T03
parent: S12
milestone: M034
provides: []
requires: []
affects: []
key_files: [".tmp/m034-s12/t03/hosted-rollout-summary.json", ".tmp/m034-s12/t03/diag-download-manifest.json", ".tmp/m034-s12/t03/diag-download/windows/verify/run/07-hello-build.log", ".tmp/m034-s05/verify/remote-runs.json", ".tmp/m034-s05/verify/phase-report.txt", ".gsd/KNOWLEDGE.md", ".gsd/milestones/M034/slices/S12/tasks/T03-SUMMARY.md"]
key_decisions: ["Reused `gh run rerun 23669185030 -R snowdamiz/mesh-lang` as the least-destructive approved hosted mutation for `refs/tags/v0.1.0`, then treated the rerun as a fresh attempt on the same run ID rather than looking for a new run number.", "Captured the fresh Windows diagnostics artifact before refreshing `remote-evidence` so the canonical verifier artifacts would point at the same hosted rerun that produced the blocker."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran the exact stop-after verifier from the task plan and confirmed it still fails truthfully at `remote-evidence` because the hosted `release.yml` rerun concluded `completed/failure` on the expected `v0.1.0` SHA. Verified that `.tmp/m034-s12/t03/hosted-rollout-summary.json` exists and is non-empty. Ran a targeted local assertion over `.tmp/m034-s12/t03/hosted-rollout-summary.json`, `.tmp/m034-s12/t03/diag-download-manifest.json`, `.tmp/m034-s12/t03/diag-download/windows/verify/run/07-hello-build.log`, and `.tmp/m034-s05/verify/remote-runs.json` to confirm the refreshed run ID, head SHA, failure conclusion, downloaded artifact, and `remote-evidence` failure marker all match run `23669185030` on `1e83ea930fdfd346b9e56659dc50d2f759ec5da2`."
completed_at: 2026-03-28T00:13:03.010Z
blocker_discovered: false
---

# T03: Reran the approved hosted `release.yml` lane on `v0.1.0`, refreshed `remote-evidence`, and preserved a fresh Windows diagnostics bundle for the still-red release smoke.

> Reran the approved hosted `release.yml` lane on `v0.1.0`, refreshed `remote-evidence`, and preserved a fresh Windows diagnostics bundle for the still-red release smoke.

## What Happened
---
id: T03
parent: S12
milestone: M034
key_files:
  - .tmp/m034-s12/t03/hosted-rollout-summary.json
  - .tmp/m034-s12/t03/diag-download-manifest.json
  - .tmp/m034-s12/t03/diag-download/windows/verify/run/07-hello-build.log
  - .tmp/m034-s05/verify/remote-runs.json
  - .tmp/m034-s05/verify/phase-report.txt
  - .gsd/KNOWLEDGE.md
  - .gsd/milestones/M034/slices/S12/tasks/T03-SUMMARY.md
key_decisions:
  - Reused `gh run rerun 23669185030 -R snowdamiz/mesh-lang` as the least-destructive approved hosted mutation for `refs/tags/v0.1.0`, then treated the rerun as a fresh attempt on the same run ID rather than looking for a new run number.
  - Captured the fresh Windows diagnostics artifact before refreshing `remote-evidence` so the canonical verifier artifacts would point at the same hosted rerun that produced the blocker.
duration: ""
verification_result: mixed
completed_at: 2026-03-28T00:13:03.012Z
blocker_discovered: false
---

# T03: Reran the approved hosted `release.yml` lane on `v0.1.0`, refreshed `remote-evidence`, and preserved a fresh Windows diagnostics bundle for the still-red release smoke.

**Reran the approved hosted `release.yml` lane on `v0.1.0`, refreshed `remote-evidence`, and preserved a fresh Windows diagnostics bundle for the still-red release smoke.**

## What Happened

Started from the repaired local proof in `.tmp/m034-s12/t02/local-repair-summary.json`, confirmed the approved binary tag still resolves to `1e83ea930fdfd346b9e56659dc50d2f759ec5da2`, and obtained explicit approval before mutating GitHub state. Reran the existing failed hosted `release.yml` run `23669185030` with `gh run rerun`, watched it settle, and recorded the approved ref, head SHA, rerun metadata, failure conclusion, and failing job URL in `.tmp/m034-s12/t03/hosted-rollout-summary.json`. The rerun remained red only at `Verify release assets (x86_64-pc-windows-msvc)`, so I downloaded the fresh `release-smoke-x86_64-pc-windows-msvc-diagnostics` artifact, normalized its unpack path to the task’s expected layout, and wrote `.tmp/m034-s12/t03/diag-download-manifest.json` plus the fresh `07-hello-build.log` bundle. Finally, I replayed `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` from a clean verify root so `.tmp/m034-s05/verify/remote-runs.json` and `.tmp/m034-s05/verify/phase-report.txt` now point at the refreshed hosted rerun instead of the older S11 diagnostics.

## Verification

Ran the exact stop-after verifier from the task plan and confirmed it still fails truthfully at `remote-evidence` because the hosted `release.yml` rerun concluded `completed/failure` on the expected `v0.1.0` SHA. Verified that `.tmp/m034-s12/t03/hosted-rollout-summary.json` exists and is non-empty. Ran a targeted local assertion over `.tmp/m034-s12/t03/hosted-rollout-summary.json`, `.tmp/m034-s12/t03/diag-download-manifest.json`, `.tmp/m034-s12/t03/diag-download/windows/verify/run/07-hello-build.log`, and `.tmp/m034-s05/verify/remote-runs.json` to confirm the refreshed run ID, head SHA, failure conclusion, downloaded artifact, and `remote-evidence` failure marker all match run `23669185030` on `1e83ea930fdfd346b9e56659dc50d2f759ec5da2`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` | 1 | ❌ fail | 176489ms |
| 2 | `test -s .tmp/m034-s12/t03/hosted-rollout-summary.json` | 0 | ✅ pass | 27ms |
| 3 | `python3 -c '... assert refreshed hosted-rollout summary, diag manifest, 07-hello-build.log, and remote-runs.json all point at run 23669185030 / SHA 1e83ea930fdfd346b9e56659dc50d2f759ec5da2 ...'` | 0 | ✅ pass | 72ms |


## Deviations

None.

## Known Issues

The approved hosted `release.yml` run remains red on `v0.1.0` even after the rerun, so `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` still fails closed at `remote-evidence`. The fresh Windows diagnostics bundle confirms the blocker is unchanged: `Verify release assets (x86_64-pc-windows-msvc)` still crashes during the installed `meshc.exe build` smoke fixture with `exit_code: -1073741819`. Milestone closeout still cannot truthfully proceed to a clean full S05 replay or a `first-green` capture until that hosted Windows path is fixed.

## Files Created/Modified

- `.tmp/m034-s12/t03/hosted-rollout-summary.json`
- `.tmp/m034-s12/t03/diag-download-manifest.json`
- `.tmp/m034-s12/t03/diag-download/windows/verify/run/07-hello-build.log`
- `.tmp/m034-s05/verify/remote-runs.json`
- `.tmp/m034-s05/verify/phase-report.txt`
- `.gsd/KNOWLEDGE.md`
- `.gsd/milestones/M034/slices/S12/tasks/T03-SUMMARY.md`


## Deviations
None.

## Known Issues
The approved hosted `release.yml` run remains red on `v0.1.0` even after the rerun, so `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` still fails closed at `remote-evidence`. The fresh Windows diagnostics bundle confirms the blocker is unchanged: `Verify release assets (x86_64-pc-windows-msvc)` still crashes during the installed `meshc.exe build` smoke fixture with `exit_code: -1073741819`. Milestone closeout still cannot truthfully proceed to a clean full S05 replay or a `first-green` capture until that hosted Windows path is fixed.
