# Stack Research

**Domain:** Programming language ecosystem — stdlib expansion, HTTP client, testing framework, package registry
**Researched:** 2026-02-28
**Confidence:** HIGH (all critical crates verified against docs.rs and Cargo.lock)

---

## Context: Existing Stack (Do Not Re-Research)

The Mesh compiler already depends on these crates that are **directly reusable** for v14.0 features:

| Already Present | Version (locked) | Reusable For |
|-----------------|-----------------|--------------|
| `sha2` | 0.10.9 | SHA-256/512 — expose via FFI, zero new dep |
| `hmac` | 0.12.1 | HMAC-SHA256/512 — expose via FFI, zero new dep |
| `base64` | 0.22.1 | Base64 encode/decode — expose via FFI, zero new dep |
| `rand` | 0.9 | UUID v4 random source |
| `rustls` / `ring` | 0.23 / 0.17 | Crypto provider already installed at runtime init |
| `ureq` | 2.12.1 | HTTP client (upgrade path to 3.x for streaming/pooling) |
| `tokio` | 1.x | Async runtime for axum-based packages registry backend |
| `serde` / `serde_json` | 1.x | JSON for registry API |
| `toml` | 0.8 | mesh.toml manifest parsing |
| `semver` | 1.x | Package version constraint resolution |
| `git2` | 0.19 | Git operations in mesh-pkg |
| `clap` | 4.5 | CLI arg parsing for meshpkg |

All crypto stdlib work (SHA-256/512, HMAC, Base64) has **zero new Rust dependencies** — the crates are already compiled as transitive deps.

---

## New Dependencies Required

### 1. Crypto Stdlib (SHA-256/512, HMAC, UUID)

| Library | Version | Add To | Purpose | Why |
|---------|---------|--------|---------|-----|
| `uuid` | 1.21 | `mesh-rt` | UUID v4 generation | Standard crate (374M+ downloads), `v4` feature uses `rand` already present; 1.21 is latest stable |
| `sha2` | 0.10 | `mesh-rt` | SHA-256/512 | **Already present** — just add `mesh_sha256` / `mesh_sha512` extern "C" fns, zero new dep |
| `hmac` | 0.12 | `mesh-rt` | HMAC-SHA256/512 | **Already present** — already used for PostgreSQL SCRAM auth, zero new dep |
| `base64` | 0.22 | `mesh-rt` | Base64 encode/decode | **Already present** — used for PostgreSQL auth, zero new dep |

**uuid Cargo.toml addition to mesh-rt:**
```toml
uuid = { version = "1", features = ["v4"] }
```

For hex encoding, do NOT add the `hex` crate. Hex is trivial inline Rust:
```rust
bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>()
```
Decode is a simple loop over char pairs. Zero dependency for 3 lines of code.

### 2. Date/Time Stdlib

| Library | Version | Add To | Purpose | Why |
|---------|---------|--------|---------|-----|
| `chrono` | 0.4.42 | `mesh-rt` | Parse, format, arithmetic, timestamps | 392M+ downloads, UTC-first, strftime-style formatting, serde integration, no soundness caveats in multi-threaded programs (fixed in 0.4.20). Preferred over `jiff` because v14.0 only needs UTC timestamps + duration arithmetic — not DST-aware calendar arithmetic. Preferred over `time 0.3` because time crate has soundness caveats with `UtcOffset::current_local_offset` in multi-threaded programs (and mesh-rt is multi-threaded). |

**Cargo.toml addition to mesh-rt:**
```toml
chrono = { version = "0.4", features = ["serde"] }
```

Do NOT add `chrono-tz`. Mesh doesn't need timezone-aware calendar arithmetic in v14.0. UTC timestamps + duration arithmetic cover the full feature set and chrono-tz adds ~2MB binary bloat.

### 3. Base64/Hex Encoding

| Library | Version | Add To | Purpose | Why |
|---------|---------|--------|---------|-----|
| `base64` | 0.22 | `mesh-rt` | Base64 encode/decode | **Already present** — `general_purpose::STANDARD` engine for standard, `URL_SAFE` engine for URL-safe variant |
| hex (inline) | n/a | `mesh-rt` | Hex encode/decode | Implement directly in 3-5 lines of Rust — zero dep for trivial functionality |

The base64 Engine API (0.22.x) uses `general_purpose::STANDARD.encode(bytes)` and `general_purpose::STANDARD.decode(b64str)`. This is the stable API post-0.21 migration away from the deprecated top-level `encode`/`decode` functions.

### 4. HTTP Client Improvements (Streaming, Keep-Alive, Builder API)

| Library | Version | Add To | Purpose | Why |
|---------|---------|--------|---------|-----|
| `ureq` | **3.2** | `mesh-rt` | Streaming, connection pooling, builder API | Upgrade from locked 2.12.1. ureq 3.x adds proper `Agent` connection pooling, `Body::into_reader()` for streaming, `RequestBuilder` fluent API with `.header()` / `.timeout_global()`, semver-stable re-exports. Already the HTTP client dep — upgrade not replace. |

**Cargo.toml change in mesh-rt:**
```toml
# Before:
ureq = "2"
# After:
ureq = "3"
```

**ureq 3.x API mapping to Mesh stdlib additions:**

| Mesh Feature | ureq 3.x API |
|---|---|
| Connection keep-alive | `Agent::config_builder().build()` — Agent holds a connection pool, shared via `Arc`, reused across requests |
| Streaming response | `response.body_mut().into_reader()` → `impl Read + 'static` — owned reader that can be sent across actor boundaries |
| Chunked response | Automatic — ureq transparently decodes `Transfer-Encoding: chunked`; `content_length()` returns `None` for chunked |
| Builder API | `agent.get(url).header("Authorization", "Bearer x").timeout_global(Duration::from_secs(30)).call()` |
| Limited reads | `.body_mut().with_config().limit(N).read_to_vec()` — safe downloads without memory exhaustion |

**Breaking change from 2.x:** `response.into_string()` → `response.body_mut().read_to_string()`. Both existing `mesh_http_get` and `mesh_http_post` in `http/client.rs` need updating.

Do NOT switch to `reqwest`. reqwest requires async/await (Tokio) in the calling code. mesh-rt uses synchronous blocking I/O throughout — actor coroutines, not async/await. Switching would require redesigning all HTTP client callsites and adding Tokio runtime management inside the actor scheduler.

### 5. Testing Framework (meshc test, coverage)

The testing framework is entirely implemented **within the compiler and runtime** — no new Rust crates needed for the test runner or assertion framework. Coverage reporting uses an external tool invoked by `meshc test --coverage`.

| Component | Approach | New Dep? |
|-----------|----------|----------|
| `*.test.mpl` discovery | Filesystem walk already in compiler pipeline | No |
| Test runner execution | Compile test files with special harness entry point; capture pass/fail/panic | No |
| Assertion helpers | `assert`, `assert_eq`, `assert_raises` — Mesh stdlib functions returning `Result<(), String>` | No |
| Mock actors | Stub actor registrations in mesh-rt using existing spawn/mailbox infrastructure | No |
| Function stubs | Compiler-level concept: register alternative function bindings for test scope | No |
| Coverage instrumentation | Add `-C instrument-coverage` LLVM flag during test builds | No |
| Coverage report | Invoke `llvm-profdata` + `llvm-cov` from `llvm-tools-preview` rustup component | No new dep |

For running `meshc`'s own Rust test suite with coverage (CI), use `cargo-llvm-cov`. This is a dev tool for the compiler developers, not part of the Mesh language distribution.

**Why cargo-llvm-cov over cargo-tarpaulin:**
- cargo-tarpaulin uses ptrace on Linux (x86_64 only by default) and LLVM on macOS. Mesh targets both.
- cargo-llvm-cov is cross-platform LLVM instrumentation — same backend on all platforms.
- cargo-llvm-cov supports proc-macros and doc tests.
- cargo-llvm-cov is faster because it instruments only necessary crates.

For Mesh program coverage specifically (coverage of .mpl programs compiled by meshc): the codegen phase adds LLVM instrumentation (`-C instrument-coverage` equivalent on IR), and `llvm-profdata`/`llvm-cov` process the raw profile data. These come from the `llvm-tools-preview` rustup component, not a new crate.

### 6. Package Registry (meshpkg CLI + Hosted Site)

**CLI additions to existing `mesh-pkg` crate:**

| Library | Version | Already Present | Purpose | Why |
|---------|---------|----------------|---------|-----|
| `ureq` | 3.2 | No (mesh-pkg) | HTTP calls to registry API from CLI | Upgrade ureq in mesh-rt covers mesh-rt; mesh-pkg needs its own dep since it doesn't depend on mesh-rt |
| `sha2` | 0.10 | No (mesh-pkg) | Package checksum verification | mesh-pkg doesn't currently depend on mesh-rt where sha2 is present |
| `tar` | 0.4 | No | Package tarball creation/extraction | Standard crate for .tar.gz archives; pairs with flate2 |
| `flate2` | 1 | No | gzip compression for tarballs | Standard gzip; pairs with tar for .tar.gz format |

**mesh-pkg Cargo.toml additions:**
```toml
ureq = "3"
sha2 = "0.10"
tar = "0.4"
flate2 = "1"
```

**New `mesh-registry` binary (separate crate in workspace):**

The hosted packages site backend is a new Rust binary. It is NOT part of meshc or mesh-pkg — it's a separate server deployed independently.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `axum` | 0.8.8 | Registry API web framework | tokio-rs maintained, same tokio dep already in workspace, Tower middleware ecosystem, 0.8 released Jan 2025 with stable API. crates.io itself uses axum. |
| `tokio` | 1 | Async runtime | Already in workspace |
| `tower` | 0.5 | Rate limiting, auth middleware | axum uses Tower natively — get rate limiting, timeouts, auth for free |
| `serde` / `serde_json` | 1 | JSON request/response | Already in workspace |
| `sqlx` | 0.8 | PostgreSQL for package metadata | Async-native, compile-time checked queries, matches axum/tokio stack |
| `sha2` | 0.10 | Package integrity verification | Registry validates checksums on publish |
| `tar` | 0.4 | Tarball handling | Inspect/store uploaded packages |
| `flate2` | 1 | gzip compression | Paired with tar |
| `uuid` | 1 | Package upload tokens | Random tokens for publish authentication |
| `chrono` | 0.4 | Timestamps on package versions | Consistent with mesh-rt chrono usage |

**New workspace member Cargo.toml:**
```toml
[package]
name = "mesh-registry"

[dependencies]
axum = "0.8"
tokio = { workspace = true }
tower = "0.5"
serde = { workspace = true }
serde_json = { workspace = true }
sqlx = { version = "0.8", features = ["postgres", "runtime-tokio", "macros"] }
sha2 = "0.10"
tar = "0.4"
flate2 = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
```

**Workspace Cargo.toml changes:**
```toml
# Add to [workspace.members]:
"compiler/mesh-registry"

# Add to [workspace.dependencies]:
axum = "0.8"
```

**Hosted Registry Frontend — extend existing website:**

The packages site is NOT a separate SPA. It extends the existing `website/` VitePress site with new pages.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| VitePress | 1.6.4 | Static pages (browse, search, per-package) | Already deployed for docs site — zero new tooling, zero new deployment |
| Vue 3 | 3.5.28 | Dynamic package browsing components fetching registry API | Already present |
| Tailwind CSS v4 | 4.1.18 | Styling | Already present |

The packages site does not need a separate framework. VitePress pages with Vue components fetching the registry API at runtime cover browse/search/detail views. Static pre-rendered pages for SEO, dynamic fetch for real-time version data.

---

## Recommended Stack Summary

### Additions to mesh-rt/Cargo.toml

```toml
# New additions (everything else already present):
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
# Upgrade (not addition):
ureq = "3"   # was "2"
```

### Additions to mesh-pkg/Cargo.toml

```toml
ureq = "3"
sha2 = "0.10"
tar = "0.4"
flate2 = "1"
```

### New mesh-registry/Cargo.toml

```toml
[package]
name = "mesh-registry"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.8"
tokio = { workspace = true }
tower = "0.5"
serde = { workspace = true }
serde_json = { workspace = true }
sqlx = { version = "0.8", features = ["postgres", "runtime-tokio", "macros"] }
sha2 = "0.10"
tar = "0.4"
flate2 = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `chrono 0.4` | `jiff` (BurntSushi, 2024) | jiff is more correct for DST-aware calendar math but v14.0 only needs UTC timestamps + duration arithmetic. chrono's 392M downloads, mature serde integration, and smaller API surface make it the pragmatic choice. Revisit if timezone features are requested. |
| `chrono 0.4` | `time 0.3` | time crate has soundness caveats with `UtcOffset::current_local_offset` in multi-threaded programs. mesh-rt is multi-threaded (actor scheduler). |
| hex inline impl | `hex 0.4` crate | Hex is 3 lines of Rust. `hex::encode` is `bytes.iter().map(|b| format!("{:02x}", b)).collect()`. Adding a crate dependency for this is wasteful. Add the crate only if performance profiling shows hex is a bottleneck. |
| ureq 3.x upgrade | reqwest 0.12 | reqwest requires async/await (Tokio) in calling code. mesh-rt is synchronous blocking I/O — actor coroutines, not async/await. Switching would require redesigning all HTTP callsites and adding Tokio runtime management in the actor scheduler. |
| ureq 3.x upgrade | hyper 1.x direct | hyper is too low-level — manual chunked decoding, header parsing, redirect handling, keep-alive management. ureq handles all of this. |
| axum 0.8 for registry backend | actix-web 4.x | actix-web is ~10-15% faster under extreme load but the registry backend is not performance-critical. axum shares the tokio workspace dep already present, uses Tower middleware, and is maintained by the tokio-rs team. |
| axum 0.8 for registry backend | Mesh's own HTTP server | Dogfooding is tempting but premature — Mesh's HTTP server is synchronous, lacks axum's middleware ecosystem, and has no async/await integration. Use Mesh's server for user examples only. |
| VitePress for packages site | Next.js / Nuxt | Project already has VitePress for docs site. Reusing the same toolchain eliminates a new framework, new build pipeline, and new deployment target. |
| sqlx 0.8 for registry DB | Mesh's own ORM | Mesh ORM uses synchronous PostgreSQL wire protocol. The axum registry backend is async. sqlx is async-native with compile-time checked queries. Migrate to Mesh ORM if/when Mesh gains async support. |
| local fs for tarball storage (v14.0) | S3 / object_store | Start simple. Design the storage layer against `object_store 0.11`'s trait from day one but use local filesystem for the initial deployment. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `hex = "0.4"` crate | Trivial functionality (3 lines of Rust) — no new dep needed | Inline: `bytes.iter().map(\|b\| format!("{:02x}", b)).collect()` |
| `chrono-tz` | Adds ~2MB binary bloat for IANA timezone DB not needed in v14.0 | Plain `chrono` (UTC timestamps only) |
| `openssl` as new direct dep | openssl-sys is already present for musl targets (vendored). Adding it directly risks conflicts with ring/rustls TLS stack. | ring + rustls already provide all needed crypto primitives |
| `reqwest` | async-only, conflicts with synchronous actor model in mesh-rt | ureq 3.x with Agent pooling |
| `rocket` or `warp` for registry | Not in existing dep tree, worse Tower/middleware integration than axum | axum 0.8 |
| `diesel` for registry DB | Diesel is synchronous, incompatible with axum async handlers without spawn_blocking wrappers | sqlx (async-native) |
| Separate npm project for packages site | Creates parallel toolchain to existing website/ stack | Extend existing VitePress site |
| `cargo-tarpaulin` | Linux-only ptrace backend (x86_64), unreliable on macOS; Mesh CI targets both | cargo-llvm-cov (cross-platform LLVM instrumentation) |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ureq 3.2` | `rustls 0.23`, `ring 0.17` | ureq 3.x defaults to rustls with ring provider — exact match with mesh-rt's existing TLS stack. Zero conflict. |
| `uuid 1.21` | `rand 0.9` | uuid v4 feature uses rand as random source. rand 0.9 already locked in mesh-rt. |
| `chrono 0.4.42` | `serde 1` | serde feature aligns with workspace serde 1.x. |
| `axum 0.8.8` | `tokio 1`, `tower 0.5`, `hyper 1` | axum 0.8 requires tokio 1 (workspace dep) and upgraded to hyper 1.x internally. No conflict with mesh-rt since mesh-rt uses ureq (blocking), not hyper directly. |
| `sqlx 0.8` | `tokio 1` | Async runtime match with workspace tokio dep. |
| `tar 0.4` | `flate2 1` | Standard pairing for .tar.gz archives. |

---

## Sources

- [docs.rs/uuid/latest](https://docs.rs/uuid/latest/uuid/) — uuid 1.21.0, v4 feature, rand 0.9 backend confirmed — HIGH confidence
- [docs.rs/ureq/latest](https://docs.rs/ureq/latest/ureq/) — ureq 3.2.0, Agent pooling, Body streaming API confirmed — HIGH confidence
- [docs.rs/ureq/latest/ureq/struct.Body.html](https://docs.rs/ureq/latest/ureq/struct.Body.html) — `into_reader()`, `as_reader()`, `with_config().limit()` API — HIGH confidence
- [crates.io/crates/chrono](https://crates.io/crates/chrono) — chrono 0.4.42, 392M downloads, multi-thread soundness fix in 0.4.20+ — HIGH confidence
- [tokio.rs/blog/2025-01-01-announcing-axum-0-8-0](https://tokio.rs/blog/2025-01-01-announcing-axum-0-8-0) — axum 0.8.8 latest, Tower integration, tokio-rs maintained — HIGH confidence
- [github.com/RustCrypto/MACs/tree/master/hmac](https://github.com/RustCrypto/MACs/tree/master/hmac) — hmac 0.12 current stable — HIGH confidence
- [github.com/taiki-e/cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov) — cross-platform LLVM coverage, supports cargo test, proc-macros, doc tests — HIGH confidence
- [github.com/rust-lang/crates.io](https://github.com/rust-lang/crates.io) — crates.io uses axum backend — MEDIUM confidence (secondary source)
- Cargo.lock direct inspection — sha2 0.10.9, hmac 0.12.1, base64 0.22.1, ureq 2.12.1 already locked — HIGH confidence

---

*Stack research for: Mesh v14.0 — stdlib crypto/date/encoding, HTTP client, testing framework, package registry*
*Researched: 2026-02-28*
