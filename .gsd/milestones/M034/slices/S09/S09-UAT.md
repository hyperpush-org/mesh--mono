# S09: Public freshness reconciliation and final assembly replay — UAT

**Milestone:** M034
**Written:** 2026-03-27T19:40:52.958Z

# S09: Public freshness reconciliation and final assembly replay — UAT

**Milestone:** M034
**Written:** 2026-03-27

## UAT Type

- UAT mode: artifact-driven plus read-only hosted verification
- Why this mode is sufficient: S09 changed release-verifier behavior, rerolled remote refs, and preserved blocker evidence. The truthful proof is a combination of local contract checks, recorded rollout artifacts, and current hosted workflow state on the rolled-out SHA.

## Preconditions

- Run from the repo root.
- `.env` is present so hosted read-only queries can authenticate.
- `pwsh` is installed for the PowerShell regression check.
- The tester understands that `.tmp/m034-s06/evidence/first-green/` must remain absent unless stop-after `remote-evidence` is green.

## Smoke Test

Run:

`node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs`

**Expected:** all tests pass, including the stale-SHA and archive fail-closed cases.

## Test Cases

### 1. Freshness-aware hosted-evidence contract is locally enforced

1. Run `node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs`.
2. Inspect `scripts/verify-m034-s05.sh` and `scripts/verify-m034-s06-remote-evidence.sh` outputs only if the tests fail.
3. **Expected:**
   - the Node suite passes
   - the contract covers `headSha` freshness, reusable workflow matching, and archive fail-closed behavior
   - no test relies on branch/tag names alone as hosted proof

### 2. Local reroll-safety guards remain green

1. Run `bash scripts/verify-m034-s04-workflows.sh all`.
2. Run `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`.
3. Run `bash scripts/tests/verify-m034-s01-fetch-retry.sh`.
4. **Expected:**
   - the workflow contract reports `verify-m034-s04-workflows: ok (all)`
   - the PowerShell regression reports `verify-m034-s03-last-exitcode: ok`
   - the fetch retry regression reports `verify-m034-s01-fetch-retry: ok`

### 3. Rolled-out refs and saved rollout artifacts agree on the repaired SHA

1. Check that `.tmp/m034-s09/rollout/target-sha.txt`, `remote-refs.before.txt`, `remote-refs.after.txt`, `workflow-status.json`, and `workflow-urls.txt` all exist.
2. Read `.tmp/m034-s09/rollout/target-sha.txt`.
3. Inspect `.tmp/m034-s09/rollout/remote-refs.after.txt` and `.tmp/m034-s09/rollout/workflow-status.json`.
4. **Expected:**
   - the target SHA is `8e6d49dacc4f4cd64824b032078ae45aabfe9635`
   - `main`, `v0.1.0`, and `ext-v0.3.0` all point at that SHA in the saved after-state
   - the workflow status file records the same SHA for every required hosted lane

### 4. Canonical stop-after remote-evidence replay fails for live hosted blockers, not stale refs

1. Load `.env`.
2. Run `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh`.
3. Inspect `.tmp/m034-s05/verify/phase-report.txt`, `failed-phase.txt`, and `remote-runs.json`.
4. **Expected:**
   - the command exits non-zero
   - `failed-phase.txt` is `remote-evidence`
   - `remote-runs.json` reports `freshnessStatus: ok` / `headShaMatchesExpected: true` for every required workflow
   - `deploy.yml`, `deploy-services.yml`, `extension-release-proof.yml`, and `publish-extension.yml` are `ok`
   - `authoritative-verification.yml` and `release.yml` are the only red lanes

### 5. Remaining hosted blockers are preserved as concrete artifacts

1. Inspect `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log` or `.tmp/m034-s09/t06-blocker/23663179236-failed.log`.
2. Inspect `.tmp/m034-s09/t06-blocker/23663179715-failed.log`.
3. **Expected:**
   - the authoritative-verification blocker includes `package latest version drifted`
   - the release blocker includes `installed meshc.exe build installer smoke fixture failed`
   - the blocker artifacts are specific enough that the next agent can resume without re-polling the entire workflow graph

## Edge Cases

### `first-green` remains reserved while the stop-after preflight is red

1. After running the stop-after preflight, check whether `.tmp/m034-s06/evidence/first-green/` exists.
2. **Expected:** it does not exist.
3. **Why this matters:** a red preflight must not consume the once-only archive label.

### Freshness and health stay decoupled in the saved hosted evidence

1. Inspect `.tmp/m034-s05/verify/remote-runs.json`.
2. **Expected:** the red workflows still show the correct rolled-out SHA while remaining red; they are not mislabeled as stale-ref failures.

## Failure Signals

- `remote-runs.json` stops recording `expectedHeadSha`, `observedHeadSha`, or `freshnessStatus`.
- Any required hosted workflow points at a different `headSha` than `8e6d49dacc4f4cd64824b032078ae45aabfe9635`.
- `publish-extension.yml` or `deploy-services.yml` regresses back to red on the repaired SHA.
- `authoritative-verification.yml` or `release.yml` disappears from the blocker bundle without a corresponding green rerun.
- `.tmp/m034-s06/evidence/first-green/` appears while stop-after `remote-evidence` is still red.

## Requirements Proved By This UAT

- none directly validated to green in S09; this UAT proves that hosted release freshness is now mechanically enforced and that the remaining M034 blockers are truthfully isolated.

## Not Proven By This UAT

- a green full `bash scripts/verify-m034-s05.sh` replay
- a claimed `.tmp/m034-s06/evidence/first-green/` bundle
- that package-level `latest` propagation is fixed
- that the hosted Windows staged installer smoke is fixed

## Notes for Tester

Do not treat this slice as a green release-closeout. Treat it as the authoritative blocker-isolation checkpoint after rollout freshness was reconciled. If the two remaining hosted lanes go green on the same SHA, rerun stop-after `remote-evidence`, claim `first-green` exactly once, and only then rerun the full S05 assembly proof.
