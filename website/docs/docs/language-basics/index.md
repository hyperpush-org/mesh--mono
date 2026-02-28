---
title: Language Basics
---

# Language Basics

This guide covers the core features of the Mesh programming language. After reading this, you will understand how to work with variables, types, functions, pattern matching, control flow, the pipe operator, error handling, and modules.

## Variables

Variables in Mesh are created with `let` bindings and are immutable by default:

```mesh
fn main() do
  let name = "Mesh"
  let age = 30
  let pi = 3.14
  let active = true
  println("Hello, ${name}!")
end
```

You can add type annotations with `::` to be explicit about a variable's type:

```mesh
fn main() do
  let x :: Int = 42
  let greeting :: String = "hello"
  println("${x}: ${greeting}")
end
```

Type annotations are optional -- the compiler infers types from context. Use annotations when you want to be explicit or when the compiler needs a hint.

Since variables are immutable, you cannot reassign them. Instead, you create a new binding with the same name (shadowing):

```mesh
fn main() do
  let x = 1
  let x = x + 1
  println("${x}")
end
```

## Basic Types

Mesh has the following built-in types:

| Type     | Description              | Examples              |
|----------|--------------------------|-----------------------|
| `Int`    | Integer numbers          | `42`, `0`, `-5`       |
| `Float`  | Floating-point numbers   | `3.14`, `0.5`         |
| `String` | Text strings             | `"hello"`, `"Mesh"`   |
| `Bool`   | Boolean values           | `true`, `false`       |

### String Interpolation

Strings support two interpolation syntaxes -- `#{}` (preferred, v12.0) and `${}` (also valid). Any expression inside the braces is evaluated and converted to a string:

```mesh
fn main() do
  let name = "Mesh"
  let val = 42
  println("Hello, #{name}!")
  println("The answer is #{val}")
  println("Double: #{val * 2}")
end
```

### Heredoc Strings

Use triple-quote `"""..."""` for multiline strings. Heredocs support interpolation and do not require escape sequences for special characters:

```mesh
fn main() do
  let id = 42
  let name = "Alice"
  let body = """
    {"id": #{id}, "name": "#{name}"}
    """
  println(body)
end
```

Heredocs are useful for JSON templates, SQL queries, and any multiline content where backslash escaping would be cumbersome.

### Type Inference

The Mesh compiler infers types from how values are used. You rarely need to write type annotations for local variables:

```mesh
fn main() do
  let x = 42          # inferred as Int
  let name = "Mesh"   # inferred as String
  let flag = true     # inferred as Bool
  println("${x} ${name} ${flag}")
end
```

### Boolean Logic

Boolean values support `and`, `or`, and `not` operators:

```mesh
fn main() do
  let t = true
  let f = false
  if t and not f do
    println("logic works")
  end
end
```

## Functions

Functions are declared with the `fn` keyword, followed by the name, parameters, and a `do...end` body:

```mesh
fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn greet(name :: String) -> String do
  "Hello, ${name}!"
end

fn main() do
  println("${add(10, 20)}")
  println(greet("Mesh"))
end
```

The last expression in a function body is the return value -- there is no need for an explicit `return` keyword (though `return` is available for early exits).

### One-Line Functions

For simple functions, you can use the concise `=` syntax:

```mesh
fn double(x) = x * 2
fn square(x :: Int) -> Int = x * x

fn main() do
  println("${double(21)}")
  println("${square(6)}")
end
```

### Multi-Clause Functions

Functions can have multiple clauses that pattern match on their arguments, similar to Elixir:

```mesh
fn fib(0) = 0
fn fib(1) = 1
fn fib(n) = fib(n - 1) + fib(n - 2)

fn to_string(true) = "yes"
fn to_string(false) = "no"

fn main() do
  println("${fib(10)}")
  println(to_string(true))
  println(to_string(false))
end
```

The compiler tries each clause in order and uses the first one that matches.

### Guard Clauses

Multi-clause functions can include `when` guards for additional conditions:

```mesh
fn abs(n) when n < 0 = -n
fn abs(n) = n

fn classify(n) when n > 0 = "positive"
fn classify(n) when n < 0 = "negative"
fn classify(n) = "zero"

fn main() do
  println("${abs(-5)}")
  println(classify(10))
  println(classify(-3))
  println(classify(0))
end
```

### Closures

Anonymous functions (closures) are created with `fn...end`:

```mesh
fn main() do
  let factor = 3
  let triple = fn(x :: Int) -> x * factor end
  println("${triple(7)}")
  println("${triple(10)}")
end
```

Closures capture variables from their surrounding scope. There are two syntax forms:

- **Arrow syntax** for one-line closures: `fn x -> x * 2 end`
- **Do-end syntax** for multi-line closures: `fn x do ... end`

```mesh
fn main() do
  let list = [1, 2, 3, 4, 5]

  # Arrow syntax
  let doubled = list |> map(fn x -> x * 2 end)

  # Do-end syntax for multi-line bodies
  let processed = map(list, fn x do
    let doubled = x * 2
    let incremented = doubled + 1
    incremented
  end)

  println("${doubled}")
  println("${processed}")
end
```

## Pattern Matching

The `case` expression matches a value against patterns and executes the first matching branch:

```mesh
fn describe(x :: Int) -> String do
  case x do
    0 -> "zero"
    1 -> "one"
    _ -> "other"
  end
end

fn main() do
  println(describe(0))
  println(describe(1))
  println(describe(42))
end
```

The `_` pattern is a wildcard that matches anything.

### Matching on Constructors

You can match on sum type constructors and destructure their contents:

```mesh
type Color do
  Red
  Green
  Blue
end

fn color_name(c :: Color) -> String do
  case c do
    Red -> "red"
    Green -> "green"
    Blue -> "blue"
  end
end

fn main() do
  let c = Red
  println(color_name(c))
end
```

### Matching on Results

Pattern matching works naturally with `Ok` and `Err` result types:

```mesh
fn safe_divide(a :: Int, b :: Int) -> Int!String do
  if b == 0 do
    return Err("division by zero")
  end
  Ok(a / b)
end

fn main() do
  let r = safe_divide(10, 2)
  case r do
    Ok(val) -> println("Result: ${val}")
    Err(msg) -> println("Error: ${msg}")
  end
end
```

See the [Error Handling](#error-handling) section below for more on result types.

## Control Flow

### If/Else

The `if/else` expression evaluates a condition and runs the corresponding branch:

```mesh
fn max(a :: Int, b :: Int) -> Int do
  if a > b do
    a
  else
    b
  end
end

fn main() do
  println("${max(10, 20)}")
end
```

`if` is an expression in Mesh, so it returns a value. The `else` branch is optional when the result is not used.

### For Loops

The `for...in` loop iterates over ranges and collections:

```mesh
fn main() do
  # Iterate over a range (0 through 4)
  for i in 0..5 do
    println("${i}")
  end
end
```

For loops can also iterate over lists:

```mesh
fn main() do
  let names = ["Alice", "Bob", "Charlie"]
  for name in names do
    println("Hello, ${name}!")
  end
end
```

#### Filter Clauses

Add a `when` clause to filter elements during iteration:

```mesh
fn main() do
  let evens = for i in 0..10 when i % 2 == 0 do
    i
  end
  for e in evens do
    println("${e}")
  end
end
```

The `for` expression with a body returns a list of the results, making it work like a list comprehension.

#### Map Iteration

Iterate over map entries with destructuring:

```mesh
fn main() do
  let m = Map.new()
  let m = Map.put(m, 1, 10)
  let m = Map.put(m, 2, 20)
  let m = Map.put(m, 3, 30)

  let vals = for {k, v} in m do
    v
  end

  let total = List.length(vals)
  println("${total}")
end
```

### While Loops

The `while` loop repeats its body as long as the condition is true:

```mesh
fn main() do
  while true do
    println("loop ran")
    break
  end
  println("after loop")
end
```

### Break and Continue

Use `break` to exit a loop early and `continue` to skip to the next iteration:

```mesh
fn main() do
  # break exits the loop
  while true do
    println("before break")
    break
  end
  println("after loop")

  # continue skips the rest of the current iteration
  let result = for x in [1, 2, 3, 4, 5] when x > 1 do
    if x == 3 do
      continue
    end
    x
  end
  for r in result do
    println("${r}")
  end
end
```

## Pipe Operator

The pipe operator `|>` passes the result of the left-hand expression as the first argument to the right-hand function. It turns nested calls into readable left-to-right chains:

```mesh
fn double(x :: Int) -> Int do
  x * 2
end

fn add_one(x :: Int) -> Int do
  x + 1
end

fn main() do
  # Without pipes (nested, reads inside-out)
  let a = add_one(double(5))

  # With pipes (chained, reads left-to-right)
  let b = 5 |> double |> add_one

  println("${a}")
  println("${b}")
end
```

Both `a` and `b` equal `11`. The pipe version reads naturally: "take 5, double it, add one."

### Pipes with Closures

Pipes work well with higher-order functions like `map`, `filter`, and `reduce`:

```mesh
fn main() do
  let list = [1, 2, 3, 4, 5]

  let doubled = list |> map(fn x -> x * 2 end)
  let filtered = doubled |> filter(fn x -> x > 4 end)
  let sum = reduce(filtered, 0, fn acc, x -> acc + x end)

  println("${sum}")
end
```

### Slot Pipe Operator

The slot pipe `|N>` routes the left-hand value to a specific argument position (N) instead of the first position:

```mesh
fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn main() do
  # Slot pipe: 10 |2> add(1) = add(1, 10) = 11
  let result = 10 |2> add(1)
  println("#{result}")

  # Chain slot pipe and regular pipe
  let chained = 5 |2> add(10) |> add(1)
  println("#{chained}")
end
```

Use `|2>` to insert the piped value as the second argument, `|3>` for the third, and so on. Slot pipes can be chained with regular pipes.

### Multi-Line Pipes

Long pipe chains can be split across lines using either the **trailing form** (`|>` at the end of a line) or the **leading form** (`|>` at the start of the next line):

```mesh
fn double(x :: Int) -> Int do
  x * 2
end

fn add_one(x :: Int) -> Int do
  x + 1
end

fn negate(x :: Int) -> Int do
  -x
end

fn main() do
  # Trailing form: |> at the end of each line
  let result = 5 |>
    double |>
    add_one |>
    negate

  # Leading form: |> at the start of continuation lines
  let result2 = 5
    |> double
    |> add_one
    |> negate

  println("#{result}")
  println("#{result2}")
end
```

Both forms produce identical compiled output to their single-line equivalents -- only formatting differs. Choose whichever reads more clearly for your use case.

Multi-line pipes are especially useful for long chains where all steps would not fit on a single line, such as building an HTTP router:

```mesh
fn main() do
  let router = HTTP.router()
    |> HTTP.on_post("/api/events", handle_event)
    |> HTTP.on_get("/api/issues", handle_issues)
    |> HTTP.on_get("/api/dashboard", handle_dashboard)
end
```

## Error Handling

Mesh uses result types for error handling. A function that can fail returns `T!E`, where `T` is the success type and `E` is the error type:

```mesh
fn safe_divide(a :: Int, b :: Int) -> Int!String do
  if b == 0 do
    return Err("division by zero")
  end
  Ok(a / b)
end
```

- `Ok(value)` wraps a successful result
- `Err(error)` wraps an error
- The return type `Int!String` means "returns an `Int` on success or a `String` error on failure"

### The Try Operator

The `?` operator unwraps a result if it is `Ok`, or propagates the error if it is `Err`:

```mesh
fn step1(x :: Int) -> Int!String do
  if x < 0 do
    return Err("negative input")
  end
  Ok(x * 2)
end

fn step2(x :: Int) -> Int!String do
  if x > 100 do
    return Err("too large")
  end
  Ok(x + 1)
end

fn pipeline(x :: Int) -> Int!String do
  let a = step1(x)?
  let b = step2(a)?
  Ok(b)
end

fn main() do
  let r = pipeline(10)
  case r do
    Ok(val) -> println("${val}")
    Err(msg) -> println(msg)
  end
end
```

The `?` after `step1(x)` means: if `step1` returns `Ok(value)`, bind `value` to `a` and continue; if it returns `Err(e)`, immediately return `Err(e)` from the current function. This keeps error handling concise without deeply nested pattern matches.

### Handling Results with Pattern Matching

Use `case` to handle both success and error cases:

```mesh
fn safe_divide(a :: Int, b :: Int) -> Int!String do
  if b == 0 do
    return Err("division by zero")
  end
  Ok(a / b)
end

fn main() do
  let r = safe_divide(10, 0)
  case r do
    Ok(val) -> println("Result: ${val}")
    Err(msg) -> println("Error: ${msg}")
  end
end
```

## Modules

Mesh organizes code into modules. The standard library provides built-in modules like `String`, `List`, and `Map`, accessed with dot notation:

```mesh
import String

fn main() do
  let n = String.length("test")
  println("${n}")
end
```

The `import` statement makes a module available. You can also import specific functions directly:

```mesh
from String import length

fn main() do
  let n = length("test")
  println("${n}")
end
```

### Standard Library Modules

Mesh includes several built-in modules:

| Module   | Purpose                     | Example                          |
|----------|-----------------------------|----------------------------------|
| `List`   | List operations             | `List.length(xs)`, `List.get(xs, 0)` |
| `Map`    | Key-value maps              | `Map.new()`, `Map.put(m, k, v)` |
| `Set`    | Unique value sets           | `Set.new()`, `Set.add(s, v)`    |
| `String` | String manipulation         | `String.length(s)`              |

### Working with Lists

Lists are a core data structure. You can create them with literal syntax or the `List` module:

```mesh
fn main() do
  # List literal
  let xs = [1, 2, 3]
  let len = List.length(xs)
  println("${len}")

  # Access by index
  let first = List.get(xs, 0)
  println("${first}")
end
```

### Working with Maps

Maps are key-value collections:

```mesh
fn main() do
  let m = Map.new()
  let m = Map.put(m, 1, 10)
  let m = Map.put(m, 2, 20)
  let m = Map.put(m, 3, 30)

  for {k, v} in m do
    println("${k}: ${v}")
  end
end
```

Note that `Map.put` returns a new map -- all collections in Mesh are immutable.

## Type Aliases

A type alias creates a new name for an existing type. The alias is **transparent** -- the compiler treats the alias and the original type as identical, so no conversion is needed:

```mesh
type Url = String
type Count = Int

fn fetch(url :: Url) -> String do
  # url is transparently a String -- no conversion needed
  url
end

fn main() do
  let u :: Url = "https://example.com"
  println(fetch(u))
end
```

Type aliases improve code readability by giving domain-meaningful names to primitive types without introducing any runtime overhead.

### Exported Type Aliases

Use `pub type` to export a type alias so other modules can import and use it:

```mesh
# types/user.mpl
pub type UserId = Int
pub type Email = String
```

```mesh
# main.mpl
from Types.User import UserId, Email

fn create_user(id :: UserId, email :: Email) -> String do
  "user-#{id}: #{email}"
end

fn main() do
  println(create_user(1, "alice@example.com"))
end
```

Because aliases are transparent, a `UserId` value satisfies any `Int` constraint and an `Email` value satisfies any `String` constraint.

> **Note:** Type aliases are not generic in v13.0. Parameterized aliases like `type Pair<T> = {T, T}` are not yet supported.

See [Type System](/docs/type-system/) for full trait and type documentation.

## What's Next?

You now have a solid foundation in the Mesh language. Continue with:

- [Type System](/docs/type-system/) -- structs, sum types, traits, and advanced type features
- [Iterators](/docs/iterators/) -- lazy iterator pipelines, combinators, and collection materialization
- [Concurrency](/docs/concurrency/) -- actors, message passing, supervision trees, and services
- [Syntax Cheatsheet](/docs/cheatsheet/) -- quick reference for all Mesh syntax
