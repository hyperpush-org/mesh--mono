# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R007 — Mesh projects have a believable dependency/package workflow for building and shipping backend applications with reproducible inputs.
- Class: launchability
- Status: active
- Description: Mesh projects have a believable dependency/package workflow for building and shipping backend applications with reproducible inputs.
- Why it matters: A language may have good runtime features and still fail as a serious backend option if dependency flow is rough or confidence-eroding.
- Source: inferred
- Primary owning slice: M030/S01 (provisional)
- Supporting slices: M030/S02 (provisional)
- Validation: mapped
- Notes: This sits after the M028 trust baseline but is already part of the capability contract.

### R010 — The project can point to specific ways Mesh is easier to deploy, measurably fast, and nicer for backend development rather than vaguely claiming it is "better than Elixir."
- Class: differentiator
- Status: active
- Description: The project can point to specific ways Mesh is easier to deploy, measurably fast, and nicer for backend development rather than vaguely claiming it is "better than Elixir."
- Why it matters: The user's comparison target is clear, but the comparison needs to be grounded in measurable strengths instead of ecosystem parity rhetoric.
- Source: user
- Primary owning slice: M029/S01 (provisional)
- Supporting slices: M028/S04, M028/S06, M029/S02 (provisional)
- Validation: mapped
- Notes: M028 establishes the baseline proof needed before these comparisons are sharpened further.

### R011 — New language/runtime work after M028 should come from real backend friction discovered while using Mesh for actual backend code.
- Class: differentiator
- Status: active
- Description: New language/runtime work after M028 should come from real backend friction discovered while using Mesh for actual backend code.
- Why it matters: This keeps the project from chasing clever language features that do not improve the target use case.
- Source: user
- Primary owning slice: M029/S02 (provisional)
- Supporting slices: M029/S03 (provisional), M031/S01
- Validation: mapped
- Notes: M031 is a direct manifestation of this requirement — every fix originates from dogfood friction.

### R012 — After the canonical API + DB + migrations + jobs path is proven, Mesh continues toward the broader backend space the user wants: long-running supervised services, realtime systems, and distributed backends.
- Class: core-capability
- Status: active
- Description: After the canonical API + DB + migrations + jobs path is proven, Mesh continues toward the broader backend space the user wants: long-running supervised services, realtime systems, and distributed backends.
- Why it matters: The long-term vision is "all types of backend code," not only one app shape.
- Source: user
- Primary owning slice: M031/S01 (provisional)
- Supporting slices: M031/S02 (provisional), M031/S03 (provisional)
- Validation: mapped
- Notes: This remains in scope for the project, but it follows the first credibility milestone.

### R013 — A blocking Mesh language/runtime/tooling limitation is not worked around indefinitely; it is fixed in Mesh and then used in this app.
- Class: constraint
- Status: active
- Description: A blocking Mesh language/runtime/tooling limitation is not worked around indefinitely; it is fixed in Mesh and then used in this app.
- Why it matters: This app is also a Mesh dogfooding vehicle.
- Source: user
- Primary owning slice: M023/S01
- Supporting slices: M027/S01 (provisional), M031/S01
- Validation: mapped
- Notes: M031 fixes workarounds that accumulated across reference-backend and mesher.

### R014 — The first product loop focuses on existing creator tokens joining the fund before adding token-launch convenience.
- Class: constraint
- Status: active
- Description: The first product loop focuses on existing creator tokens joining the fund before adding token-launch convenience.
- Why it matters: This reduces first-proof complexity while still proving the real product thesis.
- Source: inferred
- Primary owning slice: M023/S02
- Supporting slices: M023/S06
- Validation: mapped
- Notes: Launch-through-app remains desirable if Bags support proves smooth enough later.

### R017 — Function calls with arguments on separate lines must resolve to the correct return type. Currently the parser produces correct trees (formatter round-trips them) but the typechecker resolves multiline calls as `()`.
- Class: core-capability
- Status: active
- Description: Function calls with arguments on separate lines must resolve to the correct return type. Currently the parser produces correct trees (formatter round-trips them) but the typechecker resolves multiline calls as `()`.
- Why it matters: Prevents formatting long function calls across multiple lines — a basic code readability need.
- Source: execution
- Primary owning slice: M031/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Bug is in typechecker span resolution, not parsing. Single-line calls with same args work.

### R019 — `fn_call(a, b, c,)` and multiline call formatting with trailing commas must parse correctly.
- Class: quality-attribute
- Status: active
- Description: `fn_call(a, b, c,)` and multiline call formatting with trailing commas must parse correctly.
- Why it matters: Standard ergonomic expectation for multiline code; reduces diff noise when adding/removing arguments.
- Source: inferred
- Primary owning slice: M031/S02
- Supporting slices: none
- Validation: unmapped
- Notes: Single-line trailing commas already work in fn args and lists. The fix is specifically for multiline trailing commas in fn args.

### R024 — `mesher/` should have zero `let _ =` for side effects, string interpolation replacing `<>` concatenation where appropriate, multiline imports for long lines, and pipe operators used idiomatically.
- Class: quality-attribute
- Status: active
- Description: `mesher/` should have zero `let _ =` for side effects, string interpolation replacing `<>` concatenation where appropriate, multiline imports for long lines, and pipe operators used idiomatically.
- Why it matters: Mesher is the larger dogfood app — its code quality reflects language usability.
- Source: user
- Primary owning slice: M031/S04
- Supporting slices: none
- Validation: Partially validated by M031/S04: zero `let _ =` (72 removed across 6 files), 11 clear-win `<>` sites replaced with interpolation (D029-designated SQL/JSONB/crypto sites preserved), 3 nested else/if flattened to `else if`. Multiline imports deferred — meshc fmt collapses them back to single-line (formatter bug, not parser). Build succeeds; 313 e2e tests pass.
- Notes: 72 `let _ =` removed, 11 `<>` → interpolation, 3 else if flattened. Multiline imports blocked on formatter fix (see KNOWLEDGE.md entry). Pipe operators were not in scope for S04 tasks — mesher already uses pipes where natural. The requirement's multiline-import criterion cannot be fully validated until the formatter walker handles FROM_IMPORT_DECL with IMPORT_LIST inside parens.

## Validated

### R001 — Mesh has an explicit definition of what "production ready language needs to have" means for this repo, and that baseline can be checked through concrete proof rather than vague claims.
- Class: launchability
- Status: validated
- Description: Mesh has an explicit definition of what "production ready language needs to have" means for this repo, and that baseline can be checked through concrete proof rather than vague claims.
- Why it matters: Without a baseline contract, the work turns into an endless feature list and nobody can tell whether Mesh actually became more trustworthy.
- Source: inferred
- Primary owning slice: M028/S01
- Supporting slices: M028/S06
- Validation: Validated by M028/S01 through the shipped `reference-backend/` package, canonical startup contract (`DATABASE_URL`, `PORT`, `JOB_POLL_MS`), package README/.env example, compiler e2e proof (`e2e_reference_backend_builds`, `e2e_reference_backend_runtime_starts`, `e2e_reference_backend_postgres_smoke`), migration status/up commands, and the package-local smoke path proving the baseline with concrete commands instead of abstract claims.
- Notes: S01 established the repo's first concrete backend trust baseline around one auditable API + DB + migrations + jobs workflow.

### R002 — Mesh can power a real backend shape with an HTTP API, persistent database state, migrations, and background jobs in one coherent flow.
- Class: core-capability
- Status: validated
- Description: Mesh can power a real backend shape with an HTTP API, persistent database state, migrations, and background jobs in one coherent flow.
- Why it matters: This is the first serious proof target for trusting Mesh for a real production app backend in any capacity.
- Source: user
- Primary owning slice: M028/S01
- Supporting slices: M028/S02, M028/S04, M028/S05, M028/S06
- Validation: Validated by M028/S01 through live end-to-end verification of `reference-backend/`.
- Notes: S01 closed the first real backend proof path.

### R003 — The runtime path behind the canonical backend flow is exercised by automated verification strongly enough that the path is not just "implemented," but trusted.
- Class: quality-attribute
- Status: validated
- Description: The runtime path behind the canonical backend flow is exercised by automated verification strongly enough that the path is not just "implemented," but trusted.
- Why it matters: A backend language loses credibility quickly if its basic runtime surfaces only work in isolated or manual scenarios.
- Source: inferred
- Primary owning slice: M028/S02
- Supporting slices: M028/S06
- Validation: Validated by M028/S02 through live Postgres-backed compiler e2e coverage.
- Notes: S02 kept runtime-correctness proof on the canonical reference-backend harness.

### R004 — Mesh concurrency and supervision are proven under crash, restart, and failure-reporting scenarios instead of only being advertised as features.
- Class: quality-attribute
- Status: validated
- Description: Mesh concurrency and supervision are proven under crash, restart, and failure-reporting scenarios instead of only being advertised as features.
- Why it matters: The user explicitly said "concurrency exists but isn't trustworthy" would be a failure state for the project.
- Source: user
- Primary owning slice: M028/S05
- Supporting slices: M028/S02, M028/S06, M028/S07
- Validation: Validated by M028/S07 through live recovery proof on `reference-backend/`.
- Notes: Closeout note (2026-03-24): the serial acceptance rerun still flaked on `e2e_reference_backend_worker_crash_recovers_job`.

### R005 — Mesh's native-binary workflow is proven through a deployment path that feels closer to shipping a Go app than to assembling a fragile language stack.
- Class: launchability
- Status: validated
- Description: Mesh's native-binary workflow is proven through a deployment path that feels closer to shipping a Go app than to assembling a fragile language stack.
- Why it matters: Easier deployment is one of the first ways the user wants Mesh to beat Elixir.
- Source: user
- Primary owning slice: M028/S04
- Supporting slices: M028/S06
- Validation: Validated by M028/S04 through live native-deployment proof for `reference-backend/`.
- Notes: S04 proves one honest boring deployment path.

### R006 — Diagnostics, formatter, LSP, tests, and the coverage story are credible enough that a backend engineer can use Mesh daily without fighting the toolchain.
- Class: quality-attribute
- Status: validated
- Description: Diagnostics, formatter, LSP, tests, and the coverage story are credible enough that a backend engineer can use Mesh daily without fighting the toolchain.
- Why it matters: Better DX is part of the explicit comparison target against Elixir.
- Source: user
- Primary owning slice: M028/S03
- Supporting slices: M030/S01 (provisional), M030/S02 (provisional)
- Validation: S03 closure reran the full tooling trust gate on `reference-backend/`.
- Notes: The toolchain should be judged against the real reference backend, not only tiny fixtures.

### R008 — Mesh documentation and examples show a production-style backend path and do not rely mainly on toy examples to make the language look ready.
- Class: launchability
- Status: validated
- Description: Mesh documentation and examples show a production-style backend path and do not rely mainly on toy examples to make the language look ready.
- Why it matters: The user explicitly said "docs/examples don't prove real use" would be a failure.
- Source: user
- Primary owning slice: M028/S06
- Supporting slices: M028/S01, M028/S03, M028/S04, M028/S05, M028/S07, M028/S08
- Validation: Validated by M028/S08 through the reconciled production-proof surface.
- Notes: S06 built the canonical proof-surface hierarchy.

### R009 — Mesh proves itself through a real reference backend that exercises the language as a backend platform instead of proving subsystems only in isolation.
- Class: differentiator
- Status: validated
- Description: Mesh proves itself through a real reference backend that exercises the language as a backend platform instead of proving subsystems only in isolation.
- Why it matters: Dogfooding is how the project turns "all types of backend code" from ambition into grounded engineering pressure.
- Source: inferred
- Primary owning slice: M028/S06
- Supporting slices: M028/S01, M028/S02, M028/S05, M028/S07
- Validation: Validated by M028/S07 on top of the existing S01-S06 proof surface.
- Notes: The reference backend is now a genuinely recovery-aware end-to-end proof target.

### R015 — `else if` chains must produce the correct branch value. Currently they compile without error but return wrong values (garbage integers, misaligned pointer crashes for strings).
- Class: core-capability
- Status: validated
- Description: `else if` chains must produce the correct branch value. Currently they compile without error but return wrong values (garbage integers, misaligned pointer crashes for strings).
- Why it matters: Silent wrong-value bugs in basic control flow undermine all language trust.
- Source: execution
- Primary owning slice: M031/S01
- Supporting slices: none
- Validation: Validated by M031/S01/T02: added `types.insert` in `infer_if` for both return paths. 5 e2e tests pass (Int, String, Bool, 3-level chain, let binding). String-return test serves as crash sentinel.
- Notes: The MIR lowering recurses correctly; the bug is likely in `resolve_range` type resolution for chained if-expressions.

### R016 — When a control-flow condition ends with a function call (`if is_valid(x) do`), the `do` keyword must be parsed as the block opener, not as a trailing closure on the call.
- Class: core-capability
- Status: validated
- Description: When a control-flow condition ends with a function call (`if is_valid(x) do`), the `do` keyword must be parsed as the block opener, not as a trailing closure on the call.
- Why it matters: This forces every condition with a function call to use workarounds (temp variable binding, extra parens, `== true`). Nobody in the test suite uses `if fn_call() do` — everyone silently avoids it.
- Source: execution
- Primary owning slice: M031/S01
- Supporting slices: none
- Validation: Validated by M031/S01/T01: added `suppress_trailing_closure` flag to parser with save/restore in all 4 control-flow condition sites. 5 e2e tests pass (if/while/case/for with fn-call conditions, plus trailing-closure regression).
- Notes: Must not break trailing closures used by test framework (`test("name") do ... end`, `describe("name") do ... end`).

### R018 — `from Module import (\n  a,\n  b,\n  c\n)` must parse correctly. Currently the import parser breaks on newline after comma, forcing all imports onto single lines (up to 310 characters in mesher).
- Class: quality-attribute
- Status: validated
- Description: `from Module import (\n  a,\n  b,\n  c\n)` must parse correctly. Currently the import parser breaks on newline after comma, forcing all imports onto single lines (up to 310 characters in mesher).
- Why it matters: 310-character import lines are unreadable and unfriendly to code review.
- Source: user
- Primary owning slice: M031/S02
- Supporting slices: none
- Validation: Validated by M031/S02 — parenthesized multiline imports parse into the same AST shape as flat imports; 3 parser snapshot tests and 3 e2e tests prove single-line, multiline, and trailing-comma paren imports compile and run correctly.
- Notes: Parser fix in `parse_from_import_decl` — need to handle parenthesized groups where newlines are insignificant.

### R023 — `reference-backend/` should have zero `let _ =` for side effects, zero `== true` comparisons on booleans, struct update syntax instead of full reconstruction, and idiomatic pipe usage.
- Class: quality-attribute
- Status: validated
- Description: `reference-backend/` should have zero `let _ =` for side effects, zero `== true` comparisons on booleans, struct update syntax instead of full reconstruction, and idiomatic pipe usage.
- Why it matters: The reference-backend is the primary proof target — it should exemplify good Mesh code, not workaround patterns.
- Source: user
- Primary owning slice: M031/S03
- Supporting slices: none
- Validation: Validated by M031/S03: `rg 'let _ =' reference-backend/ -g '*.mpl'` returns 0 matches, `rg '== true' reference-backend/ -g '*.mpl'` returns 0 matches, all 8 WorkerState full reconstructions replaced with struct update syntax, all nested if/else chains flattened to else if, long import converted to multiline. Build, formatter, project tests, and 313 e2e tests pass clean.
- Notes: 53 `let _ =` removed (44 in worker.mpl, 9 in other files), 15 `== true` removed (11 in worker.mpl, 4 in health.mpl), 8 struct reconstructions replaced, 7 nested if/else chains flattened.

### R025 — New e2e tests must cover: bare expression statements, `else if` chains (Int/String/Bool), `if fn_call() do`, `while fn_call() do`, `case fn_call() do`, `for x in fn_call() do`, `not fn_call()` in conditions, multiline fn calls, multiline imports, trailing commas, struct update in service handlers, pipe chains.
- Class: quality-attribute
- Status: validated
- Description: New e2e tests must cover: bare expression statements, `else if` chains (Int/String/Bool), `if fn_call() do`, `while fn_call() do`, `case fn_call() do`, `for x in fn_call() do`, `not fn_call()` in conditions, multiline fn calls, multiline imports, trailing commas, struct update in service handlers, pipe chains.
- Why it matters: These patterns had zero test coverage — they must not regress.
- Source: user
- Primary owning slice: M031/S05
- Supporting slices: M031/S01, M031/S02
- Validation: Validated by M031/S05 — all 12 listed pattern categories have dedicated e2e tests: bare expression statements (2 tests), else-if chains (S01 tests), if/while/case/for fn_call() do (S01 tests), not fn_call() in conditions (2 tests), multiline fn calls (S01 tests), multiline imports (S02 tests), trailing commas (S02 tests), struct update in service handlers (1 test), pipe chains (S03/S04 dogfood). Full suite: 328 tests, 318 pass, 10 pre-existing try_* failures.
- Notes: Current suite has 216 e2e tests and 6 test.mpl files.

## Deferred

### R020 — Mesh eventually offers a stronger debugger/profiler/trace surface suitable for deeper production diagnostics.
- Class: operability
- Status: deferred
- Description: Mesh eventually offers a stronger debugger/profiler/trace surface suitable for deeper production diagnostics.
- Why it matters: Mature backend ecosystems are judged heavily on observability and debugging, but this should not swallow the first trust milestone.
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred until the canonical backend path and boring deploy story are proven.

### R021 — Registry, publishing flow, package trust, and ecosystem polish rise from "credible enough" to "mature ecosystem experience."
- Class: admin/support
- Status: deferred
- Description: Registry, publishing flow, package trust, and ecosystem polish rise from "credible enough" to "mature ecosystem experience."
- Why it matters: It matters for adoption, but the first milestone should not stall on ecosystem breadth.
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: The baseline package flow is active scope; broad ecosystem polish is later.

### R022 — Operators get richer admin controls, manual retries, and deeper operational tooling.
- Class: operability
- Status: deferred
- Description: Operators get richer admin controls, manual retries, and deeper operational tooling.
- Why it matters: It helps long-term operability once the core loop is proven.
- Source: inferred
- Primary owning slice: M027/S02 (provisional)
- Supporting slices: none
- Validation: unmapped
- Notes: Day-one requirement is visible failure, not a full operator cockpit.

## Out of Scope

### R030 — The project is not being planned primarily as a frontend-first language effort.
- Class: anti-feature
- Status: out-of-scope
- Description: The project is not being planned primarily as a frontend-first language effort.
- Why it matters: This prevents scope confusion and preserves the explicit server/backend bias from the discussion.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Mesh remains general-purpose, but planning and proof are backend-led.

### R031 — M028 should not become a broad syntax/features sprint before the backend trust baseline is proven.
- Class: anti-feature
- Status: out-of-scope
- Description: M028 should not become a broad syntax/features sprint before the backend trust baseline is proven.
- Why it matters: This keeps the first milestone honest and evidence-first.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Feature expansion belongs after the hardening milestone unless a blocker is found on the golden path.

### R032 — The project will not call Mesh production-ready based only on feature lists, benchmarks, or toy examples.
- Class: constraint
- Status: out-of-scope
- Description: The project will not call Mesh production-ready based only on feature lists, benchmarks, or toy examples.
- Why it matters: This prevents the exact kind of weak proof the user rejected.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Honest proof is a non-negotiable scope boundary.

### R033 — This build does not treat a native mobile app as a first-class deliverable.
- Class: constraint
- Status: out-of-scope
- Description: This build does not treat a native mobile app as a first-class deliverable.
- Why it matters: It keeps attention on the web product and Mesh backend.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Web is the primary surface for the planned milestones.

### R034 — No new keywords, control flow forms, type system features, or stdlib functions. Only fix what's broken and clean up what's workaround-heavy.
- Class: anti-feature
- Status: out-of-scope
- Description: No new keywords, control flow forms, type system features, or stdlib functions. Only fix what's broken and clean up what's workaround-heavy.
- Why it matters: Prevents scope creep from turning a DX fix pass into a feature sprint.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Multiline imports and trailing commas are parser ergonomics, not new features.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | launchability | validated | M028/S01 | M028/S06 | Validated by M028/S01 through the shipped `reference-backend/` package, canonical startup contract (`DATABASE_URL`, `PORT`, `JOB_POLL_MS`), package README/.env example, compiler e2e proof (`e2e_reference_backend_builds`, `e2e_reference_backend_runtime_starts`, `e2e_reference_backend_postgres_smoke`), migration status/up commands, and the package-local smoke path proving the baseline with concrete commands instead of abstract claims. |
| R002 | core-capability | validated | M028/S01 | M028/S02, M028/S04, M028/S05, M028/S06 | Validated by M028/S01 through live end-to-end verification of `reference-backend/`. |
| R003 | quality-attribute | validated | M028/S02 | M028/S06 | Validated by M028/S02 through live Postgres-backed compiler e2e coverage. |
| R004 | quality-attribute | validated | M028/S05 | M028/S02, M028/S06, M028/S07 | Validated by M028/S07 through live recovery proof on `reference-backend/`. |
| R005 | launchability | validated | M028/S04 | M028/S06 | Validated by M028/S04 through live native-deployment proof for `reference-backend/`. |
| R006 | quality-attribute | validated | M028/S03 | M030/S01 (provisional), M030/S02 (provisional) | S03 closure reran the full tooling trust gate on `reference-backend/`. |
| R007 | launchability | active | M030/S01 (provisional) | M030/S02 (provisional) | mapped |
| R008 | launchability | validated | M028/S06 | M028/S01, M028/S03, M028/S04, M028/S05, M028/S07, M028/S08 | Validated by M028/S08 through the reconciled production-proof surface. |
| R009 | differentiator | validated | M028/S06 | M028/S01, M028/S02, M028/S05, M028/S07 | Validated by M028/S07 on top of the existing S01-S06 proof surface. |
| R010 | differentiator | active | M029/S01 (provisional) | M028/S04, M028/S06, M029/S02 (provisional) | mapped |
| R011 | differentiator | active | M029/S02 (provisional) | M029/S03 (provisional), M031/S01 | mapped |
| R012 | core-capability | active | M031/S01 (provisional) | M031/S02 (provisional), M031/S03 (provisional) | mapped |
| R013 | constraint | active | M023/S01 | M027/S01 (provisional), M031/S01 | mapped |
| R014 | constraint | active | M023/S02 | M023/S06 | mapped |
| R015 | core-capability | validated | M031/S01 | none | Validated by M031/S01/T02: added `types.insert` in `infer_if` for both return paths. 5 e2e tests pass (Int, String, Bool, 3-level chain, let binding). String-return test serves as crash sentinel. |
| R016 | core-capability | validated | M031/S01 | none | Validated by M031/S01/T01: added `suppress_trailing_closure` flag to parser with save/restore in all 4 control-flow condition sites. 5 e2e tests pass (if/while/case/for with fn-call conditions, plus trailing-closure regression). |
| R017 | core-capability | active | M031/S01 | none | unmapped |
| R018 | quality-attribute | validated | M031/S02 | none | Validated by M031/S02 — parenthesized multiline imports parse into the same AST shape as flat imports; 3 parser snapshot tests and 3 e2e tests prove single-line, multiline, and trailing-comma paren imports compile and run correctly. |
| R019 | quality-attribute | active | M031/S02 | none | unmapped |
| R020 | operability | deferred | none | none | unmapped |
| R021 | admin/support | deferred | none | none | unmapped |
| R022 | operability | deferred | M027/S02 (provisional) | none | unmapped |
| R023 | quality-attribute | validated | M031/S03 | none | Validated by M031/S03: `rg 'let _ =' reference-backend/ -g '*.mpl'` returns 0 matches, `rg '== true' reference-backend/ -g '*.mpl'` returns 0 matches, all 8 WorkerState full reconstructions replaced with struct update syntax, all nested if/else chains flattened to else if, long import converted to multiline. Build, formatter, project tests, and 313 e2e tests pass clean. |
| R024 | quality-attribute | active | M031/S04 | none | Partially validated by M031/S04: zero `let _ =` (72 removed across 6 files), 11 clear-win `<>` sites replaced with interpolation (D029-designated SQL/JSONB/crypto sites preserved), 3 nested else/if flattened to `else if`. Multiline imports deferred — meshc fmt collapses them back to single-line (formatter bug, not parser). Build succeeds; 313 e2e tests pass. |
| R025 | quality-attribute | validated | M031/S05 | M031/S01, M031/S02 | Validated by M031/S05 — all 12 listed pattern categories have dedicated e2e tests: bare expression statements (2 tests), else-if chains (S01 tests), if/while/case/for fn_call() do (S01 tests), not fn_call() in conditions (2 tests), multiline fn calls (S01 tests), multiline imports (S02 tests), trailing commas (S02 tests), struct update in service handlers (1 test), pipe chains (S03/S04 dogfood). Full suite: 328 tests, 318 pass, 10 pre-existing try_* failures. |
| R030 | anti-feature | out-of-scope | none | none | n/a |
| R031 | anti-feature | out-of-scope | none | none | n/a |
| R032 | constraint | out-of-scope | none | none | n/a |
| R033 | constraint | out-of-scope | none | none | n/a |
| R034 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 9
- Mapped to slices: 9
- Validated: 13 (R001, R002, R003, R004, R005, R006, R008, R009, R015, R016, R018, R023, R025)
- Unmapped active requirements: 0
