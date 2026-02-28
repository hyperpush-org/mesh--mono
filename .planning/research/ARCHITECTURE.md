# Architecture Research

**Domain:** Programming language ecosystem — stdlib, HTTP client, test runner, package registry
**Researched:** 2026-02-28
**Confidence:** HIGH (based on direct codebase inspection + verified external sources)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Mesh Compiler Pipeline                          │
│  mesh-lexer → mesh-parser → mesh-typeck → mesh-codegen(MIR) → LLVM IR  │
│                                                                          │
│  builtins.rs           intrinsics.rs          mesh-rt (libmesh_rt.a)    │
│  [type sigs]    →      [LLVM decls]    →      [extern "C" impls]        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                          mesh-rt Crate Layout                            │
│                                                                          │
│  actor/     string.rs    gc.rs     http/          db/         v14 NEW    │
│  ┌───────┐  ┌────────┐  ┌──────┐  ┌──────────┐  ┌───────┐  ┌────────┐  │
│  │sched  │  │string  │  │mark- │  │server.rs │  │pg.rs  │  │crypto  │  │
│  │pcb    │  │concat  │  │sweep │  │client.rs │  │pool.rs│  │date    │  │
│  │coros. │  │new     │  │alloc │  │router.rs │  │orm.rs │  │encode  │  │
│  └───────┘  └────────┘  └──────┘  └──────────┘  └───────┘  └────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                       meshc CLI (v14.0 additions)                        │
│                                                                          │
│  build   fmt   repl   lsp   migrate   deps   [NEW: test]                │
│                                                                          │
│  Dispatches to: mesh-codegen, mesh-fmt, mesh-repl, mesh-lsp,            │
│                 mesh-pkg, [NEW: test_runner.rs module in meshc]          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│              meshpkg Binary + Registry Backend (NEW)                     │
│                                                                          │
│  meshpkg CLI         Registry Server (Axum + Postgres)                  │
│  ┌──────────────┐    ┌──────────────────────────────────────┐           │
│  │ publish      │───▶│ POST /api/packages/{name}/{version}  │           │
│  │ install      │◀───│ GET  /api/packages/{name}            │           │
│  │ search       │◀───│ GET  /api/search?q=...               │           │
│  │ login        │    │ GET  /api/packages/{n}/{v}/download  │           │
│  └──────────────┘    └──────────────────────────────────────┘           │
│                                                                          │
│  mesh.toml + mesh.lock (already in mesh-pkg crate, extended)            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `mesh-rt/src/crypto.rs` | SHA-256/512, HMAC-SHA256/SHA512, UUID v4 as `extern "C"` fns | NEW |
| `mesh-rt/src/date.rs` | Timestamps, parse, format, duration arithmetic as `extern "C"` fns | NEW |
| `mesh-rt/src/encoding.rs` | Base64 encode/decode, hex encode/decode as `extern "C"` fns | NEW |
| `mesh-rt/src/http/client.rs` | Streaming HTTP client, keep-alive agent, builder API | MODIFIED |
| `mesh-codegen/src/codegen/intrinsics.rs` | LLVM extern declarations for all new `mesh_*` symbols | MODIFIED |
| `mesh-typeck/src/builtins.rs` | Type signatures for `Crypto.*`, `Date.*`, `Encoding.*` | MODIFIED |
| `meshc/src/main.rs` | Add `Test` variant to `Commands` enum, dispatch to test runner | MODIFIED |
| `meshc/src/test_runner.rs` | `*.test.mpl` discovery, compile, execute, aggregate results | NEW |
| `mesh-rt/src/test_support.rs` | `mesh_test_assert`, `mesh_test_assert_eq`, `mesh_test_fail` fns | NEW |
| `mesh-pkg/src/manifest.rs` | Add `Dependency::Registry` variant with version field | MODIFIED |
| `mesh-pkg/src/resolver.rs` | Handle Registry variant: fetch tarball from registry URL | MODIFIED |
| `compiler/meshpkg/` | Standalone binary: publish, install, search, login subcommands | NEW CRATE |
| `registry/` | Axum + PostgreSQL HTTP API + tarball storage | NEW APP |
| `website/docs/packages/` | Package browse/search/detail pages in VitePress site | MODIFIED |

---

## Integration Points — New vs. Modified

### 1. Stdlib: Crypto / Date / Encoding

**Where it lives: `mesh-rt` as new modules, NOT new crates.**

All current stdlib (strings, collections, http, db, actor) lives in `mesh-rt/src/`. The crypto deps `sha2`, `hmac`, `md-5`, `base64`, `ring` are already compiled into `mesh-rt/Cargo.toml`. Adding new `extern "C"` functions to `mesh-rt` costs zero additional build time for existing dependencies and follows the established pattern exactly.

**New modules in `mesh-rt/src/`:**

```
mesh-rt/src/
├── crypto.rs     (NEW) — SHA-256, SHA-512, HMAC-SHA256/SHA512, UUID v4
├── date.rs       (NEW) — DateTime as i64 ms, parse/format/arithmetic
├── encoding.rs   (NEW) — base64 encode/decode, hex encode/decode
```

**Dependency additions to `mesh-rt/Cargo.toml`:**

| Dep | Version | For | Status |
|-----|---------|-----|--------|
| `sha2` | 0.10 | SHA-256/512 | Already present |
| `hmac` | 0.12 | HMAC | Already present |
| `base64` | 0.22 | base64 encode/decode | Already present (used as `base64ct` alias) |
| `ring` | 0.17 | UUID random bytes | Already present |
| `rand` | 0.9 | UUID v4 random bytes | Already present |
| `hex` | 0.4 | hex encode/decode | NEW — or implement inline (~10 lines) |
| `chrono` | 0.4 | date/time parsing and formatting | NEW |

**The three-file pattern — mandatory for every new stdlib function:**

Every new Mesh stdlib function requires exactly three files to change: the runtime implementation, the type checker registration, and the LLVM codegen declaration. This is the established pattern for all existing stdlib (verified by inspecting `mesh_http_get`, `mesh_regex_compile`, `mesh_iter_map`, etc.).

```
mesh-rt/src/crypto.rs          → implements  mesh_crypto_sha256(data: *const MeshString) -> *mut MeshString
mesh-typeck/src/builtins.rs    → registers   Crypto.sha256 :: (String) -> String
mesh-codegen/intrinsics.rs     → declares    LLVM extern fn mesh_crypto_sha256(ptr) -> ptr
```

**ABI design for crypto functions (HIGH confidence):**

```rust
// mesh-rt/src/crypto.rs

#[no_mangle]
pub extern "C" fn mesh_crypto_sha256(s: *const MeshString) -> *mut MeshString {
    use sha2::{Sha256, Digest};
    let input = unsafe { (*s).as_str() };
    let hash = format!("{:x}", Sha256::digest(input.as_bytes()));
    unsafe { mesh_string_new(hash.as_ptr(), hash.len() as u64) }
}

#[no_mangle]
pub extern "C" fn mesh_crypto_sha512(s: *const MeshString) -> *mut MeshString { ... }

#[no_mangle]
pub extern "C" fn mesh_crypto_hmac_sha256(
    key: *const MeshString,
    data: *const MeshString,
) -> *mut MeshString { ... }

#[no_mangle]
pub extern "C" fn mesh_crypto_uuid_v4() -> *mut MeshString {
    // Uses rand (already in Cargo.toml) to generate 16 random bytes
    // Formats as lowercase UUID string: "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
}
```

**ABI design for date functions:**

`DateTime` should NOT be an opaque heap handle. The simpler, more ergonomic design: represent all timestamps as `i64` milliseconds since Unix epoch. This avoids introducing a new opaque type (which would require new type machinery in mesh-typeck and mesh-codegen) and is consistent with how JavaScript, Java, and Python expose epoch-based timestamps.

```rust
// mesh-rt/src/date.rs

#[no_mangle]
pub extern "C" fn mesh_date_now() -> i64
    // returns Unix ms as Mesh Int

#[no_mangle]
pub extern "C" fn mesh_date_parse(s: *const MeshString) -> *mut u8
    // Returns Result<Int, String> — parses ISO 8601 string → Unix ms

#[no_mangle]
pub extern "C" fn mesh_date_format(ts_ms: i64, fmt: *const MeshString) -> *mut MeshString
    // Formats Unix ms as string using format specifier

#[no_mangle]
pub extern "C" fn mesh_date_add_ms(ts_ms: i64, delta_ms: i64) -> i64
    // Returns ts_ms + delta_ms (trivial arithmetic, but named for clarity)

#[no_mangle]
pub extern "C" fn mesh_date_diff_ms(a_ms: i64, b_ms: i64) -> i64
    // Returns a_ms - b_ms
```

Mesh API surface: `Date.now() -> Int`, `Date.parse(s) -> Int!String`, `Date.format(ts, fmt) -> String`, `Date.add(ts, delta) -> Int`, `Date.diff(a, b) -> Int`.

---

### 2. HTTP Client: Streaming / Keep-Alive / Builder API

**Where it lives: `mesh-rt/src/http/client.rs` — MODIFY existing file.**

**Current state (verified):** `mesh_http_get(url)` and `mesh_http_post(url, body)` use `ureq = "2"`. Both call `response.into_string()` which buffers the entire body. No streaming, no keep-alive, no custom headers.

**ureq v2 vs v3 decision:**

The project uses `ureq = "2"`. ureq v3 has a breaking API change: `Response` is replaced by `http::Response<Body>`, and `body_mut().as_reader()` replaces `into_reader()`. The key improvements in v3 relevant to v14.0:

- `Body: Send` — streaming body readable on another thread (important for actor model)
- `Body::with_config().limit(n)` — explicit size limits for safety
- Standard `http` crate types — consistent with broader Rust HTTP ecosystem

**Recommendation: upgrade to `ureq = "3"` when implementing streaming.** The API change is confined entirely to `client.rs` (one file). The upgrade provides the `Body: Send` guarantee needed for streaming in the actor model.

**Streaming architecture — opaque handle pattern:**

HTTP streams are stateful resources. They follow the same opaque `u64` handle pattern used by DB connections, pools, and regex (verified in codebase):

```rust
// mesh-rt/src/http/client.rs

use std::collections::HashMap;
use std::sync::Mutex;
use std::io::Read;

static STREAMS: Mutex<HashMap<u64, Box<dyn Read + Send>>> = Mutex::new(HashMap::new());
static NEXT_STREAM_ID: std::sync::atomic::AtomicU64 = ...;

#[no_mangle]
pub extern "C" fn mesh_http_stream_get(url: *const MeshString) -> *mut u8 {
    // ureq v3: response.into_parts().1.into_reader() — Body: Send
    // Stores Box<dyn Read + Send> in STREAMS map, returns Result<handle_u64, error_string>
}

#[no_mangle]
pub extern "C" fn mesh_http_read_chunk(handle: u64, max_bytes: i64) -> *mut u8 {
    // Reads up to max_bytes from stored stream
    // Returns Result<Option<String>, String>
    // Option::None signals EOF (0 bytes read)
}

#[no_mangle]
pub extern "C" fn mesh_http_close_stream(handle: u64) -> () {
    // Removes stream from STREAMS map, drops the reader (closes TCP conn)
}
```

**Actor model integration for streaming (HIGH confidence):**

Actor I/O is already blocking — PG queries, HTTP server I/O, and WebSocket sends all block inside actors. Blocking `mesh_http_read_chunk()` is the same model. The actor calls `HTTP.read_chunk(stream, 4096)` in a loop; each call blocks briefly until data arrives. This is Pattern A (simple, recommended).

Pattern B (spawn a reader actor to push chunks) is unnecessarily complex for pull-based streaming. The existing WebSocket reader thread exists because WS frames arrive asynchronously and must be pushed. HTTP streaming is pull-based.

**Keep-alive — ureq Agent:**

ureq v2/v3 both have an `Agent` type that maintains a connection pool with keep-alive. The agent is stored as a leaked `Box<ureq::Agent>` behind a `u64` handle, same pattern as DB pools:

```rust
#[no_mangle]
pub extern "C" fn mesh_http_build_client(/* config params */) -> u64 {
    // Creates ureq::AgentBuilder, stores Box<Agent> as opaque u64 handle
}

#[no_mangle]
pub extern "C" fn mesh_http_client_get(client: u64, url: *const MeshString) -> *mut u8 {
    // Uses stored Agent to make GET request with connection reuse
}

#[no_mangle]
pub extern "C" fn mesh_http_client_post(
    client: u64,
    url: *const MeshString,
    body: *const MeshString
) -> *mut u8 { ... }
```

**Fluent builder API:**

Rather than a mutable builder object (which would require another opaque handle), use function composition with a `RequestConfig` struct passed by value:

```
# Mesh API:
let response = HTTP.new_request(:post, url)
  |> HTTP.set_header("Authorization", "Bearer " <> token)
  |> HTTP.set_header("Content-Type", "application/json")
  |> HTTP.set_timeout(5000)
  |> HTTP.set_body(json_body)
  |> HTTP.send()
```

This maps to a `MeshRequestConfig` struct in the runtime (header list + timeout + body), passed by pointer. No opaque handle needed — the struct is stack-allocated in the Mesh caller and passed to `mesh_http_send`.

---

### 3. Testing Framework: `meshc test` Runner

**Where it lives: New `test_runner.rs` module in the `meshc` binary crate.**

The `migrate` subcommand is already implemented as `meshc/src/migrate.rs` — a module within the binary crate, not a separate library. The test runner follows the same pattern. It uses the existing `build()` function from `meshc/src/main.rs` and needs no new library crate.

**New Commands variant in `meshc/src/main.rs`:**

```rust
Test {
    /// Project directory (default: current directory)
    #[arg(default_value = ".")]
    dir: PathBuf,

    /// Run only tests whose filename matches this pattern
    #[arg(long)]
    filter: Option<String>,

    /// Keep compiled test binaries after running
    #[arg(long)]
    keep_artifacts: bool,
}
```

**File discovery:**

```rust
// meshc/src/test_runner.rs
fn discover_test_files(dir: &Path, filter: Option<&str>) -> Vec<PathBuf> {
    // Reuses collect_mesh_files_recursive from main.rs
    // Filters: file.extension() == "mpl" AND file.stem() ends with ".test"
    // i.e., matches *.test.mpl
    // Applies optional name filter substring match
}
```

**Execution model — test file = complete Mesh program:**

Each `*.test.mpl` is a complete Mesh program with a `main` function that calls test functions in sequence. If any assertion fails, `mesh_panic()` causes a non-zero exit. The test runner compiles and executes each file independently:

```
meshc test ./my-project
    ↓
discover all *.test.mpl files in project dir
    ↓
for each test_file:
    tmpdir = mktemp
    build(test_file_parent_dir, opt=0, output=Some(tmpdir/test_binary))
        (reuses existing build() pipeline — same parse/typecheck/codegen)
    ↓
    result = Command::new(tmpdir/test_binary).status()
    collect: (file_name, exit_code, elapsed)
    ↓
aggregate: count pass/fail
print summary: "5 passed, 1 failed"
exit(if any_failed { 1 } else { 0 })
```

**Why not function-level test discovery (like `cargo test`):**

The more sophisticated approach — parse test files, discover `test_` prefix functions, generate a runner `main` — requires the test runner to generate new Mesh source code and compile it. This duplicates parser/typechecker functionality and adds significant complexity. The "test file is a program" model is simpler, matches Go's original `_test.go` approach, and can be delivered in v14.0. Function-level discovery can be added in a future milestone.

**Assertion helpers — three-file pattern:**

```rust
// mesh-rt/src/test_support.rs

#[no_mangle]
pub extern "C" fn mesh_test_assert(condition: i8, msg: *const MeshString) {
    if condition == 0 {
        // Print "assertion failed: <msg>" then call mesh_panic()
    }
}

#[no_mangle]
pub extern "C" fn mesh_test_assert_eq(
    a: *const MeshString,
    b: *const MeshString,
    label: *const MeshString,
) {
    // String equality check; panic with "expected X, got Y" if not equal
}

#[no_mangle]
pub extern "C" fn mesh_test_fail(msg: *const MeshString) {
    // Unconditional panic with message
}
```

Mesh surface: `Test.assert(bool)`, `Test.assert_eq(a, b)`, `Test.fail(msg)`.

`assert_raises` (run closure, assert it panics) is more complex — defer to a later phase or implement via `catch_unwind` in the runtime (already used for actor crash isolation).

**Mock actors:**

In the actor model, "mocking" means replacing a named registered process with a test double. The pattern is documentable without new language features:

```mesh
# In test file: start a mock actor, register under expected name
let mock_pid = spawn do
  receive do
    {:get_user, id, reply_pid} -> send(reply_pid, {:ok, test_user})
  end
end
Process.register(mock_pid, :user_service)
# Run code under test — it calls named :user_service
# Assert on results
```

This requires no new framework features — it's a usage pattern. Document it in the testing guide.

**Coverage reporting:**

LLVM's coverage instrumentation requires adding `-fprofile-instr-generate -fcoverage-mapping` flags to the LLVM compilation step and running `llvm-profdata merge` + `llvm-cov report` on the resulting data. This is implementable but requires changes to `mesh-codegen/src/link.rs` and a post-execution step in the test runner. Mark as stretch goal for v14.0; defer if time is limited.

---

### 4. Package Registry: mesh.toml, meshpkg CLI, Hosted Backend

**mesh.toml current state (HIGH confidence from codebase inspection):**

The `mesh-pkg` crate already has:
- `Manifest` struct: `package` (name/version/description/authors) + `dependencies: BTreeMap<String, Dependency>`
- `Dependency` enum: `Git { git, rev, branch, tag }` and `Path { path }`
- `Lockfile` with `LockedPackage { name, source, revision }`
- DFS resolver with diamond detection and cycle detection
- git2-based clone/fetch for Git dependencies

v14.0 adds a `Registry` variant to `Dependency`:

```rust
// mesh-pkg/src/manifest.rs — MODIFIED

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Dependency {
    Git { git: String, rev: Option<String>, branch: Option<String>, tag: Option<String> },
    Path { path: String },
    Registry { version: String },  // NEW — uses default registry or package-level override
}
```

Full `mesh.toml` format with registry dep:

```toml
[package]
name = "my-app"
version = "1.0.0"
description = "An example Mesh application"
authors = ["Alice <alice@example.com>"]

[dependencies]
# Registry dependency (NEW for v14.0)
crypto-utils = { version = "1.2.0" }

# Existing forms unchanged
local-lib    = { path = "../local-lib" }
github-lib   = { git = "https://github.com/example/lib.git", tag = "v2.0" }
```

**IMPORTANT: Exact versions only (no SemVer ranges).** Version ranges require a SemVer SAT solver — a multi-week project. Require exact versions (`"1.2.0"`) in v14.0. The lockfile already provides reproducibility. Ranges can be a future milestone feature.

**meshpkg binary — new crate at `compiler/meshpkg/`:**

```
compiler/
└── meshpkg/
    ├── Cargo.toml         — depends on mesh-pkg, reqwest/ureq for HTTP, tar, flate2
    └── src/
        └── main.rs        — publish, install, search, login, logout subcommands
```

This is a *separate binary from `meshc`*. Rationale: `meshc` is the compiler (build, test, format, migrate). `meshpkg` is the ecosystem tool (publish, install, search). Separation mirrors Go's `go` vs. package tools and keeps each binary focused.

**meshpkg commands:**

```
meshpkg publish             Pack mesh.toml + src/ into .tar.gz, upload to registry
meshpkg install [pkg@ver]   Download tarball, unpack to .mesh/deps/<pkg>/
meshpkg search <query>      Query registry search API, print results table
meshpkg login               Store API token to ~/.mesh/credentials
meshpkg logout              Remove stored token
meshpkg list                List installed packages from mesh.lock
```

**Package format:**

A Mesh package is a `.tar.gz` tarball containing:
- `mesh.toml` at root
- `*.mpl` source files (preserving directory structure)
- `README.md` (optional)
- No compiled artifacts, no `.mesh/` directory

Content-addressed by SHA-256 of the tarball. Registry identifies packages as `{name}@{version}`.

**Registry server stack (MEDIUM confidence — verified via web search):**

The registry is a separate HTTP service. It does NOT need to be a Mesh application (and using Mesh would be premature/risky for critical infrastructure). Recommended stack:

| Layer | Technology | Why |
|-------|------------|-----|
| HTTP framework | Axum 0.7 | Thin over hyper, Tower middleware, rustls-compatible, proven in 2025 ecosystem |
| Database | PostgreSQL | Already the production DB for Mesher; familiar wire protocol; already in use |
| ORM | sea-orm 1.x or sqlx | Standard Axum ecosystem; sea-orm 1.x stable; sqlx is simpler if schema is small |
| Auth | API key (HMAC-SHA256) | ring is already a dependency in mesh-rt; simple bearer token model |
| Tarball storage | Local filesystem to start | `/data/packages/{name}/{version}.tar.gz`; abstract behind `StorageBackend` trait for future S3/R2 |
| TLS | rustls (already in codebase) | Consistent with rest of Mesh infrastructure |

**Registry API surface (minimal v14.0):**

```
GET  /api/packages                       → paginated package list
GET  /api/packages/{name}                → package metadata + all versions
GET  /api/packages/{name}/{version}      → specific version: metadata + README
GET  /api/packages/{name}/{version}/download  → tarball download
POST /api/packages/{name}/{version}      → publish (requires Bearer token)
GET  /api/search?q={query}&page={n}      → search by name/description
POST /api/auth/token                     → exchange credentials for API token
```

**Registry database schema (minimal):**

```sql
CREATE TABLE packages (
    name       TEXT NOT NULL,
    version    TEXT NOT NULL,
    description TEXT,
    authors    TEXT[],
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum   TEXT NOT NULL,     -- SHA-256 of tarball
    tarball_path TEXT NOT NULL,   -- filesystem path
    readme     TEXT,
    PRIMARY KEY (name, version)
);

CREATE TABLE api_tokens (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash TEXT NOT NULL,    -- HMAC-SHA256 of token
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Registry website integration:**

The existing VitePress website at `website/` gets new pages under `website/docs/packages/`:

```
/packages                  → browse all packages (client-side fetch from registry API)
/packages/{name}           → package detail: README, versions, install snippet
/search?q=...              → search results
```

These pages can be client-side rendered (Vue components fetching from the registry API) to avoid requiring the registry to be running at VitePress build time. This is simpler for v14.0.

---

## Recommended File Structure Changes

```
compiler/
├── mesh-rt/src/
│   ├── crypto.rs          (NEW) — SHA-256/512, HMAC, UUID, exported as mesh_crypto_*
│   ├── date.rs            (NEW) — Date/time operations, exported as mesh_date_*
│   ├── encoding.rs        (NEW) — base64/hex, exported as mesh_encoding_*
│   ├── test_support.rs    (NEW) — Test.assert/assert_eq/fail, exported as mesh_test_*
│   ├── http/
│   │   └── client.rs      (MODIFIED) — streaming, keep-alive, builder API; ureq → v3
│   └── lib.rs             (MODIFIED) — pub mod crypto; date; encoding; test_support; re-exports
├── mesh-typeck/src/
│   └── builtins.rs        (MODIFIED) — Crypto.*, Date.*, Encoding.*, Test.* type sigs
├── mesh-codegen/src/codegen/
│   └── intrinsics.rs      (MODIFIED) — LLVM extern decls for all new mesh_* symbols
├── mesh-pkg/src/
│   ├── manifest.rs        (MODIFIED) — add Dependency::Registry { version } variant
│   └── resolver.rs        (MODIFIED) — handle Registry variant: fetch tarball from registry URL
│   └── publish.rs         (NEW) — pack tarball, upload to registry
├── meshc/src/
│   ├── main.rs            (MODIFIED) — add Commands::Test variant
│   └── test_runner.rs     (NEW) — *.test.mpl discovery, compile, execute, report
└── meshpkg/               (NEW binary crate)
    ├── Cargo.toml
    └── src/
        └── main.rs        — publish, install, search, login, logout

registry/                  (NEW — top-level, outside compiler/)
├── Cargo.toml             — axum, sea-orm or sqlx, tokio, serde, ring, tar, flate2
└── src/
    ├── main.rs
    ├── routes/
    │   ├── packages.rs
    │   ├── search.rs
    │   └── auth.rs
    ├── storage.rs         — StorageBackend trait + FilesystemStorage impl
    └── db.rs

website/docs/
└── packages/              (NEW) — browse, search, detail pages (Vue + client-side fetch)
```

---

## Architectural Patterns

### Pattern 1: Three-File Stdlib Expansion

**What:** Every new Mesh stdlib function requires changes to exactly three files: `mesh-rt/src/<module>.rs` (implementation), `mesh-typeck/src/builtins.rs` (type signature registration), `mesh-codegen/src/codegen/intrinsics.rs` (LLVM extern declaration).

**When to use:** All new `Crypto.*`, `Date.*`, `Encoding.*`, `Test.*`, HTTP client functions. Non-negotiable — this is how every existing stdlib function works.

**Trade-offs:** Repetitive but enforces consistency. Missing any one of the three causes either a compile-time type error (typeck missing) or a linker error (rt missing). The pattern makes additions predictable and reviewable.

**Example (adding `Crypto.sha256`):**

```rust
// File 1: mesh-rt/src/crypto.rs
#[no_mangle]
pub extern "C" fn mesh_crypto_sha256(s: *const MeshString) -> *mut MeshString {
    use sha2::{Sha256, Digest};
    let input = unsafe { (*s).as_str() };
    let hash = format!("{:x}", Sha256::digest(input.as_bytes()));
    unsafe { mesh_string_new(hash.as_ptr(), hash.len() as u64) }
}
```

```rust
// File 2: mesh-typeck/src/builtins.rs (inside register_builtins)
env.define("crypto_sha256", Scheme::simple(
    Ty::fun(vec![Ty::string()], Ty::string())
));
```

```rust
// File 3: mesh-codegen/src/codegen/intrinsics.rs (inside declare_intrinsics)
module.add_function(
    "mesh_crypto_sha256",
    ptr_type.fn_type(&[ptr_type.into()], false),
    Some(inkwell::module::Linkage::External),
);
```

### Pattern 2: Opaque Handle for Stateful Resources

**What:** Stateful resources (DB connections, pools, streams, regexes) are stored behind a `Box<T>` leaked into a `u64` handle. The handle is opaque from Mesh's perspective (`u64` → `Int` in the type system). Operations take the handle as first argument.

**When to use:** HTTP streaming (stream handle), HTTP keep-alive client (agent handle). NOT for date/time (use `i64` directly).

**Trade-offs:** Simple to implement, GC-safe. Downside: no type safety at Mesh level. All DB connections and pools use this pattern — it is battle-tested in the codebase.

### Pattern 3: Subcommand as Module in meshc

**What:** New `meshc` subcommands are implemented as `src/subcommand_name.rs` modules within the `meshc` binary crate. Not as separate library crates.

**When to use:** `meshc test`, and any future subcommands.

**Trade-offs:** Simple. The test runner is ~200-400 lines, does not need its own crate. The `migrate.rs` module in `meshc` is the established model.

---

## Data Flow

### `meshc test` Execution Flow

```
meshc test ./my-project
    ↓
test_runner::discover_test_files(dir, filter)
    walks dir recursively, collects *.test.mpl paths
    ↓
for each test_file in discovered:
    tmpdir = tempfile::TempDir::new()
    build(test_file_parent_dir, opt=0, output=Some(tmpdir.path().join("test_bin")))
        → same build() function used by meshc build
        → parse → typecheck → MIR → LLVM → native binary
    ↓
    let output = Command::new(tmpdir/test_bin).output()
    result = TestResult { file, exit_code, stdout, stderr, duration }
    ↓
print_test_summary(results):
    "test/user.test.mpl ... ok"
    "test/auth.test.mpl ... FAILED (exit 1)"
    stdout/stderr of failed tests
    "5 passed, 1 failed" / exit(1) if any failed
```

### Crypto/Encoding Call Flow

```
Mesh source:  Crypto.sha256(my_string)
    ↓
mesh-typeck:  resolves "crypto_sha256" → Ty::Fun([String], String)
    ↓
mesh-codegen MIR:  lower to Call { callee: "mesh_crypto_sha256", args: [string_val] }
    ↓
mesh-codegen LLVM: call ptr @mesh_crypto_sha256(ptr %str)
    ↓
runtime:  mesh_crypto_sha256() in mesh-rt/src/crypto.rs
    sha2::Sha256::digest(input_bytes)
    hex-encode → mesh_string_new(hex_bytes, len) → GC-managed MeshString ptr
    ↓
return value to Mesh caller
```

### Package Publish Flow

```
meshpkg publish (in project root with mesh.toml)
    ↓
read + validate mesh.toml
    ↓
pack: tar::Builder → gzip → .tar.gz
    include: mesh.toml, **/*.mpl, README.md
    exclude: .mesh/, compiled binaries
    ↓
sha256 = sha2::Sha256::digest(tarball_bytes)
    ↓
read ~/.mesh/credentials → API token
    ↓
POST /api/packages/{name}/{version}
    Content-Type: multipart/form-data
    Authorization: Bearer {token}
    body: { tarball, checksum, metadata }
    ↓
registry server:
    verify token
    check version not already published (immutable)
    parse + validate mesh.toml from tarball
    write tarball to /data/packages/{name}/{version}.tar.gz
    insert packages row
    ↓
200 OK: "Published {name}@{version}"
```

---

## Suggested Build Order

Dependencies drive the order. Items with no dependencies on each other can be built in parallel.

| Step | Feature | Depends On | Rationale |
|------|---------|------------|-----------|
| 1 | Encoding stdlib (base64, hex) | Nothing | Simplest, validates three-file pattern |
| 2 | Crypto stdlib (SHA/HMAC/UUID) | Step 1 pattern | Deps already present |
| 3 | Date stdlib (timestamps, format) | Nothing | Needs chrono dep added |
| 4 | HTTP streaming (ureq v3 upgrade) | Nothing | Isolated to client.rs |
| 5 | HTTP keep-alive + builder API | Step 4 | Builds on streaming infrastructure |
| 6 | Test assertion helpers (Test.assert etc) | Nothing | Three-file pattern |
| 7 | `meshc test` runner | Step 6 | Needs assertion helpers in rt |
| 8 | mesh.toml Registry dep variant | Nothing | Extends manifest.rs/resolver.rs |
| 9 | meshpkg CLI binary | Step 8 | Needs mesh-pkg registry support |
| 10 | Registry server (Axum + PG) | Step 8 API contract | Independent of compiler changes |
| 11 | Registry website pages | Step 10 | Needs registry API |

**Parallelization:** Steps 1-5 (stdlib + HTTP) are independent of steps 6-7 (test runner). Steps 8-11 (registry) are independent of all compiler/runtime work and can be built in parallel by a separate effort.

---

## Anti-Patterns

### Anti-Pattern 1: New Crates for Stdlib Modules

**What people do:** Create `mesh-crypto`, `mesh-date`, `mesh-encoding` as separate Rust crates.

**Why it's wrong:** All stdlib compiles into `libmesh_rt.a` which is statically linked into every Mesh binary. Separate crates either (a) get merged into `libmesh_rt.a` via re-exports anyway — adding build complexity with no benefit — or (b) become separate static libs, requiring linker changes in `mesh-codegen/src/link.rs`. Neither is justified for the scale of these additions.

**Do this instead:** Add modules directly to `mesh-rt/src/` and `pub mod` them from `lib.rs`. This is identical to how `regex.rs`, `json.rs`, `iter.rs` were added in prior milestones.

### Anti-Pattern 2: Streaming via Dedicated OS Thread per Request

**What people do:** Spawn an OS thread for each HTTP stream (analogous to WebSocket's reader thread).

**Why it's wrong:** WebSocket's reader thread exists because WS frames arrive asynchronously and must be pushed into the actor mailbox. HTTP streaming is pull-based — the actor requests chunks when ready. Spawning OS threads for pull-based streaming adds unnecessary complexity and overhead.

**Do this instead:** Blocking `mesh_http_read_chunk()` called directly inside the actor. Accepted pattern since DB queries, HTTP server I/O, and WS sends already block inside actors.

### Anti-Pattern 3: Test Files Without a `main` Function

**What people do:** Design test files as collections of annotated functions without an entry point, requiring the runner to generate a main.

**Why it's wrong:** Generating a main requires the test runner to parse Mesh syntax, extract function names, synthesize new Mesh code, and compile the generated code. This is significant complexity duplicating parser/typechecker work.

**Do this instead:** Each `*.test.mpl` is a complete Mesh program with a `main` that calls test functions. The runner compiles and executes — nothing more. This is the established model for Go test files before `testing.T` was mature.

### Anti-Pattern 4: SemVer Range Resolution in registry deps

**What people do:** Allow `"^1.0"` or `">=2.0"` in mesh.toml registry dependencies.

**Why it's wrong:** SemVer constraint solving (similar to Cargo's resolver) is a multi-week project. Cargo's own resolver took years to stabilize. For v14.0, this is out of scope.

**Do this instead:** Require exact versions: `version = "1.2.0"`. The lockfile already guarantees reproducibility. Add ranges in a future milestone.

### Anti-Pattern 5: DateTime as Opaque Handle

**What people do:** Represent `DateTime` as an opaque heap-allocated struct behind a `u64` handle.

**Why it's wrong:** Requires new type machinery in mesh-typeck (new opaque `DateTime` type), new codegen handling, and forces users to interact with a resource that has no GC collection (requires explicit `Date.free(dt)` or leaks). Timestamps are naturally numeric values.

**Do this instead:** Represent timestamps as `i64` Unix milliseconds. Arithmetic is trivial (`Date.add(ts, delta) -> Int`), formatting is a string operation, and no new type machinery is needed. JavaScript, Go, and Python's standard libraries all use this pattern.

---

## Integration Points Summary

| Feature | Files Modified | Files Added | New Rust Deps |
|---------|---------------|-------------|---------------|
| Encoding stdlib | `mesh-rt/lib.rs`, `builtins.rs`, `intrinsics.rs` | `mesh-rt/src/encoding.rs` | `hex = "0.4"` (optional) |
| Crypto stdlib | `mesh-rt/lib.rs`, `builtins.rs`, `intrinsics.rs` | `mesh-rt/src/crypto.rs` | none (sha2/hmac/ring/rand already present) |
| Date stdlib | `mesh-rt/lib.rs`, `builtins.rs`, `intrinsics.rs`, `mesh-rt/Cargo.toml` | `mesh-rt/src/date.rs` | `chrono = "0.4"` |
| HTTP streaming | `mesh-rt/http/client.rs`, `mesh-rt/Cargo.toml`, `builtins.rs`, `intrinsics.rs` | — | ureq upgrade `"2"` → `"3"` |
| HTTP keep-alive + builder | `mesh-rt/http/client.rs`, `builtins.rs`, `intrinsics.rs` | — | (same ureq upgrade) |
| Test assertions | `mesh-rt/lib.rs`, `builtins.rs`, `intrinsics.rs` | `mesh-rt/src/test_support.rs` | — |
| `meshc test` runner | `meshc/src/main.rs` | `meshc/src/test_runner.rs` | — |
| mesh.toml Registry variant | `mesh-pkg/src/manifest.rs`, `mesh-pkg/src/resolver.rs` | `mesh-pkg/src/publish.rs` | reqwest or ureq (for HTTP downloads) |
| meshpkg CLI | — | `compiler/meshpkg/` (new binary crate) | (inherits from mesh-pkg) |
| Registry server | — | `registry/` (new workspace member) | axum 0.7, sea-orm 1.x, tokio, serde_json, ring, tar, flate2 |
| Registry website | — | `website/docs/packages/` (Vue pages) | — |

---

## Sources

- Codebase: `compiler/mesh-rt/src/lib.rs` — all stdlib modules and re-exports (direct inspection)
- Codebase: `compiler/mesh-rt/Cargo.toml` — confirmed sha2/hmac/md-5/base64/ring already present
- Codebase: `compiler/mesh-rt/src/http/client.rs` — current mesh_http_get/post implementation using ureq 2
- Codebase: `compiler/mesh-codegen/src/codegen/intrinsics.rs` — LLVM extern declaration pattern
- Codebase: `compiler/mesh-typeck/src/builtins.rs` — type registration pattern for stdlib functions
- Codebase: `compiler/meshc/src/main.rs` + `migrate.rs` — subcommand-as-module pattern
- Codebase: `compiler/mesh-pkg/src/manifest.rs` + `resolver.rs` — existing mesh.toml format and resolver
- [ureq 2.x Response docs](https://docs.rs/ureq/2.3.0/ureq/struct.Response.html) — `into_reader()` for streaming
- [ureq 3.x Body docs](https://docs.rs/ureq/latest/ureq/struct.Body.html) — `body_mut().as_reader()`, `Body: Send`
- [ureq CHANGELOG](https://docs.rs/crate/ureq/latest/source/CHANGELOG.md) — v2→v3 API changes confirmed
- [axum crates.io](https://crates.io/crates/axum) — registry server web framework
- [sea-orm GitHub](https://github.com/SeaQL/sea-orm) — async ORM for registry server (1.x stable)

---

*Architecture research for: Mesh v14.0 Ecosystem (stdlib, HTTP client, testing, package registry)*
*Researched: 2026-02-28*
