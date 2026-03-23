# S03: Daily-Driver Tooling Trust

**Goal:** Raise the `reference-backend/` developer workflow from “the tooling mostly exists” to “the tooling is trustworthy on the real backend path” by fixing the formatter panic, making `meshc test` truthful on backend-shaped projects, proving live LSP behavior over JSON-RPC, and syncing docs/editor guidance to the verified command surface.
**Demo:** `meshc fmt --check reference-backend`, `meshc test reference-backend`, and a real `meshc lsp` JSON-RPC regression suite all pass against backend-shaped files, while the public/backend/editor docs describe those verified commands and an honest coverage contract instead of stale or stubbed behavior.

## Must-Haves

- S03 directly advances **R006** by making formatter, diagnostics, LSP, test-runner, and coverage behavior credible on `reference-backend/` instead of only on tiny fixtures.
- `meshc fmt --check reference-backend` must stop panicking, and the shared formatter path used by LSP formatting must stay mechanically covered by regressions.
- `meshc test` must support the documented project-directory workflow on `reference-backend/`, `reference-backend/` must contain at least one real `*.test.mpl` file, and `--coverage` must stop succeeding as a no-op placeholder.
- Real `meshc lsp` JSON-RPC proof must exercise backend-shaped files for diagnostics, navigation/hover, and formatting plus at least one assist surface so editor trust does not rest only on unit tests or `--help` output.
- S03 supports **R008** by updating `README.md`, backend docs, website docs, and VS Code extension docs/install instructions to the verified command and feature truth.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `cargo test -p mesh-fmt -- --nocapture`
- `cargo test -p meshc --test e2e_fmt -- --nocapture`
- `cargo run -p meshc -- fmt --check reference-backend`
- `cargo run -p meshc -- test reference-backend`
- `! cargo run -p meshc -- test --coverage reference-backend`
- `cargo test -p meshc --test tooling_e2e -- --nocapture`
- `cargo test -p meshc --test e2e_lsp -- --nocapture`
- `cargo test -p mesh-lsp -- --nocapture`

## Observability / Diagnostics

- Runtime signals: formatter exits cleanly instead of panicking, test-runner output distinguishes passing backend tests from unsupported coverage requests, and LSP request/response assertions capture diagnostics plus formatting/navigation behavior at the JSON-RPC boundary.
- Inspection surfaces: `compiler/meshc/tests/e2e_fmt.rs`, `compiler/meshc/tests/tooling_e2e.rs`, `compiler/meshc/tests/e2e_lsp.rs`, `cargo run -p meshc -- fmt --check reference-backend`, and `cargo run -p meshc -- test reference-backend`.
- Failure visibility: formatter regressions fail with the backend file path instead of an overflow panic, coverage truth fails with an explicit unsupported/implemented contract instead of a green stub, and LSP transport mismatches fail with named request/response assertions.
- Redaction constraints: do not print secrets or `DATABASE_URL`; tooling proof should stay on source paths, diagnostics, command output, and safe editor/runtime metadata.

## Integration Closure

- Upstream surfaces consumed: `reference-backend/`, `compiler/mesh-fmt`, `compiler/meshc`, `compiler/mesh-lsp`, `tools/editors/vscode-mesh`, `README.md`, and `website/docs/docs/*`.
- New wiring introduced in this slice: backend-shaped formatter/test/LSP regressions, a real `reference-backend/tests/` Mesh test path, and command-level docs/editor instructions tied to the same verified backend workflow.
- What remains before the milestone is truly usable end-to-end: S04 native deployment proof, S05 supervision/recovery proof, and S06 final documentation/proof promotion; any future deep line-level coverage instrumentation beyond the honest S03 contract can land later without blocking this slice’s trust bar.

## Tasks

- [x] **T01: Harden formatter and format-on-save on the reference backend** `est:90m`
  - Why: The highest-confidence live trust breaker is `meshc fmt --check reference-backend` panicking on `reference-backend/api/health.mpl`, and the same formatter path is reused by LSP formatting.
  - Files: `compiler/mesh-fmt/src/printer.rs`, `compiler/mesh-fmt/src/lib.rs`, `compiler/meshc/tests/e2e_fmt.rs`, `compiler/meshc/tests/tooling_e2e.rs`, `reference-backend/api/health.mpl`
  - Do: Reproduce the overflow against the real backend file, fix the flat-width/group-fit logic so `Hardline`/overflow cases choose broken rendering instead of panicking, add formatter regressions anchored to the backend reproducer or a reduced equivalent, and keep the shared `mesh_fmt::format_source(...)` path safe for later LSP transport proof.
  - Verify: `cargo test -p mesh-fmt -- --nocapture && cargo test -p meshc --test e2e_fmt -- --nocapture && cargo run -p meshc -- fmt --check reference-backend`
  - Done when: formatting the reference backend no longer panics, the fix is protected by automated regressions, and a future formatter/LSP change would fail mechanically before reintroducing the overflow.
- [x] **T02: Make `meshc test` truthful for `reference-backend` and coverage reporting** `est:2h`
  - Why: The documented daily workflow (`meshc test .` / project-dir invocation) is false today, `reference-backend/` has no Mesh-native tests, and `--coverage` still exits green with a placeholder message.
  - Files: `compiler/meshc/src/main.rs`, `compiler/meshc/src/test_runner.rs`, `compiler/meshc/tests/tooling_e2e.rs`, `reference-backend/tests/config.test.mpl`, `reference-backend/README.md`
  - Do: Teach `meshc test` to accept a project/directory target without regressing specific-file mode, add at least one backend-native Mesh test under `reference-backend/tests/`, replace the green `--coverage` stub with an explicit honest contract, extend tooling e2e coverage for directory invocation + backend test execution + coverage behavior, and update the backend README to the verified workflow.
  - Verify: `cargo run -p meshc -- test --help && cargo run -p meshc -- test reference-backend && cargo test -p meshc --test tooling_e2e -- --nocapture`
  - Done when: `meshc test reference-backend` works as a real backend workflow, `reference-backend/` contains a passing Mesh test file, and coverage behavior is explicit and mechanically tested instead of silently succeeding.
- [ ] **T03: Add backend-shaped JSON-RPC LSP integration proof** `est:2h`
  - Why: Repo-level LSP proof is currently shallow; unit tests pass and `meshc lsp --help` exists, but there is no transport-level evidence that a real editor session works on backend-shaped code.
  - Files: `compiler/meshc/tests/e2e_lsp.rs`, `compiler/mesh-lsp/src/server.rs`, `compiler/mesh-lsp/src/analysis.rs`, `reference-backend/api/health.mpl`, `reference-backend/api/jobs.mpl`
  - Do: Create a Rust JSON-RPC harness that spawns `meshc lsp`, drives initialize/open/request/format flows against backend-shaped files, assert diagnostics plus hover/definition and formatting along with one assist surface such as completion or signature help, and fix any backend-shaped transport bug the harness exposes instead of narrowing the proof to toy snippets.
  - Verify: `cargo test -p mesh-lsp -- --nocapture && cargo test -p meshc --test e2e_lsp -- --nocapture`
  - Done when: a real `meshc lsp` process is mechanically proven against backend-shaped sources and formatting/navigation assist requests no longer depend on unit tests or help-text smoke checks for credibility.
- [ ] **T04: Sync docs and editor instructions to the verified tooling contract** `est:90m`
  - Why: S03 only helps R008 if public docs/examples/editor guidance stop advertising stale commands, stale VSIX versions, and unsupported coverage claims after the code path is fixed.
  - Files: `README.md`, `website/docs/docs/tooling/index.md`, `website/docs/docs/testing/index.md`, `website/docs/docs/cheatsheet/index.md`, `tools/editors/vscode-mesh/README.md`, `reference-backend/README.md`
  - Do: Update docs to the verified command truth (`meshc init`, `meshc fmt`, `meshc test reference-backend`, honest coverage wording, current VSIX/install command), align LSP/editor feature docs with the transport proof and extension metadata, and remove stale toy-only or placeholder wording that overstates the backend/tooling story.
  - Verify: `cargo run -p meshc -- fmt --check reference-backend && cargo run -p meshc -- test reference-backend && cargo test -p meshc --test e2e_lsp -- --nocapture && ! rg -n "meshc new|mesh fmt|meshc test \\.|mesh-lang-0\.1\.0\.vsix|Coverage reporting is available as a stub" README.md website/docs/docs/tooling/index.md website/docs/docs/testing/index.md website/docs/docs/cheatsheet/index.md tools/editors/vscode-mesh/README.md reference-backend/README.md`
  - Done when: every changed doc/example/editor instruction describes a command or feature that already passed elsewhere in this slice, and the known stale strings are gone from the public/backend/editor surfaces.

## Files Likely Touched

- `compiler/mesh-fmt/src/printer.rs`
- `compiler/mesh-fmt/src/lib.rs`
- `compiler/meshc/src/main.rs`
- `compiler/meshc/src/test_runner.rs`
- `compiler/meshc/tests/e2e_fmt.rs`
- `compiler/meshc/tests/tooling_e2e.rs`
- `compiler/meshc/tests/e2e_lsp.rs`
- `compiler/mesh-lsp/src/server.rs`
- `compiler/mesh-lsp/src/analysis.rs`
- `reference-backend/tests/config.test.mpl`
- `reference-backend/README.md`
- `README.md`
- `website/docs/docs/tooling/index.md`
- `website/docs/docs/testing/index.md`
- `website/docs/docs/cheatsheet/index.md`
- `tools/editors/vscode-mesh/README.md`
