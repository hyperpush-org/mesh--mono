# S01 closeout reassessment — still incomplete, now with concrete crash sites

## Status
Slice S01 is **still not ready for closeout**, but the blocker is now narrower and better localized than the prior assessment.

## What changed in this unit
- Audited the current M033 state against repo evidence instead of trusting stale roadmap/task assumptions.
- Confirmed S01 has real implementation artifacts and proofs, but S02 is still plan/research only.
- Fixed one live Mesher startup crash in `mesher/storage/schema.mpl` by removing the `create_partition(...) ?` helper call from the recursive partition loop and executing the built DDL inline with `Repo.execute_raw(pool, build_partition_sql(date_str), []) ?`.
- Rebuilt Mesher successfully with `cargo run -q -p meshc -- build mesher`.
- Re-ran `cargo test -p meshc --test e2e_m033_s01 e2e_m033_mesher_mutations -- --nocapture`.

## New verified findings
### 1. The old S01 readiness blocker was real, but its first root cause is now fixed
Before the schema change, Mesher crashed during startup after:
- `[Mesher] Connecting to PostgreSQL...`
- `[Mesher] Running in standalone mode (no distribution)`

LLDB localized that crash to:
- `Storage_Schema__create_partitions_loop`
- specifically the generated Ok-path dereference after `create_partition(...) ?`

After the inline `Repo.execute_raw(...) ?` change in `mesher/storage/schema.mpl`, Mesher now starts far enough to log:
- partition creation
- service startup
- websocket startup
- HTTP startup

So the startup/readiness blocker is no longer "Mesher never becomes ready" in the broad sense; it was at least partly a real runtime crash in the partition bootstrap path.

### 2. The remaining live S01 blocker is now an event-path crash, not startup readiness
After the schema fix, the live mutation test no longer fails waiting for readiness. It now fails when exercising the real ingest route:
- `POST /api/v1/events` returns an incomplete response
- the Mesher process exits with `SIGSEGV` / `EXC_BAD_ACCESS`

Manual reproduction plus LLDB localized the new crash to:
- `__actor_alert_evaluator_body`
- specifically the Ok-path dereference around `Ingestion_Pipeline__log_eval_result`

This means the current closeout blocker is now in the threshold alert evaluator path, not in the neutral expression write-path rewrites themselves.

## Evidence from this unit
Passing:
- `cargo run -q -p meshc -- build mesher`

Failing but informative:
- `cargo test -p meshc --test e2e_m033_s01 e2e_m033_mesher_mutations -- --nocapture`
  - Mesher reaches HTTP/WebSocket startup
  - test then fails because `POST /api/v1/events` gets an empty/incomplete response after the process crashes
- LLDB on `./mesher/mesher`
  - first crash site: `Storage_Schema__create_partitions_loop` (startup path, now mitigated)
  - second crash site: `__actor_alert_evaluator_body` (current blocker)

## Disk/task state corrections made
- Updated `mesher/storage/schema.mpl` with the startup crash mitigation.
- Corrected `S01-PLAN.md` task checkboxes so T02 and T03 are no longer marked complete while their live-route verification is still failing.

## Resume point
Start from the alert-evaluator crash, not from generic startup debugging.

### Highest-value next step
Inspect `mesher/ingestion/pipeline.mpl` and the generated Ok/Error handling around:
- `evaluate_all_threshold_rules(...)`
- `log_eval_result(...)`
- `__actor_alert_evaluator_body`

The likely bug class is another bad lowering/runtime ABI path around `Result<Int, String>` handling inside the actor loop, similar in shape to the earlier partition-loop crash.

### Commands to resume with
- `cargo run -q -p meshc -- build mesher`
- `cargo test -p meshc --test e2e_m033_s01 e2e_m033_mesher_mutations -- --nocapture`
- `cargo test -p meshc --test e2e_m033_s01 e2e_m033_mesher_issue_upsert -- --nocapture`
- LLDB on `./mesher/mesher` if the actor crash remains

## Conclusion
S01 should remain open. The neutral write-path work is present, and one real startup crash has been removed, but live Mesher acceptance is still blocked by a separate crash in the alert evaluator event path. S02 should not be treated as complete at all from the current repo state.