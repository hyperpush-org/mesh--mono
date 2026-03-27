# S09: Public freshness reconciliation and final assembly replay

**Goal:** Make hosted rollout freshness mechanically enforced, move the approved release refs onto the real rollout commit, and close the canonical S05 replay with preserved first-green evidence instead of trusting stale hosted green runs.
**Demo:** After this: `meshlang.dev` installers/docs match repo truth and the canonical `bash scripts/verify-m034-s05.sh` replay finishes green through `remote-evidence`, `public-http`, and `s01-live-proof`.

## Tasks
- [x] **T01: Enforced remote-evidence headSha freshness and preserved the new SHA contract in archived manifests.** — Why: `R045` is still weak if `scripts/verify-m034-s05.sh` accepts a green run that only matches the branch/tag name while the hosted `headSha` is stale.

Files: `scripts/verify-m034-s05.sh`, `scripts/verify-m034-s06-remote-evidence.sh`, `scripts/tests/verify-m034-s05-contract.test.mjs`, `scripts/tests/verify-m034-s06-contract.test.mjs`

Do:
- Extend remote-evidence so each required workflow resolves the expected ref SHA for `main`, `v0.1.0`, and `ext-v0.3.0` and compares it against the hosted run's `headSha`.
- Persist expected SHA, observed SHA, mismatch reason, and latest-available run context into `remote-runs.json` and the S06 archive manifest so stale-green failures are self-explanatory.
- Update the Node contract tests so the verifier and archive helper both cover stale-sha failure, reusable workflow naming, and preserved artifact shape.

Verify: `node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs`

Done when: stop-after `remote-evidence` can fail closed on stale hosted runs even when workflow/job names are otherwise green, and the archive contract preserves the extra freshness context.
  - Estimate: 1h
  - Files: scripts/verify-m034-s05.sh, scripts/verify-m034-s06-remote-evidence.sh, scripts/tests/verify-m034-s05-contract.test.mjs, scripts/tests/verify-m034-s06-contract.test.mjs
  - Verify: node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs
- [x] **T02: Recorded the exact synthetic rollout target SHA and approval payload for the S09 hosted reroll.** — Why: S08 proved that local `HEAD` contains more than the two original rollout-fix commits, so S09 needs one deliberate target SHA before any outward GitHub action.

Files: `packages-website/Dockerfile`, `.github/workflows/release.yml`, `scripts/verify-m034-s05.sh`, `.tmp/m034-s09/rollout/target-sha.txt`, `.tmp/m034-s09/rollout/remote-refs.before.txt`, `.tmp/m034-s09/rollout/plan.md`

Do:
- Compare `origin/main..HEAD` and isolate the exact commit set that must be shipped for the hosted `release.yml`, `deploy-services.yml`, and freshness-gated `remote-evidence` path.
- Record the current remote refs and the proposed target SHA / tag moves under `.tmp/m034-s09/rollout/`.
- Write the exact outward-action summary the executor will show the user for approval, including which refs move and why, then stop before mutating GitHub.

Verify: `test -s .tmp/m034-s09/rollout/target-sha.txt && test -s .tmp/m034-s09/rollout/remote-refs.before.txt && test -s .tmp/m034-s09/rollout/plan.md`

Done when: the executor has one concrete rollout SHA, a recorded before-state for remote refs, and an unambiguous approval payload that says exactly what will be shipped.
  - Estimate: 45m
  - Files: packages-website/Dockerfile, .github/workflows/release.yml, scripts/verify-m034-s05.sh, .tmp/m034-s09/rollout/target-sha.txt, .tmp/m034-s09/rollout/remote-refs.before.txt, .tmp/m034-s09/rollout/plan.md
  - Verify: bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/target-sha.txt; test -s .tmp/m034-s09/rollout/remote-refs.before.txt; test -s .tmp/m034-s09/rollout/plan.md'
- [x] **T03: Retargeted `main`, `v0.1.0`, and `ext-v0.3.0` to the approved rollout SHA and captured hosted workflow evidence up to the red `publish-extension.yml` blocker.** — Why: the verifier hardening in T01 only matters if `main`, `v0.1.0`, and `ext-v0.3.0` are actually rerun on the intended rollout SHA, and `R047` still depends on the extension lane staying inside that hosted evidence set.

Files: `scripts/verify-m034-s05.sh`, `.tmp/m034-s09/rollout/plan.md`, `.tmp/m034-s09/rollout/remote-refs.after.txt`, `.tmp/m034-s09/rollout/workflow-status.json`, `.tmp/m034-s09/rollout/workflow-urls.txt`

Do:
- Show the recorded rollout summary and get explicit user confirmation before any remote mutation.
- Push or retarget `main`, `v0.1.0`, and `ext-v0.3.0` onto the approved SHA using the least-destructive path allowed by the current remote state, then record the resulting ref map.
- Monitor `deploy.yml`, `authoritative-verification.yml`, `release.yml`, `deploy-services.yml`, `extension-release-proof.yml`, and `publish-extension.yml` until they are green on the expected refs and `headSha`, persisting the final URLs and status payloads.

Verify: `python3 - <<'PY' ... workflow-status.json ... PY` plus `git ls-remote` checks for the updated refs.

Done when: the remote refs and the saved hosted-workflow status payloads all agree on the intended SHA, and every required workflow is completed/success on the correct ref.
  - Estimate: 1h 30m
  - Files: scripts/verify-m034-s05.sh, .tmp/m034-s09/rollout/plan.md, .tmp/m034-s09/rollout/remote-refs.after.txt, .tmp/m034-s09/rollout/workflow-status.json, .tmp/m034-s09/rollout/workflow-urls.txt
  - Verify: bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/remote-refs.after.txt; test -s .tmp/m034-s09/rollout/workflow-status.json; test -s .tmp/m034-s09/rollout/workflow-urls.txt'
  - Blocker: `publish-extension.yml` completed with `conclusion: failure` on the correct rollout SHA (`c443270a8fe17419e9ca99b4755b90f3cb7af3a0`), so the slice cannot claim an all-green hosted evidence set. `release.yml` was still `in_progress` when the monitor stopped on the red extension caller lane, so its final conclusion was not captured by this task. Because the all-green hosted contract did not pass, T04’s planned `first-green` archive and full S05 replay are blocked pending investigation and likely replan of the failing hosted workflow lane.
- [x] **T04: Made extension reruns duplicate-safe, fixed the PowerShell strict-mode verifier helper, and added retry-covered local guards for the S01 metadata fetch path.** — Update the reroll-sensitive release surfaces before touching remote refs again.
- Make `.github/workflows/publish-extension.yml` idempotent for reruns on the same `ext-v*` version so Open VSX/Marketplace duplicate publishes do not fail the caller workflow after the verified VSIX handoff has already passed.
- Extend `scripts/verify-m034-s04-workflows.sh` so the workflow contract enforces the duplicate-safe publish semantics and still guarantees the exact proof artifact handoff.
- Fix `scripts/verify-m034-s03.ps1` so `Invoke-LoggedCommand` does not throw under `Set-StrictMode -Version Latest` when `$LASTEXITCODE` has not been initialized, and add a focused PowerShell regression test that proves the helper treats the unset case as success.
- Harden `scripts/verify-m034-s01.sh` around the package metadata/version/search fetches with a fail-closed retry budget so a single transient curl SSL timeout does not sink `release.yml`, and add a small local regression harness that proves the fetch path retries transport failure before failing.
- Preserve durable diagnostics in the existing verifier artifact trees rather than inventing a new ad-hoc path.
  - Estimate: 1h 30m
  - Files: .github/workflows/publish-extension.yml, scripts/verify-m034-s04-workflows.sh, scripts/verify-m034-s03.ps1, scripts/verify-m034-s01.sh, scripts/tests/verify-m034-s03-last-exitcode.ps1, scripts/tests/verify-m034-s01-fetch-retry.sh
  - Verify: bash scripts/verify-m034-s04-workflows.sh all
pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1
bash scripts/tests/verify-m034-s01-fetch-retry.sh
- [x] **T05: Rolled `main`, `v0.1.0`, and `ext-v0.3.0` to repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` and captured the new authoritative-verification blocker.** — Once the local reroll blockers are repaired, produce one new rollout target and rerun the hosted evidence set on that exact commit.
- Recompute the minimal repaired rollout commit relative to `origin/main`, record the exact target SHA plus before-state ref map under `.tmp/m034-s09/rollout/`, and update the approval payload with the new diff and ref moves.
- Show the recorded summary and get explicit user confirmation before any outward GitHub action.
- Move `main`, `v0.1.0`, and `ext-v0.3.0` onto the repaired SHA using the least-destructive path the remote state allows, then record the resulting after-state ref map.
- Monitor `deploy.yml`, `authoritative-verification.yml`, `release.yml`, `deploy-services.yml`, `extension-release-proof.yml`, and `publish-extension.yml` until they are completed/success on the expected refs and `headSha`.
- If any lane still fails, persist the failing job URLs plus `gh run view --log-failed` output under `.tmp/m034-s09/rollout/failed-jobs/` before stopping so the next blocker is self-explanatory rather than just 'workflow red'.
  - Estimate: 1h 30m
  - Files: .tmp/m034-s09/rollout/target-sha.txt, .tmp/m034-s09/rollout/remote-refs.before.txt, .tmp/m034-s09/rollout/plan.md, .tmp/m034-s09/rollout/apply_rollout.py, .tmp/m034-s09/rollout/monitor_workflows.py, .tmp/m034-s09/rollout/remote-refs.after.txt, .tmp/m034-s09/rollout/workflow-status.json, .tmp/m034-s09/rollout/workflow-urls.txt, .tmp/m034-s09/rollout/failed-jobs/
  - Verify: bash -c 'set -euo pipefail; test -s .tmp/m034-s09/rollout/target-sha.txt; test -s .tmp/m034-s09/rollout/remote-refs.before.txt; test -s .tmp/m034-s09/rollout/remote-refs.after.txt; test -s .tmp/m034-s09/rollout/workflow-status.json; test -s .tmp/m034-s09/rollout/workflow-urls.txt'
python3 - <<'PY'
from pathlib import Path
import json
required = [
    'deploy.yml',
    'deploy-services.yml',
    'authoritative-verification.yml',
    'release.yml',
    'extension-release-proof.yml',
    'publish-extension.yml',
]
target = Path('.tmp/m034-s09/rollout/target-sha.txt').read_text().strip()
status = json.loads(Path('.tmp/m034-s09/rollout/workflow-status.json').read_text())
for name in required:
    entry = status[name]
    assert entry['headSha'] == target, (name, entry)
    assert entry['status'] == 'completed', (name, entry)
    assert entry['conclusion'] == 'success', (name, entry)
print('workflow-status.json matches repaired rollout target and all-green hosted evidence')
PY
  - Blocker: `authoritative-verification.yml` failed on repaired SHA `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because the package-level `latest` metadata lagged the version just published by the hosted proof run. `release.yml`, `extension-release-proof.yml`, and `publish-extension.yml` were still in progress when the monitor stopped on that red lane, so the task does not claim an all-green hosted evidence set. T06 remains blocked until that new hosted failure is fixed.
- [x] **T06: Reran the S05 stop-after preflight, proved the repaired rollout SHA is still red on hosted verification, and preserved `first-green` for the next real green bundle.** — With the repaired hosted evidence set green on the fresh rollout SHA, close the slice with the canonical assembled proof.
- Load `.env`, rerun the stop-after `remote-evidence` preflight, and confirm it is green on the repaired refs and `headSha`.
- If `.tmp/m034-s06/evidence/first-green/` is still absent, capture it exactly once through `scripts/verify-m034-s06-remote-evidence.sh` and validate the archived manifest plus remote-run summary.
- Run the full `bash scripts/verify-m034-s05.sh` replay with `.env` loaded and confirm `remote-evidence`, `public-http`, and `s01-live-proof` all pass on the repaired hosted state.
- Check the final proof bundle for `status.txt == ok`, a complete phase report, `public-http.log`, and the S01 package-version evidence so the slice demo is preserved in one truthful bundle.
  - Estimate: 1h
  - Files: scripts/verify-m034-s05.sh, scripts/verify-m034-s06-remote-evidence.sh, .tmp/m034-s06/evidence/first-green/manifest.json, .tmp/m034-s05/verify/status.txt, .tmp/m034-s05/verify/phase-report.txt, .tmp/m034-s05/verify/public-http.log
  - Verify: bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s06-remote-evidence.sh first-green'
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s05.sh'
python3 - <<'PY'
from pathlib import Path
import json
root = Path('.tmp/m034-s06/evidence/first-green')
assert (root / 'manifest.json').exists()
assert Path('.tmp/m034-s05/verify/status.txt').read_text().strip() == 'ok'
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['s05ExitCode'] == 0, manifest
assert manifest['stopAfterPhase'] == 'remote-evidence', manifest
public_log = Path('.tmp/m034-s05/verify/public-http.log')
assert public_log.exists(), public_log
assert any(Path('.tmp/m034-s01/verify').rglob('package-version.txt'))
print('assembled proof bundle is complete')
PY
  - Blocker: `authoritative-verification.yml` is still red on `8e6d49dacc4f4cd64824b032078ae45aabfe9635` because `scripts/verify-m034-s01.sh` reports package latest-version drift. `release.yml` is still red on the same SHA because the Windows `scripts/verify-m034-s03.ps1` staged installer smoke fails while building the installed `meshc.exe` fixture. Until those hosted blockers are fixed and rerun successfully, `.tmp/m034-s06/evidence/first-green/` must remain absent.
