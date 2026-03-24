---
estimated_steps: 3
estimated_files: 5
skills_used:
  - debug-like-expert
  - review
  - test
---

# T02: Rewrite stale S05 and S06 closure artifacts

**Slice:** S08 — Final Proof Surface Reconciliation
**Milestone:** M028

## Description

The repo still contains placeholder and pre-S07 closure artifacts that claim recovery proof is partial or missing. This task replaces that contradictory evidence with honest current-state summaries and UAT scripts. The new text must inherit the same green S07 command set instead of inventing a second acceptance story.

## Steps

1. Rewrite `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md` and `.gsd/milestones/M028/slices/S05/S05-UAT.md` so they either describe S05’s real delivered recovery groundwork plus S07 closure, or explicitly say S05 is superseded by S07 for final recovery proof — but without placeholder text.
2. Rewrite `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md` and `.gsd/milestones/M028/slices/S06/S06-UAT.md` from the current pre-S07 blocker state to the now-green production-proof state, reusing the command ordering and recovery language from `.gsd/milestones/M028/slices/S07/S07-UAT.md`.
3. Run the negative stale-claim sweep and command-reference checks until the old placeholder/current-blocker language is gone and both UAT files reference the same authoritative S07 proof commands.

## Must-Haves

- [ ] No S05 or S06 closure artifact still contains placeholder text or a `partial / not done` recovery verdict.
- [ ] S05 and S06 summaries describe current truth instead of historical blocker state.
- [ ] S05 and S06 UAT files reuse the authoritative S07 proof commands rather than inventing a competing recovery script.
- [ ] The rewritten closure artifacts still preserve useful forward-intelligence and acceptance guidance for future agents.

## Verification

- `! rg -n "placeholder|partial / not done|current blocker|replace this placeholder|needs-remediation" .gsd/milestones/M028/slices/S05/S05-SUMMARY.md .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-SUMMARY.md .gsd/milestones/M028/slices/S06/S06-UAT.md`
- `rg -n "e2e_reference_backend_worker_crash_recovers_job|e2e_reference_backend_worker_restart_is_visible_in_health|e2e_reference_backend_process_restart_recovers_inflight_job|e2e_reference_backend_migration_status_and_apply|e2e_reference_backend_deploy_artifact_smoke" .gsd/milestones/M028/slices/S05/S05-UAT.md .gsd/milestones/M028/slices/S06/S06-UAT.md`
- `test -s .gsd/milestones/M028/slices/S05/S05-SUMMARY.md && test -s .gsd/milestones/M028/slices/S05/S05-UAT.md && test -s .gsd/milestones/M028/slices/S06/S06-SUMMARY.md && test -s .gsd/milestones/M028/slices/S06/S06-UAT.md`

## Inputs

- `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md` — current doctor-created placeholder summary
- `.gsd/milestones/M028/slices/S05/S05-UAT.md` — current placeholder UAT file
- `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md` — current pre-S07 partial closure summary
- `.gsd/milestones/M028/slices/S06/S06-UAT.md` — current pre-S07 acceptance script
- `.gsd/milestones/M028/slices/S07/S07-UAT.md` — authoritative green recovery-aware command set to mirror

## Expected Output

- `.gsd/milestones/M028/slices/S05/S05-SUMMARY.md` — honest S05 closure artifact aligned to S07 final proof
- `.gsd/milestones/M028/slices/S05/S05-UAT.md` — real S05 current-state UAT without placeholder language
- `.gsd/milestones/M028/slices/S06/S06-SUMMARY.md` — updated S06 closure artifact describing the now-green proof surface
- `.gsd/milestones/M028/slices/S06/S06-UAT.md` — updated S06 acceptance script aligned to the green S07 proof set

## Observability Impact

- Signals changed: the internal closure artifacts for S05 and S06 stop reporting stale blocker/placeholder states and instead point future agents at the same authoritative S07 recovery proof commands and `/health` recovery fields (`restart_count`, `last_exit_reason`, `recovered_jobs`, `last_recovery_at`, `recovery_active`).
- How to inspect: rerun `rg -n` against the rewritten S05/S06 summary and UAT files to confirm stale language is gone, then compare their command lists against `.gsd/milestones/M028/slices/S07/S07-UAT.md` and the public verifier-backed surfaces.
- Failure visibility: if one of these rewritten artifacts drifts again, the failure should be visibly classifiable as internal-closure drift rather than a runtime regression because the same S07 command names will still be available for rerun.
