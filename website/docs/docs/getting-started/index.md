---
title: Getting Started
description: Install Mesh, create your first project, run a program, and learn the core meshc workflow.
---

# Getting Started

This guide will take you from zero to running your first Mesh program. By the end, you will have Mesh installed, understand the basic project structure, and have compiled and run a working program.

> **Production backend proof:** This guide stays focused on first steps. If you are evaluating Mesh as a real backend runtime, start with [Production Backend Proof](/docs/production-backend-proof/) and the repo runbook at `reference-backend/README.md`.
>
> **Starting a clustered app?** Go straight to [Clustered Example](/docs/getting-started/clustered-example/). It uses the real `meshc init --clustered` scaffold, the public `MESH_*` runtime contract, and the runtime-owned `meshc cluster status|continuity|diagnostics` inspection commands.

## What is Mesh?

Mesh is a statically-typed, compiled programming language designed for expressive, readable concurrency. It combines the actor model from Erlang/Elixir with a modern type system, pattern matching, and native compilation via LLVM.

Key properties of Mesh:

- **Statically typed with inference** -- the compiler catches type errors at compile time, but you rarely need to write type annotations thanks to type inference
- **Compiles to native code** -- Mesh compiles via LLVM to produce fast native binaries
- **Actor-based concurrency** -- lightweight actors with message passing, supervision trees, and fault tolerance built into the language
- **Familiar syntax** -- inspired by Elixir and Rust, with `do...end` blocks, pattern matching, and pipe operators

## Installation

Use the documented installer scripts to install both `meshc` and `meshpkg`. The staged release proof covers these installer targets:

- macOS `x86_64` and `arm64`
- Linux `x86_64` and `arm64` (GNU libc)
- Windows `x86_64`

**macOS and Linux:**

```bash
curl -sSf https://meshlang.dev/install.sh | sh
```

**Windows x86_64 (PowerShell):**

```powershell
irm https://meshlang.dev/install.ps1 | iex
```

The installers place both binaries in `~/.mesh/bin` on Unix-like systems and `~\.mesh\bin` on Windows.

### Verifying Installation

After installing, verify both binaries are available:

```bash
meshc --version
meshpkg --version
```

For the named backend proof behind this public install contract, see [Production Backend Proof](/docs/production-backend-proof/) and the repo runbook at `reference-backend/README.md`.

You should see the Mesh version number printed for each command.

### Alternative: Build from Source

If you are contributing to Mesh or targeting an environment outside the public installer coverage, build from source instead. Treat this as an alternative workflow, not the primary public install path:

```bash
git clone https://github.com/hyperpush-org/hyperpush-mono.git
cd hyperpush-mono
cargo install --path compiler/meshc
cargo install --path compiler/meshpkg
```

## Hello World

Create a new Mesh project:

```bash
meshc init hello
cd hello
```

Open `main.mpl` -- meshc generates a starter file for you. Replace its contents with:

```mesh
fn main() do
  println("Hello, World!")
end
```

Compile and run it:

```bash
meshc build .
./hello
```

You should see `Hello, World!` printed to the terminal.

Let's break down what's happening:

- `fn main()` declares the entry point of the program -- every Mesh program starts here
- `do...end` defines the function body
- `println` prints a string to stdout followed by a newline
- Mesh source files use the `.mpl` file extension

## Your First Program

Now let's write something more interesting. Open `main.mpl` and replace its contents with:

```mesh
fn greet(name :: String) -> String do
  "Hello, #{name}!"
end

fn main() do
  let message = greet("Mesh")
  println(message)
end
```

Compile and run it:

```bash
meshc build .
./hello
```

This prints `Hello, Mesh!`. Here's what's new:

- `let` creates a variable binding -- variables in Mesh are immutable by default
- `::` provides a type annotation -- `name :: String` means the parameter `name` has type `String`
- `->` declares the return type -- `-> String` means the function returns a `String`
- `"#{name}"` is string interpolation -- expressions inside `#{}` are evaluated and inserted into the string. The older `${}` syntax also works: both are valid.
- The last expression in a function is its return value -- no explicit `return` keyword needed

### Adding More Functions

Let's extend the program with some arithmetic:

```mesh
fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn double(x :: Int) -> Int do
  x * 2
end

fn main() do
  let sum = add(10, 20)
  println("#{sum}")

  let result = double(7)
  println("#{result}")

  let greeting = "Mesh"
  println("Hello, #{greeting}!")
end
```

This demonstrates:

- Functions with multiple parameters
- `Int` type for integers
- String interpolation with expressions: `"#{sum}"` converts the integer to a string automatically

### Using the Pipe Operator

Mesh has a pipe operator `|>` that passes the result of one function as the first argument to the next:

```mesh
fn double(x :: Int) -> Int do
  x * 2
end

fn add_one(x :: Int) -> Int do
  x + 1
end

fn main() do
  let result = 5 |> double |> add_one
  println("#{result}")
end
```

This prints `11`. The expression `5 |> double |> add_one` is equivalent to `add_one(double(5))` -- it reads left to right, making chains of transformations easy to follow.

## What's Next?

Now that you have Mesh installed and running, explore the language in depth:

- [Clustered Example](/docs/getting-started/clustered-example/) -- the scaffold-first clustered tutorial using `meshc init --clustered`
- [Production Backend Proof](/docs/production-backend-proof/) -- the canonical public proof surface for the real `reference-backend/` package
- [Language Basics](/docs/language-basics/) -- variables, types, functions, pattern matching, control flow, and more
- [Type System](/docs/type-system/) -- structs, sum types, generics, and type inference
- [Concurrency](/docs/concurrency/) -- actors, message passing, supervision, and services
