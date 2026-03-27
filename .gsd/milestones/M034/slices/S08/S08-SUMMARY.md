---
id: S08
parent: M034
milestone: M034
provides:
  - A truthful hosted-rollout closeout surface: repaired local deploy/release verifiers plus durable blocker artifacts that show exactly why `first-green` is still unavailable.
requires:
  - slice: S07
    provides: The shared public-surface contract, the remote-evidence wrapper, and the reserved-label discipline that S08 reused while tightening the hosted rollout closeout path.
affects:
  - S09
key_files:
  - packages-website/Dockerfile
  - .github/workflows/release.yml
  - scripts/verify-m034-s03.sh
  - .tmp/m034-s08/tag-rollout/tag-refs.txt
  - .tmp/m034-s08/tag-rollout/workflow-status.json
  - .tmp/m034-s06/evidence/s08-prepush/manifest.json
  - .gsd/PROJECT.md
key_decisions:
  - Carry the builder-resolved `packages-website` dependency tree into the runtime image via prune/copy instead of re-running `npm install --omit=dev --ignore-scripts` in the runtime stage.
  - Satisfy installed `meshc` release-smoke by building `mesh-rt` in the verifier job, and generate staged checksums with portable Unix/Windows code instead of runner-specific assumptions.
  - Treat the missing `first-green` bundle as a rollout-propagation blocker, not as a reason to weaken the wrapper or fabricate hosted evidence from stale tags.
patterns_established:
  - Reserve final evidence labels (`first-green`) and use disposable archive labels (`s08-prepush`) for red baselines so the wrapper remains the sole owner of authoritative hosted-evidence bundles.
  - For Node/Fly images with fragile peer trees, resolve once in the builder stage and prune for runtime instead of re-resolving dependencies in the runtime image.
  - For staged installer smoke, rebuild repo-local runtime prerequisites (`mesh-rt`) inside the verifier and use portable checksum generation so the proof surface matches runner reality.
  - Distinguish local repo truth from hosted rollout truth through saved `headSha` snapshots (`tag-refs.txt`, `workflow-status.json`, archive manifests`) before assuming candidate-tag rerolls are possible.
observability_surfaces:
  - .tmp/m034-s06/evidence/s08-prepush/manifest.json
  - .tmp/m034-s06/evidence/s08-prepush/remote-runs.json
  - .tmp/m034-s06/evidence/s08-prepush/phase-report.txt
  - .tmp/m034-s08/tag-rollout/tag-refs.txt
  - .tmp/m034-s08/tag-rollout/workflow-status.json
  - .tmp/m034-s08/tag-rollout/release-v0.1.0-view.json
  - .tmp/m034-s08/tag-rollout/deploy-services-v0.1.0-view.json
  - .tmp/m034-s08/tag-rollout/publish-extension-ext-v0.3.0-view.json
  - .tmp/m034-s08/deploy-services-local-build.reverify.log
  - .tmp/m034-s03/verify/run
drill_down_paths:
  - .gsd/milestones/M034/slices/S08/tasks/T01-SUMMARY.md
  - .gsd/milestones/M034/slices/S08/tasks/T02-SUMMARY.md
  - .gsd/milestones/M034/slices/S08/tasks/T03-SUMMARY.md
  - .gsd/milestones/M034/slices/S08/tasks/T04-SUMMARY.md
  - .gsd/milestones/M034/slices/S08/tasks/T05-SUMMARY.md
  - .gsd/milestones/M034/slices/S08/tasks/T06-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-27T17:17:42.376Z
blocker_discovered: false
---

# S08: Hosted rollout completion and first-green evidence

**Repaired the repo-side hosted rollout blockers, preserved a fresh red remote-evidence bundle, and proved that `first-green` is still blocked on remote rollout state rather than local verifier drift.**

## What Happened

S08 started by cleaning up the evidence surface instead of pretending the old bundles were trustworthy. The slice re-established one disposable pre-push archive label (`s08-prepush`), verified that the stale `.tmp/m034-s06/evidence/v0.1.0/` directory was incomplete noise, and kept `.tmp/m034-s06/evidence/first-green/` unclaimed.

With that baseline in place, the slice created and monitored the candidate tags on the currently rolled-out remote SHA (`6979a4a17221af8e39200b574aa2209ad54bc983`). The tag monitor captured the real hosted outcome instead of hand-waving it: `publish-extension.yml` went green on `ext-v0.3.0`, while `deploy-services.yml` and `release.yml` stayed red on `v0.1.0`.

The repo-side fixes then landed where the failures actually were. `packages-website/Dockerfile` stopped doing a second runtime dependency resolution pass and now carries the builder-resolved tree forward via `npm ci` -> `npm run build` -> `npm prune --omit=dev`, which removes the hosted `ERESOLVE` path. `release.yml` and `scripts/verify-m034-s03.sh` were hardened so release-asset smoke now builds `mesh-rt` before installer verification, generates Unix `SHA256SUMS` portably with Python, and keeps Windows checksum selection in valid PowerShell bindings instead of the broken `Select-Object -First 1,` form.

After those repo-side repairs, S08 checked the next boundary honestly instead of fabricating success. The repaired local `HEAD` is `5e457f3cce9b58d34be6516164b093f253047510`, but `origin/main` and both remote candidate tags still point at `6979a4a17221af8e39200b574aa2209ad54bc983`, and GitHub returns HTTP 422 when asked about the local-only SHA. That means the remaining blocker is rollout propagation, not tag-monitoring drift. The slice therefore stopped with a truthful blocker capture: a fresh `s08-prepush` archive, durable tag/workflow snapshots under `.tmp/m034-s08/tag-rollout/`, and an intentionally absent `first-green` directory.

## Verification

Passed locally:
- `node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs`
- `bash scripts/verify-m034-s02-workflows.sh`
- `bash scripts/verify-m034-s05-workflows.sh`
- `bash scripts/verify-m034-s03.sh`
- `docker build -f packages-website/Dockerfile packages-website`
- `bash scripts/verify-m034-s06-remote-evidence.sh s08-prepush` (expected non-zero/red result) with `.env` loaded, producing a fresh archive at `.tmp/m034-s06/evidence/s08-prepush/`
- Python artifact assertions confirming:
  - stale `.tmp/m034-s06/evidence/v0.1.0/` is incomplete and non-authoritative
  - `.tmp/m034-s06/evidence/s08-prepush/manifest.json` and `remote-runs.json` exist and record `stopAfterPhase == remote-evidence`
  - `.tmp/m034-s06/evidence/first-green/` is still absent
  - `.tmp/m034-s08/tag-rollout/tag-refs.txt` contains both candidate tags on `6979a4a17221af8e39200b574aa2209ad54bc983`
  - `.tmp/m034-s08/tag-rollout/workflow-status.json` truthfully records `release.yml` and `deploy-services.yml` as `completed/failure` on `v0.1.0`

The hosted blocker remains intentional and verified: `publish-extension.yml` is green on `ext-v0.3.0`, but `release.yml` and `deploy-services.yml` are still red on `v0.1.0`, so `first-green` must not be claimed yet.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

The plan expected the slice to finish with a green `first-green` hosted-evidence bundle. That did not happen. After the repo-side fixes landed, the slice proved that the repaired local commit is not yet on GitHub, so the final truthful output is blocker evidence rather than a consumed `first-green` archive.

## Known Limitations

`origin/main`, `v0.1.0`, and `ext-v0.3.0` still point at `6979a4a17221af8e39200b574aa2209ad54bc983` while local `HEAD` is `5e457f3cce9b58d34be6516164b093f253047510`. Because GitHub does not know the repaired local SHA yet, `release.yml` and `deploy-services.yml` cannot be rerun on the fixed code path, and `.tmp/m034-s06/evidence/first-green/` must remain absent. The old `.tmp/m034-s06/evidence/v0.1.0/` directory is still historical noise and should not be treated as proof.

## Follow-ups

Roll the repaired local SHA onto GitHub, retarget or recreate `v0.1.0` and `ext-v0.3.0` on that rolled-out commit, rerun the tag monitor until `release.yml` and `deploy-services.yml` are green alongside the already-green `publish-extension.yml`, then claim `.tmp/m034-s06/evidence/first-green/` exactly once with `scripts/verify-m034-s06-remote-evidence.sh` before S09 resumes public-freshness replay.

## Files Created/Modified

- `packages-website/Dockerfile` — Removed the runtime-stage dependency reinstall path and switched the image to builder-stage prune/copy semantics so Fly deploys do not re-resolve the Svelte/Vite peer tree.
- `.github/workflows/release.yml` — Hardened release-asset smoke by building `mesh-rt` before installer verification and by generating staged checksums portably on Unix and Windows.
- `scripts/verify-m034-s03.sh` — Kept the staged installer verifier aligned with the release-smoke contract and confirmed the canonical installer surface through freshly staged local assets.
- `.tmp/m034-s08/tag-rollout/tag-refs.txt` — Recorded the remote main SHA, local head SHA, and candidate-tag refs so later work can distinguish rollout propagation blockers from tag-creation drift.
- `.tmp/m034-s08/tag-rollout/workflow-status.json` — Captured the hosted candidate-tag verdicts, including green `publish-extension.yml` and red `release.yml`/`deploy-services.yml` on the stale rollout commit.
- `.tmp/m034-s06/evidence/s08-prepush/manifest.json` — Preserved the fresh red remote-evidence baseline with explicit phase/state metadata while leaving `first-green` unused.
- `.gsd/PROJECT.md` — Refreshed the current-state paragraph so downstream slices inherit the real S08 rollout blocker instead of the stale S07 remote-state description.
