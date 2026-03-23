---
id: T02
parent: S03
milestone: M028
provides:
  - Truthful `meshc test <project-or-directory>` execution for the canonical `reference-backend` path
  - Explicit unsupported coverage behavior for `meshc test --coverage`
  - Repo-level e2e proof for directory targets, backend test execution, and coverage-contract messaging
key_files:
  - compiler/meshc/src/main.rs
  - compiler/meshc/src/test_runner.rs
  - compiler/meshc/tests/tooling_e2e.rs
  - reference-backend/tests/config.test.mpl
  - reference-backend/README.md
  - reference-backend/jobs/worker.mpl
  - reference-backend/types/job.mpl
key_decisions:
  - Treat the user-supplied `meshc test <path>` as the discovery root while resolving import-copy scope from the nearest ancestor containing `main.mpl`.
  - Replace the `--coverage` success stub with an explicit unsupported error so the CLI exits non-zero instead of claiming work it did not perform.
  - Restore the locally-truncated `reference-backend` worker/type modules so the canonical backend path actually compiles before claiming test-runner support for it.
patterns_established:
  - CLI test runners should separate test discovery scope from project import scope when supporting both project-root and nested-directory targets.
observability_surfaces:
  - `cargo run -p meshc -- test --help`
  - `cargo run -p meshc -- test reference-backend`
  - `cargo run -p meshc -- test --coverage reference-backend`
  - `compiler/meshc/tests/tooling_e2e.rs`
duration: 2h 10m
verification_result: passed
completed_at: 2026-03-23 15:04:15 EDT
blocker_discovered: false
---

# T02: Make `meshc test` truthful for `reference-backend` and coverage reporting

**Made `meshc test` run real project/directory targets on `reference-backend`, fail honestly on `--coverage`, and locked that contract into backend docs plus tooling e2e.**

## What Happened

I first reproduced the live gap exactly as planned: `meshc test reference-backend` was rejected because the CLI only accepted a specific `*.test.mpl` file, and `meshc test --coverage reference-backend` still exited green with a placeholder message.

I then updated the CLI/test-runner contract so `meshc test` now accepts three honest target shapes: a project root, a nested directory like `tests/`, or a specific `*.test.mpl` file. The important implementation detail is that discovery now happens under the requested path, while import-copy resolution still anchors itself at the nearest ancestor containing `main.mpl`, which preserves project-local module imports.

I replaced the `--coverage` stub with an explicit unsupported error. The command now exits non-zero and says coverage is not implemented instead of pretending the request succeeded.

I added a real backend-native Mesh test at `reference-backend/tests/config.test.mpl` that exercises `reference-backend/config.mpl` through actual exported package functions and assertions.

While proving the real backend path, local reality differed from the planner snapshot: `reference-backend/jobs/worker.mpl` and `reference-backend/types/job.mpl` were truncated in this worktree, so the canonical backend package could not compile at all. I repaired those files to a coherent state that matches the package’s current API, worker health surface, and existing backend e2e expectations. That was necessary to make `meshc test reference-backend` truthful on the real package instead of narrowing the proof to an artificial fixture.

Finally, I extended `compiler/meshc/tests/tooling_e2e.rs` with regression coverage for directory-target execution, `reference-backend` project-root execution, and unsupported coverage behavior, and updated `reference-backend/README.md` to document the verified command surface.

## Verification

Task-level verification passed:
- `cargo run -p meshc -- test --help`
- `cargo run -p meshc -- test reference-backend`
- `cargo test -p meshc --test tooling_e2e -- --nocapture`

I also directly verified the unsupported coverage contract with `cargo run -p meshc -- test --coverage reference-backend`, which now exits 1 with the explicit unsupported message, and I verified the repaired canonical backend path still compiles with `cargo run -p meshc -- build reference-backend` because the local worktree had truncated backend sources.

Slice-level verification was only partially rerun in this unit before the context-budget wrap-up trigger. The T02-owned surfaces are green (`meshc test reference-backend`, direct coverage failure, and tooling e2e). The formatter and mesh-lsp slice checks retain their last known status from T01, and `cargo test -p meshc --test e2e_lsp -- --nocapture` remains pending for T03.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo run -p meshc -- build reference-backend` | 0 | ✅ pass | 2.6s |
| 2 | `cargo run -p meshc -- test --help` | 0 | ✅ pass | 6.4s |
| 3 | `cargo run -p meshc -- test reference-backend` | 0 | ✅ pass | 4.4s |
| 4 | `cargo run -p meshc -- test --coverage reference-backend` | 1 | ✅ pass | 5.8s |
| 5 | `cargo test -p meshc --test tooling_e2e -- --nocapture` | 0 | ✅ pass | 5.3s |

## Diagnostics

Future agents can localize regressions quickly with these surfaces:
- `cargo run -p meshc -- test --help` for the CLI contract and target-shape wording.
- `cargo run -p meshc -- test reference-backend` for real backend project-root discovery and execution.
- `cargo run -p meshc -- test --coverage reference-backend` for the explicit unsupported coverage failure path.
- `compiler/meshc/tests/tooling_e2e.rs` for repo-level regression proof of directory targets, backend execution, and coverage truth.

## Deviations

The written task plan did not mention backend source repair, but local execution showed `reference-backend/jobs/worker.mpl` and `reference-backend/types/job.mpl` were truncated badly enough that the canonical package would not compile. I restored those files because `meshc test reference-backend` could not be made truthful on the real backend path otherwise.

## Known Issues

- I did not rerun the ignored Postgres-backed `reference-backend` runtime smoke/e2e targets after reconstructing `jobs/worker.mpl`; this unit verified the compile path and `meshc test` path only.
- Full slice verification was not completely rerun in this unit once the context-budget wrap-up warning arrived. The remaining open slice-level item is still `cargo test -p meshc --test e2e_lsp -- --nocapture`, which belongs to T03.

## Files Created/Modified

- `compiler/meshc/src/main.rs` — updated the `meshc test` help/CLI contract to describe project-root, directory, and file targets plus explicit unsupported coverage behavior.
- `compiler/meshc/src/test_runner.rs` — added directory/project discovery semantics, separated discovery root from import root, and replaced the coverage success stub with an explicit error.
- `compiler/meshc/tests/tooling_e2e.rs` — added regression coverage for tests-directory invocation, `reference-backend` project-dir execution, and coverage-contract failure behavior.
- `reference-backend/tests/config.test.mpl` — added a real passing backend-native Mesh test that exercises exported config helpers.
- `reference-backend/README.md` — documented the verified test command surface and honest coverage contract.
- `reference-backend/jobs/worker.mpl` — restored the truncated worker implementation so the canonical backend package compiles again.
- `reference-backend/types/job.mpl` — restored the truncated shared job type definition used by backend storage/API/worker code.
- `.gsd/KNOWLEDGE.md` — recorded the discovery-root vs project-root rule for future `meshc test` work.
- `.gsd/milestones/M028/slices/S03/S03-PLAN.md` — marked T02 complete.
