[Previously: I built a programming language in 12 days with Claude — [link]]

That post described getting to v10.0: lexer, parser, type inference, LLVM codegen, actors, distributed nodes, a docs site, and an ORM. 111,000 lines of Rust. Since then, it kept going.

Three more milestones shipped. The ORM grew a full query builder — JOINs, aggregations, upserts, subqueries. Mesher, the production error monitoring backend written entirely in Mesh, got rewritten from raw SQL to the ORM: 49 query rewrites, zero failures, all 8 HTTP endpoints verified end-to-end. The compiler hit 168,500 lines. Twenty-one milestones in twenty days.

At some point the question stops being "does it work?" and starts being "how fast is it?"

**THE QUESTION**

Mesh is an actor-model language. Every HTTP request goes through the runtime: process spawning, mailbox dispatch, supervision trees. That machinery is the whole point — it's what gives you fault isolation and distributed PIDs and let-it-crash. But it's not free.

I wanted an honest number before claiming anything.

**THE SETUP**

Two Fly.io `performance-2x` VMs in the same region (Chicago, `ord`): one runs the server, one runs the load generator. They talk over Fly's private WireGuard network — sub-millisecond RTT, no public internet involved.

`hey` load tester: 100 concurrent connections, HTTP/1.1. Warmup run of 30 seconds (excluded), then five timed runs of 30 seconds, averaged.

The Mesh server is nine lines:

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

Compiled to a native binary. No interpreter, no VM, no JIT. The binary runs cold.

**THE NUMBERS**

| Language | /text req/s | /json req/s |
|----------|------------|------------|
| **Mesh** | **29,108** | **28,955** |
| Go       | 30,306     | 29,934     |
| Rust     | 46,244     | 46,234     |
| Elixir   | 12,441     | 12,733     |

Latency (p50 / p99): Mesh 2.77 ms / 16.94 ms, Go 2.95 ms / 8.51 ms, Rust 2.06 ms / 4.55 ms, Elixir 6.74 ms / 25.14 ms.

**WHAT THE NUMBERS MEAN**

Start with the comparison that matters: Mesh vs Elixir. Both are actor-model languages. Both pay for supervision trees, scheduled processes, and message passing on every request. Mesh wins that fight by 134% — more than double the throughput at comparable latency. The BEAM is a remarkable piece of engineering but it's carrying thirty years of hot code reloading, distributed Erlang, and a bytecode VM. Mesh compiles to native code via LLVM. The gap is expected.

Go is 4% ahead. That's the real headline. Go's `net/http` has no actor machinery — a request comes in, it gets dispatched to a goroutine, a response goes out. Mesh routes every request through the actor scheduler: spawns a process, delivers a message to its mailbox, collects the reply through the supervision tree. That infrastructure exists whether you use it or not. Four percent is what it costs.

Rust is 59% ahead. axum on top of hyper on top of tokio with dedicated cores — that's an async I/O runtime purpose-built for throughput. No actor overhead, no GC. That's the ceiling.

Mesh p50 latency (2.77 ms) is lower than Go's (2.95 ms). The actor runtime is fast. The p99 gap — 16.9 ms vs 8.5 ms — is where the overhead tail shows up under load.

**THE ISOLATED RUN**

The numbers above have a catch: all four servers were running on the same 2-vCPU VM during the co-located benchmark, competing for CPU under load. That's fine as a relative comparison. It's not ideal for measuring peak throughput.

I ran a second benchmark with each language on its own dedicated VM — sequential, no sharing. The results shifted significantly.

| Language | Co-located /text | Isolated /text | Delta |
|----------|-----------------|----------------|-------|
| Mesh     | 19,718          | 29,108         | +47%  |
| Go       | 26,278          | 30,306         | +15%  |
| Rust     | 27,133          | 46,244         | +70%  |
| Elixir   | 11,842          | 12,441         | +5%   |

Rust was being throttled badly — it jumped 70% when given its own CPUs. Elixir barely moved; the BEAM scheduler is already conservative about CPU usage. Go moved modestly. Mesh went up 47%.

Two things stand out. First, the co-located run understated Mesh's performance more than it understated Go's — the actor runtime benefits more from uncontested CPUs. Second, Mesh's first run in the co-located benchmark came in at 4,041 req/s — it looked like a warmup anomaly. In isolation, the first run was 28,681 req/s. The 4k number was CPU starvation, not a Mesh startup phenomenon. The numbers above are from the isolated run.

**MEMORY**

| Language | Startup RSS |
|----------|------------|
| Mesh     | ~4.9 MB    |
| Go       | ~1.5 MB    |
| Rust     | ~3.4 MB    |
| Elixir   | ~1.6 MB    |

Mesh starts heavier than the others. The actor runtime, supervision tree, and GC infrastructure have real upfront cost. The trade is that the same infrastructure that adds ~5 MB at startup is what handles your stateful services, your WebSocket connections, your distributed cluster. It's not overhead you're paying for nothing.

**WHERE THIS LANDS**

A language with a full BEAM-style actor runtime — process spawning, mailboxes, supervision trees, location-transparent PIDs — runs HTTP at 4% below Go throughput and 134% above Elixir. That's the result.

The previous post was about whether a language could be built. This one is about whether it's fast enough to matter. The answer is yes.

Mesh: https://meshlang.dev
GSD: https://github.com/gsd-build/get-shit-done
