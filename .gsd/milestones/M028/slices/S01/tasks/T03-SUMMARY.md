---
id: T03
parent: S01
milestone: M028
provides:
  - reference-backend job type, storage, API wiring, and migration scaffolding ready for use once the runtime DB-query crash is fixed
key_files:
  - reference-backend/migrations/20260323010000_create_jobs.mpl
  - reference-backend/types/job.mpl
  - reference-backend/storage/jobs.mpl
  - reference-backend/api/jobs.mpl
  - reference-backend/runtime/registry.mpl
  - reference-backend/api/router.mpl
  - reference-backend/main.mpl
  - compiler/meshc/tests/e2e_reference_backend.rs
  - .gsd/KNOWLEDGE.md
  - .gsd/DECISIONS.md
key_decisions:
  - Use a package-local `RuntimeRegistry` service so `reference-backend` job handlers can resolve the shared pool without importing Mesher’s pipeline registry or inlining connection strings.
  - Keep job responses manually serialized so `payload` stays embedded as raw JSON and nullable fields (`last_error`, `processed_at`) stay inspectable.
patterns_established:
  - The narrow reference backend can use its own named registry service for package-local dependency lookup instead of inheriting broader app wiring from `mesher`.
observability_surfaces:
  - `cargo run -p meshc -- migrate reference-backend status`
  - `cargo test -p meshc e2e_reference_backend_runtime_starts --test e2e_reference_backend -- --ignored --nocapture`
  - startup and `/jobs` log lines from `reference-backend`
  - `.gsd/KNOWLEDGE.md`
duration: over-budget with blocker investigation
verification_result: partial
completed_at: 2026-03-23
blocker_discovered: true
---

# T03: Add migration-managed jobs persistence and DB-backed API endpoints

**Added the reference-backend job modules and isolated a runtime DB-query crash that blocks migrations and `/jobs`.**

## What Happened

I implemented the task’s package-local code path for durable jobs: the worktree now has a real `jobs` migration file, a shared `Job` row type, storage helpers for create/read, `POST /jobs` and `GET /jobs/:id` handlers, router wiring, and a tiny `RuntimeRegistry` so the handlers can resolve the already-open Postgres pool without reintroducing inline connection strings.

I also extended `compiler/meshc/tests/e2e_reference_backend.rs` so the ignored Postgres smoke target is no longer just a startup alias: it now attempts a real job create/read round trip after running `meshc migrate` for `reference-backend`.

The implementation itself compiles cleanly, and the non-DB startup regression from T02 still passes. The blocker surfaced when I moved into the required DB-backed verification. First, I had to adapt the migration command order to the actual CLI contract (`meshc migrate [DIR] [COMMAND]`, so `meshc migrate reference-backend status`, not `migrate status reference-backend`). With the right invocation, `status` sees the migration file correctly.

The real blocker is deeper than CLI shape: in this runtime, the first actual DB query/execute path in a compiled Mesh binary aborts the process. I reproduced that three ways before stopping:

1. `meshc migrate reference-backend up` reaches the synthetic migration binary compile step and then never completes cleanly.
2. Fresh scratch repro binaries inside the worktree show `Pool.open(...)` succeeds, but `Pool.execute`, `Repo.execute_raw`, and `Repo.query_raw` all abort on first use.
3. After creating the `jobs` table manually with `psql`, hitting the shipped `POST /jobs` endpoint causes the real `reference-backend` process to abort with a runtime panic and the client gets `Empty reply from server`.

Because S01’s remaining contract depends on migration-managed persistence and DB-backed background work, this is not a normal task-local bug. It invalidates the remaining slice plan until the runtime DB-query path is repaired, so I set `blocker_discovered: true`.

## Verification

I reran the current slice/task checks that are still meaningful after the blocker surfaced. Build-only proof, missing-env proof, non-empty-`DATABASE_URL` startup proof, and migration discovery all pass. Migration application and the new DB-backed smoke target fail because the runtime aborts on first DB query/execute.

I also manually created the `jobs` table with `psql` and hit the real `/jobs` endpoint to confirm the failure is not specific to the migration runner. The process aborted on first handler-side DB access, which matches the isolated scratch repros.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo build -p mesh-rt && cargo test -p meshc e2e_reference_backend_builds --test e2e_reference_backend -- --nocapture` | 0 | ✅ pass | 5.64s |
| 2 | `env -u DATABASE_URL PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend 2>&1 | rg "DATABASE_URL"` | 0 | ✅ pass | n/a |
| 3 | `set -a && source .env && set +a && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc e2e_reference_backend_runtime_starts --test e2e_reference_backend -- --ignored --nocapture` | 0 | ✅ pass | 6.96s |
| 4 | `set -a && source .env && set +a && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend status` | 0 | ✅ pass | 3.41s |
| 5 | `set -a && source .env && set +a && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend up` | 124 | ❌ fail | 240s timeout |
| 6 | `set -a && source .env && set +a && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc e2e_reference_backend_postgres_smoke --test e2e_reference_backend -- --ignored --nocapture` | 124 | ❌ fail | 240s timeout |
| 7 | `PGPASSWORD=mesh_reference_backend_local psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pgcrypto" -c "CREATE TABLE IF NOT EXISTS jobs (...)"` | 0 | ✅ pass | n/a |
| 8 | `curl -sS -i -X POST http://127.0.0.1:18080/jobs -H 'Content-Type: application/json' -d '{"kind":"demo","attempt":1}'` | 52 | ❌ fail | n/a |
| 9 | `set -a && source .env && set +a && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} PORT=18080 JOB_POLL_MS=500 bash reference-backend/scripts/smoke.sh` | 127 | ❌ fail | n/a |

## Diagnostics

- Migration discovery surface: `cargo run -p meshc -- migrate reference-backend status`
- Runtime-start regression surface: `cargo test -p meshc e2e_reference_backend_runtime_starts --test e2e_reference_backend -- --ignored --nocapture`
- Manual API crash proof: start `reference-backend`, then `curl -X POST http://127.0.0.1:18080/jobs ...`; the server aborts on first handler-side DB use.
- Minimal runtime repros created during investigation showed:
  - `Pool.open(...)` succeeds
  - `Pool.execute("SELECT 1", [])` aborts
  - `Repo.execute_raw("SELECT 1", [])` aborts
  - `Repo.query_raw("SELECT 1 AS one", [])` aborts with a `parking_lot`/condvar panic path before process abort
- The real server-side abort seen after `POST /jobs` was:
  - `unsafe precondition(s) violated: hint::assert_unchecked must never be called when the condition is false`
  - followed by `thread caused non-unwinding panic. aborting.`

## Deviations

- The task plan and slice plan list migration commands as `meshc migrate status reference-backend` / `meshc migrate up reference-backend`, but the actual CLI in this worktree parses as `meshc migrate [DIR] [COMMAND]`, so verification had to use `meshc migrate reference-backend status` and `meshc migrate reference-backend up`.
- I added `reference-backend/runtime/registry.mpl` even though it was not called out in the expected-output file list, because the handlers needed a package-local way to resolve the shared pool without depending on Mesher’s broader pipeline registry.
- I did not make `POST /jobs` or `GET /jobs/:id` pass end to end, because the runtime DB-query crash makes that impossible in the current slice contract.

## Known Issues

- Any first DB query/execute path in a compiled Mesh binary currently aborts the process in this worktree/runtime, which blocks `meshc migrate up`, the `reference-backend` job storage helpers, and therefore the rest of S01’s persistence/worker proof path.
- `meshc migrate up` does not surface the crash cleanly yet; from the CLI it appears as a hang after compiling the synthetic migration binary.
- `reference-backend/scripts/smoke.sh` is still absent because it belongs to T04.

## Files Created/Modified

- `reference-backend/migrations/20260323010000_create_jobs.mpl` — added the canonical `jobs` schema and pending-scan index for the reference backend.
- `reference-backend/types/job.mpl` — added the shared `Job` row shape and lifecycle enum for storage/API coordination.
- `reference-backend/storage/jobs.mpl` — added package-local create/read helpers that shape durable job rows.
- `reference-backend/api/jobs.mpl` — added `POST /jobs` and `GET /jobs/:id` handlers plus response/log formatting.
- `reference-backend/runtime/registry.mpl` — added the package-local pool registry used by job handlers.
- `reference-backend/api/router.mpl` — exposed the new job routes.
- `reference-backend/main.mpl` — registered the shared pool in the runtime registry during startup.
- `compiler/meshc/tests/e2e_reference_backend.rs` — extended the ignored Postgres smoke target toward a real job create/read round trip and updated migration invocation to the real CLI contract.
- `.gsd/KNOWLEDGE.md` — recorded the actual `meshc migrate` CLI order and the runtime DB-query crash pattern.
- `.gsd/DECISIONS.md` — recorded the package-local runtime registry decision for `reference-backend`.
