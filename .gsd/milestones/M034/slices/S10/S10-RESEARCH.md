# S10 Research — Hosted verification blocker remediation

## Summary

S10 is a two-blocker slice with clean technical seams:

1. **`authoritative-verification.yml` is red because registry package-level `latest` can regress under concurrent publishes.**
   - Hosted evidence from `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log` shows the proof published `0.34.0-20260327191246-2503`, then immediately fetched package metadata and saw `package latest version drifted: '0.34.0-20260327191241-2432'`.
   - In the same hosted run, the version-specific metadata, versions list, search, download, and install steps had already succeeded. That means the new version existed and was consumable, but the package-level `latest` pointer had moved to another in-flight proof version.
   - The current implementation in `registry/src/db/packages.rs::insert_version(...)` upserts `packages.latest_version` **before** inserting the new `versions` row, with no ordering guard. Under overlapping publishes for the same package, whichever transaction updates the `packages` row last wins, even if its proof version is older.
   - Both `registry/src/routes/metadata.rs` and `registry/src/routes/search.rs` trust `packages.latest_version`, and `compiler/meshpkg/src/install.rs::resolve_latest(...)` depends on that value for named installs. This is not just a verifier flake; it is a real registry truth problem.

2. **`release.yml` is red because the installed Windows compiler path still fails at the staged smoke build.**
   - Hosted evidence from `.tmp/m034-s09/t06-blocker/23663179715-failed.log` shows Windows release smoke gets through install plus `meshc.exe --version` / `meshpkg.exe --version`, then fails at `installed meshc.exe build installer smoke fixture`.
   - The uploaded diagnostics artifact from that run is now unpacked under `.tmp/m034-s10/windows-artifact/unzipped/`. The failure bundle confirms the staged context (`target=x86_64-pc-windows-msvc`, prebuilt release assets, successful install/version checks) but the actual `07-hello-build.stdout` / `.stderr` are empty, so the hosted artifact currently preserves the failure point but not a useful compiler error message.
   - The likely root seam is `compiler/mesh-codegen/src/link.rs`, which is still Unix-shaped: it hardcodes `cc`, `-lm`, and a runtime library file named `libmesh_rt.a`, with no Windows-specific branch. `compiler/mesh-rt/Cargo.toml` only declares `crate-type = ["staticlib", "lib"]`; on MSVC the produced static runtime artifact is expected to be `.lib`, not `libmesh_rt.a`.
   - This explains why the hosted Windows smoke is the remaining blocker even after the PowerShell `$LASTEXITCODE` strict-mode fix landed. The verifier wrapper is no longer the root cause.

These blockers are independent enough to plan separately, but both must land before hosted rerun evidence can turn green on the current rollout SHA.

## Requirements Context

No active requirements were preloaded into this unit. This slice is operating against the milestone-level M034 trust contract, especially the hosted proof portions behind the already-planned S10/S11 roadmap split.

## Skills Discovered

Existing relevant installed skills were sufficient; no new skills needed installation.

- `debug-like-expert` — used for the read-only, evidence-first blocker analysis. Relevant rule: verify actual behavior before proposing fixes; do not mask symptoms.
- `github-workflows` — relevant because both blockers surface through GitHub Actions workflows and hosted artifact evidence, not just local scripts.
- `powershell-windows` — relevant because the remaining release blocker is in the PowerShell/Windows staged installer path.

## Recommendation

Treat S10 as three execution tasks, in this order:

1. **Fix registry `latest` semantics at the source and add a real regression surface.**
   Do not “solve” this by adding sleeps or retries to `scripts/verify-m034-s01.sh`. The hosted run already proves the published version exists; the broken surface is the registry’s package-level latest pointer.

2. **Fix Windows compiler/link portability in `mesh-codegen`, then update the Windows staged smoke proof around the repaired behavior.**
   Do not keep iterating on PowerShell wrapper behavior first. The hosted failure happens after install and version checks; the remaining issue is the installed compiler’s ability to build a Mesh project on MSVC.

3. **Only after both local regressions exist, refresh hosted evidence on the current rollout SHA.**
   S10’s demo is hosted-green lanes on the current rollout SHA, not just local script passes. Any outward GitHub rerun/dispatch/ref-move step is an external action and will require explicit user confirmation at execution time.

## Implementation Landscape

### A. Registry `latest` drift blocker

**Files involved**
- `.github/workflows/authoritative-verification.yml` — thin caller workflow for the live proof.
- `.github/workflows/authoritative-live-proof.yml` — reusable hosted proof job that shells out to `bash scripts/verify-m034-s01.sh`.
- `scripts/verify-m034-s01.sh` — authoritative S01 verifier; currently asserts package metadata `latest.version == PROOF_VERSION` immediately after publish.
- `registry/src/routes/publish.rs` — handles authenticated publish requests.
- `registry/src/db/packages.rs` — persists package/version state; current `insert_version(...)` implementation is the likely race source.
- `registry/src/routes/metadata.rs` — serves package metadata from `packages.latest_version`.
- `registry/src/routes/search.rs` — search/list output also exposes `latest_version` from `packages`.
- `compiler/meshpkg/src/install.rs` — named install resolves from package-level `latest`.

**What exists now**
- Package metadata and search results are driven by a denormalized `packages.latest_version` text column.
- `insert_version(...)` currently:
  1. upserts the `packages` row with `latest_version = EXCLUDED.latest_version`
  2. inserts the new version row
  3. commits
- There are no visible registry tests covering overlapping publishes or validating that `latest` cannot regress when multiple proof runs publish the same package concurrently.

**Why this is risky**
- The hosted log proves the exact failure shape: the newly published version was already readable via version-specific endpoints, but package metadata returned another version as latest.
- That can break both the proof lane and real named-install consumers, because `resolve_latest(...)` trusts the package metadata endpoint.

**Natural task seam**
- Keep this task inside the registry and package-manager truth boundary. The likely files are `registry/src/db/packages.rs`, possibly `registry/src/routes/{metadata,search}.rs`, and a new regression surface in the registry crate.
- If a schema or migration change is needed, it belongs to `registry/migrations/` and must be treated as part of the fix, not as a follow-up.

**Good fix direction**
- Make `latest` derivation stable under overlapping publishes. The fix should converge to the correct latest package state even when multiple publishes for the same package overlap.
- Prefer a source-of-truth design that computes or updates `latest` from committed version data with an explicit ordering rule, rather than trusting the last writer to touch the `packages` row.
- Ensure search and package metadata stay aligned after the fix; they currently share the same denormalized source.

**Bad fix direction**
- Do **not** add blind retry/sleep logic to `scripts/verify-m034-s01.sh` first.
- Do **not** weaken the `latest` assertion to accept stale package metadata while version-specific endpoints pass; that would hide a real consumer-facing inconsistency.

### B. Windows installed-compiler smoke blocker

**Files involved**
- `.github/workflows/release.yml` — hosted release smoke lane; Windows `verify-release-assets` job runs the PowerShell staged verifier.
- `scripts/verify-m034-s03.ps1` — staged Windows installer verifier; current failure point is `07-hello-build` after successful install/version checks.
- `website/docs/public/install.ps1` — canonical Windows installer used by the verifier.
- `compiler/mesh-codegen/src/link.rs` — linker/runtime-library discovery helper; currently Unix-shaped.
- `compiler/mesh-rt/Cargo.toml` — runtime crate type declaration.
- `compiler/meshc/src/main.rs` — build command calls into `mesh_codegen::compile_mir_to_binary(..., None)` and therefore relies on the auto-detect path in `link.rs`.

**What exists now**
- Hosted artifact `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/04-install-good.log` proves install succeeds.
- Hosted artifact `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/05-meshc-version.log` proves the installed compiler launches and reports the expected version.
- The first actual build of Mesh source on Windows fails, but the captured stdout/stderr are empty, so the current hosted diagnostics localize the phase but not the exact compiler message.
- `link.rs` assumes:
  - runtime file name `libmesh_rt.a`
  - linker driver `cc`
  - Unix-ish `-lm`
  - no Windows-specific runtime filename or linker command handling

**Why this is risky**
- This is the first real proof that release assets produce a working installed compiler on Windows. If it stays red, `release.yml` cannot be considered honest.
- The current workflow contract checker (`scripts/verify-m034-s02-workflows.sh`) still encodes the wording “build mesh-rt so the staged smoke can find libmesh_rt.a”, which is already suspicious on MSVC.

**Natural task seam**
- Keep the root fix in compiler/linker code, not in the PowerShell wrapper.
- Then update the Windows smoke verification and, if needed, its workflow contract wording/tests to match the repaired compiler behavior.
- Consider a small observability improvement in `scripts/verify-m034-s03.ps1` if the repaired path can still fail with empty captured output; the current artifact quality is poor for the exact failing build step.

**Good fix direction**
- Add platform-aware runtime library discovery and linker invocation in `compiler/mesh-codegen/src/link.rs` for `x86_64-pc-windows-msvc`.
- Preserve the existing Unix behavior; only split where the platform actually differs.
- Add a regression surface that exercises the installed/build path or the linker helper semantics closely enough that Windows portability does not regress silently again.

**Bad fix direction**
- Do **not** keep iterating on `$LASTEXITCODE` handling. That bug is already retired.
- Do **not** paper over the issue by special-casing the verifier to skip the build step; the slice demo explicitly requires a green installed-compiler smoke on Windows.

### C. Cross-cutting hosted evidence seam

**Files involved**
- `scripts/verify-m034-s05.sh` — canonical assembly wrapper; S10 success must unblock stop-after `remote-evidence` on the current rollout SHA.
- `.tmp/m034-s05/verify/remote-runs.json` — freshness-aware hosted run artifact.
- `.tmp/m034-s09/rollout/workflow-status.json` — S09 blocker snapshot.
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log` — current authoritative blocker evidence.
- `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/07-hello-build.log` — current release-smoke blocker artifact.

**What exists now**
- Freshness is already solved. S09 made `main`, `v0.1.0`, and `ext-v0.3.0` point at the current rollout SHA and taught remote-evidence to compare `headSha` truthfully.
- The remaining blockers are real workflow failures on the correct SHA, not stale-hosted drift.

**Execution constraint**
- Refreshing hosted GitHub evidence after local fixes is an external action. Under the repo’s GSD rules, rerun/dispatch/ref mutation needs explicit user confirmation at execution time.

## Suggested Task Split

### T01 — Registry latest ordering repair
**Goal:** Make package metadata/search/named-install latest semantics stable under overlapping publishes.

**Likely files**
- `registry/src/db/packages.rs`
- `registry/src/routes/metadata.rs`
- `registry/src/routes/search.rs`
- `registry/migrations/*` (only if schema support is required)
- new/updated registry tests

**Proof**
- A targeted registry regression that reproduces or directly guards the concurrent/latest behavior.
- Existing authoritative proof helpers still pass locally after the fix.

### T02 — Windows installed-compiler portability repair
**Goal:** Make the installed Windows release asset able to build the staged smoke fixture truthfully.

**Likely files**
- `compiler/mesh-codegen/src/link.rs`
- possibly a targeted compiler/linker regression test
- `scripts/verify-m034-s03.ps1` only if diagnostic quality or verifier assumptions need to track the repaired compiler behavior
- `scripts/verify-m034-s02-workflows.sh` only if contract wording about `libmesh_rt.a` becomes inaccurate after the real fix

**Proof**
- A local regression surface for the Windows/MSVC runtime-link path.
- Hosted Windows release-smoke rerun goes green on the current rollout SHA.

### T03 — Hosted evidence refresh on current rollout SHA
**Goal:** Re-run the two remaining hosted lanes and refresh the local blocker/evidence bundle.

**Likely files / artifacts**
- `.tmp/m034-s05/verify/remote-runs.json`
- `.tmp/m034-s09/rollout/workflow-status.json`
- refreshed hosted failure or success logs under `.tmp/`

**Proof**
- `authoritative-verification.yml` green on current rollout SHA
- `release.yml` green on current rollout SHA
- `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` exits 0

## Verification Plan

### Local blocker-specific verification

**Registry latest repair**
- Add and run a targeted registry regression that proves `latest` cannot regress under overlapping publishes for the same package.
- Re-run the existing local script contracts that must remain thin/truthful:
  - `bash scripts/tests/verify-m034-s01-fetch-retry.sh`
  - `bash scripts/verify-m034-s02-workflows.sh`
- If the registry fix changes search/metadata behavior, verify both package metadata and search outputs, because both read `latest_version` today.

**Windows linker/runtime repair**
- Add and run a targeted regression for the Windows/MSVC runtime library discovery/link path.
- Keep the existing PowerShell regression in place:
  - `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`
- Re-run the workflow contract checker if the staged smoke contract wording changes:
  - `bash scripts/verify-m034-s02-workflows.sh`

### Hosted proof refresh

After both local regressions exist and pass, refresh hosted evidence on the current rollout SHA and then verify:

- `gh run list -R snowdamiz/mesh-lang --workflow authoritative-verification.yml --limit 1 --json databaseId,status,conclusion,headSha,url`
- `gh run list -R snowdamiz/mesh-lang --workflow release.yml --limit 1 --json databaseId,status,conclusion,headSha,url`
- `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh`

If those go green, S10 is done and S11 can take over first-green archival plus full assembly replay.

## Risks / Notes for the Planner

- **Do not spend time on freshness again.** S09 already solved the stale-ref problem; the red state is now truthful.
- **Do not let S10 sprawl into S11.** S10 ends when the two hosted blocker lanes are green and the blocker artifacts are refreshed. First-green archival and full S05 replay belong to S11.
- **The working tree is not clean outside `.gsd/`.** There is an unrelated dirty file reported in the resume briefing (`mesher/landing/tmp-banners/actor-model.html`). Keep execution scoped to S10-owned files.
- **The current hosted Windows diagnostics are weak.** If the root fix is cheap but the error surface stays opaque, add durable diagnostics while you are in the verifier path. Future hosted failures should not stop at an empty `07-hello-build` bundle.

## Sources

Repo evidence read during this unit:
- `.gsd/milestones/M034/slices/S10/S10-PLAN.md`
- `.gsd/PROJECT.md`
- `.gsd/KNOWLEDGE.md`
- `.github/workflows/authoritative-verification.yml`
- `.github/workflows/authoritative-live-proof.yml`
- `.github/workflows/release.yml`
- `scripts/verify-m034-s01.sh`
- `scripts/verify-m034-s03.ps1`
- `scripts/verify-m034-s05.sh`
- `scripts/verify-m034-s02-workflows.sh`
- `registry/src/db/packages.rs`
- `registry/src/routes/publish.rs`
- `registry/src/routes/metadata.rs`
- `registry/src/routes/search.rs`
- `registry/migrations/20260228000001_initial.sql`
- `compiler/meshpkg/src/install.rs`
- `compiler/mesh-codegen/src/link.rs`
- `compiler/mesh-rt/Cargo.toml`
- `compiler/meshc/src/main.rs`
- `compiler/meshc/tests/e2e_m034_s01.rs`
- `.tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log`
- `.tmp/m034-s09/t06-blocker/23663179715-failed.log`
- `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/00-context.log`
- `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/04-install-good.log`
- `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/05-meshc-version.log`
- `.tmp/m034-s10/windows-artifact/unzipped/windows/verify/run/07-hello-build.log`

Additional live read-only evidence pulled during research:
- GitHub Actions artifacts API for run `23663179715`, specifically artifact `release-smoke-x86_64-pc-windows-msvc-diagnostics` (downloaded read-only into `.tmp/m034-s10/windows-artifact/`)
