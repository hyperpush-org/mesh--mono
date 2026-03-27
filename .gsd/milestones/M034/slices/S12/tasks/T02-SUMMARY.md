---
id: T02
parent: S12
milestone: M034
provides: []
requires: []
affects: []
key_files: ["compiler/mesh-codegen/src/link.rs", "compiler/mesh-codegen/src/lib.rs", "compiler/meshc/src/main.rs", "compiler/meshc/tests/e2e_m034_s12.rs", "scripts/verify-m034-s03.ps1", "scripts/tests/verify-m034-s03-installed-build.ps1", ".tmp/m034-s12/t02/verification-results.json", ".tmp/m034-s12/t02/local-repair-summary.json", ".gsd/milestones/M034/slices/S12/tasks/T02-SUMMARY.md", ".gsd/KNOWLEDGE.md"]
key_decisions: ["D110: preflight installed-compiler runtime and Windows clang resolution before LLVM object emission, while the Windows staged verifier exports repo-root `target/` through `CARGO_TARGET_DIR`.", "Keep `MESH_RT_LIB_PATH` as an explicit regression/operator override while the verifier’s normal handshake stays on `CARGO_TARGET_DIR` rather than hardcoding a single runtime file path."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Passed `cargo test -p mesh-codegen link -- --nocapture`, `cargo test -p meshc --test e2e_m034_s12 -- --nocapture`, `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`, `pwsh -NoProfile -File scripts/tests/verify-m034-s03-installed-build.ps1`, and `bash scripts/verify-m034-s02-workflows.sh`. Also wrote `.tmp/m034-s12/t02/verification-results.json` and `.tmp/m034-s12/t02/local-repair-summary.json` capturing the exact commands, durations, and diagnostic artifact paths."
completed_at: 2026-03-27T23:47:46.683Z
blocker_discovered: false
---

# T02: Preflighted Windows link prerequisites and made the staged verifier export `CARGO_TARGET_DIR`.

> Preflighted Windows link prerequisites and made the staged verifier export `CARGO_TARGET_DIR`.

## What Happened
---
id: T02
parent: S12
milestone: M034
key_files:
  - compiler/mesh-codegen/src/link.rs
  - compiler/mesh-codegen/src/lib.rs
  - compiler/meshc/src/main.rs
  - compiler/meshc/tests/e2e_m034_s12.rs
  - scripts/verify-m034-s03.ps1
  - scripts/tests/verify-m034-s03-installed-build.ps1
  - .tmp/m034-s12/t02/verification-results.json
  - .tmp/m034-s12/t02/local-repair-summary.json
  - .gsd/milestones/M034/slices/S12/tasks/T02-SUMMARY.md
  - .gsd/KNOWLEDGE.md
key_decisions:
  - D110: preflight installed-compiler runtime and Windows clang resolution before LLVM object emission, while the Windows staged verifier exports repo-root `target/` through `CARGO_TARGET_DIR`.
  - Keep `MESH_RT_LIB_PATH` as an explicit regression/operator override while the verifier’s normal handshake stays on `CARGO_TARGET_DIR` rather than hardcoding a single runtime file path.
duration: ""
verification_result: passed
completed_at: 2026-03-27T23:47:46.686Z
blocker_discovered: false
---

# T02: Preflighted Windows link prerequisites and made the staged verifier export `CARGO_TARGET_DIR`.

**Preflighted Windows link prerequisites and made the staged verifier export `CARGO_TARGET_DIR`.**

## What Happened

Moved runtime and Windows clang prerequisite resolution ahead of LLVM object emission in `mesh-codegen`, added an explicit `MESH_RT_LIB_PATH` override for installed-compiler regressions, extended build traces with `meshRtLibPath`, and updated the Windows staged verifier to export and restore repo-root `CARGO_TARGET_DIR` before invoking installed `meshc.exe build`. Expanded the Rust and PowerShell regressions to prove happy-path tracing, missing-runtime preflight, bad-Windows-LLVM-prefix preflight, and verifier env shaping, then wrote `.tmp/m034-s12/t02/local-repair-summary.json` with the repaired boundary and artifacts.

## Verification

Passed `cargo test -p mesh-codegen link -- --nocapture`, `cargo test -p meshc --test e2e_m034_s12 -- --nocapture`, `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`, `pwsh -NoProfile -File scripts/tests/verify-m034-s03-installed-build.ps1`, and `bash scripts/verify-m034-s02-workflows.sh`. Also wrote `.tmp/m034-s12/t02/verification-results.json` and `.tmp/m034-s12/t02/local-repair-summary.json` capturing the exact commands, durations, and diagnostic artifact paths.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p mesh-codegen link -- --nocapture` | 0 | ✅ pass | 1213ms |
| 2 | `cargo test -p meshc --test e2e_m034_s12 -- --nocapture` | 0 | ✅ pass | 6574ms |
| 3 | `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1` | 0 | ✅ pass | 2691ms |
| 4 | `pwsh -NoProfile -File scripts/tests/verify-m034-s03-installed-build.ps1` | 0 | ✅ pass | 2490ms |
| 5 | `bash scripts/verify-m034-s02-workflows.sh` | 0 | ✅ pass | 1050ms |


## Deviations

None.

## Known Issues

The archived hosted Windows artifact at `.tmp/m034-s11/t03/diag-download/windows/verify/run/07-hello-build.log` is still pre-trace evidence only. A fresh hosted rerun in T03 is still required to replace that old access-violation bundle with live post-repair proof.

## Files Created/Modified

- `compiler/mesh-codegen/src/link.rs`
- `compiler/mesh-codegen/src/lib.rs`
- `compiler/meshc/src/main.rs`
- `compiler/meshc/tests/e2e_m034_s12.rs`
- `scripts/verify-m034-s03.ps1`
- `scripts/tests/verify-m034-s03-installed-build.ps1`
- `.tmp/m034-s12/t02/verification-results.json`
- `.tmp/m034-s12/t02/local-repair-summary.json`
- `.gsd/milestones/M034/slices/S12/tasks/T02-SUMMARY.md`
- `.gsd/KNOWLEDGE.md`


## Deviations
None.

## Known Issues
The archived hosted Windows artifact at `.tmp/m034-s11/t03/diag-download/windows/verify/run/07-hello-build.log` is still pre-trace evidence only. A fresh hosted rerun in T03 is still required to replace that old access-violation bundle with live post-repair proof.
