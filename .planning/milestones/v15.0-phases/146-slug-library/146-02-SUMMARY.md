---
phase: 146-slug-library
plan: 02
subsystem: library
tags: [mesh, slug, library, tdd, regex, recursion]

# Dependency graph
requires:
  - "146-01 (slug.mpl stubs, mesh-slug package structure)"
provides:
  - "mesh-slug/slug.mpl — full implementation of slugify, slugify_with_sep, truncate, is_valid"
  - "mesh-slug/tests/slug.test.mpl — 26-test suite covering all 4 functions"
  - "Confirmed Mesh parser constraints for Plan 03+"
affects:
  - "147 (publish phase — package now has real implementation and passing tests)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regex literal ~r/pattern/ produces Regex directly (no Result wrapper)"
    - "List.filter lambdas: fn(p) -> expr end — no type annotation on lambda args"
    - "Case arm body must be on same line as -> arrow (Mesh parser constraint)"
    - "Nested if..do..else..end inside function call arguments is valid"
    - "Mutual recursion between top-level functions not supported (single-pass typechecker)"
    - "split/filter-empty/join pattern for slug normalization (handles leading/trailing/consecutive sep)"
    - "Direct self-recursion works; mutual recursion does not"

key-files:
  created:
    - "mesh-slug/tests/slug.test.mpl"
  modified:
    - "mesh-slug/slug.mpl"

key-decisions:
  - "Case arm body must be on same line as -> arrow: discovered by compiler error; inline one-liner approach used for accumulate_words recursive case"
  - "accumulate_words uses direct self-recursion (not mutual recursion) with inline if expressions to compute candidate without let bindings in case arm"
  - "split/filter-empty/join approach for slugify_core: avoids needing dynamic Regex.compile for leading/trailing sep stripping"
  - "Redundant _ arm in accumulate_words kept for documentation; compiler emits warning but no error"

patterns-established:
  - "TDD RED-GREEN confirmed: stubs returned '' and false, tests correctly failed on 16/26; implementation made all 26 pass"
  - "Mesh case arm single-expression constraint: extract complex arm body to helper fn OR put entire expression on one line"

requirements-completed: [SLUG-01, SLUG-02, SLUG-03, SLUG-04, SLUG-05]

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 146 Plan 02: Slug Library TDD Implementation Summary

**Full slug library implementation via TDD: 26 tests written (RED), then all made to pass (GREEN) in 6 minutes; discovered Mesh case arm body must be on the same line as -> and mutual recursion between top-level functions is not supported**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-02T01:50:12Z
- **Completed:** 2026-03-02T01:56:xx
- **Tasks:** 2 (RED commit + GREEN commit; no REFACTOR needed)
- **Files modified:** 2 (mesh-slug/slug.mpl, mesh-slug/tests/slug.test.mpl created)

## Accomplishments
- Wrote 26 tests across 4 describe blocks covering all API functions and edge cases
- Implemented all 4 slug functions with real logic (no stubs)
- All 26 tests pass; `meshc test mesh-slug/tests/slug.test.mpl` exits 0
- `meshc build mesh-slug` exits 0 (clean build, one benign warning)
- Discovered and documented 3 Mesh parser/compiler constraints for future reference

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Write failing test suite** - `931b77a4` (test)
2. **Task 2: GREEN — Implement slug functions** - `21a9ea3e` (feat)

## Files Created/Modified

- `mesh-slug/tests/slug.test.mpl` — 26 tests: 7 slugify, 3 slugify_with_sep, 5 truncate, 11 is_valid
- `mesh-slug/slug.mpl` — Full implementation: slugify_core, slugify, slugify_with_sep, accumulate_words, truncate, is_valid

## Implementation Details

### slugify_core/2 (private helper)
```
1. String.to_lower(str)
2. Regex.replace(~r/[^a-z0-9]+/, lower, sep)   # static compile-time regex
3. String.split(replaced, sep)
4. List.filter(parts, fn(p) -> String.length(p) > 0 end)   # remove empty strings
5. String.join(non_empty, sep)
```
The split/filter-empty/join pattern naturally handles leading/trailing/consecutive separators without needing dynamic Regex.compile.

### slugify/1 and slugify_with_sep/2
Thin wrappers that delegate to `slugify_core` with `"-"` or the provided sep.

### accumulate_words/3 (private recursive helper for truncate)
Direct self-recursion using cons pattern. Case arm body on one line (Mesh constraint):
```
case parts do
  word :: rest -> if String.length(candidate) > max do acc else accumulate_words(rest, max, candidate) end
  _ -> acc
end
```
Where `candidate` is computed inline as `if String.length(acc) == 0 do word else acc <> "-" <> word end`.
The `candidate` expression is computed twice (once for the length check, once for the recursive call) to avoid `let` bindings inside the case arm body.

### truncate/2
```
if String.length(slug) <= max do slug
else
  let parts = String.split(slug, "-")
  accumulate_words(parts, max, "")
end
```

### is_valid/1
```
if String.length(slug) == 0 do false
else Regex.is_match(~r/^[a-z0-9]+(-[a-z0-9]+)*$/, slug)
end
```
Pattern `^[a-z0-9]+(-[a-z0-9]+)*$` enforces: non-empty, lowercase+digits only, no leading/trailing/consecutive hyphens.

## Test Suite

26 tests total, all passing:

**Slug.slugify — default separator (7 tests)**
- basic: lowercases and hyphenates
- consecutive spaces collapse to one separator
- leading and trailing special chars stripped
- empty string returns empty string
- all-special input returns empty string
- already valid slug unchanged
- long string with mixed content

**Slug.slugify_with_sep — custom separator (3 tests)**
- underscore separator
- double-hyphen separator
- custom sep with consecutive spaces

**Slug.truncate (5 tests)**
- truncates at last separator boundary
- no truncation when within max
- truncates to first word when max is small
- empty string returns empty string
- single word shorter than max

**Slug.is_valid (11 tests)**
- valid hyphenated slug returns true
- single word returns true
- digits allowed
- all digits allowed
- uppercase letters return false
- spaces return false
- leading hyphen returns false
- trailing hyphen returns false
- consecutive hyphens return false
- empty string returns false
- special chars return false

## Decisions Made

- **Case arm body on same line as ->:** Mesh parser does not support newlines between `->` and the case arm body expression. The `accumulate_words` recursive case is written as a single long line. This is a language parser constraint, not a style preference.
- **Inline candidate computation:** `let` bindings cannot appear inside case arm bodies. The candidate string (`acc <> "-" <> word`) is computed twice inline. This trades readability for correctness.
- **Direct self-recursion for accumulate_words:** Mutual recursion between two top-level functions is not supported (Mesh typechecker is single-pass for functions). `accumulate_words` is self-recursive and does not call any helper.
- **split/filter-empty/join over Regex.compile:** Using `Regex.replace` with a static literal regex + split/filter/join avoids the `Result<Regex, String>` unwrapping overhead of `Regex.compile` for dynamic patterns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lambda type annotation syntax: `fn(p :: String) -> Bool do ... end` fails to parse**
- **Found during:** Task 2 (GREEN — first compilation attempt)
- **Issue:** Lambda with type annotation and `do...end` block `fn(p :: String) -> Bool do expr end` causes parse error. The `-> Bool` return type annotation is not supported in lambda expressions.
- **Fix:** Changed to `fn(p) -> String.length(p) > 0 end` (no type annotation, arrow-style body)
- **Files modified:** mesh-slug/slug.mpl
- **Verification:** Compilation succeeds

**2. [Rule 1 - Bug] Case arm bodies cannot contain let bindings or start on next line**
- **Found during:** Task 2 (GREEN — second compilation attempt)
- **Issue 1:** `let candidate = ...` inside a case arm body causes parse error `expected expression`
- **Issue 2:** Case arm body starting on a new line after `->` causes parse error `expected expression`
- **Fix:** Combined into single-line case arm body using inline expressions; candidate computed twice inline
- **Files modified:** mesh-slug/slug.mpl
- **Verification:** Compilation succeeds, 26 tests pass

**3. [Rule 1 - Bug] Mutual recursion between top-level functions not supported**
- **Found during:** Task 2 (GREEN — third compilation attempt)
- **Issue:** `try_append` calling `accumulate_words` while `accumulate_words` calling `try_append` fails with "undefined variable: accumulate_words" because Mesh's typechecker processes functions top-to-bottom (single-pass)
- **Fix:** Merged both functions into a single directly self-recursive `accumulate_words` function with inline expression logic
- **Files modified:** mesh-slug/slug.mpl
- **Verification:** Compilation succeeds, 26 tests pass

---

**Total deviations:** 3 auto-fixed (Rule 1 — all were Mesh language constraint discoveries during compilation)
**Impact on plan:** All fixes were correctness-required. Mesh parser/compiler constraints discovered will inform future Mesh library development. No scope creep.

## Issues Encountered
- Mesh parser constraint: case arm bodies must be on the same line as `->`. Workaround: single-line expressions.
- Mesh typechecker constraint: mutual recursion between top-level functions not supported. Workaround: direct self-recursion.
- Mesh lambda constraint: `fn(p :: Type) -> ReturnType do expr end` syntax is invalid. Use `fn(p) -> expr end`.

## User Setup Required
None.

## Next Phase Readiness
- mesh-slug package is fully implemented and tested
- Phase 147 (publish to registry) can begin immediately
- No blockers

## Self-Check: PASSED

- mesh-slug/slug.mpl: FOUND
- mesh-slug/tests/slug.test.mpl: FOUND
- .planning/phases/146-slug-library/146-02-SUMMARY.md: FOUND
- Commit 931b77a4: FOUND
- Commit 21a9ea3e: FOUND

---
*Phase: 146-slug-library*
*Completed: 2026-03-02*
