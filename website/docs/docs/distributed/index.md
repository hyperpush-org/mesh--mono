---
title: Distributed Actors
description: Node connections, remote actors, and global process registry in Mesh
---

# Distributed Actors

> **Distributed operator proof:** This guide teaches the distribution primitives. For the verified clustered-app/operator path, start with [Clustered Example](/docs/getting-started/clustered-example/), [`examples/todo-postgres/README.md`](https://github.com/hyperpush-org/hyperpush-mono/blob/main/examples/todo-postgres/README.md), or [`examples/todo-sqlite/README.md`](https://github.com/hyperpush-org/hyperpush-mono/blob/main/examples/todo-sqlite/README.md) for the public scaffold/examples-first split. Use `meshc init --template todo-api --db postgres` when you want the fuller shared/deployable starter without changing that source-first `@cluster` contract, and treat `meshc init --template todo-api --db sqlite` as the honest local single-node starter instead of a clustered/operator proof surface. Keep [`reference-backend/README.md`](https://github.com/hyperpush-org/hyperpush-mono/blob/main/reference-backend/README.md) as the deeper backend proof once the starter examples stop being enough. If you are migrating older clustered code, move `clustered(work)` into source-first `@cluster`, delete any `[cluster]` manifest stanza, and rename helper-shaped entries such as `execute_declared_work(...)` / `Work.execute_declared_work` to ordinary verbs like `add()` or `sync_todos()`. Keep the route-free `@cluster` surfaces canonical: the PostgreSQL Todo starter only dogfoods explicit-count `HTTP.clustered(1, ...)` on `GET /todos` and `GET /todos/:id`, while `GET /health` and mutating routes stay local. Default-count and two-node clustered-route behavior stay on the repo S07 rail (`cargo test -p meshc --test e2e_m047_s07 -- --nocapture`). Follow the runtime-owned `meshc cluster` operator flow in this order: status, continuity list, continuity record, diagnostics. Then use [Distributed Proof](/docs/distributed-proof/) for the verifier map. `bash scripts/verify-m047-s04.sh` remains the authoritative cutover rail for the source-first route-free clustered contract, `bash scripts/verify-m047-s05.sh` is the retained historical clustered Todo subrail kept behind fixture-backed rails instead of the public starter contract, `cargo test -p meshc --test e2e_m047_s07 -- --nocapture` remains the repo S07 rail for default-count and two-node wrapper behavior beyond the PostgreSQL Todo starter's explicit-count read routes, and `bash scripts/verify-m047-s06.sh` is the docs and retained-proof closeout rail that wraps S05, rebuilds docs truth, and owns the assembled `.tmp/m047-s06/verify` bundle. The lower-level retained fixture rails now live under `scripts/fixtures/clustered/`, while `bash scripts/verify-m046-s06.sh`, `bash scripts/verify-m046-s05.sh`, `bash scripts/verify-m046-s04.sh`, `bash scripts/verify-m045-s05.sh`, and `bash scripts/verify-m045-s04.sh` remain historical compatibility aliases into that M047 rail and `bash scripts/verify-m045-s03.sh` remains the historical failover-specific subrail. That proof covers bounded automatic promotion, automatic recovery, stale-primary fencing, and the read-only Fly evidence path.

Mesh's actor model extends seamlessly across machines. The same primitives you use locally -- `spawn`, `send`, `receive` -- work across networked nodes. Once two nodes are connected, processes on either side can communicate transparently.

Distribution is built on TLS-encrypted TCP connections with cookie-based authentication. Every node that joins a cluster must share the same secret cookie, which is verified via an HMAC-SHA256 challenge/response handshake.

## Starting a Node

A Mesh runtime becomes a named, addressable node by calling `Node.start`. This binds a TCP listener and makes the process ready to accept connections from other nodes:

```mesh
fn main() do
  Node.start("app@localhost:4000", "secret_cookie")
  println("Node started")
end
```

The first argument is the node name in `"name@host:port"` format. The second argument is the shared secret cookie used for authentication. All nodes in a cluster must use the same cookie.

Behind the scenes, `Node.start`:
1. Parses the node address and binds a TCP listener on the given port
2. Generates an ephemeral TLS certificate for encrypted communication
3. Starts an accept loop to handle incoming connections from other nodes

## Connecting Nodes

Once a node is started, it can connect to other nodes with `Node.connect`:

```mesh
fn main() do
  Node.start("app@localhost:4000", "my_cookie")
  Node.connect("worker@localhost:4001")
  println("Connected to worker")
end
```

When two nodes connect, they perform a mutual cookie handshake. If either side has a different cookie, the connection is rejected. After authentication, both nodes exchange their global registry state to synchronize cluster-wide process names.

### Querying the Cluster

You can inspect the cluster state with `Node.self` and `Node.list`:

```mesh
fn main() do
  Node.start("app@localhost:4000", "my_cookie")
  Node.connect("worker@localhost:4001")

  let me = Node.self()
  println("I am: ${me}")

  let nodes = Node.list()
  println("Connected nodes: ${nodes}")
end
```

| Function | Description |
|----------|-------------|
| `Node.self()` | Returns the name of the current node |
| `Node.list()` | Returns a list of all connected node names |

## Remote Actors

Once nodes are connected, you can spawn actors on remote nodes and communicate with them using the same `send` and `receive` primitives you use locally.

### Spawning on a Remote Node

Use `Node.spawn` to start an actor on a specific remote node:

```mesh
actor worker() do
  receive do
    msg -> println("Remote worker got: ${msg}")
  end
end

fn main() do
  Node.start("app@localhost:4000", "my_cookie")
  Node.connect("worker@localhost:4001")

  let pid = Node.spawn("worker@localhost:4001", worker)
  send(pid, "hello from app node")
end
```

`Node.spawn` returns a PID that is valid across nodes. Sending a message to this PID routes it over the network to the remote node transparently.

### Spawning with Links

Use `Node.spawn_link` to spawn a remote actor and establish a bidirectional link in one step. If either the local or remote actor crashes, the other receives an exit signal:

```mesh
actor task() do
  receive do
    msg -> println("task completed")
  end
end

fn main() do
  Node.start("app@localhost:4000", "my_cookie")
  Node.connect("worker@localhost:4001")

  let pid = Node.spawn_link("worker@localhost:4001", task)
  send(pid, "start")
end
```

This is the distributed equivalent of `spawn_link` -- it combines spawning and linking into a single atomic operation.

## Global Registry

The global registry provides cluster-wide process name registration. Unlike local process names (which are scoped to a single node), global names are replicated across all connected nodes.

### Registering a Name

Use `Global.register` to assign a name to a process globally:

```mesh
fn main() do
  Node.start("app@localhost:4000", "my_cookie")

  Global.register("db_service", self())
  println("Registered as db_service")
end
```

When a name is registered, it is broadcast to all connected nodes. Every node holds a complete replica of the name table, so lookups are always local (no network round-trip).

### Looking Up a Name

Use `Global.whereis` to find a process by its global name:

```mesh
fn main() do
  Node.start("app@localhost:4000", "my_cookie")
  Node.connect("db@localhost:4001")

  let pid = Global.whereis("db_service")
  send(pid, "query")
end
```

Since every node has a full replica of the global registry, `Global.whereis` returns immediately without any network call.

### Unregistering a Name

Use `Global.unregister` to remove a global registration:

```mesh
fn main() do
  Node.start("app@localhost:4000", "my_cookie")

  Global.register("temp_worker", self())
  # ... do some work ...
  Global.unregister("temp_worker")
end
```

| Function | Description |
|----------|-------------|
| `Global.register(name, pid)` | Register a process globally across all nodes |
| `Global.whereis(name)` | Look up a globally registered process by name |
| `Global.unregister(name)` | Remove a global name registration |

### Automatic Cleanup

The global registry automatically cleans up registrations when:

- A **process exits** -- all global names registered by that process are removed
- A **node disconnects** -- all global names owned by that node are removed

This means you do not need to manually unregister names in crash or disconnect scenarios. The cleanup is broadcast to all remaining nodes in the cluster.

## Node Monitoring

You can monitor remote nodes to receive notifications when they disconnect:

```mesh
actor watcher() do
  receive do
    (:nodedown, name) -> println("Node disconnected: ${name}")
  end
end

fn main() do
  Node.start("app@localhost:4000", "my_cookie")
  Node.connect("worker@localhost:4001")

  Node.monitor("worker@localhost:4001")

  # If worker disconnects, the current process receives a :nodedown message
end
```

`Node.monitor` sets up a notification so that the calling process receives a `:nodedown` tuple when the monitored node disconnects. This is the distributed equivalent of process monitoring -- instead of watching a single process, you watch an entire node.

## API Reference

| Module | Function | Description |
|--------|----------|-------------|
| `Node` | `start(name, cookie)` | Start a named node with cookie authentication |
| `Node` | `connect(name)` | Connect to a remote node |
| `Node` | `self()` | Get the current node name |
| `Node` | `list()` | List all connected nodes |
| `Node` | `spawn(node, actor)` | Spawn an actor on a remote node |
| `Node` | `spawn_link(node, actor)` | Spawn a linked actor on a remote node |
| `Node` | `monitor(name)` | Monitor a remote node for disconnection |
| `Global` | `register(name, pid)` | Register a process name globally |
| `Global` | `whereis(name)` | Look up a global process name |
| `Global` | `unregister(name)` | Remove a global name registration |

## Next Steps

- [Distributed Proof](/docs/distributed-proof/) -- the canonical public proof surface for the scaffold-first clustered-app/operator story, the bounded failover/operator rail, and the read-only Fly evidence path
- [Concurrency](/docs/concurrency/) -- actors, supervision, and services on a single node
- [Developer Tools](/docs/tooling/) -- formatter, REPL, package manager, and editor support
