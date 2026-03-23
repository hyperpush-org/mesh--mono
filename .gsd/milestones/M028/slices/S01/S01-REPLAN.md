# S01 Replan — after T01 blocker

## Blocker discovered

- **Task:** T01 — Scaffold the `reference-backend/` package and startup contract
- **Blocker:** the compiled `reference-backend/reference-backend` binary segfaults on the non-empty `DATABASE_URL` startup path before HTTP bind.
- **Evidence already captured:** build-only proof passes, missing-env failure is explicit, but both the ignored Postgres smoke test and direct binary startup fail once `DATABASE_URL` is populated. The crash investigation currently points at `parse_required_positive_int` in the generated binary.

## Why the original remaining plan no longer works

The original T02–T04 sequence assumed the runtime startup contract was already trustworthy enough to layer on migrations, DB-backed handlers, and a background worker. That assumption is false. As long as a real `DATABASE_URL` can crash the binary before `/health`, every DB-backed follow-on task is built on an unsafe base.

So the slice now has to spend its next task on **runtime startup hardening and explicit regression proof** before adding more backend surface.

## What changed

### Modified incomplete tasks

- **T02** was rewritten.
  - **Before:** add migration-managed jobs persistence and DB-backed API endpoints.
  - **Now:** repair the non-empty `DATABASE_URL` startup path and land regression proof.
  - **Why:** this is the blocker that currently prevents all remaining DB-backed work.

- **T03** was rewritten.
  - **Before:** wire the timer-driven worker and package-local smoke path.
  - **Now:** add migration-managed jobs persistence and DB-backed API endpoints.
  - **Why:** persistence work is still needed, but only after startup is safe.

- **T04** was rewritten.
  - **Before:** add compiler-facing e2e proof and canonical package documentation.
  - **Now:** wire the timer-driven worker and package-local smoke path.
  - **Why:** the worker/smoke path remains core slice scope and now correctly depends on safe startup plus DB-backed endpoints.

### Added tasks

- **T05** was added.
  - **Scope:** finish the compiler-facing e2e proof surface and canonical package docs after the runtime, persistence, and worker path are all real.
  - **Why:** T01 already seeded the Rust test target, but the final slice still needs consolidated runtime-start and Postgres smoke coverage plus authoritative package-local docs.

### Removed tasks

- No completed tasks were changed or removed.
- No incomplete scope was dropped permanently; the original documentation/e2e work was moved later to **T05** instead of being discarded.

## New sequencing

1. **T02:** make non-empty `DATABASE_URL` startup safe and testable
2. **T03:** add migration-managed `jobs` persistence plus DB-backed create/read endpoints
3. **T04:** add the timer-driven worker and package-local smoke flow
4. **T05:** finish compiler-facing e2e coverage and package-local docs around the now-working golden path

## New risks / considerations

- The crash may still turn out to require a fix outside `reference-backend/` itself if the generated startup path exposes a compiler/runtime bug rather than only a package bug.
- Runtime-start verification now needs to be treated as a first-class proof artifact, not an informal precondition.
- The slice still depends on a real Postgres-backed path for end-to-end proof, so disposable local database setup remains part of practical verification.
- Because `compiler/meshc/tests/e2e_reference_backend.rs` was seeded in T01, later tasks must extend it carefully instead of replacing that initial build-only proof.

## Expected outcome after replan

The slice still delivers the same end state: a canonical `reference-backend/` proving Mesh can compose HTTP, migrations, durable Postgres state, and a background worker in one auditable runtime. The difference is that the plan now explicitly retires the startup crash before layering on the rest of that backend proof path.
