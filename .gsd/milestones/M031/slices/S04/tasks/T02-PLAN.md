---
estimated_steps: 4
estimated_files: 15
skills_used: []
---

# T02: Replace `<>` with interpolation and convert long imports to multiline

**Slice:** S04 — Mesher Dogfood Cleanup
**Milestone:** M031

## Description

Replace ~10 `<>` string concatenations with `#{}` interpolation where clearly more readable, and convert 13 import lines over 120 chars to the parenthesized multiline form `from Module import (\n  name1,\n  name2\n)`. Per D029, keep `<>` for SQL DDL construction (`storage/schema.mpl`), raw JSONB field embedding (`api/detail.mpl`, `api/search.mpl`, `api/alerts.mpl`), and crypto/SQL expression construction (`storage/queries.mpl`).

## Steps

1. **Replace `<>` with interpolation in clear-win files.** These files have straightforward `<>` usage that's clearly better as interpolation:
   - `mesher/ingestion/validation.mpl` (1 site): `"too many events (max " <> String.from(max_events) <> ")"` → `"too many events (max #{max_events})"`
   - `mesher/ingestion/ws_handler.mpl` (2 sites): `"project:" <> project_id` → `"project:#{project_id}"`, and the connection-closed message
   - `mesher/ingestion/fingerprint.mpl` (5 sites): Frame fingerprint construction — convert `filename <> "|" <> function_name` etc. to interpolation
   - `mesher/services/event_processor.mpl` (1 site): `build_enriched_entry` delimiter joining
   - `mesher/api/helpers.mpl` (1 site): `to_json_array` brackets — `"[" <> String.join(items, ",") <> "]"` → `"[#{String.join(items, ",")}]"`
   - `mesher/ingestion/routes.mpl` (1 site): if present and clearly readable
   Build-verify: `cargo run -p meshc -- build mesher`.

2. **Verify `<>` decision for files we're keeping as-is.** Confirm that `storage/schema.mpl` (3 SQL DDL), `storage/queries.mpl` (4 SQL/crypto), `api/detail.mpl` (4 JSON+JSONB), `api/search.mpl` (7 JSON+pagination), `api/alerts.mpl` (3 JSON+JSONB) all fall under D029's "keep `<>`" guidance. No edits to these files for `<>`.

3. **Convert all imports >120 chars to multiline parenthesized form (~20 lines across ~12 files).** For each, convert from single-line to:
   ```
   from Module import (
     name1,
     name2,
     name3
   )
   ```
   Run `rg '^from ' mesher/ -g '*.mpl' | awk '{if(length > 120) print FILENAME": "length}'` to find all candidates. Key files: `mesher/ingestion/routes.mpl` (310), `mesher/main.mpl` (6 imports: 208, 202, 192, 172, 129, 128), `mesher/api/dashboard.mpl` (2: 193, 129), `mesher/api/alerts.mpl` (2: 176, 126), `mesher/api/team.mpl` (2: 164, 124), `mesher/services/user.mpl` (168), `mesher/services/project.mpl` (161), `mesher/services/retention.mpl` (146), `mesher/api/search.mpl` (2: 139, 126), `mesher/ingestion/pipeline.mpl` (135). Skip `mesher/tests/validation.test.mpl` (124) — test file, borderline.
   Build-verify after the batch.

4. **Final verification.** Run `cargo run -p meshc -- build mesher`, `cargo run -p meshc -- fmt --check mesher`, and `cargo test -p meshc --test e2e` to confirm everything is clean.

## Must-Haves

- [ ] ~10 clear-win `<>` sites converted to interpolation
- [ ] `<>` kept for SQL DDL, raw JSONB, manual JSON, and crypto construction (per D029)
- [ ] ~19 long imports (>120 chars) converted to parenthesized multiline form
- [ ] `cargo run -p meshc -- build mesher` succeeds
- [ ] `cargo run -p meshc -- fmt --check mesher` succeeds
- [ ] `cargo test -p meshc --test e2e` → 313+ pass

## Verification

- `cargo run -p meshc -- build mesher` → exit 0
- `cargo run -p meshc -- fmt --check mesher` → exit 0
- `cargo test -p meshc --test e2e` → 313+ pass, 10 pre-existing failures

## Inputs

- `mesher/ingestion/validation.mpl` — 1 `<>` to convert
- `mesher/ingestion/ws_handler.mpl` — 2 `<>` to convert (T01 already removed its `let _ =`)
- `mesher/ingestion/fingerprint.mpl` — 5 `<>` to convert
- `mesher/services/event_processor.mpl` — 1 `<>` to convert
- `mesher/api/helpers.mpl` — 1 `<>` to convert
- `mesher/ingestion/routes.mpl` — 1 `<>` to convert, 1 long import (T01 already removed its `let _ =`)
- `mesher/main.mpl` — 5 long imports
- `mesher/api/dashboard.mpl` — 1 long import
- `mesher/api/alerts.mpl` — 1 long import
- `mesher/api/team.mpl` — 1 long import
- `mesher/services/user.mpl` — 1 long import
- `mesher/services/project.mpl` — 1 long import
- `mesher/services/retention.mpl` — 1 long import
- `mesher/api/search.mpl` — 1 long import
- `mesher/ingestion/pipeline.mpl` — 1 long import (T01 already modified this file)

## Expected Output

- `mesher/ingestion/validation.mpl` — interpolation replacing `<>`
- `mesher/ingestion/ws_handler.mpl` — interpolation replacing `<>`
- `mesher/ingestion/fingerprint.mpl` — interpolation replacing `<>`
- `mesher/services/event_processor.mpl` — interpolation replacing `<>`
- `mesher/api/helpers.mpl` — interpolation replacing `<>`
- `mesher/ingestion/routes.mpl` — interpolation + multiline import
- `mesher/main.mpl` — 5 multiline imports
- `mesher/api/dashboard.mpl` — multiline import
- `mesher/api/alerts.mpl` — multiline import
- `mesher/api/team.mpl` — multiline import
- `mesher/services/user.mpl` — multiline import
- `mesher/services/project.mpl` — multiline import
- `mesher/services/retention.mpl` — multiline import
- `mesher/api/search.mpl` — multiline import
- `mesher/ingestion/pipeline.mpl` — multiline import
