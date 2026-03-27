# S10: Hosted verification blocker remediation

**Goal:** Repair the two remaining truthful hosted blockers on the current rollout SHA by fixing registry latest-version ordering at the source, making the installed Windows compiler/runtime link path MSVC-safe, and then refreshing hosted evidence on that same SHA.
**Demo:** After this: `authoritative-verification.yml` and `release.yml` are green on the current rollout SHA, with blocker artifacts and local regressions updated to match the repaired hosted behavior.

## Tasks
- [x] **T01: Recomputed registry latest-version state from committed version rows and added metadata/search regression coverage for monotonic latest semantics.** — Repair the registry source of truth so overlapping publishes for the same package cannot move package-level `latest` metadata backward, then prove the metadata and search surfaces stay aligned with the committed newest version.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| PostgreSQL package/version writes | Fail the publish path closed and keep the prior committed `latest` state intact instead of partially updating package metadata. | Abort the transaction and surface a DB error rather than guessing a winner. | Reject the write/read path and preserve the last valid committed state. |
| Registry metadata/search queries | Return an explicit handler error rather than fabricating an empty or stale latest version. | Fail the request and keep tests red until query consistency is restored. | Treat missing latest-version joins or missing version rows as a regression, not as acceptable empty metadata. |

## Load Profile

- **Shared resources**: `packages` / `versions` rows for a single package name, transaction ordering, metadata/search query plans.
- **Per-operation cost**: one publish transaction plus follow-up latest-version reads for metadata/search.
- **10x breakpoint**: concurrent publishes for the same package name will regress `packages.latest_version` or produce mismatched metadata/search output if ordering is still last-writer-wins.

## Negative Tests

- **Malformed inputs**: missing package row, missing version row for the recorded latest version, and duplicate publish attempts for the same `package_name` + `version`.
- **Error paths**: transaction failure between version insert and package latest refresh; metadata/search reads when no latest version exists yet.
- **Boundary conditions**: overlapping publishes with out-of-order commit timing, older vs newer proof versions for the same package, and packages with a single version.

## Steps

1. Replace the current last-writer-wins package upsert in `registry/src/db/packages.rs` with a monotonic latest-version derivation that is driven by committed version data and preserves package description updates.
2. Keep `registry/src/routes/metadata.rs` and `registry/src/routes/search.rs` aligned with that repaired source of truth so package metadata, search output, and named-install callers observe the same latest version.
3. Add focused registry regression coverage in the crate for the out-of-order/latest-version case; if the cleanest seam requires route assertions, keep them in-module beside the affected handlers.
4. Re-run the thin verifier guards that must stay truthful (`scripts/tests/verify-m034-s01-fetch-retry.sh`) so T01 does not weaken the live proof contract.

## Must-Haves

- [ ] Package-level `latest` no longer regresses when two publishes for the same package overlap or commit out of order.
- [ ] Metadata and search surfaces expose the same repaired latest version semantics.
- [ ] A targeted registry regression fails on the old behavior and passes on the repaired behavior.
- [ ] No retry/sleep workaround is added to mask stale latest metadata.
  - Estimate: 1h 15m
  - Files: registry/src/db/packages.rs, registry/src/routes/metadata.rs, registry/src/routes/search.rs, scripts/tests/verify-m034-s01-fetch-retry.sh
  - Verify: cargo test --manifest-path registry/Cargo.toml latest -- --nocapture
bash scripts/tests/verify-m034-s01-fetch-retry.sh
- [ ] **T02: Make the Windows installed-compiler path target-aware and keep staged smoke diagnostics truthful** — Repair the Windows/MSVC runtime-library discovery and linker invocation path in the compiler, then update the staged smoke verifier and workflow contract so hosted Windows failures stay localizable instead of stopping at an empty build bundle.

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
  - Estimate: 1h 30m
  - Files: compiler/mesh-codegen/src/link.rs, scripts/verify-m034-s03.ps1, scripts/verify-m034-s02-workflows.sh, .github/workflows/release.yml, scripts/tests/verify-m034-s03-last-exitcode.ps1
  - Verify: cargo test -p mesh-codegen link -- --nocapture
pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1
bash scripts/verify-m034-s02-workflows.sh
- [ ] **T03: Rerun the two hosted blocker lanes on the rollout SHA and refresh the evidence bundle** — Once T01 and T02 are green locally, refresh the hosted evidence on the already-approved rollout SHA so S10 ends with truthful green hosted lanes rather than only local fixes.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| GitHub workflow rerun / dispatch path | Stop before mutation until explicit user confirmation is granted, then preserve the exact command/API used and any rerun failure output under `.tmp/m034-s10/hosted-refresh/`. | Keep polling bounded, capture the last observed run state, and fail with the workflow URL plus current `headSha`. | Treat missing `headSha`, run URL, or conclusion fields as evidence drift and keep the task red. |
| Canonical remote-evidence replay | Preserve `remote-runs.json`, `workflow-status.json`, and failed logs from the current attempt instead of claiming success from stale artifacts. | Stop after `remote-evidence` and record which workflow remained incomplete. | Fail closed if the refreshed artifact set does not match `.tmp/m034-s09/rollout/target-sha.txt`. |

## Load Profile

- **Shared resources**: GitHub workflow runs for `authoritative-verification.yml` and `release.yml`, remote refs already pointed at the rollout SHA, and the local `.tmp/` evidence tree.
- **Per-operation cost**: two hosted reruns/monitors plus one canonical stop-after `remote-evidence` replay.
- **10x breakpoint**: repeated reruns without preserved artifacts or `headSha` checks will blur which hosted state is authoritative and can consume the blocker evidence without producing a truthful green bundle.

## Negative Tests

- **Malformed inputs**: missing rollout SHA file, missing workflow names, absent run URL / head SHA from hosted responses.
- **Error paths**: rerun denied, workflow stays red, workflow stays on the wrong head SHA, or stop-after `remote-evidence` remains non-zero.
- **Boundary conditions**: current rollout SHA already green vs needs rerun, duplicate rerun requests, and stop-after replay with preexisting `.tmp` artifacts from older attempts.

## Steps

1. Read `.tmp/m034-s09/rollout/target-sha.txt` and the existing blocker logs, then prepare the exact outward-action summary the executor will show the user before any GitHub rerun/dispatch call.
2. After explicit user confirmation, rerun or dispatch `authoritative-verification.yml` and `release.yml` on that SHA using the least-destructive path available, and monitor both until they settle with recorded URLs, conclusions, and `headSha` values.
3. Refresh `.tmp/m034-s05/verify/remote-runs.json` and `.tmp/m034-s09/rollout/workflow-status.json` through the canonical `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` replay, then archive the new blocker/success logs under `.tmp/m034-s10/hosted-refresh/`.
4. Stop red if either workflow is still failing or on the wrong SHA; only mark the task complete when both hosted lanes and the canonical stop-after replay agree on the rollout SHA.

## Must-Haves

- [ ] No outward GitHub action happens without an explicit user confirmation recorded in the task narrative.
- [ ] The refreshed hosted runs for `authoritative-verification.yml` and `release.yml` both land on `.tmp/m034-s09/rollout/target-sha.txt`.
- [ ] `.tmp/m034-s05/verify/remote-runs.json` and `.tmp/m034-s09/rollout/workflow-status.json` are refreshed from the new hosted state, not reused from S09.
- [ ] The new hosted success or failure logs are preserved under `.tmp/m034-s10/hosted-refresh/` so S11 can trust the outcome.
  - Estimate: 1h
  - Files: .tmp/m034-s09/rollout/target-sha.txt, .tmp/m034-s09/rollout/workflow-status.json, .tmp/m034-s09/rollout/failed-jobs/authoritative-verification.log, .tmp/m034-s09/t06-blocker/23663179715-failed.log, scripts/verify-m034-s05.sh
  - Verify: gh run list -R snowdamiz/mesh-lang --workflow authoritative-verification.yml --limit 1 --json databaseId,status,conclusion,headSha,url
gh run list -R snowdamiz/mesh-lang --workflow release.yml --limit 1 --json databaseId,status,conclusion,headSha,url
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'
