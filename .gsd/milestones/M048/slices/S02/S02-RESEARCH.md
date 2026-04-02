# S02 Research — Entrypoint-aware LSP, editors, and package surfaces

**Researched:** 2026-04-02  
**Status:** Ready for planning

## Summary

S02 is a targeted follow-through slice on **R112**. S01 moved the executable contract to optional `[package].entrypoint`, but the remaining first-contact surfaces still drift:

1. `compiler/mesh-lsp/src/analysis.rs` still discovers project roots by ancestor `main.mpl`, duplicates discovery/module naming logic, and still marks only root `main.mpl` as the entry module.
2. The repo-owned **Neovim** pack still treats `main.mpl` as the root marker in code, docs, and smoke tests.
3. `meshpkg publish` still archives only root-level `.mpl` files plus `src/`, so override-entry projects rooted under `lib/` or any other nested directory publish incomplete tarballs.
4. The **VS Code** extension runtime is mostly fine, but its smoke proof only exercises `reference-backend/`; it never opens an override-entry project.

The smallest honest delivery is:
- make `mesh-lsp` consume the S01 manifest/entrypoint contract
- align Neovim root detection and proof to that server truth
- extend VS Code smoke with one override-entry case
- make `meshpkg publish` archive nested source trees instead of assuming root `main.mpl`

This slice directly advances **R112**. It does **not** own full syntax/skill parity under **R114**; that remains S04.

## Requirement Focus

### Primary
- **R112** — S02 closes the remaining executable-entry contract gaps across analyze/editor/package surfaces.

### Not owned here
- **R114** — editor grammar and init-skill parity are later slice work. S02 should avoid regressing those surfaces, but it does not need to solve them.

## Skill Notes

Relevant loaded-skill guidance that should shape implementation:

- From **`rust-best-practices`**:
  - prefer **small reusable seams** over one-off duplicated path logic
  - use `Result<T, E>` and `?` for fallible path/manifest operations; do not add new panic paths in production code
  - avoid unnecessary cloning while threading resolved paths/manifests through analysis
- From **`neovim`**:
  - keep native LSP config minimal and truthful around `cmd`, `filetypes`, and `root_markers`
  - keep root detection/filetype behavior aligned with the actual project contract, not stale editor folklore

## Skills Discovered

Installed because it is directly relevant to the VS Code portion of the slice:

- `s-hiraoku/vscode-sidebar-terminal@vscode-extension-expert` via `npx skills add s-hiraoku/vscode-sidebar-terminal@vscode-extension-expert -g -y`

Note: the installed skill did not become invokable through `Skill` in this session, so no additional guidance was pulled from it here.

## Implementation Landscape

### 1. `mesh-lsp` still hardcodes the old root/entry contract

Relevant file:
- `compiler/mesh-lsp/src/analysis.rs`

Current behavior:
- `analyze_project_document(...)` calls `find_project_root(&doc_path)` before reading the manifest.
- `find_project_root(...)` walks upward until it finds `current.join("main.mpl")`.
- `build_project_with_overlays(...)` duplicates project discovery and sets:
  - `is_entry = relative_path == Path::new("main.mpl")`
  - module name = `"Main"` only for that root file
- manifest parsing happens later, only for clustered diagnostics.

Why this matters:
- override-only projects (`mesh.toml` + `lib/start.mpl`, no root `main.mpl`) fall out of project-aware analysis entirely
- override-precedence projects can still analyze with the wrong file marked executable
- `mesh-lsp` is ignoring the S01 seam already shipped in `mesh_pkg::manifest::resolve_entrypoint(...)`

Useful existing seam from S01:
- `compiler/mesh-pkg/src/manifest.rs`
  - `DEFAULT_ENTRYPOINT`
  - `resolve_entrypoint(project_root, manifest)`

Recommended direction:
- load `mesh.toml` before project build when present
- resolve one effective entrypoint with `resolve_entrypoint(...)`
- mark only that file executable in `build_project_with_overlays(...)`
- preserve D317: only root `main.mpl` gets module name `Main`; a manifest-selected non-root entry stays path-derived
- root detection should prefer nearest `mesh.toml` ancestor, then fall back to nearest `main.mpl` ancestor for legacy manifest-less layouts

### 2. `mesh-lsp` already has good test seams, but no M048 override-entry proof

Relevant files:
- `compiler/mesh-lsp/src/analysis.rs` (inline unit tests)
- `compiler/meshc/tests/e2e_lsp.rs`
- `scripts/verify-m036-s02.sh`

What exists:
- `compiler/mesh-lsp/src/analysis.rs` already contains tempdir-backed unit tests for project-aware analysis.
- `cargo test -p mesh-lsp -- --list` currently shows only reference-backend/scoped-installed-package coverage around project discovery; no override-entry case.
- `compiler/meshc/tests/e2e_lsp.rs` is the existing JSON-RPC transport proof used by the Neovim verifier’s upstream-LSP phase.
- `scripts/verify-m036-s02.sh` already replays `cargo test -q -p meshc --test e2e_lsp -- --nocapture`.

Planning implication:
- add one focused `mesh-lsp` unit test for manifest-root + override-entry behavior
- add one override-entry JSON-RPC flow in `compiler/meshc/tests/e2e_lsp.rs`
- that automatically upgrades the retained Neovim proof wrapper without inventing a new verifier

### 3. Neovim bakes the stale root contract into runtime code, docs, and smoke

Relevant files:
- `tools/editors/neovim-mesh/lua/mesh.lua`
- `tools/editors/neovim-mesh/lsp/mesh.lua`
- `tools/editors/neovim-mesh/tests/smoke.lua`
- `tools/editors/neovim-mesh/README.md`
- `scripts/tests/verify-m036-s02-contract.test.mjs`

Current behavior:
- `lua/mesh.lua`: `M.root_markers = { 'main.mpl', '.git' }`
- `detect_root(...)` checks `main.mpl` upward, then `.git`, else single-file mode
- `lsp/mesh.lua` exports `root_markers = { 'main.mpl', '.git' }`
- README explicitly says workspace root prefers `main.mpl`
- smoke proves only:
  - real project reuse via `reference-backend`
  - standalone single-file mode
  - missing override-path diagnostics for the meshc binary

Why this matters:
- even after fixing `mesh-lsp`, Neovim can still attach with the wrong root for override-only projects if host-side root markers stay stale
- README + contract tests will fail if code changes without the wording changing too

Recommended direction:
- after server root detection is manifest-aware, change Neovim root preference to:
  1. `mesh.toml`
  2. `main.mpl`
  3. `.git`
- update smoke with an override-entry fixture that opens `lib/start.mpl` inside a temp project
- update README and `scripts/tests/verify-m036-s02-contract.test.mjs` in the same task

### 4. VS Code runtime is mostly fine; the gap is proof coverage

Relevant files:
- `tools/editors/vscode-mesh/src/extension.ts`
- `tools/editors/vscode-mesh/src/test/runTest.ts`
- `tools/editors/vscode-mesh/src/test/suite/extension.test.ts`

Current behavior:
- `extension.ts` only resolves `meshc` and launches `meshc lsp`; it does not hardcode `main.mpl` or editor-side root logic.
- smoke currently opens only:
  - `reference-backend/api/health.mpl`
  - `reference-backend/api/jobs.mpl`
- the workspace used by smoke is repo-root, with `mesh.lsp.path` pinned to repo-local `target/debug/meshc`.

Planning implication:
- likely **no extension architecture change** is needed for S02
- but to make editor-host proof truthful, smoke should open a temp override-entry fixture and assert clean diagnostics plus one hover/definition probe there too
- keep the fixture inside the smoke workspace or extend workspace setup accordingly

### 5. `meshpkg publish` is the package-surface bug

Relevant file:
- `compiler/meshpkg/src/publish.rs`

Current behavior in `create_tarball(...)`:
- archives `mesh.toml`
- archives only **root-level** `.mpl` files
- archives `src/` if present
- excludes `*.test.mpl` only at the root-level walk

Why this breaks S02:
- an override-entry project using `lib/start.mpl` and nested support modules publishes a tarball that omits its actual executable/support sources
- install/extract is already generic; the archive layout is the broken seam

Relevant existing source-discovery truth already in-repo:
- `compiler/meshc/src/discovery.rs::discover_mesh_files(...)`
- `compiler/mesh-lsp/src/analysis.rs::discover_mesh_files(...)`

Both already do the right conceptual thing:
- recursive walk
- skip hidden directories/files
- include `.mpl`
- exclude `*.test.mpl`

Recommended direction:
- make publish use the same recursive source-file contract instead of special-casing root `main.mpl` / root `.mpl`
- if extraction stays small, move the shared helper into `mesh-pkg` so `meshc`, `mesh-lsp`, and `meshpkg` stop drifting separately
- if extraction gets too noisy for this slice, at minimum mirror the same rules exactly and cover them with publish tests

### 6. S01 already left reusable fixture shapes

Relevant files:
- `compiler/meshc/tests/e2e_m048_s01.rs`
- `compiler/meshc/tests/tooling_e2e.rs`

Useful existing fixtures:
- override-precedence project with both root `main.mpl` and manifest-selected `lib/start.mpl`
- override-only project with only `lib/start.mpl`
- override-entry test project with nested support modules

Planning implication:
- reuse these shapes for LSP/editor/package tests instead of inventing new fixture contracts
- the expected outputs/messages are already pinned there

## Natural Task Seams

### Task 1 — LSP core contract

Primary file:
- `compiler/mesh-lsp/src/analysis.rs`

Work:
- make project-root detection manifest-aware
- load manifest early enough to resolve the effective entrypoint before building the graph
- mark the resolved entry file executable while preserving D317 module naming
- keep fallback behavior for legacy manifest-less `main.mpl` projects
- add focused inline unit tests

### Task 2 — Transport-level proof

Primary file:
- `compiler/meshc/tests/e2e_lsp.rs`

Work:
- add an override-entry JSON-RPC fixture
- prove at least clean diagnostics + one hover/definition path under `meshc lsp`
- this keeps `scripts/verify-m036-s02.sh` meaningful without new wrappers

### Task 3 — Editor-host alignment

Neovim files:
- `tools/editors/neovim-mesh/lua/mesh.lua`
- `tools/editors/neovim-mesh/lsp/mesh.lua`
- `tools/editors/neovim-mesh/tests/smoke.lua`
- `tools/editors/neovim-mesh/README.md`
- `scripts/tests/verify-m036-s02-contract.test.mjs`

VS Code files:
- `tools/editors/vscode-mesh/src/test/suite/extension.test.ts`
- maybe `tools/editors/vscode-mesh/src/test/runTest.ts` for fixture/context setup

Work:
- move Neovim root preference to manifest-aware markers
- extend Neovim smoke with override-entry proof
- extend VS Code smoke with one override-entry proof case
- keep README/contract assertions synchronized with runtime behavior

### Task 4 — Package publish surface

Primary file:
- `compiler/meshpkg/src/publish.rs`

Possible supporting file:
- `compiler/mesh-pkg` if a shared recursive source-file helper is extracted

Work:
- archive nested source trees, not just root `.mpl` + `src/`
- continue excluding `*.test.mpl`
- add first publish-specific tarball tests

## Risks / Watchouts

- **Order matters:** if Neovim root markers change before `mesh-lsp` understands manifest-root projects, host/server truth diverges.
- `analysis.rs` currently reads the manifest after project build. Any fix that needs entrypoint resolution during discovery must refactor that order cleanly.
- `discover_mesh_files(...)` and `path_to_module_name(...)` are duplicated between `meshc` and `mesh-lsp`. Leaving this untouched preserves future drift risk.
- `meshpkg publish` currently has **no publish-specific archive tests**. Without new tests, nested-source regressions stay invisible.
- Neovim README/contract tests currently assert `main.mpl` root preference. Code changes without docs/test updates will fail the public contract proof.
- VS Code smoke uses repo-root workspace and fixed reference-backend files; override-entry proof needs fixture placement that still falls inside that workspace.

## Recommendation

Keep S02 root-cause-first and reuse the S01 contract instead of inventing editor/package-local exceptions:

1. **Fix `mesh-lsp` first** so manifest-root + override-entry projects analyze correctly.
2. **Extend `e2e_lsp.rs`** so the retained upstream LSP proof covers the new contract.
3. **Then align Neovim** root markers/docs/smoke to the server truth.
4. **Extend VS Code smoke** with a single override-entry case rather than changing extension architecture.
5. **Fix `meshpkg publish`** to archive nested Mesh sources recursively and cover it with tarball tests.

Avoid:
- editor-only re-parsing of `mesh.toml` that bypasses `mesh_pkg::Manifest`
- hardcoded `lib/` special cases in publish logic
- a new bespoke verifier when `e2e_lsp` + existing M036 wrappers can absorb the proof

## Verification

Minimum credible proof set for the slice:

- `cargo test -p mesh-lsp -- --nocapture`
- `cargo test -p meshc --test e2e_lsp -- --nocapture`
- `cargo test -p meshpkg -- --nocapture`
- `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp`
- `npm --prefix tools/editors/vscode-mesh run test:smoke`

Stronger closeout if README/public-contract wording changes:

- `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh`
- `bash scripts/verify-m036-s03.sh`

Specific assertions worth pinning in new tests:
- override-only project with `mesh.toml` + `lib/start.mpl` and **no** root `main.mpl` opens cleanly in LSP/editor flows
- override-precedence project with both files marks only `lib/start.mpl` executable while keeping root `main.mpl` non-entry
- published tarball contains `lib/start.mpl` and nested support files, and excludes `*.test.mpl`
