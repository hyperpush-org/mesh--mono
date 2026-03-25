---
id: T01
parent: S04
milestone: M033
key_files:
  - compiler/mesh-rt/src/db/migration.rs
  - compiler/mesh-rt/src/db/pg_schema.rs
  - compiler/mesh-rt/src/db/mod.rs
  - compiler/mesh-rt/src/lib.rs
  - compiler/mesh-typeck/src/infer.rs
  - compiler/mesh-codegen/src/mir/lower.rs
  - compiler/mesh-codegen/src/codegen/intrinsics.rs
  - compiler/mesh-repl/src/jit.rs
key_decisions:
  - Keep `Migration.create_index(...)` strictly neutral by supporting only exact `name:...`, `unique:true|false`, `where:...`, and per-column `:ASC` / `:DESC`, while rejecting PG-only index method/opclass syntax with `Migration.create_index`-named errors.
  - Put PostgreSQL-only schema behavior behind a dedicated `Pg` helper family implemented as explicit runtime intrinsics, and keep partition naming/date math in database-side SQL built from `current_date` rather than host-clock computation.
duration: ""
verification_result: mixed
completed_at: 2026-03-25T22:47:51.395Z
blocker_discovered: false
---

# T01: Add explicit Pg schema helpers and honest Migration.create_index support

**Add explicit Pg schema helpers and honest Migration.create_index support**

## What Happened

Implemented the T01 runtime/compiler boundary for S04. In `compiler/mesh-rt/src/db/migration.rs`, `Migration.create_index(...)` now parses only the honest neutral surface: `unique:true|false`, exact `name:...`, optional trailing `where:...`, and per-column `:ASC` / `:DESC` order suffixes. The builder now preserves exact Mesher index names, renders ordered columns correctly, derives auto names from base column names only, and rejects PG-only column suffixes/options with helper-specific errors instead of silently pretending opclass/index-method syntax is portable.

Added a new runtime module `compiler/mesh-rt/src/db/pg_schema.rs` containing explicit PostgreSQL-only helpers for `Pg.create_extension`, `Pg.create_range_partitioned_table`, `Pg.create_gin_index`, `Pg.create_daily_partitions_ahead`, `Pg.list_daily_partitions_before`, and `Pg.drop_partition`. The implementations keep identifier quoting explicit, keep partition date math on the database side via `current_date`-based SQL, and expose deterministic helper-named validation errors for bad inputs.

Wired the new helper family through the runtime/export/compiler path: `compiler/mesh-rt/src/db/mod.rs` now exposes `pg_schema`, `compiler/mesh-rt/src/lib.rs` re-exports the new ABI functions, `compiler/mesh-typeck/src/infer.rs` teaches the `Pg` namespace the new pool-based signatures, `compiler/mesh-codegen/src/mir/lower.rs` recognizes the new `pg_*` builtin names and MIR function signatures, `compiler/mesh-codegen/src/codegen/intrinsics.rs` declares the LLVM intrinsics and extends the intrinsic-existence tests, and `compiler/mesh-repl/src/jit.rs` registers the new runtime symbols for JIT resolution.

Added unit coverage in both `migration.rs` and `pg_schema.rs`. The migration tests prove exact names, ordered columns, partial predicates, and explicit rejection of PG-only index syntax at the neutral boundary. The pg_schema tests prove quoted/validated extension, partitioned-table, GIN/opclass, daily-partition, list-before, and drop-partition SQL builders. I named the `pg_schema` tests with `migration_...` prefixes so they run under the existing `cargo test -p mesh-rt migration -- --nocapture` filter that this slice uses as its task-level gate.

## Verification

Task-level verification passed: `cargo test -p mesh-rt migration -- --nocapture` ran 24 migration/pg_schema unit tests successfully, and `cargo build -p meshc` completed successfully after the new runtime/typechecker/codegen/JIT wiring landed.

Slice-level acceptance checks were also exercised for truthful partial status on this intermediate task. `cargo run -q -p meshc -- fmt --check mesher` passed and `cargo run -q -p meshc -- build mesher` passed, confirming the new compiler/runtime surfaces did not break Mesher formatting or compilation. The S04-specific proof target `cargo test -p meshc --test e2e_m033_s04 -- --nocapture` and the slice verifier `bash scripts/verify-m033-s04.sh` failed because those T04 acceptance artifacts do not exist yet in the working tree; this is expected slice incompleteness, not a regression introduced by T01.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p mesh-rt migration -- --nocapture` | 0 | ✅ pass | 8988ms |
| 2 | `cargo build -p meshc` | 0 | ✅ pass | 2516ms |
| 3 | `cargo test -p meshc --test e2e_m033_s04 -- --nocapture` | 101 | ❌ fail | 498ms |
| 4 | `cargo run -q -p meshc -- fmt --check mesher` | 0 | ✅ pass | 6838ms |
| 5 | `cargo run -q -p meshc -- build mesher` | 0 | ✅ pass | 18312ms |
| 6 | `bash scripts/verify-m033-s04.sh` | 127 | ❌ fail | 29ms |


## Deviations

None.

## Known Issues

The slice-level S04 acceptance surfaces `compiler/meshc/tests/e2e_m033_s04.rs` and `scripts/verify-m033-s04.sh` are not present yet, so `cargo test -p meshc --test e2e_m033_s04 -- --nocapture` currently exits 101 and `bash scripts/verify-m033-s04.sh` exits 127 until T04 lands.

## Files Created/Modified

- `compiler/mesh-rt/src/db/migration.rs`
- `compiler/mesh-rt/src/db/pg_schema.rs`
- `compiler/mesh-rt/src/db/mod.rs`
- `compiler/mesh-rt/src/lib.rs`
- `compiler/mesh-typeck/src/infer.rs`
- `compiler/mesh-codegen/src/mir/lower.rs`
- `compiler/mesh-codegen/src/codegen/intrinsics.rs`
- `compiler/mesh-repl/src/jit.rs`
