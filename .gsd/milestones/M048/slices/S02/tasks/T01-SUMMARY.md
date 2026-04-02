---
id: T01
parent: S02
milestone: M048
provides: []
requires: []
affects: []
key_files: ["compiler/mesh-lsp/src/analysis.rs", ".gsd/milestones/M048/slices/S02/tasks/T01-SUMMARY.md"]
key_decisions: ["Resolve the manifest and effective entrypoint before LSP graph construction, and treat any failure after root discovery as a project diagnostic instead of silently falling back to isolated analysis.", "Preserve D317 by naming only project-root `main.mpl` as `Main` while still allowing non-root manifest-selected entries to be executable."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran the task-local `cargo test -p mesh-lsp -- --nocapture` rail and the full slice verification matrix. Passing rails: `cargo test -p meshc --test e2e_m048_s01 -- --nocapture`, `cargo test -p mesh-lsp -- --nocapture`, `cargo test -p meshc --test e2e_lsp -- --nocapture`, `node --test scripts/tests/verify-m036-s02-contract.test.mjs`, `npm --prefix tools/editors/vscode-mesh run test:smoke`, and `cargo test -p meshpkg -- --nocapture`. The Neovim verifier `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp` failed at preflight because the local `nvim` binary is unavailable, so editor-host verification is partially blocked by environment rather than code."
completed_at: 2026-04-02T08:36:49.528Z
blocker_discovered: false
---

# T01: Made `mesh-lsp` resolve manifest-first project roots and executable entries, fail closed with project diagnostics, and pin the override-entry contract with focused regression tests.

> Made `mesh-lsp` resolve manifest-first project roots and executable entries, fail closed with project diagnostics, and pin the override-entry contract with focused regression tests.

## What Happened
---
id: T01
parent: S02
milestone: M048
key_files:
  - compiler/mesh-lsp/src/analysis.rs
  - .gsd/milestones/M048/slices/S02/tasks/T01-SUMMARY.md
key_decisions:
  - Resolve the manifest and effective entrypoint before LSP graph construction, and treat any failure after root discovery as a project diagnostic instead of silently falling back to isolated analysis.
  - Preserve D317 by naming only project-root `main.mpl` as `Main` while still allowing non-root manifest-selected entries to be executable.
duration: ""
verification_result: mixed
completed_at: 2026-04-02T08:36:49.529Z
blocker_discovered: false
---

# T01: Made `mesh-lsp` resolve manifest-first project roots and executable entries, fail closed with project diagnostics, and pin the override-entry contract with focused regression tests.

**Made `mesh-lsp` resolve manifest-first project roots and executable entries, fail closed with project diagnostics, and pin the override-entry contract with focused regression tests.**

## What Happened

Reworked `compiler/mesh-lsp/src/analysis.rs` so project analysis now distinguishes non-project documents from known-project failures, prefers the nearest `mesh.toml` root before falling back to a legacy root `main.mpl`, loads the manifest before graph construction, resolves the effective entrypoint through `mesh_pkg::manifest::resolve_entrypoint(...)`, and threads that entry path into overlay-backed project building. Updated module registration so only the resolved entry is marked executable while preserving D317: only project-root `main.mpl` keeps the `Main` module name and manifest-selected non-root entries remain path-derived. Added focused inline regression tests for manifest-first root discovery, override-only and override-precedence projects, legacy manifest-less projects, and fail-closed diagnostics for missing/invalid configured entrypoints.

## Verification

Ran the task-local `cargo test -p mesh-lsp -- --nocapture` rail and the full slice verification matrix. Passing rails: `cargo test -p meshc --test e2e_m048_s01 -- --nocapture`, `cargo test -p mesh-lsp -- --nocapture`, `cargo test -p meshc --test e2e_lsp -- --nocapture`, `node --test scripts/tests/verify-m036-s02-contract.test.mjs`, `npm --prefix tools/editors/vscode-mesh run test:smoke`, and `cargo test -p meshpkg -- --nocapture`. The Neovim verifier `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp` failed at preflight because the local `nvim` binary is unavailable, so editor-host verification is partially blocked by environment rather than code.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p meshc --test e2e_m048_s01 -- --nocapture` | 0 | ✅ pass | 40729ms |
| 2 | `cargo test -p mesh-lsp -- --nocapture` | 0 | ✅ pass | 4523ms |
| 3 | `cargo test -p meshc --test e2e_lsp -- --nocapture` | 0 | ✅ pass | 14131ms |
| 4 | `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp` | 1 | ❌ fail | 10632ms |
| 5 | `node --test scripts/tests/verify-m036-s02-contract.test.mjs` | 0 | ✅ pass | 1024ms |
| 6 | `npm --prefix tools/editors/vscode-mesh run test:smoke` | 0 | ✅ pass | 160209ms |
| 7 | `cargo test -p meshpkg -- --nocapture` | 0 | ✅ pass | 110833ms |


## Deviations

None.

## Known Issues

The local Neovim slice verifier failed at preflight because `nvim` is not installed in this environment; artifacts were written under `.tmp/m036-s02/lsp`.

## Files Created/Modified

- `compiler/mesh-lsp/src/analysis.rs`
- `.gsd/milestones/M048/slices/S02/tasks/T01-SUMMARY.md`


## Deviations
None.

## Known Issues
The local Neovim slice verifier failed at preflight because `nvim` is not installed in this environment; artifacts were written under `.tmp/m036-s02/lsp`.
