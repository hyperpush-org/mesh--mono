---
id: T03
parent: S02
milestone: M033
key_files:
  - compiler/meshc/tests/e2e_m033_s02.rs
  - scripts/verify-m033-s02.sh
key_decisions:
  - Scoped the direct Postgres proofs to temporary Mesh projects that copy Mesher storage/types modules so the harness can exercise real storage helpers without the S01 HTTP readiness path.
  - Kept the verifier keep-list aligned to the actual S02 boundary by allowing only the shared 24-hour `Query.where_raw(...)` clauses in the owned search/tag helpers while treating `extract_event_fields` as the intentional raw S03 keep-site.
duration: ""
verification_result: mixed
completed_at: 2026-03-25T17:24:54.761Z
blocker_discovered: false
---

# T03: Draft the S02 Postgres proof bundle and verifier script scaffolding

**Draft the S02 Postgres proof bundle and verifier script scaffolding**

## What Happened

Implemented the requested closeout artifacts for S02 by adding a new integration test target at `compiler/meshc/tests/e2e_m033_s02.rs` and a verifier script at `scripts/verify-m033-s02.sh`. The Rust harness reuses the Docker/Postgres pattern from S01, migrates a live temporary Postgres, creates today’s `events` partition, and stages temporary Mesh projects that copy the real Mesher `storage/` and `types/` modules so the proofs can call the actual storage helpers directly instead of going through the brittle S01 HTTP harness. The drafted proofs cover the intended families: pgcrypto auth, full-text search ranking/binding, JSONB tag filtering/breakdown, alert rule create/fire behavior, and event ingest/defaulting with direct row assertions against `users`, `events`, `alert_rules`, `alerts`, and `issues`. The verifier script mirrors the slice contract by running the new test target plus `meshc` fmt/build checks and a Python raw-boundary sweep that keeps the owned S02 helpers off `Repo.query_raw(...)`, `Repo.execute_raw(...)`, and `Query.select_raw(...)`, while allowing only the existing 24-hour neutral `Query.where_raw(...)` clauses and requiring `extract_event_fields` to stay called out as the explicit S03 raw keep-site. After writing both artifacts, I did a syntax pass on the shell script and then ran the new Rust test target twice. The first run failed immediately on a Rust borrow issue in `cleanup_stale_mesher_postgres_containers`, which I fixed by binding `String::from_utf8_lossy(&output.stdout)` before collecting line slices. The second run compiled and executed far enough to prove one test (`e2e_m033_s02_event_ingest_defaulting`) green, but the suite is still red overall: the search and JSONB probe source templates were over-escaped and failed Mesh parsing, the auth probe did not type-check as written, and the alert probe ran without producing the expected `alert_id` marker. Because the unit hit the enforced wrap-up budget, I stopped there instead of starting another debug cycle and am leaving precise resume notes in this summary.

## Verification

Verified the new verifier script’s shell syntax with `bash -n scripts/verify-m033-s02.sh`. Ran `cargo test -p meshc --test e2e_m033_s02 -- --nocapture` twice against the new harness. The first run failed at compile time with a Rust borrow checker error in the Docker cleanup helper, which was fixed locally. The second run compiled the harness, started live Postgres-backed proofs, and confirmed `e2e_m033_s02_event_ingest_defaulting` passing on the real storage path, but the overall target still failed because the search/JSONB probe templates contain over-escaped interpolation strings, the auth probe’s success-print path does not type-check yet, and the alert probe did not emit the expected `alert_id` marker. The full slice verifier `bash scripts/verify-m033-s02.sh` was not rerun after those failures because the direct test target remains red.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `bash -n scripts/verify-m033-s02.sh` | 0 | ✅ pass | 100ms |
| 2 | `cargo test -p meshc --test e2e_m033_s02 -- --nocapture` | 101 | ❌ fail | 6000ms |
| 3 | `cargo test -p meshc --test e2e_m033_s02 -- --nocapture` | 101 | ❌ fail | 166000ms |


## Deviations

Stopped in wrap-up mode due context/time budget before fixing the first red test pass. The implementation produced the new proof bundle and verifier script artifacts, but the task did not reach a passing verification state in this unit.

## Known Issues

`cargo test -p meshc --test e2e_m033_s02 -- --nocapture` is still failing. The current failures are local and non-blocking but unfinished: (1) the search and JSONB probe templates over-escaped inner quotes inside Mesh string interpolation (`Map.get(..., \"message\")` / `\"tag_value\"`), so those temporary probe projects fail to parse; (2) the auth probe’s `auth_ok` print path is not compiling as written and needs its field access pattern adjusted to match what the copied Mesher typechecker accepts in that probe context; (3) the alert helper proof built far enough to run but did not emit `alert_id`, so that probe needs a direct look at its stdout markers before the DB assertions can be trusted. `scripts/verify-m033-s02.sh` has only had `bash -n` syntax verification so far; the full verifier command was not rerun because the direct test target is still red.

## Files Created/Modified

- `compiler/meshc/tests/e2e_m033_s02.rs`
- `scripts/verify-m033-s02.sh`
