---
id: T03
parent: S02
milestone: M048
provides: []
requires: []
affects: []
key_files: ["tools/editors/neovim-mesh/lua/mesh.lua", "tools/editors/neovim-mesh/lsp/mesh.lua", "tools/editors/neovim-mesh/tests/smoke.lua", "tools/editors/neovim-mesh/README.md", "scripts/tests/verify-m036-s02-contract.test.mjs", "tools/editors/vscode-mesh/src/test/suite/extension.test.ts", ".gsd/KNOWLEDGE.md", ".gsd/milestones/M048/slices/S02/tasks/T03-SUMMARY.md"]
key_decisions: ["Reused `mesh.root_markers` from the Neovim runtime inside `lsp/mesh.lua` so exported markers cannot drift from runtime detection order.", "Materialized the VS Code override-entry proof fixture under the retained smoke workspace so repo `.git` stays an ancestor while fixture-local `mesh.toml` still proves manifest-first root detection."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Ran `npm --prefix tools/editors/vscode-mesh run compile` as a typed preflight because this harness did not expose a TypeScript language server. Then reran the slice verification rails: `node --test scripts/tests/verify-m036-s02-contract.test.mjs` passed with the new runtime/doc synchronization checks, and `npm --prefix tools/editors/vscode-mesh run test:smoke` passed with override-entry diagnostics and hover proof recorded in `.tmp/m036-s03/vscode-smoke/smoke.log`. `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp` replayed the upstream `meshc` LSP rail successfully but stopped afterward at Neovim preflight because this environment lacks a local `nvim` binary."
completed_at: 2026-04-02T09:14:26.713Z
blocker_discovered: false
---

# T03: Made the Neovim and VS Code editor-host proofs honor manifest-first Mesh roots, including override-entry smoke coverage.

> Made the Neovim and VS Code editor-host proofs honor manifest-first Mesh roots, including override-entry smoke coverage.

## What Happened
---
id: T03
parent: S02
milestone: M048
key_files:
  - tools/editors/neovim-mesh/lua/mesh.lua
  - tools/editors/neovim-mesh/lsp/mesh.lua
  - tools/editors/neovim-mesh/tests/smoke.lua
  - tools/editors/neovim-mesh/README.md
  - scripts/tests/verify-m036-s02-contract.test.mjs
  - tools/editors/vscode-mesh/src/test/suite/extension.test.ts
  - .gsd/KNOWLEDGE.md
  - .gsd/milestones/M048/slices/S02/tasks/T03-SUMMARY.md
key_decisions:
  - Reused `mesh.root_markers` from the Neovim runtime inside `lsp/mesh.lua` so exported markers cannot drift from runtime detection order.
  - Materialized the VS Code override-entry proof fixture under the retained smoke workspace so repo `.git` stays an ancestor while fixture-local `mesh.toml` still proves manifest-first root detection.
duration: ""
verification_result: mixed
completed_at: 2026-04-02T09:14:26.715Z
blocker_discovered: false
---

# T03: Made the Neovim and VS Code editor-host proofs honor manifest-first Mesh roots, including override-entry smoke coverage.

**Made the Neovim and VS Code editor-host proofs honor manifest-first Mesh roots, including override-entry smoke coverage.**

## What Happened

Updated the repo-owned Neovim runtime so root detection now prefers `mesh.toml`, then `main.mpl`, then `.git`, while keeping honest single-file mode unchanged, and made the exported native LSP config reuse `mesh.root_markers` directly to prevent marker-order drift. Extended the headless Neovim smoke with a retained override-entry temp project under `.tmp/m036-s02/<phase>/override-entry-project`, asserted that `lib/start.mpl` resolves to the manifest root instead of the repo `.git`, logged the selected marker path, preserved the missing-override negative case, and strengthened LSP failure logging by emitting `vim.g.mesh_lsp_last_resolution`. Updated the Neovim README plus `scripts/tests/verify-m036-s02-contract.test.mjs` together so the public contract now documents manifest-first roots and the synchronized runtime/smoke expectations. Extended the VS Code smoke suite without changing extension architecture by materializing an override-entry project under `.tmp/m036-s03/vscode-smoke/workspace/override-entry-project`, opening both `lib/start.mpl` and `lib/support/message.mpl`, waiting for clean diagnostics, and proving semantic behavior with a hover on the imported nested helper while preserving the existing `reference-backend` hover/definition checks. Recorded the retained-workspace fixture placement gotcha in `.gsd/KNOWLEDGE.md` for future host work.

## Verification

Ran `npm --prefix tools/editors/vscode-mesh run compile` as a typed preflight because this harness did not expose a TypeScript language server. Then reran the slice verification rails: `node --test scripts/tests/verify-m036-s02-contract.test.mjs` passed with the new runtime/doc synchronization checks, and `npm --prefix tools/editors/vscode-mesh run test:smoke` passed with override-entry diagnostics and hover proof recorded in `.tmp/m036-s03/vscode-smoke/smoke.log`. `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp` replayed the upstream `meshc` LSP rail successfully but stopped afterward at Neovim preflight because this environment lacks a local `nvim` binary.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix tools/editors/vscode-mesh run compile` | 0 | ✅ pass | 5901ms |
| 2 | `node --test scripts/tests/verify-m036-s02-contract.test.mjs` | 0 | ✅ pass | 1135ms |
| 3 | `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp` | 1 | ❌ fail | 11091ms |
| 4 | `npm --prefix tools/editors/vscode-mesh run test:smoke` | 0 | ✅ pass | 84399ms |


## Deviations

None.

## Known Issues

This environment still does not provide a local `nvim` binary, so `scripts/verify-m036-s02.sh lsp` cannot execute the new headless Neovim smoke after the upstream LSP phase. The code-side contract and the VS Code host proof are green; direct Neovim execution remains environment-blocked.

## Files Created/Modified

- `tools/editors/neovim-mesh/lua/mesh.lua`
- `tools/editors/neovim-mesh/lsp/mesh.lua`
- `tools/editors/neovim-mesh/tests/smoke.lua`
- `tools/editors/neovim-mesh/README.md`
- `scripts/tests/verify-m036-s02-contract.test.mjs`
- `tools/editors/vscode-mesh/src/test/suite/extension.test.ts`
- `.gsd/KNOWLEDGE.md`
- `.gsd/milestones/M048/slices/S02/tasks/T03-SUMMARY.md`


## Deviations
None.

## Known Issues
This environment still does not provide a local `nvim` binary, so `scripts/verify-m036-s02.sh lsp` cannot execute the new headless Neovim smoke after the upstream LSP phase. The code-side contract and the VS Code host proof are green; direct Neovim execution remains environment-blocked.
