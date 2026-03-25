# S02: Explicit PG extras for JSONB, search, and crypto

**Goal:** Ship explicit PostgreSQL helper surfaces for JSONB, full-text search, and pgcrypto on top of the S01 expression core, then move the real Mesher auth/search/JSONB runtime paths onto those helpers without pretending they are portable.
**Demo:** After this: Mesher event ingest, JSONB extraction, full-text search, and pgcrypto-backed auth flows work through explicit PostgreSQL helpers on the real runtime path.

## Must-Haves

- Mesh exposes explicit `Pg.*` builders for JSONB/search/pgcrypto work plus the supporting `Query.select_expr`, `Query.where_expr`, and `Repo.insert_expr` plumbing, while the neutral `Expr` surface stays vendor-neutral and preserves the later SQLite extension seam required by R040.
- `mesher/storage/queries.mpl` and `mesher/storage/writer.mpl` move the S02-owned PG families — `create_user`, `authenticate_user`, `search_events_fulltext`, `filter_events_by_tag`, `event_breakdown_by_tag`, `create_alert_rule`, `fire_alert`, `insert_event`, `get_event_alert_rules`, and `get_threshold_rules` — onto those explicit helpers, with `extract_event_fields` kept raw only if it still belongs to the S03 hard-read boundary.
- A new direct Postgres-backed proof bundle in `compiler/meshc/tests/e2e_m033_s02.rs` plus `scripts/verify-m033-s02.sh` proves pgcrypto auth, full-text ranking/query binding, JSONB insert/defaulting/extraction, and the owned raw keep-list boundary on the real Mesh runtime path.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `cargo test -p meshc --test e2e_m033_s02 -- --nocapture`
- `cargo run -q -p meshc -- fmt --check mesher`
- `cargo run -q -p meshc -- build mesher`
- `bash scripts/verify-m033-s02.sh`

## Observability / Diagnostics

- Runtime signals: named `e2e_m033_s02_*` failures for auth/search/jsonb helper families, direct row snapshots from `users`, `events`, `alert_rules`, and `alerts`, and raw keep-list drift failures in `scripts/verify-m033-s02.sh`
- Inspection surfaces: `compiler/meshc/tests/e2e_m033_s02.rs`, `scripts/verify-m033-s02.sh`, and direct Postgres queries inside the Rust harness
- Failure visibility: proofs should name the helper family, placeholder-order drift, and mismatched DB fields/rows without printing passwords, tokens, or connection strings
- Redaction constraints: never log raw passwords, session tokens, or `DATABASE_URL`; assert on hashes, IDs, and row shapes only

## Integration Closure

- Upstream surfaces consumed: S01’s neutral expression/runtime/compiler seam in `compiler/mesh-rt/src/db/{expr,query,repo}.rs`, compiler wiring in `compiler/mesh-typeck/src/infer.rs` and `compiler/mesh-codegen/src/{mir/lower.rs,codegen/intrinsics.rs}`, and Mesher storage code in `mesher/storage/{queries,writer}.mpl`
- New wiring introduced in this slice: explicit `Pg.*` helper calls, query-side expression parameter plumbing via `select_params`, expression-valued inserts, and Mesher storage rewrites for auth/search/JSONB flows
- What remains before the milestone is truly usable end-to-end: S03 still owns the hard read-side/raw-tail collapse (including any justified `extract_event_fields` keep-site), S04 still owns schema/partition helpers, and S05 still owns public docs plus the final integrated replay

## Tasks

- [x] **T01: Add explicit Pg helper plumbing and rewrite the auth path** `est:3h`
  - Why: R037 is blocked until Mesh has honest PG-only helper surfaces that compose with the S01 expression core, and auth is the smallest real vertical path that proves the new boundary without reopening the neutral API.
  - Files: `compiler/mesh-rt/src/db/expr.rs`, `compiler/mesh-rt/src/db/query.rs`, `compiler/mesh-rt/src/db/repo.rs`, `compiler/mesh-rt/src/lib.rs`, `compiler/mesh-typeck/src/infer.rs`, `compiler/mesh-codegen/src/mir/lower.rs`, `compiler/mesh-codegen/src/codegen/intrinsics.rs`, `mesher/storage/queries.mpl`
  - Do: Add cast-capable expression internals and explicit `Pg.*` constructors for JSONB/search/pgcrypto work; teach `Query` to bind expression-valued `SELECT` / `WHERE` clauses through `select_params`; add `Repo.insert_expr`; wire the new calls through type inference, MIR lowering, runtime exports, and intrinsics; then move `create_user` and `authenticate_user` onto the new helper surface. Keep the public vendor-specific API under `Pg`, not `Expr`, so R040 stays intact.
  - Verify: `cargo run -q -p meshc -- build mesher`
  - Done when: compiled Mesh code can call the new `Pg.*`, `Query.*_expr`, and `Repo.insert_expr` entrypoints end-to-end, and the auth path no longer depends on raw `crypt(...)` fragments.
- [x] **T02: Rewrite Mesher JSONB and search flows onto explicit Pg helpers** `est:2.5h`
  - Why: The slice demo is not true until the remaining S02-owned JSONB/search helpers move off raw query fragments and onto the explicit PG surface, advancing R037 while shrinking the honest raw tail for R038.
  - Files: `mesher/storage/queries.mpl`, `mesher/storage/writer.mpl`
  - Do: Rewrite `search_events_fulltext`, `filter_events_by_tag`, `event_breakdown_by_tag`, `create_alert_rule`, `fire_alert`, `insert_event`, `get_event_alert_rules`, and `get_threshold_rules` to use `Pg.*`, `Query.select_expr`, `Query.where_expr`, and `Repo.insert_expr`. Re-evaluate `extract_event_fields`; if it still needs ordinality/scalar-subquery work, keep it raw with an explicit S03 boundary comment instead of forcing it through a fake helper.
  - Verify: `cargo run -q -p meshc -- build mesher`
  - Done when: the S02-owned Mesher JSONB/search/auth helpers use explicit PG surfaces on the real storage path and only the named dishonest leftover remains raw.
- [x] **T03: Prove PG helper boundaries with Postgres-backed Mesher storage tests** `est:2h`
  - Why: S02 closes only when a future agent can rerun a concrete proof bundle that exercises the real runtime path and catches raw-boundary drift without depending on the still-fragile S01 HTTP readiness harness.
  - Files: `compiler/meshc/tests/e2e_m033_s02.rs`, `scripts/verify-m033-s02.sh`
  - Do: Reuse the Postgres harness pattern from `compiler/meshc/tests/e2e_m033_s01.rs` to execute the rewritten Mesher storage paths directly against live Postgres, covering pgcrypto hash/verify, full-text search ranking and parameter ordering, JSONB insert/defaulting, tag filtering/breakdown, alert-rule create/fire helpers, and the owned keep-list boundary. Add `scripts/verify-m033-s02.sh` to run the new test target, `meshc` build/fmt checks, and a keep-list sweep that allows only the named leftovers.
  - Verify: `cargo test -p meshc --test e2e_m033_s02 -- --nocapture`; `bash scripts/verify-m033-s02.sh`
  - Done when: the slice-level verification section passes unchanged and failures localize to named auth/search/jsonb proofs or keep-list drift instead of vague Mesher regressions.

## Files Likely Touched

- `compiler/mesh-rt/src/db/expr.rs`
- `compiler/mesh-rt/src/db/query.rs`
- `compiler/mesh-rt/src/db/repo.rs`
- `compiler/mesh-rt/src/lib.rs`
- `compiler/mesh-typeck/src/infer.rs`
- `compiler/mesh-codegen/src/mir/lower.rs`
- `compiler/mesh-codegen/src/codegen/intrinsics.rs`
- `mesher/storage/queries.mpl`
- `mesher/storage/writer.mpl`
- `compiler/meshc/tests/e2e_m033_s02.rs`
- `scripts/verify-m033-s02.sh`
