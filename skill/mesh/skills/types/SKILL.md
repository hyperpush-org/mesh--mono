---
name: mesh-types
description: Mesh type system: primitive types, structs, ADTs (sum types), generics, Option, Result, and type annotations.
---

# Mesh Types

## Primitive Types
1. `Int` — signed integer (maps to i64 at runtime)
2. `Float` — double-precision floating point
3. `Bool` — `true` / `false`
4. `String` — UTF-8 string (immutable)
5. `Unit` — the type of expressions with no meaningful value (implicit return from void functions)
6. Type conversion: call `.to_string()`, `.to_int()`, `.to_float()`, `.to_bool()` on primitive values.

## Structs (Product Types)
1. Defined with `struct Name do field :: Type ... end`.
2. Instantiated with `Name { field: value, ... }` — all fields required, any order.
3. Field access via dot notation: `user.name`, `user.age`.
4. Structs can derive protocols: `end deriving(Json, Row, Display, Eq, Ord)`.
5. Generic structs: `struct Box<T> do value :: T end` — type parameter in angle brackets.

```mesh
struct User do
  name :: String
  age :: Int
  score :: Float
  active :: Bool
end deriving(Json)

let u = User { name: "Alice", age: 30, score: 95.5, active: true }
println(u.name)   # "Alice"
println("#{u.age}")

# Generic struct:
struct Box<T> do
  value :: T
end deriving(Display, Eq)

let b1 = Box { value: 42 }
let bs = Box { value: "hello" }
println("#{b1}")
```

## ADTs / Sum Types
1. Defined with `type Name do Variant1 / Variant2(T) / Variant3(A, B) end`.
2. Nullary variants (no payload): `Red`, `Green`, `Blue`.
3. Payload variants carry typed data: `Some(T)`, `Ok(T)`, `Err(E)`.
4. Constructed by name: `let c = Red`, `let r = Ok(42)`, `let e = Err("oops")`.
5. Consumed with `case` pattern matching — compiler enforces exhaustiveness.

```mesh
type Color do
  Red
  Green
  Blue
end

let c = Blue
case c do
  Red -> println("red")
  Green -> println("green")
  Blue -> println("blue")
end

# Built-in Result type (T!E shorthand):
fn validate(x :: Int) -> Int!String do
  if x <= 0 do
    return Err("must be positive")
  end
  Ok(x)
end
```

## Option<T>
1. `Option<T>` represents a value that may or may not be present.
2. Variants: `Some(value)` and `None`.
3. Unwrap safely with `case`: `case opt do Some(v) -> ... None -> ... end`.
4. `?` operator on Option: returns `None` early if the value is None.

```mesh
fn find_first(list :: List<Int>, target :: Int) -> Option<Int> do
  List.find(list, fn(x) -> x == target end)
end

case find_first([1, 2, 3], 2) do
  Some(v) -> println("found: #{v}")
  None -> println("not found")
end
```

## Result<T, E> and the ? Operator
1. `Result<T, E>` represents success (`Ok(T)`) or failure (`Err(E)`).
2. Shorthand type syntax: `T!E` means `Result<T, E>`.
3. `?` operator: if the expression is `Err(e)`, immediately return `Err(e)` from the current function. The function's return type must be `T!SomeError`.
4. Chaining with `?` composes fallible operations without nested case expressions.

```mesh
fn validate_positive(x :: Int) -> Int!String do
  if x <= 0 do
    return Err("must be positive")
  end
  Ok(x)
end

fn process(x :: Int) -> String!String do
  let v = validate_positive(x)?
  let w = validate_small(v)?
  Ok("valid: #{w}")
end

case process(42) do
  Ok(s) -> println(s)
  Err(e) -> println("error: #{e}")
end
```

## Collections
1. `List<T>` — ordered, resizable list. See skills/collections for full API.
2. `Map<K, V>` — key-value store. Keys are typically String.
3. `Set<T>` — unordered unique values.
4. `Queue<T>` — FIFO queue.
5. `Range` — integer range, used with `for` loops or `Iter.from`.
6. List literal syntax: `[1, 2, 3]`.

## Type Inference
1. Types are inferred from context — explicit annotations rarely needed in function bodies.
2. Function signatures require explicit parameter types and return type.
3. When type inference fails, add `:: Type` annotation to the `let` binding.
