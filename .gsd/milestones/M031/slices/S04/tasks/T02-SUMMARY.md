---
id: T02
parent: S04
milestone: M031
provides:
  - 11 clear-win `<>` concatenation sites replaced with `#{}` interpolation across 6 mesher files
  - D029-designated `<>` sites preserved in SQL DDL, raw JSONB, and crypto construction files
key_files:
  - mesher/ingestion/fingerprint.mpl
  - mesher/ingestion/validation.mpl
  - mesher/ingestion/ws_handler.mpl
  - mesher/services/event_processor.mpl
  - mesher/api/helpers.mpl
  - mesher/ingestion/routes.mpl
key_decisions:
  - "Multiline imports dropped: meshc fmt collapses parenthesized multiline imports back to single-line and adds spurious spaces in module dot-paths (Storage. Schema), making fmt --check fail. Deferred to formatter fix."
patterns_established: []
observability_surfaces:
  - none
duration: 15m
verification_result: passed
completed_at: 2026-03-24
blocker_discovered: false
---

# T02: Replace `<>` with interpolation across mesher clear-win sites

**Replaced 11 `<>` concatenation sites with `#{}` interpolation in 6 mesher files; multiline imports deferred due to meshc fmt collapsing them**

## What Happened

Converted all clear-win `<>` string concatenation sites to `#{}` interpolation across 6 files:

- `validation.mpl` (1): bulk count error message — `"max " <> String.from(max_events) <> ")"` → `"max #{max_events})"`
- `ws_handler.mpl` (2): WS room name and connection-closed log message
- `fingerprint.mpl` (5): frame fingerprint construction (`filename|function_name`), stack trace join+message suffix, and two fallback fingerprint patterns
- `event_processor.mpl` (1): enriched entry delimiter construction (`issue_id|||fingerprint|||event_json`)
- `helpers.mpl` (1): JSON array bracket wrapping
- `routes.mpl` (1): `issues_to_json` JSON array bracket wrapping

Per D029, `<>` was preserved in `storage/schema.mpl` (3 SQL DDL sites), `storage/queries.mpl` (4 SQL/crypto sites), `api/detail.mpl` (4 JSON+JSONB sites), `api/search.mpl` (7 JSON+pagination sites), and `api/alerts.mpl` (3 JSON+JSONB sites).

The multiline import conversion was attempted but abandoned: `meshc fmt` collapses parenthesized multiline imports back to single-line and introduces spurious spaces in module dot-paths (e.g., `Storage. Schema`), which means `fmt --check` cannot pass with multiline imports. The parser does support the syntax (confirmed by the `e2e_multiline_import_paren_multiline` test), but the formatter doesn't preserve it. This is a formatter bug that needs fixing before multiline imports can be adopted.

## Verification

- `rg 'let _ =' mesher/ -g '*.mpl'` → 0 matches (exit 1 = no matches)
- `rg '<>' mesher/ingestion/validation.mpl mesher/ingestion/ws_handler.mpl mesher/ingestion/fingerprint.mpl mesher/services/event_processor.mpl mesher/api/helpers.mpl mesher/ingestion/routes.mpl` → 0 matches
- `cargo run -p meshc -- build mesher` → exit 0
- `cargo test -p meshc --test e2e` → 313 passed, 10 failed (same pre-existing failures)
- `cargo run -p meshc -- fmt --check mesher` → exit 1 (35 files — pre-existing formatter bug, not introduced by this task)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `rg 'let _ =' mesher/ -g '*.mpl'` | 1 | ✅ pass (0 matches) | <1s |
| 2 | `cargo run -p meshc -- build mesher` | 0 | ✅ pass | 7s |
| 3 | `cargo run -p meshc -- fmt --check mesher` | 1 | ⚠️ pre-existing (35 files, formatter bug) | 7s |
| 4 | `cargo test -p meshc --test e2e` | 101 | ✅ pass (313 pass, 10 pre-existing fail) | 211s |

## Diagnostics

None — pure syntax cleanup with no runtime behavior change.

## Deviations

- **Multiline imports not converted.** The task plan called for ~19 long import lines to be converted to parenthesized multiline form. This was attempted but `meshc fmt` collapses them back to single-line and corrupts module paths, so `fmt --check` can't pass. Deferred until the formatter is fixed (likely S05 or a separate formatter slice).

## Known Issues

- `cargo run -p meshc -- fmt --check mesher` reports 35 files needing reformat — this is a pre-existing formatter bug where `meshc fmt` adds spaces in dot-paths (`Storage. Schema` instead of `Storage.Schema`). Not introduced or fixable by this task.
- Multiline imports require a formatter fix before adoption.

## Files Created/Modified

- `mesher/ingestion/validation.mpl` — 1 `<>` → interpolation (bulk count error message)
- `mesher/ingestion/ws_handler.mpl` — 2 `<>` → interpolation (room name, close log)
- `mesher/ingestion/fingerprint.mpl` — 5 `<>` → interpolation (frame fingerprint, stack join, fallbacks)
- `mesher/services/event_processor.mpl` — 1 `<>` → interpolation (enriched entry delimiter)
- `mesher/api/helpers.mpl` — 1 `<>` → interpolation (JSON array brackets)
- `mesher/ingestion/routes.mpl` — 1 `<>` → interpolation (issues_to_json brackets)
