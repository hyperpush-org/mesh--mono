---
phase: 143-deploy-everything-including-new-stuff-from-v14
plan: 03
subsystem: infra
tags: [github-actions, ci-cd, install-script, meshpkg, release]

# Dependency graph
requires:
  - phase: 143-deploy-everything-including-new-stuff-from-v14
    provides: meshpkg binary in compiler/meshpkg/ Cargo workspace package

provides:
  - build-meshpkg CI job for 4 Unix targets without LLVM dependency
  - meshpkg-v{version}-{target}.tar.gz artifacts included in GitHub Release
  - install.sh installs meshpkg to ~/.mesh/bin/ alongside meshc from same release

affects:
  - v14.0 release process
  - users installing mesh toolchain

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate build job per binary to avoid LLVM cost for non-LLVM binaries"
    - "install_binary() helper for reusable per-binary download/verify/install logic"
    - "Single release tag covers multiple binaries (meshc + meshpkg)"

key-files:
  created: []
  modified:
    - .github/workflows/release.yml
    - tools/install/install.sh

key-decisions:
  - "build-meshpkg is a SEPARATE job from build — avoids paying 15+ min LLVM install cost per runner for a pure-Rust binary"
  - "release job needs: [build, build-meshpkg] — merge-multiple: true in download-artifact picks up all artifacts automatically"
  - "install_binary() helper centralizes download/checksum/extract/install/quarantine logic for any binary name"
  - "Both meshc and meshpkg share the same version file and release tag — single install covers both"

patterns-established:
  - "install_binary NAME VERSION pattern: reusable for any future mesh toolchain binary"

requirements-completed: [DEPLOY-143]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 143 Plan 03: CI/CD meshpkg Distribution Summary

**meshpkg build job added to release.yml (4 Unix targets, no LLVM) and install.sh refactored to install meshpkg alongside meshc via shared install_binary() helper**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T17:26:11Z
- **Completed:** 2026-03-01T17:28:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `build-meshpkg` GitHub Actions job with 4-target matrix (macOS arm64, macOS x86_64, Linux x86_64, Linux arm64) — zero LLVM steps, pure Rust build
- Updated `release` job `needs:` to `[build, build-meshpkg]` so meshpkg tarballs are included in GitHub Release via existing `merge-multiple: true` artifact download
- Refactored `install.sh` to extract reusable `install_binary()` helper; `install()` now calls it for both meshc and meshpkg in sequence using same version and platform detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Add meshpkg build job to release.yml** - `9c8e8308` (feat)
2. **Task 2: Update install.sh to install meshpkg alongside meshc** - `4cf144f4` (feat)

## Files Created/Modified
- `.github/workflows/release.yml` - Added build-meshpkg job (60 lines); updated release job needs
- `tools/install/install.sh` - Added install_binary() helper; refactored install() to call both binaries

## Decisions Made
- Kept build-meshpkg as a separate job (not matrix entry in build) — avoids 15+ min LLVM installation cost on every runner for a binary with zero LLVM dependencies
- Used `merge-multiple: true` in the existing release job download-artifact step — no changes needed to the SHA256SUMS generation or release creation steps
- `install_binary()` helper uses a local tmpdir per call with trap cleanup — simple and safe, no shared state between binary installs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The changes take effect automatically when a v* tag is pushed to the repository.

## Next Phase Readiness
- Phase 143 Plan 03 complete — CI/CD pipeline now builds and distributes meshpkg for v14.0 release
- No blockers: install.sh passes shell syntax check, release.yml structure validated
- v14.0 release is ready: push a `v14.0.0` tag and both meshc + meshpkg will be built, packaged, and included in the GitHub Release

---
*Phase: 143-deploy-everything-including-new-stuff-from-v14*
*Completed: 2026-03-01*

## Self-Check: PASSED

- FOUND: .github/workflows/release.yml
- FOUND: tools/install/install.sh
- FOUND: 143-03-SUMMARY.md
- FOUND commit: 9c8e8308 (feat(143-03): add meshpkg build job to release.yml)
- FOUND commit: 4cf144f4 (feat(143-03): update install.sh to install meshpkg alongside meshc)
