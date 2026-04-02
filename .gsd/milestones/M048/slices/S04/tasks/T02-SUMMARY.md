---
id: T02
parent: S04
milestone: M048
provides: []
requires: []
affects: []
key_files: ["tools/editors/neovim-mesh/syntax/mesh.vim", "tools/editors/neovim-mesh/tests/smoke.lua", "tools/editors/neovim-mesh/README.md", "scripts/tests/verify-m036-s02-contract.test.mjs", ".gsd/KNOWLEDGE.md"]
key_decisions: ["Kept the decorator token on a dedicated `meshClusterDecorator` group while leaving the counted arity in `@cluster(3)` on the existing `meshNumberInteger` path.", "Made the bounded Neovim proof surface explicit as interpolation corpus plus the shared `scripts/fixtures/m048-s04-cluster-decorators.mpl` oracle."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "`NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh syntax` passed and proved the interpolation corpus plus shared `@cluster` fixture probes. `node --test scripts/tests/verify-m036-s02-contract.test.mjs` passed and confirmed the README/runtime/smoke contract stayed synchronized."
completed_at: 2026-04-02T17:40:21.922Z
blocker_discovered: false
---

# T02: Extended the Neovim syntax rail and contract docs to prove `@cluster` without reserving bare `cluster`.

> Extended the Neovim syntax rail and contract docs to prove `@cluster` without reserving bare `cluster`.

## What Happened
---
id: T02
parent: S04
milestone: M048
key_files:
  - tools/editors/neovim-mesh/syntax/mesh.vim
  - tools/editors/neovim-mesh/tests/smoke.lua
  - tools/editors/neovim-mesh/README.md
  - scripts/tests/verify-m036-s02-contract.test.mjs
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Kept the decorator token on a dedicated `meshClusterDecorator` group while leaving the counted arity in `@cluster(3)` on the existing `meshNumberInteger` path.
  - Made the bounded Neovim proof surface explicit as interpolation corpus plus the shared `scripts/fixtures/m048-s04-cluster-decorators.mpl` oracle.
duration: ""
verification_result: passed
completed_at: 2026-04-02T17:40:21.923Z
blocker_discovered: false
---

# T02: Extended the Neovim syntax rail and contract docs to prove `@cluster` without reserving bare `cluster`.

**Extended the Neovim syntax rail and contract docs to prove `@cluster` without reserving bare `cluster`.**

## What Happened

Updated the repo-owned Neovim classic syntax file so `@cluster` is highlighted specially while bare `cluster` remains an identifier and the counted arity in `@cluster(3)` stays on the ordinary integer path. Extended the headless Neovim smoke to open the shared `scripts/fixtures/m048-s04-cluster-decorators.mpl` fixture after the interpolation corpus loop, verify decorator sigil/name/count plus the bare-identifier negative case, and emit exact probe names with line/column `names_text(...)` synstack output on drift. Updated the Neovim README and docs/runtime contract test so the bounded proof surface is described truthfully as interpolation corpus plus shared `@cluster` decorator fixture coverage.

## Verification

`NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh syntax` passed and proved the interpolation corpus plus shared `@cluster` fixture probes. `node --test scripts/tests/verify-m036-s02-contract.test.mjs` passed and confirmed the README/runtime/smoke contract stayed synchronized.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh syntax` | 0 | ✅ pass | 2321ms |
| 2 | `node --test scripts/tests/verify-m036-s02-contract.test.mjs` | 0 | ✅ pass | 2097ms |


## Deviations

Kept the counted arity in `@cluster(3)` on the existing `meshNumberInteger` group instead of inventing a separate decorator-count scope. The task contract only required truthful decorator-token special-casing plus a bounded proof surface, so the smoke now asserts the count as a normal integer and the decorator token as the special case.

## Known Issues

None in the T02 Neovim syntax/documentation surface. Slice S04 still has the separate Mesh init-time skill-bundle refresh work queued in T03.

## Files Created/Modified

- `tools/editors/neovim-mesh/syntax/mesh.vim`
- `tools/editors/neovim-mesh/tests/smoke.lua`
- `tools/editors/neovim-mesh/README.md`
- `scripts/tests/verify-m036-s02-contract.test.mjs`
- `.gsd/KNOWLEDGE.md`


## Deviations
Kept the counted arity in `@cluster(3)` on the existing `meshNumberInteger` group instead of inventing a separate decorator-count scope. The task contract only required truthful decorator-token special-casing plus a bounded proof surface, so the smoke now asserts the count as a normal integer and the decorator token as the special case.

## Known Issues
None in the T02 Neovim syntax/documentation surface. Slice S04 still has the separate Mesh init-time skill-bundle refresh work queued in T03.
