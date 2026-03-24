# S06 UAT — Honest production backend proof surface

**Milestone:** M028  
**Slice:** S06  
**Current-state rule:** S06 no longer treats crash recovery as a blocker. Public proof claims must now be validated against the same green recovery-aware command set used by `.gsd/milestones/M028/slices/S07/S07-UAT.md`, plus the docs-surface checks that S06 introduced.

## Preconditions
1. Run from repo root: `/Users/sn0w/Documents/dev/mesh-lang/.gsd/worktrees/M028`
2. `.env` contains a working `DATABASE_URL`
3. Postgres is reachable from this worktree
4. No other long-lived `reference-backend` process is bound to the test ports the harness selects
5. `npm`, `cargo`, and `bash` are installed
6. Use the repo-root `.env` for all ignored `e2e_reference_backend` commands:
   - `set -a && source .env && set +a`

## Test Case 1 — Public proof surfaces still agree

### Goal
Prove that the landing page, website proof page, package runbook, and verifier still point at one canonical production-backend proof path.

### Steps
1. Run:
   - `bash reference-backend/scripts/verify-production-proof-surface.sh`
2. Optionally inspect:
   - `README.md`
   - `website/docs/docs/production-backend-proof/index.md`
   - `reference-backend/README.md`

### Expected outcomes
1. The script exits `0`.
2. The verifier confirms the canonical files exist, link together correctly, and do not contain stale interim phrasing.
3. The proof page and runbook still cite the same recovery-aware command set instead of diverging summaries.

## Test Case 2 — Website docs build cleanly with the canonical proof page

### Goal
Prove that the promoted proof page and the generic doc cross-links remain valid website content, not dead documentation.

### Steps
1. Run:
   - `npm --prefix website ci`
   - `npm --prefix website run build`

### Expected outcomes
1. Both commands exit `0`.
2. The docs site builds with the production-backend proof page in navigation.
3. Generic guides continue to route readers back to `/docs/production-backend-proof/` rather than duplicating a second backend manual.

## Test Case 3 — Worker crash recovery is visible and exact-once

### Goal
Use the same authoritative recovery proof that S07 uses, because S06’s public claims are only honest if this technical contract is green.

### Steps
1. Run:
   - `cargo run -p meshc -- build reference-backend`
   - `cargo run -p meshc -- fmt --check reference-backend`
   - `cargo run -p meshc -- test reference-backend`
2. Run:
   - `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_crash_recovers_job -- --ignored --nocapture`

### Expected outcomes
1. All commands exit `0`.
2. The proof shows an observable degraded/recovering window before healthy settlement:
   - `/health.status == "degraded"`
   - `/health.worker.liveness == "recovering"`
   - `/health.worker.restart_count == 1`
   - `/health.worker.recovery_active == true`
3. The crashed job is requeued from `processing` back to `pending`, then processed exactly once after restart.
4. Final settlement shows:
   - `/jobs/:id.status == "processed"`
   - `/jobs/:id.attempts == 2`
   - final `/health.status == "ok"`
   - final `/health.worker.recovery_active == false`

## Test Case 4 — Restart metadata stays coherent in `/health`

### Goal
Prove that the public proof surface is backed by stable restart metadata, not just a passing eventual-success story.

### Steps
1. Run:
   - `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_worker_restart_is_visible_in_health -- --ignored --nocapture`

### Expected outcomes
1. The test exits `0`.
2. The proof observes an initial healthy worker, then a degraded/recovering worker, then healthy settlement again.
3. Across the restart boundary:
   - `boot_id` is non-empty before and after restart
   - `started_at` is non-empty before and after restart
   - restarted `boot_id` differs from the initial `boot_id`
   - restarted `started_at` differs from the initial `started_at`
4. Recovery metadata remains coherent after settlement:
   - `restart_count == 1`
   - `last_exit_reason == "worker_crash_after_claim"`
   - `recovered_jobs == 1`
   - `last_recovery_at` is non-null / non-empty
   - `last_recovery_job_id` matches the crashed job id
   - `last_recovery_count == 1`

## Test Case 5 — Whole-process restart recovers an in-flight job

### Goal
Prove that killing the entire backend process during an in-flight claimed job still leads to exact-once completion after restart.

### Steps
1. Run:
   - `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_process_restart_recovers_inflight_job -- --ignored --nocapture`

### Expected outcomes
1. The test exits `0`.
2. The harness creates a job with the deterministic in-flight seam (`hold_after_claim_once`) and confirms the job is in `processing` before kill.
3. The harness kills the backend process, restarts it, and then observes boot recovery.
4. The durable row transitions through the intended process-restart contract:
   - before kill: `processing`, `attempts == 1`
   - after boot recovery: `pending`, still `attempts == 1`
   - final settlement: `processed`, `attempts == 2`
5. Final health is healthy, not stale or degraded.
6. No second duplicate job row is created; the original job id is the one that finishes.

## Test Case 6 — Migration and staged deploy truth still match the recovery contract

### Goal
Prove that the production-proof page is still backed by the real migration and staged deploy paths, not by docs-only claims.

### Steps
1. Run:
   - `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_migration_status_and_apply -- --ignored --nocapture`
2. Run:
   - `set -a && source .env && set +a && cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture`

### Expected outcomes
1. Both tests exit `0`.
2. Mesh migration status/apply still works against the canonical migration source.
3. The staged deploy artifact still boots and processes jobs successfully.
4. Both paths expose the recovery-aligned schema, including the processing-reclaim index used for stale-cutoff recovery.
5. `_mesh_migrations` remains coherent after apply; staged deploy smoke still reaches healthy `/health` and successful job processing.

## Edge Cases to watch while running the script

### Edge Case A — Docs stay green while runtime proof regresses
If the verifier script and website build pass but any ignored backend proof fails, treat that as a real proof regression, not a docs-only success.

### Edge Case B — Recovery happens too fast to observe
If worker-crash proof skips straight to healthy, that is a failure. The promoted proof surface requires a real degraded/recovering window.

### Edge Case C — Shared test database interference
Run the ignored DB-backed proofs serially on one `DATABASE_URL`. Parallel runs are invalid evidence.

### Edge Case D — Proof-surface drift
If the public verifier passes but the UAT/doc command list diverges from `.gsd/milestones/M028/slices/S07/S07-UAT.md`, reconcile the wording before treating the slice as stable.

## Acceptance checklist
- [ ] proof-surface verifier passes
- [ ] website install/build pass
- [ ] `meshc build` passes for `reference-backend`
- [ ] `meshc fmt --check` passes for `reference-backend`
- [ ] `meshc test` passes for `reference-backend`
- [ ] worker-crash recovery proof passes
- [ ] restart-visibility proof passes
- [ ] whole-process restart proof passes
- [ ] migration status/apply proof passes
- [ ] staged deploy artifact smoke passes
- [ ] degraded/recovering health is observed before final healthy settlement

## Failure signals
- verifier reports missing proof links or stale wording
- website build fails on the proof page or generic doc cross-links
- `restart_count` never increments
- degraded/recovering health is never observed
- job remains stuck in `processing`
- final job attempts are not `2`
- migration apply or staged deploy smoke no longer matches the recovery-aware schema
