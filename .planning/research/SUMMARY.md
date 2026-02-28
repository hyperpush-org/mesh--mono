# Project Research Summary

**Project:** Mesh v14.0 — Ecosystem Expansion
**Domain:** Programming language ecosystem — stdlib crypto/datetime/encoding, HTTP client, testing framework, package registry
**Researched:** 2026-02-28
**Confidence:** HIGH

## Executive Summary

Mesh v14.0 is an ecosystem expansion milestone for an existing compiled programming language. The work spans six parallel domains: crypto/encoding stdlib, datetime stdlib, HTTP client improvements, a testing framework, a package manifest format, and a hosted package registry. The research finding that most shapes execution is that nearly all crypto and encoding work requires zero new Rust dependencies — `sha2`, `hmac`, `base64`, and `rand` are already compiled into `mesh-rt`. The only new runtime dependency is `chrono 0.4` for datetime, plus a `ureq 2 -> 3` upgrade for HTTP streaming. This dramatically de-risks the stdlib work: it is primarily wrapper code following an established three-file pattern (runtime impl + typechecker registration + LLVM extern declaration).

The recommended approach is to build in dependency order: encoding and crypto first (zero new deps, validates the three-file pattern), then datetime (one new dep, validates the i64 timestamp design), then HTTP client improvements (isolated to one file), then the test runner (requires assertion helpers in place), and finally the package registry (most complex, but independent of all compiler work). The registry backend (Axum 0.8 + PostgreSQL + sqlx) and the CLI (`meshpkg`) can be developed in parallel with compiler changes once the `mesh.toml` manifest format is finalized. The registry website extends the existing VitePress site — no new framework or deployment target.

The top risk is not dependency complexity but design decisions that cannot be retrofitted: timestamp representation (must be `i64` Unix milliseconds, not strings), constant-time HMAC comparison (must use `hmac::Mac::verify_slice`, not `==`), test actor isolation (must be architected before assertions), and registry immutability (publish-once, no overwrite). Each of these is inexpensive to get right and very expensive to fix after users depend on the wrong behavior. A secondary risk is LLVM coverage instrumentation, which is incompatible with Mesh's current codegen and should use source-level MIR counter injection instead.

## Key Findings

### Recommended Stack

The overwhelming majority of v14.0 work builds on the existing dependency graph. `sha2 0.10`, `hmac 0.12`, `base64 0.22`, and `rand 0.9` are already locked in `mesh-rt/Cargo.toml`. The only new additions to `mesh-rt` are `chrono 0.4` (datetime) and upgrading `ureq` from `"2"` to `"3"` (HTTP streaming and keep-alive). The registry backend is a new workspace member (`mesh-registry`) using Axum 0.8, sqlx 0.8, and tokio 1 — all of which align with existing workspace dependencies.

**Core technologies:**
- `chrono 0.4` (mesh-rt): DateTime parsing, formatting, and arithmetic — only new runtime dep; 392M downloads, multi-thread safe since 0.4.20
- `ureq 3.2` (mesh-rt upgrade): Streaming via `Body::into_reader()`, connection pooling via `Agent`, `Body: Send` guarantee needed for actor model
- `axum 0.8` (mesh-registry): Registry HTTP API — tokio-rs maintained, Tower middleware, same tokio dep already in workspace
- `sqlx 0.8` (mesh-registry): Async PostgreSQL for package metadata — compile-time checked queries, matches axum/tokio stack
- `uuid 1.21` (mesh-rt): UUID v4 using `rand 0.9` already present; only new crate added for crypto module
- `tar 0.4` + `flate2 1` (mesh-pkg, mesh-registry): Package tarball creation and extraction

**What not to add:** `hex` crate (3 lines inline), `chrono-tz` (~2MB bloat, not needed for v14.0), `reqwest` (async-only, conflicts with synchronous actor model), `diesel` (synchronous, incompatible with axum async handlers).

### Expected Features

**Must have (table stakes — P1, blocks v14.0):**
- `Crypto.sha256/sha512/hmac_sha256/hmac_sha512/secure_compare/uuid4` — API authentication, content addressing
- `Base64.encode/decode/encode_url/decode_url` and `Hex.encode/decode` — wire format, JWT tokens
- `DateTime.utc_now/from_iso8601/to_iso8601/from_unix/to_unix/add/diff/before?/after?` — timestamps for every web application
- `Http.build/header/body/timeout/send` builder API — composable HTTP client
- `meshc test` runner with `assert/assert_eq/assert_ne/assert_raises` — no testing framework means no confidence in code
- `mesh.toml` manifest and `mesh.lock` lockfile — reproducible builds
- `meshpkg publish/install/search` CLI and hosted registry site with browse/search/per-package pages

**Should have (competitive differentiators — P2):**
- `Http.stream` callback-based streaming and `Http.client()` keep-alive handle
- `describe "..." do ... end` grouping, `setup/teardown` blocks, `assert_receive`, `Test.mock_actor`
- `meshc test --jobs N` parallel test modules

**Defer to v14.1/v2+:**
- `meshc test --coverage` (HIGH implementation risk — LLVM incompatibility with current codegen)
- `DateTime.format` with strftime patterns, timezone-aware datetime
- `Crypto.pbkdf2`, Ed25519/RSA signing
- `meshpkg outdated`, private package namespaces

### Architecture Approach

Every new stdlib function follows the established three-file pattern: `mesh-rt/src/<module>.rs` (Rust `extern "C"` implementation), `mesh-typeck/src/builtins.rs` (type signature registration), `mesh-codegen/src/codegen/intrinsics.rs` (LLVM extern declaration). Stateful resources (HTTP keep-alive agent, streaming reader) use the opaque `u64` handle pattern established for DB connections and regex handles. The test runner is a new module within the `meshc` binary crate (following the `migrate.rs` precedent), not a separate library. The package registry is a separate `mesh-registry` workspace member — not part of the compiler.

**Major components:**
1. `mesh-rt/src/crypto.rs`, `date.rs`, `encoding.rs`, `test_support.rs` (NEW) — stdlib runtime implementations as `extern "C"` functions
2. `meshc/src/test_runner.rs` (NEW) — `*.test.mpl` discovery, compile, execute, aggregate pass/fail
3. `compiler/meshpkg/` (NEW binary crate) — publish, install, search, login CLI separate from `meshc`
4. `registry/` (NEW workspace member) — Axum + PostgreSQL HTTP API + tarball storage with SHA-256 content addressing
5. `website/docs/packages/` (MODIFIED) — Vue components fetching registry API at runtime; extends existing VitePress site

**Key architectural decisions from research:**
- DateTime is `i64` Unix milliseconds, not an opaque heap handle — avoids new type machinery in typeck/codegen
- HTTP streaming uses a dedicated OS thread per stream (WS reader pattern from v4.0), NOT blocking inside actor coroutines
- Each `*.test.mpl` is a complete Mesh program; the runner compiles and executes each independently (no function-level test injection)
- Registry package versions are immutable from day one; yank marks versions deprecated without deleting content
- Exact versions only in `mesh.toml` (`"1.2.0"` not `"^1.0"`) — SemVer range solving is deferred

### Critical Pitfalls

1. **Blocking HTTP I/O starving actor scheduler threads** — `ureq` streaming reads block OS threads; with 8 threads and 8 concurrent streaming actors the scheduler deadlocks. Prevention: spawn a dedicated OS thread per stream (WS reader pattern), deliver chunks to actor mailbox as messages.

2. **Variable-time HMAC comparison** — using `==` on HMAC outputs enables timing attacks on API tokens. Prevention: expose `Crypto.secure_compare` backed by `hmac::Mac::verify_slice` (constant-time via `subtle`); document that `==` must never be used for secret comparison in production.

3. **Test actor registry leaks between tests** — leftover named actors from test A cause "AlreadyRegistered" failures in test B. Prevention: each test function runs as a separate root actor; all linked mock actors die when the test actor exits via existing supervisor infrastructure.

4. **Registry version overwrite** — allowing `meshpkg publish` to overwrite an existing version breaks reproducible builds permanently and cannot be undone without trust damage. Prevention: content-address tarballs by SHA-256; reject re-upload of same version with different content; return HTTP 409 Conflict on duplicate publish.

5. **LLVM coverage incompatible with Mesh codegen** — Mesh emits LLVM IR without DWARF debug info; `llvm-profdata` produces empty reports or maps coverage to Rust compiler source. Prevention: implement coverage as source-level MIR counter injection dumped to JSON; defer LLVM-based coverage until codegen emits proper debug info.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Encoding and Crypto Stdlib
**Rationale:** Zero new Rust dependencies; validates the three-file pattern for all subsequent stdlib work; fastest to ship; crypto primitives (HMAC, UUID) are prerequisites for registry authentication.
**Delivers:** `Crypto.*` (sha256/sha512/hmac/uuid4/secure_compare), `Base64.*`, `Hex.*` — all as `extern "C"` wrappers over already-compiled crates.
**Addresses:** All P1 crypto and encoding features from FEATURES.md.
**Avoids:** Duplicate dep pitfall (audit `Cargo.toml` first); non-constant-time comparison pitfall (design `secure_compare` before any HMAC function); UUID from weak PRNG pitfall (use `ring::rand::SystemRandom`).

### Phase 2: DateTime Stdlib
**Rationale:** One new dependency (`chrono 0.4`); independent of all other v14.0 work; the `i64` Unix milliseconds representation decision must be locked before registry or test runner touches timestamps.
**Delivers:** `DateTime.*` — utc_now, from_iso8601, to_iso8601, from_unix, to_unix, add, diff, before?, after?.
**Uses:** `chrono 0.4` added to `mesh-rt/Cargo.toml`.
**Avoids:** String-based timestamp pitfall; silent UTC assumption pitfall (reject timezone-free strings with Err); integer overflow pitfall (use checked arithmetic, return Result from all arithmetic functions).

### Phase 3: HTTP Client Improvements
**Rationale:** Isolated to `mesh-rt/src/http/client.rs`; ureq 3 upgrade confined to one file; threading model for streaming must be decided before any streaming implementation begins.
**Delivers:** `Http.build/header/body/timeout/send` builder API; `Http.stream` (dedicated OS thread per stream); `Http.client()` keep-alive agent handle.
**Uses:** `ureq 3.2` upgrade; opaque `u64` handle pattern for Agent.
**Avoids:** Actor scheduler starvation pitfall (OS thread per stream, not blocking in coroutine); keep-alive pool on GC heap pitfall (`Box::into_raw` opaque handle); chunked parser edge cases (RFC 9112 strict: extensions, trailers, zero-chunk terminator).

### Phase 4: Testing Framework
**Rationale:** `meshc test` runner is the prerequisite for all testing features; test isolation architecture must be designed first; assertion helpers must exist in `mesh-rt` before the runner can compile and execute test files.
**Delivers:** `meshc test` discovery and runner; `assert/assert_eq/assert_ne/assert_raises`; `describe` blocks; `setup/teardown`; `assert_receive`; `Test.mock_actor`. Coverage treated as stretch goal.
**Addresses:** All P1 and P2 testing features.
**Avoids:** Test actor registry leak pitfall (actor-per-test isolation); mock actor orphan pitfall (link mocks to test actor for automatic cleanup on exit); LLVM coverage pitfall (use MIR counter injection if coverage is implemented at all in v14.0).

### Phase 5: Package Manifest and meshpkg CLI
**Rationale:** `mesh.toml` manifest format must be finalized before registry API contract can be defined; `meshpkg` CLI depends on mesh-pkg's Registry dep variant; exact-version-only policy avoids SemVer solver complexity.
**Delivers:** `mesh.toml` manifest with `Dependency::Registry { version }` variant; `mesh.lock` lockfile; `meshpkg publish/install/search/login` CLI binary as new `compiler/meshpkg/` crate.
**Uses:** `tar 0.4`, `flate2 1`, `sha2 0.10` added to mesh-pkg.
**Avoids:** SemVer range solver scope creep (exact versions only in v14.0).

### Phase 6: Package Registry Backend and Website
**Rationale:** Can be developed in parallel with Phase 5 once API contract is defined; registry server is independent of compiler changes; must ship with pre-published stdlib packages to avoid "ghost town" problem at launch.
**Delivers:** `mesh-registry` Axum server (publish/download/search/auth API); PostgreSQL schema with SHA-256 content addressing; tarball storage with `StorageBackend` trait; VitePress package browse/search/detail pages; at least 4 stdlib packages published at launch.
**Uses:** `axum 0.8`, `sqlx 0.8`, `tokio 1`, `uuid 1`, `chrono 0.4` in new `mesh-registry` workspace member.
**Avoids:** Registry version overwrite pitfall (immutable publish, HTTP 409 on duplicate); empty registry at launch (publish stdlib packages as first content); registry SQL full-table-scan (PostgreSQL FTS `tsvector` index from day one).

### Phase Ordering Rationale

- Phases 1-2 (stdlib) have zero external dependencies and validate the three-file pattern used by all later stdlib additions.
- Phase 3 (HTTP) is independent but benefits from the pattern being proven; ureq upgrade is confined to one file.
- Phase 4 (testing) requires assertion helpers in place but is otherwise independent of all other phases.
- Phase 5 (manifest + CLI) must precede Phase 6 (registry server) because the API contract flows from the manifest format.
- Phases 5 and 6 are separable: the registry server can be developed in parallel with the CLI once the API contract is defined on paper.
- The build order from ARCHITECTURE.md (encoding -> crypto -> date -> HTTP -> test assertions -> test runner -> manifest -> meshpkg -> registry -> website) validates this phase structure.
- All of Phases 1-4 are independent of Phases 5-6 and can run in parallel across teams.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (HTTP streaming):** The WS reader thread pattern is documented in PROJECT.md but the exact actor mailbox message format for HTTP chunks and backpressure model need a design spike before implementation begins.
- **Phase 4 (coverage):** MIR-level counter injection is the recommended approach but has no prior art in the Mesh codebase; needs a prototype before committing to the full feature in v14.0. Strong recommendation: defer coverage to v14.1.
- **Phase 6 (registry):** Tarball storage abstraction (`StorageBackend` trait for future S3/R2 migration), PostgreSQL full-text search configuration, and API auth token lifecycle all need design docs before coding starts.

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (crypto/encoding):** Three-file pattern is fully established; existing `mesh_http_get` and `mesh_regex_compile` are direct implementation templates.
- **Phase 2 (datetime):** chrono API is mature and well-documented; i64 millisecond representation is a settled design decision from research.
- **Phase 5 (manifest):** `mesh-pkg` crate already has manifest parsing; adding `Dependency::Registry` variant is a small, well-understood change.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All critical crates verified against docs.rs and Cargo.lock; existing dep reuse confirmed by direct file inspection of mesh-rt/Cargo.toml |
| Features | HIGH | Based on ExUnit, Hex, Cargo, and Python stdlib conventions; all features mapped to concrete Mesh API signatures with complexity estimates |
| Architecture | HIGH | Based on direct codebase inspection of mesh-rt, mesh-typeck, mesh-codegen, mesh-pkg, meshc; three-file pattern and opaque handle pattern verified against multiple existing examples |
| Pitfalls | HIGH | Mix of direct source analysis (scheduler design, existing ureq usage) and verified external CVEs/RFCs (chunked transfer CVE-2025-66373, LLVM coverage format incompatibility) |

**Overall confidence:** HIGH

### Gaps to Address

- **HTTP streaming backpressure:** OS thread + mailbox model is the right pattern, but the message format for chunk delivery and EOF signaling needs a concrete design decision during Phase 3 planning. No gap in approach — gap in specifics.
- **Coverage deferral decision:** Research strongly suggests MIR counter injection over LLVM instrumentation, but the scope for v14.0 vs v14.1 should be confirmed at planning time. If test runner takes longer than expected, coverage is the correct cut.
- **Registry storage abstraction:** Starting with local filesystem is correct, but the `StorageBackend` trait design (interface for future S3/R2 migration) needs a concrete API before Phase 6 coding starts.
- **`meshpkg login` credential storage:** `~/.mesh/credentials` format and token rotation semantics are not fully specified in research. Low risk but needs a design decision during Phase 5 planning.

## Sources

### Primary (HIGH confidence)
- `compiler/mesh-rt/Cargo.toml` — confirmed sha2/hmac/base64/rand/ureq already present; zero new crypto deps needed
- `compiler/mesh-rt/src/http/client.rs` — confirmed ureq 2.x blocking I/O, current get/post flat functions
- `compiler/mesh-pkg/src/manifest.rs` + `resolver.rs` — existing mesh.toml format, DFS resolver, Dependency enum
- `compiler/meshc/src/main.rs` + `migrate.rs` — subcommand-as-module pattern (test runner template)
- `compiler/mesh-codegen/src/codegen/intrinsics.rs` — LLVM extern declaration pattern
- `compiler/mesh-typeck/src/builtins.rs` — type registration pattern for stdlib functions
- [docs.rs/ureq/latest](https://docs.rs/ureq/latest/ureq/) — ureq 3.2 Agent pooling, Body streaming, Body: Send
- [docs.rs/chrono/latest](https://docs.rs/chrono/latest/chrono/) — DateTime<Utc>, parse_from_rfc3339, to_rfc3339, timestamp
- [tokio.rs/blog/2025-01-01-announcing-axum-0-8-0](https://tokio.rs/blog/2025-01-01-announcing-axum-0-8-0) — axum 0.8.8 stable
- [hexdocs.pm/ex_unit/ExUnit.html](https://hexdocs.pm/ex_unit/ExUnit.html) — file convention, runner, assert_receive API
- [RFC 9112 §7.1](https://www.rfc-editor.org/rfc/rfc9112#section-7.1) — chunked transfer coding spec (chunk extensions, trailers)
- [doc.rust-lang.org/cargo/reference/publishing.html](https://doc.rust-lang.org/cargo/reference/publishing.html) — immutability and yank design rationale

### Secondary (MEDIUM confidence)
- [github.com/rust-lang/crates.io](https://github.com/rust-lang/crates.io) — uses axum backend; permanent archive design philosophy
- [dalek-cryptography/subtle](https://github.com/dalek-cryptography/subtle) — LLVM branch re-introduction risk in constant-time code
- [CVE-2025-66373 Akamai](https://www.akamai.com/blog/security/cve-2025-66373-http-request-smuggling-chunked-body-size) — real-world chunked parser failure (2025)
- [LLVM source-based coverage docs](https://clang.llvm.org/docs/SourceBasedCodeCoverage.html) — format version incompatibility warning

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
