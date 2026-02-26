---
name: mesh-collections
description: Mesh collections: List, Map, Set, Range, Queue APIs and the Iter pipeline for functional transformations.
---

## List<T>

Rules:
1. `List.new()` creates an empty list. Literal syntax: `[1, 2, 3]`.
2. `List.append(list, value)` appends an element (returns new list — rebind with `let list =`).
3. `List.map(list, fn)` transforms every element.
4. `List.filter(list, fn)` keeps elements where fn returns true.
5. `List.find(list, fn)` returns `Option<T>` — `Some(first_match)` or `None`.
6. `List.sort(list)` sorts in ascending order.
7. `List.any(list, fn)` / `List.all(list, fn)` — boolean predicates.
8. `List.contains(list, value)` — membership test.
9. `List.head(list)` returns the first element (panics on empty — use `List.find` for safe access).
10. `List.take(list, n)` / `List.drop(list, n)` — prefix/suffix slicing.
11. `List.zip(list1, list2)` — pairs elements into `List<(A, B)>`.
12. `List.enumerate(list)` — wraps each element with its index `(index, value)`.
13. `List.flat_map(list, fn)` — map then flatten (fn returns a List).

Code example (from tests/e2e/stdlib_list_pipe_chain.mpl):
```mesh
let list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
let doubled = map(list, fn(x) -> x * 2 end)
let filtered = filter(doubled, fn(x) -> x > 10 end)
let sum = reduce(filtered, 0, fn(acc, x) -> acc + x end)
println("#{sum}")
```

## Map<K, V>

Rules:
1. `Map.new()` creates an empty map.
2. `Map.put(map, key, value)` inserts or updates (returns new map — rebind).
3. `Map.get(map, key)` returns the value directly (panics if key absent — use carefully).
4. `Map.contains(map, key)` — membership test.
5. Key type: typically `String` in practice; Map<String, String> is common for database rows.

Code example (from tests/e2e/stdlib_map_basic.mpl):
```mesh
let m = Map.new()
let m = Map.put(m, "name", "Alice")
let m = Map.put(m, "age", "30")
let name = Map.get(m, "name")
println(name)
```

## Set<T>

Rules:
1. `Set.new()` creates an empty set.
2. `Set.insert(set, value)` adds an element (duplicates ignored).
3. `Set.contains(set, value)` — membership test.
4. `Set.remove(set, value)` removes an element.
5. Convert from List: `Set.from_list(list)` or `list |> collect(Set)`.
6. Convert to List: `Set.to_list(set)`.

## Range

Rules:
1. `Range.new(start, end)` creates an integer range (inclusive start, exclusive end).
2. Use with `for item in range do` for counted loops.
3. `Iter.from(range)` converts to an iterator for pipeline operations.

Code example (from tests/e2e/stdlib_range_basic.mpl and tests/e2e/for_in_range.mpl):
```mesh
let r = Range.new(0, 10)
for i in r do
  println("#{i}")
end
```

## Queue<T>

Rules:
1. `Queue.new()` creates an empty FIFO queue.
2. `Queue.push(q, value)` enqueues at back.
3. `Queue.pop(q)` returns `Option<(T, Queue<T>)>` — `Some((value, new_queue))` or `None`.
4. Used for ordered workloads and actor mailbox-style processing.

## Iter Pipelines

Rules:
1. `Iter.from(collection)` converts any collection (List, Range, Set) to a lazy iterator.
2. Chain operations: `|> Iter.map(fn)`, `|> Iter.filter(fn)`, `|> Iter.take(n)`, `|> Iter.skip(n)`.
3. Terminal operations: `|> Iter.count()`, `|> Iter.sum()`, `|> Iter.collect()`.
4. Iterators are lazy — no work done until a terminal operation is called.
5. Significantly more efficient than chaining List operations (avoids intermediate allocations).

Code example (from tests/e2e/iter_pipeline.mpl):
```mesh
let list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

# map -> filter -> take -> count
let result = Iter.from(list)
  |> Iter.map(fn x -> x * 2 end)
  |> Iter.filter(fn x -> x > 10 end)
  |> Iter.take(3)
  |> Iter.count()
println(result.to_string())

# filter -> map -> sum
let result2 = Iter.from(list)
  |> Iter.filter(fn x -> x > 5 end)
  |> Iter.map(fn x -> x * 10 end)
  |> Iter.sum()
println(result2.to_string())

# Windowing with skip + take
let window = Iter.from(list)
  |> Iter.skip(2)
  |> Iter.take(5)
  |> Iter.count()
```

## Global Collection Functions

Rules:
1. `map(collection, fn)`, `filter(collection, fn)`, `reduce(collection, init, fn)` are available globally (no module prefix needed).
2. These are the same as `List.map`, `List.filter` etc. — prefer module-qualified form in new code for clarity.
3. `collect(List)` / `collect(Set)` / `collect(Map)` terminates a pipeline into the target collection type.

## See Also

- `skills/types` — List<T>, Map<K,V>, Set<T> type signatures
- `skills/syntax` — |> pipe operator used in Iter pipelines
