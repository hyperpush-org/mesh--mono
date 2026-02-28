---
title: Syntax Cheatsheet
---

# Syntax Cheatsheet

A quick reference for Mesh syntax. For details, see the full guides linked in each section.

## Basics

| Syntax | Example |
|--------|---------|
| Variable binding | `let x = 42` |
| Type annotation | `x :: Int` |
| String interpolation | `"Hello, #{name}!"` or `"Hello, ${name}!"` |
| Heredoc string | `"""multiline #{expr} content"""` |
| Comment | `# this is a comment` |
| Print | `println("hello")` |

## Types

| Type | Example |
|------|---------|
| `Int` | `42`, `0`, `-5` |
| `Float` | `3.14`, `0.5` |
| `String` | `"hello"`, `"#{x}"` |
| `Bool` | `true`, `false` |
| `List<T>` | `[1, 2, 3]` |
| `Map<K, V>` | `%{"key" => "value"}` |
| `Option<T>` | `Some(42)`, `None` (shorthand: `Int?`) |
| `Result<T, E>` | `Ok(42)`, `Err("fail")` (shorthand: `Int!String`) |
| `Fun(A) -> B` | `Fun(Int) -> String` |

## String Features

```mesh
# Hash-brace interpolation (v12.0, preferred)
let name = "World"
println("Hello, #{name}!")
println("Expr: #{count * 2 + 1}")

# Dollar-brace interpolation (also valid)
println("Hello, ${name}!")

# Heredoc strings (multiline, no escaping needed)
let body = """
  SELECT * FROM events WHERE id = #{id}
  """

# JSON object literals (prefer over heredoc JSON templates)
let resp = json { status: "ok", count: n }          # {"status":"ok","count":42}
let err  = json { error: reason }                    # {"error":"not found"}
let nest = json { result: json { code: 200 } }       # {"result":{"code":200}}
HTTP.response(200, json { status: "ok", id: id })   # use directly as String

# Regex literals
let rx = ~r/\d+/
let rx_flags = ~r/[a-z]+/i     # i, m, s flags
let matched = Regex.is_match(rx, "hello123")

# Environment variables
let host = Env.get("HOST", "localhost")
let port = Env.get_int("PORT", 8080)
```

See [Language Basics](/docs/language-basics/) for details.

## Functions

```mesh
# Named function with types
fn add(a :: Int, b :: Int) -> Int do
  a + b
end

# Multi-clause (pattern matching)
fn fib(0) = 0
fn fib(1) = 1
fn fib(n) = fib(n - 1) + fib(n - 2)

# Guards
fn abs(n) when n < 0 = -n
fn abs(n) = n

# Anonymous function (closure)
let double = fn(x :: Int) -> x * 2 end

# Pipe operator
let result = 5 |> double |> add_one

# Slot pipe: route value to argument position N
let result = 10 |2> add(1)   # = add(1, 10) = 11

# Multi-line pipe: trailing form (|> at end of line)
let result = 5 |>
  double |>
  add_one

# Multi-line pipe: leading form (|> at start of next line)
let result = value
  |> transform
  |> process

# Useful for long chains (e.g. HTTP router setup)
let router = HTTP.router()
  |> HTTP.on_post("/events", handle_event)
  |> HTTP.on_get("/issues", handle_issues)
```

Both trailing and leading forms produce identical output to their single-line equivalents -- only formatting differs. See [Language Basics](/docs/language-basics/) for details.

## Control Flow

```mesh
# If/else
if x > 0 do
  "positive"
else
  "non-positive"
end

# Case (pattern matching)
case x do
  0 -> "zero"
  1 -> "one"
  _ -> "other"
end

# For loop (list comprehension)
let doubled = for x in [1, 2, 3] do
  x * 2
end

# For with range
for i in 0..5 do
  println("#{i}")
end

# While loop
while condition do
  # body
  break
end
```

## Structs & Types

```mesh
# Struct definition
struct Point do
  x :: Int
  y :: Int
end deriving(Eq, Display)

# Struct creation
let p = Point { x: 1, y: 2 }

# Sum type
type Color do
  Red
  Green
  Blue
end deriving(Eq, Display)

# Type alias (transparent -- alias and aliased type are interchangeable)
type Url = String
type Count = Int

# Exported type alias (importable by other modules)
pub type UserId = Int

# Cross-module import of a type alias
from Types.User import UserId
fn get_user(id :: UserId) -> String do
  String.from(id)
end
```

Type aliases are transparent -- a `UserId` value works wherever `Int` is valid (and vice versa), with no conversion needed. See [Type System](/docs/type-system/) for details.

## Interfaces & Traits

```mesh
# Define a custom interface
interface Greeter do
  fn greet(self) -> String
end

# Implement for a type
impl Greeter for Person do
  fn greet(self) -> String do
    "Hello"
  end
end

# Associated types
interface Container do
  type Item
  fn first(self) -> Self.Item
end

impl Container for MyBox do
  type Item = Int
  fn first(self) -> Int do self.value end
end

# Deriving built-in traits
struct Tag do
  id :: Int
end deriving(Eq, Hash)

# Available derives: Eq, Ord, Display, Debug, Hash, Json
```

See [Type System -- Traits](/docs/type-system/#traits) for details.

## Numeric Traits

```mesh
# Operator overloading via traits
impl Add for Vec2 do
  type Output = Vec2
  fn add(self, other :: Vec2) -> Vec2 do
    Vec2 { x: self.x + other.x, y: self.y + other.y }
  end
end

# Available: Add (+), Sub (-), Mul (*), Div (/), Neg (unary -)
let sum = v1 + v2     # calls Add.add
let neg = -v1         # calls Neg.neg
```

See [Type System -- Numeric Traits](/docs/type-system/#numeric-traits) for details.

## From/Into Conversion

```mesh
# User-defined conversion
impl From<Int> for Wrapper do
  fn from(n :: Int) -> Wrapper do
    Wrapper { value: n }
  end
end
let w = Wrapper.from(42)

# Built-in conversions
let f = Float.from(42)       # Int -> Float
let s = String.from(42)      # Int -> String

# ? operator auto-converts error types via From
fn process() -> Int!AppError do
  let n = risky()?  # String error auto-converts to AppError
  Ok(n)
end
```

See [Type System -- From/Into](/docs/type-system/#from-into-conversion) for details.

## Iterators

```mesh
# Create iterator from collection
let iter = Iter.from([1, 2, 3, 4, 5])

# Lazy combinators (chained with pipe operator)
Iter.from(list) |> Iter.map(fn x -> x * 2 end)
Iter.from(list) |> Iter.filter(fn x -> x > 3 end)
Iter.from(list) |> Iter.take(3)
Iter.from(list) |> Iter.skip(2)
Iter.from(list) |> Iter.enumerate()
Iter.from(a) |> Iter.zip(Iter.from(b))

# Terminal operations
Iter.from(list) |> Iter.count()
Iter.from(list) |> Iter.sum()
Iter.from(list) |> Iter.any(fn x -> x > 3 end)
Iter.from(list) |> Iter.all(fn x -> x > 0 end)
Iter.from(list) |> Iter.reduce(0, fn acc, x -> acc + x end)

# Collect into collections
Iter.from(list) |> Iter.map(fn x -> x * 2 end) |> List.collect()
Iter.from(list) |> Iter.enumerate() |> Map.collect()
Iter.from(list) |> Set.collect()
Iter.from(strings) |> String.collect()
```

See [Iterators](/docs/iterators/) for details.

## Error Handling

```mesh
# Option type (T?)
fn find(x :: Int) -> Int? do
  if x > 0 do
    return Some(x)
  end
  None
end

# Result type (T!E)
fn divide(a :: Int, b :: Int) -> Int!String do
  if b == 0 do
    return Err("division by zero")
  end
  Ok(a / b)
end

# Early return with ?
fn compute(x :: Int) -> Int!String do
  let result = divide(x, 2)?
  Ok(result + 10)
end
```

## Concurrency

```mesh
# Actor definition
actor worker() do
  receive do
    msg -> println("got: #{msg}")
  end
end

# Spawn and send
let pid = spawn(worker)
send(pid, "hello")

# Supervisor
supervisor MySup do
  strategy: one_for_one
  max_restarts: 3
  max_seconds: 5

  child w do
    start: fn -> spawn(worker) end
    restart: permanent
    shutdown: 5000
  end
end

# Service (GenServer)
service Counter do
  fn init(n :: Int) -> Int do n end
  call Get() :: Int do |s| (s, s) end
  cast Reset() do |_s| 0 end
end

let pid = Counter.start(0)
Counter.get(pid)
Counter.reset(pid)
```

See [Concurrency](/docs/concurrency/) for details.

## Modules

```mesh
# Import a module
import String

# Use qualified access
let n = String.length("test")

# Import specific functions
from String import length
let n = length("test")
```

## Operators

| Category | Operators |
|----------|-----------|
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Logical | `and`, `or`, `not` |
| Pipe | `\|>` |
| Slot pipe | `\|N>` (e.g. `\|2>`) |
| String concat | `<>` |
| List concat | `++` |
| Error propagation | `?` |
| Range | `..` |
