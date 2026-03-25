---
id: T05
parent: S03
milestone: M033
key_files:
  - compiler/meshc/tests/e2e_m033_s03.rs
  - scripts/verify-m033-s03.sh
  - mesher/storage/queries.mpl
  - mesher/api/search.mpl
  - mesher/api/dashboard.mpl
  - mesher/api/detail.mpl
  - mesher/api/team.mpl
  - mesher/ingestion/routes.mpl
  - mesher/services/event_processor.mpl
  - .gsd/KNOWLEDGE.md
  - .gsd/DECISIONS.md
key_decisions:
  - Keep the unstable live read families as explicit named raw keep-sites instead of forcing builder paths that mis-shaped or crashed the real Mesher proof surface.
  - Normalize unstable Mesher row maps through concrete derived structs before emitting JSON or pagination cursors when direct `Map.get(...)` stringification blanks fields or produces raw pointer values.
  - Determine event-alert cooldown eligibility inside `get_event_alert_rules(...)` and explicitly flush the writer after accepted stores so the live Postgres acceptance path stays deterministic.
duration: ""
verification_result: passed
completed_at: 2026-03-25T21:48:52.732Z
blocker_discovered: false
---

# T05: Close S03 with a passing live Postgres verifier, hard-read coverage, and a named raw keep-list gate

**Close S03 with a passing live Postgres verifier, hard-read coverage, and a named raw keep-list gate**

## What Happened

I started by reading the S03 slice/task plans and the current Mesher harness, query file, and S02 verifier pattern before changing code. A full live `cargo test -p meshc --test e2e_m033_s03 -- --nocapture` repro showed the remaining failures were real product-side caller/runtime drift, not just missing tests: `/api/v1/projects/:project_id/issues` and `/api/v1/projects/:project_id/alerts` crashed or blanked row fields, `/api/v1/issues/:issue_id/events` crashed and then later pointer-stringified row values/cursors, `/api/v1/projects/:project_id/dashboard/volume` dropped bucket values, and accepted `/api/v1/events` writes were not being flushed promptly enough for the live proof surface.

I fixed the live read-side drift in the smallest honest places that made the acceptance path stable. In `mesher/storage/queries.mpl`, I kept the builder-backed families that were already behaving honestly, but moved the unstable live families onto explicit named raw keep-sites instead of pretending the current builder/runtime path was safe: `list_issues_filtered`, `event_volume_hourly`, `list_alerts`, `get_event_alert_rules`, `get_threshold_rules`, `should_fire_by_cooldown`, and the existing raw read keep-sites are now explicit and discoverable. I also repaired `evaluate_threshold_rule(...)` to stop carrying the stale unused SQL parameter and kept its boolean contract explicit. To restore truthful low-volume ingest in the live Mesher harness, I added an immediate `StorageWriter.flush(writer_pid)` after `StorageWriter.store(...)` in `mesher/services/event_processor.mpl`; this preserved the accepted-event flow while making the real Postgres evidence deterministic again.

On the API surface, I fixed the live row-shape and cursor bugs in-place instead of weakening the harness. In `mesher/api/search.mpl`, `mesher/api/detail.mpl`, and `mesher/api/team.mpl`, I normalized unstable row maps through concrete derived structs (`Event`, `Issue`, `User`, `OrgMembership`) and then read the needed fields back through `Json.encode(...)`/`Json.get(...)` before building responses or pagination cursors. That removed the blank-field, pointer-stringification, and cursor-metadata drift on the real Mesher HTTP path. I also added a local percent-decoder for cursor query params because `Request.query(...)` was handing the encoded timestamp through unchanged. In `mesher/api/dashboard.mpl`, I switched the affected row serializers to explicit JSON strings so the volume, top-issue, tag, and timeline payloads matched the Postgres assertions again. In `mesher/ingestion/routes.mpl`, I normalized event-rule rows through a concrete `EventRuleRow` shape and folded new-issue cooldown gating into `get_event_alert_rules(...)`, so the selector itself returns only fireable rules and the hot-rule false positive disappeared.

Once the live product surface was stable again, I finished the proof bundle the slice contract asked for. `compiler/meshc/tests/e2e_m033_s03.rs` now has 9 passing tests covering `basic_reads`, `composed_reads`, and new `hard_reads` families. The new hard-read coverage proves filtered issue keyset pagination plus project health summary on the live Mesher HTTP surface, and verifies `get_event_neighbors(...)` plus `evaluate_threshold_rule(...)` directly against live Postgres via the Mesh storage probe harness. I then added `scripts/verify-m033-s03.sh`, modeled on the S02 verifier pattern, so the slice has one stable acceptance command that runs the full S03 test target, `meshc fmt --check mesher`, `meshc build mesher`, and a Python keep-list sweep that names the allowed S03 raw read keep-sites while explicitly excluding the S04 partition/catalog raw sites.

I also recorded the new downstream guidance in `.gsd/KNOWLEDGE.md` and saved decision D063 about folding event-alert cooldown eligibility into the selector boundary instead of a second per-rule live read.

## Verification

Verified the complete S03 closeout path with the four task-plan commands. `cargo test -p meshc --test e2e_m033_s03 -- --nocapture` passed with 9/9 tests green, covering `basic_reads`, `composed_reads`, and the new `hard_reads` family on live Postgres. `cargo run -q -p meshc -- fmt --check mesher` passed after formatting `mesher/storage/queries.mpl`. `cargo run -q -p meshc -- build mesher` passed after the live-path fixes. `bash scripts/verify-m033-s03.sh` passed end-to-end, rerunning the S03 test target, Mesher fmt/build checks, and the named raw keep-list sweep that rejects unexpected whole-query raw read drift while allowing only the explicit S03 keep-sites and the S04-owned partition/catalog exclusions.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cargo test -p meshc --test e2e_m033_s03 -- --nocapture` | 0 | ✅ pass | 184665ms |
| 2 | `cargo run -q -p meshc -- fmt --check mesher` | 0 | ✅ pass | 7715ms |
| 3 | `cargo run -q -p meshc -- build mesher` | 0 | ✅ pass | 17182ms |
| 4 | `bash scripts/verify-m033-s03.sh` | 0 | ✅ pass | 215097ms |


## Deviations

Added targeted Mesher runtime-path fixes outside the original read-helper/query-script focus where the live S03 acceptance harness exposed real caller/runtime drift: typed row normalization in `mesher/api/{search,dashboard,detail,team}.mpl`, explicit event-writer flush after accepted ingestion in `mesher/services/event_processor.mpl`, and selector-side cooldown filtering in `mesher/ingestion/routes.mpl` plus `mesher/storage/queries.mpl`. These were local execution adaptations needed to make the contracted live proof surface truthful; no slice replan was required.

## Known Issues

Issue-list pagination still uses the route’s current `count == limit` `has_more` rule, so a full page can advertise another cursor even when the immediately following page is empty. The new hard-read proof now walks that third-page empty case explicitly, but the route does not yet prefetch a sentinel row for exact terminal-page `has_more`.

## Files Created/Modified

- `compiler/meshc/tests/e2e_m033_s03.rs`
- `scripts/verify-m033-s03.sh`
- `mesher/storage/queries.mpl`
- `mesher/api/search.mpl`
- `mesher/api/dashboard.mpl`
- `mesher/api/detail.mpl`
- `mesher/api/team.mpl`
- `mesher/ingestion/routes.mpl`
- `mesher/services/event_processor.mpl`
- `.gsd/KNOWLEDGE.md`
- `.gsd/DECISIONS.md`
