---
phase: 137-http-client-improvements
plan: 02
subsystem: stdlib
tags: [http, streaming, ureq, atomicbool, arc, keep-alive, cancel-handle, os-thread]

requires:
  - phase: 137-01
    provides: MeshRequestData handle, MeshClientResponse struct, alloc_result, ureq 3 Agent pattern, 5-point compiler registration baseline

provides:
  - mesh_http_stream: OS-thread-per-stream with Arc<AtomicBool> cancel handle (HTTP-06)
  - mesh_http_stream_bytes: byte variant of stream (delegates to mesh_http_stream)
  - mesh_http_cancel: peek-without-drop AtomicBool setter for cancel handles
  - mesh_http_client: keep-alive ureq Agent returned as u64 handle (HTTP-07)
  - mesh_http_send_with: reuse Agent for keep-alive requests
  - mesh_http_client_close: drop Agent and close pooled connections
  - All 6 functions registered in all 5 compiler points (builtins.rs, infer.rs, lower.rs x2, intrinsics.rs)
  - Three e2e test fixtures verifying compile correctness

affects: [138-testing-framework, 139-package-manifest, 140-registry]

tech-stack:
  added: []
  patterns:
    - "OS-thread-per-stream: std::thread::spawn for streaming responses, avoids blocking M:N scheduler"
    - "Arc<AtomicBool> cancel handle: Box::into_raw for stable address, peek-without-drop in cancel function"
    - "usize bridge for *mut u8 across thread boundary: cast to usize before spawn, cast back inside thread"
    - "execute_with_agent helper: shared request/response cycle for mesh_http_send and mesh_http_send_with"

key-files:
  created:
    - tests/e2e/http_stream_compile.mpl
    - tests/e2e/http_client_keepalive.mpl
    - tests/e2e/http_cancel_compile.mpl
  modified:
    - compiler/mesh-rt/src/http/client.rs
    - compiler/mesh-rt/src/http/mod.rs
    - compiler/mesh-typeck/src/builtins.rs
    - compiler/mesh-typeck/src/infer.rs
    - compiler/mesh-codegen/src/mir/lower.rs
    - compiler/mesh-codegen/src/codegen/intrinsics.rs
    - compiler/meshc/tests/e2e.rs

key-decisions:
  - "OS-thread-per-stream mandatory (LOCKED): spawns dedicated thread per Http.stream call to prevent blocking M:N scheduler coroutines"
  - "Peek-without-drop for cancel (LOCKED): mesh_http_cancel reads Arc via raw pointer reference (not Box::from_raw) to avoid dropping Arc while stream thread still holds its clone"
  - "Http.stream returns i64 cancel handle (0 = network error before streaming started)"
  - "usize bridge for raw pointer Send: *mut u8 callback_fn/callback_env cast to usize before std::thread::spawn, cast back inside closure"
  - "BuildRequestResult enum approach abandoned: ureq RequestBuilder<B> has type-state generic (WithBody/WithoutBody) making a shared enum impractical; inlined request building in each function instead"
  - ":continue keyword conflict: 'continue' is a reserved Mesh keyword (loop control), so fixture closures return string 'ok' instead of :continue atom; :stop still works as atom"
  - "fn chunk do...end syntax for multi-statement closure bodies: arrow form fn chunk -> only works for single expressions"

patterns-established:
  - "usize bridge pattern: cast *mut u8 to usize before thread::spawn boundary, cast back inside thread"
  - "execute_with_agent: shared unsafe fn for request/response cycle, called by both one-shot and keep-alive paths"

requirements-completed: [HTTP-06, HTTP-07]

duration: 9min
completed: 2026-02-28
---

# Phase 137 Plan 02: Http Streaming, Cancel Handle, Keep-Alive Summary

**Http streaming via OS-thread-per-stream with Arc<AtomicBool> cancel handle, keep-alive Agent (Http.client/send_with/client_close), wired through all 5 compiler points with three compile-only e2e tests passing**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-28T19:37:49Z
- **Completed:** 2026-02-28T19:47:10Z
- **Tasks:** 2
- **Files modified:** 8 (+ 3 created)

## Accomplishments
- Http streaming with OS-thread-per-stream pattern (locked CONTEXT.md decision) — never blocks M:N scheduler
- Arc<AtomicBool> cancel handle returned by Http.stream; Http.cancel peeks without dropping (peek-without-drop pattern)
- Keep-alive connection pool via ureq Agent: Http.client() creates, Http.send_with(client, req) reuses, Http.client_close(client) frees
- All 6 new functions registered in all 5 compiler points (builtins.rs, infer.rs stdlib_modules, lower.rs map_builtin_name + known_functions, intrinsics.rs LLVM declarations)
- All 4 Phase 137 HTTP e2e tests pass including e2e_http_client_keepalive_compiles printing "client_created"

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement streaming + cancel handle + keep-alive in client.rs** - `644f4471` (feat)
2. **Task 2: Register streaming/cancel/keep-alive through all 5 compiler points + e2e tests** - `db033f5a` (feat)

## Files Created/Modified
- `compiler/mesh-rt/src/http/client.rs` - Added mesh_http_stream, mesh_http_stream_bytes, mesh_http_cancel, mesh_http_client, mesh_http_send_with, mesh_http_client_close; refactored execute_with_agent helper
- `compiler/mesh-rt/src/http/mod.rs` - Added pub use exports for all 6 new symbols
- `compiler/mesh-typeck/src/builtins.rs` - Added type registrations for 6 new functions
- `compiler/mesh-typeck/src/infer.rs` - Extended Http module in stdlib_modules with stream/cancel/client entries
- `compiler/mesh-codegen/src/mir/lower.rs` - Added to map_builtin_name and known_functions for all 6 new functions
- `compiler/mesh-codegen/src/codegen/intrinsics.rs` - Added LLVM declarations for all 6 new functions
- `compiler/meshc/tests/e2e.rs` - Added 3 new e2e test functions
- `tests/e2e/http_stream_compile.mpl` - Stream callback compile fixture
- `tests/e2e/http_client_keepalive.mpl` - Keep-alive client fixture (prints "client_created")
- `tests/e2e/http_cancel_compile.mpl` - Cancel handle type-check fixture

## Decisions Made

- **OS-thread-per-stream (LOCKED DECISION):** std::thread::spawn for each Http.stream call. Required because the Mesh M:N scheduler uses coroutines — blocking read inside a coroutine would deadlock the scheduler thread. OS threads are independent of the scheduler.
- **Peek-without-drop for cancel (LOCKED DECISION):** mesh_http_cancel uses `&*(handle as *const Arc<AtomicBool>)` — reads the Arc via reference without Box::from_raw which would drop it on function exit, potentially freeing while stream thread still holds a clone.
- **usize bridge for thread Send:** `*mut u8` is `!Send` in Rust. Pattern from ws/server.rs: cast to `usize` before spawn, cast back inside the thread closure. Both callback_fn and callback_env get this treatment.
- **Inline request building in mesh_http_stream:** The ureq `RequestBuilder<B>` struct is generic over a type-state (`WithBody` / `WithoutBody`), making it impossible to store in an enum with a shared interface. The execute_with_agent helper uses inline `if/else` branches for body vs no-body paths.
- **No :continue atom in fixtures:** `continue` is a Mesh reserved keyword for loop control. Using `:continue` in closure body causes parse errors. Changed to string `"ok"` — only `"stop"` is special to is_stop_atom, everything else continues streaming.
- **Multi-statement closure syntax:** `fn param do ... end` (not `fn param -> ...`) required for multi-statement closure bodies passed as function arguments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BuildRequestResult enum approach abandoned**
- **Found during:** Task 1 (implement streaming in client.rs)
- **Issue:** Plan's proposed build_request helper used `ureq::RequestBuilder<'a>` with a lifetime, but ureq 3's RequestBuilder is generic over a type-state (`WithBody` / `WithoutBody`) not a lifetime. The enum approach could not compile.
- **Fix:** Inlined request building directly in execute_with_agent and mesh_http_stream using if/else branches for body vs no-body paths. The execute_with_agent helper still provides the shared response-handling logic.
- **Files modified:** compiler/mesh-rt/src/http/client.rs
- **Committed in:** 644f4471 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed *mut u8 Send safety in stream thread**
- **Found during:** Task 1 (mesh_http_stream thread::spawn)
- **Issue:** `*mut u8` is `!Send` so callback_fn and callback_env raw pointers cannot be moved into std::thread::spawn closure directly.
- **Fix:** Cast both pointers to `usize` before spawn (same pattern used in ws/server.rs). Cast back to pointer type inside the closure.
- **Files modified:** compiler/mesh-rt/src/http/client.rs
- **Committed in:** 644f4471 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed e2e fixture closure syntax**
- **Found during:** Task 2 (e2e test execution)
- **Issue 1:** `:continue` parse error — `continue` is a Mesh reserved keyword; atom form `:continue` fails to parse in closure body.
- **Issue 2:** Multi-statement closure with arrow form (`fn chunk -> ... end`) fails with "expected R_PAREN" — arrow form only supports single expressions.
- **Fix:** Changed `:continue` to string `"ok"` (only "stop" is checked by is_stop_atom). Changed `fn chunk -> ... end` to `fn chunk do ... end` for multi-statement body.
- **Files modified:** tests/e2e/http_stream_compile.mpl, tests/e2e/http_cancel_compile.mpl
- **Committed in:** db033f5a (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bug fixes)
**Impact on plan:** All fixes necessary for correctness. No scope creep. Core intent preserved.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HTTP-06 (streaming) and HTTP-07 (keep-alive client) complete
- All Phase 137 HTTP requirements satisfied (HTTP-01 through HTTP-07)
- Phase 138 (Testing Framework) ready to proceed

---
*Phase: 137-http-client-improvements*
*Completed: 2026-02-28*
