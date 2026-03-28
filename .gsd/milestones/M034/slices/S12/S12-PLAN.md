# S12: Windows release-smoke remediation and final green closeout

**Goal:** Retire the remaining hosted Windows release-smoke blocker with a truthful installed-compiler regression, then close M034 with fresh remote-evidence, one-shot first-green capture, and a clean full S05 replay.
**Demo:** After this: After this: `release.yml` on `v0.1.0` is green, `.tmp/m034-s06/evidence/first-green/` exists exactly once, and a fresh `bash scripts/verify-m034-s05.sh` replay passes through `remote-evidence`, `public-http`, and `s01-live-proof`.

## Tasks
- [x] **T01: Added compiler build traces and Windows smoke classification regressions.** — Build a local regression around the installed Windows `meshc.exe build` path and add diagnostics that separate pre-object, runtime lookup, and linker failures.
- Why: S11 proved the hosted blocker is real, but the local proof surface still stops short of the installed build path.
- Do: keep the staged installer flow real, record resolved LLVM/runtime/linker inputs, and add a focused regression file for the installed-build contract.
- Done when: the failure boundary is reproducible with actionable logs or the staged installed build already goes green locally.
  - Estimate: 1h15m
  - Files: scripts/verify-m034-s03.ps1, scripts/tests/verify-m034-s03-installed-build.ps1, compiler/meshc/tests/e2e_m034_s12.rs, scripts/fixtures/m034-s03-installer-smoke/main.mpl, .tmp/m034-s12/t01/diagnostic-summary.json
  - Verify: pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1
pwsh -NoProfile -File scripts/tests/verify-m034-s03-installed-build.ps1
cargo test -p meshc --test e2e_m034_s12 -- --nocapture
- [x] **T02: Preflighted Windows link prerequisites and made the staged verifier export `CARGO_TARGET_DIR`.** — Fix the installed Windows compiler/runtime handshake and keep the verifier honest so the staged hello fixture either builds successfully or reports a deterministic actionable error.
- Why: the release lane cannot go green until the real installed `meshc.exe build` path stops collapsing into an empty access-violation bundle.
- Do: repair runtime/toolchain discovery or earlier codegen failure surfaces, extend regression coverage, and only touch workflow contract text if the truthful verifier shape changes.
- Done when: the installed build path no longer fails opaquely and the local repair proofs are fresh.
  - Estimate: 1h30m
  - Files: compiler/mesh-codegen/src/link.rs, compiler/mesh-codegen/src/lib.rs, compiler/meshc/src/main.rs, scripts/verify-m034-s03.ps1, compiler/meshc/tests/e2e_m034_s12.rs, scripts/tests/verify-m034-s03-installed-build.ps1, .tmp/m034-s12/t02/local-repair-summary.json
  - Verify: cargo test -p mesh-codegen link -- --nocapture
cargo test -p meshc --test e2e_m034_s12 -- --nocapture
pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1
pwsh -NoProfile -File scripts/tests/verify-m034-s03-installed-build.ps1
bash scripts/verify-m034-s02-workflows.sh
- [x] **T03: Reran the approved hosted `release.yml` lane on `v0.1.0`, refreshed `remote-evidence`, and preserved a fresh Windows diagnostics bundle for the still-red release smoke.** — After explicit user confirmation, rerun the approved hosted release lane and refresh the authoritative remote-evidence bundle.
- Why: R007 is about hosted delivery truth, not repo-local confidence.
- Do: reuse the repaired verifier path, refresh `remote-runs.json`, and download new Windows diagnostics only if the hosted lane stays red.
- Done when: the approved `v0.1.0` release lane is green in fresh evidence or the remaining hosted blocker is re-captured with new artifacts.
  - Estimate: 1h
  - Files: scripts/verify-m034-s05.sh, scripts/verify-m034-s06-remote-evidence.sh, .tmp/m034-s05/verify/remote-runs.json, .tmp/m034-s12/t03/hosted-rollout-summary.json, .tmp/m034-s12/t03/diag-download/
  - Verify: VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh
test -s .tmp/m034-s12/t03/hosted-rollout-summary.json
- [ ] **T04: Capture first-green once and finish the final assembly replay** — Once the hosted release lane is green, spend the one-shot `first-green` archive exactly once and finish the full `.env`-backed S05 closeout replay.
- Why: the milestone cannot claim delivery truth until both the hosted rollout evidence and the full assembled replay are fresh.
- Do: capture `first-green`, run the full replay from a fresh verify root, and write a final closeout summary that links the replay back to the hosted archive.
- Done when: `first-green` exists exactly once and the final replay passes through `remote-evidence`, `public-http`, and `s01-live-proof`.
  - Estimate: 1h
  - Files: scripts/verify-m034-s05.sh, scripts/verify-m034-s06-remote-evidence.sh, .env, .tmp/m034-s06/evidence/first-green/manifest.json, .tmp/m034-s05/verify/status.txt, .tmp/m034-s05/verify/current-phase.txt, .tmp/m034-s05/verify/phase-report.txt, .tmp/m034-s12/t04/final-closeout-summary.json
  - Verify: bash scripts/verify-m034-s06-remote-evidence.sh first-green
set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s05.sh
grep -Fxq 'ok' .tmp/m034-s05/verify/status.txt
grep -Fxq 'complete' .tmp/m034-s05/verify/current-phase.txt
grep -Fxq $'remote-evidence	passed' .tmp/m034-s05/verify/phase-report.txt
grep -Fxq $'public-http	passed' .tmp/m034-s05/verify/phase-report.txt
grep -Fxq $'s01-live-proof	passed' .tmp/m034-s05/verify/phase-report.txt
