---
id: S09
parent: M034
milestone: M034
provides:
  - A freshness-gated hosted-evidence contract that proves required workflows are being evaluated on the actual rolled-out SHA instead of stale branch/tag names.
  - Durable rollout artifacts showing `main`, `v0.1.0`, and `ext-v0.3.0` on `8e6d49dacc4f4cd64824b032078ae45aabfe9635` with per-workflow status and URL traces.
  - A narrowed final blocker bundle for M034 closeout: deploy and extension lanes are green on the correct SHA, while authoritative package-latest drift and Windows staged installer smoke remain red and locally inspectable.
requires:
  - slice: S08
    provides: The shared remote-evidence/archive wrapper, the repo-side Docker and release-workflow repairs, and the reserved-label discipline that S09 reused while finishing the rollout-freshness contract.
affects:
  []
key_files:
  - scripts/verify-m034-s05.sh
  - scripts/verify-m034-s06-remote-evidence.sh
  - .github/workflows/publish-extension.yml
  - scripts/verify-m034-s01.sh
  - scripts/verify-m034-s03.ps1
  - .tmp/m034-s09/rollout/target-sha.txt
  - .tmp/m034-s09/rollout/workflow-status.json
  - .tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log
  - .tmp/m034-s09/t06-blocker/23663179715-failed.log
  - .tmp/m034-s05/verify/remote-runs.json
  - .gsd/PROJECT.md
key_decisions:
  - Require remote-evidence to compare each hosted run's `headSha` against the current required ref SHA and record freshness separately from workflow health.
  - Use a GitHub-created equivalent rollout commit when the local synthetic commit's SHA cannot be preserved through the GitHub commit API.
  - Make hosted extension rerolls duplicate-safe with `skipDuplicate: true` instead of masking duplicates with looser error handling.
  - Compose the repaired reroll as a fast-forward from the live remote rollout state and ship only `.github/workflows/publish-extension.yml`, `scripts/verify-m034-s01.sh`, and `scripts/verify-m034-s03.ps1`.
  - Preserve the once-only `first-green` label by refusing to archive or claim it while stop-after `remote-evidence` is still red.
patterns_established:
  - Treat hosted-run freshness as independent from hosted-run health; matching refs are necessary but not sufficient.
  - When rollout targets must exclude unrelated branch work, build a synthetic target commit first, then record and approve the GitHub-created equivalent SHA if the remote API rewrites metadata.
  - For repeated hosted rerolls, preserve the exact ref map, workflow URLs, and failed-log bundle under `.tmp/` so each new blocker is attributable to a concrete lane, not a vague 'workflow red' status.
  - Do not spend reserved evidence labels such as `first-green` on red preflights; use stop-after remote-evidence plus blocker logs as the canonical closeout surface until the hosted set is fully green.
observability_surfaces:
  - .tmp/m034-s05/verify/remote-runs.json
  - .tmp/m034-s05/verify/phase-report.txt
  - .tmp/m034-s05/verify/failed-phase.txt
  - .tmp/m034-s09/rollout/target-sha.txt
  - .tmp/m034-s09/rollout/remote-refs.before.txt
  - .tmp/m034-s09/rollout/remote-refs.after.txt
  - .tmp/m034-s09/rollout/workflow-status.json
  - .tmp/m034-s09/rollout/workflow-urls.txt
  - .tmp/m034-s09/rollout/failed-jobs/index.json
  - .tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log
  - .tmp/m034-s09/t06-blocker/23663179236-failed.log
  - .tmp/m034-s09/t06-blocker/23663179715-failed.log
drill_down_paths:
  - .gsd/milestones/M034/slices/S09/tasks/T01-SUMMARY.md
  - .gsd/milestones/M034/slices/S09/tasks/T02-SUMMARY.md
  - .gsd/milestones/M034/slices/S09/tasks/T03-SUMMARY.md
  - .gsd/milestones/M034/slices/S09/tasks/T04-SUMMARY.md
  - .gsd/milestones/M034/slices/S09/tasks/T05-SUMMARY.md
  - .gsd/milestones/M034/slices/S09/tasks/T06-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-27T19:40:52.956Z
blocker_discovered: false
---

# S09: Public freshness reconciliation and final assembly replay

**Reconciled hosted-run freshness against the real rollout refs, rerolled `main`/`v0.1.0`/`ext-v0.3.0` onto `8e6d49dacc4f4cd64824b032078ae45aabfe9635`, and narrowed the remaining M034 closeout blockers to authoritative package-latest drift and the hosted Windows `meshc.exe` staged installer smoke failure on the correct head SHA.**

## What Happened

S09 finished the rollout-freshness part of M034 and removed the last ambiguity about whether the hosted evidence was simply stale. T01 hardened `scripts/verify-m034-s05.sh` and `scripts/verify-m034-s06-remote-evidence.sh` so remote-evidence resolves the required remote ref, records expected vs observed `headSha`, and treats freshness separately from workflow health. That closed the old loophole where a green-or-red hosted run on the wrong commit could still look acceptable if the branch or tag name matched.

T02 and T03 then made the rollout target explicit instead of shipping the full local branch tip. The slice first isolated a minimal synthetic rollout commit, then recreated and approved the GitHub-equivalent commit when the Git data API normalized timestamps and changed the SHA. The result was a truthful first reroll onto `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`, plus durable rollout helpers and status artifacts under `.tmp/m034-s09/rollout/`. That reroll retired some stale-commit uncertainty, but it exposed a real hosted blocker: `publish-extension.yml` failed even though the ref and `headSha` were correct.

T04 fixed the repo-side reroll surfaces that the first hosted reroll exposed. `publish-extension.yml` is now duplicate-safe with `skipDuplicate: true` on both publish steps and the local workflow contract enforces that. `scripts/verify-m034-s03.ps1` no longer reads an unset `$LASTEXITCODE` directly under strict mode, and `scripts/verify-m034-s01.sh` now retries transient metadata/search transport failures without weakening the live-registry proof. Those repairs kept the local verifiers green while preserving the already-captured hosted blocker artifacts.

T05 rerolled again from the live remote state instead of rewinding to the earlier pre-rollout base. That was the key closeout decision for this slice: once the remote refs were already on `c443270a8fe17419e9ca99b4755b90f3cb7af3a0`, the repaired reroll needed to isolate only the still-red hosted seams. The slice moved `main`, `v0.1.0`, and `ext-v0.3.0` onto `8e6d49dacc4f4cd64824b032078ae45aabfe9635`, and this time `deploy.yml`, `deploy-services.yml`, `extension-release-proof.yml`, and `publish-extension.yml` all settled green on the correct `headSha`. The remaining blocker shifted again, and more importantly became narrower: `authoritative-verification.yml` went red because package-level `latest` metadata lagged the just-published proof version, and the slice preserved that run URL, status JSON, and failed logs under `.tmp/m034-s09/rollout/failed-jobs/`.

T06 reran the canonical stop-after preflight to determine whether the assembled S05 replay could truthfully proceed. It could not. With `.env` loaded, `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` now fails because `authoritative-verification.yml` and `release.yml` are both red on the correct `headSha`, not because refs are stale. The refreshed `remote-runs.json` shows `freshnessStatus: ok` for every required workflow, while the hosted failures remain concrete: authoritative verification still reports `package latest version drifted`, and release still fails the Windows staged installer smoke at `installed meshc.exe build installer smoke fixture failed`. Because that preflight is still red, the slice correctly left `.tmp/m034-s06/evidence/first-green/` absent and did not run or claim a final green S05 assembly bundle.

So S09 did not deliver the originally planned all-green final assembly replay. What it did deliver is the truthful final blocker shape for M034 closeout: the public freshness gate and hosted-evidence gate now both measure the live rolled-out SHA, the deploy and extension lanes are green on that SHA, and only two hosted proof seams remain before `first-green` and the full S05 replay can be claimed honestly.

## Verification

Passed local slice-owned checks:
- `node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs`
- `bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/target-sha.txt; test -s .tmp/m034-s09/rollout/remote-refs.before.txt; test -s .tmp/m034-s09/rollout/plan.md'`
- `python3 - <<'PY' ... validate target-sha format and rollout plan refs ... PY`
- `bash scripts/verify-m034-s04-workflows.sh all`
- `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`
- `bash scripts/tests/verify-m034-s01-fetch-retry.sh`
- `bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/remote-refs.after.txt; test -s .tmp/m034-s09/rollout/workflow-status.json; test -s .tmp/m034-s09/rollout/workflow-urls.txt'`

Passed hosted-freshness verification on the rolled-out SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635`:
- `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` refreshed `.tmp/m034-s05/verify/remote-runs.json` and confirmed `deploy.yml`, `deploy-services.yml`, `extension-release-proof.yml`, and `publish-extension.yml` are green with `freshnessStatus: ok`.
- Read-only `gh run list` checks confirmed the latest hosted runs for `authoritative-verification.yml` and `release.yml` are both `completed/failure` on the same correct `headSha`, so the blocker is no longer stale hosted evidence.
- Refreshed blocker inspection confirmed the two remaining hosted failure signatures:
  - `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log` / `.tmp/m034-s09/t06-blocker/23663179236-failed.log`: `package latest version drifted`
  - `.tmp/m034-s09/t06-blocker/23663179715-failed.log`: `installed meshc.exe build installer smoke fixture failed`

Not passed, and therefore still blocking the original slice demo:
- The all-green hosted-evidence assertion over `.tmp/m034-s09/rollout/workflow-status.json` still fails because `authoritative-verification.yml` is `completed/failure`.
- `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` still exits non-zero at `remote-evidence`, so the canonical full S05 replay and `first-green` archive remain intentionally unclaimed.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

The slice plan assumed the hosted rerolls would converge to a green stop-after preflight and then a green full S05 replay. Instead, each reroll retired one class of blocker and exposed the next real one. That changed the slice from a straightforward closeout into an honest blocker-isolation wave. The slice therefore completed without claiming `.tmp/m034-s06/evidence/first-green/` and without fabricating a green assembled replay. It also used synthetic / GitHub-recreated rollout commits and temporary rollout helper scripts under `.tmp/m034-s09/rollout/` so the remote mutations and monitoring were reproducible without using `git push` from the agent.

## Known Limitations

`authoritative-verification.yml` is still red on the correct rollout SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because package-level `latest` metadata lags the just-published proof version, even though the version-specific metadata/download/search surfaces succeed. `release.yml` is still red on the same correct rollout SHA because the Windows staged installer verifier still fails later in the flow at `installed meshc.exe build installer smoke fixture failed`. Until those two hosted lanes rerun green, `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` will keep stopping at `remote-evidence`, the full S05 replay cannot truthfully pass, and `.tmp/m034-s06/evidence/first-green/` must remain absent.

## Follow-ups

1. Fix the registry latest-version propagation / consistency issue that leaves `scripts/verify-m034-s01.sh` red inside hosted `authoritative-verification.yml` after a successful publish.
2. Fix the remaining Windows staged installer smoke path in `scripts/verify-m034-s03.ps1` / release assets so the hosted build no longer fails at `installed meshc.exe build installer smoke fixture failed`.
3. Rerun the hosted rollout on the existing refs and confirm `authoritative-verification.yml` and `release.yml` go green on `8e6d49dacc4f4cd64824b032078ae45aabfe9635`.
4. Once stop-after `remote-evidence` is green, archive `.tmp/m034-s06/evidence/first-green/` exactly once and then rerun the full `bash scripts/verify-m034-s05.sh` assembly replay to close M034 honestly.

## Files Created/Modified

- `scripts/verify-m034-s05.sh` — Hardened remote-evidence to resolve expected remote refs, compare `headSha`, and persist freshness-aware hosted-run diagnostics.
- `scripts/verify-m034-s06-remote-evidence.sh` — Made the archive helper fail closed on missing freshness fields and preserve red hosted bundles without consuming reserved labels.
- `scripts/tests/verify-m034-s05-contract.test.mjs` — Extended the local contract suite to cover stale-SHA handling and the stronger hosted-evidence shape.
- `scripts/tests/verify-m034-s06-contract.test.mjs` — Extended archive-helper contract coverage for freshness fields, reusable workflow matching, and fail-closed behavior.
- `.github/workflows/publish-extension.yml` — Made reruns duplicate-safe with `skipDuplicate: true` while preserving the exact verified VSIX handoff contract.
- `scripts/verify-m034-s04-workflows.sh` — Enforced the duplicate-safe extension publish semantics in the local workflow contract.
- `scripts/verify-m034-s03.ps1` — Fixed strict-mode `$LASTEXITCODE` handling so unset pure-PowerShell commands no longer throw before diagnostic capture.
- `scripts/verify-m034-s01.sh` — Added retry-covered fetch handling for metadata/version/search transport failures without weakening the live proof.
- `scripts/tests/verify-m034-s03-last-exitcode.ps1` — Added a focused regression for the strict-mode unset-`$LASTEXITCODE` helper path.
- `scripts/tests/verify-m034-s01-fetch-retry.sh` — Added a focused regression proving the metadata/search fetch wrapper retries transport failure and still fails closed.
- `.tmp/m034-s09/rollout/target-sha.txt` — Recorded the approved repaired rollout target SHA.
- `.tmp/m034-s09/rollout/plan.md` — Captured the exact approval payload and ref-move plan used for the hosted rerolls.
- `.tmp/m034-s09/rollout/workflow-status.json` — Preserved per-workflow hosted verdicts on the rerolled SHA for deploy, release, authoritative verification, and extension lanes.
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log` — Captured the hosted authoritative-verification failure proving the package-level `latest` drift blocker.
- `.tmp/m034-s09/t06-blocker/23663179715-failed.log` — Captured the hosted Windows release-smoke failure proving the remaining `installed meshc.exe build installer smoke fixture failed` blocker.
- `.gsd/PROJECT.md` — Refreshed project state to reflect the rolled-out SHA and the two remaining hosted closeout blockers.
- `.gsd/KNOWLEDGE.md` — Appended the S09 hosted-blocker gotchas so future agents start from the real latest-version and Windows release-smoke seams.
