---
id: S01
parent: M033
milestone: M033
provides:
  - Neutral `Expr` plus expression-aware `Repo.update_where_expr` / `Repo.insert_or_update_expr` write surfaces
  - Mesher write-path rewrites for revoke, assign/unassign, alert acknowledge/resolve, partial settings update, and issue upsert
  - Explicit S01 raw keep-list boundary for PG JSONB-heavy helpers deferred to S02
requires: []
affects:
  - S02
  - S03
  - S04
key_files:
  - compiler/mesh-rt/src/db/expr.rs
  - compiler/mesh-rt/src/db/repo.rs
  - compiler/mesh-rt/src/lib.rs
  - compiler/mesh-typeck/src/infer.rs
  - compiler/mesh-codegen/src/mir/lower.rs
  - compiler/mesh-codegen/src/codegen/intrinsics.rs
  - mesher/storage/queries.mpl
  - compiler/meshc/tests/e2e_m033_s01.rs
  - scripts/verify-m033-s01.sh
key_decisions:
  - Keep the neutral write-expression core as a dedicated `Expr` builder plus expression-aware Repo entrypoints rather than widening the old literal-only write map.
  - Move the S01-owned Mesher write families to the neutral expression path while leaving PG JSONB-heavy helpers explicit for S02.
  - Use `Expr.fn_call(...)` and `Expr.case_when(...)` as the currently working Mesh-level aliases for runtime call/case expression builders.
patterns_established:
  - Expression-valued Repo writes should accept `Map<String, Ptr>` expression maps and let SQL assembly renumber placeholders at the end.
  - Portable partial updates should parse JSON in Mesh code first, then update only supplied fields through neutral expressions.
  - Keep the neutral core honest by naming PG-specific keep-sites instead of smuggling them behind a fake portable API.
observability_surfaces:
  - compiler/meshc/tests/e2e_m033_s01.rs
  - scripts/verify-m033-s01.sh
  - Direct Postgres row assertions in the Rust harness
  - Raw keep-list sweep over mesher/storage/queries.mpl and mesher/storage/writer.mpl
drill_down_paths:
  - .gsd/milestones/M033/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M033/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M033/slices/S01/tasks/T03-SUMMARY.md
verification_result: partial
completed_at: 2026-03-25
---

# S01: Neutral expression core on real write paths

**Shipped the neutral expression builder and expression-aware Repo write paths, rewrote the S01-owned Mesher write families onto that surface, and captured the remaining live Mesher startup blocker explicitly in the new slice harness.**

## What Happened

S01 pushed a real neutral expression contract from runtime through type checking and codegen into Mesh-visible `Expr` and expression-aware Repo entrypoints. The runtime now has a dedicated `SqlExpr` tree with serializer and placeholder-renumbering logic, the compiler stack recognizes the expression intrinsics, and `Repo.update_where_expr` / `Repo.insert_or_update_expr` are exported as first-class write surfaces.

Mesher then consumed that surface on the slice-owned write paths:

- `revoke_api_key` now sets `revoked_at` through a structured `now()` expression.
- `assign_issue` now uses the neutral expression path for both assign and unassign, with real `NULL` assignment via `Expr.null()`.
- `acknowledge_alert` and `resolve_fired_alert` now use expression-aware timestamp updates instead of raw SQL.
- `update_project_settings` now parses JSON in Mesh code and updates only supplied fields through neutral expressions.
- `upsert_issue` now uses structured conflict-update expressions for `event_count`, `last_seen`, and resolved-to-unresolved regression handling.

The slice also added a new closeout harness in `compiler/meshc/tests/e2e_m033_s01.rs` and `scripts/verify-m033-s01.sh` to prove the expression contract and sweep the remaining raw-write keep-list.

## Verification

Passing evidence:

- `cargo test -p meshc --test e2e_m033_s01 expr_error_ -- --nocapture`
- `cargo test -p meshc --test e2e_m033_s01 e2e_m033_expr_repo_executes -- --nocapture`
- `cargo run -q -p meshc -- build mesher`

Blocked evidence:

- `cargo test -p meshc --test e2e_m033_s01 -- --nocapture`
- `bash scripts/verify-m033-s01.sh`

The remaining failures are concentrated in the live Mesher acceptance portion of the new harness: `e2e_m033_mesher_mutations` and `e2e_m033_mesher_issue_upsert` build Mesher successfully but never observe the Mesher HTTP server becoming ready under the temporary Postgres-backed test setup.

## Requirements Advanced

- R036 — added a real neutral expression/write surface and used it on recurring Mesher write families instead of hiding portable behavior behind raw SQL.
- R040 — kept the new core vendor-neutral while leaving PG-only helpers explicit, preserving the later SQLite extension seam.

## Requirements Validated

None. The live Mesher replay blocker means S01 advanced R036/R040 but did not fully validate them yet.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

The slice did not finish with a green full acceptance replay. Instead of claiming a false pass, the closeout records the exact blocker: the new live Mesher route harness never observed Mesher reach HTTP readiness, which left the final verifier script red.

## Known Limitations

- `scripts/verify-m033-s01.sh` is still red because the live Mesher route tests stall before HTTP readiness.
- The current Mesh parser path still misreads `Expr.call(...)` and `Expr.case(...)` inside expression maps; the working Mesh-level aliases are `Expr.fn_call(...)` and `Expr.case_when(...)`.
- R036/R040 are advanced but not fully validated until the live Mesher replay is green.

## Follow-ups

- Debug Mesher startup/HTTP readiness in `compiler/meshc/tests/e2e_m033_s01.rs`.
- Rerun `cargo test -p meshc --test e2e_m033_s01 -- --nocapture`.
- Rerun `bash scripts/verify-m033-s01.sh` once the live replay is fixed before treating S01 as fully re-proven.

## Files Created/Modified

- `compiler/mesh-rt/src/db/expr.rs` — neutral `SqlExpr` tree, serializer, and unit coverage.
- `compiler/mesh-rt/src/db/repo.rs` — expression-valued update/upsert builders and runtime entrypoints.
- `compiler/mesh-rt/src/lib.rs` — exported expression and Repo-expression runtime symbols.
- `compiler/mesh-typeck/src/infer.rs` — registered `Expr` plus expression-aware Repo signatures and working aliases.
- `compiler/mesh-codegen/src/mir/lower.rs` — mapped expression/repo-expression builtins and alias lowering.
- `compiler/mesh-codegen/src/codegen/intrinsics.rs` — declared the new expression and Repo-expression externs.
- `mesher/storage/queries.mpl` — rewrote the S01-owned write families onto the neutral expression surface.
- `compiler/meshc/tests/e2e_m033_s01.rs` — added expression-contract tests and the blocked live Mesher acceptance harness.
- `scripts/verify-m033-s01.sh` — added slice closeout verification and raw keep-list sweep.
- `.gsd/KNOWLEDGE.md` — recorded the alias workaround and startup blocker.
- `.gsd/PROJECT.md` — refreshed project state.

## Forward Intelligence

### What the next slice should know
- The neutral expression/write path is real and usable for portable write families; the remaining work is proof closure and then PG-specific helper expansion, not redesigning the core.
- The named raw keep-sites for S02 are still `insert_event`, `create_alert_rule`, and `fire_alert`.

### What's fragile
- The live Mesher startup path under the new Rust harness — the write-path code compiles, but the server never reaches an observable ready state.
- The parser handling of `Expr.call(...)` / `Expr.case(...)` in expression maps — use the current aliases until that path is repaired.

### Authoritative diagnostics
- `compiler/meshc/tests/e2e_m033_s01.rs` — this is the authoritative expression-contract and live-route proof surface.
- `scripts/verify-m033-s01.sh` — this is the authoritative slice closeout bundle and raw keep-list gate.

### What assumptions changed
- Original assumption: the neutral expression core could be proven and closed with one full live Mesher replay in the same slice.
- Actual result: the expression core and Mesher write-path rewrites landed, but the live Mesher readiness proof remains the blocker for full closeout.
