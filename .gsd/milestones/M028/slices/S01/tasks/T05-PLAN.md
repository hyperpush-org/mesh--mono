---
estimated_steps: 4
estimated_files: 3
skills_used:
  - test
  - review
  - lint
---

# T05: Finish compiler-facing e2e proof and canonical package documentation

**Slice:** S01 — Canonical Backend Golden Path
**Milestone:** M028

## Description

Lock the now-working package into the repo’s verification surface and document the exact commands future slices should keep using. T01 already seeded `compiler/meshc/tests/e2e_reference_backend.rs`; this task finishes it by consolidating the build-only proof, the startup-crash regression proof, and the ignored Postgres smoke path into one authoritative compiler-facing target. Package-local docs should match those same commands exactly.

## Steps

1. Extend `compiler/meshc/tests/e2e_reference_backend.rs` so it covers the on-disk package build path, the ignored runtime-start regression for non-empty `DATABASE_URL`, and the ignored Postgres smoke path.
2. Reuse existing test helpers/patterns from `compiler/meshc/tests/e2e.rs`, `compiler/meshc/tests/e2e_stdlib.rs`, and `compiler/meshc/src/test_runner.rs` instead of hand-rolling a new compiler harness.
3. Add `reference-backend/README.md` with the exact prerequisite, migrate, build, run, and smoke commands for the package.
4. Add `reference-backend/.env.example` so the package docs, smoke script, and test expectations all share the same startup variable names.

## Must-Haves

- [ ] The repo has a dedicated Rust test file for the on-disk `reference-backend/` package.
- [ ] The compiler-facing proof includes build-only coverage, explicit startup-regression coverage, and an ignored Postgres smoke test.
- [ ] Package-local docs list the same commands the tests and smoke script expect.
- [ ] `.env.example` matches the code-level startup contract exactly.

## Verification

- `cargo build -p mesh-rt && cargo test -p meshc e2e_reference_backend_builds --test e2e_reference_backend -- --nocapture`
- `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc e2e_reference_backend_postgres_smoke --test e2e_reference_backend -- --ignored --nocapture`

## Inputs

- `reference-backend/main.mpl` — package entrypoint whose contract the tests and docs must reflect
- `reference-backend/migrations/20260323010000_create_jobs.mpl` — migration path the smoke proof must apply
- `reference-backend/jobs/worker.mpl` — background worker behavior the smoke test should wait on
- `reference-backend/scripts/smoke.sh` — package-local smoke path to reference from docs/tests
- `compiler/meshc/tests/e2e.rs` — existing multi-file/on-disk compiler e2e patterns to reuse
- `compiler/meshc/tests/e2e_stdlib.rs` — existing server startup and HTTP probe patterns to reuse
- `compiler/meshc/src/test_runner.rs` — helper logic for copying project sources into temp dirs

## Expected Output

- `compiler/meshc/tests/e2e_reference_backend.rs` — Rust e2e coverage for build, runtime-start regression, and ignored Postgres smoke verification of the package
- `reference-backend/README.md` — authoritative package-local build/migrate/run/smoke instructions
- `reference-backend/.env.example` — example env contract shared by docs, smoke flow, and tests
