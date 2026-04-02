---
estimated_steps: 4
estimated_files: 4
skills_used:
  - rust-best-practices
  - rust-testing
---

# T01: Make `mesh-lsp` resolve project roots and executable entries from manifest-first discovery

**Slice:** S02 — Entrypoint-aware LSP, editors, and package surfaces
**Milestone:** M048

## Description

`compiler/mesh-lsp/src/analysis.rs` still treats an ancestor `main.mpl` as the only project marker, loads `mesh.toml` after project build, and marks only root `main.mpl` as executable. That means override-only projects fall out of project-aware analysis entirely, and override-precedence projects can still analyze with the wrong file marked executable.

This task closes the server-side root cause before any editor-host work. Rework `analysis.rs` so it prefers the nearest `mesh.toml`, falls back to the nearest `main.mpl` only for legacy manifest-less layouts, resolves the effective executable entry through `mesh_pkg::manifest::resolve_entrypoint(...)`, and preserves D317: only root `main.mpl` keeps the special `Main` module name while manifest-selected non-root entries stay path-derived. Once a project root is known, broken manifest or entrypoint state should surface as project diagnostics instead of silently drifting back to single-file analysis.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Manifest parsing and entry resolution via `mesh_pkg::manifest::resolve_entrypoint(...)` | Emit a project diagnostic that names the bad entry path or manifest error instead of silently analyzing the buffer in isolated mode. | N/A for local manifest reads. | Reject invalid, absolute, escaping, blank, or missing configured entrypaths exactly as the shared manifest seam defines them. |
| Project-root detection in `compiler/mesh-lsp/src/analysis.rs` | Prefer the nearest truthful root and stop if neither `mesh.toml` nor legacy `main.mpl` exists instead of drifting to repo CWD. | N/A for local filesystem checks. | Treat impossible root/relative-path combinations as project-analysis failures, not as success cases. |
| Overlay-backed graph construction in `build_project_with_overlays(...)` | Return a project diagnostic that points to the entry/discovery failure instead of reusing stale module-graph truth. | N/A for in-process analysis. | Reject impossible resolved entry paths before module naming or import resolution runs. |

## Load Profile

- **Shared resources**: project filesystem walk, in-memory overlay map, module graph, and parse/type-check passes for open documents.
- **Per-operation cost**: one root search, optional manifest parse, one entrypoint resolution, and one project discovery walk per project-aware analyze call.
- **10x breakpoint**: repeated root walking and redundant path normalization across large workspaces will become the first cost center, so the task should resolve the root and effective entry once and thread those values through analysis.

## Negative Tests

- **Malformed inputs**: `mesh.toml` with blank/absolute/escaping entrypoints, missing configured entry files, and malformed manifest syntax.
- **Error paths**: override-only project with no root `main.mpl`, override-precedence project with both entry files present, and a broken configured entry that must report a project diagnostic instead of a false-green single-file result.
- **Boundary conditions**: legacy manifest-less root `main.mpl` project, root `main.mpl` explicitly chosen through manifest, and a nested non-root entry that must stay path-derived instead of becoming `Main`.

## Steps

1. Refactor `find_project_root(...)` and the project-analysis entry flow in `compiler/mesh-lsp/src/analysis.rs` to prefer the nearest `mesh.toml`, then fall back to the nearest ancestor `main.mpl` only when no manifest exists.
2. Load the manifest before graph construction, resolve the effective entrypoint with `mesh_pkg::manifest::resolve_entrypoint(...)`, and thread that relative path into `build_project_with_overlays(...)` instead of hardcoding root `main.mpl` as the only executable.
3. Preserve D317 inside module construction: only root `main.mpl` gets the `Main` module name; manifest-selected non-root entries stay path-derived while still marked executable.
4. Add focused inline tests in `analysis.rs` for override-only, override-precedence, legacy manifest-less, and invalid-entry project shapes, including one case that proves project diagnostics fail closed instead of collapsing to isolated single-file analysis.

## Must-Haves

- [ ] Project-aware analysis finds the nearest `mesh.toml` root before checking for legacy root `main.mpl`.
- [ ] `mesh-lsp` resolves the effective executable entry with `mesh_pkg::manifest::resolve_entrypoint(...)` before building the project graph.
- [ ] Only the resolved entry file is marked executable, while non-root entries remain path-derived modules per D317.
- [ ] Broken manifest or entrypoint state surfaces as project diagnostics instead of a false-green single-file fallback.

## Verification

- `cargo test -p mesh-lsp -- --nocapture`
- Open-document override-entry tests in `compiler/mesh-lsp/src/analysis.rs` prove clean diagnostics for valid projects and fail-closed diagnostics for broken configured entries.

## Observability Impact

- Signals added/changed: project diagnostics now distinguish invalid entrypoints, missing configured files, and root-detection failures from ordinary parse/type errors.
- How a future agent inspects this: rerun `cargo test -p mesh-lsp -- --nocapture` and inspect the named override-entry tests in `compiler/mesh-lsp/src/analysis.rs`.
- Failure state exposed: the failing diagnostic should name the resolved entry path or the project root that could not be constructed.

## Inputs

- `compiler/mesh-lsp/src/analysis.rs` — current manifest-late project analysis, root detection, and module-entry assumptions that still hardcode root `main.mpl`.
- `compiler/mesh-pkg/src/manifest.rs` — shared S01 resolver seam and validation rules this task must reuse rather than duplicating.
- `compiler/meshc/src/discovery.rs` — current compiler-side source of truth for D317-style entry marking and non-root module naming.
- `compiler/meshc/tests/e2e_m048_s01.rs` — fixture shapes and acceptance expectations for default, override-only, and override-precedence entrypoint projects.

## Expected Output

- `compiler/mesh-lsp/src/analysis.rs` — manifest-first project-root discovery, entry-aware overlay graph construction, fail-closed project diagnostics, and override-entry regression tests.
