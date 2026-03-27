---
id: T06
parent: S09
milestone: M034
provides: []
requires: []
affects: []
key_files: [".tmp/m034-s05/verify/remote-runs.json", ".tmp/m034-s05/verify/failed-phase.txt", ".tmp/m034-s09/t06-blocker/23663179236-failed.log", ".tmp/m034-s09/t06-blocker/23663179715-failed.log", ".tmp/m034-s09/t06-blocker/23663179236-view.json", ".tmp/m034-s09/t06-blocker/23663179715-view.json", ".gsd/milestones/M034/slices/S09/tasks/T06-SUMMARY.md"]
key_decisions: ["Preserved the once-only `first-green` label by refusing to archive a red `remote-evidence` preflight.", "When the stop-after `remote-evidence` run is red, capture the hosted failure logs locally first and block closeout instead of archiving misleading evidence."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Reran the stop-after `remote-evidence` verifier with `.env` loaded. It failed at `remote-evidence` and wrote fresh artifacts under `.tmp/m034-s05/verify/`, including `status.txt=failed`, `failed-phase.txt=remote-evidence`, and a new `remote-runs.json` showing the repaired-sha failures. Then ran read-only `gh run list` checks to confirm the latest `authoritative-verification.yml` and `release.yml` runs on the expected refs were the failing runs on `8e6d49dacc4f4cd64824b032078ae45aabfe9635`, not stale older greens. Finally downloaded failed hosted logs with `gh run view --log-failed` and verified the concrete blocker messages locally. The archive step and full assembled replay were intentionally withheld because the preflight was red."
completed_at: 2026-03-27T19:32:07.527Z
blocker_discovered: true
---

# T06: Reran the S05 stop-after preflight, proved the repaired rollout SHA is still red on hosted verification, and preserved `first-green` for the next real green bundle.

> Reran the S05 stop-after preflight, proved the repaired rollout SHA is still red on hosted verification, and preserved `first-green` for the next real green bundle.

## What Happened
---
id: T06
parent: S09
milestone: M034
key_files:
  - .tmp/m034-s05/verify/remote-runs.json
  - .tmp/m034-s05/verify/failed-phase.txt
  - .tmp/m034-s09/t06-blocker/23663179236-failed.log
  - .tmp/m034-s09/t06-blocker/23663179715-failed.log
  - .tmp/m034-s09/t06-blocker/23663179236-view.json
  - .tmp/m034-s09/t06-blocker/23663179715-view.json
  - .gsd/milestones/M034/slices/S09/tasks/T06-SUMMARY.md
key_decisions:
  - Preserved the once-only `first-green` label by refusing to archive a red `remote-evidence` preflight.
  - When the stop-after `remote-evidence` run is red, capture the hosted failure logs locally first and block closeout instead of archiving misleading evidence.
duration: ""
verification_result: mixed
completed_at: 2026-03-27T19:32:07.528Z
blocker_discovered: true
---

# T06: Reran the S05 stop-after preflight, proved the repaired rollout SHA is still red on hosted verification, and preserved `first-green` for the next real green bundle.

**Reran the S05 stop-after preflight, proved the repaired rollout SHA is still red on hosted verification, and preserved `first-green` for the next real green bundle.**

## What Happened

Loaded `.env` and reran `scripts/verify-m034-s05.sh` with `VERIFY_M034_S05_STOP_AFTER=remote-evidence`. Local prereq/docs/workflow/verifier phases completed, but `remote-evidence` failed on live hosted truth: `authoritative-verification.yml` and `release.yml` both matched the expected `headSha` `8e6d49dacc4f4cd64824b032078ae45aabfe9635` and still concluded `failure`. Read-only GitHub checks confirmed this was not a stale-run selection bug. I captured the failing hosted logs into `.tmp/m034-s09/t06-blocker/` and identified the active blockers: authoritative verification is still failing inside `scripts/verify-m034-s01.sh` with package latest-version drift, and the release workflow is still failing in the Windows `scripts/verify-m034-s03.ps1` staged installer smoke (`installed meshc.exe build installer smoke fixture failed`). Because the stop-after preflight was red, I did not archive `.tmp/m034-s06/evidence/first-green/` and did not run the full assembled S05 replay; using the once-only label on a failing bundle would make the canonical evidence dishonest. This is a plan-invalidating blocker because T06 assumes the repaired hosted evidence set is already green, but the hosted rollout still needs remediation and reruns before the closeout task can truthfully proceed.

## Verification

Reran the stop-after `remote-evidence` verifier with `.env` loaded. It failed at `remote-evidence` and wrote fresh artifacts under `.tmp/m034-s05/verify/`, including `status.txt=failed`, `failed-phase.txt=remote-evidence`, and a new `remote-runs.json` showing the repaired-sha failures. Then ran read-only `gh run list` checks to confirm the latest `authoritative-verification.yml` and `release.yml` runs on the expected refs were the failing runs on `8e6d49dacc4f4cd64824b032078ae45aabfe9635`, not stale older greens. Finally downloaded failed hosted logs with `gh run view --log-failed` and verified the concrete blocker messages locally. The archive step and full assembled replay were intentionally withheld because the preflight was red.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'` | 1 | ❌ fail | 199000ms |
| 2 | `gh run list -R snowdamiz/mesh-lang --workflow authoritative-verification.yml --limit 1 --json databaseId,status,conclusion,headBranch,headSha,url && gh run list -R snowdamiz/mesh-lang --workflow release.yml --limit 1 --json databaseId,status,conclusion,headBranch,headSha,url` | 0 | ✅ pass | 3000ms |
| 3 | `gh run view 23663179236 -R snowdamiz/mesh-lang --log-failed && gh run view 23663179715 -R snowdamiz/mesh-lang --log-failed` | 0 | ✅ pass | 3000ms |


## Deviations

Did not run the archive command or the full assembled S05 replay because the required stop-after `remote-evidence` preflight was red on the repaired rollout SHA. Preserving `first-green` for the first truthful green bundle was more important than forcing the remaining scripted steps.

## Known Issues

`authoritative-verification.yml` is still red on `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because `scripts/verify-m034-s01.sh` reports package latest-version drift. `release.yml` is still red on the same SHA because the Windows `scripts/verify-m034-s03.ps1` staged installer smoke fails while building the installed `meshc.exe` fixture. Until those hosted blockers are fixed and rerun successfully, `.tmp/m034-s06/evidence/first-green/` must remain absent.

## Files Created/Modified

- `.tmp/m034-s05/verify/remote-runs.json`
- `.tmp/m034-s05/verify/failed-phase.txt`
- `.tmp/m034-s09/t06-blocker/23663179236-failed.log`
- `.tmp/m034-s09/t06-blocker/23663179715-failed.log`
- `.tmp/m034-s09/t06-blocker/23663179236-view.json`
- `.tmp/m034-s09/t06-blocker/23663179715-view.json`
- `.gsd/milestones/M034/slices/S09/tasks/T06-SUMMARY.md`


## Deviations
Did not run the archive command or the full assembled S05 replay because the required stop-after `remote-evidence` preflight was red on the repaired rollout SHA. Preserving `first-green` for the first truthful green bundle was more important than forcing the remaining scripted steps.

## Known Issues
`authoritative-verification.yml` is still red on `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because `scripts/verify-m034-s01.sh` reports package latest-version drift. `release.yml` is still red on the same SHA because the Windows `scripts/verify-m034-s03.ps1` staged installer smoke fails while building the installed `meshc.exe` fixture. Until those hosted blockers are fixed and rerun successfully, `.tmp/m034-s06/evidence/first-green/` must remain absent.
