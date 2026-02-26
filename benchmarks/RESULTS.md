# Mesh HTTP Benchmark Results

Measured on dedicated Fly.io `performance-2x` machines (2 vCPU, 4 GB RAM each), server and load generator in the same region (`ord`), communicating over Fly.io's private WireGuard network.

See [METHODOLOGY.md](METHODOLOGY.md) for full setup details.

## Summary

| Language | /text req/s | /json req/s |
|----------|------------|------------|
| **Mesh** | **14,493** | **20,021** |
| Go       | 25,892     | 25,871     |
| Rust     | 27,685     | 28,716     |
| Elixir   | 11,809     | 11,689     |

100 concurrent connections, 30 s timed runs × 3 averaged, 10 s warmup discarded.
Hardware: Fly.io `performance-2x` (2 dedicated vCPU, 4 GB RAM), region `ord`.

> **Note on Mesh /text avg:** Mesh's first timed run measured 4,041 req/s (cold JIT warmup — meshc
> compiles the program on first run, and mesh-rt JIT-optimizes on first traffic). Runs 2 and 3
> stabilized at ~19,500–20,000 req/s. The table average (14,493) includes Run 1; the steady-state
> throughput is ~19,700 req/s for /text.

---

## /text endpoint — `GET /text` → `200 text/plain "Hello, World!\n"`

| Language | Run 1 (req/s) | Run 2 (req/s) | Run 3 (req/s) | **Avg (req/s)** | p50    | p99    |
|----------|--------------|--------------|--------------|----------------|--------|--------|
| Mesh     | 4,041        | 19,914       | 19,522       | **14,493**     | —      | —      |
| Go       | 25,119       | 26,487       | 26,068       | **25,892**     | 3.1 ms | 14.1 ms |
| Rust     | 28,788       | 26,308       | 27,958       | **27,685**     | 2.8 ms | 14.5 ms |
| Elixir   | 11,743       | 11,752       | 11,932       | **11,809**     | 7.8 ms | 19.7 ms |

_p50/p99 for Mesh: hey latency percentiles not captured by log parser for runs 2–3 (Run 1 cold-start: p50=19 ms, p99=220 ms)._

## /json endpoint — `GET /json` → `200 application/json {"message":"Hello, World!"}`

| Language | Run 1 (req/s) | Run 2 (req/s) | Run 3 (req/s) | **Avg (req/s)** | p50    | p99    |
|----------|--------------|--------------|--------------|----------------|--------|--------|
| Mesh     | 19,098       | 20,146       | 20,819       | **20,021**     | —      | —      |
| Go       | 25,263       | 25,856       | 26,494       | **25,871**     | 3.0 ms | 14.1 ms |
| Rust     | 29,024       | 28,853       | 28,273       | **28,716**     | 2.9 ms | 13.7 ms |
| Elixir   | 12,106       | 11,372       | 11,590       | **11,689**     | 7.7 ms | 19.3 ms |

---

## Peak RSS (baseline at server startup, before load)

| Language | Peak RSS   |
|----------|-----------|
| Mesh     | ~4.9 MB    |
| Go       | ~1.5 MB    |
| Rust     | ~3.4 MB    |
| Elixir   | ~1.6 MB    |

_RSS captured from `/proc/PID/status` (VmRSS) at server startup. During-load peak RSS logging via PID tracking had an issue with Mesh's process tree; values above are pre-load baselines._

---

## Runtime Versions

| Language | Runtime                         | Framework/Server          |
|----------|---------------------------------|---------------------------|
| Mesh     | meshc 0.1.0 + mesh-rt           | Built-in HTTP.serve       |
| Go       | go1.21.6 linux/amd64            | stdlib net/http            |
| Rust     | stable (Feb 2026), edition 2021 | axum 0.7, hyper 1, tokio  |
| Elixir   | Elixir 1.16.3 / OTP 24 erts-12.2.1 | plug_cowboy 2.8        |

---

## Hardware & Topology

- **Server VM:** Fly.io `performance-2x` (2 dedicated vCPU, 4 GB RAM), region `ord`
- **Load gen VM:** Fly.io `performance-2x` (2 dedicated vCPU, 4 GB RAM), same region `ord`
- **Network:** Fly.io private WireGuard (6PN IPv6), intra-datacenter — sub-millisecond RTT
- **Tool:** `hey` (Go HTTP load tester) — 100 concurrent connections (`-c 100`), 30 s timed (`-z 30s`), 30 s per-request timeout
- **Protocol:** HTTP/1.1
- All 4 servers on one VM; load gen on a separate VM to avoid CPU contention
