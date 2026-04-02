---
estimated_steps: 4
estimated_files: 7
skills_used:
  - neovim
  - test
  - best-practices
---

# T03: Align Neovim and VS Code host proof with manifest-first root detection

**Slice:** S02 — Entrypoint-aware LSP, editors, and package surfaces
**Milestone:** M048

## Description

The repo-owned editor hosts are still carrying stale assumptions even where the server runtime is mostly fine. Neovim still treats root `main.mpl` as the preferred workspace marker in runtime code, docs, and smoke. VS Code mostly just launches `meshc lsp`, but its smoke proof never opens an override-entry project, so it does not currently prove the updated contract.

This task keeps the fixes host-truthful and bounded. Neovim should prefer `mesh.toml`, then `main.mpl`, then `.git`, while still supporting honest single-file mode. VS Code should keep its current runtime architecture but extend smoke coverage with one override-entry project. The public Neovim README and contract assertions must change in the same task so the repo stops documenting the stale root-marker contract.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Neovim root detection and LSP attach flow | Fail the headless smoke with the detected marker/root path and last resolution state instead of silently attaching to repo root. | Time out the attach case with the buffer path and `vim.g.mesh_lsp_last_error` preserved in the log. | Treat missing or wrong root markers as contract failure, not as a tolerable fallback. |
| VS Code smoke harness and extension provider commands | Fail the smoke with the opened file path and provider result instead of masking the problem behind activation success. | Abort the suite with the phase label and log file path so the retained smoke artifacts stay inspectable. | Treat empty or wrong hover/definition targets as provider-contract failures. |
| README / contract test synchronization | Fail `scripts/tests/verify-m036-s02-contract.test.mjs` if docs or verifier expectations lag behind runtime behavior. | N/A for local doc assertions. | Treat missing manifest-first wording as stale public contract, not as documentation drift to ignore later. |

## Load Profile

- **Shared resources**: one headless Neovim instance, one VS Code Extension Development Host, repo-root workspace fixtures, and retained smoke logs.
- **Per-operation cost**: one extra override-entry fixture open per host plus diagnostics and one semantic provider query.
- **10x breakpoint**: editor-host startup and attach timing fail first, so the task must preserve phase-local logs and host-specific resolution state instead of broadening the verifier surface.

## Negative Tests

- **Malformed inputs**: override-entry project with no root `main.mpl`, missing `mesh.toml`, or a missing override `meshc` binary path.
- **Error paths**: Neovim attaches to `.git` or repo root instead of the manifest root, VS Code opens the override-entry file but still publishes import diagnostics, or docs keep claiming root `main.mpl` is the preferred marker.
- **Boundary conditions**: honest single-file attach remains intact, manifest-first root detection beats nearby `.git`, and repo-root VS Code smoke still works while opening a temp override-entry fixture under the workspace.

## Steps

1. Update `tools/editors/neovim-mesh/lua/mesh.lua` and `tools/editors/neovim-mesh/lsp/mesh.lua` so root detection and advertised root markers prefer `mesh.toml`, then `main.mpl`, then `.git`, while keeping single-file fallback unchanged.
2. Extend `tools/editors/neovim-mesh/tests/smoke.lua` with one override-entry temp-project case that opens `lib/start.mpl`, asserts the detected root/marker, and keeps the missing-override negative case intact.
3. Update `tools/editors/neovim-mesh/README.md` and `scripts/tests/verify-m036-s02-contract.test.mjs` in the same task so the documented/public contract matches the runtime behavior exactly.
4. Extend `tools/editors/vscode-mesh/src/test/suite/extension.test.ts` — and `tools/editors/vscode-mesh/src/test/runTest.ts` only if fixture/workspace setup needs it — so the smoke suite opens one override-entry project, waits for clean diagnostics, and checks one semantic provider query there.

## Must-Haves

- [ ] Neovim runtime and exported root markers prefer `mesh.toml`, then `main.mpl`, then `.git`, while preserving single-file mode.
- [ ] Headless Neovim smoke proves an override-entry project opens with the correct root marker/path and clean LSP attach behavior.
- [ ] VS Code smoke opens at least one override-entry project and proves clean diagnostics plus one semantic provider query without rewriting extension architecture.
- [ ] README and contract tests stop claiming root `main.mpl` is the only preferred workspace marker.

## Verification

- `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp`
- `node --test scripts/tests/verify-m036-s02-contract.test.mjs`
- `npm --prefix tools/editors/vscode-mesh run test:smoke`

## Observability Impact

- Signals added/changed: Neovim smoke logs now expose the selected root marker/path for override-entry cases, and VS Code smoke logs include the override-entry file, diagnostics wait, and provider probe results.
- How a future agent inspects this: inspect `.tmp/m036-s02/` for Neovim runs and `.tmp/m036-s03/vscode-smoke/` for VS Code smoke artifacts.
- Failure state exposed: wrong root marker, attach timeout, stale README contract text, or provider drift should each point to the specific host-side phase that broke.

## Inputs

- `tools/editors/neovim-mesh/lua/mesh.lua` — current Neovim root detection still prefers root `main.mpl`.
- `tools/editors/neovim-mesh/lsp/mesh.lua` — exported root markers that must match runtime detection.
- `tools/editors/neovim-mesh/tests/smoke.lua` — headless Neovim LSP proof that currently only covers `reference-backend/` plus standalone mode.
- `tools/editors/neovim-mesh/README.md` — public Neovim contract text that still documents root `main.mpl` preference.
- `scripts/tests/verify-m036-s02-contract.test.mjs` — repo contract assertions that must change in lockstep with README/runtime behavior.
- `tools/editors/vscode-mesh/src/test/suite/extension.test.ts` — VS Code smoke suite that currently opens only `reference-backend/` files.
- `tools/editors/vscode-mesh/src/test/runTest.ts` — workspace and fixture bootstrap for the Extension Development Host smoke run.
- `compiler/meshc/tests/e2e_lsp.rs` — upstream LSP proof rail this host work should remain aligned with.

## Expected Output

- `tools/editors/neovim-mesh/lua/mesh.lua` — manifest-first root detection for the Neovim host runtime.
- `tools/editors/neovim-mesh/lsp/mesh.lua` — root markers exported in the same manifest-first order.
- `tools/editors/neovim-mesh/tests/smoke.lua` — override-entry Neovim smoke coverage with truthful root assertions.
- `tools/editors/neovim-mesh/README.md` — updated public contract text for manifest-first root detection.
- `scripts/tests/verify-m036-s02-contract.test.mjs` — contract assertions synchronized with the new README/runtime behavior.
- `tools/editors/vscode-mesh/src/test/suite/extension.test.ts` — VS Code smoke coverage for an override-entry project.
- `tools/editors/vscode-mesh/src/test/runTest.ts` — any minimal fixture/bootstrap updates needed to make the override-entry smoke case run inside the existing workspace.
