---
estimated_steps: 5
estimated_files: 4
skills_used:
  - debug-like-expert
  - test
  - review
---

# T02: Repair the non-empty `DATABASE_URL` startup path and land regression proof

**Slice:** S01 — Canonical Backend Golden Path
**Milestone:** M028

## Description

T01 proved the package builds, but it also exposed the real blocker for the slice: the compiled reference backend crashes when startup reaches a non-empty `DATABASE_URL` path. Before layering on migrations, DB-backed handlers, or a worker, make startup trustworthy. Reproduce the failure with the smallest live path, replace the crash-prone startup parsing/wiring with the safest working pattern available in-repo, and turn the fix into a regression test instead of leaving it as a one-off debugger note.

## Steps

1. Reproduce the crash on the smallest DB-backed startup path and narrow whether the failure comes from package-local startup code or a lower-level generated/runtime path.
2. Refactor `reference-backend/main.mpl` and `reference-backend/config.mpl` so `DATABASE_URL`, `PORT`, and `JOB_POLL_MS` use a safe startup flow that preserves clear missing-config failures.
3. Keep `GET /health` as the first live proof target and ensure the runtime reaches it with a real Postgres-backed startup instead of crashing before bind.
4. Extend `compiler/meshc/tests/e2e_reference_backend.rs` with an ignored runtime-start regression test for the non-empty `DATABASE_URL` path.
5. Confirm the missing-env path still reports `DATABASE_URL` explicitly and does not regress into a silent or generic startup failure.

## Must-Haves

- [ ] A non-empty `DATABASE_URL` no longer triggers `EXC_BAD_ACCESS` during startup.
- [ ] Real Postgres-backed startup reaches `/health`.
- [ ] The missing-env path still fails explicitly on `DATABASE_URL`.
- [ ] The crash has a mechanical regression test in the compiler-facing e2e target.

## Verification

- `cargo build -p mesh-rt && cargo test -p meshc e2e_reference_backend_builds --test e2e_reference_backend -- --nocapture`
- `env -u DATABASE_URL PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend 2>&1 | rg "DATABASE_URL"`
- `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc e2e_reference_backend_runtime_starts --test e2e_reference_backend -- --ignored --nocapture`

## Observability Impact

- Signals added/changed: startup log lines now distinguish config failure, DB-connect failure, and successful HTTP bind without crashing
- How a future agent inspects this: `GET /health`, the missing-env command, and `e2e_reference_backend_runtime_starts`
- Failure state exposed: non-empty startup regressions stop hiding as raw segfaults and become reproducible test failures

## Inputs

- `reference-backend/main.mpl` — current startup entrypoint and crash site neighborhood
- `reference-backend/config.mpl` — env contract surface introduced in T01
- `reference-backend/api/health.mpl` — first runtime proof surface that should come alive once startup is safe
- `compiler/meshc/tests/e2e_reference_backend.rs` — seeded build-only proof file that should gain runtime regression coverage
- `mesher/main.mpl` — donor for safer startup ordering and env handling patterns

## Expected Output

- `reference-backend/main.mpl` — startup flow hardened so non-empty env config no longer crashes
- `reference-backend/config.mpl` — startup-contract helpers aligned with the safe runtime path
- `reference-backend/api/health.mpl` — health proof surface confirmed against the live startup path
- `compiler/meshc/tests/e2e_reference_backend.rs` — explicit runtime-start regression coverage for the blocker
