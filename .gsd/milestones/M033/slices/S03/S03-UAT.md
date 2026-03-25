# S03: Hard read-side coverage and honest raw-tail collapse — UAT

**Milestone:** M033
**Written:** 2026-03-25T22:03:04.060Z

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: S03’s contract is a live Postgres-backed read-path and raw-boundary proof, so the authoritative acceptance surface is the Mesher-backed Rust harness plus the keep-list verifier.

## Preconditions

- Docker is running locally and can start the `postgres:16` container used by `compiler/meshc/tests/e2e_m033_s03.rs`.
- The repo builds from the working tree with `cargo` available.
- No local process conflicts with the ephemeral Mesher ports chosen by the test harness.
- `compiler/meshc/tests/e2e_m033_s03.rs` and `scripts/verify-m033-s03.sh` are present in the workspace.

## Smoke Test

1. Run `cargo test -p meshc --test e2e_m033_s03 -- --nocapture`.
2. **Expected:** all 9 `e2e_m033_s03_*` tests pass, covering `basic_reads`, `composed_reads`, and `hard_reads` on live Postgres.

## Test Cases

### 1. Basic read helpers stay on the honest builder path

1. Run `cargo test -p meshc --test e2e_m033_s03 e2e_m033_s03_basic_reads_issue_helpers -- --nocapture`.
2. Run `cargo test -p meshc --test e2e_m033_s03 e2e_m033_s03_basic_reads_session_and_project_helpers -- --nocapture`.
3. Run `cargo test -p meshc --test e2e_m033_s03 e2e_m033_s03_basic_reads_api_key_and_alert_rule_lists -- --nocapture`.
4. **Expected:** all three tests pass, and the underlying queries preserve caller-visible keys such as `cnt`, `project_id`, `token`, `revoked_at`, `retention_days`, `sample_rate`, `event_count`, and `estimated_bytes`.

### 2. Live composed reads preserve Mesher HTTP caller contracts

1. Run `cargo test -p meshc --test e2e_m033_s03 composed_reads -- --nocapture`.
2. **Expected:** the joined/team rows, dashboard aggregates, detail/event-list responses, and alert list/predicate flows all pass on the live Mesher HTTP/API surface.
3. **Expected:** no failing `e2e_m033_s03_composed_reads_*` family reports blank fields, pointer-stringified values, `non-exhaustive match in switch`, or missing fresh-alert behavior.

### 3. Hard read families and the raw-tail boundary remain honest

1. Run `cargo test -p meshc --test e2e_m033_s03 hard_reads -- --nocapture`.
2. Run `bash scripts/verify-m033-s03.sh`.
3. **Expected:** the hard-read proofs pass for filtered issue pagination, project health summary counts, event neighbors, and threshold-rule evaluation.
4. **Expected:** the verifier passes and its Python sweep allows only the named S03 raw read keep-sites while excluding the S04-owned partition/catalog functions.

### 4. Mesher source still formats and builds cleanly after the read-side rewrite

1. Run `cargo run -q -p meshc -- fmt --check mesher`.
2. Run `cargo run -q -p meshc -- build mesher`.
3. **Expected:** both commands succeed with no formatter drift or Mesher build regression.

## Edge Cases

### Percent-encoded cursor decoding still works on the live route path

1. Run `cargo test -p meshc --test e2e_m033_s03 e2e_m033_s03_composed_reads_detail_and_issue_event_lists -- --nocapture`.
2. **Expected:** cursor-based issue-event pagination accepts the encoded timestamp/id cursors exercised by the harness and does not fail with PostgreSQL timestamp parse errors.

### Exact terminal-page pagination behavior is documented, not hidden

1. Run `cargo test -p meshc --test e2e_m033_s03 e2e_m033_s03_hard_reads_filtered_issue_cursor_and_health_summary -- --nocapture`.
2. **Expected:** the proof reaches the empty third page successfully, confirming the current `count == limit` `has_more` behavior without treating the exact-terminal-page empty follow-up as a crash or data-shape regression.

## Failure Signals

- Any non-zero exit from `cargo test -p meshc --test e2e_m033_s03 -- --nocapture`, `cargo run -q -p meshc -- fmt --check mesher`, `cargo run -q -p meshc -- build mesher`, or `bash scripts/verify-m033-s03.sh`.
- A failing named `e2e_m033_s03_*` family in the test output.
- Blank fields, pointer-like numeric strings, cursor parse failures, missing alert rows, or missing bucket/count values in the live Mesher HTTP assertions.
- A keep-list verifier failure naming an unexpected raw-query function block in `mesher/storage/queries.mpl`.

## Requirements Proved By This UAT

- R038 — advances the honest read-side coverage and raw-tail-collapse contract by proving the live read families that moved onto stronger Mesh surfaces and by mechanically enforcing the remaining named keep-list.

## Not Proven By This UAT

- S04’s partition/schema helper work and the remaining DDL-side raw-tail collapse.
- S05’s documentation closeout and the final integrated milestone replay.

## Notes for Tester

These tests are self-contained: the Rust harness starts its own Postgres container, builds/spawns Mesher as needed, and names the failing read family when something drifts. If the suite goes red, start from the first failing `e2e_m033_s03_*` family and the harness-captured Mesher logs before changing the query layer or broadening the keep-list.
