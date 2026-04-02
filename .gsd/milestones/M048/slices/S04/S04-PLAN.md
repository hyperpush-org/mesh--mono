# S04: Syntax and init-skill parity reset

**Goal:** Align official editor grammar and init-time Mesh skills with current syntax and runtime teaching truth.
**Demo:** After this: After this: VS Code and Vim highlight `@cluster` and both interpolation forms correctly, and the Mesh init-time skill bundle teaches the current clustered/runtime story instead of stale pre-reset guidance.

## Tasks
- [x] **T01: Added a shared `@cluster` fixture and decorator-only TextMate/Shiki parity checks without reserving bare `cluster`.** — Lock the shared editor grammar semantics before touching editor-specific syntax. Add one dedicated `scripts/fixtures/m048-s04-cluster-decorators.mpl` probe with `@cluster`, `@cluster(3)`, and a bare `cluster` negative case, then extend `website/scripts/tests/verify-m036-s01-syntax-parity.test.mjs` plus `tools/editors/vscode-mesh/syntaxes/mesh.tmLanguage.json` so decorator-position `cluster` is highlighted without globally reserving the identifier. Done when `bash scripts/verify-m036-s01.sh` proves TextMate/Shiki parity and the bare-identifier negative case stays green.
  - Estimate: 90m
  - Files: scripts/fixtures/m048-s04-cluster-decorators.mpl, website/scripts/tests/verify-m036-s01-syntax-parity.test.mjs, tools/editors/vscode-mesh/syntaxes/mesh.tmLanguage.json
  - Verify: `bash scripts/verify-m036-s01.sh`
- [x] **T02: Extended the Neovim syntax rail and contract docs to prove `@cluster` without reserving bare `cluster`.** — Carry the same decorator contract through the repo-owned Neovim pack without regressing S02’s manifest-first syntax rail. Update `tools/editors/neovim-mesh/syntax/mesh.vim`, extend `tools/editors/neovim-mesh/tests/smoke.lua` to probe the shared decorator fixture after the interpolation corpus loop, and keep `tools/editors/neovim-mesh/README.md` plus `scripts/tests/verify-m036-s02-contract.test.mjs` truthful about the bounded syntax surface. Done when headless Neovim reports `@cluster` / `@cluster(3)` correctly, bare `cluster` stays an identifier, and the documented verifier surface still matches reality.
  - Estimate: 90m
  - Files: tools/editors/neovim-mesh/syntax/mesh.vim, tools/editors/neovim-mesh/tests/smoke.lua, tools/editors/neovim-mesh/README.md, scripts/tests/verify-m036-s02-contract.test.mjs
  - Verify: `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh syntax`
`node --test scripts/tests/verify-m036-s02-contract.test.mjs`
- [x] **T03: Refreshed the Mesh init-time skill bundle with a dedicated clustering guide and a retained clustered-runtime contract test.** — Refresh the auto-loaded Mesh skill bundle so first-contact clustered guidance matches the current source-first runtime story. Add a dedicated clustering sub-skill, route the root skill plus syntax/http sub-skills through it, and add `scripts/tests/verify-m048-s04-skill-contract.test.mjs` so missing `@cluster`, `Node.start_from_env()`, scaffold commands, operator commands, or `HTTP.clustered(...)` guidance fails closed. Done when the skill contract test proves the cluster/runtime story is present across the exact files the init-time loader exposes.
  - Estimate: 2h
  - Files: tools/skill/mesh/SKILL.md, tools/skill/mesh/skills/clustering/SKILL.md, tools/skill/mesh/skills/syntax/SKILL.md, tools/skill/mesh/skills/http/SKILL.md, scripts/tests/verify-m048-s04-skill-contract.test.mjs
  - Verify: `node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs`
