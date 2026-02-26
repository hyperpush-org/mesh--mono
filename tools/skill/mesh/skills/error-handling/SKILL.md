---
name: mesh-error-handling
description: Mesh error handling: Result type, Option type, ? propagation operator, chaining, and From/Try conversion traits.
---

# Mesh Error Handling

See also: skills/types for Result/Option type definitions.

## Result<T, E> Fundamentals
1. `Result<T, E>` (shorthand `T!E`) represents success `Ok(T)` or failure `Err(E)`.
2. Functions that can fail return `T!E`; callers must handle both variants.
3. Construct with `Ok(value)` or `Err(message)`.
4. Consume with `case` for exhaustive handling.
5. The error type `E` is commonly `String` for simple error messages.

```mesh
fn validate_positive(x :: Int) -> Int!String do
  if x <= 0 do
    return Err("must be positive")
  end
  Ok(x)
end

fn validate_small(x :: Int) -> Int!String do
  if x > 100 do
    return Err("too large")
  end
  Ok(x)
end

case validate_positive(42) do
  Ok(v) -> println("valid: #{v}")
  Err(e) -> println("error: #{e}")
end
```

## The ? Operator
1. `expr?` on a `Result`: if `Err(e)`, immediately returns `Err(e)` from the current function.
2. `expr?` on an `Option`: if `None`, immediately returns `None` from the current function.
3. The surrounding function's return type must match — `T!E` for Result, `Option<T>` for Option.
4. Replaces verbose nested `case` expressions with flat, readable code.
5. Can only be used inside functions that return `Result` or `Option`.

```mesh
fn process(x :: Int) -> String!String do
  # ? propagates Err upward — no nested case needed
  let v = validate_positive(x)?
  let w = validate_small(v)?
  Ok("valid: #{w}")
end

fn main() do
  let r1 = process(42)    # Ok("valid: 42")
  let r2 = process(-5)    # Err("must be positive")
  let r3 = process(200)   # Err("too large")
  case r1 do
    Ok(s) -> println(s)
    Err(e) -> println("error: #{e}")
  end
end
```

## Chaining Results
1. Chain multiple fallible operations with consecutive `?` on each line.
2. The chain short-circuits on first `Err` — subsequent lines do not execute.
3. Wrap the entire chain in a helper function returning `T!E` for clean separation.
4. Outer callers see only the final `Ok` or the first `Err`.

```mesh
fn run_pipeline(input :: Int) -> String!String do
  let a = step_one(input)?
  let b = step_two(a)?
  let c = step_three(b)?
  Ok("result: #{c}")
end
```

## Option<T> and the ? Operator
1. `Option<T>` with `Some(v)` / `None` for nullable values.
2. `?` on Option: `None` propagates up, `Some(v)` unwraps to `v`.
3. Use `case` when both `Some` and `None` paths have meaningful logic.
4. Use `?` inside an Option-returning function to propagate absence.

```mesh
fn find_and_process(list :: List<Int>, target :: Int) -> Option<String> do
  let v = List.find(list, fn(x) -> x == target end)?
  Some("found: #{v}")
end
```

## Error Type Conversion (From / Try traits)
1. The `From` trait enables converting one error type to another.
2. `impl From<SourceError> for TargetError` defines the conversion.
3. `?` automatically applies the `From` conversion when error types differ.
4. Use when a function calls multiple subfunctions with different error types.

```mesh
# With From impl, ? converts errors automatically:
fn run() -> Int!AppError do
  let db = open_db()?       # DbError -> AppError via From
  let data = fetch(db)?     # NetworkError -> AppError via From
  Ok(data.len())
end
```

## Gotchas
1. `?` only works inside functions returning `Result` or `Option` — compiler rejects it elsewhere.
2. Mismatched error types without a `From` impl produce a type error — add the impl or use `map_err`.
3. Avoid discarding errors with `let _ = fallible_call()` — always propagate or handle explicitly.
