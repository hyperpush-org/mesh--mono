# PostgreSQL partition management for Mesher monitoring platform.
# Schema DDL is now managed by migration files (mesher/migrations/).
# This module retains only runtime partition creation for the events table.
# Build the DDL for a single daily partition.
# The date_str parameter is in YYYYMMDD format (e.g., "20260214").

fn build_partition_sql(date_str :: String) -> String do
  let year = String.slice(date_str, 0, 4)
  let month = String.slice(date_str, 4, 6)
  let day = String.slice(date_str, 6, 8)
  let formatted = year <> "-" <> month <> "-" <> day
  let part1 = "CREATE TABLE IF NOT EXISTS events_" <> date_str <> " PARTITION OF events FOR VALUES FROM ('"
  part1 <> formatted <> "') TO (('" <> formatted <> "'::date + 1))"
end

fn create_partitions_loop(pool :: PoolHandle, days :: Int, i :: Int) -> Int ! String do
  if i < days do
    let offset_str = String.from(i)
    let rows = Repo.query_raw(pool,
    "SELECT to_char(now() + ($1 || ' days')::interval, 'YYYYMMDD') AS d",
    [offset_str]) ?
    if List.length(rows) > 0 do
      let date_str = Map.get(List.head(rows), "d")
      Repo.execute_raw(pool, build_partition_sql(date_str), []) ?
      0
    else
      0
    end
    create_partitions_loop(pool, days, i + 1)
  else
    Ok(0)
  end
end

# Create daily partitions for the next N days from today.

pub fn create_partitions_ahead(pool :: PoolHandle, days :: Int) -> Int ! String do
  create_partitions_loop(pool, days, 0)
end
