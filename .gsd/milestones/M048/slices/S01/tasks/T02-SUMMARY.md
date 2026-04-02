---
id: T02
parent: S01
milestone: M048
provides: []
requires: []
affects: []
key_files: ["compiler/meshc/src/test_runner.rs", "compiler/meshc/tests/tooling_e2e.rs", "compiler/mesh-pkg/src/manifest.rs", "compiler/meshc/tests/e2e.rs", ".gsd/KNOWLEDGE.md"]
key_decisions: ["Reused `mesh_pkg::manifest::resolve_entrypoint` plus a shared manifest-rewrite helper so test temp projects honor the same executable contract as normal builds instead of duplicating entrypoint logic.", "Fail closed on unmappable file targets and temp-project setup drift, with explicit setup-error messages for wrong-root discovery, copied-entry contamination, and invalid synthetic manifest state."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Passed `cargo test -p mesh-pkg entrypoint -- --nocapture`, `cargo test -p meshc --bin meshc test_runner::tests:: -- --nocapture`, `cargo test -p meshc --test tooling_e2e test_test_ -- --nocapture`, and the previously failing `cargo test -p meshc build_project_ -- --nocapture`. The new CLI regressions prove that override-entry projects without a root `main.mpl` succeed through project-dir, tests-dir, and specific-file targets, while orphan file targets fail closed with a truthful root-resolution error."
completed_at: 2026-04-02T07:08:48.736Z
blocker_discovered: false
---

# T02: Made `meshc test` honor resolved entrypoints across project-dir, tests-dir, and specific-file targets, and removed the stale compile-time fixture dependency blocking the package verification rail.

> Made `meshc test` honor resolved entrypoints across project-dir, tests-dir, and specific-file targets, and removed the stale compile-time fixture dependency blocking the package verification rail.

## What Happened
---
id: T02
parent: S01
milestone: M048
key_files:
  - compiler/meshc/src/test_runner.rs
  - compiler/meshc/tests/tooling_e2e.rs
  - compiler/mesh-pkg/src/manifest.rs
  - compiler/meshc/tests/e2e.rs
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Reused `mesh_pkg::manifest::resolve_entrypoint` plus a shared manifest-rewrite helper so test temp projects honor the same executable contract as normal builds instead of duplicating entrypoint logic.
  - Fail closed on unmappable file targets and temp-project setup drift, with explicit setup-error messages for wrong-root discovery, copied-entry contamination, and invalid synthetic manifest state.
duration: ""
verification_result: passed
completed_at: 2026-04-02T07:08:48.750Z
blocker_discovered: false
---

# T02: Made `meshc test` honor resolved entrypoints across project-dir, tests-dir, and specific-file targets, and removed the stale compile-time fixture dependency blocking the package verification rail.

**Made `meshc test` honor resolved entrypoints across project-dir, tests-dir, and specific-file targets, and removed the stale compile-time fixture dependency blocking the package verification rail.**

## What Happened

Updated `compiler/meshc/src/test_runner.rs` so project-root discovery now prefers the nearest ancestor `mesh.toml` and falls back to a legacy root `main.mpl` only when no manifest exists. File targets no longer silently fall back to repo CWD; orphan `*.test.mpl` targets now fail closed with the target path in the error. The runner now resolves the executable entry once through the shared `mesh_pkg::manifest::resolve_entrypoint(...)` seam, copies all non-test Mesh sources except that resolved executable, rewrites or synthesizes `mesh.toml` in the temp project to point at generated `main.mpl`, and validates that synthetic manifest before compile. I added binary-unit regressions for manifest-vs-legacy root detection, orphan-file rejection, resolved-entry exclusion, and temp-manifest carry-forward, then extended `compiler/meshc/tests/tooling_e2e.rs` with override-entry project-dir, tests-dir, specific-file, and fail-closed orphan-target CLI cases for projects that do not have a root `main.mpl`. To clear the unrelated verification gate failure, I also removed `compiler/meshc/tests/e2e.rs`’s compile-time dependence on ignored `.tmp/m032-s01/...` fixture files by inlining self-contained M032 fixture sources directly into the test target, and updated `.gsd/KNOWLEDGE.md` with the current filtered-test compilation rule.

## Verification

Passed `cargo test -p mesh-pkg entrypoint -- --nocapture`, `cargo test -p meshc --bin meshc test_runner::tests:: -- --nocapture`, `cargo test -p meshc --test tooling_e2e test_test_ -- --nocapture`, and the previously failing `cargo test -p meshc build_project_ -- --nocapture`. The new CLI regressions prove that override-entry projects without a root `main.mpl` succeed through project-dir, tests-dir, and specific-file targets, while orphan file targets fail closed with a truthful root-resolution error.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p mesh-pkg entrypoint -- --nocapture` | 0 | ✅ pass | 5770ms |
| 2 | `cargo test -p meshc --bin meshc test_runner::tests:: -- --nocapture` | 0 | ✅ pass | 15120ms |
| 3 | `cargo test -p meshc --test tooling_e2e test_test_ -- --nocapture` | 0 | ✅ pass | 18510ms |
| 4 | `cargo test -p meshc build_project_ -- --nocapture` | 0 | ✅ pass | 77630ms |


## Deviations

Updated `compiler/meshc/tests/e2e.rs` outside the planned file list so the unrelated package-wide `cargo test -p meshc build_project_ -- --nocapture` gate would compile again without depending on ignored `.tmp/m032-s01/...` fixture files.

## Known Issues

`scripts/verify-m032-s01.sh` still references the old `.tmp/m032-s01/...` replay layout; this task only removed the compile-time dependency from `compiler/meshc/tests/e2e.rs` so package verification could run truthfully again.

## Files Created/Modified

- `compiler/meshc/src/test_runner.rs`
- `compiler/meshc/tests/tooling_e2e.rs`
- `compiler/mesh-pkg/src/manifest.rs`
- `compiler/meshc/tests/e2e.rs`
- `.gsd/KNOWLEDGE.md`


## Deviations
Updated `compiler/meshc/tests/e2e.rs` outside the planned file list so the unrelated package-wide `cargo test -p meshc build_project_ -- --nocapture` gate would compile again without depending on ignored `.tmp/m032-s01/...` fixture files.

## Known Issues
`scripts/verify-m032-s01.sh` still references the old `.tmp/m032-s01/...` replay layout; this task only removed the compile-time dependency from `compiler/meshc/tests/e2e.rs` so package verification could run truthfully again.
