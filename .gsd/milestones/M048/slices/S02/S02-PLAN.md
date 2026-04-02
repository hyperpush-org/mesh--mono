# S02: Entrypoint-aware LSP, editors, and package surfaces

**Goal:** Make LSP, editor-host, and package-facing surfaces consume the S01 default-plus-override executable contract instead of independently hardcoding root `main.mpl`.
**Demo:** After this: After this: the same non-`main.mpl` project opens cleanly in LSP/editor flows and package/discovery surfaces stop treating root `main.mpl` as the only valid executable contract.

## Tasks
- [x] **T01: Made `mesh-lsp` resolve manifest-first project roots and executable entries, fail closed with project diagnostics, and pin the override-entry contract with focused regression tests.** — `mesh-lsp` is still the deepest hardcoded `main.mpl` consumer. Refactor `compiler/mesh-lsp/src/analysis.rs` so project-aware analysis prefers the nearest `mesh.toml`, resolves the effective entrypoint with `mesh_pkg::manifest::resolve_entrypoint(...)`, preserves D317 module naming for non-root entries, and emits truthful project diagnostics instead of silently dropping override-entry workspaces back to single-file analysis.
  - Estimate: 2h
  - Files: compiler/mesh-lsp/src/analysis.rs, compiler/mesh-pkg/src/manifest.rs
  - Verify: cargo test -p mesh-lsp -- --nocapture
- [x] **T02: Extended the retained `meshc lsp` JSON-RPC rail to prove override-entry projects through live diagnostics and nested-import hover.** — The slice needs one transport-level proof that exercises the real `meshc lsp` server rather than only unit tests inside `analysis.rs`. Reuse the S01 fixture shapes inside `compiler/meshc/tests/e2e_lsp.rs`, open an override-entry project through JSON-RPC, and pin clean diagnostics plus at least one semantic provider query that depends on project-aware imports/definitions.
  - Estimate: 90m
  - Files: compiler/meshc/tests/e2e_lsp.rs, compiler/meshc/tests/e2e_m048_s01.rs
  - Verify: cargo test -p meshc --test e2e_lsp -- --nocapture
- [x] **T03: Made the Neovim and VS Code editor-host proofs honor manifest-first Mesh roots, including override-entry smoke coverage.** — Even with a fixed server, editor hosts still lie if they keep `main.mpl` as the only root marker or never open override-entry workspaces in smoke. Update the Neovim pack to prefer `mesh.toml` roots, extend both Neovim and VS Code smoke to open one override-entry project cleanly, and sync the README/contract assertions to the new host behavior.
  - Estimate: 2h
  - Files: tools/editors/neovim-mesh/lua/mesh.lua, tools/editors/neovim-mesh/lsp/mesh.lua, tools/editors/neovim-mesh/tests/smoke.lua, tools/editors/neovim-mesh/README.md, scripts/tests/verify-m036-s02-contract.test.mjs, tools/editors/vscode-mesh/src/test/suite/extension.test.ts, tools/editors/vscode-mesh/src/test/runTest.ts
  - Verify: NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp && node --test scripts/tests/verify-m036-s02-contract.test.mjs && npm --prefix tools/editors/vscode-mesh run test:smoke
- [x] **T04: Made `meshpkg publish` archive nested Mesh source trees relative to project root and pinned the behavior with direct tarball-member regression tests.** — Package publishing is still the remaining package-surface hardcode. Replace `meshpkg publish`'s root-only `.mpl` plus `src/` tarball logic with a recursive project-root walk that matches Mesh source-discovery rules, preserves relative paths, excludes hidden/test-only content, and proves override-entry tarballs contain their real nested entry/support files.
  - Estimate: 90m
  - Files: compiler/meshpkg/src/publish.rs
  - Verify: cargo test -p meshpkg -- --nocapture
