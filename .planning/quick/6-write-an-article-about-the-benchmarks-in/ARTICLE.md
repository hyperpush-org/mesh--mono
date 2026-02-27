I benchmarked Mesh against Go, Rust, and Elixir on real hardware. Here's what I found.

Mesh is my language — statically typed, Hindley-Milner inference, actors as primitives, compiles to native code via LLVM. I wanted to know where it actually lands on throughput before making any claims about it.

**THE NUMBERS**

Two Fly.io `performance-2x` machines (2 dedicated vCPU, 4 GB RAM each) in the same region (Chicago), each server on its own dedicated VM. Load generator on a separate VM. 100 concurrent connections, HTTP/1.1, `hey` load tester. 30 s warmup + 5 timed runs of 30 s each, first run excluded, runs 2–5 averaged.

| Language | /text req/s | /json req/s |
|----------|------------|------------|
| **Mesh** | **29,108** | **28,955** |
| Go       | 30,306     | 29,934     |
| Rust     | 46,244     | 46,234     |
| Elixir   | 12,441     | 12,733     |

Latency (p50 / p99): Mesh 2.77 ms / 16.94 ms, Go 2.95 ms / 8.51 ms, Rust 2.06 ms / 4.55 ms, Elixir 6.74 ms / 25.14 ms.

**THE MESH SERVER**

Nine lines of Mesh:

```
fn handle_text(request) do
  HTTP.response(200, "Hello, World!")
end

fn handle_json(request) do
  HTTP.response(200, "{\"message\":\"Hello, World!\"}")
end

fn main() do
  HTTP.serve((HTTP.router()
    |> HTTP.on_get("/text", handle_text)
    |> HTTP.on_get("/json", handle_json)), 3000)
end
```

Compiled to a native binary via meshc (LLVM 21 backend), linked against mesh-rt. No interpreter, no VM, no JIT. The binary runs cold.

**WHAT THE NUMBERS MEAN**

Mesh beats Elixir by ~134% on throughput. That's the right comparison — both are actor-model languages. Both pay the cost of a supervision tree and scheduled processes. Mesh wins that fight decisively.

Go is 4% ahead of Mesh. Rust is ~59% ahead. Go's `net/http` and Rust's axum/tokio are raw thread-pool HTTP servers with no actor machinery at all. They take a request, dispatch it to a thread or task, return a response. That's it.

Mesh does more. Every HTTP request goes through the mesh-rt actor scheduler: process spawning, mailbox dispatch, the supervision tree. The same infrastructure that gives you fault isolation and location-transparent PIDs handles every request. A 4% gap to Go is the honest cost of that abstraction.

**THE ACTOR OVERHEAD**

It's structural, not accidental. In Go, handling a request means calling a function. In Mesh, handling a request means creating a supervised process, routing a message through its mailbox, and collecting the reply. That machinery exists whether you use it or not.

The payoff is that the same runtime that handles your HTTP server also handles your stateful actors, your supervision trees, your distributed PIDs. You get fault isolation and concurrency primitives for free. Go gives you goroutines. Rust gives you tokio tasks. Mesh gives you an Erlang-style actor runtime baked into the language itself — at 4% overhead vs Go.

**MEMORY**

| Language | Startup RSS |
|----------|------------|
| Mesh     | ~4.9 MB    |
| Go       | ~1.5 MB    |
| Rust     | ~3.4 MB    |
| Elixir   | ~1.6 MB    |

Mesh starts heavier than the others — the actor runtime has real upfront cost. But it produces ~66% more throughput than Elixir at ~3x Elixir's memory. That's a reasonable trade.

**ISOLATED RESULTS**

Those numbers are co-located — all four servers on one 2-vCPU VM, competing for CPU. I ran a follow-up with each server on its own dedicated VM:

| Language | /text req/s | /json req/s |
|----------|------------|------------|
| **Mesh** | **29,108** | **28,955** |
| Go       | 30,306     | 29,934     |
| Rust     | 46,244     | 46,234     |
| Elixir   | 12,441     | 12,733     |

The deltas are informative. Rust jumped +70% — it was badly CPU-starved in the co-located run. Go barely moved (+15%). Elixir barely moved (+5%). Mesh went +47%.

Mesh now sits just behind Go: 29,108 vs 30,306 on `/text`, a 4% gap. Rust at 46,244 is in a different category — axum/tokio with dedicated cores is fast. The Mesh-vs-Elixir gap widens to ~134%.

Latency in isolation: Mesh p50=2.77 ms vs Go p50=2.95 ms — Mesh actually wins on median. The p99 gap (16.9 ms vs 8.5 ms) is the actor overhead tail under load.

**CAVEATS**

The initial co-located run had all four servers sharing one VM. The isolated run above is a better measure of peak throughput. Mesh's first timed run in the co-located run came in at 4,041 req/s — excluded warmup anomaly. In the isolated run the warmup was 28,681 req/s, confirming the 4k result was resource contention, not a Mesh warmup phenomenon.

**METHODOLOGY**

Full setup details: [METHODOLOGY.md](https://github.com/gsd-build/snow/blob/main/benchmarks/METHODOLOGY.md) and [RESULTS.md](https://github.com/gsd-build/snow/blob/main/benchmarks/RESULTS.md).

Mesh: https://meshlang.dev
