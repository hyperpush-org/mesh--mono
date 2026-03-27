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
- [ ] **T02: Isolate the exact rollout target and approval payload** — Why: S08 proved that local `HEAD` contains more than the two original rollout-fix commits, so S09 needs one deliberate target SHA before any outward GitHub action.

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
- [ ] **T03: Roll approved refs onto GitHub and wait for hosted green** — Why: the verifier hardening in T01 only matters if `main`, `v0.1.0`, and `ext-v0.3.0` are actually rerun on the intended rollout SHA, and `R047` still depends on the extension lane staying inside that hosted evidence set.

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
- [ ] **T04: Archive first-green exactly once and rerun the full assembled verifier** — Why: `R046` and the slice demo are only satisfied when the canonical wrapper proves the live package-manager path, public HTTP surfaces, and extension lane together on the fresh hosted rollout state.

Files: `scripts/verify-m034-s05.sh`, `scripts/verify-m034-s06-remote-evidence.sh`, `.tmp/m034-s06/evidence/first-green/manifest.json`, `.tmp/m034-s05/verify/status.txt`, `.tmp/m034-s05/verify/phase-report.txt`, `.tmp/m034-s05/verify/public-http.log`

Do:
- With `.env` loaded, rerun the stop-after `remote-evidence` preflight and confirm it is green on the freshly rolled refs.
- If `.tmp/m034-s06/evidence/first-green/` is still absent, capture it exactly once through `scripts/verify-m034-s06-remote-evidence.sh` and validate the archived manifest plus remote-run summary.
- Run the full `bash scripts/verify-m034-s05.sh` replay with `.env` loaded and confirm `public-http` and `s01-live-proof` both pass, including the S01 package-version evidence.

Verify: stop-after preflight, archive helper, and final S05 replay all pass from the authenticated repo root.

Done when: `first-green` exists with a passing manifest, `.tmp/m034-s05/verify/status.txt` is `ok`, the phase report reaches the final phases, and the full assembled verifier leaves a green package-manager/public-surface proof bundle.
  - Estimate: 1h
  - Files: scripts/verify-m034-s05.sh, scripts/verify-m034-s06-remote-evidence.sh, .tmp/m034-s06/evidence/first-green/manifest.json, .tmp/m034-s05/verify/status.txt, .tmp/m034-s05/verify/phase-report.txt, .tmp/m034-s05/verify/public-http.log
  - Verify: bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s06-remote-evidence.sh first-green'
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s05.sh'
