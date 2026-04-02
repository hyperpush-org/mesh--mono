---
estimated_steps: 4
estimated_files: 4
skills_used:
  - rust-best-practices
  - rust-testing
---

# T04: Make `meshpkg publish` archive nested Mesh source trees instead of root-only executables

**Slice:** S02 — Entrypoint-aware LSP, editors, and package surfaces
**Milestone:** M048

## Description

`compiler/meshpkg/src/publish.rs` still archives `mesh.toml`, root-level `.mpl` files, and `src/` only. That means an override-entry package rooted at `lib/start.mpl` publishes an incomplete tarball even though build, test, and editor flows can now understand the project correctly.

This task closes the package surface by replacing the root-only publish assumption with a recursive project-root walk that matches Mesh source-discovery rules: include non-hidden `.mpl` files, preserve relative paths, exclude `*.test.mpl`, and do not special-case `lib/` or any other directory name. Keep install/extract behavior unchanged; the bug is in archive selection, not the rest of the package pipeline.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Recursive filesystem walk during tarball creation | Fail the publish command with the path that could not be read instead of silently producing a partial tarball. | N/A for local filesystem traversal. | Reject paths that cannot be normalized or preserved relative to the project root instead of archiving ambiguous entries. |
| Tarball assembly in `compiler/meshpkg/src/publish.rs` | Abort publish/test with the member that failed to archive instead of emitting a misleading success hash. | N/A for in-memory tarball creation. | Treat malformed or duplicate archive member names as packaging failures. |
| Source-selection contract drift versus Mesh discovery rules | Fail tests that inspect tarball members instead of allowing publish to reintroduce root-only assumptions. | N/A for local test assertions. | Treat hidden/test-only or missing nested entry files as contract failures, not as acceptable omissions. |

## Load Profile

- **Shared resources**: project filesystem walk, in-memory tarball buffer, and SHA-256 hash over the final archive bytes.
- **Per-operation cost**: one recursive directory walk, one append per archived source file, and one full hash pass.
- **10x breakpoint**: large package trees will amplify redundant path filtering and archive writes first, so the walker should filter hidden/test-only content before archiving.

## Negative Tests

- **Malformed inputs**: unreadable nested directories, non-UTF8-ish member-name edge cases if encountered, and duplicate relative paths.
- **Error paths**: override-entry project omits `lib/start.mpl`, hidden directories accidentally leak into the tarball, or `*.test.mpl` files still archive.
- **Boundary conditions**: override-only package with no root `main.mpl`, override-precedence package with both entry files present, and nested support modules under directories other than `src/`.

## Steps

1. Replace the root-only `.mpl` plus `src/` selection logic in `compiler/meshpkg/src/publish.rs` with a recursive project-root walk that mirrors Mesh source-discovery rules for non-hidden `.mpl` sources.
2. Preserve archive member names relative to project root, always include `mesh.toml`, and continue excluding hidden paths and `*.test.mpl` files.
3. Add publish-specific tarball membership tests that materialize an override-entry project and assert `lib/start.mpl` plus nested support modules are present while hidden/test-only files are absent.
4. Keep the change bounded to publish/archive selection; do not widen the task into install/extract or registry protocol work.

## Must-Haves

- [ ] `meshpkg publish` archives nested Mesh source files relative to project root instead of only root-level `.mpl` plus `src/`.
- [ ] Override-entry packages include `lib/start.mpl` and nested support modules in the tarball without any `lib/`-specific hack.
- [ ] Hidden paths and `*.test.mpl` files remain excluded from published tarballs.
- [ ] Publish-specific tests inspect tarball members directly so the archive contract stays pinned.

## Verification

- `cargo test -p meshpkg -- --nocapture`
- Tarball membership tests in `compiler/meshpkg/src/publish.rs` prove override-entry projects publish nested source trees and still exclude hidden/test-only content.

## Observability Impact

- Signals added/changed: publish tests should report the actual archive member list when inclusion/exclusion rules drift.
- How a future agent inspects this: rerun `cargo test -p meshpkg -- --nocapture` and inspect the tarball-member assertions in `compiler/meshpkg/src/publish.rs`.
- Failure state exposed: missing nested entry files or unexpected hidden/test-only members should be visible as concrete archive member names.

## Inputs

- `compiler/meshpkg/src/publish.rs` — current tarball creation logic that only archives root-level `.mpl` files plus `src/`.
- `compiler/meshc/src/discovery.rs` — current Mesh source-discovery rules worth mirroring for recursive `.mpl` inclusion and `*.test.mpl` exclusion.
- `compiler/mesh-lsp/src/analysis.rs` — another in-repo walker using the same recursive source-file contract, useful for keeping behavior aligned.
- `compiler/meshc/tests/e2e_m048_s01.rs` — existing override-entry fixture shapes that demonstrate the package layouts this task must support.

## Expected Output

- `compiler/meshpkg/src/publish.rs` — recursive publish tarball selection plus publish-specific tarball membership regression tests.
