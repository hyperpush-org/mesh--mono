# Benchmark Methodology

## Goal

Compare HTTP throughput and latency of four language implementations of a minimal "Hello, World!" HTTP server:

- **Mesh** — this language (meshc 0.1.0 compiled with LLVM 21, mesh-rt built-in HTTP server)
- **Go** — Go 1.21.6, stdlib `net/http`
- **Rust** — stable toolchain (Feb 2026), axum 0.7 / hyper 1 / tokio
- **Elixir** — Elixir 1.16.3 / OTP 24 erts-12.2.1, plug_cowboy 2.8

## Hardware Topology

Two dedicated Fly.io machines in the same region (`ord`, Chicago):

| Machine | Size | Purpose |
|---------|------|---------|
| `bench-servers` | `performance-2x` (2 dedicated vCPU, 4 GB RAM) | Runs all 4 language servers |
| `bench-loadgen` | `performance-2x` (2 dedicated vCPU, 4 GB RAM) | Runs `hey` load generator |

**Why two VMs in the same region?**
- Dedicated CPUs eliminate CPU sharing between load generator and application servers
- Intra-datacenter WireGuard network (Fly.io 6PN) gives sub-millisecond RTT, minimising network noise
- `performance-2x` machines have dedicated (not burstable) CPUs — results are reproducible

## Benchmark Tool

[**hey**](https://github.com/rakyll/hey) — a Go HTTP load testing tool supporting duration-based runs and IPv6.

```
hey -c 100 -z 30s -t 30 <url>
```

- `-c 100` — 100 concurrent connections (HTTP/1.1 keep-alive)
- `-z 30s` — run for 30 seconds
- `-t 30` — 30-second per-request timeout

## Protocol

HTTP/1.1 over IPv6 (Fly.io 6PN private network). All servers bind `[::]:PORT` for dual-stack compatibility.

## Server Ports

| Port | Language |
|------|----------|
| 3000 | Mesh |
| 3001 | Go |
| 3002 | Rust |
| 3003 | Elixir |

## Endpoints

| Endpoint | Response |
|----------|----------|
| `GET /text` | `200 text/plain` — `Hello, World!\n` |
| `GET /json` | `200 application/json` — `{"message":"Hello, World!"}` |

## Measurement Procedure

For each language × endpoint combination:

1. **Warmup pass:** 30 seconds (`-z 30s`) — discarded. Matches timed run duration to ensure all JIT compilation, code-cache population, and OS-level TCP stack warmup complete before measurement begins.
2. **Timed runs:** 5 × 30-second runs (`-z 30s`). Run 1 is logged but excluded from the average (belt-and-suspenders warmup for runtimes that continue optimising past the warmup pass).
3. **Average req/s** across runs 2–5 reported.
4. **p50 / p99** from the last timed run's hey latency distribution.

Servers are benchmarked sequentially (Mesh → Go → Rust → Elixir) to avoid cross-interference.

## Memory Measurement

RSS (Resident Set Size) logged from `/proc/PID/status` (VmRSS field) on the server VM at 2-second intervals throughout the server lifetime. Values reported as peak across all observations.

Baseline values captured at server startup (before any load):

| Language | Startup RSS |
|----------|------------|
| Mesh     | ~4.9 MB    |
| Go       | ~1.5 MB    |
| Rust     | ~3.4 MB    |
| Elixir   | ~1.6 MB    |

## Servers Under Test

All servers implement identical logic: read the HTTP path, return a static text or JSON body. No database, no middleware overhead beyond what the framework requires.

**Mesh** (`benchmarks/mesh/main.mpl`):
```
HTTP.serve(router |> HTTP.on_get("/text", ...) |> HTTP.on_get("/json", ...), 3000)
```
Compiled to native binary by meshc (LLVM 21 backend), linked against mesh-rt.

**Go** (`benchmarks/go/main.go`):
```go
http.ListenAndServe("[::]:3001", mux)
```
Standard library net/http, `GOMAXPROCS = runtime.NumCPU()`.

**Rust** (`benchmarks/rust/src/main.rs`):
Axum 0.7 / hyper 1 / tokio with multi-threaded runtime.

**Elixir** (`benchmarks/elixir/`):
Plug + Cowboy (plug_cowboy 2.8), MIX_ENV=prod.

## Reproducibility

All server and load generator code is in `benchmarks/` and `benchmarks/fly/`. The two-VM Fly.io setup can be reproduced exactly by following `benchmarks/fly/README.md`.

## Caveats

- All four language servers run co-located on the **same VM** (2 dedicated vCPUs, 4 GB RAM). Under sustained load they share these resources; reported throughput reflects realistic multi-tenant conditions, not the isolated peak each server could sustain alone.
- Mesh's first timed run for `/text` was 4,041 req/s (JIT warmup). It is excluded from the reported average (19,718 req/s); subsequent runs stabilised at ~19,500–20,000 req/s.
- Mesh p50/p99 are absent from the recorded results — the original run predated the latency parser fix in `fly/run-benchmarks.sh`; a fresh run will populate these values.

## Isolated Peak Throughput

The co-located results above reflect realistic multi-tenant conditions (all four servers sharing 2 vCPUs). To measure each server's actual peak throughput, a separate isolated run benchmarks each language alone on the server VM.

### Procedure

For each language (Mesh → Go → Rust → Elixir):

1. Spin up a fresh `performance-2x` Fly.io server VM with `LANG=<language>` — only that language's server starts.
2. Run the same benchmark protocol: 30s warmup + 5 × 30s timed runs, Run 1 excluded, runs 2–5 averaged.
3. Stop and destroy the server VM before starting the next language.

This gives each server exclusive access to both dedicated vCPUs and full 4 GB RAM, eliminating cross-language interference entirely.

### Running Isolated Benchmarks

```bash
# Build and push the server image (same image as co-located — start-server-isolated.sh is the entrypoint)
docker buildx build --platform linux/amd64 \
  -f benchmarks/fly/Dockerfile.servers \
  -t registry.fly.io/bench-mesh/servers:latest .
fly auth docker
docker push registry.fly.io/bench-mesh/servers:latest

# On the load gen VM (or locally with fly ssh):
SERVER_IMAGE=registry.fly.io/bench-mesh/servers:latest \
APP=bench-mesh \
REGION=ord \
bash benchmarks/fly/run-benchmarks-isolated.sh
```

Results are printed to stdout in the same table format as the co-located runner.
