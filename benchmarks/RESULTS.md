# Mesh HTTP Benchmark Results

Measured on dedicated Fly.io `performance-2x` machines (2 vCPU, 4 GB RAM each), server and load generator in the same region (`ord`), communicating over Fly.io's private WireGuard network.

See [METHODOLOGY.md](METHODOLOGY.md) for full setup details.

## Summary

| Language | /text req/s | /json req/s |
|----------|------------|------------|
| **Mesh** | **19,718** | **20,483** |
| Go       | 26,278     | 26,175     |
| Rust     | 27,133     | 28,563     |
| Elixir   | 11,842     | 11,481     |

100 concurrent connections, 30 s warmup + 5 timed runs × 30 s, first run excluded, runs 2–5 averaged.
Hardware: Fly.io `performance-2x` (2 dedicated vCPU, 4 GB RAM), region `ord`.

---

## /text endpoint — `GET /text` → `200 text/plain "Hello, World!\n"`

| Language | Run 1 (excl.) | Run 2 (req/s) | Run 3 (req/s) | **Avg runs 2–3** | p50    | p99    |
|----------|--------------|--------------|--------------|-----------------|--------|--------|
| Mesh     | 4,041        | 19,914       | 19,522       | **19,718**      | —      | —      |
| Go       | 25,119       | 26,487       | 26,068       | **26,278**      | 3.1 ms | 14.1 ms |
| Rust     | 28,788       | 26,308       | 27,958       | **27,133**      | 2.8 ms | 14.5 ms |
| Elixir   | 11,743       | 11,752       | 11,932       | **11,842**      | 7.8 ms | 19.7 ms |

_This run used the old 3-run procedure; Run 1 is excluded. Future runs use 5 timed runs with Run 1 excluded, averaging runs 2–5._

_Mesh p50/p99 not recorded — original run predated the latency parser fix; will be populated on next benchmark run._

## /json endpoint — `GET /json` → `200 application/json {"message":"Hello, World!"}`

| Language | Run 1 (excl.) | Run 2 (req/s) | Run 3 (req/s) | **Avg runs 2–3** | p50    | p99    |
|----------|--------------|--------------|--------------|-----------------|--------|--------|
| Mesh     | 19,098       | 20,146       | 20,819       | **20,483**      | —      | —      |
| Go       | 25,263       | 25,856       | 26,494       | **26,175**      | 3.0 ms | 14.1 ms |
| Rust     | 29,024       | 28,853       | 28,273       | **28,563**      | 2.9 ms | 13.7 ms |
| Elixir   | 12,106       | 11,372       | 11,590       | **11,481**      | 7.7 ms | 19.3 ms |

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

## Isolated Peak Throughput Results

Each language benchmarked in isolation on a dedicated `performance-2x` VM (2 vCPU, 4 GB RAM).
Same protocol: 100 connections, 30s warmup + 5 × 30s timed runs, Run 1 excluded.

_Results to be populated after isolated run — see `benchmarks/fly/run-benchmarks-isolated.sh`._

### /text endpoint

| Language | Run 1 (excl.) | Runs 2–5 avg (req/s) | p50 | p99 | Peak RSS |
|----------|--------------|----------------------|-----|-----|----------|
| Mesh     |              |                      |     |     |          |
| Go       |              |                      |     |     |          |
| Rust     |              |                      |     |     |          |
| Elixir   |              |                      |     |     |          |

### /json endpoint

| Language | Run 1 (excl.) | Runs 2–5 avg (req/s) | p50 | p99 | Peak RSS |
|----------|--------------|----------------------|-----|-----|----------|
| Mesh     |              |                      |     |     |          |
| Go       |              |                      |     |     |          |
| Rust     |              |                      |     |     |          |
| Elixir   |              |                      |     |     |          |

### Comparison: Co-located vs Isolated

| Language | Co-located /text | Isolated /text | Delta | Co-located /json | Isolated /json | Delta |
|----------|-----------------|----------------|-------|-----------------|----------------|-------|
| Mesh     | 19,718          |                |       | 20,483          |                |       |
| Go       | 26,278          |                |       | 26,175          |                |       |
| Rust     | 27,133          |                |       | 28,563          |                |       |
| Elixir   | 11,842          |                |       | 11,481          |                |       |

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
