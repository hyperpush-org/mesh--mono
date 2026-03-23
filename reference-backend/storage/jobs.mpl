from Types.Job import Job

fn job_from_row(row) -> Job do
  Job {
    id: Map.get(row, "id"),
    status: Map.get(row, "status"),
    attempts: Map.get(row, "attempts"),
    last_error: Map.get(row, "last_error"),
    payload: Map.get(row, "payload"),
    created_at: Map.get(row, "created_at"),
    updated_at: Map.get(row, "updated_at"),
    processed_at: Map.get(row, "processed_at")
  }
end

fn find_single_job(rows, missing_message :: String) -> Job!String do
  if List.length(rows) > 0 do
    Ok(job_from_row(List.head(rows)))
  else
    Err(missing_message)
  end
end

pub fn create_job(pool :: PoolHandle, payload :: String) -> Job!String do
  let sql = "INSERT INTO jobs (status, attempts, payload) SELECT 'pending', 0, $1::jsonb RETURNING id::text, status, attempts::text, COALESCE(last_error, '') AS last_error, payload::text, created_at::text, updated_at::text, COALESCE(processed_at::text, '') AS processed_at"
  let rows = Repo.query_raw(pool, sql, [payload])?
  find_single_job(rows, "create_job: no row returned")
end

pub fn get_job(pool :: PoolHandle, job_id :: String) -> Job!String do
  let sql = "SELECT id::text, status, attempts::text, COALESCE(last_error, '') AS last_error, payload::text, created_at::text, updated_at::text, COALESCE(processed_at::text, '') AS processed_at FROM jobs WHERE id = $1::uuid"
  let rows = Repo.query_raw(pool, sql, [job_id])?
  find_single_job(rows, "not found")
end
