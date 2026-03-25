---
id: T01
parent: S02
milestone: M033
key_files:
  - compiler/mesh-rt/src/db/expr.rs
  - compiler/mesh-rt/src/db/query.rs
  - compiler/mesh-rt/src/db/repo.rs
  - compiler/mesh-rt/src/lib.rs
  - compiler/mesh-typeck/src/infer.rs
  - compiler/mesh-codegen/src/mir/lower.rs
  - compiler/mesh-codegen/src/codegen/intrinsics.rs
  - mesher/storage/queries.mpl
key_decisions:
  - Kept vendor-specific SQL behavior explicit under the `Pg` module and did not absorb PG-only names into the neutral `Expr` API.
  - Represented PG casts as structured expression nodes so JSONB/int/regconfig-style casts serialize safely without inventing a fake universal SQL AST.
  - Used structured `Query.where_expr` and `Repo.insert_expr` plumbing for the Mesher auth path so pgcrypto verification/hash generation no longer depends on raw SQL fragments.
duration: ""
verification_result: mixed
completed_at: 2026-03-25T16:49:03.191Z
blocker_discovered: false
---

# T01: Add explicit Pg auth helpers and move Mesher auth off raw pgcrypto SQL

**Add explicit Pg auth helpers and move Mesher auth off raw pgcrypto SQL**

## What Happened

Implemented the S02 runtime/compiler seam for explicit PostgreSQL-only helpers without expanding the neutral Expr API. In `compiler/mesh-rt/src/db/expr.rs` I added cast-capable expression serialization plus explicit `Pg.*` helper entrypoints for casts, pgcrypto, JSONB containment, and full-text primitives. In the query/repo runtime I added `Query.where_expr`, `Query.select_expr`, and `Repo.insert_expr`, and I centralized WHERE placeholder renumbering so SELECT and WHERE expression params compose safely with existing raw/query fragments. I then wired the same callable surface through `compiler/mesh-typeck/src/infer.rs`, `compiler/mesh-codegen/src/mir/lower.rs`, `compiler/mesh-codegen/src/codegen/intrinsics.rs`, and `compiler/mesh-rt/src/lib.rs` so compiled Mesh code can call the new `Pg.*`, `Query.*_expr`, and `Repo.insert_expr` entrypoints end to end. Finally, I rewrote `mesher/storage/queries.mpl` so `create_user` uses `Repo.insert_expr` with `Pg.crypt(..., Pg.gen_salt("bf", 12))` and `authenticate_user` uses `Query.where_expr` with `Pg.crypt` verification instead of raw `Repo.query_raw(...)` / `Query.where_raw(...)` pgcrypto fragments. During verification I found two local workflow issues, not plan blockers: Mesher formatting drift in `mesher/storage/queries.mpl`, and a stale `libmesh_rt.a` archive, so I ran `cargo run -q -p meshc -- fmt mesher` and rebuilt the runtime staticlib with `cargo build -p mesh-rt` before rerunning the required task checks.

## Verification

Verified the new plumbing with a targeted runtime unit test and then reran the task-contract checks. `cargo test -p mesh-rt test_insert_expr_sql_preserves_expr_param_order -- --nocapture` passed, confirming expression-valued INSERT SQL preserves parameter order. `cargo run -q -p meshc -- fmt --check mesher` initially failed on formatter drift in `mesher/storage/queries.mpl`; after `cargo run -q -p meshc -- fmt mesher`, the formatter check passed. `cargo run -q -p meshc -- build mesher` initially failed because the linker consumed a stale prebuilt `libmesh_rt.a`; after `cargo build -p mesh-rt`, rerunning the Mesher build succeeded. For this intermediate task, the task-level verification bar is green (`build mesher`, `fmt --check mesher`), while the slice-level Postgres proof bundle (`cargo test -p meshc --test e2e_m033_s02 -- --nocapture` and `bash scripts/verify-m033-s02.sh`) remains owned by T03 and is therefore still pending by plan.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p mesh-rt test_insert_expr_sql_preserves_expr_param_order -- --nocapture` | 0 | ✅ pass | 31100ms |
| 2 | `cargo run -q -p meshc -- fmt --check mesher` | 1 | ❌ fail | 53900ms |
| 3 | `cargo run -q -p meshc -- build mesher` | 1 | ❌ fail | 63000ms |
| 4 | `cargo build -p mesh-rt` | 0 | ✅ pass | 19270ms |
| 5 | `cargo build -p mesh-rt && cargo run -q -p meshc -- build mesher && cargo run -q -p meshc -- fmt --check mesher` | 0 | ✅ pass | 0ms |


## Deviations

Needed an explicit `cargo build -p mesh-rt` before the final `meshc build mesher` rerun because the linker path consumes a prebuilt `libmesh_rt.a`, and needed one `cargo run -q -p meshc -- fmt mesher` pass to clear formatter drift before `fmt --check` would pass. No scope or API-plan deviations were introduced.

## Known Issues

None.

## Files Created/Modified

- `compiler/mesh-rt/src/db/expr.rs`
- `compiler/mesh-rt/src/db/query.rs`
- `compiler/mesh-rt/src/db/repo.rs`
- `compiler/mesh-rt/src/lib.rs`
- `compiler/mesh-typeck/src/infer.rs`
- `compiler/mesh-codegen/src/mir/lower.rs`
- `compiler/mesh-codegen/src/codegen/intrinsics.rs`
- `mesher/storage/queries.mpl`
