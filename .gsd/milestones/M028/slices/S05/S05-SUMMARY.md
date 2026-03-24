---
id: S05
parent: M028
milestone: M028
provides:
  - Supervision and recovery groundwork now validated through the canonical S07 reference-backend proof path.
requires: []
affects:
  - R004
  - R008
  - R009
key_files:
  - compiler/mesh-codegen/src/codegen/expr.rs
  - compiler/meshc/tests/e2e_supervisors.rs
  - compiler/meshc/tests/e2e_reference_backend.rs
  - reference-backend/jobs/worker.mpl
  - reference-backend/storage/jobs.mpl
  - reference-backend/api/health.mpl
  - reference-backend/README.md
key_decisions:
  - Treat the S07 recovery-proof command set as the authoritative closure surface for S05 rather than preserving the slice's intermediate debugging checkpoints as acceptance criteria.
patterns_established:
  - Keep technical crash/restart proof in `compiler/meshc/tests/e2e_reference_backend.rs` and point later docs/UAT surfaces back to that same harness.
  - Judge recovery truth from `/health`, `GET /jobs/:id`, and durable `jobs` rows together; logs alone are not sufficient proof.
observability_surfaces:
  - compiler/meshc/tests/e2e_supervisors.rs
  - compiler/meshc/tests/e2e_reference_backend.rs
  - GET /health
  - GET /jobs/:id
  - reference-backend/README.md
  - .gsd/milestones/M028/slices/S07/S07-UAT.md
duration: see task summaries
verification_result: passed
completed_at: 2026-03-24T00:21:17.840Z
---

# Slice Summary — S05: Supervision and recovery groundwork

## Status
- **State:** done
- **Roadmap checkbox:** checked
- **Why:** S05 established the supervisor, recovery, and health-signal groundwork that S07 later proved green end to end on `reference-backend/`. The slice should now be read as technical foundation plus proof-ready seams, not as a still-open blocker.

## What this slice actually delivered

### 1. Repaired the Mesh supervisor path enough for real backend recovery proof work
S05 stopped treating source-level supervisors as banner-string smoke tests. The slice repaired the compiler/runtime child-spec bridge, strengthened the supervisor-focused test surface, and made it possible to reason about actual child start/restart behavior instead of wrapper-actor false positives.

That work matters because every later recovery claim in M028 depends on a trustworthy supervisor/restart model instead of a detached happy-path worker loop.

### 2. Moved `reference-backend/` onto a real recovery-oriented worker model
S05 introduced the backend seams that the later green proof relies on:
- supervised or supervision-aware worker startup instead of a purely detached loop,
- durable abandoned-job reclaim for crash-after-claim scenarios,
- worker-state bookkeeping that can report restart/recovery truth through `/health`, and
- the canonical Rust proof harness in `compiler/meshc/tests/e2e_reference_backend.rs`.

The important current-state reading is not that every intermediate S05 task landed perfectly on its first attempt; it is that the slice produced the technical recovery surface that S07 later closed and validated.

### 3. Defined the recovery observability contract that later slices now inherit
The slice established the recovery vocabulary that future agents should keep using:
- `restart_count`
- `last_exit_reason`
- `recovered_jobs`
- `last_recovery_at`
- `last_recovery_job_id`
- `last_recovery_count`
- `recovery_active`

Those signals are now part of the authoritative proof story, and later public/internal artifacts should reuse them rather than inventing alternate summaries of worker health.

### 4. Current acceptance for S05 is the green S07 proof path
S05 no longer has a separate historical acceptance story. The slice’s technical contract is now accepted by rerunning the same canonical recovery-aware commands captured in `.gsd/milestones/M028/slices/S07/S07-UAT.md`:
- `cargo run -p meshc -- build reference-backend`
- `cargo run -p meshc -- fmt --check reference-backend`
- `cargo run -p meshc -- test reference-backend`
- `e2e_reference_backend_worker_crash_recovers_job`
- `e2e_reference_backend_worker_restart_is_visible_in_health`
- `e2e_reference_backend_process_restart_recovers_inflight_job`
- `e2e_reference_backend_migration_status_and_apply`
- `e2e_reference_backend_deploy_artifact_smoke`

Use those commands when validating S05-related recovery claims. Do not resurrect the slice’s earlier compile/debug checkpoints as the acceptance bar.

## Requirement impact
- **R004:** validated through the S07 recovery proof harness built on top of S05’s supervision/recovery groundwork.
- **R009:** validated on the real `reference-backend/` path rather than on subsystem-only evidence.
- **R008:** supported by S05’s technical proof surface, then promoted and reconciled in S06/S08.

## Patterns established
- Keep recovery proof in `compiler/meshc/tests/e2e_reference_backend.rs`; do not create competing ad hoc scripts for the same contract.
- If recovery truth is in doubt, rerun the named ignored proofs and compare `/health`, `GET /jobs/:id`, and durable DB state together.
- Treat S05 as the slice that created the recovery seams and observability contract; treat S07 as the slice that made that contract green and authoritative.

## Files that matter downstream
- `compiler/mesh-codegen/src/codegen/expr.rs`
- `compiler/meshc/tests/e2e_supervisors.rs`
- `compiler/meshc/tests/e2e_reference_backend.rs`
- `reference-backend/jobs/worker.mpl`
- `reference-backend/storage/jobs.mpl`
- `reference-backend/api/health.mpl`
- `reference-backend/README.md`
- `.gsd/milestones/M028/slices/S07/S07-UAT.md`

## What the next slice / reassess-roadmap agent should know
Do not treat S05 as still waiting on a missing restored summary or an unresolved red recovery verdict. The technical recovery story is already closed by the green S07 proof set.

The right current interpretation is:
- S05 created the supervision, reclaim, and health-signal foundations,
- S07 turned those foundations into passing reference-backend recovery proof, and
- later reconciliation work should point back to that single green command set instead of retelling the old debugging path.
