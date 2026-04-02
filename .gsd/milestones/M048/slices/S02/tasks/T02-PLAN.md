---
estimated_steps: 4
estimated_files: 4
skills_used:
  - rust-testing
  - debug-like-expert
---

# T02: Extend the retained `meshc lsp` JSON-RPC proof to cover override-entry projects

**Slice:** S02 — Entrypoint-aware LSP, editors, and package surfaces
**Milestone:** M048

## Description

`compiler/meshc/tests/e2e_lsp.rs` is the retained transport-level proof for `meshc lsp`, but today it only opens `reference-backend/` files. That leaves a gap between a fixed `analysis.rs` implementation and the real JSON-RPC server/editor path.

This task adds one honest override-entry proof to the existing rail instead of inventing a bespoke verifier. Reuse the S01 fixture shapes so the test materializes a temp project with `mesh.toml`, `lib/start.mpl`, and nested support modules, then exercises the live JSON-RPC transport with `didOpen`, diagnostics, and at least one semantic provider call that depends on project-aware imports/definitions.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Spawned `meshc lsp` child process in `compiler/meshc/tests/e2e_lsp.rs` | Fail the test with captured stdout/stderr and fixture paths instead of masking the server startup failure behind client-side assertions. | Abort the rail with the timed-out phase name and preserve the last server output. | Treat malformed JSON-RPC payloads as proof failure, not as partial success. |
| Override-entry fixture materialization | Refuse to run the proof if the fixture is missing its configured entry file or nested support module. | N/A for local tempdir setup. | Reject invalid relative fixture paths or malformed project layouts before the server boots. |
| `publishDiagnostics`/provider responses over JSON-RPC | Fail with the URI, phase, and raw response when diagnostics or semantic provider shapes drift. | Time out per request/notification phase instead of hanging the whole verifier. | Treat empty or mismatched provider targets as contract failures, not as inconclusive results. |

## Load Profile

- **Shared resources**: one live `meshc lsp` child process, JSON-RPC request/notification buffers, and temp-project filesystem state.
- **Per-operation cost**: initialize + didOpen for one extra project, one diagnostics wait, and one semantic provider request.
- **10x breakpoint**: request/notification synchronization and fixture startup cost fail before CPU does, so the rail must keep phase-local timeout reporting and readable raw output.

## Negative Tests

- **Malformed inputs**: missing configured entry file, malformed fixture file paths, and invalid JSON-RPC responses from the child process.
- **Error paths**: override-entry project publishes bogus import diagnostics, hover/definition fails to resolve across the nested project graph, or the server exits early.
- **Boundary conditions**: override-only project with no root `main.mpl`, override-precedence project with both entry files present, and a semantic provider query anchored in a nested module.

## Steps

1. Reuse or lightly extract the S01 temp-project fixture patterns so `compiler/meshc/tests/e2e_lsp.rs` can materialize one override-entry project with `mesh.toml`, `lib/start.mpl`, and nested support modules.
2. Extend the JSON-RPC rail to `didOpen` the override-entry files and assert clean diagnostics instead of fallback import failures.
3. Add at least one semantic provider assertion — hover, definition, or signature help — that proves the live LSP server understands the nested override-entry module graph.
4. Keep the proof inside `compiler/meshc/tests/e2e_lsp.rs` so `scripts/verify-m036-s02.sh lsp` automatically absorbs the new contract without a new wrapper.

## Must-Haves

- [ ] The retained `meshc lsp` JSON-RPC rail opens at least one override-entry temp project, not just `reference-backend/`.
- [ ] The override-entry project proves clean diagnostics through the live server path, not only through inline `analysis.rs` unit tests.
- [ ] At least one semantic provider assertion crosses the nested override-entry graph and proves server-side import/definition truth.
- [ ] Failures retain enough phase/URI/output context that `scripts/verify-m036-s02.sh lsp` remains the first debugging surface.

## Verification

- `cargo test -p meshc --test e2e_lsp -- --nocapture`
- The override-entry JSON-RPC case inside `compiler/meshc/tests/e2e_lsp.rs` proves clean diagnostics plus at least one semantic provider response on a project with `mesh.toml` + `lib/start.mpl`.

## Observability Impact

- Signals added/changed: the LSP rail now logs which override-entry URI opened, which diagnostics phase failed, and which provider response drifted.
- How a future agent inspects this: rerun `cargo test -p meshc --test e2e_lsp -- --nocapture` or `NEOVIM_BIN="${NEOVIM_BIN:-nvim}" bash scripts/verify-m036-s02.sh lsp`.
- Failure state exposed: the rail should retain enough request/response context to tell whether the breakage is startup, diagnostics publication, or semantic-provider resolution.

## Inputs

- `compiler/meshc/tests/e2e_lsp.rs` — current retained JSON-RPC proof rail that only covers `reference-backend/` today.
- `compiler/meshc/tests/e2e_m048_s01.rs` — existing override-entry fixture shapes and fail-closed temp-project materialization patterns worth reusing.
- `compiler/mesh-lsp/src/analysis.rs` — server-side project-analysis behavior this rail must prove through transport rather than by unit test only.
- `scripts/verify-m036-s02.sh` — existing upstream-LSP verifier phase that should absorb the new case without a new wrapper.

## Expected Output

- `compiler/meshc/tests/e2e_lsp.rs` — extended JSON-RPC acceptance rail covering an override-entry project with diagnostics and semantic-provider assertions.
