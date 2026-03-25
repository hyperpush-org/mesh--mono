# T02 partial execution handoff

## Status
- **Task is not complete.** I stopped because of the context-budget wrap-up warning before finishing the test harness, rerunning verification, or truthfully marking the task complete.
- I **did** complete the main `mesher/storage/queries.mpl` rewrite pass for the T02 helper set.
- I **did not** finish `compiler/meshc/tests/e2e_m033_s03.rs` quote cleanup + new `composed_reads` coverage, so no T02 verification gate was rerun after the query edits.

## What changed
I rewrote these helpers in `mesher/storage/queries.mpl` off raw projection/order/group fragments onto the current builder surface where it is already honest:
- `get_project_by_api_key`
- `list_issues_by_status`
- `list_events_for_issue`
- `event_volume_hourly`
- `error_breakdown_by_level`
- `top_issues_by_frequency`
- `event_breakdown_by_tag`
- `get_event_detail`
- `get_members_with_users`
- `check_new_issue`
- `should_fire_by_cooldown`
- `list_alerts`

I also added a local helper:
- `normalize_time_bucket` to clamp dashboard buckets to `hour`/`day` because `mesher/api/dashboard.mpl` comments claim validation exists, but the handler currently forwards the raw query param.

## Important local details
- I intentionally kept **small raw seams** only where the current builder still lacks the primitive:
  - interval predicates like `received_at > now() - interval '24 hours'`
  - tuple keyset cursor predicate in `list_events_for_issue`
  - join `ON` strings (the surface still requires raw join clauses)
- The aggregate rewrites rely on **alias-based** `Query.group_by(:bucket)` / `Query.group_by(:tag_value)` and `Query.order_by(:count, :desc)` over `select_exprs` aliases. This still needs to be verified against the real runtime.
- `top_issues_by_frequency` now selects `event_count` through structured expressions but still orders with `Query.order_by(:event_count, :desc)`. This also needs real verification because alias-vs-source resolution is runtime-sensitive.

## Reproduced failure before stopping
I reproduced the known T01 harness failure before editing anything:
- Command: `cargo test -p meshc --test e2e_m033_s03 basic_reads -- --nocapture`
- Result: **failed** with Mesh parse errors from literal `\"...\"` inside the Rust raw-string Mesh probe templates in `compiler/meshc/tests/e2e_m033_s03.rs`.

## What remains next
1. **Fix the existing escaped quotes** in `compiler/meshc/tests/e2e_m033_s03.rs` raw-string probe templates (`\"...\"` -> `"..."` inside the emitted Mesh source).
2. Add named `e2e_m033_s03_composed_reads_*` coverage for:
   - joined/list helpers (`get_project_by_api_key`, `get_members_with_users`, `list_issues_by_status`, `list_events_for_issue`, `check_new_issue`, `should_fire_by_cooldown`)
   - aggregate helpers (`event_volume_hourly`, `error_breakdown_by_level`, `top_issues_by_frequency`, `event_breakdown_by_tag`)
   - detail/alerts helpers (`get_event_detail`, `list_alerts`)
3. Rerun at least:
   - `cargo test -p meshc --test e2e_m033_s03 basic_reads -- --nocapture` (to confirm the old harness is repaired)
   - `cargo test -p meshc --test e2e_m033_s03 composed_reads -- --nocapture`
   - `cargo run -q -p meshc -- build mesher`
4. Only after those pass should T02 be marked complete.

## Files modified in this partial unit
- `mesher/storage/queries.mpl`

## Commands already run in this unit
- `cargo test -p meshc --test e2e_m033_s03 basic_reads -- --nocapture` → failed with the pre-existing probe-quote parse errors.

## Resume caution
Do **not** call `gsd_task_complete` from this partial state. The task has not met its verification bar yet, and the task summary/checkbox should remain incomplete until the harness and T02 checks pass.