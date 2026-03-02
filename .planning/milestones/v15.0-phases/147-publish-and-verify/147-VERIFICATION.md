---
phase: 147-publish-and-verify
verified: 2026-03-02T05:50:00Z
status: gaps_found
score: 7/8 must-haves verified
re_verification: false
gaps:
  - truth: "GET https://registry.meshlang.dev/api/v1/packages returns JSON array containing mesh-slug entry (via ?search=slug)"
    status: partial
    reason: "The package IS present in the unfiltered /packages endpoint (returns snowdamiz/mesh-slug@1.0.0). However, ?search=slug — and all other ?search= queries including ?search=snowdamiz and ?search=mesh — return an empty array []. The FTS tsvector search path is non-functional on the live registry. Root cause: the search_vec GENERATED ALWAYS column in the packages table either has a NULL value or the FTS migration (20260228000002_fts_index.sql) was not applied to the live DB before the package row was inserted and the column trigger never populated it. DIST-03 truth 'Searching for slug on packages.meshlang.dev shows the mesh-slug package listing' depends on this search working."
    artifacts:
      - path: "registry/src/routes/search.rs"
        issue: "FTS search via search_vec @@ plainto_tsquery returns [] for all queries; the live DB tsvector is either not populated or the migration was applied after package row insertion without a table rewrite"
      - path: "registry/src/db/packages.rs"
        issue: "search_packages() uses search_vec tsvector column — if search_vec is NULL/empty for existing rows, the query correctly returns no results (the SQL is correct, but live data is missing the vector)"
    missing:
      - "Verify and repair the search_vec column on the live registry DB (e.g., UPDATE packages SET search_vec = ... or re-run the STORED GENERATED column migration)"
      - "After repair, confirm GET /api/v1/packages?search=slug returns snowdamiz/mesh-slug"
      - "Confirm packages.meshlang.dev search UI returns the package for 'slug' query (human verification)"
human_verification:
  - test: "Browse packages.meshlang.dev and search for 'slug'"
    expected: "mesh-slug (snowdamiz/mesh-slug) package card appears in search results"
    why_human: "The API search endpoint is currently broken (returns []); the human-action checkpoint in Plan 02 approved this at a point in time where it may have been working or the human observed it via the homepage browse view. Current state needs re-confirmation once the search_vec gap is resolved."
---

# Phase 147: Publish and Verify — Verification Report

**Phase Goal:** Publish mesh-slug to the Mesh package registry and verify the full install-and-use workflow end-to-end.
**Verified:** 2026-03-02T05:50:00Z
**Status:** gaps_found (7/8 must-haves verified)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | mesh-slug has a valid `mesh.toml` with name, version, and description; `meshpkg publish` succeeds without error | VERIFIED | `mesh-slug/mesh.toml` has `name = "snowdamiz/mesh-slug"`, `version = "1.0.0"`, `description = "URL-safe slug generation for Mesh programs"`. Registry metadata endpoint returns `"latest": {"version": "1.0.0"}`. Commit `90166dbb`. |
| 2 | Searching for "slug" on packages.meshlang.dev shows the mesh-slug package listing | PARTIAL | Package IS in registry (unfiltered list). API `?search=slug` returns `[]`. All FTS `?search=` queries return empty — tsvector not populated on live DB. Human checkpoint approved this at plan execution time; current programmatic state is broken. |
| 3 | Running `meshpkg install mesh-slug` in a fresh project directory downloads and installs the package successfully | VERIFIED | `tests/e2e/consumer/.mesh/packages/snowdamiz/mesh-slug@1.0.0/` exists with `slug.mpl`, `mesh.toml`, `main.mpl`. `mesh.lock` records SHA256 checksum. |
| 4 | The installed package can be imported and called from a simple Mesh program without compiler errors | VERIFIED | `tests/e2e/consumer/consumer` binary exists and produces `hello-world` when executed. `main.mpl` uses `from Slug import slugify`. |

**Score:** 3.5/4 truths (Truth 2 is partial — package discoverable by browse, not by search)

---

## Required Artifacts

### Plan 01: Infrastructure Fixes

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `compiler/meshpkg/src/publish.rs` | Fixed tarball creation including root .mpl files | VERIFIED | Lines 53-71: loop over `project_dir` entries, includes `.mpl` files (excl. `*.test.mpl`) via `append_path_with_name`. Pattern `append_path_with_name` found 2x. |
| `compiler/meshc/src/discovery.rs` | Package search path extending into .mesh/packages/*/ | VERIFIED | Lines 228-277: Phase 1b block. Handles both unscoped (`name@version`) and scoped (`owner/name@version`) layouts. `packages_dir` and `.mesh` strings found 3x and 7x respectively. |

### Plan 02: Publish

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mesh-slug/mesh.toml` | Updated package manifest with scoped name | VERIFIED | `name = "snowdamiz/mesh-slug"`, version 1.0.0, description present. Commit `90166dbb`. |

### Plan 03: Consumer E2E

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/consumer/mesh.toml` | Fresh consumer project manifest with mesh-slug dependency | VERIFIED | Contains `"snowdamiz/mesh-slug" = "1.0.0"` under `[dependencies]`. |
| `tests/e2e/consumer/main.mpl` | Consumer program importing and calling Slug.slugify | VERIFIED | Line 1: `from Slug import slugify`; calls `slugify("Hello World!")` in `main()`. |
| `tests/e2e/consumer/.mesh/packages/snowdamiz/mesh-slug@1.0.0/` | Installed package directory containing slug.mpl | VERIFIED | Directory exists with `slug.mpl`, `mesh.toml`, `main.mpl`. |
| `tests/e2e/consumer/mesh.lock` | Lockfile with checksum | VERIFIED | Records `sha256 = "1405b35..."`, source URL pointing to `api.packages.meshlang.dev`. |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `compiler/meshpkg/src/publish.rs` | `mesh-slug/slug.mpl` | tarball creation loop | WIRED | `create_tarball()` iterates project root, finds `*.mpl` files, archives them with `append_path_with_name`. Loop present lines 55-71. |
| `compiler/meshc/src/discovery.rs` | `.mesh/packages/*/` | discover_mesh_files extended search | WIRED | Phase 1b (lines 223-278) scans `.mesh/packages/` with two-level traversal; `discover_mesh_files()` called on each `pkg_dir`. |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `meshpkg publish` | `https://api.packages.meshlang.dev/api/v1/packages` | POST with Bearer token | WIRED | `upload_tarball()` in publish.rs POSTs to `{registry}/api/v1/packages` with `Authorization: Bearer` header. Registry metadata confirms `download_count: 1` for the package. |
| `packages.meshlang.dev` | `https://api.packages.meshlang.dev/api/v1/packages?search=slug` | SvelteKit frontend search | NOT_WIRED | `+page.server.js` correctly calls the API with `?search={q}`. The API itself returns `[]` for all `?search=` queries — FTS tsvector not populated on live DB. |

### Plan 03 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tests/e2e/consumer/main.mpl` | `.mesh/packages/snowdamiz/mesh-slug@1.0.0/slug.mpl` | `from Slug import slugify` | WIRED | `slug.mpl` physically present in installed dir; consumer binary executes and outputs `hello-world`. |
| `meshc build` | `.mesh/packages/snowdamiz/mesh-slug@1.0.0/` | discovery.rs Phase 1b | WIRED | Scoped two-level layout handled by `@`-detection in Phase 1b. Compilation succeeded (binary produces correct output). |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|------------|----------------|-------------|--------|----------|
| DIST-01 | 147-01, 147-02 | mesh-slug has a valid mesh.toml with name, version, and description | SATISFIED | `mesh-slug/mesh.toml` has all three fields; scoped name `snowdamiz/mesh-slug` satisfies registry namespace constraint. |
| DIST-02 | 147-02 | User can publish mesh-slug to the package registry via `meshpkg publish` | SATISFIED | `upload_tarball()` POSTs to registry. Registry confirms package with `download_count: 1`, metadata endpoint returns `"latest": {"version": "1.0.0"}`. Commit `90166dbb`. |
| DIST-03 | 147-02 | mesh-slug appears in search results on packages.meshlang.dev after publishing | PARTIAL | Package is discoverable via unfiltered browse (`/api/v1/packages` returns it). `?search=slug` FTS path returns `[]` — live registry tsvector not populated. Human checkpoint approval in Plan 02 may have been based on homepage browse, not the search UI. |
| DIST-04 | 147-01, 147-03 | User can install mesh-slug in a project via `meshpkg install mesh-slug` | SATISFIED | Consumer project installed `snowdamiz/mesh-slug@1.0.0` to `.mesh/packages/snowdamiz/mesh-slug@1.0.0/`. `from Slug import slugify` compiles and runs, printing `hello-world`. |

**Orphaned requirements from REQUIREMENTS.md mapped to Phase 147:** None detected.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | All key files are free of TODO/FIXME/placeholder patterns. |

Scanned: `compiler/meshpkg/src/publish.rs`, `compiler/meshc/src/discovery.rs`, `tests/e2e/consumer/main.mpl`, `tests/e2e/consumer/mesh.toml`, `mesh-slug/mesh.toml`.

---

## Human Verification Required

### 1. Package Search on packages.meshlang.dev

**Test:** Open https://packages.meshlang.dev/search?q=slug in a browser
**Expected:** mesh-slug (snowdamiz/mesh-slug) package card appears in the results list
**Why human:** The API `?search=slug` endpoint returns `[]` programmatically — the tsvector FTS is broken on the live DB. Before marking DIST-03 satisfied, a human must confirm whether the website search currently shows the package (perhaps via a different code path) or confirm the gap is real.

---

## Gaps Summary

**One gap blocks full goal achievement: the FTS search endpoint is non-functional.**

The entire install-and-use workflow (Plans 01 and 03) is verified with physical evidence — the consumer binary runs and outputs `hello-world`, the installed package directory exists, the compiler correctly resolves the scoped package import. These are fully solid.

The publish workflow (Plan 02) is also solid — the package is live on the registry, the metadata endpoint returns correct data, and the fix to add description/scoped-name routing was committed.

The single gap is DIST-03 (searchability): `GET /api/v1/packages?search=slug` returns `[]` despite the package being present in the unfiltered list. The registry code is correct (FTS query in `search_packages()` is well-formed) but the live database's `search_vec` tsvector column appears to not contain the expected lexemes for `snowdamiz/mesh-slug`. This likely means either:

1. The FTS migration (`20260228000002_fts_index.sql`) added `GENERATED ALWAYS AS ... STORED` AFTER the package row was inserted and the live DB did not trigger a table rewrite to populate the column, OR
2. The column is present but `to_tsvector('english', 'snowdamiz/mesh-slug')` with a blank description produces a tsvector that does not match `plainto_tsquery('english', 'slug')` under the live Postgres configuration.

Resolution requires a database-level investigation or an `UPDATE packages SET ... WHERE name = 'snowdamiz/mesh-slug'` to force tsvector regeneration, followed by re-testing the search endpoint.

---

_Verified: 2026-03-02T05:50:00Z_
_Verifier: Claude (gsd-verifier)_
