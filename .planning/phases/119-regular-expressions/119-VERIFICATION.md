---
phase: 119-regular-expressions
verified: 2026-02-25T00:00:00Z
status: passed
score: 5/5 must-haves verified
gaps: []
human_verification: []
---

# Phase 119: Regular Expressions Verification Report

**Phase Goal:** Add regular expression support to the Mesh standard library — regex literals (~r/pat/flags), Regex.compile, Regex.is_match, Regex.captures, Regex.replace, Regex.split — with full E2E test coverage.
**Verified:** 2026-02-25
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can write `~r/pattern/` and `~r/pattern/flags` regex literals; i, m, s flags recognized | VERIFIED | `TokenKind::RegexLiteral(String, String)` in token.rs; `lex_regex_literal()` in lexer; `~r/\d+/` and `~r/[a-z]+/i` in regex_literal.mpl; e2e_regex_literal passes |
| 2 | User can call `Regex.compile(str)` returning `Result<Regex, String>` with descriptive error | VERIFIED | `mesh_regex_compile` in mesh-rt/src/regex.rs; type sig in builtins.rs; stdlib_modules Regex entry in infer.rs; e2e_regex_compile passes |
| 3 | User can call `Regex.is_match(rx, str)` returning Bool | VERIFIED | `mesh_regex_match` in regex.rs (plan renamed from .match to .is_match due to keyword conflict); "is_match" in stdlib_modules, builtins, map_builtin_name; e2e_regex_match passes |
| 4 | User can call `Regex.captures(rx, str)` returning `Option<List<String>>` | VERIFIED | `mesh_regex_captures` in regex.rs; correct type sig in builtins.rs/stdlib_modules; e2e_regex_captures passes |
| 5 | User can call `Regex.replace(rx, str, replacement)` and `Regex.split(rx, str)` | VERIFIED | `mesh_regex_replace` and `mesh_regex_split` in regex.rs; type sigs registered; e2e_regex_replace and e2e_regex_split both pass |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `crates/mesh-common/src/token.rs` | `RegexLiteral(String, String)` token variant | VERIFIED | Line 177: `RegexLiteral(String, String),`; comment updated to 9 literals |
| `crates/mesh-lexer/src/lib.rs` | `'~'` dispatch + `lex_regex_literal()` | VERIFIED | Lines 127-394: `'~'` match + method producing `TokenKind::RegexLiteral` |
| `crates/mesh-parser/src/syntax_kind.rs` | `REGEX_LITERAL` + `REGEX_EXPR` SyntaxKind variants | VERIFIED | Line 128: `REGEX_LITERAL`, line 202: `REGEX_EXPR`, line 476: From conversion arm |
| `crates/mesh-parser/src/ast/expr.rs` | `RegexExpr` AST node + `Expr::RegexExpr` variant | VERIFIED | Lines 55/106/145/841: variant, cast, syntax, ast_node! struct with `pattern()`/`flags()` |
| `crates/mesh-parser/src/parser/expressions.rs` | `REGEX_LITERAL -> REGEX_EXPR` lhs() branch | VERIFIED | Lines 244-247: match arm producing REGEX_EXPR |
| `crates/mesh-typeck/src/infer.rs` | `Expr::RegexExpr => Ty::Con("Regex")` inference + Regex module in stdlib_modules + "Regex" in STDLIB_MODULE_NAMES | VERIFIED | Lines 1494/4203-4206/5942: all three present |
| `crates/mesh-typeck/src/builtins.rs` | `regex_compile`, `regex_is_match`, `regex_captures`, `regex_replace`, `regex_split` type sigs | VERIFIED | Lines 278-299: all 5 entries with correct type signatures |
| `crates/mesh-codegen/src/mir/lower.rs` | `Expr::RegexExpr` lowering + 6 known_functions + 6 map_builtin_name arms + "Regex" in STDLIB_MODULES | VERIFIED | Lines 657-677/5510-5528/10456/10498-10506: all present |
| `crates/mesh-codegen/src/mir/types.rs` | `"Regex" => MirType::Ptr` in resolve_con | VERIFIED | Lines 91-92: `"Regex" => MirType::Ptr` |
| `crates/mesh-rt/src/regex.rs` | 6 `#[no_mangle] extern "C"` runtime functions | VERIFIED | Lines 34/52/74/87/111/129: all 6 functions present |
| `crates/mesh-rt/src/lib.rs` | `pub mod regex` + 6 re-exports | VERIFIED | Line 38: `pub mod regex;`, line 131: `pub use regex::{...}` |
| `crates/mesh-rt/Cargo.toml` | `regex = "1"` dependency | VERIFIED | Line 30: `regex = "1"` |
| `crates/mesh-codegen/src/codegen/intrinsics.rs` | LLVM external declarations for all 6 mesh_regex_* | VERIFIED | Lines 257-279: all 6 add_function calls with assertions at lines 1731-1736 |
| `crates/mesh-repl/src/jit.rs` | JIT add_sym for all 6 mesh_regex_* | VERIFIED | Lines 253-258: all 6 add_sym calls |
| `tests/e2e/regex_literal.mpl` | REGEX-01 fixture with `~r/` literals and `Regex.is_match` | VERIFIED | Contains `~r/\d+/`, `~r/[a-z]+/i`, `Regex.is_match` |
| `tests/e2e/regex_compile.mpl` | REGEX-02 fixture with `Regex.compile` Ok/Err | VERIFIED | Contains `Regex.compile`, Ok/Err case arms |
| `tests/e2e/regex_match.mpl` | REGEX-03 fixture with `Regex.is_match` | VERIFIED | Contains helper `run_match` + `Regex.is_match` calls |
| `tests/e2e/regex_captures.mpl` | REGEX-04 fixture with `Regex.captures` | VERIFIED | Contains `Regex.captures`, Some/None handling |
| `tests/e2e/regex_replace_split.mpl` | REGEX-05/06 fixture with replace and split | VERIFIED | Contains `Regex.replace`, `Regex.split` |
| `crates/meshc/tests/e2e.rs` | 6 `e2e_regex_*` test functions | VERIFIED | Lines 5258-5307: all 6 functions with correct assertions |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `mesh-lexer/src/lib.rs` | `mesh-common/src/token.rs` | `TokenKind::RegexLiteral(pattern, flags)` produced by `lex_regex_literal()` | WIRED | `lex_regex_literal()` returns `Token::new(TokenKind::RegexLiteral(pattern, flags), ...)` |
| `mesh-parser/src/parser/expressions.rs` | `mesh-parser/src/syntax_kind.rs` | `lhs()` match on `SyntaxKind::REGEX_LITERAL` -> `REGEX_EXPR` node | WIRED | Lines 244-247 confirmed |
| `mesh-typeck/src/infer.rs` | `mesh-codegen/src/mir/lower.rs` | `Expr::RegexExpr` inferred as `Ty::Con("Regex")`, lowered to `mesh_regex_from_literal` call | WIRED | Both arms confirmed in infer.rs and lower.rs |
| `mesh-typeck/src/infer.rs` | `mesh-typeck/src/builtins.rs` | `Regex.compile(str)` resolves via stdlib_modules Regex entry -> `regex_compile` -> `mesh_regex_compile` | WIRED | `"Regex"` in STDLIB_MODULE_NAMES, `regex_compile` in builtins.rs |
| `mesh-codegen/src/mir/lower.rs` | `mesh-rt/src/regex.rs` | `mesh_regex_compile` known_function -> LLVM external call -> runtime function | WIRED | known_functions line 661, intrinsics line 263, runtime line 52 |
| `mesh-repl/src/jit.rs` | `mesh-rt/src/regex.rs` | `add_sym("mesh_regex_compile", mesh_rt::mesh_regex_compile as *const ())` | WIRED | Line 254 confirmed |
| `crates/meshc/tests/e2e.rs` | `tests/e2e/regex_literal.mpl` | `read_fixture("regex_literal.mpl")` -> `compile_and_run` -> `assert_eq!` | WIRED | Lines 5259-5261 confirmed |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REGEX-01 | 119-01, 119-03 | User can write `~r/pattern/` and `~r/pattern/flags` literals | SATISFIED | `TokenKind::RegexLiteral`, lexer, parser, typeck, MIR; e2e_regex_literal passes |
| REGEX-02 | 119-02, 119-03 | `Regex.compile(str) -> Result<Regex, String>` | SATISFIED | `mesh_regex_compile` in runtime; type-checked; e2e_regex_compile passes |
| REGEX-03 | 119-02, 119-03 | `Regex.is_match(rx, str) -> Bool` (renamed from .match due to keyword conflict) | SATISFIED | `mesh_regex_match` in runtime (via `regex_is_match` mapping); e2e_regex_match passes |
| REGEX-04 | 119-02, 119-03 | `Regex.captures(rx, str) -> Option<List<String>>` | SATISFIED | `mesh_regex_captures` in runtime; e2e_regex_captures passes |
| REGEX-05 | 119-02, 119-03 | `Regex.replace(rx, str, replacement) -> String` | SATISFIED | `mesh_regex_replace` in runtime; e2e_regex_replace passes |
| REGEX-06 | 119-02, 119-03 | `Regex.split(rx, str) -> List<String>` | SATISFIED | `mesh_regex_split` in runtime; e2e_regex_split passes |

All 6 requirements from REQUIREMENTS.md are satisfied. No orphaned requirements found.

### Anti-Patterns Found

None. No TODO, FIXME, placeholder comments, or stub implementations found in modified files. All 6 runtime functions have substantive implementations using the `regex` crate with `RegexBuilder`. All fixture files contain real Mesh programs that exercise the full code path.

### Human Verification Required

None. All verification is achievable programmatically:

- Compilation success: verified (`cargo build` passes)
- Unit tests in mesh-rt: 9 new regex tests pass (including edge cases: invalid pattern, captures None, flags)
- E2E tests: all 6 `e2e_regex_*` tests pass with exact output assertions

### Notable Decisions

1. **`Regex.match` renamed to `Regex.is_match`** — `match` is a reserved keyword in Mesh (`MATCH_KW`). The rename is reflected consistently across infer.rs, builtins.rs, lower.rs, and all fixture files. The internal runtime symbol remains `mesh_regex_match` (the `regex_is_match` -> `mesh_regex_match` mapping in lower.rs handles the rename).

2. **`Regex` type maps to `MirType::Ptr`** — `resolve_con()` in types.rs was updated to map `"Regex"` to `MirType::Ptr`, preventing an LLVM "Cannot allocate unsized type %Regex" error that would occur from the default `MirType::Struct` fallback.

3. **`"Regex"` added to `STDLIB_MODULE_NAMES`** — Without this, `Regex.compile(...)` would fail with "no method compile on type Regex" because the typechecker would treat `Regex` as a value type rather than a module.

4. **Helper function pattern for multi-statement case arms** — Mesh case arm bodies are single expressions. Fixtures use helper functions (`run_match`, `run_captures`, `run_replace_split`, `print_caps`, `print_parts`) to work around this constraint.

### Gaps Summary

No gaps. All 5 success criteria are met, all 6 requirements are satisfied, all 20 artifacts exist and are substantive, all key links are wired, and the 6 E2E tests pass with exact output assertions.

---

_Verified: 2026-02-25_
_Verifier: Claude (gsd-verifier)_
