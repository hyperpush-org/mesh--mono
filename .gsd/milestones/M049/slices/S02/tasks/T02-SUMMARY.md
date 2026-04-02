---
id: T02
parent: S02
milestone: M049
provides: []
requires: []
affects: []
key_files: ["compiler/mesh-pkg/src/scaffold.rs", "compiler/meshc/src/main.rs", "compiler/meshc/tests/tooling_e2e.rs", ".gsd/milestones/M049/slices/S02/tasks/T02-SUMMARY.md"]
key_decisions: ["Rewrote the public SQLite todo-api starter as an explicitly local single-node scaffold and kept clustered Todo history isolated in the committed M047 fixture instead of preserving a shadow clustered mode in public init.", "Moved SQLite env keys and error messages into generated `config.mpl` so the starter can validate local config explicitly and generated package tests can pin the contract without depending on runtime logs."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran the task's required verification commands. `cargo test -p mesh-pkg m049_s02_sqlite_scaffold_ -- --nocapture` passed and proves the local-only SQLite file set plus generated package-test files. `cargo test -p meshc --test tooling_e2e test_init_todo_template_db_sqlite_ -- --nocapture` still fails because meshc test on the generated project compiles tests/config.test.mpl successfully but the generated tests/storage.test.mpl still trips `expected (), found Int` errors in the negative helper/assertion path."
completed_at: 2026-04-02T23:18:46.008Z
blocker_discovered: false
---

# T02: Rewrote the public SQLite todo-api scaffold toward a local-only contract, but the generated storage package test still fails under meshc test.

> Rewrote the public SQLite todo-api scaffold toward a local-only contract, but the generated storage package test still fails under meshc test.

## What Happened
---
id: T02
parent: S02
milestone: M049
key_files:
  - compiler/mesh-pkg/src/scaffold.rs
  - compiler/meshc/src/main.rs
  - compiler/meshc/tests/tooling_e2e.rs
  - .gsd/milestones/M049/slices/S02/tasks/T02-SUMMARY.md
key_decisions:
  - Rewrote the public SQLite todo-api starter as an explicitly local single-node scaffold and kept clustered Todo history isolated in the committed M047 fixture instead of preserving a shadow clustered mode in public init.
  - Moved SQLite env keys and error messages into generated `config.mpl` so the starter can validate local config explicitly and generated package tests can pin the contract without depending on runtime logs.
duration: ""
verification_result: mixed
completed_at: 2026-04-02T23:18:46.013Z
blocker_discovered: false
---

# T02: Rewrote the public SQLite todo-api scaffold toward a local-only contract, but the generated storage package test still fails under meshc test.

**Rewrote the public SQLite todo-api scaffold toward a local-only contract, but the generated storage package test still fails under meshc test.**

## What Happened

Replaced the public SQLite todo-api generator so it no longer emits work.mpl, Node.start_from_env(), HTTP.clustered(...), clustered health markers, or cluster-port Docker exposure. The generated SQLite starter now writes config.mpl, local-only main/router/health/storage files, and two generated package tests (tests/config.test.mpl and tests/storage.test.mpl). The storage template now uses Todo.from_row(...) with deriving(Json, Row) instead of manual Map.get(row, ...) parsing, validates blank titles and malformed ids explicitly, and reports local /health state instead of clustered handler truth. Updated compiler/meshc/src/main.rs so init help and error messages separate the honest local SQLite starter from the explicit clustered/deployable Postgres starter and the minimal --clustered scaffold. Updated compiler/meshc/tests/tooling_e2e.rs to expect the new local-only file set and guidance, and added a real meshc test <generated-project> proof step. The mesh-pkg scaffold rail is green; the remaining red surface is the generated tests/storage.test.mpl package rail, which still fails at compile time under meshc test with Mesh type-shape errors in the negative helper/assertion path.

## Verification

Ran the task's required verification commands. `cargo test -p mesh-pkg m049_s02_sqlite_scaffold_ -- --nocapture` passed and proves the local-only SQLite file set plus generated package-test files. `cargo test -p meshc --test tooling_e2e test_init_todo_template_db_sqlite_ -- --nocapture` still fails because meshc test on the generated project compiles tests/config.test.mpl successfully but the generated tests/storage.test.mpl still trips `expected (), found Int` errors in the negative helper/assertion path.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p mesh-pkg m049_s02_sqlite_scaffold_ -- --nocapture` | 0 | ✅ pass | 11400ms |
| 2 | `cargo test -p meshc --test tooling_e2e test_init_todo_template_db_sqlite_ -- --nocapture` | 101 | ❌ fail | 37600ms |


## Deviations

Strengthened the tooling rail beyond static scaffold inspection by making it run `meshc test <generated-project>` against the generated SQLite starter. This was a truthful extension of the planned verification surface so the new generated package tests are exercised instead of only being checked as text.

## Known Issues

The generated SQLite storage package test still fails to compile under `meshc test <generated-project>` with Mesh type-shape errors (`expected (), found Int`) in the negative helper/assertion path. Resume from the emitted `storage_test` string in `compiler/mesh-pkg/src/scaffold.rs` and rerun the two task verification commands.

## Files Created/Modified

- `compiler/mesh-pkg/src/scaffold.rs`
- `compiler/meshc/src/main.rs`
- `compiler/meshc/tests/tooling_e2e.rs`
- `.gsd/milestones/M049/slices/S02/tasks/T02-SUMMARY.md`


## Deviations
Strengthened the tooling rail beyond static scaffold inspection by making it run `meshc test <generated-project>` against the generated SQLite starter. This was a truthful extension of the planned verification surface so the new generated package tests are exercised instead of only being checked as text.

## Known Issues
The generated SQLite storage package test still fails to compile under `meshc test <generated-project>` with Mesh type-shape errors (`expected (), found Int`) in the negative helper/assertion path. Resume from the emitted `storage_test` string in `compiler/mesh-pkg/src/scaffold.rs` and rerun the two task verification commands.
