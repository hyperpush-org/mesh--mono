# S04: Mesher Dogfood Cleanup

**Goal:** `mesher/` builds with zero `let _ =` for side effects, string interpolation replacing `<>` where clearly more readable, multiline imports for long lines, and `else if` chains replacing nested else/if.
**Demo:** `rg 'let _ =' mesher/ -g '*.mpl'` returns zero matches; `cargo run -p meshc -- build mesher` succeeds; code reads idiomatically.

## Must-Haves

- All 72 `let _ =` bindings removed across 6 files — bare expression statements used instead
- 3 nested `else`+`if` sites flattened to `else if`
- ~10 `<>` concatenations replaced with `#{}` interpolation where clearly more readable (per D029: keep `<>` for SQL DDL, raw JSONB embedding, manual JSON construction)
- ~19 long import lines (>120 chars) converted to parenthesized multiline `from Module import (\n  a,\n  b\n)` form
- All existing e2e tests pass (313+ pass, 10 pre-existing failures)
- `cargo run -p meshc -- build mesher` succeeds

## Verification

- `rg 'let _ =' mesher/ -g '*.mpl'` → 0 matches
- `cargo run -p meshc -- build mesher` → exit 0
- `cargo run -p meshc -- fmt --check mesher` → exit 0
- `cargo test -p meshc --test e2e` → 313+ pass, 10 pre-existing failures unchanged

## Tasks

- [x] **T01: Remove `let _ =` and flatten `else if` across mesher** `est:45m`
  - Why: 72 `let _ =` bindings suppress side-effect return values unnecessarily; 3 nested else/if blocks should be `else if` chains. This is the high-count mechanical half of the cleanup.
  - Files: `mesher/ingestion/pipeline.mpl`, `mesher/ingestion/routes.mpl`, `mesher/storage/queries.mpl`, `mesher/services/retention.mpl`, `mesher/services/writer.mpl`, `mesher/ingestion/ws_handler.mpl`, `mesher/api/search.mpl`
  - Do: Remove all `let _ =` prefixes from side-effect calls (println, Ws.broadcast, spawn, Repo.insert, etc.) leaving bare expression statements. Flatten 3 nested `else`+newline+`if` to `else if` in `pipeline.mpl:315` and `search.mpl:16,237`. Build-verify after each file batch.
  - Verify: `rg 'let _ =' mesher/ -g '*.mpl'` returns 0 matches; `cargo run -p meshc -- build mesher` succeeds
  - Done when: Zero `let _ =` in mesher, all 3 `else if` sites flattened, mesher builds clean

- [x] **T02: Replace `<>` with interpolation and convert long imports to multiline** `est:40m`
  - Why: ~10 `<>` concatenations are clearly more readable as interpolation; 13 import lines exceed 120 chars and should use the parenthesized multiline form proven in S02.
  - Files: `mesher/ingestion/validation.mpl`, `mesher/ingestion/ws_handler.mpl`, `mesher/ingestion/fingerprint.mpl`, `mesher/services/event_processor.mpl`, `mesher/api/helpers.mpl`, `mesher/main.mpl`, `mesher/ingestion/routes.mpl`, `mesher/api/dashboard.mpl`, `mesher/api/alerts.mpl`, `mesher/api/team.mpl`, `mesher/services/user.mpl`, `mesher/services/project.mpl`, `mesher/services/retention.mpl`, `mesher/api/search.mpl`, `mesher/ingestion/pipeline.mpl`
  - Do: Replace `<>` with interpolation in the 5 clear-win files (validation, ws_handler, fingerprint, event_processor, helpers). Keep `<>` in SQL DDL (schema.mpl), raw JSONB embedding (detail.mpl, search.mpl, alerts.mpl), and crypto construction (queries.mpl) per D029. Convert 13 imports >120 chars to `from Module import (\n  name1,\n  name2\n)` form.
  - Verify: `cargo run -p meshc -- build mesher` succeeds; `cargo run -p meshc -- fmt --check mesher` succeeds; `cargo test -p meshc --test e2e` → 313+ pass
  - Done when: Clear-win `<>` sites use interpolation, all 13 long imports are multiline, mesher builds and formats clean

## Files Likely Touched

- `mesher/ingestion/pipeline.mpl`
- `mesher/ingestion/routes.mpl`
- `mesher/storage/queries.mpl`
- `mesher/services/retention.mpl`
- `mesher/services/writer.mpl`
- `mesher/ingestion/ws_handler.mpl`
- `mesher/api/search.mpl`
- `mesher/ingestion/validation.mpl`
- `mesher/ingestion/fingerprint.mpl`
- `mesher/services/event_processor.mpl`
- `mesher/api/helpers.mpl`
- `mesher/main.mpl`
- `mesher/api/dashboard.mpl`
- `mesher/api/alerts.mpl`
- `mesher/api/team.mpl`
- `mesher/services/user.mpl`
- `mesher/services/project.mpl`
