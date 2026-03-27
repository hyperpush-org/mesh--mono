---
estimated_steps: 7
estimated_files: 6
skills_used:
  - rust-best-practices
  - powershell-windows
  - debug-like-expert
---

# T02: Make the Windows installed-compiler path target-aware and keep staged smoke diagnostics truthful

**Slice:** S10 — Hosted verification blocker remediation
**Milestone:** M034

## Description

Repair the Windows/MSVC runtime-library discovery and linker invocation path in the compiler, then update the staged smoke verifier and workflow contract so hosted Windows failures stay localizable instead of stopping at an empty build bundle.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Target-aware runtime lookup in `mesh-codegen` | Return a specific runtime-library discovery error naming the expected target/profile path instead of falling back to Unix assumptions. | Fail the build immediately; do not keep waiting on a nonexistent runtime artifact. | Reject unsupported/unknown target triples explicitly instead of emitting a broken linker command. |
| Hosted staged verifier / workflow contract | Keep the verifier red with preserved phase logs and contract failures rather than silently skipping the Windows build step. | Surface the first failing phase and log paths under `.tmp/m034-s03/`. | Treat missing staged archives, runtime artifacts, or log files as contract failures. |

## Load Profile

- **Shared resources**: release asset archives, target/debug runtime artifacts, staged `.tmp/m034-s03/` verifier tree, and hosted Windows runners.
- **Per-operation cost**: one runtime-library lookup, one linker invocation, one staged installer/build smoke replay.
- **10x breakpoint**: incorrect target/runtime naming or overly brittle verifier assumptions will fail every Windows smoke build on hosted runners, even when install/version checks pass.

## Negative Tests

- **Malformed inputs**: missing runtime archive, missing target-specific static library, unsupported target triple, and staged artifact trees missing expected binaries.
- **Error paths**: linker driver missing, runtime library lookup fails, or staged hello-build still exits non-zero with stdout/stderr capture preserved.
- **Boundary conditions**: debug vs release runtime preference, Windows MSVC artifact naming vs Unix `libmesh_rt.a`, and unchanged Unix/macOS linker behavior.

## Steps

1. Refactor `compiler/mesh-codegen/src/link.rs` so runtime-library discovery and linker arguments are target-aware, with an explicit Windows/MSVC branch and preserved Unix behavior.
2. Add a focused compiler-side regression around that target selection logic; keep it close to `link.rs` unless a small `meshc` integration test is the only way to assert the behavior honestly.
3. Update `scripts/verify-m034-s03.ps1` and any release-workflow contract text in `scripts/verify-m034-s02-workflows.sh` / `.github/workflows/release.yml` only as needed to match the repaired runtime path and to keep phase logs actionable.
4. Re-run the PowerShell helper regression and the workflow contract checker so the hosted smoke surface stays honest.

## Must-Haves

- [ ] Installed `meshc.exe` no longer assumes Unix linker/runtime naming on the Windows MSVC path.
- [ ] The compiler emits actionable runtime-library/linker errors if the Windows path regresses again.
- [ ] The staged Windows verifier and workflow contract still prove the real build step instead of skipping it.
- [ ] Unix/macOS runtime lookup behavior remains intact.

## Verification

- `cargo test -p mesh-codegen link -- --nocapture`
- `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`
- `bash scripts/verify-m034-s02-workflows.sh`

## Observability Impact

- Signals added/changed: runtime-library lookup errors and staged hello-build failures remain phase-scoped and target-specific.
- How a future agent inspects this: run the targeted `mesh-codegen` link tests and inspect `.tmp/m034-s03/windows/verify/run/07-hello-build.{stdout,stderr,log}` on verifier failure.
- Failure state exposed: missing Windows runtime artifacts, broken linker commands, and workflow-contract drift become explicit instead of collapsing into an empty hosted bundle.

## Inputs

- `compiler/mesh-codegen/src/link.rs` — current Unix-shaped linker/runtime lookup logic.
- `compiler/mesh-codegen/src/lib.rs` — entry points that call the linker helper.
- `scripts/verify-m034-s03.ps1` — staged Windows installer smoke verifier.
- `scripts/verify-m034-s02-workflows.sh` — workflow contract checker that still names Unix runtime assumptions.
- `.github/workflows/release.yml` — hosted release smoke workflow that must stay aligned with the verifier.
- `scripts/tests/verify-m034-s03-last-exitcode.ps1` — focused PowerShell helper regression that must keep passing.

## Expected Output

- `compiler/mesh-codegen/src/link.rs` — target-aware runtime-library discovery and linker behavior with regression coverage.
- `scripts/verify-m034-s03.ps1` — staged Windows verifier updated only as needed to match the repaired runtime path and preserve actionable diagnostics.
- `scripts/verify-m034-s02-workflows.sh` — release-workflow contract text aligned to the repaired Windows smoke behavior.
- `.github/workflows/release.yml` — updated only if the repaired verifier contract requires a truthful workflow wording or step-shape change.
- `scripts/tests/verify-m034-s03-last-exitcode.ps1` — retained or extended only if the verifier helper surface changes during the repair.
