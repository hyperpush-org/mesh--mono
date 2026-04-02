# S01: Configurable entrypoint in compiler and test discovery — UAT

**Milestone:** M048
**Written:** 2026-04-02T07:36:07.965Z

# S01 UAT — Configurable entrypoint in compiler and test discovery

## Preconditions
1. Run from the repo root: `/Users/sn0w/Documents/dev/mesh-lang`.
2. Rust/Cargo toolchain is available and can build the workspace.
3. No special environment variables are required for these checks.

## Test Case 1 — Root `main.mpl` remains the default executable entrypoint
1. Run:
   ```bash
   cargo test -p meshc --test e2e_m048_s01 m048_s01_default_control_build_and_run_keep_root_main_behavior -- --nocapture
   ```
2. Expected outcome:
   - The test target runs exactly the named case and passes.
   - The compiled fixture prints `proof=default-control label=default-support`.
   - Retained artifacts exist under `.tmp/m048-s01/default-control-build-and-run/`.

## Test Case 2 — Manifest override wins when both root and non-root entry files exist
1. Run:
   ```bash
   cargo test -p meshc --test e2e_m048_s01 m048_s01_override_precedence_build_and_run_prefers_manifest_entrypoint -- --nocapture
   ```
2. Expected outcome:
   - The test passes.
   - Fixture stdout contains `proof=override-wins label=override-app`.
   - Fixture stdout does **not** contain `proof=root-main-should-not-run`.
   - Retained artifacts exist under `.tmp/m048-s01/override-precedence-build-and-run/`.

## Test Case 3 — Override-only projects build and run without a root `main.mpl`
1. Run:
   ```bash
   cargo test -p meshc --test e2e_m048_s01 m048_s01_override_only_build_and_run_succeeds_without_root_main -- --nocapture
   ```
2. Expected outcome:
   - The test passes.
   - Fixture stdout contains `proof=override-only-build label=nested-support`.
   - The project does not require a root `main.mpl` file to build successfully.

## Test Case 4 — `meshc test <project-dir>` honors the resolved executable contract
1. Run:
   ```bash
   cargo test -p meshc --test e2e_m048_s01 m048_s01_meshc_test_project_dir_target_honors_override_entrypoint_contract -- --nocapture
   ```
2. Expected outcome:
   - The test passes.
   - `meshc test` executes the override-entry fixture instead of a zero-proof run.
   - Output contains `proof=override-test answer=42 label=override-tests-support`.
   - Output reports `1 passed`.

## Test Case 5 — `meshc test <tests-dir>` and `<specific-file>` both honor the same resolved entrypoint
1. Run:
   ```bash
   cargo test -p meshc --test e2e_m048_s01 m048_s01_meshc_test_tests_dir_target_honors_override_entrypoint_contract -- --nocapture
   cargo test -p meshc --test e2e_m048_s01 m048_s01_meshc_test_specific_file_target_honors_override_entrypoint_contract -- --nocapture
   ```
2. Expected outcome for both commands:
   - The named case passes.
   - Output contains `proof=override-test answer=42 label=override-tests-support`.
   - Output reports `1 passed`.
   - The specific-file path does not drift back to repo CWD or the wrong project root.

## Edge Case 6 — Orphan `*.test.mpl` targets fail closed instead of falling back silently
1. Run:
   ```bash
   cargo test -p meshc --test tooling_e2e test_test_specific_file_target_fails_closed_when_no_project_root_exists -- --nocapture
   ```
2. Expected outcome:
   - The Rust test passes because the underlying CLI invocation fails in the intended way.
   - Captured stderr from the nested `meshc test` call contains `Could not resolve a Mesh project root` and the orphan file path.
   - No fallback execution from repo CWD occurs.

## Full Acceptance Replay — Assembled slice contract
1. Run:
   ```bash
   cargo test -p mesh-pkg entrypoint -- --nocapture
   cargo test -p meshc build_project_ -- --nocapture
   cargo test -p meshc --test tooling_e2e test_test_ -- --nocapture
   cargo test -p meshc --test e2e_m048_s01 -- --nocapture
   cargo test -p mesh-codegen merge_mir_modules_prefers_entry_module_mesh_main_when_multiple_modules_define_main -- --nocapture
   ```
2. Expected outcome:
   - All commands exit 0.
   - The acceptance target reports the full scenario set passing.
   - `.tmp/m048-s01/` contains retained project snapshots and command logs for post-failure inspection if a later regression appears.

