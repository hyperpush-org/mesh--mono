# S01 Research: Limitation Truth Audit and Repro Matrix

## Summary

This slice found four stale-folklore clusters, one priority live blocker, and several truthful retained limits.

- **Stale folklore:** query-string parsing, cross-module `from_json`, inline `case` inside service call bodies, and inline `if/else` inside cast handlers all work today through real `meshc` CLI paths.
- **Priority live blocker:** true **cross-module inferred polymorphic export** still fails on the real CLI path. A minimal `pub fn identity(x) do x end` exported from one module and imported in another reaches LLVM verification and dies with a call-signature mismatch.
- **Truthful retained limits:** route closures still fail at runtime, `&&` inside nested `if` blocks still fails in codegen, timer-delivered raw messages still do not satisfy service cast dispatch, and multi-statement `case` arms still require `-> do ... end`.
- **Current baseline:** `cargo run -q -p meshc -- fmt --check mesher` passes and `cargo run -q -p meshc -- build mesher` passes.

The highest-value next step is **not** a `from_json` fix. That family is already green. The real S02 target is the cross-module inferred export failure behind the remaining `storage/writer` workaround story.

## Recommendation

Plan the next execution work in two buckets:

1. **Mesh fix first:** take the direct cross-module inferred polymorphic export failure (`.tmp/m032-s01/xmod_identity`) as the S02 blocker retirement target.
2. **Mesher cleanup separately:** retire stale query/from_json/service-body folklore without changing product behavior.

Two cautions matter:

- Do **not** classify route-closure support from compile-only evidence. A zero-capture closure route builds, then crashes on the first live HTTP request.
- Do **not** delete mixed-truth comments wholesale. `mesher/storage/writer.mpl` contains both stale wording and the best live clue for the real blocker.

This research followed the `debug-like-expert` skill’s core rule: **verify, don’t assume**. Every stale/real classification below is tied to a minimal repro, a neighboring passing regression, or a direct source read of the responsible parser/runtime seam.

## Requirements Targeted

- **R011** — keep new language/runtime work anchored to real backend dogfood friction
- **R013** — fix real Mesh blockers in Mesh and then use them in the app
- **R035** — limitation/workaround comments must be truthful and current
- **Supports R010** — the repo’s claims about Mesh need to be grounded in real dogfood evidence

## Skills Discovered

- **Loaded:** `debug-like-expert`
  - Applied rules:
    - **VERIFY, DON’T ASSUME** — every claim below has a reproduction or direct source proof.
    - **Analysis-only** — no product source changes were made during investigation.
- **Already available but not needed for this read-only slice:** `rust-best-practices`
- **Skill search performed:**
  - `npx skills find "PostgreSQL"`
  - `npx skills find "compiler"`
- **Result:** no new skills installed. The returned skills were schema-design / optimization or generic compiler tooling, not directly useful for this Mesh limitation audit.

## Implementation Landscape

### A. Query-string folklore is stale

**Mesher files and roles**

- `mesher/ingestion/routes.mpl` — ingestion HTTP handlers; still carries the stale comment
- `mesher/api/helpers.mpl` — shared request helpers; already uses `Request.query`
- `mesher/api/search.mpl` — production search/filter handlers; already use query params extensively

**Exact stale site**

- `mesher/ingestion/routes.mpl:445`
  - `# Defaults to listing 'unresolved' issues (query string parsing not available in Mesh).`

**Contradicting local evidence**

- `mesher/api/helpers.mpl:39-42`
- `mesher/api/search.mpl:36,171-175,233,285-286,314-315`

**Direct repro run in this slice**

- Fixture: `.tmp/m032-s01/request_query/main.mpl`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/request_query
./.tmp/m032-s01/request_query/request_query
```

- Observed output:

```text
request_query_ok
```

**Planning consequence**

This is straight stale-comment cleanup. No Mesh fix is needed to let `handle_list_issues` read `status` from the query string.

### B. Cross-module `from_json` folklore is stale, but some comments still point at a real ORM choice

**Mesher files and roles**

- `mesher/services/event_processor.mpl` — event ingestion service; comments still blame cross-module `from_json`
- `mesher/storage/queries.mpl` — SQL-side extraction helpers; from_json rationale is stale, raw-SQL rationale still real
- `mesher/storage/writer.mpl` — low-level event insert; same mixed-truth problem
- `mesher/types/event.mpl` / `mesher/types/issue.mpl` — data-shape notes about row strings and later parsing

**Stale rationale sites**

- `mesher/services/event_processor.mpl:5`
- `mesher/services/event_processor.mpl:119-120`
- `mesher/storage/queries.mpl:482`
- `mesher/storage/writer.mpl:19-20`

**Neutral / still-accurate data-shape notes**

- `mesher/types/event.mpl:55`
- `mesher/types/issue.mpl:14`

Those type-file comments do **not** claim cross-module failure. They describe row-shape reality: JSONB columns arrive as strings and may be parsed later.

**Direct repro run in this slice**

- Fixture: `.tmp/m032-s01/xmod_from_json/{models.mpl,main.mpl}`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/xmod_from_json
./.tmp/m032-s01/xmod_from_json/xmod_from_json
```

- Observed output:

```text
Scout 7
```

**Existing regression surface confirmed**

```bash
cargo test -q -p meshc --test e2e cross_module_from_json -- --nocapture
```

Observed result:

```text
running 2 tests
..
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 326 filtered out
```

**Planning consequence**

The **from_json explanation** is stale. The **SQL-side extraction** may still be the right design for ORM expressiveness, server-side JSONB work, or performance. Cleanup here is comment surgery first, not automatic code deletion.

### C. Service-body folklore splits cleanly: two stale, one real

#### C1. Complex `case` inside service call bodies is stale

**Mesher file and role**

- `mesher/services/user.mpl` — user auth/session service

**Stale site**

- `mesher/services/user.mpl:18-20`
  - says the login helper was extracted to avoid complex case expressions inside service dispatch handlers

**Direct repro run in this slice**

- Fixture: `.tmp/m032-s01/service_call_case/main.mpl`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/service_call_case
./.tmp/m032-s01/service_call_case/service_call_case
```

- Observed output:

```text
yes
no
```

**Planning consequence**

This helper extraction is no longer justified by a live Mesh limitation.

#### C2. `if/else` inside cast handlers is stale

**Mesher file and role**

- `mesher/services/stream_manager.mpl` — websocket buffer/flush service

**Stale site**

- `mesher/services/stream_manager.mpl:125`
  - says `buffer_if_client` exists because `if/else` in cast handlers is a parser limitation

**Direct repro run in this slice**

- Fixture: `.tmp/m032-s01/cast_if_else/main.mpl`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/cast_if_else
./.tmp/m032-s01/cast_if_else/cast_if_else
```

- Observed output:

```text
1
2
```

**Planning consequence**

This comment is stale. The cast-body helper can be revisited as Mesher cleanup, not compiler work.

#### C3. `&&` inside nested `if` blocks is still real

**Mesher file and role**

- `mesher/services/stream_manager.mpl` — same service, but this time the helper is masking a real bug

**Live site**

- `mesher/services/stream_manager.mpl:63`
  - `# AND helper for filter matching -- avoids && codegen issue inside nested if blocks.`

**Direct repro run in this slice**

- Fixture: `.tmp/m032-s01/nested_and/main.mpl`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/nested_and
```

- Observed failure:

```text
error: LLVM module verification failed: "PHI node entries do not match predecessors!
  %and_result = phi i1 [ false, %entry ], [ %right3, %and_rhs ]
label %entry
label %then
"
```

**Stage diagnosis**

- Parser is not the issue; the program parses.
- Typechecker is not the issue; the build reaches LLVM verification.
- The likely owner is `compiler/mesh-codegen`, not front-end parsing.

**Planning consequence**

This is a real retained blocker. It belongs in the keep-list unless the milestone explicitly chooses to fix it.

### D. Cross-module inferred polymorphic export is the main live blocker for S02

**Mesher files and roles**

- `mesher/storage/writer.mpl` — low-level insert module; still carries the strongest comment in this family
- `mesher/services/writer.mpl` — actual service definition; useful control because the `storage/writer` comment is partly outdated

**Mixed-truth comment**

- `mesher/storage/writer.mpl:4-5`
  - says services and inferred/polymorphic functions cannot be exported across modules due to type variable scoping limitations

This comment is **not fully truthful today**:

- the service-definition wording is stale (`services/writer.mpl` exists; the service does **not** live in `main.mpl`)
- but the truly inferred cross-module export failure is still real

**Controls that pass**

- Cross-module service import is green:

```bash
cargo test -q -p meshc --test e2e e2e_cross_module_service -- --nocapture
```

Observed result:

```text
running 1 test
.
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 327 filtered out
```

- Cross-module `from_json` is green (see prior section)

**Real failing repro run in this slice**

- Fixture: `.tmp/m032-s01/xmod_identity/{utils.mpl,main.mpl}`
- Shape under test:

```mesh
pub fn identity(x) do
  x
end
```

- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/xmod_identity
```

- Observed failure:

```text
error: LLVM module verification failed: "Call parameter type does not match function signature!
i64 7
 {}  %call = call {} @identity(i64 7)
Call parameter type does not match function signature!
  %str = call ptr @mesh_string_new(ptr @.str, i64 4)
 {}  %call2 = call {} @identity(ptr %str)
"
```

**Why this is the best S02 target**

- It is a real Mesh failure on the real CLI path.
- It lines up exactly with S02’s cross-module + inferred-export scope.
- It sits directly under a Mesher workaround family the milestone already wants to retire.

**Likely owning subsystems**

This does **not** look like a parser bug. The build reaches LLVM verification. The likely seam is the export/import + lowering boundary:

- `compiler/mesh-typeck/src/lib.rs`
  - `imported_functions`
  - `imported_service_methods`
  - `local_service_exports`
- imported function scheme normalization / call lowering / LLVM signature emission in the codegen pipeline

**Planning consequence**

S02 should start here. Add an exact CLI e2e around true inferred polymorphic export before implementing the fix.

### E. HTTP route closures are compile-pass but runtime-real

**Mesher file and role**

- `mesher/ingestion/routes.mpl` — ingestion HTTP route registration

**Comment under audit**

- `mesher/ingestion/routes.mpl:2`
  - `# Handlers are bare functions (HTTP routing does not support closures).`

**Compile-only repro is misleading**

- Fixture: `.tmp/m032-s01/route_closure/main.mpl`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/route_closure
```

- Observed result: **passes**

That alone would incorrectly classify the comment as stale.

**Live-request repro run in this slice**

- Closure server fixture: `.tmp/m032-s01/route_closure_server/main.mpl`
- Bare-function control fixture: `.tmp/m032-s01/route_bare_server/main.mpl`
- Observed behavior:
  - closure route server listens on `:18123`, then a request to `/` returns `curl: (52) Empty reply from server` and the process crashes
  - bare-function route server on `:18124` returns `HTTP/1.1 200 OK ... bare_ok`

**Why the runtime clue is strong**

`compiler/mesh-rt/src/http/router.rs` already shows the underlying seam:

- `RouteEntry` carries both `handler_fn` and `handler_env`
- but `route_with_method(...)` at `compiler/mesh-rt/src/http/router.rs:157-181` hardcodes:

```rust
let handler_env: *mut u8 = std::ptr::null_mut();
```

- and the exported route registration functions at `compiler/mesh-rt/src/http/router.rs:208-256` only accept `handler_fn`, unlike middleware which carries env state

So the route stack is not closure-capable end-to-end even though a zero-capture closure can get through build.

**Planning consequence**

Keep this as a truthful retained limitation unless the milestone explicitly chooses a runtime HTTP-closure fix. Do **not** delete the comment from build-only evidence.

### F. `Timer.send_after` still cannot trigger service cast dispatch

**Mesher files and roles**

- `mesher/services/writer.mpl` — flush ticker workaround
- `mesher/ingestion/pipeline.mpl` — stream drain ticker workaround

**Comment sites**

- `mesher/services/writer.mpl:174`
- `mesher/ingestion/pipeline.mpl:81-82`

**Direct repro run in this slice**

- Fixture: `.tmp/m032-s01/timer_service_cast/main.mpl`
- Command:

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/timer_service_cast
./.tmp/m032-s01/timer_service_cast/timer_service_cast
```

- Observed output:

```text
0
```

The service’s `Tick()` cast never runs. The delayed raw `()` is delivered, but it does not match the tagged service dispatch format.

**Planning consequence**

These timer-ticker comments are truthful and should stay unless a deliberate service-message scheduling fix is chosen.

### G. Single-expression `case` arm pressure is still real

**Mesher files and roles**

- `mesher/services/event_processor.mpl` — extracted helper for `case` branch work
- `mesher/ingestion/fingerprint.mpl` — extracted helper for fingerprint fallback branch work
- `mesher/services/retention.mpl` — extracted helpers for logging branches
- `mesher/ingestion/pipeline.mpl` — extracted helpers for spike/alert branches

**Comment sites**

- `mesher/services/event_processor.mpl:105`
- `mesher/ingestion/fingerprint.mpl:53`
- `mesher/services/retention.mpl:8`
- `mesher/ingestion/pipeline.mpl:108,293`

**Parser source proof**

`compiler/mesh-parser/src/parser/expressions.rs:973-1001` still implements `parse_match_arm` as:

- one expression after `->`, **or**
- `-> do ... end`

So multi-statement arms still require the explicit block wrapper.

**Planning consequence**

These comments are not stale by themselves. S03 can retire stale handler folklore around them, but the case-arm limitation remains a valid keep-site unless parser work is pulled in.

### H. ORM/raw SQL boundary comments are mostly truthful

**Main cluster**

- `mesher/storage/queries.mpl`
- `mesher/storage/writer.mpl`

**What stayed true in this slice**

Comments about the ORM not expressing:

- server-side JSONB extraction in `INSERT ... SELECT`
- `ts_rank(...)` with bound parameters in select expressions
- multiple scalar subqueries in one select
- `now()` / `COALESCE` / current-column fallback in update sets
- derived-table cross joins and other Postgres-specific expressions

were not contradicted by any repro in this slice.

**Important nuance**

Within this family, the **raw-SQL boundary claims** stayed truthful, but the **cross-module `from_json` explanation** did not.

**Planning consequence**

Treat this as comment refinement, not as an automatic ORM rewrite target.

## Repro Matrix

| Family | Mesher site(s) | Status | Repro / proof | Observed result | Likely owner |
|---|---|---|---|---|---|
| Query string parsing unavailable | `mesher/ingestion/routes.mpl:445` | **Stale** | `.tmp/m032-s01/request_query` build+run | `request_query_ok` | no Mesh change needed |
| Cross-module `from_json` unavailable | `mesher/services/event_processor.mpl:5,119-120`, `mesher/storage/queries.mpl:482`, `mesher/storage/writer.mpl:19-20` | **Stale** | `.tmp/m032-s01/xmod_from_json` build+run; `cargo test ... cross_module_from_json` | `Scout 7`; 2 tests passed | no Mesh change needed |
| Complex `case` in service call body | `mesher/services/user.mpl:18-20` | **Stale** | `.tmp/m032-s01/service_call_case` build+run | `yes` / `no` | no Mesh change needed |
| `if/else` in cast handler | `mesher/services/stream_manager.mpl:125` | **Stale** | `.tmp/m032-s01/cast_if_else` build+run | `1` / `2` | no Mesh change needed |
| Inferred polymorphic export across module | `mesher/storage/writer.mpl:4-5` | **Real blocker** | `.tmp/m032-s01/xmod_identity` build | LLVM call-signature verification failure | type export/import + codegen |
| `&&` inside nested `if` | `mesher/services/stream_manager.mpl:63` | **Real blocker** | `.tmp/m032-s01/nested_and` build | LLVM PHI mismatch | codegen |
| HTTP route closures | `mesher/ingestion/routes.mpl:2` | **Real, but only at runtime** | closure server on `:18123` + curl, with bare-fn control on `:18124` | closure path crashes / empty reply; bare fn returns 200 | runtime HTTP route + codegen closure passing |
| `Timer.send_after` to service cast | `mesher/services/writer.mpl:174`, `mesher/ingestion/pipeline.mpl:81-82` | **Real** | `.tmp/m032-s01/timer_service_cast` build+run | `0` (silent no-op) | service dispatch/runtime |
| Multi-statement `case` arm without `-> do ... end` | helper sites above | **Real** | parser source read | still requires block wrapper | parser |

## Verification

### Direct repros run in this slice

```bash
cargo run -q -p meshc -- build .tmp/m032-s01/request_query
./.tmp/m032-s01/request_query/request_query

cargo run -q -p meshc -- build .tmp/m032-s01/xmod_from_json
./.tmp/m032-s01/xmod_from_json/xmod_from_json

cargo run -q -p meshc -- build .tmp/m032-s01/service_call_case
./.tmp/m032-s01/service_call_case/service_call_case

cargo run -q -p meshc -- build .tmp/m032-s01/cast_if_else
./.tmp/m032-s01/cast_if_else/cast_if_else

cargo run -q -p meshc -- build .tmp/m032-s01/nested_and
cargo run -q -p meshc -- build .tmp/m032-s01/xmod_identity

cargo run -q -p meshc -- build .tmp/m032-s01/timer_service_cast
./.tmp/m032-s01/timer_service_cast/timer_service_cast

cargo run -q -p meshc -- build .tmp/m032-s01/route_closure
cargo run -q -p meshc -- build .tmp/m032-s01/route_closure_server
cargo run -q -p meshc -- build .tmp/m032-s01/route_bare_server
```

### Existing regression surfaces confirmed

```bash
cargo test -q -p meshc --test e2e cross_module_from_json -- --nocapture
cargo test -q -p meshc --test e2e e2e_cross_module_service -- --nocapture
cargo test -q -p meshc --test e2e e2e_struct_update_in_service_call -- --nocapture
```

A useful reminder for the planner: `compiler/meshc/tests/e2e.rs` invokes the real `meshc` binary on temp projects. These are true CLI-path proofs, not mocked unit tests.

### Current Mesher baseline

```bash
cargo run -q -p meshc -- fmt --check mesher
cargo run -q -p meshc -- build mesher
```

Observed result:

- formatter check passed silently
- build produced `Compiled: mesher/mesher`

## Risks and Mitigations

1. **Compile-only audits can lie about runtime limitations.**
   - Proven by route closures: build passes, live request crashes.
   - **Mitigation:** any future claim about HTTP handler closures needs a live request, not just `meshc build`.

2. **Old comments often mix one stale reason with one real limitation.**
   - `mesher/storage/writer.mpl` is the clearest case.
   - **Mitigation:** rewrite mixed-truth comments into precise claims instead of deleting them wholesale.

3. **Some real failures surface only at LLVM verification.**
   - `xmod_identity` and `nested_and` both made it through earlier phases.
   - **Mitigation:** the eventual fix slices need exact CLI e2e coverage, not only parser/typechecker tests.

4. **Timer/service mismatch is currently a silent no-op.**
   - That makes false confidence easy.
   - **Mitigation:** if this path is ever fixed, add a dedicated regression test immediately.

## Natural Task Boundaries

1. **T01 — Mesher-only stale folklore cleanup**
   - target files:
     - `mesher/ingestion/routes.mpl`
     - `mesher/services/user.mpl`
     - `mesher/services/stream_manager.mpl`
     - `mesher/services/event_processor.mpl`
     - `mesher/storage/queries.mpl`
     - `mesher/storage/writer.mpl`
   - work:
     - remove or rewrite stale query/from_json/service-body comments
     - collapse stale helper shapes only where behavior stays identical
   - verification:
     - rerun the working direct repros above
     - `cargo run -q -p meshc -- fmt --check mesher`
     - `cargo run -q -p meshc -- build mesher`

2. **T02 — Cross-module inferred export blocker retirement (best S02 seed)**
   - target area:
     - imported function/export metadata and codegen boundary
   - seed repro:
     - `.tmp/m032-s01/xmod_identity`
   - likely code areas:
     - `compiler/mesh-typeck` export/import plumbing
     - imported call lowering / LLVM signature emission in codegen
   - verification:
     - new exact CLI e2e for `pub fn identity(x) do x end` across modules
     - Mesher dogfood removal or rewrite of the remaining workaround comment after the fix

3. **T03 — Retained-limit ledger and non-scope blockers**
   - keep-list unless deliberately promoted:
     - route closures runtime
     - nested-`&&` codegen
     - timer -> service cast mismatch
     - `case` arm `-> do ... end`
     - ORM/raw SQL expressiveness gaps
   - verification:
     - each retained comment must point at one current repro or source proof

## Forward Intelligence

- The most important live blocker is **not** the old `from_json` family. It is the **true inferred polymorphic cross-module export** failure.
- `mesher/storage/writer.mpl` is a mixed-truth file. Treat it carefully: part of its comment is stale, part of it is the best current pointer to the real blocker.
- Route closure support is a trap: **build passes, runtime dies**. Any future audit that stops at `meshc build` will misclassify it.
- The service-body folklore cluster splits cleanly:
  - **stale:** inline `case` in call handlers, inline `if/else` in cast handlers
  - **real:** nested `&&` codegen
- The case-arm helper cluster is still truthful, but the limitation is narrower than some older comments imply: multi-statement arms need `-> do ... end`; that is not the same as a general handler/codegen failure.
- The runtime route gap may be fairly local: `RouteEntry` already has `handler_env`, but the public route API still throws that information away. That suggests a smaller future fix surface than a whole new closure system.
- The `.tmp/m032-s01/*` repros are worth keeping as planner/executor seed fixtures until the relevant slices convert them into permanent regression tests or discard them deliberately.
- Current whole-app baseline is green. S01 does **not** need a pre-stabilization slice before S02/S03 planning.
