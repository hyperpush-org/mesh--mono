---
estimated_steps: 7
estimated_files: 5
skills_used:
  - debug-like-expert
  - postgresql-database-engineering
---

# T01: Repair registry latest-version ordering and prove metadata/search stay monotonic

**Slice:** S10 — Hosted verification blocker remediation
**Milestone:** M034

## Description

Repair the registry source of truth so overlapping publishes for the same package cannot move package-level `latest` metadata backward, then prove the metadata and search surfaces stay aligned with the committed newest version.

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

## Verification

- `cargo test --manifest-path registry/Cargo.toml latest -- --nocapture`
- `bash scripts/tests/verify-m034-s01-fetch-retry.sh`

## Observability Impact

- Signals added/changed: deterministic registry tests now expose latest-version regressions before they reach hosted authoritative verification.
- How a future agent inspects this: run the targeted `cargo test --manifest-path registry/Cargo.toml latest -- --nocapture` filter and inspect the failing DB/query assertion.
- Failure state exposed: metadata/search mismatch and stale latest selection become explicit crate-test failures instead of vague hosted proof drift.

## Inputs

- `registry/src/db/packages.rs` — current package/latest persistence logic.
- `registry/src/routes/metadata.rs` — package metadata response currently trusts `packages.latest_version`.
- `registry/src/routes/search.rs` — package list/search output currently trusts `packages.latest_version`.
- `compiler/meshpkg/src/install.rs` — named installs depend on the package metadata latest response.
- `scripts/tests/verify-m034-s01-fetch-retry.sh` — thin proof-wrapper guard that must stay truthful after the source fix.

## Expected Output

- `registry/src/db/packages.rs` — repaired monotonic latest-version persistence plus focused regression coverage.
- `registry/src/routes/metadata.rs` — metadata response aligned to the repaired latest source of truth.
- `registry/src/routes/search.rs` — search/list response aligned to the repaired latest source of truth.
- `scripts/tests/verify-m034-s01-fetch-retry.sh` — unchanged or minimally updated only if the repaired source fix requires a truthful verifier expectation change.
