---
phase: 147-publish-and-verify
plan: 01
subsystem: compiler
tags: [rust, meshpkg, meshc, tarball, discovery, packages]

# Dependency graph
requires:
  - phase: 146-slug-library
    provides: "mesh-slug package with slug.mpl at root (not src/)"
provides:
  - "meshpkg publish correctly archives root-level .mpl files (slug.mpl, main.mpl) in tarball"
  - "meshc build_project() discovers and registers modules from .mesh/packages/*/ for import resolution"
affects: [147-02-publish, 147-03-install-and-verify]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Package tarball creation: iterate project root dir entries, include *.mpl (excluding *.test.mpl)"
    - "Installed package discovery: Phase 1b in build_project() scans .mesh/packages/*/ before building dependency graph"

key-files:
  created: []
  modified:
    - compiler/meshpkg/src/publish.rs
    - compiler/meshc/src/discovery.rs

key-decisions:
  - "Root-level .mpl files (slug.mpl, main.mpl) added to tarball before src/ block — preserves existing src/ logic unchanged"
  - "Installed package main.mpl excluded via path_to_module_name() returning None — consumers do not import entry points"
  - "discover_mesh_files() reused unchanged for package dirs — it already skips .test.mpl and hidden dirs"
  - "Pre-existing 10 e2e test failures (try operator features) are out of scope and left as deferred items"

patterns-established:
  - "Phase 1b pattern: after project file discovery, scan .mesh/packages/*/ and add package modules to graph before Phase 2 (dependency edges)"

requirements-completed: [DIST-01, DIST-04]

# Metrics
duration: 12min
completed: 2026-03-02
---

# Phase 147 Plan 01: Fix meshpkg tarball creation and meshc installed package discovery

**meshpkg publish tarball now includes root-level .mpl files (slug.mpl, main.mpl), and meshc resolves imports from .mesh/packages/*/ installed packages**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-02T04:07:00Z
- **Completed:** 2026-03-02T04:19:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed `create_tarball()` in publish.rs to iterate project root directory and include all `*.mpl` files (excluding `*.test.mpl`) — mesh-slug's `slug.mpl` and `main.mpl` will now be included in the published tarball
- Added Phase 1b in `build_project()` in discovery.rs to discover and register `.mpl` files from all subdirectories under `.mesh/packages/` — `from Slug import ...` in a consumer project now resolves after `meshpkg install`
- Both binaries compile cleanly; all 36 discovery.rs unit tests pass; 293 e2e tests continue passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix publish.rs to include root-level .mpl files in tarball** - `a59cad39` (fix)
2. **Task 2: Extend discovery.rs to resolve imports from installed packages** - `957eb9a1` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `compiler/meshpkg/src/publish.rs` - Added loop over project root `*.mpl` files in `create_tarball()` before the `src/` block
- `compiler/meshc/src/discovery.rs` - Added Phase 1b in `build_project()` to discover modules from `.mesh/packages/*/`

## Decisions Made

- Root-level `.mpl` files added before the `src/` block in tarball creation, preserving unchanged the existing `mesh.toml` and `src/` inclusion logic
- Package `main.mpl` files excluded from installed package module registration by relying on `path_to_module_name()` returning `None` for `main.mpl` at package root
- `discover_mesh_files()` reused without modification for package subdirectory scanning — it already correctly skips `.test.mpl` and hidden directories
- Pre-existing 10 e2e test failures (try operator / result binding features) confirmed as pre-existing via stash test, left as deferred items out of scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- 10 e2e test failures appeared in `cargo test -p meshc` output. Verified via `git stash` that these failures existed before this plan's changes (identical set: `e2e_cross_module_try_operator`, `e2e_err_binding_pattern`, etc.). All are try operator / result binding features unrelated to discovery or tarball changes. Confirmed out of scope per deviation boundary rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both binaries are ready: `meshpkg publish` will produce a correct tarball; `meshc build` will resolve installed package imports
- Plan 02 (update mesh.toml with github_login namespace and publish to registry) can proceed
- Plan 03 (install + `from Slug import ...` verification) depends on Plan 02 completing first

---
*Phase: 147-publish-and-verify*
*Completed: 2026-03-02*
