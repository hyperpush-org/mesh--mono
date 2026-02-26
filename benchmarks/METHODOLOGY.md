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

1. **Warmup run:** 10 seconds (`-z 10s`) — discarded
2. **Timed runs:** 3 × 30-second runs (`-z 30s`)
3. **Average req/s** across 3 runs reported
4. **p50 / p99** from last timed run's hey latency distribution

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

- All 4 language servers run on the **same VM**. Under sustained load, they compete for the 2 dedicated CPUs and 4 GB RAM. Results reflect realistic co-located throughput, not isolated single-server maximum throughput.
- Mesh's first timed run for `/text` was 4,041 req/s due to JIT warmup; subsequent runs stabilised at ~19,500–20,000 req/s. The reported average (14,493) includes this cold-start run.
- p50/p99 for Mesh were not reliably captured — the hey latency percentile format was not matched by the log parser for the warmed-up runs.
