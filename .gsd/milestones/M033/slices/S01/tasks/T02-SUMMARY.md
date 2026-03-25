---
id: T02
parent: S01
milestone: M033
provides:
  - Exact compiler/runtime and Mesher resume points for the neutral write-path work after a forced context wrap-up
key_files:
  - compiler/mesh-rt/src/db/expr.rs
  - compiler/mesh-rt/src/db/repo.rs
  - compiler/mesh-typeck/src/infer.rs
  - compiler/mesh-codegen/src/mir/lower.rs
  - compiler/mesh-codegen/src/codegen/intrinsics.rs
  - mesher/storage/queries.mpl
  - mesher/main.mpl
  - .gsd/milestones/M033/slices/S01/S01-PLAN.md
key_decisions:
  - Resume by exposing the existing runtime `SqlExpr` tree through a Mesh-visible `Expr` module and `Repo.update_where_expr` before rewriting Mesher mutation paths
patterns_established:
  - No new implementation patterns were landed; this unit only confirmed the missing compiler/runtime surface and the affected Mesher routes
observability_surfaces:
  - none yet; `compiler/meshc/tests/e2e_m033_s01.rs` and `scripts/verify-m033-s01.sh` are still absent locally
duration: 0.5h
verification_result: failed
completed_at: 2026-03-24 14:39 EDT
blocker_discovered: false
---

# T02: Move direct Mesher mutations onto the neutral write core

**Confirmed that T02 cannot honestly start at the Mesher layer yet because the Mesh-visible `Expr` / expression-write Repo surface is still missing, then captured exact resume points before the forced wrap-up.**

## What Happened

I used the forced wrap-up window to verify the local state instead of pushing speculative code.

What I confirmed:

- `compiler/mesh-rt/src/db/expr.rs` exists and already contains the neutral `SqlExpr` tree plus runtime exports like `mesh_expr_null`, `mesh_expr_call`, arithmetic/comparison builders, `CASE`, `COALESCE`, and `EXCLUDED` support.
- That expression tree is **not** exposed through the Mesh compiler stack yet. The current compiler/runtime surface still only exposes the legacy Query/Repo API:
  - `compiler/mesh-typeck/src/infer.rs` has `Query` and `Repo` stdlib modules, but no `Expr` module and no expression-aware write function.
  - `compiler/mesh-codegen/src/mir/lower.rs` and `compiler/mesh-codegen/src/codegen/intrinsics.rs` still only register the old `mesh_query_*` and `mesh_repo_*` symbols.
  - `compiler/mesh-rt/src/lib.rs` re-exports Query/Repo functions but not the `mesh_expr_*` functions.
  - `compiler/mesh-rt/src/db/repo.rs` still only has the Map<String,String>-based write surface (`mesh_repo_update_where`, `mesh_repo_insert_or_update`), not an expression-valued variant.
- The target Mesher write functions in `mesher/storage/queries.mpl` are still on the pre-expression surface:
  - `revoke_api_key` still fetches `now()` via `Repo.query_raw(...)` and then writes a literal timestamp string.
  - `assign_issue` still falls back to a raw `UPDATE ... SET assigned_to = NULL` for unassign.
  - `acknowledge_alert` and `resolve_fired_alert` still use raw `UPDATE ... now()` SQL.
  - `update_project_settings` still uses PG-side `jsonb` extraction in raw SQL.
- `compiler/meshc/tests/e2e_m033_s01.rs` does not exist locally yet, and `scripts/verify-m033-s01.sh` also does not exist. The slice proof harness still has to be created.
- `mesher/main.mpl` confirmed the live route contract and startup behavior the eventual acceptance test will need:
  - HTTP default port `8080`
  - routes for `/api/v1/issues/:id/assign`, `/api/v1/api-keys/:key_id/revoke`, `/api/v1/alerts/:id/acknowledge`, `/api/v1/alerts/:id/resolve`, and `/api/v1/projects/:project_id/settings`

I did **not** change product code in this unit. The only on-disk changes are this summary and the task checkbox update required by the harness instructions.

## Verification

No implementation verification commands were run before the context-budget stop. I stopped after local state verification so the next unit can resume from a clean, explicit handoff instead of from partial compiler/runtime edits.

## Verification Evidence

No verification commands were run before the forced wrap-up.

## Diagnostics

Resume in this order:

1. `compiler/mesh-typeck/src/infer.rs`
   - Add an `Expr` stdlib module.
   - Add `Repo.update_where_expr(...)` (and likely `Repo.insert_or_update_expr(...)` if you want to avoid touching this layer twice).
   - Add `Expr` to `STDLIB_MODULE_NAMES`.
2. `compiler/mesh-codegen/src/mir/lower.rs`
   - Map `expr_*` Mesh calls to `mesh_expr_*` symbols.
   - Map the new Repo expression-write entrypoint(s).
3. `compiler/mesh-codegen/src/codegen/intrinsics.rs`
   - Declare the `mesh_expr_*` externs and the new Repo expression-write extern(s).
4. `compiler/mesh-rt/src/lib.rs`
   - Re-export the `mesh_expr_*` functions and the new Repo expression-write function(s).
5. `compiler/mesh-rt/src/db/repo.rs`
   - Add a string-keyed map reader for `Map<String, Ptr>` expression updates.
   - Implement `mesh_repo_update_where_expr` by serializing each `SqlExpr` and renumbering placeholders across SET and WHERE.
   - Add focused unit tests for the generated UPDATE SQL before touching Mesher.
6. `mesher/storage/queries.mpl`
   - Rewrite `revoke_api_key`, `assign_issue`, `acknowledge_alert`, `resolve_fired_alert`, and `update_project_settings` onto the new surface.
   - Use Mesh-side JSON extraction (`Json.get`) for settings partial updates instead of PG-side `jsonb` extraction.
7. `compiler/meshc/tests/e2e_m033_s01.rs`
   - Create the live Mesher mutation harness.
   - Start with route proofs for assign/unassign, revoke, acknowledge/resolve, and settings update.
   - Assert DB-side `assigned_to`, `revoked_at`, `acknowledged_at`, `resolved_at`, `retention_days`, and `sample_rate` values directly.

## Deviations

I did not execute the implementation steps in the written task plan. The context-budget warning arrived during investigation, so I stopped after confirming the missing compiler/runtime prerequisites instead of landing unverified partial changes.

## Known Issues

- `compiler/meshc/tests/e2e_m033_s01.rs` is still missing.
- `scripts/verify-m033-s01.sh` is still missing.
- The Mesh-visible `Expr` module is still absent.
- The runtime/compiler still lack an expression-valued Repo write surface.
- All T02 target Mesher mutation functions are still on the pre-expression implementation.

## Files Created/Modified

- `.gsd/milestones/M033/slices/S01/tasks/T02-SUMMARY.md` — recorded the forced wrap-up, verified findings, and precise resume points
- `.gsd/milestones/M033/slices/S01/S01-PLAN.md` — marked T02 done on disk per the auto-mode harness requirement
