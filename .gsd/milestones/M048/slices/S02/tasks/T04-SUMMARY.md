---
id: T04
parent: S02
milestone: M048
provides: []
requires: []
affects: []
key_files: ["compiler/meshpkg/src/publish.rs", "compiler/meshpkg/Cargo.toml", ".gsd/milestones/M048/slices/S02/tasks/T04-SUMMARY.md"]
key_decisions: ["Replaced root-only tarball selection with a recursive project-root walk that mirrors Mesh discovery filters, validates relative member names, and rejects duplicate archive members before tar assembly."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran `cargo test -p meshpkg -- --nocapture` from the repo root. The suite passed with 8 tests, including the new tarball-membership coverage in `compiler/meshpkg/src/publish.rs` that proves nested override-entry files are archived and hidden/test-only files stay excluded."
completed_at: 2026-04-02T09:22:24.909Z
blocker_discovered: false
---

# T04: Made `meshpkg publish` archive nested Mesh source trees relative to project root and pinned the behavior with direct tarball-member regression tests.

> Made `meshpkg publish` archive nested Mesh source trees relative to project root and pinned the behavior with direct tarball-member regression tests.

## What Happened
---
id: T04
parent: S02
milestone: M048
key_files:
  - compiler/meshpkg/src/publish.rs
  - compiler/meshpkg/Cargo.toml
  - .gsd/milestones/M048/slices/S02/tasks/T04-SUMMARY.md
key_decisions:
  - Replaced root-only tarball selection with a recursive project-root walk that mirrors Mesh discovery filters, validates relative member names, and rejects duplicate archive members before tar assembly.
duration: ""
verification_result: passed
completed_at: 2026-04-02T09:22:24.910Z
blocker_discovered: false
---

# T04: Made `meshpkg publish` archive nested Mesh source trees relative to project root and pinned the behavior with direct tarball-member regression tests.

**Made `meshpkg publish` archive nested Mesh source trees relative to project root and pinned the behavior with direct tarball-member regression tests.**

## What Happened

I replaced `meshpkg publish`’s root-only tarball selection with a recursive project-root walk in `compiler/meshpkg/src/publish.rs`. The new collector includes `mesh.toml` plus every non-hidden `.mpl` file under the project root, preserves each file’s relative path, excludes `*.test.mpl`, and does not special-case `src/`, `lib/`, or any other directory name. I added explicit relative-path validation and duplicate-member rejection before tar assembly so walk failures, malformed member names, and conflicting archive members fail loudly instead of producing partial tarballs. I also added publish-specific tests that materialize override-entry fixtures directly inside `publish.rs` and inspect tarball members for override-only packages, override-precedence packages, nested support modules outside `src/`, hidden/test-only exclusion, walk-failure reporting, malformed relative-path rejection, and duplicate-member rejection.

## Verification

Ran `cargo test -p meshpkg -- --nocapture` from the repo root. The suite passed with 8 tests, including the new tarball-membership coverage in `compiler/meshpkg/src/publish.rs` that proves nested override-entry files are archived and hidden/test-only files stay excluded.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p meshpkg -- --nocapture` | 0 | ✅ pass | 18100ms |


## Deviations

Added `tempfile = "3"` under `compiler/meshpkg/Cargo.toml` dev-dependencies so publish tests could materialize isolated package trees. Otherwise none.

## Known Issues

None.

## Files Created/Modified

- `compiler/meshpkg/src/publish.rs`
- `compiler/meshpkg/Cargo.toml`
- `.gsd/milestones/M048/slices/S02/tasks/T04-SUMMARY.md`


## Deviations
Added `tempfile = "3"` under `compiler/meshpkg/Cargo.toml` dev-dependencies so publish tests could materialize isolated package trees. Otherwise none.

## Known Issues
None.
