---
phase: 140-package-registry-backend-website
verified: 2026-03-01T06:00:00Z
status: passed
score: 21/21 must-haves verified
re_verification: false
---

# Phase 140: Package Registry Backend & Website Verification Report

**Phase Goal:** Build the mesh package registry backend (Rust/Axum) and integrate package browsing into the VitePress website
**Verified:** 2026-03-01T06:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | mesh-registry crate compiles as a standalone workspace with cargo check | VERIFIED | `cargo check` exits 0, 7 warnings only (unused fields/functions) |
| 2 | Database migrations define packages, versions, tokens, and users tables with tsvector FTS column | VERIFIED | `20260228000001_initial.sql` has all 4 tables with UNIQUE constraint; `20260228000002_fts_index.sql` has GIN index on `search_vec` |
| 3 | AppState struct holds PgPool + S3 client + Arc<AppConfig> and is Clone | VERIFIED | `state.rs` declares `#[derive(Clone)]` struct with `pool: PgPool`, `s3: R2Client`, `config: Arc<AppConfig>`, `oauth_client: Arc<oauth2::basic::BasicClient>` |
| 4 | R2Client wrapper provides put_object, get_object, object_exists using aws-sdk-s3 with force_path_style=true | VERIFIED | `storage/r2.rs` implements all 3 methods; `.force_path_style(true)` present |
| 5 | AppError enum implements IntoResponse with correct HTTP status codes | VERIFIED | `error.rs` maps 400/401/403/404/409/500 — all 6 variants present |
| 6 | DB query functions cover: insert_version, get_package, get_version, search_packages, version_exists, increment_download | VERIFIED | All 6 functions present in `db/packages.rs` using runtime sqlx queries |
| 7 | POST /api/v1/packages accepts tarball with Bearer token headers and returns 201 | VERIFIED | `routes/publish.rs` validates token, checks namespace, verifies SHA-256, returns `StatusCode::CREATED` |
| 8 | POST /api/v1/packages returns 409 Conflict on duplicate name+version | VERIFIED | `version_exists()` called → `AppError::Conflict`; also catches DB unique constraint violation |
| 9 | POST /api/v1/packages returns 401 when Bearer token is invalid or missing | VERIFIED | `extract_bearer` returns `AppError::Unauthorized`; `validate_bearer_token` returns None → Unauthorized |
| 10 | POST /api/v1/packages rejects publishes where package name namespace does not match token owner | VERIFIED | `name.starts_with(&format!("{}/", owner))` check → `AppError::Forbidden` |
| 11 | POST /api/v1/packages extracts README.md from tar.gz and stores in versions.readme | VERIFIED | `extract_readme_from_tarball()` using flate2+tar; passed as `readme` to `insert_version()` |
| 12 | GET /api/v1/packages/{name}/{version}/download streams tarball bytes from R2 without buffering | VERIFIED | `download.rs` uses `Body::from_stream(ReaderStream::new(stream))` |
| 13 | GET /api/v1/packages?search={q} returns JSON array via PostgreSQL FTS | VERIFIED | `search.rs` calls `db::packages::search_packages()` using tsvector `plainto_tsquery` |
| 14 | GET /api/v1/packages/{name} returns {latest, readme} JSON | VERIFIED | `metadata.rs::package_handler` returns `{latest, readme, name, description, owner, download_count}` |
| 15 | GET /auth/github redirects to GitHub OAuth with correct client_id and CSRF state | VERIFIED | `auth.rs::github_login` calls `authorize_url(CsrfToken::new_random)` → `Redirect::to(auth_url)` |
| 16 | GET /auth/callback exchanges code, upserts user, stores session, redirects to /dashboard | VERIFIED | `github_callback` verifies CSRF, exchanges code, calls `upsert_user`, inserts session keys, `Redirect::to("/dashboard")` |
| 17 | POST /dashboard/tokens creates token, returns raw token once (argon2 hash in DB) | VERIFIED | `create_token_handler` calls `db::tokens::create_token()` which hashes with Argon2id; raw token returned in response |
| 18 | Visiting /packages shows featured cards and full package list | VERIFIED | `website/docs/packages/index.md` mounts `PackageBrowse` in `<ClientOnly>`; component shows featured grid (top 6) + `PackageList` |
| 19 | Typing in search box replaces listing with search results (no page reload) | VERIFIED | `PackageBrowse.vue` has `onSearchInput()` with 300ms debounce calling `fetchPackages()` which calls `/api/v1/packages?search=...` |
| 20 | Visiting /packages/package?name=... shows metadata card, README, version history | VERIFIED | `PackagePage.vue` reads `URLSearchParams(window.location.search)`, fetches from registry, renders metadata card + `renderMarkdown(pkg.readme)` + expandable version history |
| 21 | README is rendered as HTML markdown on the per-package page | VERIFIED | `renderMarkdown()` function in `PackagePage.vue` converts markdown to HTML; rendered via `v-html` |

**Score:** 21/21 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `registry/Cargo.toml` | mesh-registry workspace member with all required deps | VERIFIED | Standalone workspace with axum, sqlx, aws-sdk-s3, oauth2, tower-sessions-sqlx-store, argon2, flate2, tar |
| `registry/migrations/20260228000001_initial.sql` | users, tokens, packages, versions tables | VERIFIED | All 4 tables with UNIQUE(package_name, version), CASCADE FK constraints |
| `registry/migrations/20260228000002_fts_index.sql` | tsvector generated column + GIN index | VERIFIED | `GENERATED ALWAYS AS` tsvector column + `CREATE INDEX ... USING GIN` |
| `registry/src/storage/r2.rs` | R2Client wrapper | VERIFIED | `build_r2_client`, `put_object`, `get_object`, `object_exists`; `force_path_style(true)` present |
| `registry/src/db/packages.rs` | all package DB query functions | VERIFIED | `insert_version`, `get_package`, `get_version`, `search_packages`, `version_exists`, `increment_download`, `list_packages`, `list_versions` |
| `registry/src/routes/publish.rs` | POST /api/v1/packages handler with README extraction | VERIFIED | 159 lines, full implementation with `X-Package-SHA256` header check, flate2+tar README extraction |
| `registry/src/routes/download.rs` | GET download handler with streaming | VERIFIED | `Body::from_stream` + `ReaderStream` present |
| `registry/src/routes/search.rs` | GET /api/v1/packages?search= handler | VERIFIED | `search_packages` call present; fallback to `list_packages` |
| `registry/src/routes/metadata.rs` | package + version metadata handlers with readme | VERIFIED | `readme` field in `package_handler` JSON response |
| `registry/src/routes/auth.rs` | GitHub OAuth flow + token management | VERIFIED | 209 lines, all 5 handlers complete, no NOT_IMPLEMENTED stubs |
| `registry/.env.example` | Documentation for required environment variables | VERIFIED | All groups: DATABASE_URL, STORAGE_*, GITHUB_*, SESSION_SECRET, PORT |
| `website/docs/packages/index.md` | Browse/search landing page using PackageBrowse component | VERIFIED | `<ClientOnly><PackageBrowse /></ClientOnly>` |
| `website/docs/packages/package.md` | Per-package page using PackagePage component | VERIFIED | `<ClientOnly><PackagePage /></ClientOnly>` |
| `website/docs/.vitepress/theme/components/packages/PackageBrowse.vue` | Featured cards + list + search box | VERIFIED | `fetchPackages()` present, debounced search, REGISTRY_URL, featured grid + PackageList |
| `website/docs/.vitepress/theme/components/packages/PackagePage.vue` | Metadata card + README + version history | VERIFIED | `renderMarkdown()` present, `v-html`, `versionsExpanded`, install command + copy button |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `registry/src/state.rs` | `registry/src/storage/r2.rs` | `AppState.s3` field | VERIFIED | `pub s3: R2Client` at line 9 |
| `registry/src/state.rs` | `sqlx::PgPool` | `AppState.pool` field | VERIFIED | `pub pool: PgPool` at line 8 |
| `registry/src/main.rs` | `registry/migrations/` | `sqlx::migrate!("./migrations").run(&pool)` | VERIFIED | Line 29 in main.rs |
| `registry/src/routes/publish.rs` | `registry/src/db/packages.rs` | `insert_version` call | VERIFIED | Line 80 in publish.rs |
| `registry/src/routes/publish.rs` | `registry/src/storage/r2.rs` | `state.s3.put_object()` | VERIFIED | Line 105 in publish.rs |
| `registry/src/routes/download.rs` | `registry/src/storage/r2.rs` | `ReaderStream` streaming | VERIFIED | `Body::from_stream(ReaderStream::new(stream))` at line 31 |
| `registry/src/routes/mod.rs` | `registry/src/main.rs` | `routes::router(state)` | VERIFIED | `routes::router(state).layer(session_layer)` at line 44 |
| `registry/src/routes/auth.rs` | GitHub OAuth authorize URL | `authorize_url` call | VERIFIED | Line 27 in auth.rs |
| `registry/src/routes/auth.rs` | `registry/src/db/tokens.rs` | `upsert_user` call | VERIFIED | Line 74 in auth.rs |
| `website/docs/.vitepress/theme/components/packages/PackageBrowse.vue` | `https://registry.meshlang.dev/api/v1/packages` | `fetch()` in `fetchPackages()` + search input watcher | VERIFIED | Lines 30-31 in PackageBrowse.vue |
| `website/docs/.vitepress/theme/components/packages/PackagePage.vue` | `https://registry.meshlang.dev/api/v1/packages/{name}` | `URLSearchParams(window.location.search)` | VERIFIED | Lines 9-10 in PackagePage.vue |
| `website/docs/packages/index.md` | `PackageBrowse.vue` | `<PackageBrowse />` in `<ClientOnly>` | VERIFIED | Lines 11-13 in index.md |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| REG-01 | 140-01, 140-02, 140-03 | Registry accepts authenticated HTTP API with SHA-256 content addressing, rejects duplicate version uploads | SATISFIED | Bearer token auth in publish.rs; SHA-256 verify with `Sha256::digest`; 409 on `version_exists()` + DB UNIQUE constraint; GitHub OAuth flow in auth.rs; argon2 token hashing in tokens.rs |
| REG-02 | 140-04 | User can browse all published packages on the hosted site listed by recency and/or popularity | SATISFIED | `PackageBrowse.vue` fetches `/api/v1/packages` (sorted by `download_count DESC, updated_at DESC`); featured cards show top 6; full list in `PackageList.vue` |
| REG-03 | 140-04 | User can search the hosted site for packages by name or keyword with relevant results | SATISFIED | Search box in `PackageBrowse.vue` calls `/api/v1/packages?search=` with 300ms debounce; backend uses PostgreSQL tsvector FTS via `search_packages()` |
| REG-04 | 140-02, 140-04 | User can view per-package page with rendered README, version history, and install command | SATISFIED | `PackagePage.vue` renders `pkg.readme` via `renderMarkdown()` into `v-html`; expandable version history; `meshpkg install {name}@{version}` command with copy-to-clipboard |

All 4 requirements (REG-01 through REG-04) satisfied. No orphaned requirements found.

---

### Anti-Patterns Found

No blockers or stubs detected.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `registry/src/routes/auth.rs` | — | `NOT_IMPLEMENTED` stubs | — | Not present — all 5 handlers are fully implemented |
| `registry/src/db/packages.rs` | — | `TODO` / empty return | — | Not present — all query functions have real SQL |
| `website/docs/.vitepress/theme/components/packages/PackageBrowse.vue` | 78-79 | `placeholder` HTML attribute | Info | This is an HTML input placeholder text attribute, not a code stub |

**Warnings from cargo check (7):** All are dead-code warnings for fields/functions defined but not yet called from route handlers:
- `session_secret` field not yet consumed (config field, no stub)
- `list_versions`, `delete_token` defined but no route calls them yet (future endpoints)
- `VersionRow.updated_at`, `id`, `package_name`, `size_bytes`, `published_at`, `download_count` not all used in every handler
- `LatestVersion` struct defined in metadata.rs but superseded by inline `serde_json::json!`

None of these prevent compilation or represent missing goal-relevant functionality.

---

### Human Verification Required

The following items require a running registry instance + browser to verify visually:

**1. Package Browse Page Layout**

Test: Navigate to `/packages` on the deployed website (or local dev)
Expected: Featured cards grid (top 6 packages by downloads) visible above a full package list; search input present at top
Why human: VitePress SSG can't be verified without a running instance; layout/styling correctness is visual

**2. Live Search Behavior**

Test: Type in the search box on `/packages`
Expected: Package list updates to search results within ~300ms, without page reload
Why human: Requires browser JS execution and a running registry backend

**3. Per-Package Page with README**

Test: Navigate to `/packages/package?name=owner/pkg-name` with a published package
Expected: Metadata card with install command, README rendered as formatted HTML, expandable version history, GitHub author link
Why human: Requires a live package to be published first; README markdown rendering quality is visual

**4. GitHub OAuth Login Flow**

Test: Visit `/auth/github` → redirected to GitHub → authorize → redirected to `/dashboard`
Expected: Dashboard shows GitHub login name; "Create token" form works
Why human: Requires configured GitHub OAuth App credentials and live database

**5. Token Creation Security (Raw Token Visibility)**

Test: POST `/dashboard/tokens` with `{"name": "test"}` after login
Expected: Response contains raw token string; subsequent GET `/dashboard/tokens` does NOT show the raw token, only name+id
Why human: Security property requiring manual inspection of API responses

---

### Gaps Summary

No gaps found. All 21 observable truths verified. All artifacts are substantive (not stubs). All key links are wired. All 4 requirements (REG-01, REG-02, REG-03, REG-04) are satisfied.

**Notable architectural decision (not a gap):** The registry crate is a standalone Cargo workspace (`registry/Cargo.toml` declares `[workspace]`) rather than a member of the monorepo workspace. This was required to avoid a `libsqlite3-sys` link conflict between `mesh-rt` (uses bundled sqlite 0.36) and sqlx-sqlite 0.8 (requires ^0.28). The `-p mesh-registry` invocation from the plan is replaced by `--manifest-path registry/Cargo.toml` for this configuration. `cargo check` with the manifest-path invocation passes with 0 errors.

---

_Verified: 2026-03-01T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
