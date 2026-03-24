# S08: Final Proof Surface Reconciliation

**Goal:** Close the last truth-surface gap for M028 by making every promoted README/docs/UAT/validation artifact point at the same green recovery-aware `reference-backend/` proof path.
**Demo:** The public runbook, proof page, internal closure artifacts, milestone validation, and requirement tracking all agree on the same passing S07 command set, and the full proof surface reruns cleanly without placeholder or pre-S07 blocker language.

## Decomposition Rationale

S08 is not another runtime slice. S07 already closed the technical recovery contract. The remaining risk is drift between surfaces that external evaluators, future agents, and milestone validation still read. That makes the ordering straightforward.

The first task must repair the deepest public truth hierarchy: `reference-backend/README.md`, the production proof page, and the verifier script. That is the only way to stop the repo from claiming a recovery-aware proof path while the runbook still omits the actual recovery contract.

The second task rewrites the stale internal closure artifacts. Those files are not public-facing, but they still matter because `M028-VALIDATION.md` and future roadmap work rely on them. Keeping S05/S06 in a pre-S07 state would leave contradictory evidence in the repo even if the public docs were corrected.

The final task is the seal. It reruns the full green proof set, then updates milestone validation and requirement tracking only after the evidence is back in hand. That keeps R008 closure evidence-first instead of turning S08 into a docs-only paper-over pass.

## Must-Haves

- S08 must directly advance active requirement **R008** by ensuring the promoted production-proof surfaces point only at the real `reference-backend/` path and not at placeholder or stale partial-closure claims.
- S08 must keep already-validated **R004** and **R009** aligned by removing any lingering artifact that still says crash/restart proof is red or that the reference backend is not yet the authoritative backend proof target.
- `reference-backend/README.md`, `website/docs/docs/production-backend-proof/index.md`, and `reference-backend/scripts/verify-production-proof-surface.sh` must agree on one recovery-aware command set and mechanically enforce the runbook/proof-page contract.
- `.gsd/milestones/M028/slices/S05/*`, `.gsd/milestones/M028/slices/S06/*`, `.gsd/milestones/M028/M028-VALIDATION.md`, and `.gsd/REQUIREMENTS.md` must stop contradicting the now-green S07 proof surface.

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `bash reference-backend/scripts/verify-production-proof-surface.sh`
- `npm --prefix website ci`
- `npm --prefix website run build`
- `cargo run -p meshc -- build reference-backend`
- `cargo run -p meshc -- fmt --check reference-backend`
- `cargo run -p meshc -- test reference-backend`
- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_crash_recovers_job -- --ignored --nocapture`
- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_restart_is_visible_in_health -- --ignored --nocapture`
- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_process_restart_recovers_inflight_job -- --ignored --nocapture`
- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_migration_status_and_apply -- --ignored --nocapture`
- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture`
- `! rg -n "placeholder|partial / not done|current blocker|needs-remediation|R004.*still open|R009.*still open|replace this placeholder" .gsd/milestones/M028/M028-VALIDATION.md .gsd/milestones/M028/slices/S05/S05-SUMMARY.md .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-SUMMARY.md .gsd/milestones/M028/slices/S06/S06-UAT.md`

## Observability / Diagnostics

- Runtime signals: the authoritative recovery signals remain the named S07 proofs plus `/health` fields such as `restart_count`, `last_exit_reason`, `recovered_jobs`, `last_recovery_at`, and `recovery_active`.
- Inspection surfaces: `compiler/meshc/tests/e2e_reference_backend.rs`, `reference-backend/scripts/verify-production-proof-surface.sh`, `reference-backend/README.md`, `website/docs/docs/production-backend-proof/index.md`, `.gsd/milestones/M028/M028-VALIDATION.md`, and `.gsd/REQUIREMENTS.md`.
- Failure visibility: future agents must be able to tell whether drift is public-doc drift, internal-closure drift, or real proof regression by rerunning one named command and comparing the resulting artifact text against the canonical S07 command set.
- Redaction constraints: docs, UAT, and validation surfaces must not echo secret values; only command names, file paths, health fields, and proof outcomes belong in the reconciled surfaces.

## Integration Closure

- Upstream surfaces consumed: `reference-backend/README.md`, `reference-backend/scripts/verify-production-proof-surface.sh`, `website/docs/docs/production-backend-proof/index.md`, `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md`, `.gsd/milestones/M028/slices/S05/S05-UAT.md`, `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md`, `.gsd/milestones/M028/slices/S06/S06-UAT.md`, `.gsd/milestones/M028/slices/S07/S07-UAT.md`, `.gsd/milestones/M028/M028-VALIDATION.md`, and `.gsd/REQUIREMENTS.md`.
- New wiring introduced in this slice: the public verifier guards recovery-aware wording, the internal closure artifacts explicitly inherit the green S07 command set, and milestone validation plus requirement tracking are sealed against the same rerun evidence.
- What remains before the milestone is truly usable end-to-end: nothing inside M028 once this slice’s verification list passes and R008 is marked validated.

## Tasks

- [x] **T01: Reconcile the public runbook and proof guard** `est:2h`
  - Why: The deepest public proof surfaces still drift from the now-green recovery contract, especially `reference-backend/README.md` and the verifier script that is supposed to keep public claims honest.
  - Files: `reference-backend/README.md`, `website/docs/docs/production-backend-proof/index.md`, `reference-backend/scripts/verify-production-proof-surface.sh`
  - Do: Add the missing supervision/recovery runbook section to `reference-backend/README.md`, align the proof page with the authoritative S07 command set, and strengthen the verifier so it fails when the runbook/proof page stop mentioning the green recovery-aware contract.
  - Verify: `bash reference-backend/scripts/verify-production-proof-surface.sh && rg -n "Supervision and recovery|restart_count|last_exit_reason|recovered_jobs|process restart" reference-backend/README.md && rg -n "e2e_reference_backend_worker_crash_recovers_job|e2e_reference_backend_worker_restart_is_visible_in_health|e2e_reference_backend_process_restart_recovers_inflight_job|e2e_reference_backend_migration_status_and_apply|e2e_reference_backend_deploy_artifact_smoke" website/docs/docs/production-backend-proof/index.md reference-backend/scripts/verify-production-proof-surface.sh`
  - Done when: the runbook, proof page, and verifier all describe and enforce the same recovery-aware proof surface without relying on implied or missing recovery detail.
- [x] **T02: Rewrite stale S05 and S06 closure artifacts** `est:2h`
  - Why: The repo still contains placeholder and pre-S07 negative evidence in the S05/S06 summary and UAT files, which undermines milestone closure even if the public docs are corrected.
  - Files: `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md`, `.gsd/milestones/M028/slices/S05/S05-UAT.md`, `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md`, `.gsd/milestones/M028/slices/S06/S06-UAT.md`, `.gsd/milestones/M028/slices/S07/S07-UAT.md`
  - Do: Replace the S05 placeholder artifacts with honest current-state closure text anchored to S07, rewrite the S06 summary/UAT around the now-green recovery-aware proof set, and reuse the S07 UAT command ordering instead of inventing a second acceptance shape.
  - Verify: `! rg -n "placeholder|partial / not done|current blocker|replace this placeholder|needs-remediation" .gsd/milestones/M028/slices/S05/S05-SUMMARY.md .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-SUMMARY.md .gsd/milestones/M028/slices/S06/S06-UAT.md && rg -n "e2e_reference_backend_worker_crash_recovers_job|e2e_reference_backend_worker_restart_is_visible_in_health|e2e_reference_backend_process_restart_recovers_inflight_job|e2e_reference_backend_migration_status_and_apply|e2e_reference_backend_deploy_artifact_smoke" .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-UAT.md`
  - Done when: S05/S06 no longer contain placeholder or still-red recovery language and both UAT surfaces point at the same green S07 command set.
- [ ] **T03: Seal milestone validation and requirement truth** `est:2h`
  - Why: The milestone cannot close honestly until the full proof set is rerun and both `M028-VALIDATION.md` and `REQUIREMENTS.md` reflect the green post-S07/post-S08 state.
  - Files: `.gsd/milestones/M028/M028-VALIDATION.md`, `.gsd/REQUIREMENTS.md`, `reference-backend/scripts/verify-production-proof-surface.sh`, `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md`, `.gsd/milestones/M028/slices/S05/S05-UAT.md`, `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md`, `.gsd/milestones/M028/slices/S06/S06-UAT.md`
  - Do: Rerun the public-doc, website-build, backend-baseline, and serial recovery proofs after T01-T02, then rewrite `M028-VALIDATION.md` to the final green verdict and update R008 in `.gsd/REQUIREMENTS.md` only if the reruns pass.
  - Verify: `bash reference-backend/scripts/verify-production-proof-surface.sh && npm --prefix website ci && npm --prefix website run build && cargo run -p meshc -- build reference-backend && cargo run -p meshc -- fmt --check reference-backend && cargo run -p meshc -- test reference-backend && set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_crash_recovers_job -- --ignored --nocapture && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_restart_is_visible_in_health -- --ignored --nocapture && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_process_restart_recovers_inflight_job -- --ignored --nocapture && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_migration_status_and_apply -- --ignored --nocapture && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture && python - <<'PY'
from pathlib import Path
req = Path('.gsd/REQUIREMENTS.md').read_text()
val = Path('.gsd/milestones/M028/M028-VALIDATION.md').read_text()
section = req.split('### R008 —', 1)[1].split('\n### ', 1)[0]
assert 'Status: validated' in section, 'R008 is not marked validated'
assert 'verdict: pass' in val, 'M028 validation verdict is not pass'
PY`
  - Done when: the full proof surface reruns green, `M028-VALIDATION.md` no longer describes remediation work, and `.gsd/REQUIREMENTS.md` records R008 as validated by the reconciled proof surface.

## Files Likely Touched

- `reference-backend/README.md`
- `reference-backend/scripts/verify-production-proof-surface.sh`
- `website/docs/docs/production-backend-proof/index.md`
- `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md`
- `.gsd/milestones/M028/slices/S05/S05-UAT.md`
- `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md`
- `.gsd/milestones/M028/slices/S06/S06-UAT.md`
- `.gsd/milestones/M028/M028-VALIDATION.md`
- `.gsd/REQUIREMENTS.md`
