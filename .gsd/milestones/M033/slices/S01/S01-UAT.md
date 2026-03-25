# S01: Neutral expression core on real write paths — UAT

**Milestone:** M033
**Written:** 2026-03-25

## UAT Type

- UAT mode: mixed
- Why this mode is sufficient: S01 changed compiler/runtime expression plumbing, Mesher storage mutations, and the slice verifier. The compiler-side expression contract is directly testable today, while the live Mesher route replay is currently blocked and is recorded explicitly below.

## Preconditions

1. Docker is available locally for the temporary PostgreSQL container used by `compiler/meshc/tests/e2e_m033_s01.rs`.
2. `cargo build -p mesh-rt` has been run at least once in the current tree so `libmesh_rt.a` includes the newest exported symbols.
3. No other process is bound to local port `5432` while the temporary test Postgres container is running.
4. The repo root is the current working directory.

## Smoke Test

Run:

```bash
cargo test -p meshc --test e2e_m033_s01 e2e_m033_expr_repo_executes -- --nocapture
```

**Expected:** the test passes and proves the neutral expression runtime can execute computed `UPDATE` and `INSERT ... ON CONFLICT DO UPDATE` work with arithmetic, `now()`, and `CASE` expressions.

## Test Cases

### 1. Expression error surfaces stay explicit

1. Run:
   ```bash
   cargo test -p meshc --test e2e_m033_s01 expr_error_ -- --nocapture
   ```
2. Confirm both named tests pass.
3. **Expected:** `expr_error_update_where_expr_requires_where_clause` returns `update_where_expr: no WHERE conditions`, and `expr_error_insert_or_update_expr_requires_conflict_targets` returns `insert_or_update_expr: no conflict targets provided`.

### 2. Mesher still builds after the write-path rewrite

1. Run:
   ```bash
   cargo run -q -p meshc -- build mesher
   ```
2. **Expected:** the command succeeds and emits the `mesher/mesher` binary.

### 3. Raw keep-list stays honest for S01 vs S02

1. Run:
   ```bash
   bash scripts/verify-m033-s01.sh
   ```
2. If the command fails, inspect `.tmp/m033-s01/verify/`.
3. **Expected after the startup blocker is fixed:** the script proves that `revoke_api_key`, `assign_issue`, `acknowledge_alert`, `resolve_fired_alert`, `update_project_settings`, and `upsert_issue` no longer use raw SQL, while `insert_event`, `create_alert_rule`, and `fire_alert` remain the explicit PG keep-sites for S02.

### 4. Live Mesher mutation replay (currently blocked)

1. Run:
   ```bash
   cargo test -p meshc --test e2e_m033_s01 e2e_m033_mesher_mutations -- --nocapture
   ```
2. The test migrates a temporary Mesher database, builds Mesher, starts the Mesher binary, then drives these live routes:
   - `POST /api/v1/events`
   - `POST /api/v1/issues/:id/assign` (assign + unassign)
   - `POST /api/v1/api-keys/:key_id/revoke`
   - `POST /api/v1/alerts/:id/acknowledge`
   - `POST /api/v1/alerts/:id/resolve`
   - `POST /api/v1/projects/default/settings`
3. **Expected after the blocker is fixed:** the DB assertions prove `assigned_to` toggles between UUID and `NULL`, `revoked_at` is set, alert timestamps are set, and project settings update without clobbering untouched fields.
4. **Current blocker:** Mesher builds but the test never observes an HTTP-ready server.

### 5. Live Mesher issue upsert replay (currently blocked)

1. Run:
   ```bash
   cargo test -p meshc --test e2e_m033_s01 e2e_m033_mesher_issue_upsert -- --nocapture
   ```
2. The test migrates/builds/starts Mesher, ingests the same event repeatedly, resolves the created issue through the live route, then ingests again.
3. **Expected after the blocker is fixed:** one stable issue row remains, `event_count` progresses `1 -> 2 -> 3`, `last_seen` advances on each ingest, and `status` flips from `resolved` back to `unresolved` after the post-resolve event.
4. **Current blocker:** identical to Test Case 4 — the harness never sees Mesher reach HTTP readiness.

## Edge Cases

### Neutral NULL assignment

1. Exercise `POST /api/v1/issues/:id/assign` with `{"user_id":""}` once the live harness is green.
2. **Expected:** `issues.assigned_to` becomes SQL `NULL`, not an empty-string sentinel.

### Partial settings update

1. Post `{"retention_days":30}` and then `{"sample_rate":0.25}` to `/api/v1/projects/default/settings`.
2. **Expected:** the untouched field remains unchanged after each request.

### Resolved issue regression path

1. Resolve an issue, then ingest another matching event.
2. **Expected:** the existing issue row is reused, `event_count` increments, `last_seen` advances, and `status` becomes `unresolved` again.

## Failure Signals

- `meshc build mesher` fails after the expression rewrite.
- `expr_error_` tests stop returning the exact expected error strings.
- `scripts/verify-m033-s01.sh` reports that an S01-owned write function still uses raw SQL.
- Live route tests stall with only the Mesher startup banner and never observe HTTP readiness.
- DB assertions show empty-string sentinels instead of `NULL`, unchanged timestamps after ack/resolve/revoke, or duplicate issue rows during repeated ingest.

## Requirements Proved By This UAT

- R036 — proves the neutral expression/write surface is real at the compiler/runtime level and is wired into the designated Mesher write families.
- R040 — proves the slice still keeps PG-only JSONB-heavy families explicit instead of leaking them into the neutral baseline.

## Not Proven By This UAT

- Full validation of R036/R040 is not complete yet because the live Mesher route replay still fails before HTTP readiness.
- S02 PG extras, S03 read-side coverage, and S04 partition/schema helpers are intentionally out of scope for this slice.

## Notes for Tester

- If the live Mesher tests fail early, inspect Mesher startup/HTTP serving first; the neutral expression contract itself already has passing direct compiler/runtime coverage.
- If parser errors appear around `Expr.call(...)` or `Expr.case(...)` inside expression maps, use the current working aliases `Expr.fn_call(...)` and `Expr.case_when(...)` until that parser path is repaired.
