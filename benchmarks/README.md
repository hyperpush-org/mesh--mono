# Mesh HTTP Benchmark

Compares HTTP throughput and latency of four language implementations of a minimal `Hello, World!` HTTP server: **Mesh**, **Go**, **Rust**, and **Elixir**.

See [RESULTS.md](RESULTS.md) for published numbers and [METHODOLOGY.md](METHODOLOGY.md) for the full measurement methodology.

## Directory Layout

```
benchmarks/
├── mesh/               Mesh HTTP server (main.mpl)
├── go/                 Go HTTP server (net/http)
├── rust/               Rust HTTP server (axum + tokio)
├── elixir/             Elixir HTTP server (plug_cowboy)
├── fly/                Fly.io two-VM infrastructure
│   ├── README.md           Fly.io step-by-step instructions
│   ├── Dockerfile.servers  Server VM image (builds all 4 languages)
│   ├── Dockerfile.loadgen  Load generator VM image (hey)
│   ├── start-servers.sh    Server VM entrypoint
│   └── run-benchmarks.sh   Load generator entrypoint
├── run_benchmarks.sh   Local runner (wrk-based, approximate)
├── RESULTS.md          Published benchmark results
└── METHODOLOGY.md      Measurement methodology details
```

## Endpoints

| Endpoint | Response |
|----------|----------|
| `GET /text` | `200 text/plain` — `Hello, World!\n` |
| `GET /json` | `200 application/json` — `{"message":"Hello, World!"}` |

---

## Option 1 — Local Run (Quick / Approximate)

Runs all four servers on your local machine and load-tests them with `wrk`. Takes about 15 minutes.

**Results will differ from published numbers** because:
- Your hardware is different from the Fly.io `performance-2x` VMs
- All four servers share your CPU (published results use a dedicated server VM with no load generator co-located)
- The local script uses `wrk`; published results use `hey`

### Prerequisites

| Tool | Required for | Install |
|------|-------------|---------|
| `wrk` | Load generator | `brew install wrk` · `apt install wrk` |
| `go` | Go server | [go.dev/dl](https://go.dev/dl/) 1.21+ |
| `cargo` | Rust server | [rustup.rs](https://rustup.rs) (stable toolchain) |
| `mix` | Elixir server | [elixir-lang.org/install](https://elixir-lang.org/install.html) 1.16+ / OTP 24+ |
| `meshc` | Mesh server | see below |

Missing tools are detected at startup and those languages are skipped — you don't need all four.

**Installing meshc** (Rust required):

```bash
# From the repo root:
cargo install --path compiler/meshc
```

### Running locally

```bash
# From the repo root:
bash benchmarks/run_benchmarks.sh
```

What happens:
1. Each available server is built and started on its assigned port (Mesh :3000, Go :3001, Rust :3002, Elixir :3003).
2. For each language × endpoint: 10-second warmup (discarded), then 3 × 30-second timed runs.
3. A summary table is printed with req/s, p50, p99, and peak RSS per language.
4. All server processes are cleaned up on exit.

---

## Option 2 — Fly.io Run (Reproduces Published Results)

Two dedicated Fly.io `performance-2x` VMs (2 vCPU, 4 GB RAM each) in the same region. One VM runs all four servers; a separate VM runs the `hey` load generator over Fly.io's private WireGuard network. This is the exact setup that produced the numbers in [RESULTS.md](RESULTS.md).

**Cost:** Approximately $1–3 for a single run. Fly.io `performance-2x` machines bill by the second and are destroyed after the benchmark completes.

### Prerequisites

- **flyctl** — `brew install flyctl` or `curl -L https://fly.io/install.sh | sh`
- **Logged in** — `fly auth login`
- **A Fly.io account** — free tier works; no paid plan required
- **Docker with buildx** — verify with `docker buildx version`

### Step 1 — Create the app

```bash
fly apps create bench-mesh
```

If `bench-mesh` is taken, use any unique name and substitute it in every command below.

### Step 2 — Build and push the server image

The server image builds `meshc` from source (Rust + LLVM 21). This takes **10–15 minutes** on the first build.

```bash
# Run from the repo root (the Dockerfile needs compiler/ and benchmarks/)

# Apple Silicon Mac: --platform linux/amd64 is required
docker buildx build --platform linux/amd64 \
  -f benchmarks/fly/Dockerfile.servers \
  -t registry.fly.io/bench-mesh/servers:latest \
  .

# Authenticate with Fly.io's registry, then push
fly auth docker
docker push registry.fly.io/bench-mesh/servers:latest
```

### Step 3 — Launch the server VM

```bash
fly machine run registry.fly.io/bench-mesh/servers:latest \
  --app bench-mesh \
  --name bench-servers \
  --vm-size performance-2x \
  --region ord
```

Note the machine ID printed in the output (format: `<hex>`). Wait until all four language servers are up:

```bash
fly logs --machine <server-machine-id> --app bench-mesh
```

Look for the line `=== All servers running ===`. All four servers must be ready before launching the load generator, or the benchmark will report `N/A` for servers that haven't started yet.

Expected startup sequence in the logs:
```
Mesh ready on port 3000
Go ready on port 3001
Rust ready on port 3002
Elixir ready on port 3003
=== All servers running ===
```

### Step 4 — Build and push the load generator image

The load generator image only contains `hey` (a Go binary) and the benchmark script — much faster to build:

```bash
# Run from the repo root:
docker buildx build --platform linux/amd64 \
  -f benchmarks/fly/Dockerfile.loadgen \
  -t registry.fly.io/bench-mesh/loadgen:latest \
  .

docker push registry.fly.io/bench-mesh/loadgen:latest
```

### Step 5 — Launch the load generator VM

Use the internal DNS hostname for `SERVER_HOST` — it resolves to the server VM's IPv6 address and avoids bracket notation issues:

```bash
fly machine run registry.fly.io/bench-mesh/loadgen:latest \
  --app bench-mesh \
  --name bench-loadgen \
  --vm-size performance-2x \
  --region ord \
  --env SERVER_HOST=bench-servers.vm.bench-mesh.internal
```

Note the load generator machine ID from the output.

> If internal DNS is not resolving, find the server VM's private IPv6 address with `fly machine list --app bench-mesh` and use `--env "SERVER_HOST=[fdaa:0:xxxx:...]"` (with brackets around the IPv6 address).

### Step 6 — Watch the benchmark run

Stream the load generator logs to watch progress in real time:

```bash
fly logs --machine <loadgen-machine-id> --app bench-mesh
```

The benchmark runs sequentially (Mesh → Go → Rust → Elixir). For each language, it tests `/text` then `/json`, with a 30-second warmup followed by 5 × 30-second timed runs. Total run time is approximately 15–20 minutes.

Progress looks like:
```
--- Benchmarking Mesh (port 3000) ---
  Endpoint: /text
  Warmup done. Running 5 timed runs...
    Run 1: 4041.23 req/s  p50=N/A  p99=N/A  [warmup — excluded]
    Run 2: 19914.11 req/s  p50=4.9 ms  p99=14.2 ms
    ...
```

When complete, the output ends with a formatted results table:
```
/text endpoint:
  Mesh        19718         ...
  Go          26278         ...
  Rust        27133         ...
  Elixir      11842         ...
```

### Step 7 — Collect RSS memory data (optional)

Peak resident memory is logged by the server VM throughout the run:

```bash
fly logs --machine <server-machine-id> --app bench-mesh | grep '^RSS,'
```

Each line: `RSS,<Language>,<unix_timestamp>,<VmRSS_kB>`

Take the maximum `VmRSS_kB` value per language across all lines and divide by 1024 for MB.

### Step 8 — Collect runtime version info (optional)

```bash
fly ssh console -s -a bench-mesh
# Then inside the VM:
go version
rustc --version
elixir --version
meshc --version
```

### Step 9 — Destroy machines

```bash
fly machine destroy bench-servers bench-loadgen --app bench-mesh --yes
```

Or destroy the entire app (removes all machines and the app):

```bash
fly apps destroy bench-mesh --yes
```

---

## Benchmark Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Connections | 100 | Concurrent HTTP/1.1 keep-alive connections |
| Warmup | 30s | Results discarded — ensures TCP stack and runtime caches are warm |
| Timed runs | 5 × 30s | Run 1 excluded from average (JIT/code-cache warmup) |
| Average | Runs 2–5 | 4 runs averaged for reported req/s |
| Latency | p50 / p99 | From the last timed run |
| Tool | `hey` | Go HTTP load tester; IPv6-capable |

To change parameters, edit `benchmarks/fly/run-benchmarks.sh`:

```bash
CONNECTIONS=100
WARMUP_DURATION=30
BENCH_DURATION=30
RUNS=5
DISCARD_RUNS=1
```

---

## Servers Under Test

All four servers implement identical logic: read the HTTP path, return a static body. No database, no middleware beyond what the framework requires.

| Language | Framework | Port | Source |
|----------|-----------|------|--------|
| Mesh | Built-in `HTTP.serve` | 3000 | `benchmarks/mesh/main.mpl` |
| Go | stdlib `net/http` | 3001 | `benchmarks/go/main.go` |
| Rust | axum 0.7 / hyper 1 / tokio | 3002 | `benchmarks/rust/src/main.rs` |
| Elixir | plug_cowboy 2.8 | 3003 | `benchmarks/elixir/` |

---

## Interpreting Results

- **Req/s** — higher is better. Published averages exclude Run 1 to eliminate cold-start artifacts.
- **p50 / p99** — lower is better. p99 shows worst-case latency tail.
- **Peak RSS** — lower is better. Memory footprint under sustained load.
- All four servers run on **one VM**. Results reflect co-located throughput, not each language's isolated maximum. See [METHODOLOGY.md](METHODOLOGY.md) for caveats.
