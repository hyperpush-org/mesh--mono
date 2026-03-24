---
estimated_steps: 4
estimated_files: 7
skills_used: []
---

# T01: Remove `let _ =` and flatten `else if` across mesher

**Slice:** S04 — Mesher Dogfood Cleanup
**Milestone:** M031

## Description

Remove all 72 `let _ =` bindings for side-effect calls across 6 mesher files, replacing them with bare expression statements. Flatten 3 nested `else` + `if` blocks into `else if` chains. All patterns are proven working by S01 (bare expressions confirmed by codegen) and S03 (identical cleanup done on reference-backend).

## Steps

1. **Remove `let _ =` in `mesher/ingestion/pipeline.mpl` (35 instances).** Run `rg -n 'let _ =' mesher/ingestion/pipeline.mpl` to find all locations. For each, remove the `let _ = ` prefix so the expression becomes a bare statement (e.g. `let _ = println("x")` → `println("x")`). Flatten the nested `else` + `if` at line ~315 to `else if`. Build-verify: `cargo run -p meshc -- build mesher`.

2. **Remove `let _ =` in `mesher/ingestion/routes.mpl` (14), `mesher/storage/queries.mpl` (14), `mesher/services/retention.mpl` (6), `mesher/services/writer.mpl` (2), `mesher/ingestion/ws_handler.mpl` (1).** Same mechanical removal. Build-verify after the batch.

3. **Flatten `else if` in `mesher/api/search.mpl` (2 sites at lines ~16 and ~237).** Change `else\n    if cond do` to `else if cond do` and remove the extra `end` that was closing the inner if. Build-verify.

4. **Final verification.** Run `rg 'let _ =' mesher/ -g '*.mpl'` to confirm zero matches. Run `cargo run -p meshc -- build mesher` to confirm clean build.

## Must-Haves

- [ ] All 72 `let _ =` removed — `rg 'let _ =' mesher/ -g '*.mpl'` returns 0 matches
- [ ] 3 nested else/if flattened to `else if` — in `pipeline.mpl` (1) and `search.mpl` (2)
- [ ] `cargo run -p meshc -- build mesher` succeeds

## Verification

- `rg 'let _ =' mesher/ -g '*.mpl'` → 0 matches
- `cargo run -p meshc -- build mesher` → exit 0

## Inputs

- `mesher/ingestion/pipeline.mpl` — 35 `let _ =` instances, 1 nested else/if
- `mesher/ingestion/routes.mpl` — 14 `let _ =` instances
- `mesher/storage/queries.mpl` — 14 `let _ =` instances
- `mesher/services/retention.mpl` — 6 `let _ =` instances
- `mesher/services/writer.mpl` — 2 `let _ =` instances
- `mesher/ingestion/ws_handler.mpl` — 1 `let _ =` instance
- `mesher/api/search.mpl` — 2 nested else/if sites (lines ~16, ~237)

## Expected Output

- `mesher/ingestion/pipeline.mpl` — zero `let _ =`, 1 `else if` flattened
- `mesher/ingestion/routes.mpl` — zero `let _ =`
- `mesher/storage/queries.mpl` — zero `let _ =`
- `mesher/services/retention.mpl` — zero `let _ =`
- `mesher/services/writer.mpl` — zero `let _ =`
- `mesher/ingestion/ws_handler.mpl` — zero `let _ =`
- `mesher/api/search.mpl` — 2 `else if` chains flattened
