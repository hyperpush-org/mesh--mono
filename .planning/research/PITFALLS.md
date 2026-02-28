# Pitfalls Research

**Domain:** Ecosystem expansion for an existing compiled programming language — crypto stdlib, date/time, HTTP client improvements, test framework, package registry
**Researched:** 2026-02-28
**Confidence:** HIGH (direct Mesh source analysis + ecosystem research across all five domains)

---

## Critical Pitfalls

Mistakes that cause rewrites, multi-day debugging sessions, or fundamental design lock-in.

---

### Pitfall 1: Duplicating Crypto Dependencies Already in mesh-rt

**What goes wrong:**

The developer adds new crates for crypto operations — e.g., pulling in `sha3`, `aes-gcm`, or `blake3` — without noticing that `sha2`, `hmac`, `ring`, `base64`, and `pbkdf2` are already compiled into `mesh-rt`. The result is two separate crypto ecosystems living inside the same binary: one used by the PG auth/TLS subsystem and one used by the new stdlib module. Version conflicts arise when the ecosystem crates (`sha2 0.10` vs a hypothetical `sha2 0.11`) do not agree, and the binary bloats by 200-400 KB with duplicate crypto codegen.

**Why it happens:**

The new stdlib developer looks at what is "needed" for the feature (SHA-256, HMAC-SHA256, UUID v4), finds crates, and adds them to `Cargo.toml` without auditing what is already there. `mesh-rt/Cargo.toml` already lists `sha2 = "0.10"`, `hmac = "0.12"`, `ring = "0.17"`, `base64 = "0.22"`, and `rand = "0.9"`. Every v14.0 crypto operation (SHA-256, SHA-512, HMAC, UUID v4, hex encoding) can be implemented using exactly these existing dependencies.

**How to avoid:**

Before adding any crate for crypto stdlib, read `compiler/mesh-rt/Cargo.toml` top-to-bottom and map each needed operation to an existing dep:
- SHA-256 / SHA-512 → `sha2` (already present)
- HMAC-SHA256 / HMAC-SHA512 → `hmac` + `sha2` (already present)
- UUID v4 → `rand` (already present) — generate 16 random bytes, set version/variant bits per RFC 4122
- Base64 encode/decode → `base64 = "0.22"` (already present; replaces `base64ct` used for PG auth)
- Hex encode → implement inline (8 lines) or use `ring`'s utilities (already present)
- Constant-time compare → `ring::constant_time` or `hmac::Mac::verify_slice` (already present and already security-reviewed for the cluster auth use case)

Zero new crates needed for the entire crypto stdlib module.

**Warning signs:**

Any PR that adds a new crate from the `RustCrypto` org for v14.0 should be challenged — the required functionality is already available. The exception is if a truly new capability is needed (e.g., AES encryption, which is not in any existing dep).

**Phase to address:** Crypto stdlib phase — the very first task is auditing `Cargo.toml` before writing a single line of code.

---

### Pitfall 2: Exposing Non-Constant-Time Comparison for Secrets

**What goes wrong:**

The crypto stdlib module exposes a `Crypto.compare(a, b)` function that internally uses `==` (which compiles to a short-circuit byte comparison). A user calls it to compare HMAC values or session tokens. The function leaks timing information: it exits earlier when bytes differ near the start, allowing an attacker to reconstruct a valid token one byte at a time via timing measurements.

This is not theoretical. A published security advisory for `curve25519-dalek` showed LLVM re-introducing branches into what was written as bitwise constant-time code. Using `==` directly is worse — it is explicitly a short-circuit comparison with no mitigations at all.

**Why it happens:**

The developer implements `compare` as a convenience function and does not flag it as a security primitive. String equality in Mesh compiles to `snow_string_eq` which is not constant-time. The function looks correct from a functional perspective — it returns the right answer — but leaks timing.

**How to avoid:**

Do NOT expose a generic `Crypto.compare` function. Instead:

1. For HMAC verification: use `hmac::Mac::verify_slice` from the existing `hmac` dep. This calls `subtle::ConstantTimeEq` internally and is the same code already used for the cluster HMAC-SHA256 cookie auth (v5.0 decision).
2. For raw digest comparison: call `ring::constant_time::verify_slices_are_equal` (already present).
3. Document in the Mesh stdlib that `Crypto.hmac_verify` should be used for all secret comparisons. Never suggest using `==` or `assert_eq` for HMAC or token comparison.

The extern C signature for secret comparison should accept two byte-slice representations and return a Bool via the constant-time path, with no way to call the variable-time path by mistake.

**Warning signs:**

Any implementation that calls Rust's `==` on two `&[u8]` slices containing cryptographic output is wrong. Any test that passes by comparing HMAC output with a string literal using `assert_eq` is exposing a variable-time comparison path.

**Phase to address:** Crypto stdlib phase — design the API surface before implementing anything. The API must make constant-time the only path for secret comparison.

---

### Pitfall 3: Representing Timestamps as Formatted Strings Instead of Unix Epoch Integers

**What goes wrong:**

The date/time stdlib stores timestamps as formatted strings (e.g., `"2026-02-28T12:00:00Z"`) rather than as integer Unix timestamps (seconds or milliseconds since epoch). Arithmetic operations (`add_seconds`, `diff`, duration comparison) then require parsing the string on every call. Sorting dates requires parsing. Comparing timestamps requires parsing. The result is a date/time module that is ergonomic for display but broken for computation.

An alternative failure mode: storing timestamps as `Float` (fractional seconds). This loses precision for sub-second durations at the nanosecond level and creates floating-point comparison problems (`1740744000.0 == 1740744000.0` is `true` until it is not due to float rounding).

**Why it happens:**

ISO 8601 strings are "obviously" what dates look like. PostgreSQL returns timestamps as strings over the text protocol. Mesh has no native integer-typed timestamp. The path of least resistance is to wrap the string representation and call it a "DateTime."

**How to avoid:**

Use two representations, clearly distinguished:
- `Int` (Unix timestamp in milliseconds) as the canonical internal representation for arithmetic, sorting, and storage
- `String` (ISO 8601) as the display/serialization representation

The stdlib functions should be:
- `Date.now() -> Int` (milliseconds since epoch)
- `Date.parse(str) -> Result<Int, String>` (string to epoch ms)
- `Date.format(ts_ms) -> String` (epoch ms to ISO 8601)
- `Date.add_seconds(ts_ms, seconds) -> Int`
- `Date.diff_seconds(ts_ms_a, ts_ms_b) -> Int`

This matches Erlang's `:erlang.system_time(:millisecond)` pattern and avoids the "naive datetime" trap (Python's most infamous date/time mistake). Storing epoch milliseconds means comparisons and arithmetic are integer operations — no parsing, no floating-point, no timezone confusion during storage.

**Warning signs:**

If the `DateTime` type is a String alias, arithmetic requires parsing. If it is a `Float`, sub-millisecond comparisons will drift. If the internal representation is opaque and hides its unit (seconds vs. milliseconds), bugs appear when mixing values.

**Phase to address:** Date/time stdlib phase — the representation decision must be made first; every other function depends on it.

---

### Pitfall 4: Silently Assuming UTC When Timezone Information is Missing

**What goes wrong:**

The date/time stdlib accepts strings like `"2026-02-28 12:00:00"` (no timezone) and treats them as UTC. A user in Tokyo passes their local time. The server records it as UTC. The stored value is 9 hours wrong. There is no error, no warning, and no indication the conversion was applied. This class of bug hides for weeks until a date-sensitive feature fails in production in a non-UTC timezone.

This is the most common date/time bug in production systems. Python's `datetime.datetime.utcnow()` was deprecated precisely because it silently dropped timezone context. JavaScript's `new Date()` parsing is notorious for this.

**Why it happens:**

Parsing `"2026-02-28 12:00:00"` succeeds — it is a valid date. The developer does not add a check for missing timezone info because the happy path works. The bug only manifests when a user provides input without explicit UTC marker.

**How to avoid:**

`Date.parse` must return `Err` for any string that does not include explicit timezone offset. Accept only:
- `"2026-02-28T12:00:00Z"` (UTC)
- `"2026-02-28T12:00:00+09:00"` (explicit offset)

Reject `"2026-02-28 12:00:00"` with an error: "timestamp must include timezone offset (use Z for UTC)". This is strict but correct. Users who need to parse local times must explicitly provide their offset.

Do not attempt to load the system timezone database for DST handling in v14.0. The scope for v14.0 is: parse UTC/fixed-offset timestamps, format timestamps, do arithmetic. Full IANA timezone database (handling DST transitions, historical offsets, "America/New_York" strings) is a separate, substantial feature that should be deferred.

**Warning signs:**

Any `Date.parse` function that accepts strings without a `+HH:MM` or `Z` suffix without returning an error is broken. Any function that calls `chrono::NaiveDateTime` (or equivalent) without attaching a timezone is accumulating timezone debt.

**Phase to address:** Date/time stdlib phase — must be in the initial API design. Cannot be retrofitted after users start passing timezone-free strings.

---

### Pitfall 5: HTTP Client Blocking I/O Starving Actor Scheduler Threads

**What goes wrong:**

The HTTP client is extended to support connection keep-alive and streaming. A Mesh actor calls `Http.get_streaming(url, callback)`. Under the hood, `ureq` (already in `mesh-rt`) makes a blocking read call that waits for the server to send data. This blocking call runs on one of the M:N scheduler's OS worker threads. That thread is now blocked — it cannot resume other actors. If 8 actors simultaneously make streaming HTTP requests and the scheduler has 8 threads, all 8 threads block and the entire actor system deadlocks: no actor can make progress.

**Why it happens:**

The Mesh scheduler is designed for CPU-bound coroutines with cooperative preemption via reduction checks. Blocking I/O calls bypass the reduction-check yield mechanism entirely. `ureq` is explicitly a blocking I/O library (`ureq` README: "uses blocking I/O... requires an OS thread per concurrent request"). The WS reader thread bridge (v4.0 decision in PROJECT.md) already handled this for WebSockets by using a dedicated OS thread per connection that delivers messages via mailbox. The same architectural pattern must apply to streaming HTTP.

**How to avoid:**

For streaming HTTP reads, follow the WS reader thread pattern exactly:

1. Spawn a dedicated OS thread (not a Mesh actor) for the blocking `ureq` read loop.
2. The OS thread reads chunks from the response body and sends them to the actor's mailbox as messages.
3. The actor receives chunks via `receive` with a timeout, processing them cooperatively.
4. When the stream ends (EOF or error), the OS thread sends a sentinel message and exits.

This isolates the blocking I/O from the scheduler threads. The cost is one OS thread per active streaming request — acceptable for the use cases this serves (batch file downloads, long-running API streaming responses).

For connection keep-alive (non-streaming), the issue is less severe because `ureq` requests complete quickly. However, the connection pool state (the `Agent` struct) must be stored outside the GC heap to survive between requests without being collected. Use an opaque `u64` handle (same pattern as DB connection handles) to refer to a `Box<ureq::Agent>` stored in a global registry or per-actor context.

**Warning signs:**

Any benchmark showing request throughput drops to near-zero when actors make concurrent streaming requests. Timer-based tests flaking under load (actors cannot receive timer messages because scheduler threads are blocked).

**Phase to address:** HTTP client improvements phase — before implementing any streaming or keep-alive feature, the threading model must be decided and documented.

---

### Pitfall 6: Chunked Transfer Encoding Parser Missing Zero-Chunk Terminator and Extension Handling

**What goes wrong:**

The hand-rolled HTTP/1.1 parser in `mesh-rt/src/http/server.rs` correctly handles standard request bodies but does not handle chunked transfer encoding for client responses. When the developer adds chunked response reading to the HTTP client, the parser:

1. Reads the hex chunk size and data, but fails to handle the empty terminator chunk (`0\r\n\r\n`) — it either reads past the end of the stream or returns truncated data.
2. Does not skip chunk extensions (the `;name=value` part after the chunk size, specified in RFC 9112 §7.1.1). Real servers send chunk extensions. Encountering a `;` after the chunk size causes the hex parser to fail or produce an incorrect size value.
3. Does not handle trailers (headers after the final `0\r\n` chunk). Trailers are rare but not parsing them leaves junk bytes in the socket buffer, corrupting the next keep-alive request on the same connection.

**Why it happens:**

The happy path (server sends data chunks, no extensions, clean terminator) works in testing. Edge cases only appear against real-world servers. A CVE (2025-66373) was issued against Akamai's edge servers in 2025 for exactly this: "logic error when an edge server received a request whose chunked body was invalid — the edge did not always terminate or sanitize the request." Duplicate `Transfer-Encoding: chunked` headers (rejected by aiohttp in March 2025) are another real-world edge case.

**How to avoid:**

Follow RFC 9112 §7.1 strictly. The chunk-reading loop must:

```
1. Read chunk-size line: everything before optional ';' is hex size; skip any extensions after ';' up to CRLF
2. If chunk-size == 0: read and discard optional trailers until empty CRLF line; break
3. Read exactly chunk-size bytes as chunk-data
4. Read and discard trailing CRLF after chunk-data
5. Append chunk-data to body buffer; go to 1
```

Reject (return Err) on:
- Invalid hex in chunk size
- Duplicate `Transfer-Encoding: chunked` headers
- Chunk size exceeding a configurable limit (prevent memory exhaustion)
- Missing terminator chunk after N bytes (detect hung server)

Write unit tests for: zero-length chunk body, single chunk, multiple chunks, chunk extensions, trailer headers, oversized chunk size, and truncated stream.

**Warning signs:**

Response bodies that are randomly truncated by a few bytes. Keep-alive connections producing garbage on the second request. Tests against `httpbin.org` or `nghttp2.org/httpbin` passing but production servers occasionally returning corrupt data.

**Phase to address:** HTTP client improvements phase — chunk parsing correctness must be verified before keep-alive reuse, because a bad chunk read corrupts the connection state.

---

### Pitfall 7: Test Runner Sharing Actor Scheduler State Across Tests

**What goes wrong:**

The `meshc test` runner spawns a single Mesh process and runs all `*.test.mpl` tests sequentially in it. If test A spawns an actor that handles messages and does not shut it down cleanly, that actor is still running (and registered by name) when test B starts. Test B spawns what it thinks is a fresh actor with the same name, hits the `AlreadyRegistered` error, and the test fails with a confusing error unrelated to the actual assertion being tested. Alternatively, test A's leftover actor receives a message intended for test B's actor, producing a spurious assertion failure in test A several milliseconds after it "passed."

This is the Mesh-specific form of the general "shared state between tests" pitfall documented across Jest, ExUnit, and any other concurrent test framework. The actor registry is global mutable state; tests that register named actors without deregistering them are not isolated.

**Why it happens:**

Mesh actors are designed to be long-lived. Test authors write actors for their test setup and forget that the process registry persists for the lifetime of the runtime. There is no automatic cleanup between tests because the runtime has no concept of "test boundaries."

**How to avoid:**

The test runner must enforce actor isolation per test. Two approaches — choose one:

**Option A (recommended for v14.0 simplicity):** Each test function runs as a separate root actor, spawned fresh with a clean mailbox. Actor names registered during the test are automatically deregistered when the test actor exits (reuse the existing link/exit-signal infrastructure). The scheduler runs all test actors and collects their results via a dedicated result-channel.

**Option B:** Each test function runs in the same process but the test framework tracks all actors spawned during a test (via a thread-local spawn hook) and force-kills them after the test completes, deregistering names.

Option A is cleaner and reuses existing crash-isolation infrastructure (`catch_unwind` per actor already works). Option B requires hooking the spawn path, which is more invasive.

**Warning signs:**

Test suite passes locally when run in isolation but fails intermittently when all tests run together. Test failures that mention "AlreadyRegistered" or "process not found" when no registration errors should exist.

**Phase to address:** Test framework phase — this must be the first design decision, before implementing any assertion helpers or test discovery.

---

### Pitfall 8: Mock Actor Cleanup Leaving Orphan Processes After Test Failure

**What goes wrong:**

The developer creates mock actors for tests: `Mock.spawn_echo_actor()` creates an actor that records received messages. The test calls `Mock.assert_received(pid, expected_msg)` at the end. If the assertion fails (throwing a test failure), the mock actor is never shut down because the cleanup code is after the failing assertion. The mock actor runs indefinitely, consuming a slot in the process table. Over a large test suite with many failures, the leaked mock actors accumulate, eventually exhausting process IDs or memory.

This is the Mesh-specific form of the "neglecting cleanup" pitfall from Jest and other frameworks.

**Why it happens:**

Imperative test cleanup (calling `Process.exit(mock_pid)` at the end of the test) is skipped when an assertion panics or returns early. There is no equivalent of Go's `defer` or Python's `with` statement in Mesh to guarantee cleanup.

**How to avoid:**

Design the mock API so cleanup is automatic, not manual:

1. Mock actors are always linked to the test actor (via `Process.link`). When the test actor exits (whether passing or failing via `catch_unwind`), all linked mock actors receive the exit signal and terminate automatically.
2. Provide a `Mock.with_echo_actor(fn(pid) do ... end)` API where the mock's lifetime is scoped to the closure. The mock is spawned, the closure executes (possibly failing), and the mock is killed when the closure returns — whether normally or via an error.

The supervisor infrastructure already handles this: if a test actor crashes, its linked children (mock actors) also crash. The test runner catches the test actor's exit and records the failure.

**Warning signs:**

Test suite memory consumption grows linearly with the number of test failures. `meshc test` hangs after a failing test because a mock actor is still blocking on `receive`.

**Phase to address:** Test framework phase — design the mock lifecycle to be crash-safe before implementing any mock functionality.

---

### Pitfall 9: LLVM Coverage Instrumentation Incompatible with Mesh's Custom Codegen

**What goes wrong:**

The developer attempts to add coverage reporting to `meshc test` using LLVM's source-based coverage instrumentation (`-fprofile-instr-generate -fcoverage-mapping` in Clang, or `instrument-coverage` in Rust). The coverage data is intended to map back to `.mpl` source files. But Mesh's codegen emits LLVM IR directly (via Inkwell) with no connection to original source positions — there are no `DILocation` debug info metadata nodes attached to most instructions. The coverage tool produces either empty reports or maps coverage to incorrect line numbers in the Rust compiler source, not the `.mpl` user code.

A secondary failure: coverage instrumentation adds counters to every basic block. Mesh's GC uses conservative stack scanning. The counter variables on the stack look like valid pointers and may prevent GC collection of objects whose addresses happen to match counter values (false live roots). This is the same hazard as the "conservative stack scanning may retain some garbage" limitation documented in PROJECT.md, but amplified.

**Why it happens:**

LLVM coverage uses the binary profiling format (`default.profraw`) which requires: (1) instrumented binary run, (2) `llvm-profdata merge`, (3) `llvm-cov report`. This pipeline assumes Clang-compiled code with debug info. Mesh compiles via Inkwell without emitting DWARF debug info or source location metadata by default.

**How to avoid:**

For v14.0, implement coverage at the Mesh source level rather than LLVM IR level:

1. Instrument coverage in the MIR lowering pass: before each statement, emit a call to a coverage counter increment function: `mesh_coverage_record(file_id, line_no, counter_id)`.
2. The coverage counters are stored in a global array (not on the stack, avoiding the conservative GC issue).
3. At test exit, dump the counter array to a JSON file: `coverage.json` with `{file: line: count:}` entries.
4. A post-processing script (or `meshc coverage` command) reads the JSON and generates an HTML report showing which lines were executed.

This approach is simpler than LLVM source-based coverage, works with Mesh's existing codegen, and avoids version mismatch issues (LLVM coverage format is not forwards-compatible between versions — the official docs warn: "newer binaries cannot always be analyzed by older tools").

The LLVM profiling approach can be revisited in a future milestone when Mesh's codegen emits proper DWARF debug info.

**Warning signs:**

Empty coverage reports with `0 functions covered`. `llvm-profdata merge` failing with "Unsupported instrumentation profile format version." Coverage line numbers pointing to `lower.rs` in the Mesh compiler source.

**Phase to address:** Test framework phase — coverage should be the last sub-feature, after the test runner and assertions are working. Start with source-level MIR instrumentation, not LLVM IR instrumentation.

---

### Pitfall 10: Package Registry Allowing Version Overwrites

**What goes wrong:**

The `meshpkg publish` command allows a package author to publish `mylib 1.0.0`, then immediately re-publish `mylib 1.0.0` with different content (a "hotfix" or a "mistake correction"). Any project that previously installed `mylib 1.0.0` now gets different code the next time it runs `meshpkg install` — even though the version number is the same. Builds stop being reproducible. This is the npm "left-pad" failure mode: a maintainer can alter or remove a version that other packages depend on.

**Why it happens:**

The simplest registry API allows PUT/overwrite. It requires deliberate design effort to make publish immutable. New registry implementors often add overwrite as a convenience for "fixing mistakes" without understanding the reproducibility implications.

**How to avoid:**

Make publish-once immutable from day one — this is crates.io's explicit design philosophy: "one of the major goals of crates.io is to act as a permanent archive of crates that does not change over time." The mechanisms:

1. Content-address each version: store packages as `{name}/{version}/{sha256-of-tarball}.tar.gz`. Reject uploads where the SHA-256 differs from a previously stored version.
2. Yank mechanism (not delete): `meshpkg yank mylib 1.0.0` marks the version as "do not use for new installs" but existing lock files can still resolve it. The package content is never deleted.
3. No delete endpoint in the registry API. If a package contains a security vulnerability, yank it and publish `1.0.1`.
4. The `mesh.toml` lock file records exact SHA-256 digests of resolved packages. Install checks the digest against the registry. A tampered registry cannot serve different content to a project with a valid lock file.

**Warning signs:**

A registry API design that has a `PUT /packages/{name}/{version}` endpoint (update semantics). Any "admin override" path that allows content replacement without version bump.

**Phase to address:** Package registry phase — immutability must be in the initial API design document, not retrofitted after the registry is deployed with mutable semantics.

---

## Moderate Pitfalls

---

### Pitfall 11: UUID v4 Using Non-CSPRNG Randomness

**What goes wrong:**

UUID v4 requires 122 bits of cryptographically secure randomness. If the developer generates it using `rand::thread_rng()` without checking that the underlying PRNG is seeded from a secure source, or (worse) uses `rand::rngs::SmallRng` for "performance," the generated UUIDs are predictable. An attacker who can observe a few UUIDs can reconstruct the PRNG state and predict future UUIDs — enabling ID enumeration, SSRF via predictable resource IDs, or session token forgery.

**Why it happens:**

The `rand` crate (already in `mesh-rt`) has multiple RNG backends. `rand::random::<u128>()` uses `ThreadRng` which IS cryptographically secure. But `rand::rngs::SmallRng` is explicitly documented as "not for security." The performance difference is negligible (a few nanoseconds), but developers sometimes reach for the "fast" option without reading the security implications.

**How to avoid:**

Use `ring::rand::SystemRandom` (already in `mesh-rt`) to generate the 16 random bytes for UUID v4. `ring::rand::SecureRandom::fill` uses the OS CSPRNG (`/dev/urandom` on Linux, `BCryptGenRandom` on Windows). Apply UUID v4 bit-masking per RFC 4122 §4.4 to the result. This is the approach already used in the distributed node clustering code for ephemeral key generation.

Document in the stdlib: "UUIDs generated by `Crypto.uuid_v4()` are cryptographically random and suitable for use as unique identifiers in security-sensitive contexts."

**Warning signs:**

Any UUID implementation that uses `rand::rngs::SmallRng` or any non-OS-seeded PRNG. Any implementation that seeds from `SystemTime` instead of OS randomness.

**Phase to address:** Crypto stdlib phase — UUID is one of the simpler functions but must use the correct PRNG.

---

### Pitfall 12: HTTP Keep-Alive Pool Stored on GC Heap

**What goes wrong:**

The developer stores the `ureq::Agent` (which manages the keep-alive connection pool) as an opaque value in the Mesh runtime. If it is allocated on the GC heap with `mesh_gc_alloc_actor`, the GC's conservative stack scanner may decide the Agent is unreachable during a GC cycle and free it mid-use. The next request using the freed Agent causes a use-after-free, typically presenting as a SIGSEGV or a corrupt HTTP response.

**Why it happens:**

The existing pattern for opaque handles (DB connections, pool handles, regex handles, WebSocket rooms) uses `Box::into_raw` and stores the resulting raw pointer as a `u64` in a global registry or returns it directly as a Mesh `Int`. The GC cannot collect objects referenced only by a `u64` because it does not know the value is a pointer. This is the documented pattern ("Opaque u64 handles are GC-safe" in PROJECT.md decisions), but a developer unfamiliar with this pattern may try to allocate the Agent struct on the GC heap directly, which breaks the contract.

**How to avoid:**

Follow the exact pattern established for DB connections (v2.0) and regex handles (v12.0):

```rust
// Correct: Box the Agent, leak it, return raw pointer as u64
let agent = ureq::AgentBuilder::new().build();
let ptr = Box::into_raw(Box::new(agent)) as u64;
// Return ptr as a Mesh Int (opaque handle)

// Wrong: allocate on GC heap
let ptr = mesh_gc_alloc_actor(...) as *mut ureq::Agent; // GC can collect this
```

The `u64` handle is passed back to Mesh code and stored in a `let` binding or struct field as `Int`. The GC sees an integer, not a pointer, and does not attempt to collect it. Cleanup requires an explicit `Http.close_client(handle)` call that runs `Box::from_raw` and drops the Agent.

**Warning signs:**

Occasional SIGSEGV on keep-alive requests. Requests that succeed on first call but fail randomly on subsequent calls (GC ran between calls and freed the Agent).

**Phase to address:** HTTP client improvements phase — establish the handle pattern first, before any keep-alive implementation.

---

### Pitfall 13: Date/Time Arithmetic Overflowing Integer Range

**What goes wrong:**

The date/time stdlib uses `Int` (i64 in Mesh's LLVM representation) for Unix timestamps in milliseconds. `Date.add_seconds(ts_ms, seconds)` computes `ts_ms + seconds * 1000`. If `seconds` is user-supplied and large (e.g., a typo: `Date.add_seconds(now, years_to_seconds(10000))`), the multiplication overflows `i64`. In debug builds Rust detects integer overflow, but in release builds (how Mesh compiles) the overflow wraps silently, producing a timestamp in 1970 or far future.

**Why it happens:**

Unchecked integer arithmetic is the default in Rust release builds. LLVM optimizes away overflow checks when compiling without `-C overflow-checks=on`.

**How to avoid:**

Use checked arithmetic for all date/time operations. The extern C function for `Date.add_seconds` should validate inputs before computing:

```rust
pub extern "C" fn mesh_date_add_ms(ts_ms: i64, delta_ms: i64) -> *mut u8 {
    match ts_ms.checked_add(delta_ms) {
        Some(result) => alloc_ok_int(result),
        None => alloc_err_string("timestamp arithmetic overflow"),
    }
}
```

Return `Result<Int, String>` from all arithmetic functions. This forces the Mesh caller to handle the overflow case via `?` operator, making the error visible.

Validate that all returned timestamps are in a reasonable range (e.g., year 1970 to year 2262 for ms timestamps, which fit comfortably in i64).

**Warning signs:**

Date arithmetic that returns the year 1970, or dates in the distant future (year 30000+). Any date/time function that returns a raw `Int` rather than `Result<Int, String>` for operations that can overflow.

**Phase to address:** Date/time stdlib phase — arithmetic overflow checks should be the default, not an afterthought.

---

### Pitfall 14: Test Assertions Using Variable-Time String Comparison for Crypto Output

**What goes wrong:**

The test framework includes `assert_eq(a, b)` which calls `snow_string_eq` (variable-time string comparison) on its arguments. A test for the HMAC module writes `assert_eq(Crypto.hmac_sha256(key, msg), expected_mac)`. This works correctly for testing — the assertion passes or fails — but it also means the test itself leaks timing information about the HMAC output. This is a minor issue in a test suite but a major issue if `assert_eq` is ever used in production code to compare tokens.

More immediately: the test framework's `assert_eq` will be used as the example pattern in documentation. If developers see `assert_eq(computed_mac, expected_mac)` in test code, they will replicate it in production code, creating a timing vulnerability.

**Why it happens:**

General-purpose equality assertions cannot be constant-time — they are for testing, not production auth. The problem is that the API surface is the same (`==` in production vs `assert_eq` in tests), so developers do not see a clear distinction between "comparison for testing" and "comparison for security."

**How to avoid:**

Add a note in the stdlib documentation for every crypto output function: "Do not compare outputs using `==` or `assert_eq` in production code. Use `Crypto.hmac_verify` or `Crypto.secure_compare`." In test code, `assert_eq` is fine because correctness checking is the only goal.

In the test framework internals, assert functions should NOT be used for constant-time comparisons — they should explicitly use value equality. The distinction must be documented, not enforced at the API level (since constant-time assertions would be slower than necessary and confusing).

**Warning signs:**

Documentation examples that show `assert_eq(Crypto.hmac_sha256(...), ...)` without a note that this is test-only.

**Phase to address:** Crypto stdlib phase (documentation) and test framework phase (documentation).

---

### Pitfall 15: Package Registry Search Unavailable Before Content Exists

**What goes wrong:**

The developer builds the full package registry — publish, install, search API, hosted website — before any real packages exist. The search feature returns empty results for all queries. The "browse packages" page shows nothing. The hosted site looks like a ghost town. When the internal team tries to demo it or write documentation, there is nothing to show. Momentum dies.

**Why it happens:**

The registry is built in "correct order" (infrastructure before content), but the usability dependency is inverted: the registry only feels useful when packages exist, and packages only get published when there is a registry to publish to.

**How to avoid:**

Publish Mesh's own standard library modules as packages on the registry immediately after the registry is functional:

- `mesh/crypto` (the new v14.0 crypto stdlib)
- `mesh/datetime` (the new date/time module)
- `mesh/testing` (the test framework helpers)
- `mesh/http-client` (the improved HTTP client)

These are real packages with real code, maintained by the Mesh team, that immediately demonstrate the registry working end-to-end. When users visit the packages site, they see known-good packages with actual documentation.

This mirrors crates.io's launch: the Rust standard library's component crates (`serde`, `tokio`) were available from early on, demonstrating the registry's value immediately.

**Warning signs:**

Registry launch date is set before any packages are planned for initial publication. The hosted site's "Browse Packages" page is designed before at least 4-5 packages are ready to appear there.

**Phase to address:** Package registry phase — include "publish stdlib packages" as an explicit deliverable in the same phase as the registry launch.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Variable-time comparison for secrets | Simpler implementation | Timing attack vulnerability | Never for production auth code |
| String-based timestamp representation | Easy to debug, PostgreSQL-compatible | Slow arithmetic, silent timezone loss | Only for display/serialization layer |
| Skipping chunked trailer parsing | Simpler parser | Keep-alive connection corruption on real servers | Never — trailers are in RFC 9112 |
| Global ureq::Agent (not per-actor) | One connection pool, simpler bookkeeping | All actors share pool limits; one slow actor can block others | Acceptable for v14.0 as a starting point |
| Test runner in same process as tested code | No IPC overhead | Actor registry leaks between tests, no true isolation | Only if tests explicitly clean up named actors |
| Allow publish overwrite in registry v1 | Simpler implementation | Breaks reproducibility, cannot be taken back without disruption | Never — immutability must be designed in from the start |

---

## Integration Gotchas

Common mistakes when connecting to external services or internal subsystems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `sha2` crate for Mesh SHA-256 | Adding a new `sha2` dep when one already exists in Cargo.toml | Audit `mesh-rt/Cargo.toml` before adding crypto deps; reuse existing |
| `ring::rand` for UUID | Using `rand::rngs::SmallRng` for speed | Always use `ring::rand::SystemRandom` for security-sensitive randomness |
| `ureq::Agent` keep-alive pool | Storing Agent in GC heap via `mesh_gc_alloc_actor` | Use `Box::into_raw` opaque u64 handle pattern (same as DB connections) |
| Actor scheduler + blocking ureq reads | Calling blocking read inside coroutine | Spawn dedicated OS thread for blocking I/O (WS reader pattern from v4.0) |
| Chunked response bodies | Stopping at last data chunk | Always consume the zero-length terminator chunk (`0\r\n\r\n`) |
| Test actor registry | Registering named actors without cleanup | Link mock actors to test actor so they die when test exits |
| Registry publish | No content-addressing | SHA-256 hash every tarball; reject re-upload of same version with different content |
| Date parsing | Accepting timezone-free strings silently | Return `Err` for any input without explicit `Z` or `+HH:MM` offset |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One OS thread per streaming HTTP request | 100% CPU on 8-core machine with 8 streams | Use async-friendly HTTP client (reqwest) for high-concurrency streaming in future | At ~8-16 concurrent streaming requests |
| No connection keep-alive for HTTP client | Each request pays TCP + TLS handshake overhead | Implement ureq::Agent-based connection pooling with opaque u64 handle | At ~50 req/s to the same host |
| All test files compiled into one binary | `meshc test` build time grows linearly with test count | Parallel compilation per file; cache unchanged test artifacts | At ~200 test files |
| Registry full-text search via SQL LIKE | `SELECT * FROM packages WHERE name LIKE '%query%'` is a full table scan | Add `tsvector` index for description, use PostgreSQL FTS from the start | At ~1,000 packages |
| Test runner starts fresh runtime per test file | `meshc test` takes 10 seconds for 50 test files due to 50 runtime initializations | Run all tests in a single runtime, isolating via actor-per-test | At ~50 test files |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Variable-time HMAC comparison in `Crypto.hmac_verify` | Timing attack allows secret recovery | Use `hmac::Mac::verify_slice` from existing dep (constant-time via `subtle`) |
| UUID v4 from `SmallRng` or seeded PRNG | Predictable IDs enable enumeration/forgery | Use `ring::rand::SystemRandom` (OS CSPRNG) |
| Package registry publish without authentication | Anyone can publish to any namespace | Require API token; associate tokens with package namespace ownership at creation time |
| Registry tarball served without integrity check | Man-in-the-middle can substitute malicious package | SHA-256 content-address storage; `mesh.toml` lock file records digests |
| Date/time silent UTC assumption | Business logic bugs from timezone confusion | Reject timezone-free timestamp strings in `Date.parse` |
| Base64 decoding without padding validation | Malformed input causes panic in some decoders | Use `base64::engine::general_purpose::STANDARD.decode` with explicit error handling |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Crypto.sha256:** Appears done — but verify that the output is hex-encoded consistently (lowercase hex, no `0x` prefix, exactly 64 characters). The underlying `sha2` crate returns bytes; encoding to hex string is a separate step that must be tested.
- [ ] **Crypto.hmac_sha256:** Appears done — but verify that the `hmac_verify` companion function uses constant-time comparison, not `==` on the String output.
- [ ] **Date.parse:** Appears done — but verify that strings without timezone offset return `Err`, not a silently-wrong UTC value.
- [ ] **Date.format:** Appears done — but verify that millisecond timestamps are serialized in ISO 8601 with `Z` suffix, not as bare Unix numbers.
- [ ] **HTTP chunked reading:** Appears done — but verify with a real chunked response that includes chunk extensions (`;name=value` after the size) and trailers. Happy-path tests with clean chunks will pass even with a broken parser.
- [ ] **HTTP keep-alive:** Appears done — but verify that the `ureq::Agent` survives a GC cycle between requests (store as opaque u64, never on GC heap).
- [ ] **Test runner isolation:** Appears done — but run two tests that both register the same actor name and verify the second test doesn't fail with "AlreadyRegistered."
- [ ] **Mock cleanup:** Appears done — but write a test that fails mid-execution and verify no orphan actors remain after the suite completes.
- [ ] **Coverage reporting:** Appears done — but verify that coverage line numbers map to `.mpl` source files, not to Rust compiler source.
- [ ] **Package publish once:** Appears done — but attempt to publish the same `name@version` twice with different content and verify the second publish is rejected with an error, not silently accepted or silently ignored.
- [ ] **Package install with lock file:** Appears done — but verify that `meshpkg install` with an existing lock file uses pinned versions (does not upgrade), and that the installed content matches the recorded SHA-256 digest.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate crypto deps | LOW | Remove new dep, rewire calls to existing dep; no API change if the extern C signatures are compatible |
| Variable-time comparison already shipped | MEDIUM | Add `Crypto.secure_compare` function; deprecate usage of `==` on crypto output; publish security advisory |
| Timestamp as String already in use | HIGH | Add conversion functions `Date.from_string_to_ms` and `Date.from_ms_to_string`; deprecate old String-based functions; cannot change existing data without migration |
| Test registry leaks causing flaky tests | MEDIUM | Add `after_each` cleanup hook to deregister known actor names; or switch to actor-per-test isolation model |
| Package registry allows overwrites | HIGH | Cannot take back: once a version is overwritten, trust is broken. Must announce "registry reset" with v2.0 API, explain why immutability matters, re-publish all packages. |
| Chunked parser corruption of keep-alive socket | MEDIUM | Disable keep-alive for affected endpoints as workaround; fix parser per RFC 9112; add regression test for each edge case |
| LLVM coverage version mismatch | LOW | Fall back to source-level MIR instrumentation (the recommended approach); LLVM-based coverage can be added later when debug info is complete |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Duplicate crypto deps | Crypto stdlib (first task: `Cargo.toml` audit) | `cargo tree | grep sha2` shows one version |
| Non-constant-time HMAC comparison | Crypto stdlib (API design) | Security review of `hmac_verify` implementation |
| Timestamp as String | Date/time stdlib (representation decision) | `Date.now()` returns `Int`, not `String` |
| Silent UTC assumption | Date/time stdlib (parser) | `Date.parse("2026-02-28 12:00:00")` returns `Err` |
| Integer overflow in date arithmetic | Date/time stdlib (arithmetic functions) | `Date.add_seconds(max_i64, 1)` returns `Err` |
| Blocking I/O starvation | HTTP client improvements (threading design) | 16 concurrent streaming actors do not deadlock 8-thread scheduler |
| Chunked parser edge cases | HTTP client improvements (chunk parser) | Unit tests for: extensions, trailers, zero-length body, oversized chunk |
| Keep-alive pool on GC heap | HTTP client improvements (handle design) | Agent survives GC cycle; no use-after-free under load |
| Test actor registry leaks | Test framework (isolation design, first task) | Two tests with same actor name both pass when run sequentially |
| Mock actor orphans | Test framework (mock API design) | Suite with 10 failing tests leaves 0 orphan actors |
| LLVM coverage mismatch | Test framework (coverage design) | Coverage report shows `.mpl` line numbers, not Rust line numbers |
| Registry version overwrite | Package registry (API design) | Second publish of same version returns HTTP 409 Conflict |
| Empty registry at launch | Package registry (content plan) | Registry launches with at least 4 stdlib packages already published |
| UUID from weak PRNG | Crypto stdlib (UUID implementation) | UUIDs generated using `ring::rand::SystemRandom` |

---

## Sources

- `/Users/sn0w/Documents/dev/mesh/compiler/mesh-rt/Cargo.toml` — existing crypto deps (sha2, hmac, ring, base64, rand) — HIGH confidence, direct source
- `/Users/sn0w/Documents/dev/mesh/compiler/mesh-rt/src/http/client.rs` — current ureq 2.x blocking I/O pattern — HIGH confidence, direct source
- `/Users/sn0w/Documents/dev/mesh/compiler/mesh-rt/src/actor/scheduler.rs` — M:N scheduler design, coroutines `!Send`, thread-pinned — HIGH confidence, direct source
- `/Users/sn0w/Documents/dev/mesh/.planning/PROJECT.md` — v4.0 WS reader thread decision, opaque u64 handle pattern, conservative GC scanning — HIGH confidence, direct source
- [dalek-cryptography/subtle — constant-time Rust utilities](https://github.com/dalek-cryptography/subtle) — LLVM branch re-introduction risk, best-effort constant-time — MEDIUM confidence
- [ureq blocking I/O model](https://docs.rs/ureq) — "blocking I/O... one OS thread per concurrent request" — HIGH confidence, official docs
- [ureq connection pool issue: chunked + compressed response inhibits reuse](https://github.com/algesten/ureq/issues/549) — known keep-alive edge case — MEDIUM confidence
- [CVE-2025-66373 Akamai chunked body size](https://www.akamai.com/blog/security/cve-2025-66373-http-request-smuggling-chunked-body-size) — real-world chunked parser failure, 2025 — HIGH confidence
- [aiohttp duplicate Transfer-Encoding bug 2025](https://github.com/aio-libs/aiohttp/issues/10611) — duplicate chunked header edge case — MEDIUM confidence
- [RFC 9112 §7.1 chunked transfer coding](https://www.rfc-editor.org/rfc/rfc9112#section-7.1) — authoritative spec for chunk extensions and trailers — HIGH confidence
- [Falsehoods programmers believe about time](https://gist.github.com/timvisee/fcda9bbdff88d45cc9061606b4b923ca) — timezone and timestamp pitfall catalog — MEDIUM confidence
- [crates.io publishing semantics](https://doc.rust-lang.org/cargo/reference/publishing.html) — immutability and yank design rationale — HIGH confidence
- [LLVM source-based code coverage](https://clang.llvm.org/docs/SourceBasedCodeCoverage.html) — format version incompatibility, profdata merge requirement — HIGH confidence
- [Jest mock cleanup pitfalls 2025](https://www.mindfulchase.com/explore/troubleshooting-tips/testing-frameworks/advanced-troubleshooting-in-jest-flaky-tests,-mocks,-and-performance-at-scale.html) — stale mock state, shared global objects — MEDIUM confidence
- [Dependency hell and SemVer limitations 2025](https://prahladyeri.github.io/blog/2024/11/dependency-hell-revisited.html) — transitive dep drift, publish semantics — MEDIUM confidence

---

*Pitfalls research for: Mesh v14.0 Ecosystem & Standard Library*
*Researched: 2026-02-28*
