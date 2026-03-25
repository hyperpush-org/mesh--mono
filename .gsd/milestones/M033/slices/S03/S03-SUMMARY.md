---
id: S03
parent: M033
milestone: M033
provides:
  - A live Postgres S03 proof bundle covering basic reads, composed live reads, and the owned hard read families.
  - Rewritten Mesher read-side query and response-shaping paths that preserve caller-visible row keys and HTTP payload contracts where the stronger Mesh surfaces are honest.
  - A short, explicit, mechanically enforced S03 raw-read keep-list that downstream slices can treat as the current truthful boundary.
requires:
  - slice: S01
    provides: the neutral `Expr` / `Query` / `Repo` contract used for the builder-backed read rewrites, counts, joins, filtering, and Mesh-side read composition.
  - slice: S02
    provides: the explicit `Pg` helper seam and the neutral-vs-PG boundary rules that S03 reused while deciding which read families could be retired honestly versus kept as named raw sites.
affects:
  - S04
  - S05
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
  - .gsd/DECISIONS.md
  - .gsd/REQUIREMENTS.md
  - .gsd/PROJECT.md
key_decisions:
  - Pivot composed-read verification from the copied storage probe to a live Mesher HTTP/API harness because the probe failures were no longer an honest signal for caller-contract correctness.
  - Keep the remaining unstable read families as explicit named raw keep-sites, enforced by `scripts/verify-m033-s03.sh`, instead of forcing a dishonest universal builder rewrite.
  - Normalize unstable Mesher row maps through concrete derived structs and `Json.encode(...)` / `Json.get(...)` before building JSON responses or pagination cursors on the live route path.
  - Treat `get_event_alert_rules(...)` as the fireable-rule boundary and flush the writer after accepted event stores so the live Postgres alert/read proofs remain deterministic.
patterns_established:
  - When temporary Mesh storage probes hit typed-list or aggregate staging artifacts, move verification up to the live Mesher surface instead of extending a misleading harness.
  - Enforce raw-boundary contracts with a function-block verifier that names allowed keep-sites and offending drift, rather than relying on ad hoc grep or memory.
  - On the live Mesher route path, normalize row maps through derived structs before JSON serialization or cursor extraction to avoid blank fields and pointer-stringification drift.
  - Decode percent-encoded cursor query parameters at the route layer before passing timestamps or IDs into SQL.
  - For low-volume asynchronous ingest proofs, explicitly flush the writer after accepted stores so live Postgres assertions observe the intended state transition deterministically.
observability_surfaces:
  - `compiler/meshc/tests/e2e_m033_s03.rs` with named `basic_reads`, `composed_reads`, and `hard_reads` failures that isolate the drifting family.
  - Mesher stdout/stderr capture inside the S03 Rust harness, surfaced on failing live-route assertions.
  - `scripts/verify-m033-s03.sh` and its Python keep-list sweep, which names offending raw-query drift by function block.
drill_down_paths:
  - .gsd/milestones/M033/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M033/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M033/slices/S03/tasks/T03-SUMMARY.md
  - .gsd/milestones/M033/slices/S03/tasks/T04-SUMMARY.md
  - .gsd/milestones/M033/slices/S03/tasks/T05-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-25T22:03:04.058Z
blocker_discovered: false
---

# S03: Hard read-side coverage and honest raw-tail collapse

**Closed Mesher’s honest read-side collapse with live Postgres proofs, builder-backed rewrites where they stayed truthful, and a mechanically enforced named raw-read keep-list for the remaining unstable families.**

## What Happened

S03 started by seeding a dedicated `compiler/meshc/tests/e2e_m033_s03.rs` harness and retiring the lowest-risk raw read helpers in `mesher/storage/queries.mpl`, but the copied storage-probe path immediately exposed two truth-surface problems: Rust-authored Mesh probe templates were emitting broken escaped quotes, and the probe strategy itself was not an honest verifier for the harder read families because typed struct-list and aggregate paths hit compiler/runtime artifacts that the real Mesher app did not share.

Instead of extending that misleading proof surface, the slice pivoted to a live Mesher HTTP/API harness. The composed-read proofs were rewritten to exercise the real `search`, `dashboard`, `detail`, `alerts`, and `team` caller contracts against live Postgres and to capture Mesher stdout/stderr on failure. That pivot surfaced the real remaining work: blank or pointer-stringified row fields on live JSON responses, percent-encoded cursor timestamps reaching SQL unchanged, unstable alert cooldown behavior on the event-rule selector path, and low-volume accepted events not flushing quickly enough for deterministic live assertions.

The final closeout fixed those caller-visible issues in the smallest honest places. `mesher/storage/queries.mpl` now keeps the mechanically expressible read helpers on `Query` / `Expr` / `Pg` or small Mesh-side composition, rewrites `project_health_summary(...)` into builder-backed counts plus one-row composition, and keeps the unstable leftovers as explicit named raw keep-sites rather than forcing a dishonest builder rewrite. `mesher/api/search.mpl`, `mesher/api/detail.mpl`, `mesher/api/dashboard.mpl`, and `mesher/api/team.mpl` normalize unstable row maps through concrete derived structs and `Json.encode(...)` / `Json.get(...)` before building HTTP JSON or pagination cursors. `mesher/ingestion/routes.mpl` now normalizes event-rule rows and treats `get_event_alert_rules(...)` as the fireable-rule boundary, while `mesher/services/event_processor.mpl` explicitly flushes the writer after accepted stores so the live Postgres proof path stays deterministic.

The slice finished by expanding `compiler/meshc/tests/e2e_m033_s03.rs` to 9 passing `basic_reads`, `composed_reads`, and `hard_reads` tests, and by adding `scripts/verify-m033-s03.sh` as the stable acceptance gate. That verifier reruns the full S03 test target, Mesher fmt/build checks, and a Python keep-list sweep that names the only allowed S03 raw read families while explicitly excluding the S04-owned partition/catalog raw sites. The result is an honest read-side boundary: most recurring read work now uses the stronger Mesh surfaces, and the remaining raw tail is short, named, and mechanically enforced.

## Verification

Ran the full slice proof matrix from the plan and all gates passed.

- `cargo test -p meshc --test e2e_m033_s03 -- --nocapture` → passed with 9/9 tests green, covering:
  - `e2e_m033_s03_basic_reads_issue_helpers`
  - `e2e_m033_s03_basic_reads_session_and_project_helpers`
  - `e2e_m033_s03_basic_reads_api_key_and_alert_rule_lists`
  - `e2e_m033_s03_composed_reads_joined_issue_and_team_rows`
  - `e2e_m033_s03_composed_reads_dashboard_aggregates`
  - `e2e_m033_s03_composed_reads_detail_and_issue_event_lists`
  - `e2e_m033_s03_composed_reads_alert_lists_and_predicates`
  - `e2e_m033_s03_hard_reads_filtered_issue_cursor_and_health_summary`
  - `e2e_m033_s03_hard_reads_neighbors_and_threshold_rule_probe`
- `cargo run -q -p meshc -- fmt --check mesher` → passed.
- `cargo run -q -p meshc -- build mesher` → passed.
- `bash scripts/verify-m033-s03.sh` → passed, rerunning the S03 test target plus fmt/build and the named raw keep-list sweep.

Those checks verified live Postgres-backed basic reads, joined/list/aggregate caller contracts, filtered issue pagination, project health summary counts, event neighbor navigation, threshold-rule evaluation, and the explicit S03 raw-boundary contract.

## Requirements Advanced

- R038 — Advanced the honest raw-tail-collapse requirement from a mapped goal to live evidence by moving the recurring read-side families onto stronger Mesh query surfaces where they stayed truthful, and by adding `scripts/verify-m033-s03.sh` to enforce the short named raw-read keep-list mechanically.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

The slice had to move beyond the original query-only focus to make the promised live proof surface honest. In addition to the storage-query rewrites, closeout required targeted runtime and route-shaping fixes: typed row normalization in `mesher/api/{search,dashboard,detail,team}.mpl`, local percent-decoding for cursor query parameters in `mesher/api/search.mpl`, selector-side cooldown filtering through `get_event_alert_rules(...)` on the ingestion path, and an explicit `StorageWriter.flush(...)` after accepted stores in `mesher/services/event_processor.mpl`. These were execution-time adaptations to stabilize the real Mesher caller contracts, not a slice replan.

## Known Limitations

The S03 raw tail is now short and explicit, but it is still non-zero by design. `scripts/verify-m033-s03.sh` currently allows the named S03 raw read keep-sites (`list_issues_filtered`, `event_volume_hourly`, `check_volume_spikes`, `extract_event_fields`, `get_event_neighbors`, `get_event_alert_rules`, `list_alerts`, `get_threshold_rules`, `should_fire_by_cooldown`, `evaluate_threshold_rule`, and `check_sample_rate`) because forcing those families onto the current builder/runtime path would still be dishonest or unstable.

Issue-list pagination also still uses the route’s current `count == limit` `has_more` rule, so an exactly full page can advertise another cursor even when the immediately following page is empty. The new hard-read proof documents that behavior and verifies the empty follow-on page, but the route does not yet overfetch a sentinel row before setting `has_more`.

## Follow-ups

S04 should preserve the explicit raw-boundary contract and the verifier’s partition/catalog exclusions instead of broadening the read-side keep-list accidentally while working on schema helpers.

S05 should reuse `compiler/meshc/tests/e2e_m033_s03.rs` and `scripts/verify-m033-s03.sh` as the authoritative read-side baseline during the integrated replay and docs closeout.

If the product needs exact terminal-page `has_more` semantics later, the next change should be an overfetch/sentinel-row pagination fix rather than another cursor-format workaround.

## Files Created/Modified

- `compiler/meshc/tests/e2e_m033_s03.rs` — Added the live Postgres S03 harness with 9 named `basic_reads`, `composed_reads`, and `hard_reads` proofs plus live Mesher HTTP/DB helpers.
- `scripts/verify-m033-s03.sh` — Added the slice verifier that reruns the full S03 test target, Mesher fmt/build gates, and a Python raw keep-list sweep.
- `mesher/storage/queries.mpl` — Retired the honest read helpers onto `Query` / `Expr` / `Pg` or small Mesh-side composition, narrowed the hard read paths, and made the remaining raw read keep-sites explicit and named.
- `mesher/api/search.mpl` — Normalized issue/event rows through typed shapes and added local percent-decoding so live JSON and cursor pagination stay stable.
- `mesher/api/dashboard.mpl` — Stabilized dashboard row serialization for volume, breakdown, top-issue, timeline, and health responses on the live Mesher path.
- `mesher/api/detail.mpl` — Normalized event detail rows through the derived `Event` shape before emitting JSON and navigation metadata.
- `mesher/api/team.mpl` — Normalized membership/user rows through typed shapes so team responses keep stable fields on the live route path.
- `mesher/ingestion/routes.mpl` — Normalized event-rule selector rows and moved cooldown eligibility into the selector boundary for deterministic live alert firing.
- `mesher/services/event_processor.mpl` — Added an explicit post-store writer flush so accepted low-volume events reach Postgres during the live S03 proofs.
- `.gsd/KNOWLEDGE.md` — Captured the S03 probe-limit, cursor-decoding, row-normalization, and writer-flush gotchas for future slices.
- `.gsd/DECISIONS.md` — Recorded the live-harness pivot, selector-side cooldown rule, and explicit raw keep-site boundary decisions for S03 closeout.
- `.gsd/REQUIREMENTS.md` — Updated R038 with the S03 evidence while keeping final validation dependent on S04/S05.
- `.gsd/PROJECT.md` — Refreshed current state to mark M033/S03 complete and narrowed the next work to S04/S05.
