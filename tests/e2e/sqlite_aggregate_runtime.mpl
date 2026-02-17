# E2E test for SQLite aggregate runtime behavior
# Tests: count(*), sum/avg/min/max, GROUP BY, HAVING
# Phase 108: Verifies AGG-01 through AGG-04

fn run_db() -> Int!String do
  let db = Sqlite.open(":memory:")?

  # Create table with numeric data for aggregation
  let _ = Sqlite.execute(db, "CREATE TABLE orders (id INTEGER PRIMARY KEY, category TEXT NOT NULL, amount INTEGER NOT NULL)", [])?

  # Insert test data: 3 categories, varying amounts
  let _ = Sqlite.execute(db, "INSERT INTO orders (id, category, amount) VALUES (?, ?, ?)", ["1", "electronics", "100"])?
  let _ = Sqlite.execute(db, "INSERT INTO orders (id, category, amount) VALUES (?, ?, ?)", ["2", "electronics", "200"])?
  let _ = Sqlite.execute(db, "INSERT INTO orders (id, category, amount) VALUES (?, ?, ?)", ["3", "electronics", "300"])?
  let _ = Sqlite.execute(db, "INSERT INTO orders (id, category, amount) VALUES (?, ?, ?)", ["4", "books", "25"])?
  let _ = Sqlite.execute(db, "INSERT INTO orders (id, category, amount) VALUES (?, ?, ?)", ["5", "books", "35"])?
  let _ = Sqlite.execute(db, "INSERT INTO orders (id, category, amount) VALUES (?, ?, ?)", ["6", "clothing", "50"])?

  # AGG-01: count(*) -- total row count
  println("count_all")
  let count_rows = Sqlite.query(db, "SELECT count(*) AS cnt FROM orders", [])?
  List.map(count_rows, fn(row) do
    println(Map.get(row, "cnt"))
  end)

  # AGG-02: sum, avg, min, max on numeric column
  println("sum_avg_min_max")
  let agg_rows = Sqlite.query(db, "SELECT sum(amount) AS s, avg(amount) AS a, min(amount) AS lo, max(amount) AS hi FROM orders", [])?
  List.map(agg_rows, fn(row) do
    println(Map.get(row, "s") <> ":" <> Map.get(row, "a") <> ":" <> Map.get(row, "lo") <> ":" <> Map.get(row, "hi"))
  end)

  # AGG-03: GROUP BY -- one row per category with count
  println("group_by")
  let group_rows = Sqlite.query(db, "SELECT category, count(*) AS cnt, sum(amount) AS total FROM orders GROUP BY category ORDER BY category", [])?
  List.map(group_rows, fn(row) do
    println(Map.get(row, "category") <> ":" <> Map.get(row, "cnt") <> ":" <> Map.get(row, "total"))
  end)

  # AGG-04: HAVING -- only groups with count > 1
  println("having")
  let having_rows = Sqlite.query(db, "SELECT category, count(*) AS cnt FROM orders GROUP BY category HAVING count(*) > 1 ORDER BY category", [])?
  List.map(having_rows, fn(row) do
    println(Map.get(row, "category") <> ":" <> Map.get(row, "cnt"))
  end)

  Sqlite.close(db)
  Ok(0)
end

fn main() do
  let r = run_db()
  case r do
    Ok(_) -> println("done")
    Err(msg) -> println("error: " <> msg)
  end
end
