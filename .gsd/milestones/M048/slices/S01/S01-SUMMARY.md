---
id: S01
parent: M048
milestone: M048
provides:
  - A shipped default-plus-override executable contract via optional `[package].entrypoint` in `mesh.toml`.
  - A shared resolver seam (`mesh_pkg::manifest::resolve_entrypoint(...)`) consumed by compiler build and test flows.
  - Override-aware discovery that preserves path-derived module names for non-root entry files.
  - A dedicated acceptance rail (`cargo test -p meshc --test e2e_m048_s01 -- --nocapture`) that proves default, override-precedence, override-only, and override-entry test-discovery scenarios.
requires:
  []
affects:
  - S02
  - S03
  - S05
key_files:
  - compiler/mesh-pkg/src/manifest.rs
  - compiler/meshc/src/main.rs
  - compiler/meshc/src/discovery.rs
  - compiler/meshc/src/test_runner.rs
  - compiler/meshc/tests/tooling_e2e.rs
  - compiler/meshc/tests/e2e.rs
  - compiler/meshc/tests/e2e_m048_s01.rs
  - compiler/mesh-codegen/src/lib.rs
  - .gsd/KNOWLEDGE.md
  - .gsd/DECISIONS.md
  - .gsd/PROJECT.md
key_decisions:
  - Centralize executable entry selection in `mesh_pkg::manifest::resolve_entrypoint(...)` so build and test flows share one validated project-root-relative contract.
  - Keep executable selection orthogonal to module naming: only root `main.mpl` maps to `Main`, while manifest-selected non-root entries keep path-derived module names.
  - For `meshc test`, reuse the shared entrypoint resolver, exclude the resolved executable file from copied temp-project sources, and rewrite the temp manifest back to synthetic `main.mpl` rather than inventing a second test-only entry contract.
  - When multiple modules lower `fn main()`, merge MIR starting with the designated entry module so manifest-selected entrypoints win duplicate `mesh_main` collisions.
patterns_established:
  - Put project-layout truth in one small manifest helper, then reuse that seam from compiler build, discovery, and test orchestration instead of duplicating path logic at each caller.
  - Keep executable-entry truth separate from semantic module identity; marking a file executable should not silently rename a non-root module to `Main`.
  - For assembled tooling slices, retain temp-project snapshots plus per-command stdout/stderr in a dedicated `.tmp/<slice>/` tree so the first broken seam is diagnosable without rerunning under manual instrumentation.
observability_surfaces:
  - `compiler/meshc/tests/e2e_m048_s01.rs` now archives retained project snapshots and command artifacts under `.tmp/m048-s01/<scenario>/`, including `*.stdout.log`, `*.stderr.log`, `*.combined.log`, command descriptions, and status files.
  - `meshc test` now emits explicit fail-closed setup errors for wrong-root discovery, copied-entry contamination, invalid synthetic manifest state, and missing resolved entry files instead of silently drifting to repo CWD or a zero-proof run.
drill_down_paths:
  - .gsd/milestones/M048/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M048/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M048/slices/S01/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-04-02T07:36:07.964Z
blocker_discovered: false
---

# S01: Configurable entrypoint in compiler and test discovery

**S01 replaced the hardcoded root-`main.mpl` executable assumption in compiler build and `meshc test` with a shared default-plus-override entrypoint contract, then proved it end to end with a dedicated acceptance rail.**

## What Happened

S01 introduced an optional `[package].entrypoint` field in `mesh.toml` and centralized executable selection in `mesh_pkg::manifest::resolve_entrypoint(...)`. `meshc build` now reads the manifest before discovery, resolves one effective executable entry path, and passes that explicit path into discovery instead of assuming root `main.mpl` is always the entry file. Discovery now marks only the resolved file as executable, but it keeps module naming honest: only root `main.mpl` gets the special `Main` module name, while non-root entries such as `lib/start.mpl` retain their path-derived module names.

The slice also repaired `meshc test` so project-dir, `tests/` dir, and specific-file targets all resolve the same project root and executable contract. The runner now prefers the nearest ancestor `mesh.toml`, falls back to a legacy root `main.mpl` only when no manifest exists, excludes the resolved executable entry file from copied temp-project sources, rewrites the temp manifest back to synthetic `main.mpl`, and fails closed on orphan file targets or setup drift. To keep the package-wide verification rail truthful, the slice removed `compiler/meshc/tests/e2e.rs`'s compile-time dependency on ignored `.tmp/m032-s01/...` fixtures.

While assembling the end-to-end proof, the new acceptance harness exposed a deeper compiler bug: when both root `main.mpl` and a manifest-selected override entry existed, MIR merge could still let the legacy root `main.mpl` win because duplicate `mesh_main` symbols were deduped in source order. S01 fixed `compiler/mesh-codegen/src/lib.rs::merge_mir_modules(...)` so the designated entry module is merged first, and added a focused regression plus a dedicated `compiler/meshc/tests/e2e_m048_s01.rs` acceptance target. That target retains per-scenario temp projects plus subprocess stdout/stderr under `.tmp/m048-s01/`, so future regressions have inspectable evidence instead of ad hoc repro work.

## Verification

Passed the slice-plan verification rails and the additional root-cause regression that S01 introduced:
- `cargo test -p mesh-pkg entrypoint -- --nocapture`
- `cargo test -p meshc build_project_ -- --nocapture`
- `cargo test -p meshc --test tooling_e2e test_test_ -- --nocapture`
- `cargo test -p meshc --test e2e_m048_s01 -- --nocapture`
- `cargo test -p mesh-codegen merge_mir_modules_prefers_entry_module_mesh_main_when_multiple_modules_define_main -- --nocapture`

Results: manifest-side entrypoint parsing/resolution passed, `meshc build` passed for the build/discovery rail, override-entry CLI test flows passed for project-dir / `tests/` dir / specific-file targets, the assembled acceptance rail passed all eight scenarios, and the focused codegen regression passed. The acceptance rail also confirmed the intended diagnostic surfaces by retaining fixture snapshots and per-command stdout/stderr under `.tmp/m048-s01/`.

## Requirements Advanced

- R112 — Implemented the default-plus-override executable contract for compiler build and `meshc test`, including manifest validation, shared entrypoint resolution, override-aware discovery, fail-closed test-root resolution, and the dedicated `e2e_m048_s01` acceptance rail.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

The slice had to touch a few files outside the original task file lists to close real failures surfaced by truthful verification: `compiler/meshc/tests/e2e_m044_s02.rs` was adjusted so early unit verification could compile, `compiler/meshc/tests/e2e.rs` was rewritten to stop depending on ignored `.tmp/m032-s01/...` fixtures for package-wide filtered runs, and `compiler/mesh-codegen/src/lib.rs` plus a focused regression were added after the new acceptance rail exposed the duplicate-`mesh_main` merge bug. These were root-cause fixes, not scope drift into unrelated features.

## Known Limitations

R112 is advanced but not yet fully validated. S01 closes the build and `meshc test` parts of the executable-entry contract, but analyze/editor/package-facing surfaces still need the same override-entry behavior in M048/S02 before the full requirement can move to validated.

## Follow-ups

M048/S02 should propagate the default-plus-override entrypoint contract into LSP analysis, editor/root-detection behavior, and package-facing discovery so non-root entry projects behave consistently across compile, test, analyze, and package surfaces. Later closeout work should keep the `e2e_m048_s01` acceptance rail as the authoritative replay point whenever those downstream surfaces change.

## Files Created/Modified

- `compiler/mesh-pkg/src/manifest.rs` — Added optional `[package].entrypoint`, normalization/validation, shared `resolve_entrypoint(...)`, and manifest rewrite support for synthetic test projects.
- `compiler/meshc/src/main.rs` — Resolved the effective entrypoint before project discovery and required build-time discovery to honor that explicit path.
- `compiler/meshc/src/discovery.rs` — Added entry-aware project construction that marks only the resolved file executable while preserving path-derived naming for non-root entries.
- `compiler/meshc/src/test_runner.rs` — Reworked project-root resolution, shared entrypoint handling, temp-project manifest rewriting, and fail-closed orphan/setup error behavior for `meshc test`.
- `compiler/meshc/tests/tooling_e2e.rs` — Added CLI regressions covering override-entry project-dir, `tests/` dir, specific-file, and orphan-target test flows.
- `compiler/meshc/tests/e2e.rs` — Removed compile-time dependence on ignored `.tmp/m032-s01/...` fixtures so package-wide filtered verification can compile truthfully again.
- `compiler/meshc/tests/e2e_m048_s01.rs` — Added the dedicated slice acceptance harness covering default, override-precedence, override-only, and override-entry test-discovery scenarios with retained artifacts.
- `compiler/mesh-codegen/src/lib.rs` — Changed MIR merge ordering so the designated entry module wins duplicate `mesh_main` collisions and added a focused regression.
- `.gsd/KNOWLEDGE.md` — Recorded current entrypoint/test-runner gotchas and the non-root entry module-naming rule.
- `.gsd/DECISIONS.md` — Recorded the discovery/module-naming decision introduced by the slice.
- `.gsd/PROJECT.md` — Updated project state to reflect active M048 work and completed S01 entrypoint-flexibility progress.
