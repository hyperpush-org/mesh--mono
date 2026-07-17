# Daily retention cleaner. PostgreSQL owns the complete cleanup transaction so
# the advisory lock, project-specific row deletion, and shared-partition policy
# all use one connection and either commit or roll back together.

from Storage.Queries import run_retention_cleanup_db

fn log_cleanup_rows(rows, dry_run :: Bool) do
  if List.length(rows) > 0 do
    let row = List.head(rows)
    let mode = if dry_run do "dry_run" else "apply" end
    println("[Mesher] retention_cleanup mode=#{mode} deleted_events=#{Map.get(row, "deleted_events")} dropped_partitions=#{Map.get(row, "dropped_partitions")} partition_retention_days=#{Map.get(row, "partition_retention_days")}")
  else
    println("[Mesher] retention_cleanup outcome=empty")
  end
  0
end

fn log_cleanup_error(e :: String) do
  println("[Mesher] retention_cleanup outcome=error reason=#{e}")
  0
end

fn run_cleanup(pool :: PoolHandle, dry_run :: Bool) do
  let result = run_retention_cleanup_db(pool, dry_run)
  case result do
    Ok( rows) -> log_cleanup_rows(rows, dry_run)
    Err( e) -> log_cleanup_error(e)
  end
end

actor retention_cleaner(pool :: PoolHandle) do
  Timer.sleep(86400000)
  let dry_run = Env.get("MESHER_RETENTION_DRY_RUN", "false") == "true"
  run_cleanup(pool, dry_run)
  retention_cleaner(pool)
end
