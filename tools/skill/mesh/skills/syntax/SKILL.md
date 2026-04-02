---
name: mesh-syntax
description: Mesh language syntax: functions, closures, pipe operators (|> and |N>), control flow, operators, and let bindings.
---

# Mesh Syntax

## Functions
1. Functions defined with `fn name(params) -> ReturnType do ... end`.
2. Type annotations on params use `::` separator: `fn add(a :: Int, b :: Int) -> Int do`.
3. Return type optional for Unit-returning functions: `fn main() do`.
4. Last expression in a `do...end` block is implicitly returned.
5. Explicit early return with `return value`.

```mesh
fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn describe_number(n :: Int) -> String do
  case n do
    0 -> "zero"
    1 -> "one"
    _ -> "other"
  end
end

fn main() do
  println("#{add(10, 20)}")
end
```

## Decorator-Style Clustered Declarations
Rules:
1. `@cluster` and `@cluster(N)` are decorator forms attached directly to function declarations.
2. Use them in source (`work.mpl`) for the canonical clustered-runtime surface rather than treating clustering as manifest-owned config.
3. `Node.start_from_env()` is the matching bootstrap entrypoint for packages that participate in the clustered runtime.
4. For scaffold, operator, or routed clustered-runtime guidance, load `skills/clustering`; this syntax skill only calls out the decorator surface.

Code example:
```mesh
@cluster pub fn add() -> Int do
  1 + 1
end
```

## Closures
1. Anonymous functions: `fn(params) -> expr end` (single expression) or `fn(params) do ... end`.
2. Closures capture variables from the enclosing scope (lexical capture).
3. Type annotations on closure params are optional when types can be inferred.
4. Closures are first-class values — assignable to `let` bindings, passable as arguments.

```mesh
let n = 5
let add_n = fn(x :: Int) -> x + n end
println("#{add_n(3)}")   # 8

# Short closure form for higher-order functions:
let doubled = List.map(list, fn(x) -> x * 2 end)
let filtered = List.filter(doubled, fn(x) -> x > 10 end)
```

## Pipe Operator (|>)
1. `expr |> func` passes expr as the first argument to func.
2. Chains read left-to-right: `3 |> double |> println`.
3. Works with any function call: `list |> List.map(fn x -> x * 2 end)`.
4. Used heavily with Iter, List, and stdlib modules for readable pipelines.

```mesh
let result = Iter.from(list)
  |> Iter.map(fn x -> x * 2 end)
  |> Iter.filter(fn x -> x > 10 end)
  |> Iter.take(3)
  |> Iter.count()
```

## Slot Pipe Operator (|N>)
1. `expr |N> func(a, b, ...)` routes expr to argument position N (1-based, N >= 2).
2. `value |2> func(a)` desugars to `func(a, value)` — value inserted at position 2.
3. `value |2> func(a, c)` desugars to `func(a, value, c)` — value inserted at slot 2.
4. Chainable with regular pipe: `a |2> f(b) |> g()`.
5. Compiler error if slot N exceeds the function's arity.
6. Use when the natural "subject" argument is not in position 1.

```mesh
fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn concat3(a :: String, b :: String, c :: String) -> String do
  a <> b <> c
end

fn main() do
  # 10 |2> add(1) = add(1, 10) = 11
  let result1 = 10 |2> add(1)
  println("#{result1}")

  # "world" |2> concat3("hello ", " !") = concat3("hello ", "world", " !")
  let result2 = "world" |2> concat3("hello ", " !")
  println(result2)
end
```

## Let Bindings
1. `let name = expr` binds a value. Bindings are immutable by default.
2. Rebinding with the same name shadows the previous binding: `let x = 1` then `let x = x + 1`.
3. Type inference is automatic — explicit type annotation rarely needed.
4. Destructuring in let: `let Ok(v) = result` (use `case` for safe exhaustive matching).

## Control Flow
1. `if condition do ... else ... end` — condition is a Bool expression.
2. `if` is an expression: both branches return a value of the same type.
3. `case expr do pattern -> value ... end` for pattern matching (see skills/pattern-matching).
4. `for item in collection do ... end` for iteration over lists, maps, sets, ranges.
5. `while condition do ... end` for imperative loops.
6. `break` and `continue` work inside `for` and `while`.

```mesh
for item in list do
  println("#{item}")
end

let i = 0
while i < 10 do
  let i = i + 1
end
```

## Operators
1. Arithmetic: `+`, `-`, `*`, `/`, `%`
2. Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
3. Boolean: `and`, `or`, `not`
4. String concatenation: `<>`
5. Type cast/conversion: use `to_string()`, `to_int()`, `to_float()` methods on values.
