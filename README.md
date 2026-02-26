<div align="center">

# Mesh Language

![Version](https://img.shields.io/badge/version-v6.0-blue.svg?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)
![Build](https://img.shields.io/badge/build-passing-success.svg?style=flat-square)

**Expressive, readable concurrency.**  
*Elixir-style syntax. Static type inference. Native single binaries.*

[Documentation](https://meshlang.dev) • [Get Started](#quick-start) • [Contributing](#contributing)

</div>

---

## What is Mesh?

Mesh is a general-purpose programming language designed to make concurrent software scalable, fault-tolerant, and maintainable. It combines the **expressive syntax of Ruby/Elixir** and the **fault-tolerant actor model of Erlang/BEAM** with **static Hindley-Milner type inference** and **native performance via LLVM**.

Mesh compiles directly to a standalone native binary—no virtual machine to install, no heavy runtime to manage.

## Key Features

### Safety Without Verbosity
- **Static Type System:** Full compile-time type checking with Hindley-Milner inference. You rarely need to write type annotations.
- **Null Safety:** No nulls. Use `Option<T>` and `Result<T, E>` with pattern matching.
- **Pattern Matching:** Exhaustive pattern matching on all types, ensuring you handle every case.

### Concurrency & Reliability
- **Actor Model:** Lightweight processes (green threads) isolated by default. Spawn 100k+ actors in seconds.
- **Fault Tolerance:** Supervision trees and "let it crash" philosophy. If an actor crashes, its supervisor restarts it—the rest of your app stays up.
- **Message Passing:** Actors communicate exclusively via immutable messages. No shared memory, no data races.
- **Distributed Mesh:** Seamlessly cluster nodes. Send messages to remote actors as easily as local ones using location-transparent PIDs.

### Production Ready
- **Native Binaries:** Compiles to a single, self-contained executable. Easy to deploy (copy-paste).
- **Batteries Included:**
  - Built-in **PostgreSQL** & **SQLite** drivers with connection pooling.
  - **WebSocket** server support (actor-per-connection).
  - **JSON** serialization/deserialization.
  - **HTTP** server with routing and middleware.
- **Modern Tooling:** Built-in package manager, formatter (`mesh fmt`), and Language Server Protocol (LSP) support for your editor.

## Quick Start

### 1. Installation

**From Source (Rust required):**

```bash
git clone https://github.com/mesh-lang/mesh.git
cd mesh
cargo install --path compiler/meshc
```

### 2. Hello World

Create a file named `hello.mesh`:

```elixir
module Main

pub fn main() do
  IO.println("Hello, Mesh world!")
  
  # Spawn an actor
  let pid = spawn(fn -> 
    receive
      {sender, name} -> send(sender, "Nice to meet you, " + name)
    end
  end)

  # Send a message and wait for reply
  send(pid, {self(), "Developer"})
  
  receive
    msg -> IO.println("Received: " + msg)
  after 1000 ->
    IO.println("Timeout!")
  end
end
```

Run it:

```bash
meshc run hello.mesh
```

### 3. A Web Server Example

```elixir
module Server

import Http
import Json

struct User do
  id: Int
  name: String
  email: String
end

pub fn main() do
  let router = Http.router()
    |> Http.get("/", fn(req) -> 
        Http.text(200, "Welcome to Mesh!") 
       end)
    |> Http.post("/users", fn(req) ->
        case req.json() do
          Ok(user :: User) -> Http.json(201, user)
          Err(_) -> Http.text(400, "Invalid JSON")
        end
       end)

  IO.println("Listening on port 8080...")
  Http.serve(router, 8080)
end
```

## Documentation

Full documentation, including guides and API references, is available at **[meshlang.dev](https://meshlang.dev)** (placeholder link).

## Project Status

Mesh is currently in active development.

- **Current Stable:** v6.0
- **In Development:** v7.0 (Iterator Protocol & Trait Ecosystem)

See [PROJECT.md](.planning/PROJECT.md) and [ROADMAP.md](.planning/ROADMAP.md) for detailed planning and architectural decisions.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
