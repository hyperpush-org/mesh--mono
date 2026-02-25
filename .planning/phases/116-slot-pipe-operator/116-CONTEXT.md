# Phase 116: Slot Pipe Operator - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `|N>` argument-position routing to the Mesh compiler. Users can write `value |2> func(a)` to pipe a value into any argument slot (N ≥ 2). Full type checking validates the slot position against the target function's arity. Regular pipe `|>` is unchanged; this is additive syntax for non-first-position routing only.

</domain>

<decisions>
## Implementation Decisions

### |1> semantics
- `|1>` is a hard parse error — rejected immediately by the parser
- Error message must reference the correct alternative: "Slot position 1 is the first argument — use |> instead"
- No warnings, no valid synonym path — the operator is purposeful for N ≥ 2 only

### Position conflict behavior
- Hard compile error when slot position N targets an argument position already explicitly provided
- Example: `x |2> func(a, b)` where position 2 is `b` → compiler rejects with conflict error
- No silent insertion/shifting, no silent override — explicit is explicit
- Mesh has no named arguments currently; slot position is purely positional index

### Arity error messaging
- When N exceeds function arity, the error must include: slot position used, function name, actual arity, and valid slot range
- Format: "Slot position 5 is out of range: `func` takes 3 arguments, so valid slot positions are 2–3"
- Show parameter count only, not the full type signature
- If arity is not statically known at compile time (e.g., function variable, generic): Claude's discretion — validate what can be validated via type unification, don't reject blindly

### N bounds and validation
- `|0>` is a parse error (not a semantic error) — arguments are 1-indexed, 0 is syntactically invalid
- `|1>` is also a parse error (as decided above)
- N must be an integer literal in source — no constant expressions, no variables
- `|2>` must be a contiguous token — whitespace inside the operator (e.g., `| 2 >`) is not allowed; lexer treats `|N>` as a single unit

### Claude's Discretion
- Chaining multiple slot pipes to the same position across a chain (e.g., `x |2> f(a) |2> g(b)`) — standard left-to-right evaluation applies; no special warning needed since they target different functions
- Exact behavior when arity is unknown at type-check time — allow and resolve through unification

</decisions>

<specifics>
## Specific Ideas

- The operator shape `|N>` follows the same visual grammar as `|>` — the N slots between the `|` and `>`. This should feel like a natural extension.
- Error messages should follow the same style as existing compiler errors: actionable, reference the correct form, show valid range when applicable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 116-slot-pipe-operator*
*Context gathered: 2026-02-25*
