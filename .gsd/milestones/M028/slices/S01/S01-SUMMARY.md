---
id: S01
parent: M028
milestone: M028
provides:
  - top-level `reference-backend/` Mesh package with a stable env startup contract (`DATABASE_URL`, `PORT`, `JOB_POLL_MS`)
  - modular backend proof path spanning HTTP routing, Postgres migrations, durable job storage, and a timer-driven worker
  - compiler-facing proof target in `compiler/meshc/tests/e2e_reference_backend.rs`
  - package-local smoke workflow in `reference-backend/scripts/smoke.sh`
  - package-local operator docs in `reference-backend/README.md` and `reference-backend/.env.example`
requires: []
affects:
  - R001
  - R002
  - R013
key_files:
  - reference-backend/main.mpl
  - reference-backend/config.mpl
  - reference-backend/api/health.mpl
  - reference-backend/api/jobs.mpl
  - reference-backend/api/router.mpl
  - reference-backend/storage/jobs.mpl
  - reference-backend/jobs/worker.mpl
  - reference-backend/runtime/registry.mpl
  - reference-backend/migrations/20260323010000_create_jobs.mpl
  - reference-backend/scripts/smoke.sh
  - reference-backend/README.md
  - reference-backend/.env.example
  - compiler/meshc/tests/e2e_reference_backend.rs
  - compiler/mesh-rt/src/db/pool.rs
  - compiler/mesh-rt/src/db/pg.rs
key_decisions:
  - Keep the canonical proof target in a new top-level `reference-backend/` package instead of promoting `mesher/` into the milestone surface.
  - Keep startup env validation on the hot path local to `reference-backend/main.mpl` using `Env.get`/`Env.get_int` so the non-empty `DATABASE_URL` path stays stable and explicit.
  - Use a tiny package-local runtime registry to expose the shared Postgres pool to handlers instead of importing Mesher's broader runtime surface.
  - Treat the `jobs` table name as a concrete string locally because the generated schema helper collides with Mesh's own `Job` surface.
  - Fix the Mesh runtime/codegen contract by boxing opaque handles and parsed numeric payloads before compiled Mesh code unwraps them.
patterns_established:
  - Real backend proof should land as a narrow, auditable package with package-local docs, smoke automation, and compiler-facing e2e coverage.
  - Health output should expose worker state (`status`, `poll_ms`, timestamps, counts, last job id, last error) so stuck-vs-idle-vs-failed states are inspectable without attaching a debugger.
  - Durable state should be shared across migration schema, HTTP handlers, worker logic, and DB inspection using one small row shape (`status`, `attempts`, `last_error`, timestamps, payload).
  - Closure-proof commands must be executable as written; for this slice the authoritative forms are `meshc migrate reference-backend <cmd>` and `cargo test -p meshc --test e2e_reference_backend <name> -- ...`.
observability_surfaces:
  - `env -u DATABASE_URL PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend 2>&1 | rg "DATABASE_URL"`
  - `cargo run -p meshc -- build reference-backend`
  - `DATABASE_URL=... cargo run -p meshc -- migrate reference-backend status`
  - `DATABASE_URL=... cargo run -p meshc -- migrate reference-backend up`
  - `curl http://127.0.0.1:$PORT/health`
  - `curl -X POST http://127.0.0.1:$PORT/jobs` and `curl http://127.0.0.1:$PORT/jobs/:id`
  - `psql "$DATABASE_URL" -c "select ... from jobs ..."`
  - `bash reference-backend/scripts/smoke.sh`
  - `cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_runtime_starts -- --ignored --nocapture`
  - `cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_postgres_smoke -- --ignored --nocapture`
drill_down_paths:
  - .gsd/KNOWLEDGE.md
  - .gsd/DECISIONS.md
  - .gsd/milestones/M028/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M028/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M028/slices/S01/tasks/T03-SUMMARY.md
  - .gsd/milestones/M028/slices/S01/tasks/T04-SUMMARY.md
  - .gsd/milestones/M028/slices/S01/tasks/T05-SUMMARY.md
duration: slice closure verification + summary
verification_result: passed
completed_at: 2026-03-23
blocker_discovered: false
---
# S01: Canonical Backend Golden Path

## Outcome

S01 now gives M028 one concrete backend proof target instead of a pile of implied capability. `reference-backend/` is a small Mesh package that can be built from this repo, started from a simple env contract, migrated against Postgres, queried over HTTP, and observed while a background worker moves the same durable row from `pending` to `processed`.

This slice also forced one real Mesh-platform fix instead of a local app workaround: the runtime/codegen payload contract for opaque handles and parsed numeric values had to be corrected so compiled Mesh code could unwrap pool handles and parsed integers safely on the live Postgres path.

## What this slice actually delivered

### 1. A stable package boundary for the milestone proof path

The proof target now lives in `reference-backend/`, not in `mesher/`. That matters because later slices can now harden one narrow, auditable backend instead of inheriting unrelated product concerns.

Shipped package surfaces:

- `reference-backend/main.mpl` for startup and lifecycle wiring
- `reference-backend/config.mpl` for startup-contract constants and messages
- `reference-backend/api/*` for `/health` and `/jobs`
- `reference-backend/storage/jobs.mpl` for DB-backed job lifecycle mutations
- `reference-backend/jobs/worker.mpl` for the timer-recursive worker
- `reference-backend/runtime/registry.mpl` for package-local pool lookup
- `reference-backend/migrations/20260323010000_create_jobs.mpl` for the durable schema

### 2. A real startup contract with explicit good and bad paths

The canonical startup contract is now:

- `DATABASE_URL` — required non-empty Postgres connection string
- `PORT` — required positive integer HTTP port
- `JOB_POLL_MS` — required positive integer worker poll interval

The important behavioral result is not just that env vars exist; it is that both startup branches are now mechanically proven:

- missing/invalid config fails explicitly with readable errors
- a real non-empty `DATABASE_URL` reaches the live `/health` path without the earlier crash

### 3. One migration-managed durable record shape

The slice established a concrete `jobs` row shape that all moving parts share:

- `id`
- `status`
- `attempts`
- `last_error`
- `payload`
- `created_at`
- `updated_at`
- `processed_at`

This is the first serious backend contract in the milestone: migrations create it, API handlers expose it, the worker mutates it, and `psql` can inspect it directly.

### 4. The canonical HTTP + worker lifecycle

The backend now exposes:

- `GET /health`
- `POST /jobs`
- `GET /jobs/:id`

And it runs a timer-driven worker that:

- ticks on `JOB_POLL_MS`
- claims the oldest `pending` job
- increments `attempts`
- marks the same row `processed`
- records worker state for health/diagnostic inspection

### 5. Reusable proof artifacts for later slices

S01 shipped the package-local and compiler-facing proof surfaces that later slices can reuse rather than rebuilding new harnesses:

- `reference-backend/scripts/smoke.sh`
- `compiler/meshc/tests/e2e_reference_backend.rs`
- `reference-backend/README.md`
- `reference-backend/.env.example`

## Verification that passed during slice closure

All slice-level proof paths were rerun against a live Postgres instance and passed.

### Passed commands

```bash
cargo build -p mesh-rt
cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_builds -- --nocapture
env -u DATABASE_URL PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend 2>&1 | rg "DATABASE_URL"
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_runtime_starts -- --ignored --nocapture
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend status
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend up
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} PORT=18080 JOB_POLL_MS=500 bash reference-backend/scripts/smoke.sh
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_postgres_smoke -- --ignored --nocapture
```

### Observability spot checks confirmed

In addition to the plan commands, closure verification confirmed the main inspection surfaces behave as intended:

- `GET /health` returned worker status, poll interval, timestamps, processed/failed counters, and last job id
- `POST /jobs` returned a persisted durable record with `pending` state
- `GET /jobs/:id` returned the same durable record after worker mutation with `processed` state and `attempts=1`
- direct `psql` inspection of `jobs` showed the same job id and state seen via HTTP
- startup/worker logs remained useful while still redacting `DATABASE_URL`
- `GET /jobs/00000000-0000-0000-0000-000000000000` returned `404 {"error":"job not found"}`

## What changed in Mesh itself, not just the example app

S01 was not only app assembly work.

The slice also exposed and fixed a real platform issue in how the runtime/codegen boundary handled payloads for:

- opaque DB pool handles
- `mesh_pg_execute` row counts
- parsed numeric payloads returned from `String.to_int` / `String.to_float`

The fix was to box those payloads consistently before compiled Mesh code unwraps `Result`/`Option` values. Without that, the reference backend could build but crash or misbehave on the real DB path. With the fix in place, migrations, startup, and job processing all use the corrected Mesh behavior.

That is important for downstream slices because later runtime-hardening work should assume S01 already paid the cost of fixing one real Mesh limitation at the source.

## Forward Intelligence

### What later slices can rely on

- `reference-backend/` is now the canonical backend proof target for M028, not a disposable demo.
- The startup contract is stable enough for S02/S03/S04/S05 to use as their shared baseline.
- The worker-health surface already exposes enough state to support future failure/restart investigation.
- Package-local smoke + compiler e2e proof already exist, so follow-on slices should extend those artifacts instead of inventing new ones.

### Authoritative diagnostics

Use these first when the golden path looks broken:

1. `reference-backend/scripts/smoke.sh`
   - Best single end-to-end signal. It builds, starts, probes health, creates a job, polls the job until processed, and fails loudly when any of those stages regress.
2. `compiler/meshc/tests/e2e_reference_backend.rs`
   - Best mechanical regression surface for repo-level proof. It encodes build-only, runtime-start, and Postgres smoke expectations in one place.
3. `cargo run -p meshc -- migrate reference-backend status`
   - Best first check when the backend starts but job persistence looks wrong. It tells you whether the schema expectation and runtime expectation are already out of sync.
4. `GET /health`
   - Best live-process signal for worker state. It distinguishes idle/processing/failed behavior without reading raw logs first.
5. `psql "$DATABASE_URL" ... from jobs ...`
   - Best source of truth when HTTP responses and worker logs disagree. The DB row is the durable state the slice is actually proving.

### Gotchas worth preserving

- The working migration CLI order is `meshc migrate reference-backend <command>`, not `meshc migrate <command> reference-backend`.
- The working Cargo invocation order is `cargo test -p meshc --test e2e_reference_backend <test_name> -- ...`.
- Clear stale listeners on `:18080` before rerunning `e2e_reference_backend_runtime_starts`, or the test can talk to the wrong process.
- Keep env validation on the hot path in `reference-backend/main.mpl`; moving it back through the wrong parsing path previously reintroduced startup instability.
- In `reference-backend`, using the literal table name `"jobs"` is safer than the generated schema helper because of the local `Job` surface collision.

### What S01 does not prove yet

S01 proves one happy-path backend assembly with explicit config failure handling. It does **not** yet prove:

- richer correctness under concurrent claims or repeated failures
- worker restart/supervision behavior after crashes
- deployment/binary smoke outside the development workflow
- tooling credibility (fmt/LSP/tests/coverage) on this package
- broader documentation promotion beyond package-local proof material

Those remain the next-slice responsibilities, but they now have a real system to harden instead of a vague milestone promise.
