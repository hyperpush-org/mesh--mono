# Fly.io Benchmark Infrastructure

Two dedicated Fly.io VMs (server + load generator) for running the Mesh HTTP throughput benchmark with true network separation.

## Architecture

```
[Load Gen VM]  ---hey---> [Server VM]
  performance-2x             performance-2x
  (2 CPUs, 4GB RAM)         (2 CPUs, 4GB RAM)
  run-benchmarks.sh          start-servers.sh
                             Mesh  :3000
                             Go    :3001
                             Rust  :3002
                             Elixir:3003
```

Both VMs communicate over Fly.io's private WireGuard network (~0.1ms intra-datacenter latency). Using two dedicated VMs eliminates CPU contention between load generator and servers, which would skew results when running on a single machine.

## Prerequisites

- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and logged in (`fly auth login`)
- Docker with buildx support (`docker buildx version`)
- A Fly.io account

## Step-by-Step Instructions

### 1. Create a Fly.io app

```bash
fly apps create bench-mesh
```

### 2. Build and push the server VM image

> **Note for Apple Silicon Macs:** The `--platform linux/amd64` flag is required. The Dockerfile builds `meshc` from source (Cargo workspace), which takes 10-15 minutes.

```bash
# From the repo root:
docker buildx build --platform linux/amd64 \
  -f benchmarks/fly/Dockerfile.servers \
  -t registry.fly.io/bench-mesh/servers:latest \
  .
```

Authenticate with Fly.io registry and push:

```bash
fly auth docker
docker push registry.fly.io/bench-mesh/servers:latest
```

### 3. Run the server VM

```bash
fly machine run registry.fly.io/bench-mesh/servers:latest \
  --app bench-mesh \
  --name bench-servers \
  --vm-size performance-2x \
  --region ord
```

Note the machine ID printed in the output. Wait until server logs show `=== All servers running ===`:

```bash
fly logs --machine <server-machine-id> --app bench-mesh
```

### 4. Get the server VM's private IP address

```bash
fly machine list --app bench-mesh
```

The private IP has format: `fdaa:0:xxxx:a7b:xxxx:xxxx:xxxx:2`

Alternatively, use the internal DNS hostname which avoids IPv6 bracket notation issues:

```
bench-servers.vm.bench-mesh.internal
```

### 5. Build and push the load gen image

The load gen Dockerfile only needs files from `benchmarks/fly/`, so the build context is smaller:

```bash
# From the repo root:
docker buildx build --platform linux/amd64 \
  -f benchmarks/fly/Dockerfile.loadgen \
  -t registry.fly.io/bench-mesh/loadgen:latest \
  .
docker push registry.fly.io/bench-mesh/loadgen:latest
```

### 6. Run the load gen VM

Set `SERVER_HOST` to the server VM's private DNS hostname (recommended) or private IPv6 address:

```bash
# Using internal DNS (recommended):
fly machine run registry.fly.io/bench-mesh/loadgen:latest \
  --app bench-mesh \
  --name bench-loadgen \
  --vm-size performance-2x \
  --region ord \
  --env SERVER_HOST=bench-servers.vm.bench-mesh.internal

# Using private IPv6 (if DNS not working):
fly machine run registry.fly.io/bench-mesh/loadgen:latest \
  --app bench-mesh \
  --name bench-loadgen \
  --vm-size performance-2x \
  --region ord \
  --env "SERVER_HOST=[fdaa:0:xxxx:a7b:xxxx:xxxx:xxxx:2]"
```

> **Note on IPv6:** If using a raw IPv6 address with curl/hey, wrap it in brackets: `[fdaa:...]`. The internal DNS hostname avoids this entirely.

### 7. Collect benchmark results

Stream the load gen VM logs to watch benchmark progress in real time:

```bash
fly logs --machine <loadgen-machine-id> --app bench-mesh
```

When complete, the output ends with a formatted results table showing req/s, p50, and p99 for all four languages across both `/text` and `/json` endpoints.

### 8. Collect peak RSS memory data

```bash
fly logs --machine <server-machine-id> --app bench-mesh | grep '^RSS,'
```

Each line has format: `RSS,<Language>,<unix_timestamp>,<VmRSS_kB>`

Take the maximum VmRSS value per language across all lines and convert to MB (divide by 1024).

### 9. Get runtime versions

```bash
fly ssh console -s -a bench-mesh -C "go version && rustc --version && elixir --version && meshc --version"
```

### 10. Cleanup

```bash
fly machine stop bench-servers bench-loadgen --app bench-mesh
fly machine destroy bench-servers bench-loadgen --app bench-mesh --yes
```

Or destroy the entire app:

```bash
fly apps destroy bench-mesh --yes
```

## Isolated Peak Throughput Run

The isolated benchmark runs each language server alone on the server VM, giving it exclusive access to both CPUs. The `run-benchmarks-isolated.sh` script handles the full machine lifecycle automatically — no manual server VM management required.

### Steps

1. Build and push the server image (same image as co-located — `start-server-isolated.sh` is used as the per-language entrypoint):

```bash
docker buildx build --platform linux/amd64 \
  -f benchmarks/fly/Dockerfile.servers \
  -t registry.fly.io/bench-mesh/servers:latest .
fly auth docker
docker push registry.fly.io/bench-mesh/servers:latest
```

2. Run the isolated orchestrator from the load gen VM (or via `fly ssh`):

```bash
SERVER_IMAGE=registry.fly.io/bench-mesh/servers:latest \
APP=bench-mesh \
REGION=ord \
bash benchmarks/fly/run-benchmarks-isolated.sh
```

3. The script loops through Mesh → Go → Rust → Elixir. For each language it:
   - Destroys any leftover `bench-isolated-server` machine from a prior run
   - Launches a fresh `performance-2x` machine with `LANG=<language>` and `start-server-isolated.sh` as entrypoint
   - Polls logs for the `SERVER_READY` signal, then polls HTTP for reachability
   - Runs hey with the same parameters (100 connections, 30s warmup + 5 × 30s timed runs, Run 1 excluded)
   - Collects peak RSS from the machine logs
   - Stops and destroys the machine before the next language

4. Results are printed as a summary table when all languages complete.

> **Note:** Each language takes roughly 10 minutes (warmup + 5 timed runs). The full loop for all four languages takes approximately 40 minutes.

## Important Notes

- **Same region for both VMs** gives ~0.1ms intra-datacenter latency via Fly.io's private WireGuard network
- **performance-2x** = 2 dedicated CPUs, 4 GB RAM — dedicated means no CPU time-sharing with other tenants
- **Build time:** The server image takes 10-15 minutes due to Rust compilation (`meshc` + the Rust benchmark server). The load gen image is much faster (~2 minutes).
- **Server ready signal:** The server machine logs `=== All servers running ===` when all four language servers have passed health checks. Wait for this before launching the load gen VM.
- **Mesh server:** If `meshc` is not found in PATH, the Mesh server is skipped with a warning and only Go/Rust/Elixir are benchmarked.

## Interpreting Results

The results table shows:

| Column | Meaning |
|--------|---------|
| Req/s | Average requests per second across runs 2–5 (30s warmup + 5 timed runs, Run 1 excluded) |
| p50 | Median response latency (50th percentile) |
| p99 | 99th percentile response latency (long tail) |
| Peak RSS | Maximum resident set size (MB) during the benchmark run |

- **Higher Req/s is better**
- **Lower latency (p50/p99) is better**
- **Lower Peak RSS is better** (memory efficiency)

The `/text` endpoint returns `text/plain` (minimal serialization) and `/json` returns `application/json` (JSON encoding). Comparing both shows whether JSON overhead affects relative language performance.

## Configuration

Edit `run-benchmarks.sh` to change benchmark parameters:

```bash
CONNECTIONS=100      # concurrent connections
WARMUP_DURATION=30   # warmup seconds (results discarded)
BENCH_DURATION=30    # timed run seconds
RUNS=5               # timed runs (Run 1 excluded from average)
DISCARD_RUNS=1       # first N timed runs excluded (JIT warmup)
```
