---
phase: 123-performance-benchmarks
plan: 03
subsystem: infra
tags: [fly.io, docker, wrk, benchmarks, load-testing, devops]

# Dependency graph
requires:
  - phase: 123-performance-benchmarks-01
    provides: Mesh and Go benchmark servers (ports 3000, 3001)
  - phase: 123-performance-benchmarks-02
    provides: Rust and Elixir benchmark servers (ports 3002, 3003)
provides:
  - benchmarks/fly/Dockerfile.servers: Docker image for Fly.io server VM (builds meshc from compiler/ workspace, pre-builds Rust, fetches Elixir deps)
  - benchmarks/fly/start-servers.sh: Starts all 4 language servers with health checks; logs RSS every 2s to stdout
  - benchmarks/fly/Dockerfile.loadgen: Docker image for load gen VM with wrk built from source
  - benchmarks/fly/run-benchmarks.sh: wrk runner targeting SERVER_HOST; 10s warmup + 30s x3 timed runs; formatted results table
  - benchmarks/fly/README.md: Step-by-step Fly.io two-VM deployment instructions
affects: [123-03-continuation]

# Tech tracking
tech-stack:
  added: [wrk (from source), Docker buildx (linux/amd64), Fly.io machines API]
  patterns: [two-VM topology with private WireGuard network, RSS sampling via /proc/PID/status, wrk warmup+timed-run pattern]

key-files:
  created:
    - benchmarks/fly/Dockerfile.servers
    - benchmarks/fly/start-servers.sh
    - benchmarks/fly/Dockerfile.loadgen
    - benchmarks/fly/run-benchmarks.sh
    - benchmarks/fly/README.md
  modified: []

key-decisions:
  - "Mesh compiler built from compiler/ workspace in Dockerfile (not mesher/Cargo.toml — mesher/ contains only macOS arm64 binary)"
  - "Internal DNS hostname (bench-servers.vm.bench-mesh.internal) recommended over raw IPv6 to avoid bracket notation issues with wrk"
  - "performance-2x Fly.io machine size (2 dedicated CPUs, 4GB RAM) for both VMs — dedicated CPUs eliminate CPU sharing between tenants"
  - "RSS sampled from /proc/PID/status (VmRSS) every 2s, logged to stdout; load gen VM can grep server logs to extract peak values"
  - "Warmup run (10s, discarded) + 3 timed runs (30s each, averaged) per endpoint per language"

patterns-established:
  - "Two-VM topology pattern: server VM + load gen VM in same Fly.io region; wrk connects via private WireGuard network"
  - "RSS logging pattern: stdout CSV lines 'RSS,<lang>,<epoch>,<kB>' filtered by grep '^RSS,' from fly logs"

requirements-completed: [BENCH-05, BENCH-06]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 123 Plan 03: Fly.io Benchmark Infrastructure Summary

**Two-VM Fly.io benchmark infrastructure (Dockerfiles + scripts + README) for running dedicated hardware HTTP throughput tests with true network separation — paused at Task 4 checkpoint awaiting human to run benchmarks and provide results**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T08:18:25Z
- **Completed:** 2026-02-26T08:21:00Z (partial — Tasks 1-3 complete, paused at Task 4 checkpoint)
- **Tasks:** 3 of 5 (Tasks 1-3 complete; Task 4 is human-action checkpoint; Task 5 pending)
- **Files modified:** 5

## Accomplishments
- Server VM Docker image builds meshc from Rust workspace source (correct linux/amd64 arch) and pre-builds all language servers
- Load gen Docker image installs wrk from source with 100-connection benchmark runner across all 4 languages and both endpoints
- Complete step-by-step Fly.io deployment README covering app creation, two-VM launch, private DNS, log collection, and cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1: Server VM Docker image and startup script** - `73881737` (feat)
2. **Task 2: Load generator Docker image and benchmark script** - `4fbdc589` (feat)
3. **Task 3: Fly.io deployment README** - `fe37ef95` (feat)

Tasks 4 and 5 are pending the human-action checkpoint.

## Files Created/Modified
- `benchmarks/fly/Dockerfile.servers` - Ubuntu 22.04 server image: builds meshc from compiler/ Rust workspace, installs Go 1.21 + Rust stable + Elixir/Erlang, pre-builds Rust server and fetches Elixir deps
- `benchmarks/fly/start-servers.sh` - Starts all 4 servers (Mesh/Go/Rust/Elixir) with health checks on correct ports; logs RSS,<lang>,<epoch>,<kB> to stdout every 2s for memory tracking
- `benchmarks/fly/Dockerfile.loadgen` - Minimal Ubuntu 22.04 load gen image with wrk built from source
- `benchmarks/fly/run-benchmarks.sh` - wrk benchmark runner: reads SERVER_HOST env var, waits for server readiness, runs 10s warmup + 30s x3 timed runs per endpoint (text/json) per language (Mesh/Go/Rust/Elixir), prints formatted results table
- `benchmarks/fly/README.md` - Step-by-step deployment instructions for two-VM Fly.io topology including Docker buildx (linux/amd64 for Apple Silicon), machine launch (performance-2x), internal DNS hostname usage, results collection, RSS extraction, runtime version check, and cleanup

## Decisions Made
- Mesh compiler source is in `compiler/` workspace (not `mesher/` — that directory only contains a pre-built macOS arm64 binary). Dockerfile.servers copies the full workspace and builds with `cargo build --release -p meshc`.
- Internal DNS hostname (`bench-servers.vm.bench-mesh.internal`) recommended over raw IPv6 private address to avoid bracket notation complexity with wrk. Both options documented in README.
- performance-2x machines (2 dedicated CPUs, 4GB RAM) for both VMs per plan specification.
- RSS tracked via `/proc/PID/status` (VmRSS field) on Linux server VM, logged as CSV to stdout. Load gen retrieves via `fly logs | grep '^RSS,'`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Dockerfile.servers to build from compiler/ workspace**
- **Found during:** Task 1 (server VM Docker image)
- **Issue:** Plan template assumed `mesher/Cargo.toml` exists. Actual layout: `mesher/` contains only a macOS arm64 binary; Rust source is in `compiler/` with workspace `Cargo.toml` at repo root.
- **Fix:** COPY root `Cargo.toml`, `Cargo.lock`, and `compiler/` directory; build with `cargo build --release -p meshc`
- **Files modified:** benchmarks/fly/Dockerfile.servers
- **Verification:** Dockerfile builds from correct source paths; plan's guidance explicitly says "adapt the COPY and cargo build path based on actual project layout"
- **Committed in:** 73881737 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/incorrect path)
**Impact on plan:** Required for the Dockerfile to build successfully. No scope creep.

## Issues Encountered

None — the path adaptation was anticipated by the plan ("adapt based on actual project layout").

## User Setup Required

**Human benchmark run required.** See `benchmarks/fly/README.md` for step-by-step instructions:
1. Follow README to provision two performance-2x Fly.io VMs
2. Wait for server VM logs: `=== All servers running ===`
3. Run load gen VM with SERVER_HOST set to server VM's private DNS hostname
4. Collect full results table (req/s, p50, p99 per language per endpoint) from load gen logs
5. Collect Peak RSS: `fly logs --machine <server-id> | grep '^RSS,'`
6. Note runtime versions: `fly ssh console -s -a bench-mesh -C "go version && rustc --version && elixir --version && meshc --version"`
7. Note Fly.io region and machine spec used
8. Paste all of the above back to continue Task 5 (populate RESULTS.md, METHODOLOGY.md, chart, README.md)

## Next Phase Readiness
- All Fly.io infrastructure files committed and ready to use
- Task 5 (RESULTS.md, METHODOLOGY.md, throughput chart, README.md Performance section) pending human benchmark run results
- No blockers once benchmark results are provided

## Self-Check: PASSED

All files verified present:
- `benchmarks/fly/Dockerfile.servers` - FOUND
- `benchmarks/fly/start-servers.sh` - FOUND (executable)
- `benchmarks/fly/Dockerfile.loadgen` - FOUND
- `benchmarks/fly/run-benchmarks.sh` - FOUND (executable)
- `benchmarks/fly/README.md` - FOUND

Commits verified:
- `73881737` - FOUND (feat(123-03): server VM Dockerfile and start-servers.sh)
- `4fbdc589` - FOUND (feat(123-03): load gen Dockerfile and run-benchmarks.sh)
- `fe37ef95` - FOUND (feat(123-03): Fly.io two-VM deployment README)

---
*Phase: 123-performance-benchmarks*
*Completed (partial): 2026-02-26*
