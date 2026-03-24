# Slice Summary — S06: Honest production proof surface

## Status
- **State:** done
- **Roadmap checkbox:** checked
- **Why:** S06’s production-proof and documentation goals are now truthful. The earlier runtime blocker was closed by S07, and the promoted proof surfaces now point at the same green recovery-aware `reference-backend/` command set.

## What this slice actually delivered

### 1. One canonical production-backend proof path
S06 established the public proof-entry hierarchy that evaluators and future agents should still follow:
- `README.md` routes readers toward the real backend proof path instead of leaving readiness implied by toy examples.
- `website/docs/docs/production-backend-proof/index.md` is the canonical public proof page.
- `reference-backend/README.md` is the deeper package-level runbook.
- `reference-backend/scripts/verify-production-proof-surface.sh` is the mechanical guard that catches doc-truth drift.

That remains the right shape. What changed after the earlier partial summary is that the runtime proof behind this surface is now green, so the documentation no longer over-promises.

### 2. Generic docs now route to proof instead of competing with it
The generic guides are intentionally lightweight and should stay that way:
- `website/docs/docs/getting-started/index.md`
- `website/docs/docs/web/index.md`
- `website/docs/docs/databases/index.md`
- `website/docs/docs/concurrency/index.md`
- `website/docs/docs/tooling/index.md`
- `website/docs/docs/testing/index.md`

Their job is to route readers back to `/docs/production-backend-proof/` and `reference-backend/README.md`, not to maintain a second backend acceptance script.

### 3. The proof page is now backed by the green S07 recovery contract
The earlier blocker state is obsolete. The authoritative recovery-aware proof set is now the green command sequence also captured in `.gsd/milestones/M028/slices/S07/S07-UAT.md`:
- `cargo run -p meshc -- build reference-backend`
- `cargo run -p meshc -- fmt --check reference-backend`
- `cargo run -p meshc -- test reference-backend`
- `e2e_reference_backend_worker_crash_recovers_job`
- `e2e_reference_backend_worker_restart_is_visible_in_health`
- `e2e_reference_backend_process_restart_recovers_inflight_job`
- `e2e_reference_backend_migration_status_and_apply`
- `e2e_reference_backend_deploy_artifact_smoke`

That means S06 should now be read as the slice that built the truthful proof surface, with S07 closing the technical recovery bar and S08 reconciling all stale residual artifacts onto the same command list.

### 4. Current proof-surface verification is mechanical, not interpretive
A future agent does not need to guess whether S06 drifted:
- rerun `bash reference-backend/scripts/verify-production-proof-surface.sh` for public/doc drift,
- rerun `npm --prefix website ci` and `npm --prefix website run build` for docs-site health,
- rerun the S07 recovery-aware backend proof commands for runtime truth.

That split is the main long-term value of S06: failures are classifiable as docs drift, docs-build breakage, or real backend proof regression.

## Requirement impact
- **R008:** S06 created the canonical promoted proof path; S08 finishes the final milestone-wide truth-surface reconciliation.
- **R009:** S06 now truthfully promotes the real `reference-backend/` target rather than subsystem-only or toy-first evidence.
- **R004:** the old S06 blocker language is obsolete because crash/restart recovery is now green in the canonical S07 harness.

## Patterns established
- Keep one public truth hierarchy: landing page -> website proof page -> `reference-backend/README.md` -> Rust proof harness.
- Do not duplicate long backend command blocks across generic docs; route readers back to the canonical proof page.
- When public proof wording drifts, rerun `bash reference-backend/scripts/verify-production-proof-surface.sh` before editing unrelated docs.
- When technical recovery truth is in doubt, rerun the S07 command set rather than reconstructing an older S06-era blocker story.

## Files that matter downstream
- `README.md`
- `website/docs/docs/production-backend-proof/index.md`
- `website/docs/.vitepress/config.mts`
- `website/docs/docs/getting-started/index.md`
- `website/docs/docs/web/index.md`
- `website/docs/docs/databases/index.md`
- `website/docs/docs/concurrency/index.md`
- `website/docs/docs/tooling/index.md`
- `website/docs/docs/testing/index.md`
- `reference-backend/README.md`
- `reference-backend/scripts/verify-production-proof-surface.sh`
- `.gsd/milestones/M028/slices/S07/S07-UAT.md`

## What the next slice / reassess-roadmap agent should know
Do not treat S06 as still blocked on worker recovery. That was true during intermediate execution, but it is no longer the repository’s current state.

The right current interpretation is:
- S06 created the canonical proof-surface hierarchy and verifier,
- S07 made the recovery-aware backend command set green,
- S08’s remaining work is truth-surface reconciliation so every promoted internal/public artifact cites that same green command set.
