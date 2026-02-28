# Feature Research

**Domain:** Programming language ecosystem expansion (stdlib crypto/datetime/encoding + HTTP client + testing + package registry)
**Researched:** 2026-02-28
**Confidence:** HIGH

---

## Context: Mesh v14.0 Feature Scope

This research covers six feature areas being added in v14.0. Each section maps
"expected behavior" from comparable ecosystems to concrete decisions for Mesh.

**Key existing-dep fact:** `sha2 = "0.10"`, `hmac = "0.12"`, `base64 = "0.22"`,
`rand = "0.9"`, `ureq = "2"` are already present in `compiler/mesh-rt/Cargo.toml`.
Crypto and encoding work is primarily Rust `extern "C"` wrapper code + Mesh-side
API design, not new dependency acquisition. DateTime is the one area requiring a
new dep (`chrono = "0.4"`).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `Crypto.sha256(s)` -> hex String | Standard primitive in every lang stdlib; required for HMAC verification, content addressing | LOW | `sha2` crate already in mesh-rt; need `extern "C"` wrapper + Mesh stdlib binding |
| `Crypto.sha512(s)` -> hex String | Stronger variant; some APIs require it | LOW | Same crate, different digest size |
| `Crypto.hmac_sha256(key, msg)` -> hex String | API webhook verification, JWT signing, distributed node auth (already used internally) | LOW | `hmac` crate already in mesh-rt; expose as user-callable stdlib |
| `Crypto.hmac_sha512(key, msg)` -> hex String | Stronger HMAC variant | LOW | Same pattern as hmac_sha256 |
| `Crypto.secure_compare(a, b)` -> Bool | Timing-safe string comparison; prevents timing attacks on API tokens | LOW | Use `hmac` crate's `verify_slice` which is constant-time; critical for security correctness |
| `Crypto.uuid4()` -> String | Row IDs, idempotency keys, session tokens; Mesher already uses UUIDs via PG's `gen_random_uuid()` | LOW | `rand` crate already present; format 128-bit random as canonical UUID string |
| `Base64.encode(s)` -> String | API tokens, file uploads, binary data in JSON payloads | LOW | `base64` crate already present; standard alphabet |
| `Base64.decode(s)` -> Result<String, String> | Decode JWT headers, HTTP Basic auth, binary blobs | LOW | Returns Result because input may be malformed |
| `Base64.encode_url(s)` -> String | JWT tokens require URL-safe alphabet; common in web APIs | LOW | URL-safe alphabet replaces `+` with `-` and `/` with `_` |
| `Base64.decode_url(s)` -> Result<String, String> | Parse JWT tokens | LOW | URL-safe decode |
| `Hex.encode(s)` -> String | Display hash digests, binary data inspection | LOW | Thin wrapper; lowercase hex string of bytes |
| `Hex.decode(s)` -> Result<String, String> | Parse hex-encoded keys, digests from external sources | LOW | Validates hex character set |
| `DateTime.utc_now()` -> DateTime | Current timestamp for created_at, updated_at fields; every web application needs this | MEDIUM | New `chrono = "0.4"` dep; DateTime is an opaque GC-heap handle (same pattern as Regex) |
| `DateTime.from_iso8601(s)` -> Result<DateTime, String> | Parse timestamps from JSON API bodies, database strings | MEDIUM | Parses RFC 3339 / ISO 8601 extended format |
| `DateTime.to_iso8601(dt)` -> String | Serialize timestamps to JSON responses | MEDIUM | Produces `"2024-01-15T14:30:00Z"` format |
| `DateTime.from_unix(Int)` -> DateTime | Convert stored Unix timestamps (database integer columns) to DateTime | LOW | Wrap chrono's `from_timestamp` |
| `DateTime.to_unix(dt)` -> Int | Store DateTime as integer in database | LOW | Wrap chrono's `timestamp()` |
| `DateTime.add(dt, Int, unit)` -> DateTime | Compute expiry times, scheduling offsets, TTL calculations | MEDIUM | Units: `:second`, `:minute`, `:hour`, `:day` (avoid month/year — calendar complexity) |
| `DateTime.diff(dt1, dt2, unit)` -> Int | Compute age, elapsed time, rate limiting windows | MEDIUM | Signed difference; dt1 - dt2 |
| `DateTime.before?(dt1, dt2)` / `DateTime.after?` -> Bool | Expiry checks, sorting | LOW | Boolean comparisons; complements `compare` |
| `Http.build(:get/:post/:put/:delete, url)` -> Request | Fluent builder entry point; current `Http.get(url)` / `Http.post(url, body)` are not composable | MEDIUM | Returns a Request value (opaque handle); pipe-compatible |
| `Http.header(req, k, v)` -> Request | Set custom headers (Authorization, Content-Type, etc.) | LOW | Chainable; returns modified Request |
| `Http.body(req, s)` -> Request | Set request body for POST/PUT | LOW | Chainable |
| `Http.timeout(req, ms)` -> Request | Per-request timeout control | LOW | Chainable; maps to ureq timeout |
| `Http.send(req)` -> Result<Response, String> | Execute the built request | MEDIUM | Response struct: `{ status :: Int, body :: String, headers :: Map<String, String> }` |
| `meshc test` runner with `*.test.mpl` discovery | Tests must run via compiler CLI; no external test runner dependency | MEDIUM | New subcommand; discovers test files recursively, compiles + runs each, aggregates results |
| `assert expr` | Fundamental test assertion; halts test with useful message on failure | LOW | ExUnit-style; show expression source, value at failure |
| `assert_eq a, b` | Equality assertion with diff output | LOW | Show expected vs actual |
| `assert_ne a, b` | Inequality assertion | LOW | Inversion of assert_eq |
| `assert_raises fn` | Verify that a function panics or propagates an error | LOW | Catch panic from test function |
| Test pass/fail output with file + line info | Failure messages must be actionable | MEDIUM | Show `test_file.mpl:42: assertion failed` |
| `mesh.toml` manifest format | Declare package metadata and dependencies | MEDIUM | `mesh-pkg` crate already exists; extend with standard fields |
| `meshpkg publish` | Upload package to hosted registry | HIGH | Requires auth token, tarball creation, registry HTTP API |
| `meshpkg install <name>` | Fetch and install a package | HIGH | Download tarball from registry, extract to project deps directory |
| `meshpkg search <query>` | Find packages by name/keyword | MEDIUM | Query registry search endpoint, display results |
| Registry hosted site: browse + search | Public discoverability; without this the registry is unusable | HIGH | List packages by popularity/recency, full-text search |
| Registry per-package page | Rendered README, version history, install command | HIGH | hex.pm / crates.io standard: README in Markdown, all published versions listed |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| HTTP streaming via callback | Process large responses (AI streaming, file downloads) without buffering entire body in memory | MEDIUM | `Http.stream(req, fn chunk -> ... end)`; each chunk delivered to callback; actor-compatible |
| HTTP client handle (keep-alive reuse) | Avoid per-request TCP+TLS handshake; significant latency improvement for high-frequency API calls | MEDIUM | `Http.client()` -> Client handle; `Http.send_with(client, req)` reuses connections; ureq 2.x has built-in pooling |
| `describe "..." do ... end` grouping | Organizes large test files by feature; ExUnit and RSpec both have this; improves failure output | LOW | Syntactic grouping only; no new test semantics required |
| Actor mock via `Test.mock_actor` | In actor model languages, mocking actors (not just functions) is the core concurrency testing need | HIGH | Spawn an actor with a custom message handler; return its PID for use in tests; `Test.mock_actor(fn msg -> ... end)` |
| `setup do ... end` / `teardown` blocks | Per-test setup/cleanup without manual repetition | LOW | ExUnit `setup` pattern; run before each test in a describe block |
| `assert_receive pattern, timeout` | Test actor message delivery; critical for verifying actor behavior | MEDIUM | Check the test actor's mailbox for a pattern within timeout ms; key for actor model testing |
| Test module parallelism (`meshc test --jobs N`) | Faster test suite execution on multi-core; run N test files concurrently | MEDIUM | Fork N compiler processes; aggregate results; tests within a file remain sequential |
| Package `mesh.lock` lockfile | Reproducible builds; same dependency versions across environments | MEDIUM | Generated automatically by `meshpkg install`; committed to source control |
| `meshpkg outdated` | List packages with newer versions available | LOW | Query registry API, compare against mesh.lock versions |
| Package categories (validated list) | Structured discoverability; search by category like crates.io | LOW | Registry defines valid category slugs; max 5 per package |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Timezone-aware datetime (full tz database) | "Complete" datetime support | IANA tz database is 50+ KB and requires updates; DST ambiguity makes month/year arithmetic lossy; bloats CLI tools | Ship UTC + Unix timestamps. Defer timezone-aware operations to an optional future `DateTime.Tz` module with explicit opt-in |
| `Crypto.md5()` / `Crypto.sha1()` | Familiar from legacy codebases | MD5 and SHA-1 are cryptographically broken; stdlib inclusion normalizes insecure use; causes false sense of security | Explicitly absent from stdlib. Developers who need MD5 for non-security checksums can note this is intentional. Document why in stdlib docs |
| Async/Future-based HTTP streaming | "Modern" async API patterns | Mesh explicitly rejects colored functions (async/await); introducing Future types contradicts the actor model philosophy | Callback-based streaming within an actor; `Http.stream` delivers chunks synchronously to a callback; the actor is the unit of concurrency |
| Test mocking via global function replacement | "Easy" mocking without dependency injection | Global mutation breaks test isolation; parallel test modules would interfere with each other | Behavior-based mocking: define a trait, pass mock implementation as parameter. "Mocks as noun" pattern (Elixir Mox philosophy) |
| Test parallelism at the individual test level | "Maximum speed" | Tests within a Mesh actor context share the scheduler; parallel tests touching shared state cause flaky failures | Parallelize at module level (`meshc test --jobs N`); tests within a file run sequentially and reliably |
| Mutable published package versions | "Hotfix a bad release without bumping version" | Breaks reproducible builds; users with lockfiles get different code silently | Use `meshpkg yank <name>@<version>` to mark a version as deprecated (still downloadable for existing lockfiles, blocked for new installs) |
| Automatic dependency updates | "Stay current automatically" | Pulls in breaking changes without review; security theater without audit | Provide `meshpkg outdated` to surface available updates; updates are always manual and intentional |
| strftime format strings for DateTime | "Flexible" custom date formatting | strftime format strings are notoriously cryptic (`%Y-%m-%dT%H:%M:%SZ`); hard to read and write; ISO 8601 covers 95% of use cases | Ship `to_iso8601` for standard format. Add `DateTime.format(dt, pattern)` as a v1.x feature once demand is established |
| SHA-256 of raw bytes input | "Binary hashing" | Mesh has no binary/bytes type; accepting raw bytes would require a new type or unsafe FFI casting | Accept String input; treat as UTF-8 bytes internally; callers who need binary hashing work with hex-encoded strings |

---

## Feature Dependencies

```
[Crypto.sha256 / sha512]
    depends on: sha2 crate (already in mesh-rt/Cargo.toml) — no new deps
    no Mesh feature dependencies

[Crypto.hmac_sha256 / hmac_sha512]
    depends on: hmac crate (already present)
    no Mesh feature dependencies

[Crypto.uuid4]
    depends on: rand crate (already present)
    no Mesh feature dependencies

[Crypto.secure_compare]
    depends on: hmac crate (already present)
    no Mesh feature dependencies

[Base64.encode / decode]
    depends on: base64 crate (already present)
    no Mesh feature dependencies

[Hex.encode / decode]
    depends on: stdlib string formatting
    no Mesh feature dependencies

[DateTime.* (all)]
    depends on: chrono = "0.4" (NEW — not yet in Cargo.toml)
    DateTime is an opaque heap pointer (same pattern as Regex, DB connections)
    no other Mesh feature depends on DateTime (independent)

[Http.build / header / body / timeout / send]
    depends on: ureq = "2" (already present)
    enhances: existing Http.get/Http.post (those remain as convenience wrappers)

[Http.stream]
    requires: Http.build (need a Request struct to attach streaming to)
    depends on: ureq 2.x streaming reader (into_reader() API)

[Http.client / send_with (keep-alive)]
    requires: Http.build (client handle concept flows from builder pattern)
    depends on: ureq 2.x connection reuse (Client::new().agent() pattern)

[meshc test runner]
    requires: new meshc subcommand (compiler CLI change)
    requires: test runtime primitives in mesh-rt (assert panic, result reporting)
    is prerequisite for: ALL other testing features

[assert / assert_eq / assert_ne / assert_raises]
    requires: meshc test runner (these are runtime primitives for tests)
    no dependencies on each other

[describe "..." do ... end]
    requires: meshc test runner
    optional: syntactic grouping only; does not require setup blocks

[setup do ... end / teardown]
    requires: describe blocks (scoped to describe context)

[assert_receive pattern, timeout]
    requires: meshc test runner
    requires: actor mailbox access in test context (existing actor API)

[Test.mock_actor]
    requires: meshc test runner
    requires: actor spawn API (already exists in mesh-rt)
    requires: test isolation semantics (each test gets clean actor context)

[meshc test --coverage]
    requires: meshc test runner
    requires: LLVM instrumentation pass (significant new compiler work)
    CAUTION: High implementation risk; consider deferring within v14.0

[mesh.toml manifest]
    depends on: toml crate (already in mesh-pkg/Cargo.toml)
    is prerequisite for: meshpkg CLI, hosted registry

[meshpkg publish]
    requires: mesh.toml manifest (metadata to send)
    requires: hosted registry HTTP API (publish endpoint)
    requires: auth token management (meshpkg login)

[meshpkg install <name>]
    requires: hosted registry HTTP API (download endpoint)
    requires: mesh.toml manifest (dependency section to update)
    requires: mesh.lock (lockfile to write)

[meshpkg search <query>]
    requires: hosted registry HTTP API (search endpoint)
    can be implemented before install (only needs read API)

[Package registry hosted site]
    requires: mesh.toml manifest (defines metadata structure)
    is a separate Mesh web application (not part of compiler)
    can be built in parallel with CLI after manifest format is decided
```

### Dependency Notes

- **Crypto requires zero new Rust deps.** `sha2`, `hmac`, `base64`, `rand` are already compiled into `mesh-rt`. Adding user-facing Mesh APIs is purely wrapper code: add `extern "C"` functions, register in typechecker as stdlib functions, no cargo changes needed.
- **DateTime requires one new dep.** `chrono = "0.4"` must be added to `compiler/mesh-rt/Cargo.toml`. Chrono is the canonical Rust datetime crate (48M+ downloads/month). DateTime values are opaque u64 pointers to chrono structs on the GC heap, following the established pattern for Regex and DB connection handles.
- **Http builder is a refactor, not a rewrite.** The existing `mesh_http_get` and `mesh_http_post` functions in `http/client.rs` use ureq 2.x already. The builder wraps `ureq::RequestBuilder`. Existing `Http.get` and `Http.post` become thin wrappers over the builder for backward compatibility.
- **meshc test runner is the single biggest prerequisite.** All 5 other testing features require it. Build the runner first, then layer assertions, describe blocks, actor mocking, and coverage on top.
- **Package registry hosted site is independent of the compiler.** It is a separate web application (likely written in Mesh itself, similar to how Mesher was built). It does not block CLI or manifest development. Design the manifest format and API contract first.
- **Coverage reporting has high implementation risk.** LLVM coverage instrumentation (`-fprofile-instr-generate`, `llvm-profdata`, `llvm-cov`) requires accessing LLVM APIs through Inkwell. This is feasible but non-trivial. If it blocks the milestone, defer to v14.1.

---

## MVP Definition

### Launch With (v1 — all committed v14.0 requirements)

The following are all required per PROJECT.md v14.0 target features.

**Crypto stdlib:**
- [x] `Crypto.sha256(s)` -> String (hex) — required for API signature verification
- [x] `Crypto.sha512(s)` -> String (hex) — stronger hashing
- [x] `Crypto.hmac_sha256(key, msg)` -> String (hex) — API authentication
- [x] `Crypto.hmac_sha512(key, msg)` -> String (hex) — stronger HMAC
- [x] `Crypto.secure_compare(a, b)` -> Bool — constant-time comparison (security requirement)
- [x] `Crypto.uuid4()` -> String — UUID v4 generation

**Encoding:**
- [x] `Base64.encode(s)` -> String — standard base64
- [x] `Base64.decode(s)` -> Result<String, String> — standard decode
- [x] `Base64.encode_url(s)` -> String — URL-safe base64
- [x] `Base64.decode_url(s)` -> Result<String, String> — URL-safe decode
- [x] `Hex.encode(s)` -> String — hex encoding
- [x] `Hex.decode(s)` -> Result<String, String> — hex decoding

**DateTime:**
- [x] `DateTime.utc_now()` -> DateTime — current UTC timestamp
- [x] `DateTime.from_iso8601(s)` -> Result<DateTime, String> — parse ISO 8601
- [x] `DateTime.to_iso8601(dt)` -> String — format ISO 8601
- [x] `DateTime.from_unix(Int)` -> DateTime — from Unix timestamp
- [x] `DateTime.to_unix(dt)` -> Int — to Unix timestamp
- [x] `DateTime.add(dt, Int, unit)` -> DateTime — arithmetic (second/minute/hour/day)
- [x] `DateTime.diff(dt1, dt2, unit)` -> Int — time difference
- [x] `DateTime.before?(dt1, dt2)` / `DateTime.after?(dt1, dt2)` -> Bool — comparisons

**HTTP client improvements:**
- [x] `Http.build(method, url)` -> Request — builder entry point
- [x] `Http.header(req, k, v)` -> Request — add header
- [x] `Http.body(req, s)` -> Request — set body
- [x] `Http.timeout(req, ms)` -> Request — set timeout
- [x] `Http.send(req)` -> Result<Response, String> — execute request
- [x] `Http.stream(req, fn chunk -> ... end)` -> Result<Unit, String> — streaming
- [x] `Http.client()` -> Client; `Http.send_with(client, req)` — connection keep-alive/reuse

**Testing framework:**
- [x] `meshc test` — discovers `*.test.mpl`, compiles, runs, reports pass/fail
- [x] `assert expr` — basic boolean assertion
- [x] `assert_eq a, b` — equality with diff output
- [x] `assert_ne a, b` — inequality assertion
- [x] `assert_raises fn` — exception/panic assertion
- [x] `describe "..." do ... end` — test grouping
- [x] `Test.mock_actor(fn msg -> ... end)` -> Pid — mock actor for concurrency testing
- [x] `meshc test --coverage` — coverage reporting

**Package registry:**
- [x] `mesh.toml` manifest format — name, version, description, license, dependencies
- [x] `mesh.lock` lockfile — auto-generated, reproducible builds
- [x] `meshpkg publish` — publish to hosted registry
- [x] `meshpkg install <name>` — install from registry
- [x] `meshpkg search <query>` — search registry
- [x] Hosted packages site — browse, search, per-package page with README + versions

### Add After Validation (v1.x — post v14.0)

- [ ] `DateTime.format(dt, pattern)` with strftime-style format strings — trigger: custom display needs emerge from user feedback
- [ ] `Crypto.pbkdf2(password, salt, iterations)` — trigger: password hashing use cases appear in user apps
- [ ] Timezone-aware datetime (`DateTime.shift_zone`) — trigger: user volume requesting it; requires tz database dep
- [ ] `meshpkg update` / `meshpkg outdated` — trigger: package ecosystem matures enough to have outdated packages
- [ ] Private/org package namespaces on registry — trigger: enterprise adoption signals
- [ ] Coverage delta reporting (compare against baseline) — trigger: CI integration demand

### Future Consideration (v2+)

- [ ] Full IANA timezone database embedding — defer: 50+ KB binary size cost; UTC satisfies most use cases
- [ ] Ed25519 / RSA signing and verification — defer: specialized crypto beyond stdlib scope
- [ ] Property-based testing / fuzzing integration — defer: significant framework work
- [ ] Package registry billing / private packages — defer: not a v1 goal
- [ ] `meshpkg audit` (vulnerability scanning) — defer: requires CVE database integration

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Crypto stdlib (sha256/hmac/uuid) | HIGH | LOW | P1 |
| Encoding (base64/hex) | HIGH | LOW | P1 |
| DateTime (now/parse/format/add/diff) | HIGH | MEDIUM | P1 |
| `mesh.toml` manifest format | HIGH | LOW | P1 |
| `meshc test` runner + assertions | HIGH | MEDIUM | P1 |
| Http builder API | MEDIUM | MEDIUM | P1 |
| `meshpkg` CLI (publish/install/search) | HIGH | HIGH | P1 |
| Package hosted site | HIGH | HIGH | P1 |
| Http streaming | MEDIUM | MEDIUM | P2 |
| Http keep-alive client handle | LOW | LOW | P2 |
| `describe` blocks | MEDIUM | LOW | P2 |
| `assert_receive` for actor testing | HIGH | MEDIUM | P2 |
| `setup do ... end` | MEDIUM | LOW | P2 |
| `Test.mock_actor` | MEDIUM | HIGH | P2 |
| `meshc test --coverage` | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v14.0; blocks the milestone if missing
- P2: Should have; included in v14.0 once P1 features are done
- P3: Nice to have; target v14.0 if time permits; defer if coverage implementation is too risky

---

## Comparable Ecosystem Analysis

### Crypto API Conventions

| Language | SHA-256 | HMAC | UUID |
|----------|---------|------|------|
| Elixir | `:crypto.hash(:sha256, data)` -> binary; `Base.encode16(h)` for hex | `:crypto.mac(:hmac, :sha256, key, msg)` | `:crypto.strong_rand_bytes(16)` + format |
| Python | `hashlib.sha256(data.encode()).hexdigest()` | `hmac.new(key, msg, sha256).hexdigest()` | `str(uuid.uuid4())` |
| Go | `sha256.Sum256([]byte(s))` + `hex.EncodeToString(h[:])` | `hmac.New(sha256.New, key)` | third-party `github.com/google/uuid` |
| Node.js | `crypto.createHash('sha256').update(s).digest('hex')` | `crypto.createHmac('sha256', key).update(msg).digest('hex')` | `crypto.randomUUID()` |
| **Mesh** | `Crypto.sha256(s)` -> String | `Crypto.hmac_sha256(key, msg)` -> String | `Crypto.uuid4()` -> String |

**Decision**: Return hex strings directly (not raw bytes). Mesh has no binary/bytes type; hex strings compose naturally with string interpolation and are the format users actually need. Functions like `sha256` are total (cannot fail on String input). `hmac` functions are also total given valid key and message strings.

### DateTime API Conventions

| API | Elixir (DateTime) | Rust (chrono) | Python (datetime) | Mesh (proposed) |
|-----|-------------------|---------------|-------------------|-----------------|
| Current UTC | `DateTime.utc_now()` | `Utc::now()` | `datetime.utcnow()` | `DateTime.utc_now()` |
| ISO 8601 parse | `DateTime.from_iso8601("...")` | `DateTime::parse_from_rfc3339` | `datetime.fromisoformat` | `DateTime.from_iso8601(s)` -> Result<DateTime, String> |
| ISO 8601 format | `DateTime.to_iso8601(dt)` | `dt.to_rfc3339()` | `dt.isoformat()` | `DateTime.to_iso8601(dt)` -> String |
| Add time | `DateTime.add(dt, 3600, :second)` | `dt + Duration::hours(1)` | `dt + timedelta(hours=1)` | `DateTime.add(dt, 3600, :second)` |
| Unix timestamp | `DateTime.to_unix(dt)` | `dt.timestamp()` | `dt.timestamp()` | `DateTime.to_unix(dt)` -> Int |
| Difference | `DateTime.diff(dt1, dt2, :second)` | `(dt1 - dt2).num_seconds()` | `(dt1 - dt2).total_seconds()` | `DateTime.diff(dt1, dt2, :second)` -> Int |
| Compare | `DateTime.compare(dt1, dt2)` -> :lt/:eq/:gt | `dt1.cmp(&dt2)` | `dt1 < dt2` | `DateTime.before?(dt1, dt2)` -> Bool |

**Decision**: Follow Elixir DateTime API naming conventions exactly. Mesh already has Elixir-style idioms throughout. `from_iso8601` returns `Result<DateTime, String>` for parse failures — consistent with Mesh error handling patterns. `add` units use atoms (`:second`, `:minute`, `:hour`, `:day`) matching Elixir. Avoid `:month` / `:year` units — calendar arithmetic (DST, variable month lengths, leap years) requires full tz database.

### Base64 / Hex Encoding Conventions

| API | Elixir (Base) | Python (base64) | Node.js | Mesh (proposed) |
|-----|---------------|-----------------|---------|-----------------|
| Base64 encode | `Base.encode64(s)` -> String | `base64.b64encode(b).decode()` | `Buffer.from(s).toString('base64')` | `Base64.encode(s)` -> String |
| Base64 decode | `Base.decode64(s)` -> {:ok, s} or :error | `base64.b64decode(s)` | `Buffer.from(s, 'base64')` | `Base64.decode(s)` -> Result<String, String> |
| URL-safe encode | `Base.url_encode64(s)` | `base64.urlsafe_b64encode(b).decode()` | custom | `Base64.encode_url(s)` -> String |
| Hex encode | `Base.encode16(s, case: :lower)` | `s.encode().hex()` | `Buffer.from(s).toString('hex')` | `Hex.encode(s)` -> String |
| Hex decode | `Base.decode16(s, case: :mixed)` | `bytes.fromhex(s)` | `Buffer.from(s, 'hex')` | `Hex.decode(s)` -> Result<String, String> |

**Decision**: `Base64` and `Hex` as separate modules (not a combined `Encoding` module). Decode always returns `Result<String, String>` because malformed input must be handled. Encode is always total. `Hex.encode` produces lowercase hex (the overwhelming convention for hash digests and cryptographic output).

### HTTP Client Builder Conventions

| API | reqwest (Rust) | Finch (Elixir) | Python requests | Mesh (proposed) |
|-----|----------------|----------------|-----------------|-----------------|
| Create request | `client.get(url)` | `Finch.build(:get, url, headers, body)` | `requests.get(url)` | `Http.build(:get, url)` |
| Add header | `.header(k, v)` | headers in build | `headers={k: v}` | `|> Http.header(k, v)` |
| Set body | `.body(s)` | body in build | `data=s` | `|> Http.body(s)` |
| Set timeout | `.timeout(dur)` | `receive_timeout: ms` | `timeout=s` | `|> Http.timeout(ms)` |
| Execute | `.send().await` | `Finch.request(req, Finch)` | (immediate in requests.get) | `|> Http.send()` |
| Stream | `.bytes_stream()` | streaming accumulator | `stream=True` iterator | `Http.stream(req, fn chunk -> ... end)` |
| Keep-alive | `Client` reuse | Finch connection pool | `Session` reuse | `Http.client()` handle; `Http.send_with(client, req)` |

**Decision**: `Http.build(:method, url)` matches Mesh pipe idioms. The `|>` pipe operator makes builder APIs feel native. Return a `Response` struct (not a raw string) from `Http.send()`: `{ status :: Int, body :: String, headers :: Map<String, String> }`. Keep existing `Http.get(url)` and `Http.post(url, body)` as backward-compatible convenience functions — they delegate to the builder internally.

### Testing Framework Conventions

| Concept | ExUnit (Elixir) | EUnit (Erlang) | pytest (Python) | Mesh (proposed) |
|---------|-----------------|----------------|-----------------|-----------------|
| File convention | `*_test.exs` in `test/` | `_test()` functions in module | `test_*.py` in any dir | `*.test.mpl` anywhere in project |
| Runner | `mix test` | `eunit:test(Module)` | `pytest` | `meshc test` |
| Basic assert | `assert expr` | `?assert(Expr)` | `assert expr` | `assert expr` |
| Equality | `assert a == b` (or `assert_eq`) | `?assertEqual(A, B)` | `assert a == b` | `assert_eq a, b` |
| Exception | `assert_raise(Error, fn)` | `?assertException(class, term, expr)` | `pytest.raises(Error)` | `assert_raises fn` |
| Grouping | `describe "..." do` | test generators | `class TestFoo:` | `describe "..." do ... end` |
| Setup | `setup do ... end` | `{setup, Setup, Tests}` | `@pytest.fixture` | `setup do ... end` |
| Actor msg | `assert_receive pattern, timeout` | manual mailbox | n/a | `assert_receive pattern, timeout` |
| Mock | Mox (behaviour + expect/stub) | `:meck` | `unittest.mock.patch` | `Test.mock_actor(fn msg -> end)` |
| Module concurrency | `async: true` per module | manual | `pytest-xdist` | `meshc test --jobs N` |

**Key decisions for Mesh testing:**

1. **File discovery**: `*.test.mpl` anywhere in the project directory tree (recursive). This is more flexible than ExUnit's fixed `test/` directory — Mesh projects may colocate tests with source.

2. **Test function identification**: Functions whose names start with `test_` (e.g., `fn test_login_success do ... end`). Tests inside `describe "..." do ... end` blocks inherit the describe name in failure output.

3. **`assert_receive` is critical for actors**: A test actor can receive messages. `assert_receive pattern, 5000` waits up to 5 seconds for a matching message in the test's mailbox. Essential for verifying that other actors sent the expected messages.

4. **Mock actors via spawn**: `Test.mock_actor(fn msg -> ... end)` spawns a new actor with the given message handler and returns its PID. Tests pass this PID to the system under test. No global function replacement needed — the actor model makes mocking compositional.

5. **Coverage reporting** (`--coverage`): Requires LLVM instrumentation. High implementation risk. If this is blocking, defer to a v14.1 phase.

### Package Registry Conventions

| Concept | Hex (Elixir) | Cargo (Rust) | npm (Node.js) | Mesh (proposed) |
|---------|--------------|--------------|---------------|-----------------|
| Manifest file | `mix.exs` | `Cargo.toml` | `package.json` | `mesh.toml` |
| Lockfile | `mix.lock` | `Cargo.lock` | `package-lock.json` | `mesh.lock` |
| Versioning | SemVer | SemVer (3-part required) | SemVer | SemVer (major.minor.patch required) |
| Publish | `mix hex.publish` | `cargo publish` | `npm publish` | `meshpkg publish` |
| Install | `mix deps.get` | `cargo add` + `cargo build` | `npm install` | `meshpkg install <name>` |
| Search | `mix hex.search` | `cargo search` | `npm search` | `meshpkg search <query>` |
| Auth | `mix hex.user auth` | `cargo login` | `npm login` | `meshpkg login` |
| Yank | `mix hex.retire` | `cargo yank` | `npm deprecate` | `meshpkg yank <name>@<ver>` |
| Registry site | hex.pm | crates.io | npmjs.com | packages.meshlang.dev |
| Per-package page | README, versions, downloads | README, versions, deps, MSRV | README, weekly downloads, dependents | README, versions, install command, license |

**Decision for `mesh.toml` format** (follows Cargo.toml conventions, which are clean and TOML-native):

```toml
[package]
name = "my-package"
version = "1.0.0"
description = "One-line summary"
license = "MIT"
authors = ["Name <email>"]
keywords = ["http", "web"]  # max 5, ASCII, alphanumeric
categories = ["web-programming"]  # validated list, max 5

[dependencies]
json-utils = "1.2"
http-client = "~> 2.0"
```

Version requirements use Cargo-style `"1.2"` (compatible with 1.x.x >= 1.2.0) and Hex-style `"~> 2.0"` (compatible with 2.x.x, not 3.x.x). `mesh.lock` is auto-generated on install/publish and should be committed to source control for applications (but not libraries, matching Cargo convention).

---

## Implementation Complexity Notes

### LOW complexity (thin wrappers over existing Rust deps)

These are primarily `extern "C"` function additions in `mesh-rt` + typechecker
registration in `mesh-typeck`. No new Rust dependencies. No compiler architecture
changes. Each represents roughly 50-150 LOC Rust + 20-50 LOC compiler registration.

- `Crypto.sha256 / sha512` — wrap `sha2::Sha256::digest` / `sha2::Sha512::digest`; hex-encode with stdlib format
- `Crypto.hmac_sha256 / hmac_sha512` — wrap `hmac::Hmac<Sha256>::new` + `finalize`; hex-encode
- `Crypto.secure_compare` — wrap `hmac::Mac::verify_slice` (constant-time)
- `Crypto.uuid4` — `rand::random::<u128>()` formatted as UUID v4 string
- `Base64.encode / encode_url` — wrap `base64::engine::general_purpose::STANDARD.encode`
- `Base64.decode / decode_url` — wrap decode; return Result
- `Hex.encode` — `format!("{:02x}", byte)` per byte
- `Hex.decode` — parse hex pairs; return Result
- `DateTime.from_unix / to_unix` — wrap `chrono::DateTime::from_timestamp` / `.timestamp()`
- `DateTime.before? / after?` — boolean comparisons on DateTime handles

### MEDIUM complexity (new dep, or non-trivial API design)

Approximately 300-600 LOC Rust each, plus compiler registration.

- **DateTime full API** — Add `chrono = "0.4"` to `mesh-rt/Cargo.toml`. DateTime is an opaque u64 pointer (GC heap-allocated `DateTime<Utc>` struct). Wrap `utc_now()`, `from_iso8601` (parse_from_rfc3339), `to_iso8601` (to_rfc3339), `add` (with unit dispatch), `diff`. The DateTime opaque pointer pattern follows the Regex and DB connection handle precedents in the codebase.
- **Http builder API** — Refactor `compiler/mesh-rt/src/http/client.rs`. Add a `MeshRequest` struct (URL, method, headers HashMap, body Option, timeout_ms). Add `extern "C"` functions for build, header, body, timeout. `Http.send` converts MeshRequest to ureq request, executes, returns MeshResponse. ~400 LOC Rust.
- **Http streaming** — ureq 2.x provides `response.into_reader()` returning an `impl Read`. Read in chunks (e.g., 8KB), call the Mesh callback function pointer with each chunk (following existing callback ABI used in iterators and query results). ~200 LOC Rust.
- **`meshc test` runner** — New subcommand in `compiler/meshc/src/main.rs`. File discovery (walkdir), compile each `*.test.mpl` with special `--test` flag that injects a `__run_tests()` entry point, execute compiled binary, capture output (pass/fail counts, failure details), aggregate. ~600 LOC Rust across meshc + mesh-rt test runtime.
- **`mesh.toml` manifest** — Extend `compiler/mesh-pkg/src/lib.rs`. `mesh-pkg` crate already has TOML parsing. Add `[package]` and `[dependencies]` deserialization. ~200 LOC Rust.

### HIGH complexity (significant new systems, cross-cutting concerns)

These require careful design and are the main risk areas for the milestone.

- **`Test.mock_actor`** (~400 LOC Rust + design): Spawning a mock actor is straightforward (existing `mesh_actor_spawn` API). The complexity is test isolation: each test needs a clean actor context, and the mock actor must be cleaned up after the test. Requires a test supervisor structure and careful mailbox semantics. `assert_receive` needs access to the test actor's mailbox.

- **`meshc test --coverage`** (HIGH risk): LLVM coverage instrumentation requires `-fprofile-instr-generate` flags, `llvm-profdata merge`, and `llvm-cov show`. Integrating this through Inkwell and the mesh-codegen pipeline is feasible but non-trivial (~1000 LOC Rust + LLVM API work). Risk: if blocked, defer to v14.1 phase.

- **`meshpkg` CLI** (~1000 LOC Rust): auth token management (`meshpkg login` stores token in `~/.mesh/credentials`), tarball creation from project directory (zip/tar + metadata), HTTP upload to registry API, HTTP download for install, local extraction to `~/.mesh/packages/` or project-local deps directory, version resolution from `mesh.toml` + `mesh.lock`.

- **Package registry hosted site** (open-ended): A separate Mesh web application. Not part of the compiler. Estimate ~1500-2000 LOC Mesh for the site backend + frontend. The site serves package metadata from a database (PostgreSQL via Mesh ORM), renders README from markdown, shows version history. Can be built in parallel with CLI once the API contract is decided. Time-box this: the site must be functional (browse, search, per-package page) but does not need to be feature-complete.

---

## Sources

- [ExUnit v1.19.5 documentation](https://hexdocs.pm/ex_unit/ExUnit.html) — file convention, runner, async:true, assert_receive
- [ExUnit.Assertions v1.19.5](https://hexdocs.pm/ex_unit/ExUnit.Assertions.html) — assert, refute, assert_raise, assert_receive signatures
- [Elixir DateTime v1.19.5](https://hexdocs.pm/elixir/DateTime.html) — from_iso8601, to_unix, add, diff, compare, before?, after? API — HIGH confidence
- [chrono Rust crate docs](https://docs.rs/chrono/latest/chrono/) — NaiveDateTime, DateTime<Utc>, parse_from_rfc3339, to_rfc3339, timestamp, num_seconds — HIGH confidence
- [reqwest ClientBuilder](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html) — builder pattern, keep-alive (90s idle default), streaming via bytes_stream — HIGH confidence
- [Hex package manager docs](https://hex.pm/docs/publish) — mix.exs fields, publish flow, hexdocs integration — HIGH confidence
- [Cargo manifest format](https://doc.rust-lang.org/cargo/reference/manifest.html) — Cargo.toml field design, keywords (max 5), categories (validated slugs) — HIGH confidence
- [RFC 4648 - Base64/Base16 Data Encodings](https://datatracker.ietf.org/doc/html/rfc4648) — canonical encoding standard, URL-safe variant, test vectors — HIGH confidence
- [Python hashlib docs](https://docs.python.org/3/library/hashlib.html) — algorithm-named constructor pattern, update/digest/hexdigest API — HIGH confidence
- [Go crypto/hmac package](https://pkg.go.dev/crypto/hmac) — constant-time comparison via hmac.Equal — HIGH confidence
- [EUnit documentation](https://www.erlang.org/doc/apps/eunit/chapter.html) — Erlang unit testing conventions, assert macros — HIGH confidence
- [Elixir School: Mox](https://elixirschool.com/en/lessons/testing/mox) — mocks-as-noun philosophy, behaviour-based mocking pattern — MEDIUM confidence
- [mesh-rt/Cargo.toml](compiler/mesh-rt/Cargo.toml) — confirmed existing deps (sha2, hmac, base64, rand, ureq); validated zero new deps needed for crypto/encoding — HIGH confidence
- [mesh-rt/src/http/client.rs](compiler/mesh-rt/src/http/client.rs) — confirmed existing ureq 2.x usage, current `get`/`post` flat functions — HIGH confidence

---

*Feature research for: Mesh v14.0 Ecosystem Expansion*
*Researched: 2026-02-28*
