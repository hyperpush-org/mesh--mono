---
id: T01
parent: S09
milestone: M034
provides: []
requires: []
affects: []
key_files: ["scripts/verify-m034-s05.sh", "scripts/verify-m034-s06-remote-evidence.sh", "scripts/tests/verify-m034-s05-contract.test.mjs", "scripts/tests/verify-m034-s06-contract.test.mjs", ".gsd/KNOWLEDGE.md", ".gsd/milestones/M034/slices/S09/tasks/T01-SUMMARY.md"]
key_decisions: ["Treat freshness as a separate signal from overall workflow health so matching `headSha` values are not misreported as stale-ref failures when a hosted workflow is red for another reason."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "`node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs` passed. `rg -n "headSha|expected.*Sha|stale" scripts/verify-m034-s05.sh scripts/verify-m034-s06-remote-evidence.sh` confirmed the new surfaces exist. Live stop-after `remote-evidence` and full `bash scripts/verify-m034-s05.sh` replays both failed at the expected hosted-red phase, but the saved artifacts now show matching expected/observed SHAs instead of silent stale-run trust. The archive helper also preserved the red proof under `.tmp/m034-s06/evidence/s09-t01-preflight-2/manifest.json` without consuming the durable `first-green` label."
completed_at: 2026-03-27T17:57:07.688Z
blocker_discovered: false
---

# T01: Enforced remote-evidence headSha freshness and preserved the new SHA contract in archived manifests.

> Enforced remote-evidence headSha freshness and preserved the new SHA contract in archived manifests.

## What Happened
---
id: T01
parent: S09
milestone: M034
key_files:
  - scripts/verify-m034-s05.sh
  - scripts/verify-m034-s06-remote-evidence.sh
  - scripts/tests/verify-m034-s05-contract.test.mjs
  - scripts/tests/verify-m034-s06-contract.test.mjs
  - .gsd/KNOWLEDGE.md
  - .gsd/milestones/M034/slices/S09/tasks/T01-SUMMARY.md
key_decisions:
  - Treat freshness as a separate signal from overall workflow health so matching `headSha` values are not misreported as stale-ref failures when a hosted workflow is red for another reason.
duration: ""
verification_result: passed
completed_at: 2026-03-27T17:57:07.692Z
blocker_discovered: false
---

# T01: Enforced remote-evidence headSha freshness and preserved the new SHA contract in archived manifests.

**Enforced remote-evidence headSha freshness and preserved the new SHA contract in archived manifests.**

## What Happened

Updated `scripts/verify-m034-s05.sh` so `remote-evidence` resolves each required remote ref with `git ls-remote`, compares the expected SHA against the hosted run `headSha`, and persists `expectedRef`, `expectedHeadSha`, `observedHeadSha`, `headShaMatchesExpected`, and a separate freshness verdict into `.tmp/m034-s05/verify/remote-runs.json`. Updated `scripts/verify-m034-s06-remote-evidence.sh` so the archive helper fails closed if those freshness fields are missing and mirrors them into archived `manifest.json` summaries. Rewrote the Node contract tests to cover stale-SHA handling, reusable workflow caller naming, and archive drift. During live verification I found and fixed one semantic bug: non-freshness workflow failures were being mislabeled as freshness failures, so the final verifier now keeps `freshnessStatus: ok` when the `headSha` matches but the hosted workflow is red for another reason.

## Verification

`node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs` passed. `rg -n "headSha|expected.*Sha|stale" scripts/verify-m034-s05.sh scripts/verify-m034-s06-remote-evidence.sh` confirmed the new surfaces exist. Live stop-after `remote-evidence` and full `bash scripts/verify-m034-s05.sh` replays both failed at the expected hosted-red phase, but the saved artifacts now show matching expected/observed SHAs instead of silent stale-run trust. The archive helper also preserved the red proof under `.tmp/m034-s06/evidence/s09-t01-preflight-2/manifest.json` without consuming the durable `first-green` label.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs` | 0 | ✅ pass | 1679ms |
| 2 | `rg -n "headSha|expected.*Sha|stale" scripts/verify-m034-s05.sh scripts/verify-m034-s06-remote-evidence.sh` | 0 | ✅ pass | 32ms |
| 3 | `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'` | 1 | ✅ pass (expected hosted-red proof; freshness fields recorded) | 141115ms |
| 4 | `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s06-remote-evidence.sh s09-t01-preflight-2'` | 1 | ✅ pass (expected hosted-red archive; safe label preserved) | 141300ms |
| 5 | `bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s05.sh'` | 1 | ✅ pass (same first failing phase: remote-evidence) | 141115ms |


## Deviations

Used the safe archive label `s09-t01-preflight-2` instead of the exact `first-green` slice-plan command so T04 can still claim the real first-green bundle exactly once.

## Known Issues

Hosted `deploy-services.yml` and `release.yml` runs on `v0.1.0` are still red, so the canonical S05 replay remains blocked at `remote-evidence` until later S09 rollout work fixes or rerolls those workflows.

## Files Created/Modified

- `scripts/verify-m034-s05.sh`
- `scripts/verify-m034-s06-remote-evidence.sh`
- `scripts/tests/verify-m034-s05-contract.test.mjs`
- `scripts/tests/verify-m034-s06-contract.test.mjs`
- `.gsd/KNOWLEDGE.md`
- `.gsd/milestones/M034/slices/S09/tasks/T01-SUMMARY.md`


## Deviations
Used the safe archive label `s09-t01-preflight-2` instead of the exact `first-green` slice-plan command so T04 can still claim the real first-green bundle exactly once.

## Known Issues
Hosted `deploy-services.yml` and `release.yml` runs on `v0.1.0` are still red, so the canonical S05 replay remains blocked at `remote-evidence` until later S09 rollout work fixes or rerolls those workflows.
