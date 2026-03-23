---
id: T01
parent: S04
milestone: M028
provides:
  - staged native deploy artifacts for reference-backend plus a boring psql-based migration/apply/probe path
key_files:
  - reference-backend/deploy/reference-backend.up.sql
  - reference-backend/scripts/stage-deploy.sh
  - reference-backend/scripts/apply-deploy-migrations.sh
  - reference-backend/scripts/deploy-smoke.sh
  - reference-backend/scripts/smoke.sh
  - compiler/meshc/tests/e2e_reference_backend.rs
  - .gsd/milestones/M028/slices/S04/S04-PLAN.md
  - .gsd/KNOWLEDGE.md
key_decisions:
  - kept the Mesh migration file canonical and shipped a separate checked-in deploy SQL artifact that preserves _mesh_migrations for runtime-side psql apply
patterns_established:
  - stage once into a temp-dir bundle, apply schema via staged SQL, and probe the running artifact with a probe-only smoke script instead of rebuilding on the runtime side
observability_surfaces:
  - reference-backend/scripts/stage-deploy.sh named bundle-phase output
  - reference-backend/scripts/apply-deploy-migrations.sh named apply-phase output and missing-artifact diagnostics
  - reference-backend/scripts/deploy-smoke.sh named health/create/poll phases
  - compiler/meshc/tests/e2e_reference_backend.rs staged bundle regression
  - .gsd/KNOWLEDGE.md
duration: 1h 30m
verification_result: passed
completed_at: 2026-03-23T16:54:42-0400
blocker_discovered: false
---

# T01: Stage a deploy bundle and boring migration path

**Added staged native deploy artifacts and scripts for `reference-backend`, with verified `psql` apply and probe-only smoke paths.**

## What Happened

I added `reference-backend/deploy/reference-backend.up.sql` as the boring deploy-time SQL artifact derived from the canonical Mesh migration and made it idempotently create `jobs` plus `_mesh_migrations` version `20260323010000`.

I added `reference-backend/scripts/stage-deploy.sh` to build `reference-backend`, stage the binary plus deploy assets into a caller-provided directory, and print the staged layout with named bundle-phase output.

I added `reference-backend/scripts/apply-deploy-migrations.sh` to apply the checked-in SQL artifact through `psql`, verify that `_mesh_migrations` recorded the version, and fail with a specific missing-artifact diagnostic before any env-driven failure obscures the cause.

I added `reference-backend/scripts/deploy-smoke.sh` as the probe-only path for a running/staged instance and rewired `reference-backend/scripts/smoke.sh` to stay the local rebuild/start wrapper while delegating the HTTP/job verification to the new deploy-smoke contract.

I also extended `compiler/meshc/tests/e2e_reference_backend.rs` with a non-ignored `e2e_reference_backend_stage_deploy_bundle` regression and updated the ignored Postgres smoke assertions so they match the delegated deploy-smoke output.

As required by the pre-flight note, I updated `S04-PLAN.md` to include an inspectable failure-path verification for missing deploy SQL artifacts.

## Verification

I ran the new Rust staged-bundle regression, the exact task-plan stage/apply commands, a direct staged-artifact apply/start/probe shell flow, and the existing ignored Postgres smoke proof after updating it for the new delegated output.

I also ran the slice-level checks that are available at T01 time. The build and self-contained-binary checks pass. The later-slice README/docs check still fails because T03 has not updated the docs yet. The planned ignored Rust deploy-artifact test is not implemented yet, so the current filter command exits 0 while running 0 tests and should still be treated as pending until T02 adds the real proof.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_stage_deploy_bundle -- --nocapture` | 0 | ✅ pass | 122.46s |
| 2 | `tmp_dir="$(mktemp -d)" && bash reference-backend/scripts/stage-deploy.sh "$tmp_dir" && test -x "$tmp_dir/reference-backend" && test -f "$tmp_dir/reference-backend.up.sql" && test -x "$tmp_dir/deploy-smoke.sh"` | 0 | ✅ pass | 144.48s |
| 3 | `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash reference-backend/scripts/apply-deploy-migrations.sh reference-backend/deploy/reference-backend.up.sql && psql "$DATABASE_URL" -Atqc "select version::text from _mesh_migrations where version = 20260323010000" | rg "20260323010000"` | 0 | ✅ pass | 0.60s |
| 4 | `tmp_dir="$(mktemp -d)" && if bash reference-backend/scripts/apply-deploy-migrations.sh "$tmp_dir/missing-reference-backend.up.sql" >"$tmp_dir/apply-missing.log" 2>&1; then exit 1; else rg -n "\[deploy-apply\] missing deploy SQL artifact" "$tmp_dir/apply-missing.log"; fi` | 0 | ✅ pass | 0.15s |
| 5 | `cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_builds -- --nocapture` | 0 | ✅ pass | 18.75s |
| 6 | `cargo test -p meshc e2e_self_contained_binary -- --nocapture` | 0 | ✅ pass | 30.92s |
| 7 | `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_postgres_smoke -- --ignored --nocapture` | 0 | ✅ pass | 209.16s |
| 8 | `tmp_dir="$(mktemp -d)" && bash reference-backend/scripts/stage-deploy.sh "$tmp_dir" && bash "$tmp_dir/apply-deploy-migrations.sh" "$tmp_dir/reference-backend.up.sql" && PORT=18124 JOB_POLL_MS=200 "$tmp_dir/reference-backend" >"$tmp_dir/server.log" 2>&1 & ... && BASE_URL="http://127.0.0.1:18124" bash "$tmp_dir/deploy-smoke.sh"` | 0 | ✅ pass | 13.60s |
| 9 | `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture` | 0 | ❌ fail | 11.24s |
| 10 | `rg -n "Boring native deployment|stage-deploy\.sh|apply-deploy-migrations\.sh|deploy-smoke\.sh|runtime host" reference-backend/README.md && rg -n "^DATABASE_URL=|^PORT=|^JOB_POLL_MS=" reference-backend/.env.example` | 1 | ❌ fail | 0.10s |

## Diagnostics

Use `bash reference-backend/scripts/stage-deploy.sh <tmp-dir>` to inspect the staged layout and confirm the bundle contents quickly.

Use `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash reference-backend/scripts/apply-deploy-migrations.sh <sql-path>` to inspect the named apply phases and `_mesh_migrations` tracking outcome without invoking `meshc`.

Use `BASE_URL=http://127.0.0.1:<port> bash <bundle-dir>/deploy-smoke.sh` to inspect named health/create/poll phases against a running staged binary.

The updated `compiler/meshc/tests/e2e_reference_backend.rs` now contains the staged-bundle regression and the ignored Postgres smoke path remains a good sanity check for the delegated deploy-smoke contract.

## Deviations

I added a small Rust staged-bundle regression in `compiler/meshc/tests/e2e_reference_backend.rs` even though the task plan focused on scripts, because this is the first task in the slice and the task instructions required tests to land as part of the implementation.

## Known Issues

- `e2e_reference_backend_deploy_artifact_smoke` is still pending for T02. The current filter command exits 0 with 0 tests, so it is not valid deployment proof yet.
- `reference-backend/README.md` and the broader operator docs are intentionally still behind this implementation and remain for T03.

## Files Created/Modified

- `reference-backend/deploy/reference-backend.up.sql` — added the checked-in idempotent deploy SQL artifact with `_mesh_migrations` tracking.
- `reference-backend/scripts/stage-deploy.sh` — added bundle staging for the compiled binary plus deploy assets.
- `reference-backend/scripts/apply-deploy-migrations.sh` — added the boring `psql` apply helper with named diagnostics.
- `reference-backend/scripts/deploy-smoke.sh` — added the probe-only health/job smoke path for running or staged instances.
- `reference-backend/scripts/smoke.sh` — rewired the local rebuild smoke path to delegate probing to `deploy-smoke.sh`.
- `compiler/meshc/tests/e2e_reference_backend.rs` — added the staged-bundle regression and updated smoke assertions for delegated probe output.
- `.gsd/milestones/M028/slices/S04/S04-PLAN.md` — added the required failure-path verification command for missing deploy SQL artifacts.
- `.gsd/KNOWLEDGE.md` — captured the missing-artifact-before-env validation gotcha for deploy-path diagnostics.
