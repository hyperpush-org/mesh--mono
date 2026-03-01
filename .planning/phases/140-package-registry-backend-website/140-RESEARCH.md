# Phase 140: Package Registry Backend & Website - Research

**Researched:** 2026-02-28
**Domain:** Rust Axum 0.8 REST API + PostgreSQL + Cloudflare R2 + VitePress package registry
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Auth & token model
- Authentication via **GitHub OAuth only** — no email/password or magic links
- Web dashboard where logged-in developers create and manage their own publish tokens
- Tokens are **account-scoped**: one token can publish any package under the holder's GitHub namespace
- Package names are **namespaced by GitHub user/org**: `username/package-name` (e.g., `sn0w/mesh-json`)
- Namespace ownership enforced by GitHub identity — no name squatting across accounts

#### Tarball storage
- Store tarballs in **Cloudflare R2** (S3-compatible object storage)
- **No local filesystem fallback** — always use R2/S3-compatible API; dev environment uses MinIO
- SHA-256 content addressing: hash is the R2 object key
- **Content deduplication**: if SHA-256 already exists in R2, skip the upload; DB records still created per name+version but blobs are shared
- **Registry API proxies downloads**: `GET /packages/{name}/{version}/download` streams from R2 — no direct R2 URL exposure to clients

#### Website browse & search
- **Featured + list hybrid** landing/browse page: top section shows highest-download-count packages as featured cards, remainder shown as a list below
- Search is **server-side API, same page**: search box on browse page calls `GET /search?q=...`, results replace current listing without page reload
- Search matches against **package name + description** (PostgreSQL full-text search via tsvector)

#### Per-package page
- **Metadata card at top, README below**: structured metadata card dominates the header, README content scrolls below
- Metadata card contains (all four):
  - Install command (prominent, copy-to-clipboard): `meshpkg install name@version`
  - Latest version badge + download count (total)
  - Version history link/summary
  - Author / GitHub username linking to their GitHub profile
- **Version history**: expandable list section on the same page — all versions with publish date and size; clicking a version shows its install command
- **README rendering**: standard markdown via VitePress/markdown-it — no custom extensions needed for v1

### Claude's Discretion
- Exact PostgreSQL schema design and index strategy for full-text search
- R2 bucket structure and key naming convention
- Token hashing/storage approach (bcrypt vs SHA-256 of raw token)
- VitePress theme/layout component structure
- Download count tracking granularity (per-version vs total only in DB)
- Error page designs and empty state illustrations
- Pagination strategy for the package list (cursor vs offset)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REG-01 | Registry accepts package publications via authenticated HTTP API with SHA-256 content addressing and rejects duplicate version uploads | Axum 0.8 binary body handler, Bearer token middleware, sqlx INSERT + 409 conflict pattern, R2 put_object with SHA-256 key |
| REG-02 | User can browse all published packages on the hosted site listed by recency and/or popularity | VitePress Vue component with runtime fetch to `/api/v1/packages`, featured+list hybrid layout using existing Tailwind/reka-ui stack |
| REG-03 | User can search the hosted site for packages by name or keyword with relevant results | PostgreSQL tsvector GIN index on name+description, `GET /api/v1/search?q=` endpoint, Vue search box triggering API call |
| REG-04 | User can view a per-package page with rendered README, version history, and the install command | VitePress dynamic routing (client-only pattern), Vue component fetching `/api/v1/packages/{name}` with markdown-it rendering |
</phase_requirements>

---

## Summary

Phase 140 builds a hosted package registry (Axum 0.8 + PostgreSQL + Cloudflare R2) and a browsable website extension of the existing VitePress site. The registry backend is a new Rust workspace crate `mesh-registry` that exposes a REST API compatible with the `meshpkg` CLI contract established in Phase 139. The website extension adds three new views (browse/search, per-package) to the existing website under `website/docs/packages/` using the project's established Vue 3 + Tailwind + reka-ui stack.

The most critical constraints are: (1) the API contract is already locked by Phase 139's CLI code — the backend MUST implement exactly those endpoints; (2) R2/MinIO storage with no filesystem fallback, using SHA-256 as the object key for deduplication; (3) GitHub OAuth is the only auth path, with session-backed web dashboard for token management. The backend uses tokio for async, sqlx 0.8 for PostgreSQL with compile-time checked queries, and `aws-sdk-s3` to talk to R2/MinIO via the S3 API.

The VitePress website integration presents a specific architectural decision: VitePress is primarily a static-site generator with limited runtime dynamic routing. The package browse/search page and per-package pages need to fetch live data from the registry API. The correct pattern is to add a dedicated packages section with Vue `<ClientOnly>` components that call the registry API at runtime, rather than attempting build-time data loading (which would bake in stale package data). The existing website already uses Vue 3 composition API, Tailwind CSS 4, and reka-ui — the packages pages should follow exactly these patterns.

**Primary recommendation:** Build `mesh-registry` as a new workspace crate using Axum 0.8 + sqlx 0.8 + `aws-sdk-s3` for R2. Add packages pages to the existing `website/` VitePress site using `<ClientOnly>` Vue components for runtime API fetching. Use `oauth2` crate + `tower-sessions` for GitHub OAuth. Hash publish tokens with `argon2` (PHC string format). Use PostgreSQL tsvector + GIN index for full-text search.

---

## API Contract (Locked by Phase 139)

The `meshpkg` CLI establishes these exact endpoints that `mesh-registry` MUST implement:

| Method | Path | Purpose | Notes from CLI source |
|--------|------|---------|----------------------|
| `POST` | `/api/v1/packages` | Publish tarball | Headers: `Authorization: Bearer <token>`, `X-Package-Name`, `X-Package-Version`, `X-Package-SHA256`; body: raw bytes (`application/octet-stream`); returns 200/201 on success, 409 on duplicate, 401 on invalid token |
| `GET` | `/api/v1/packages?search={q}` | Search packages | Returns `[{name, version, description}]` JSON array |
| `GET` | `/api/v1/packages/{name}/{version}` | Version metadata | Returns `{sha256: "..."}` JSON |
| `GET` | `/api/v1/packages/{name}` | Package info (latest) | Returns `{latest: {version: "...", sha256: "..."}}` JSON |
| `GET` | `/api/v1/packages/{name}/{version}/download` | Download tarball | Streams bytes; registry proxies from R2 |

These paths are hardcoded in `compiler/meshpkg/src/install.rs` and `compiler/meshpkg/src/publish.rs` — do not change them.

---

## Standard Stack

### Core (Backend — mesh-registry)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axum | 0.8.x (latest: 0.8.6) | HTTP framework | Already the Tokio/Tower ecosystem standard; 0.8 released Jan 2025 with breaking route syntax `/{param}` |
| tokio | 1.x (workspace) | Async runtime | Already in workspace; axum requires it |
| sqlx | 0.8.x | PostgreSQL async queries | Compile-time checked queries; supports migrations; `migrate!` macro embeds SQL |
| aws-sdk-s3 | latest (≥1.x) | R2/MinIO S3 API | Official Cloudflare-documented approach for R2 with Rust |
| tower-http | 0.6.x | CORS, tracing, compression | Standard axum middleware companion |
| oauth2 | 2.x or 4.x | GitHub OAuth PKCE flow | Used in official axum OAuth examples |
| tower-sessions | latest | Session management | Modern replacement for `async-session`; native axum extractor |
| argon2 | 0.5.x | Token hashing | OWASP #1 recommendation; PHC string format |
| serde / serde_json | 1.x (workspace) | JSON serialization | Already in workspace |
| sha2 | 0.10 (workspace) | SHA-256 verification | Already in workspace |
| uuid | 1.x | Token/ID generation | Standard; v4 random tokens |
| tracing + tracing-subscriber | latest | Structured logging | Tower-native tracing integration |

### Core (Website — packages section)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitepress | 1.6.4 (existing) | SSG + SPA framework | Already used by project website |
| vue | 3.5.28 (existing) | Component framework | Project's existing stack |
| tailwindcss | 4.x (existing) | Styling | Project's existing stack |
| reka-ui | 2.8.0 (existing) | Accessible UI primitives | Project's existing stack |
| @vueuse/core | 14.x (existing) | Vue composables (useFetch, useClipboard) | Project's existing stack |
| markdown-it | via VitePress | README rendering | VitePress's bundled markdown renderer |
| lucide-vue-next | 0.564.0 (existing) | Icons | Project's existing stack |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenvy | 0.15.x | .env loading for dev | Backend dev environment config |
| chrono | 0.4.x | Timestamp handling | `published_at` timestamps in DB |
| tower | 0.5.x | Middleware primitives | Available transitively via axum |
| sqlx-cli | 0.8.x | Migration tool | `cargo install sqlx-cli --features postgres` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| aws-sdk-s3 | rust-s3, object_store | aws-sdk-s3 is Cloudflare's own documented approach; rust-s3 had Send issues in older versions |
| tower-sessions | axum-sessions + async-session | axum-sessions is deprecated, tower-sessions is its documented successor |
| argon2 | bcrypt, SHA-256 of token | Argon2 is OWASP #1; SHA-256 is inappropriate for secrets without KDF; bcrypt is OWASP #3 |
| VitePress `<ClientOnly>` | Nuxt, separate SPA | Reusing existing VitePress site avoids a second deployment; `<ClientOnly>` pattern is well-established |

### Installation (mesh-registry Cargo.toml)

```toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.6", features = ["cors", "trace", "compression-gzip"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono", "migrate"] }
aws-config = "1"
aws-sdk-s3 = "1"
aws-credential-types = "1"
oauth2 = "4"
tower-sessions = { version = "0.14", features = ["postgres-store"] }
argon2 = "0.5"
uuid = { version = "1", features = ["v4"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
chrono = { version = "0.4", features = ["serde"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
dotenvy = "0.15"
```

---

## Architecture Patterns

### Recommended Project Structure

```
registry/
├── Cargo.toml               # workspace member: mesh-registry
├── migrations/
│   ├── 20260228000001_initial.sql      # packages, versions, tokens, users tables
│   └── 20260228000002_fts_index.sql    # tsvector GIN index
├── src/
│   ├── main.rs              # tokio::main, router setup, graceful shutdown
│   ├── config.rs            # AppConfig from env vars (DATABASE_URL, R2_*, GITHUB_CLIENT_*)
│   ├── state.rs             # AppState { pool, s3_client, config }
│   ├── error.rs             # AppError enum → IntoResponse
│   ├── db/
│   │   ├── mod.rs
│   │   ├── packages.rs      # DB queries: insert_version, get_package, search
│   │   └── tokens.rs        # DB queries: create_token, validate_token
│   ├── routes/
│   │   ├── mod.rs           # Router construction
│   │   ├── publish.rs       # POST /api/v1/packages
│   │   ├── download.rs      # GET /api/v1/packages/{name}/{version}/download
│   │   ├── search.rs        # GET /api/v1/packages?search=
│   │   ├── metadata.rs      # GET /api/v1/packages/{name} and /{name}/{version}
│   │   └── auth.rs          # GET /auth/github, /auth/callback, /dashboard, POST /tokens
│   └── storage/
│       ├── mod.rs
│       └── r2.rs            # R2Client wrapper: put_object, get_object, object_exists
```

```
website/docs/packages/
├── index.md                 # layout: page; ClientOnly PackageBrowse component
├── [name].md                # NOT viable — use catch-all or dedicated page
└── .vitepress/theme/components/packages/
    ├── PackageBrowse.vue    # Featured cards + list, search box, API fetch
    ├── PackagePage.vue      # Per-package page: metadata card + README + version list
    ├── PackageCard.vue      # Reusable card for featured packages
    └── PackageList.vue      # Table/list of remaining packages
```

### Pattern 1: Axum 0.8 Route Definitions

**What:** Route path syntax changed in 0.8 from `/:param` to `/{param}`. This affects all path extractors.
**When to use:** All routes in mesh-registry must use the new syntax.

```rust
// Source: https://tokio.rs/blog/2025-01-01-announcing-axum-0-8-0
use axum::{Router, routing::{get, post}};
use std::sync::Arc;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        // API routes
        .route("/api/v1/packages", post(publish::handler).get(search::handler))
        .route("/api/v1/packages/{name}", get(metadata::package_handler))
        .route("/api/v1/packages/{name}/{version}", get(metadata::version_handler))
        .route("/api/v1/packages/{name}/{version}/download", get(download::handler))
        // Auth routes
        .route("/auth/github", get(auth::github_login))
        .route("/auth/callback", get(auth::github_callback))
        .route("/dashboard/tokens", get(auth::list_tokens).post(auth::create_token))
        .with_state(state)
        .layer(cors_layer())
        .layer(TraceLayer::new_for_http())
}
```

### Pattern 2: AppState with Arc

**What:** Share database pool and S3 client across handlers via Axum's State extractor.
**When to use:** Any resource that needs to be shared across concurrent requests.

```rust
// Source: https://docs.rs/axum/latest/axum/
use axum::extract::State;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub s3: aws_sdk_s3::Client,
    pub config: Arc<AppConfig>,
}

async fn handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // use state.pool, state.s3
}
```

### Pattern 3: Publish Handler — Binary Body with Auth

**What:** Accept raw tarball bytes from `meshpkg publish`. Bearer token in Authorization header.
**When to use:** POST /api/v1/packages endpoint.

```rust
// Source: axum docs + Phase 139 CLI source
use axum::{
    extract::{State, Request},
    http::{HeaderMap, StatusCode},
    body::to_bytes,
};

pub async fn handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Result<StatusCode, AppError> {
    // 1. Extract and validate Bearer token
    let token = extract_bearer(&headers)?;
    let owner = state.validate_token(&token).await?;  // github username

    // 2. Extract package metadata from headers (set by meshpkg CLI)
    let name = headers.get("X-Package-Name")...;
    let version = headers.get("X-Package-Version")...;
    let expected_sha256 = headers.get("X-Package-SHA256")...;

    // 3. Validate namespace: name must start with owner/
    if !name.starts_with(&format!("{}/", owner)) {
        return Err(AppError::Forbidden("Name must be owner/package".into()));
    }

    // 4. Read body — set DefaultBodyLimit::max() to e.g. 50MB
    let body_bytes = to_bytes(request.into_body(), 50 * 1024 * 1024).await?;

    // 5. Verify SHA-256
    let actual_sha256 = hex_sha256(&body_bytes);
    if actual_sha256 != expected_sha256 { return Err(AppError::BadRequest(...)); }

    // 6. Check for duplicate version in DB → return 409
    if db::version_exists(&state.pool, name, version).await? {
        return Err(AppError::Conflict("Version already published".into()));
    }

    // 7. Check R2 for existing blob (deduplication) — skip upload if present
    if !state.s3.object_exists(&actual_sha256).await? {
        state.s3.put_object(actual_sha256, &body_bytes).await?;
    }

    // 8. Insert version record in DB
    db::insert_version(&state.pool, name, version, &actual_sha256, owner).await?;

    Ok(StatusCode::CREATED)
}
```

### Pattern 4: Streaming Download from R2

**What:** Proxy tarball bytes from R2 to client without buffering in memory.
**When to use:** GET /api/v1/packages/{name}/{version}/download.

```rust
// Source: https://github.com/tokio-rs/axum/discussions/2000
use axum::body::Body;
use axum::response::Response;
use aws_sdk_s3::primitives::ByteStream;

pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path((name, version)): Path<(String, String)>,
) -> Result<Response, AppError> {
    let sha256 = db::get_version_sha256(&state.pool, &name, &version).await?
        .ok_or(AppError::NotFound)?;

    // Increment download counter
    db::increment_download(&state.pool, &name, &version).await?;

    let s3_resp = state.s3.get_object()
        .bucket(&state.config.r2_bucket)
        .key(&sha256)
        .send()
        .await
        .map_err(|_| AppError::NotFound)?;

    let stream = s3_resp.body.into_async_read();
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(stream));

    Ok(Response::builder()
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", format!("attachment; filename=\"{}-{}.tar.gz\"", name, version))
        .body(body)
        .unwrap())
}
```

### Pattern 5: PostgreSQL Full-Text Search with tsvector

**What:** Server-side package search using PostgreSQL GIN-indexed tsvector column.
**When to use:** GET /api/v1/packages?search=query and GET /api/v1/search?q=query endpoints.

```sql
-- Source: https://www.postgresql.org/docs/current/datatype-textsearch.html
-- Migration: add search_vec column
ALTER TABLE packages ADD COLUMN search_vec tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX idx_packages_search ON packages USING GIN(search_vec);
```

```rust
// Source: https://docs.rs/sqlx/latest/sqlx/ (sqlx query_as! pattern)
pub async fn search_packages(pool: &PgPool, query: &str) -> Result<Vec<PackageRow>> {
    sqlx::query_as!(
        PackageRow,
        r#"SELECT name, version, description, download_count
           FROM packages
           WHERE search_vec @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(search_vec, plainto_tsquery('english', $1)) DESC
           LIMIT 50"#,
        query
    )
    .fetch_all(pool)
    .await
}
```

### Pattern 6: GitHub OAuth with oauth2 crate + tower-sessions

**What:** GitHub OAuth authorization code flow. Store user session via tower-sessions after callback.
**When to use:** /auth/github and /auth/callback routes.

```rust
// Source: https://github.com/tokio-rs/axum/blob/main/examples/oauth/src/main.rs
// Scopes needed: "read:user user:email"
use oauth2::{
    AuthorizationCode, AuthUrl, ClientId, ClientSecret, CsrfToken,
    RedirectUrl, Scope, TokenUrl, basic::BasicClient,
};

fn github_oauth_client(config: &AppConfig) -> BasicClient {
    BasicClient::new(
        ClientId::new(config.github_client_id.clone()),
        Some(ClientSecret::new(config.github_client_secret.clone())),
        AuthUrl::new("https://github.com/login/oauth/authorize".to_string()).unwrap(),
        Some(TokenUrl::new("https://github.com/login/oauth/access_token".to_string()).unwrap()),
    )
    .set_redirect_uri(RedirectUrl::new(config.callback_url.clone()).unwrap())
}

async fn github_login(session: Session) -> impl IntoResponse {
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("read:user".to_string()))
        .add_scope(Scope::new("user:email".to_string()))
        .url();
    session.insert("csrf_token", csrf_token.secret()).await.unwrap();
    Redirect::to(auth_url.as_str())
}
```

### Pattern 7: Token Hashing with Argon2

**What:** Hash publish tokens before storing in DB. Return raw token once to user; store PHC string hash.
**When to use:** POST /dashboard/tokens (create token).

```rust
// Source: https://docs.rs/argon2 (RustCrypto)
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

pub fn hash_token(raw_token: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default().hash_password(raw_token.as_bytes(), &salt)
        .map(|h| h.to_string())  // PHC string: "$argon2id$v=19$..."
}

pub fn verify_token(raw_token: &str, phc_hash: &str) -> bool {
    let hash = PasswordHash::new(phc_hash).expect("valid PHC string");
    Argon2::default().verify_password(raw_token.as_bytes(), &hash).is_ok()
}
```

### Pattern 8: VitePress ClientOnly Package Page

**What:** Runtime API fetch in VitePress without baking stale data at build time.
**When to use:** browse/search and per-package pages in `website/docs/packages/`.

```vue
<!-- Source: https://vitepress.dev/guide/custom-theme -->
<!-- website/docs/.vitepress/theme/components/packages/PackageBrowse.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVitePressSiteData } from 'vitepress'

const REGISTRY_URL = 'https://registry.meshlang.dev'
const packages = ref([])
const featured = ref([])
const searchQuery = ref('')
const loading = ref(true)

async function fetchPackages() {
  const q = searchQuery.value
  const url = q
    ? `${REGISTRY_URL}/api/v1/packages?search=${encodeURIComponent(q)}`
    : `${REGISTRY_URL}/api/v1/packages`
  const resp = await fetch(url)
  const data = await resp.json()
  // featured = top by download_count, rest = list
  featured.value = data.slice(0, 6)
  packages.value = data.slice(6)
}

onMounted(fetchPackages)
</script>

<template>
  <ClientOnly>
    <div class="packages-browse">
      <input v-model="searchQuery" @input="fetchPackages" placeholder="Search packages..." />
      <!-- featured cards + list below -->
    </div>
  </ClientOnly>
</template>
```

```md
---
layout: page
title: Packages
---

<script setup>
import PackageBrowse from '../.vitepress/theme/components/packages/PackageBrowse.vue'
</script>

<PackageBrowse />
```

### Anti-Patterns to Avoid

- **Using VitePress build-time data loading for packages**: Data loaders run at build time only — package data would be stale until next redeploy. Use `<ClientOnly>` with `onMounted` fetch instead.
- **Exposing R2 URLs directly to clients**: Context decision locks this — always proxy through the registry API. Prevents direct hotlinking and allows download counting.
- **Filesystem fallback for tarballs in development**: Context decision is MinIO only in dev — no `if cfg!(debug_assertions) { save to disk }` branches.
- **Using `axum-sessions` + `async-session`**: These are deprecated. Use `tower-sessions` which supersedes them.
- **`CorsLayer::permissive()` in production**: Allows all origins. Restrict to `meshlang.dev` in production.
- **Storing raw tokens in DB**: Hash with argon2; return raw token once at creation time.
- **Not setting `DefaultBodyLimit::max()`**: Axum's default body limit is 2MB. Tarballs can be larger — set e.g. `DefaultBodyLimit::max(50 * 1024 * 1024)` on the publish route.

---

## Recommended PostgreSQL Schema

```sql
-- Source: Claude's Discretion — designed from requirements

-- Users authenticated via GitHub OAuth
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id   BIGINT UNIQUE NOT NULL,
    github_login TEXT NOT NULL,       -- username, e.g. "sn0w"
    email       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Publish tokens (account-scoped)
CREATE TABLE tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,        -- human label, e.g. "CI token"
    hash        TEXT NOT NULL,        -- argon2 PHC string
    last_used   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tokens_user ON tokens(user_id);

-- One row per package name (aggregate metadata)
CREATE TABLE packages (
    name            TEXT PRIMARY KEY,   -- "sn0w/mesh-json"
    owner_login     TEXT NOT NULL,      -- "sn0w"
    description     TEXT NOT NULL DEFAULT '',
    latest_version  TEXT,
    download_count  BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_vec      tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED
);
CREATE INDEX idx_packages_search ON packages USING GIN(search_vec);
CREATE INDEX idx_packages_downloads ON packages(download_count DESC);
CREATE INDEX idx_packages_updated ON packages(updated_at DESC);

-- One row per published version
CREATE TABLE versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name    TEXT NOT NULL REFERENCES packages(name) ON DELETE CASCADE,
    version         TEXT NOT NULL,
    sha256          TEXT NOT NULL,      -- hex SHA-256 = R2 object key
    size_bytes      BIGINT NOT NULL,
    readme          TEXT,               -- stored at publish time for display
    published_by    UUID NOT NULL REFERENCES users(id),
    published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    download_count  BIGINT NOT NULL DEFAULT 0,
    UNIQUE(package_name, version)
);
CREATE INDEX idx_versions_package ON versions(package_name, published_at DESC);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub OAuth PKCE + CSRF | Custom HTTP redirects | `oauth2` crate | State/CSRF handling, PKCE challenge, token exchange — has well-known edge cases |
| Session management | Cookie parsing + DB sessions by hand | `tower-sessions` with postgres store | Deadlock-prone; session expiry, rotation, signed cookies are all handled |
| Token hashing | Custom SHA-256 or bcrypt | `argon2` crate (RustCrypto) | Timing attacks, salt management, PHC string format — all handled; Argon2 is OWASP #1 |
| S3/R2 upload/download | Raw HTTP to R2 API | `aws-sdk-s3` | S3 protocol (multipart, signing, retry) — aws-sdk-s3 is Cloudflare's own documented approach |
| SQL migrations | Inline SQL in startup code | `sqlx migrate!` macro + `migrations/` dir | Checksums, ordering, rollback tracking, CI reproducibility |
| Full-text search | Custom LIKE queries or application-side string matching | PostgreSQL `tsvector` + GIN index + `plainto_tsquery` | Stemming, stop words, ranking — LIKE is O(n) table scan; GIN index is ~3x faster than GiST |

**Key insight:** The tarball handling and SHA-256 deduplication look simple but have subtle concurrency issues (TOCTOU between "check if exists" and "upload"). Use a DB transaction + unique constraint on `(package_name, version)` to serialize duplicate-publish detection, then do the R2 upload only if the DB insert succeeded.

---

## Common Pitfalls

### Pitfall 1: TOCTOU in SHA-256 Deduplication
**What goes wrong:** Check if SHA-256 exists in R2, then upload — two concurrent publishes of the same content can both pass the check and try to upload simultaneously.
**Why it happens:** R2 `HeadObject` check and `PutObject` are not atomic.
**How to avoid:** The DB `UNIQUE(package_name, version)` constraint is the serialization point. First attempt the DB insert. If it succeeds, then conditionally upload to R2 (idempotent — R2 overwrite is safe). If DB insert fails with unique violation → 409.
**Warning signs:** Occasional double-upload errors in logs.

### Pitfall 2: Axum 0.8 Path Syntax Breaking Change
**What goes wrong:** Routes written as `/packages/:name/:version` silently fail to match or cause compile errors in 0.8.
**Why it happens:** matchit 0.8 upgraded in Axum 0.8 uses `{param}` syntax, not `:param`.
**How to avoid:** All routes must use `/{name}/{version}` syntax. Path extractor: `Path((name, version)): Path<(String, String)>`.
**Warning signs:** 404s on routes that should match, or compile errors on Path extractor mismatches.

### Pitfall 3: Body Limit for Tarball Upload
**What goes wrong:** Axum's default body limit is 2MB. Tarballs with source code can exceed this, causing silent 413 or connection drops.
**Why it happens:** `DefaultBodyLimit` defaults to 2MB for security; publish endpoint is the exception.
**How to avoid:** Apply `DefaultBodyLimit::max(50 * 1024 * 1024)` only to the publish route (not globally).
**Warning signs:** `meshpkg publish` fails with "Registry returned HTTP 413" or connection reset.

### Pitfall 4: ByteStream Collect for Download Streaming
**What goes wrong:** `s3_resp.body.collect().await?.into_bytes()` buffers the entire tarball in memory before sending.
**Why it happens:** The natural `collect()` pattern is non-streaming; fine for small files, OOM risk for large tarballs.
**How to avoid:** Use `s3_resp.body.into_async_read()` → `ReaderStream` → `axum::body::Body::from_stream()`.
**Warning signs:** Memory spikes on concurrent download requests.

### Pitfall 5: VitePress Per-Package Page Routing
**What goes wrong:** Attempting to use VitePress dynamic file-based routing (`[name].md`) for package pages — these are generated at build time and cannot reflect live packages.
**Why it happens:** VitePress route params resolve at build time from the `paths()` function, not at runtime.
**How to avoid:** Use a single `packages/[package].md` page with a Vue `<ClientOnly>` component that reads the package name from `useRoute()` or the URL, then fetches from the API. Or use a JavaScript-driven 404 handler redirect — but the simpler pattern is a dedicated packages index + individual package URL structure like `/packages/{owner}/{name}` handled client-side.
**Warning signs:** Build fails because paths() cannot enumerate live packages; or all packages show the same stale data.

### Pitfall 6: GitHub OAuth CSRF Token in Session
**What goes wrong:** Storing the CSRF/state token in a cookie directly (not in the session) makes CSRF protection bypassable.
**Why it happens:** Misreading the OAuth example — the `CsrfToken` must be in the server-side session, not the client-side cookie.
**How to avoid:** Store `csrf_state` in `tower-sessions` session store (PostgreSQL-backed in production), compare in callback.
**Warning signs:** OAuth callback accepts any `state` parameter value.

### Pitfall 7: tsvector on Namespaced Names
**What goes wrong:** Full-text search on `sn0w/mesh-json` splits on `/` — "mesh" and "json" are indexed but "sn0w" may be treated as a stop word or mangled.
**Why it happens:** `to_tsvector('english', 'sn0w/mesh-json')` produces `{'mesh-json':1, 'sn0w':1}` — the slash is treated as a word separator, which is usually fine, but short tokens may be dropped.
**How to avoid:** Weight both the full name (column A) and the description (column B). Also add a `LIKE`-based fallback or `pg_trgm` trigram index for prefix search on the owner/package name if needed. Test with `to_tsvector('english', 'sn0w/mesh-json')` and verify expected output.
**Warning signs:** Searching "sn0w" returns no results even though packages exist with that owner.

---

## R2 / MinIO Configuration Pattern

```
R2 bucket key convention: <sha256_hex>
Example: a1b2c3d4...f5e6/  (64 hex chars, flat namespace)

Environment variables (both prod R2 and dev MinIO):
  STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com   # or http://localhost:9000 for MinIO
  STORAGE_BUCKET=mesh-packages
  STORAGE_ACCESS_KEY_ID=<r2_or_minio_key>
  STORAGE_SECRET_ACCESS_KEY=<r2_or_minio_secret>
  STORAGE_REGION=auto   # R2 uses "auto"; MinIO use "us-east-1"
```

```rust
// Source: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-rust/
use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};

pub fn build_s3_client(config: &AppConfig) -> aws_sdk_s3::Client {
    let creds = Credentials::new(
        &config.storage_access_key_id,
        &config.storage_secret_access_key,
        None, None, "mesh-registry",
    );
    let s3_config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .endpoint_url(&config.storage_endpoint)
        .credentials_provider(creds)
        .region(Region::new(config.storage_region.clone()))
        .force_path_style(true)   // Required for MinIO; harmless for R2
        .build();
    aws_sdk_s3::Client::from_conf(s3_config)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `axum-sessions` + `async-session` | `tower-sessions` | 2023 | axum-sessions deprecated; deadlock bug fixed |
| `/:param` route syntax | `/{param}` route syntax | Axum 0.8 (Jan 2025) | Breaking for all axum users; aligns with OpenAPI |
| `#[async_trait]` on extractors | Native async traits | Axum 0.8 (Jan 2025) | No longer needed for `FromRequestParts` |
| `Option<T>` extractor silencing errors | `OptionalFromRequestParts` trait | Axum 0.8 (Jan 2025) | Optional extractors now handle errors properly |
| `bcrypt` for token storage | `argon2` (Argon2id) | OWASP 2023+ | Argon2 is OWASP #1; memory-hard, GPU-resistant |
| `BodyStream` / `StreamBody` | `Body::from_stream()` | Axum 0.7+ | API simplified |

**Deprecated/outdated:**
- `axum-sessions`: Deprecated — use `tower-sessions`
- `async-session` as session backend: Replaced by `tower-sessions`' native store traits
- `:param` route syntax: Replaced by `{param}` in Axum 0.8

---

## Open Questions

1. **Per-package page URL structure in VitePress**
   - What we know: VitePress supports file-based routing; dynamic routes with `paths()` run at build time only; `<ClientOnly>` components can read URL at runtime
   - What's unclear: Best UX URL for package pages — `/packages/sn0w/mesh-json` (two levels) vs `/packages?pkg=sn0w%2Fmesh-json` (query param) vs `/packages/sn0w-mesh-json` (encoded)
   - Recommendation: Use query param `?name=sn0w/mesh-json` on a single `/packages/[package].md` page with a `<ClientOnly>` component reading `useRoute().query.name`. This is the simplest implementation that avoids multi-level dynamic routing issues in VitePress.

2. **Download count tracking granularity**
   - What we know: Context marks this as Claude's discretion; schema above has both `versions.download_count` and `packages.download_count`
   - What's unclear: Whether to update atomically on every download request (potential bottleneck under load) or batch-update asynchronously
   - Recommendation: For v1 with expected low traffic, `UPDATE versions SET download_count = download_count + 1` atomically in the download handler is fine. Add a background batch update if it becomes a bottleneck.

3. **Pagination strategy for package list**
   - What we know: Context marks this as Claude's discretion
   - What's unclear: Cursor vs offset; how many packages will exist at launch (seed content only)
   - Recommendation: Use simple `LIMIT`/`OFFSET` with `updated_at DESC` ordering for v1. The registry starts with only stdlib seed packages, so pagination won't matter initially. Switch to keyset pagination if needed.

4. **tower-sessions version compatibility with Axum 0.8**
   - What we know: tower-sessions is the recommended successor to axum-sessions; it has a postgres-store feature
   - What's unclear: Exact version of tower-sessions compatible with Axum 0.8.x as of Feb 2026
   - Recommendation: Check crates.io for the latest tower-sessions release compatible with axum 0.8. The planner should verify this at implementation time.

---

## Sources

### Primary (HIGH confidence)
- [Axum 0.8.0 announcement](https://tokio.rs/blog/2025-01-01-announcing-axum-0-8-0) — Breaking changes: path syntax, Option<T> extractors, async_trait removal
- [Axum docs.rs](https://docs.rs/axum/latest/axum/) — State management, routing, extractors
- [Cloudflare R2 Rust example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-rust/) — aws-sdk-s3 with R2 endpoint configuration
- [sqlx docs.rs](https://docs.rs/sqlx/latest/sqlx/) — query_as!, migrate!, PgPool patterns
- [PostgreSQL FTS docs](https://www.postgresql.org/docs/current/datatype-textsearch.html) — tsvector, tsquery, GIN indexes
- [argon2 docs.rs](https://docs.rs/argon2) — PHC string format, Argon2id hashing
- [VitePress data loading docs](https://vitepress.dev/guide/data-loading) — Build-time vs runtime data fetch pattern
- Phase 139 source (`compiler/meshpkg/src/publish.rs`, `install.rs`, `search.rs`) — Locked API contract

### Secondary (MEDIUM confidence)
- [tower-sessions GitHub](https://github.com/maxcountryman/tower-sessions) — Session management, verified as successor to axum-sessions
- [Official Axum OAuth example](https://github.com/tokio-rs/axum/blob/main/examples/oauth/src/main.rs) — GitHub OAuth flow pattern (adapting Discord example)
- [Axum streaming discussion](https://github.com/tokio-rs/axum/discussions/2000) — S3 streaming proxy pattern
- [GitHub OAuth scopes docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) — `read:user` + `user:email` minimal scopes

### Tertiary (LOW confidence)
- WebSearch results on CORS, tower-http, production setup patterns — cross-verified with official axum docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Axum 0.8, sqlx 0.8, aws-sdk-s3 all verified via official docs and announcements
- API contract: HIGH — Derived directly from Phase 139 source code (locked)
- Architecture: HIGH — Follows established patterns from official examples and docs
- PostgreSQL schema: MEDIUM — Claude's discretion area; logically derived from requirements; tsvector pattern verified from PG docs
- VitePress integration: MEDIUM — ClientOnly pattern verified from VitePress docs; per-package page routing is an open question
- Pitfalls: MEDIUM — Some pitfalls from official docs (body limit, path syntax), some from community discussions

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (30 days — Axum/sqlx are stable; VitePress is faster-moving but API unlikely to change in 30 days)
