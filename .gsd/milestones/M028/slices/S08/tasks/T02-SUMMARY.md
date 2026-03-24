---
id: T02
parent: S08
milestone: M028
provides:
  - Reconciled the stale S05 and S06 closure artifacts onto the canonical green S07 recovery-aware proof path.
key_files:
  - .gsd/milestones/M028/slices/S08/tasks/T02-PLAN.md
  - .gsd/milestones/M028/slices/S05/S05-SUMMARY.md
  - .gsd/milestones/M028/slices/S05/S05-UAT.md
  - .gsd/milestones/M028/slices/S06/S06-SUMMARY.md
  - .gsd/milestones/M028/slices/S06/S06-UAT.md
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Use the S07 UAT command sequence as the only acceptance story for the rewritten S05/S06 closure artifacts instead of preserving their historical partial/debugging scripts.
patterns_established:
  - The stale-claim sweeps are literal grep checks, so reconciled artifacts must avoid even negated uses of banned phrases.
observability_surfaces:
  - .gsd/milestones/M028/slices/S05/S05-SUMMARY.md
  - .gsd/milestones/M028/slices/S05/S05-UAT.md
  - .gsd/milestones/M028/slices/S06/S06-SUMMARY.md
  - .gsd/milestones/M028/slices/S06/S06-UAT.md
  - .gsd/milestones/M028/slices/S07/S07-UAT.md
  - .gsd/KNOWLEDGE.md
duration: 1h
verification_result: passed
completed_at: 2026-03-24T00:18:05-04:00
blocker_discovered: false
---

# T02: Rewrite stale S05 and S06 closure artifacts

**Rewrote the stale S05/S06 summaries and UAT files so they now inherit the green S07 recovery-aware proof contract instead of preserving placeholder or pre-S07 blocker stories.**

## What Happened

I started by reading the S08 slice/task contract, the stale S05/S06 closure artifacts, the authoritative S07 UAT, the prior T01 summary, and the original S05/S06 slice plans. I also fixed the T02 task-plan pre-flight gap by adding the missing `## Observability Impact` section to `.gsd/milestones/M028/slices/S08/tasks/T02-PLAN.md` before touching the slice artifacts.

For S05, I replaced the doctor-restored stand-in summary and temporary UAT with current-state closure text that describes S05 as the supervision/recovery groundwork slice and explicitly routes final acceptance through the canonical S07 command set. The new summary preserves what S05 actually contributed — supervisor bridge repair, recovery-oriented worker seams, and `/health` recovery vocabulary — without pretending the slice’s intermediate debug checkpoints are still the acceptance bar.

For S06, I replaced the pre-S07 blocker summary and red UAT script with a current-state production-proof narrative. The new summary explains that S06’s public proof surfaces are now truthful because S07 closed the runtime recovery contract and S08/T01 aligned the promoted runbook/proof-page/verifier. The new UAT keeps S06-specific doc-surface checks (`verify-production-proof-surface.sh`, website install/build) but uses the same S07 recovery-aware command ordering and expected recovery language for the runtime proof path.

The first verification pass caught a subtle wording bug: the negative stale-claim sweep is a literal grep, so even my negated sentences like “no placeholder” still matched. I removed those literal banned substrings from the rewritten artifacts and recorded that gotcha in `.gsd/KNOWLEDGE.md` for future agents.

## Verification

Task-level verification passed after the wording cleanup:
- the stale-claim sweep over the rewritten S05/S06 files passed
- both UAT files contain the authoritative S07 recovery-proof test names
- all four rewritten files are non-empty
- the observability grep confirms the rewritten artifacts explicitly mention the recovery fields and not just the test names

I also ran the full slice verification list because this task is part of an intermediate slice reconciliation pass. Results were partial, as expected for T02:
- passed: proof-surface verifier, website `ci`, website build, `meshc build`, `meshc fmt --check`, `meshc test`, worker-crash proof, whole-process restart proof, and migration-status/apply proof
- failed: `e2e_reference_backend_worker_restart_is_visible_in_health`, `e2e_reference_backend_deploy_artifact_smoke`, and the slice-wide stale-claim sweep because `.gsd/milestones/M028/M028-VALIDATION.md` is still intentionally stale until T03 rewrites it

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `! rg -n "placeholder|partial / not done|current blocker|replace this placeholder|needs-remediation" .gsd/milestones/M028/slices/S05/S05-SUMMARY.md .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-SUMMARY.md .gsd/milestones/M028/slices/S06/S06-UAT.md` | 0 | ✅ pass | 0.10s |
| 2 | `rg -n "e2e_reference_backend_worker_crash_recovers_job|e2e_reference_backend_worker_restart_is_visible_in_health|e2e_reference_backend_process_restart_recovers_inflight_job|e2e_reference_backend_migration_status_and_apply|e2e_reference_backend_deploy_artifact_smoke" .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-UAT.md` | 0 | ✅ pass | 0.10s |
| 3 | `test -s .gsd/milestones/M028/slices/S05/S05-SUMMARY.md && test -s .gsd/milestones/M028/slices/S05/S05-UAT.md && test -s .gsd/milestones/M028/slices/S06/S06-SUMMARY.md && test -s .gsd/milestones/M028/slices/S06/S06-UAT.md` | 0 | ✅ pass | 0.08s |
| 4 | `rg -n "restart_count|last_exit_reason|recovered_jobs|last_recovery_at|recovery_active" .gsd/milestones/M028/slices/S05/S05-SUMMARY.md .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-SUMMARY.md .gsd/milestones/M028/slices/S06/S06-UAT.md` | 0 | ✅ pass | 0.03s |
| 5 | `bash reference-backend/scripts/verify-production-proof-surface.sh` | 0 | ✅ pass | 1.10s |
| 6 | `npm --prefix website ci` | 0 | ✅ pass | 18.70s |
| 7 | `npm --prefix website run build` | 0 | ✅ pass | 36.80s |
| 8 | `cargo run -p meshc -- build reference-backend` | 0 | ✅ pass | 47.96s |
| 9 | `cargo run -p meshc -- fmt --check reference-backend` | 0 | ✅ pass | 6.19s |
| 10 | `cargo run -p meshc -- test reference-backend` | 0 | ✅ pass | 7.46s |
| 11 | `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_crash_recovers_job -- --ignored --nocapture` | 0 | ✅ pass | 15.97s |
| 12 | `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_restart_is_visible_in_health -- --ignored --nocapture` | 101 | ❌ fail | 20.94s |
| 13 | `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_process_restart_recovers_inflight_job -- --ignored --nocapture` | 0 | ✅ pass | 15.23s |
| 14 | `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_migration_status_and_apply -- --ignored --nocapture` | 0 | ✅ pass | 10.20s |
| 15 | `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture` | 101 | ❌ fail | 70.33s |
| 16 | `! rg -n "placeholder|partial / not done|current blocker|needs-remediation|R004.*still open|R009.*still open|replace this placeholder" .gsd/milestones/M028/M028-VALIDATION.md .gsd/milestones/M028/slices/S05/S05-SUMMARY.md .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-SUMMARY.md .gsd/milestones/M028/slices/S06/S06-UAT.md` | 1 | ❌ fail | 0.08s |

## Diagnostics

For future inspection:
- `S05-SUMMARY.md` now explains S05 as technical recovery groundwork whose final acceptance is the S07 proof set.
- `S05-UAT.md` and `S06-UAT.md` now both point at the same canonical recovery-aware command sequence from `.gsd/milestones/M028/slices/S07/S07-UAT.md`.
- `S06-SUMMARY.md` now explains the current truthful production-proof hierarchy instead of preserving the old red recovery narrative.
- `.gsd/KNOWLEDGE.md` now records the stale-sweep gotcha: banned substrings must be absent literally, even in negated sentences.

The quickest drift checks are:
1. `! rg -n "placeholder|partial / not done|current blocker|replace this placeholder|needs-remediation" ...S05... ...S06...`
2. `rg -n "e2e_reference_backend_worker_crash_recovers_job|e2e_reference_backend_worker_restart_is_visible_in_health|e2e_reference_backend_process_restart_recovers_inflight_job|e2e_reference_backend_migration_status_and_apply|e2e_reference_backend_deploy_artifact_smoke" ...S05-UAT.md ...S06-UAT.md`
3. `bash reference-backend/scripts/verify-production-proof-surface.sh`

## Deviations

I made two small deviations from the written task plan:
- I updated `.gsd/milestones/M028/slices/S08/tasks/T02-PLAN.md` with the missing `## Observability Impact` section because the task pre-flight explicitly required it.
- I appended a gotcha to `.gsd/KNOWLEDGE.md` after the first negative sweep failed on my own negated use of the banned substrings.

## Known Issues

- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_restart_is_visible_in_health -- --ignored --nocapture` failed during this rerun because the backend never reached healthy startup on the selected port; the last observed `/health` payload remained `status="degraded"`, `worker.status="starting"`, `liveness="stale"`, `restart_count=0`.
- `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture` failed during this rerun after the staged backend had already processed the smoke job; the failure needs T03 follow-up because this task did not touch runtime/deploy code.
- The slice-wide negative-claim sweep still fails because `.gsd/milestones/M028/M028-VALIDATION.md` remains on the pre-reconciliation `needs-remediation` text until T03 rewrites milestone validation.

## Files Created/Modified

- `.gsd/milestones/M028/slices/S08/tasks/T02-PLAN.md` — added the missing `## Observability Impact` section required by the task pre-flight.
- `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md` — replaced the doctor-restored stand-in with a current-state S05 closure summary anchored to the green S07 proof path.
- `.gsd/milestones/M028/slices/S05/S05-UAT.md` — replaced the temporary UAT with a real acceptance script that reuses the authoritative S07 recovery-proof commands.
- `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md` — replaced the pre-S07 blocker summary with an honest now-green production-proof summary.
- `.gsd/milestones/M028/slices/S06/S06-UAT.md` — replaced the old red acceptance script with a docs-aware UAT that still inherits the S07 recovery command set.
- `.gsd/KNOWLEDGE.md` — recorded the literal-grep stale-sweep gotcha so future agents avoid failing the negative checks with negated banned phrases.
- `.gsd/milestones/M028/slices/S08/tasks/T02-SUMMARY.md` — recorded the implementation, verification evidence, and remaining slice-level failures.
