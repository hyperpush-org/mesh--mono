---
id: T01
parent: S10
milestone: M034
provides: []
requires: []
affects: []
key_files: ["registry/src/db/packages.rs", "registry/src/routes/metadata.rs", "registry/src/routes/search.rs", "registry/Cargo.toml", ".gsd/DECISIONS.md"]
key_decisions: ["D104: derive `packages.latest_version` from committed `versions` rows under a per-package lock instead of trusting last-writer-wins package upserts", "Fail metadata/search closed when the latest-version join is missing so drift is explicit instead of silently returning empty or stale data"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Task-level verification passed: `DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55433/postgres' cargo test --manifest-path registry/Cargo.toml latest -- --nocapture` and `bash scripts/tests/verify-m034-s01-fetch-retry.sh` both succeeded. Slice-level checks that are already meaningful at T01 also passed: `cargo test -p mesh-codegen link -- --nocapture`, `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`, and `bash scripts/verify-m034-s02-workflows.sh`."
completed_at: 2026-03-27T20:21:17.878Z
blocker_discovered: false
---

# T01: Recomputed registry latest-version state from committed version rows and added metadata/search regression coverage for monotonic latest semantics.

> Recomputed registry latest-version state from committed version rows and added metadata/search regression coverage for monotonic latest semantics.

## What Happened
---
id: T01
parent: S10
milestone: M034
key_files:
  - registry/src/db/packages.rs
  - registry/src/routes/metadata.rs
  - registry/src/routes/search.rs
  - registry/Cargo.toml
  - .gsd/DECISIONS.md
key_decisions:
  - D104: derive `packages.latest_version` from committed `versions` rows under a per-package lock instead of trusting last-writer-wins package upserts
  - Fail metadata/search closed when the latest-version join is missing so drift is explicit instead of silently returning empty or stale data
duration: ""
verification_result: passed
completed_at: 2026-03-27T20:21:17.881Z
blocker_discovered: false
---

# T01: Recomputed registry latest-version state from committed version rows and added metadata/search regression coverage for monotonic latest semantics.

**Recomputed registry latest-version state from committed version rows and added metadata/search regression coverage for monotonic latest semantics.**

## What Happened

I replaced the registry’s last-writer-wins `packages.latest_version` update with a derived refresh that runs after version insertion, under a per-package row lock, using committed `versions` rows as the source of truth. That keeps `latest` monotonic for overlapping publishes while still preserving description updates from the most recent publish request. I also aligned the metadata and search/list read paths so missing latest-version joins now fail explicitly instead of returning null or empty version data, and added targeted sqlx-backed regression tests for the hosted proof version shape plus malformed latest-join cases.

## Verification

Task-level verification passed: `DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55433/postgres' cargo test --manifest-path registry/Cargo.toml latest -- --nocapture` and `bash scripts/tests/verify-m034-s01-fetch-retry.sh` both succeeded. Slice-level checks that are already meaningful at T01 also passed: `cargo test -p mesh-codegen link -- --nocapture`, `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1`, and `bash scripts/verify-m034-s02-workflows.sh`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55433/postgres' cargo test --manifest-path registry/Cargo.toml latest -- --nocapture` | 0 | ✅ pass | 24530ms |
| 2 | `bash scripts/tests/verify-m034-s01-fetch-retry.sh` | 0 | ✅ pass | 960ms |
| 3 | `cargo test -p mesh-codegen link -- --nocapture` | 0 | ✅ pass | 48740ms |
| 4 | `pwsh -NoProfile -File scripts/tests/verify-m034-s03-last-exitcode.ps1` | 0 | ✅ pass | 5300ms |
| 5 | `bash scripts/verify-m034-s02-workflows.sh` | 0 | ✅ pass | 2100ms |


## Deviations

Used the existing local Docker Postgres on `127.0.0.1:55433` for sqlx-backed registry tests because the repo-root `.env` in this worktree does not define `DATABASE_URL`. No code-path or verifier-contract deviation was required.

## Known Issues

None.

## Files Created/Modified

- `registry/src/db/packages.rs`
- `registry/src/routes/metadata.rs`
- `registry/src/routes/search.rs`
- `registry/Cargo.toml`
- `.gsd/DECISIONS.md`


## Deviations
Used the existing local Docker Postgres on `127.0.0.1:55433` for sqlx-backed registry tests because the repo-root `.env` in this worktree does not define `DATABASE_URL`. No code-path or verifier-contract deviation was required.

## Known Issues
None.
