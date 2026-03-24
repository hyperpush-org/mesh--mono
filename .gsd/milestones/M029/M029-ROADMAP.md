# M029: Mesher & Reference-Backend Dogfood Completion

**Vision:** Fix the `meshc fmt` dot-path and multiline import bugs, then complete the mesher dogfood cleanup that M031 left partial: replace `<>` JSON serialization with `json {}` macro and interpolation, adopt idiomatic pipe style, and apply multiline imports throughout. Leave both codebases formatter-clean and idiomatically consistent.

## Success Criteria

- `meshc fmt --check reference-backend` passes with correct `Api.Router` dot-paths (no spurious spaces)
- `meshc fmt --check mesher` passes with 0 files needing reformatting (currently 35 fail)
- Both `reference-backend/` and `mesher/` build clean
- `cargo test -p meshc --test e2e` shows 318+ pass, no regressions
- Zero `<>` in mesher except D029-designated SQL DDL sites in `schema.mpl`
- All `List.map(rows, fn...)` wrapping patterns in mesher converted to pipe style
- All mesher import lines >120 chars use parenthesized multiline form

## Key Risks / Unknowns

- Formatter dot-path fix could cascade to FIELD_ACCESS and CALL_EXPR chain formatting — need careful regression testing against 119 existing formatter tests + both codebases
- Multiline import preservation may have a second bug beyond dot-path spacing — `walk_from_import_decl` may not route to `walk_import_list` correctly for all CST shapes

## Proof Strategy

- Formatter dot-path cascade risk → retire in S01 by proving `cargo test -p mesh-fmt --lib` still passes after the fix, plus `meshc fmt --check` on both codebases
- Multiline import routing → retire in S01 by proving round-trip: write multiline import, format it, confirm it stays multiline with correct dot-paths

## Verification Classes

- Contract verification: `cargo test -p mesh-fmt --lib`, `cargo test -p meshc --test e2e`, `meshc fmt --check` on both codebases, `meshc build` on both codebases
- Integration verification: none (all local toolchain work)
- Operational verification: none
- UAT / human verification: visual inspection of mesher source quality

## Milestone Definition of Done

This milestone is complete only when all are true:

- All formatter fixes land and pass `cargo test -p mesh-fmt --lib` (119+ tests)
- `meshc fmt --check reference-backend` passes with no dot-path corruption
- `meshc fmt --check mesher` passes with 0 files needing reformatting
- Both codebases build clean with `meshc build`
- `cargo test -p meshc --test e2e` shows 318+ pass, no regressions from M031 baseline
- `rg '<>' mesher/ -g '*.mpl'` shows only `schema.mpl` SQL DDL sites (3 lines) and `queries.mpl` SQL-adjacent sites (`Query.select_raw`, `DROP TABLE`)
- `rg 'List\.map(' mesher/ -g '*.mpl'` returns 0 matches (all converted to pipe)
- All mesher files with import lines >120 chars use parenthesized multiline form
- Reference-backend source has correct dot-paths (`Api.Router` not `Api. Router`)

## Requirement Coverage

- Covers: R024, R026, R027
- Partially covers: R011 (DX-driven language work continues through dogfood pressure)
- Leaves for later: R007, R010, R012, R013, R014
- Orphan risks: none

## Slices

- [x] **S01: Formatter dot-path and multiline import fix** `risk:high` `depends:[]`
  > After this: `meshc fmt` no longer inserts spaces into module dot-paths; parenthesized multiline imports survive round-trip formatting. Proven by `cargo test -p mesh-fmt --lib` passing and a new formatter test for dot-path + multiline import preservation.

- [ ] **S02: Mesher JSON serialization and pipe cleanup** `risk:medium` `depends:[]`
  > After this: mesher `<>` chains in alerts/search/detail replaced with `json {}` or `#{}` interpolation; `List.map(rows, fn)` patterns converted to pipe style; obvious non-SQL `<>` in queries.mpl converted to interpolation. `meshc build mesher` succeeds.

- [ ] **S03: Multiline imports and final formatter compliance** `risk:low` `depends:[S01]`
  > After this: all 20+ mesher files with >120 char imports use parenthesized multiline form; reference-backend dot-paths corrected; `meshc fmt --check reference-backend` and `meshc fmt --check mesher` both pass with 0 files needing reformatting.

## Boundary Map

### S01 → S03

Produces:
- `walk_tokens_inline` or `walk_path` fix in `compiler/mesh-fmt/src/walker.rs` — IDENT after DOT no longer gets spurious space
- `walk_from_import_decl` / `walk_import_list` fix — parenthesized multiline imports preserved through format round-trip
- New formatter unit tests covering dot-path spacing and multiline import preservation
- `cargo test -p mesh-fmt --lib` passing with both fixes

Consumes:
- nothing (first slice)

### S02 (independent)

Produces:
- Mesher `.mpl` files with `json {}` macro replacing `<>` JSON serializers where all fields are simple
- Mesher `.mpl` files with `#{}` interpolation replacing `<>` where raw JSONB prevents `json {}` macro
- `queries.mpl` with `"mshr_#{Crypto.uuid4()}"` style interpolation for non-SQL `<>` sites
- `rows |> List.map(fn...)` pipe style throughout mesher replacing `List.map(rows, fn...)` wrapping
- `meshc build mesher` still succeeds

Consumes:
- nothing (independent — code cleanup doesn't require formatter fix)

### S01 + S02 → S03

Produces:
- All mesher files with >120 char imports converted to parenthesized multiline form
- Reference-backend `.mpl` files with correct `Api.Router` dot-paths (reformatted with fixed formatter)
- `meshc fmt --check reference-backend` passes
- `meshc fmt --check mesher` passes

Consumes from S01:
- Fixed formatter that preserves dot-paths and multiline imports

Consumes from S02:
- Clean mesher source ready for final formatting pass
