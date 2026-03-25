use std::any::Any;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read as _, Write as _};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use mesh_rt::db::pg::{native_pg_close, native_pg_connect, native_pg_execute, native_pg_query};
use serde_json::Value;

type DbRow = HashMap<String, String>;

const MESHER_DATABASE_URL: &str = "postgres://mesh:mesh@127.0.0.1:5432/mesher";
const DEFAULT_PROJECT_SLUG: &str = "default";
const DEFAULT_API_KEY: &str = "mshr_devdefaultapikey000000000000000000000000000";
const POSTGRES_IMAGE: &str = "postgres:16";
const POSTGRES_CONTAINER_PREFIX: &str = "mesh-m033-s01-pg";

#[derive(Clone, Copy, Debug)]
struct MesherConfig {
    http_port: u16,
    ws_port: u16,
}

struct SpawnedMesher {
    child: Child,
    stdout_path: PathBuf,
    stderr_path: PathBuf,
}

struct StoppedMesher {
    stdout: String,
    stderr: String,
    combined: String,
}

struct HttpResponse {
    status_code: u16,
    body: String,
    raw: String,
}

struct PostgresContainer {
    name: String,
}

impl Drop for PostgresContainer {
    fn drop(&mut self) {
        let _ = Command::new("docker")
            .args(["rm", "-f", &self.name])
            .output();
    }
}

fn test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn find_meshc() -> PathBuf {
    let mut path = std::env::current_exe()
        .expect("cannot find current exe")
        .parent()
        .expect("cannot find parent dir")
        .to_path_buf();

    if path.file_name().map_or(false, |n| n == "deps") {
        path = path.parent().unwrap().to_path_buf();
    }

    let meshc = path.join("meshc");
    assert!(
        meshc.exists(),
        "meshc binary not found at {}. Run `cargo build -p meshc` first.",
        meshc.display()
    );
    meshc
}

fn command_output_text(output: &Output) -> String {
    format!(
        "stdout:\n{}\n\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

fn panic_payload_to_string(payload: Box<dyn Any + Send>) -> String {
    if let Some(msg) = payload.downcast_ref::<&str>() {
        (*msg).to_string()
    } else if let Some(msg) = payload.downcast_ref::<String>() {
        msg.clone()
    } else {
        "non-string panic payload".to_string()
    }
}

fn pick_unused_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("failed to bind ephemeral port")
        .local_addr()
        .expect("failed to read ephemeral port")
        .port()
}

fn mesher_test_config() -> MesherConfig {
    MesherConfig {
        http_port: pick_unused_port(),
        ws_port: pick_unused_port(),
    }
}

fn mesher_binary() -> PathBuf {
    repo_root().join("mesher").join("mesher")
}

fn mesher_log_paths() -> (PathBuf, PathBuf) {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_nanos();
    let base = std::env::temp_dir();
    let stdout_path = base.join(format!("mesher-{stamp}-stdout.log"));
    let stderr_path = base.join(format!("mesher-{stamp}-stderr.log"));
    (stdout_path, stderr_path)
}

fn spawn_mesher(config: MesherConfig) -> SpawnedMesher {
    let binary = mesher_binary();
    let (stdout_path, stderr_path) = mesher_log_paths();
    let stdout_file = File::create(&stdout_path)
        .unwrap_or_else(|e| panic!("failed to create {}: {}", stdout_path.display(), e));
    let stderr_file = File::create(&stderr_path)
        .unwrap_or_else(|e| panic!("failed to create {}: {}", stderr_path.display(), e));

    let child = Command::new(&binary)
        .current_dir(repo_root())
        .env("MESHER_HTTP_PORT", config.http_port.to_string())
        .env("MESHER_WS_PORT", config.ws_port.to_string())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .unwrap_or_else(|e| panic!("failed to spawn {}: {}", binary.display(), e));

    SpawnedMesher {
        child,
        stdout_path,
        stderr_path,
    }
}

fn collect_stopped_mesher(mut child: Child, stdout_path: PathBuf, stderr_path: PathBuf) -> StoppedMesher {
    child.wait().expect("failed to collect mesher exit status");

    let stdout = fs::read_to_string(&stdout_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {}", stdout_path.display(), e));
    let stderr = fs::read_to_string(&stderr_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {}", stderr_path.display(), e));
    let _ = fs::remove_file(&stdout_path);
    let _ = fs::remove_file(&stderr_path);
    let combined = format!("{stdout}{stderr}");

    StoppedMesher {
        stdout,
        stderr,
        combined,
    }
}

fn stop_mesher(spawned: SpawnedMesher) -> StoppedMesher {
    let SpawnedMesher {
        mut child,
        stdout_path,
        stderr_path,
    } = spawned;

    let _ = Command::new("kill")
        .args(["-TERM", &child.id().to_string()])
        .status();
    std::thread::sleep(Duration::from_millis(250));
    if child
        .try_wait()
        .expect("failed to probe mesher exit status")
        .is_none()
    {
        let _ = child.kill();
    }

    collect_stopped_mesher(child, stdout_path, stderr_path)
}

fn send_http_request(
    config: &MesherConfig,
    method: &str,
    path: &str,
    body: Option<&str>,
    headers: &[(&str, &str)],
) -> std::io::Result<HttpResponse> {
    let mut stream = TcpStream::connect(("127.0.0.1", config.http_port))?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;

    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n");
    for (name, value) in headers {
        request.push_str(name);
        request.push_str(": ");
        request.push_str(value);
        request.push_str("\r\n");
    }
    if let Some(body) = body {
        request.push_str("Content-Type: application/json\r\n");
        request.push_str(&format!("Content-Length: {}\r\n", body.as_bytes().len()));
        request.push_str("\r\n");
        request.push_str(body);
    } else {
        request.push_str("\r\n");
    }

    stream.write_all(request.as_bytes())?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw)?;

    let mut parts = raw.splitn(2, "\r\n\r\n");
    let headers = parts.next().unwrap_or("");
    let body = parts.next().unwrap_or("").to_string();
    let status_code = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);

    Ok(HttpResponse {
        status_code,
        body,
        raw,
    })
}

fn assert_json_response(response: HttpResponse, expected_status: u16, description: &str) -> Value {
    assert!(
        response.status_code == expected_status,
        "expected HTTP {expected_status} for {description}, got raw response:\n{}",
        response.raw
    );
    serde_json::from_str(&response.body).unwrap_or_else(|e| {
        panic!(
            "expected JSON body for {description}, got parse error {e}: {}",
            response.body
        )
    })
}

fn post_json(config: &MesherConfig, path: &str, body: &str, expected_status: u16) -> Value {
    let response = send_http_request(config, "POST", path, Some(body), &[])
        .unwrap_or_else(|e| panic!("POST {path} failed on {}: {}", config.http_port, e));
    assert_json_response(response, expected_status, path)
}

fn post_json_with_headers(
    config: &MesherConfig,
    path: &str,
    body: &str,
    headers: &[(&str, &str)],
    expected_status: u16,
) -> Value {
    let response = send_http_request(config, "POST", path, Some(body), headers)
        .unwrap_or_else(|e| panic!("POST {path} failed on {}: {}", config.http_port, e));
    assert_json_response(response, expected_status, path)
}

fn wait_for_mesher(config: &MesherConfig) -> Value {
    let mut last_response = Value::Null;

    for attempt in 0..60 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(250));
        }

        match send_http_request(
            config,
            "GET",
            "/api/v1/projects/default/settings",
            None,
            &[],
        ) {
            Ok(response) if response.status_code == 200 => {
                let json = assert_json_response(response, 200, "/api/v1/projects/default/settings");
                if json["retention_days"].is_number() && json["sample_rate"].is_number() {
                    return json;
                }
                last_response = json;
            }
            Ok(response) => {
                last_response = Value::String(response.raw);
            }
            Err(_) => continue,
        }
    }

    panic!(
        "mesher never reached ready settings response on :{}; last_response={}",
        config.http_port, last_response
    );
}

fn query_database_rows(database_url: &str, sql: &str, params: &[&str]) -> Vec<DbRow> {
    let mut conn = native_pg_connect(database_url)
        .unwrap_or_else(|e| panic!("failed to connect to Postgres for query: {e}"));
    let result = native_pg_query(&mut conn, sql, params);
    native_pg_close(conn);
    let rows = result.unwrap_or_else(|e| panic!("query failed: {e}\nsql: {sql}"));
    rows.into_iter()
        .map(|row| row.into_iter().collect())
        .collect()
}

fn query_single_row(database_url: &str, sql: &str, params: &[&str]) -> DbRow {
    let rows = query_database_rows(database_url, sql, params);
    assert_eq!(rows.len(), 1, "expected exactly one row for SQL: {sql}");
    rows.into_iter().next().unwrap()
}

fn execute_database_sql(database_url: &str, sql: &str, params: &[&str]) -> i64 {
    let mut conn = native_pg_connect(database_url)
        .unwrap_or_else(|e| panic!("failed to connect to Postgres for execute: {e}"));
    let result = native_pg_execute(&mut conn, sql, params);
    native_pg_close(conn);
    result.unwrap_or_else(|e| panic!("execute failed: {e}\nsql: {sql}"))
}

fn cleanup_stale_mesher_postgres_containers() {
    let output = Command::new("docker")
        .args(["ps", "-aq", "--filter", &format!("name={POSTGRES_CONTAINER_PREFIX}")])
        .output()
        .expect("failed to list stale docker containers");
    if !output.status.success() {
        panic!("failed to list stale docker containers:\n{}", command_output_text(&output));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let ids: Vec<&str> = stdout.lines().filter(|line| !line.trim().is_empty()).collect();
    if ids.is_empty() {
        return;
    }

    let mut args = vec!["rm", "-f"];
    args.extend(ids.iter().copied());
    let cleanup = Command::new("docker")
        .args(args)
        .output()
        .expect("failed to remove stale docker containers");
    if !cleanup.status.success() {
        panic!(
            "failed to remove stale docker containers:\n{}",
            command_output_text(&cleanup)
        );
    }
}

fn wait_for_postgres_ready() {
    for attempt in 0..80 {
        if native_pg_connect(MESHER_DATABASE_URL).is_ok() {
            return;
        }
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(250));
        }
    }
    panic!("temporary Postgres never accepted connections at {MESHER_DATABASE_URL}");
}

fn start_postgres_container(label: &str) -> PostgresContainer {
    cleanup_stale_mesher_postgres_containers();

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_secs();
    let name = format!("{POSTGRES_CONTAINER_PREFIX}-{label}-{stamp}");
    let output = Command::new("docker")
        .args([
            "run",
            "--rm",
            "-d",
            "--name",
            &name,
            "-e",
            "POSTGRES_USER=mesh",
            "-e",
            "POSTGRES_PASSWORD=mesh",
            "-e",
            "POSTGRES_DB=mesher",
            "-p",
            "5432:5432",
            POSTGRES_IMAGE,
        ])
        .output()
        .expect("failed to start temporary postgres container");
    if !output.status.success() {
        panic!("failed to start temporary postgres container:\n{}", command_output_text(&output));
    }

    let container = PostgresContainer { name };
    wait_for_postgres_ready();
    container
}

fn run_mesher_migrations(database_url: &str) -> Output {
    Command::new(find_meshc())
        .current_dir(repo_root())
        .env("DATABASE_URL", database_url)
        .args(["migrate", "mesher", "up"])
        .output()
        .expect("failed to invoke meshc migrate mesher up")
}

fn build_mesher() -> Output {
    Command::new(find_meshc())
        .current_dir(repo_root())
        .args(["build", "mesher"])
        .output()
        .expect("failed to invoke meshc build mesher")
}

fn assert_command_success(output: &Output, description: &str) {
    assert!(
        output.status.success(),
        "{description} failed:\n{}",
        command_output_text(output)
    );
}

fn compile_and_run_mesh(source: &str) -> String {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let project_dir = temp_dir.path().join("project");
    fs::create_dir_all(&project_dir).expect("failed to create project dir");

    let main_mesh = project_dir.join("main.mpl");
    fs::write(&main_mesh, source).expect("failed to write main.mpl");

    let meshc = find_meshc();
    let output = Command::new(&meshc)
        .current_dir(repo_root())
        .args(["build", project_dir.to_str().unwrap()])
        .output()
        .expect("failed to invoke meshc build");

    assert!(
        output.status.success(),
        "meshc build failed:\n{}",
        command_output_text(&output)
    );

    let binary = project_dir.join("project");
    let run_output = Command::new(&binary)
        .current_dir(&project_dir)
        .output()
        .unwrap_or_else(|e| panic!("failed to run binary at {}: {}", binary.display(), e));

    assert!(
        run_output.status.success(),
        "binary execution failed with exit code {:?}:\nstdout: {}\nstderr: {}",
        run_output.status.code(),
        String::from_utf8_lossy(&run_output.stdout),
        String::from_utf8_lossy(&run_output.stderr)
    );

    String::from_utf8_lossy(&run_output.stdout).to_string()
}

fn with_mesher_postgres<T>(label: &str, f: impl FnOnce() -> T) -> T {
    let _guard = test_lock().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let _container = start_postgres_container(label);
    f()
}

fn assert_mesher_logs(logs: &StoppedMesher, config: &MesherConfig) {
    assert!(
        logs.combined.contains("[Mesher] Connecting to PostgreSQL"),
        "mesher logs never showed the Postgres connection banner:\n{}",
        logs.combined
    );
    assert!(
        logs.combined.contains(&format!("HTTP server listening on 0.0.0.0:{}", config.http_port))
            || logs.combined.contains(&format!("HTTP server listening on 127.0.0.1:{}", config.http_port))
            || logs.combined.contains(&format!("Listening on {}", config.http_port)),
        "mesher logs never showed the HTTP listener on :{}:\n{}",
        config.http_port,
        logs.combined
    );
}

#[test]
fn e2e_m033_expr_repo_executes() {
    with_mesher_postgres("expr", || {
        execute_database_sql(MESHER_DATABASE_URL, "DROP TABLE IF EXISTS m033_expr_updates", &[]);
        execute_database_sql(
            MESHER_DATABASE_URL,
            "CREATE TABLE m033_expr_updates (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, status TEXT NOT NULL, touched_at TIMESTAMPTZ NOT NULL DEFAULT now())",
            &[],
        );
        execute_database_sql(MESHER_DATABASE_URL, "DROP TABLE IF EXISTS m033_expr_upserts", &[]);
        execute_database_sql(
            MESHER_DATABASE_URL,
            "CREATE TABLE m033_expr_upserts (slug TEXT PRIMARY KEY, amount INTEGER NOT NULL, status TEXT NOT NULL, touched_at TIMESTAMPTZ NOT NULL DEFAULT now())",
            &[],
        );

        let update_source = r#"
fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err:#{e}")
    Ok( pool) -> do
      let insert_result = Repo.insert(pool,
      "m033_expr_updates",
      %{"id" => "row-1", "amount" => "1", "status" => "resolved"})
      case insert_result do
        Err( e) -> println("insert_err:#{e}")
        Ok( _) -> do
          let q = Query.from("m033_expr_updates")
            |> Query.where(:id, "row-1")
          let update_result = Repo.update_where_expr(pool,
          "m033_expr_updates",
          %{
            "amount" => Expr.add(Expr.column("amount"), Expr.value("2")),
            "touched_at" => Expr.fn_call("now", []),
            "status" => Expr.case_when(
              [Expr.eq(Expr.column("status"), Expr.value("resolved"))],
              [Expr.value("unresolved")],
              Expr.column("status")
            )
          },
          q)
          case update_result do
            Err( e) -> println("update_err:#{e}")
            Ok( row) -> do
              println("update_amount=#{Map.get(row, "amount")}")
              println("update_status=#{Map.get(row, "status")}")
            end
          end
        end
      end
    end
  end
end
"#;
        let update_output = compile_and_run_mesh(update_source);
        assert!(
            update_output.contains("update_amount=3"),
            "update_where_expr did not report the computed amount:\n{}",
            update_output
        );
        assert!(
            update_output.contains("update_status=unresolved"),
            "update_where_expr did not report the CASE result:\n{}",
            update_output
        );

        let updated_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT amount::text AS amount, status, touched_at::text AS touched_at FROM m033_expr_updates WHERE id = $1",
            &["row-1"],
        );
        assert_eq!(updated_row.get("amount").map(String::as_str), Some("3"));
        assert_eq!(updated_row.get("status").map(String::as_str), Some("unresolved"));
        assert!(
            updated_row
                .get("touched_at")
                .map(|value| !value.is_empty())
                .unwrap_or(false),
            "update_where_expr must write touched_at: {:?}",
            updated_row
        );

        let upsert_source = r#"
fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err:#{e}")
    Ok( pool) -> do
      let insert_fields = %{"slug" => "alpha", "amount" => "1", "status" => "resolved"}
      let update_fields = %{
        "amount" => Expr.add(Expr.column("m033_expr_upserts.amount"), Expr.value("1")),
        "touched_at" => Expr.fn_call("now", []),
        "status" => Expr.case_when(
          [Expr.eq(Expr.column("m033_expr_upserts.status"), Expr.value("resolved"))],
          [Expr.value("unresolved")],
          Expr.column("m033_expr_upserts.status")
        )
      }
      let first_result = Repo.insert_or_update_expr(pool,
      "m033_expr_upserts",
      insert_fields,
      ["slug"],
      update_fields)
      case first_result do
        Err( e) -> println("upsert_err:#{e}")
        Ok( _) -> do
          let second_result = Repo.insert_or_update_expr(pool,
          "m033_expr_upserts",
          insert_fields,
          ["slug"],
          update_fields)
          case second_result do
            Err( e) -> println("upsert_err:#{e}")
            Ok( row) -> do
              println("upsert_amount=#{Map.get(row, "amount")}")
              println("upsert_status=#{Map.get(row, "status")}")
            end
          end
        end
      end
    end
  end
end
"#;
        let upsert_output = compile_and_run_mesh(upsert_source);
        assert!(
            upsert_output.contains("upsert_amount=2"),
            "insert_or_update_expr did not report the computed amount:\n{}",
            upsert_output
        );
        assert!(
            upsert_output.contains("upsert_status=unresolved"),
            "insert_or_update_expr did not report the CASE result:\n{}",
            upsert_output
        );

        let upsert_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT amount::text AS amount, status, touched_at::text AS touched_at FROM m033_expr_upserts WHERE slug = $1",
            &["alpha"],
        );
        assert_eq!(upsert_row.get("amount").map(String::as_str), Some("2"));
        assert_eq!(upsert_row.get("status").map(String::as_str), Some("unresolved"));
        assert!(
            upsert_row
                .get("touched_at")
                .map(|value| !value.is_empty())
                .unwrap_or(false),
            "insert_or_update_expr must write touched_at: {:?}",
            upsert_row
        );
    });
}

#[test]
fn expr_error_update_where_expr_requires_where_clause() {
    with_mesher_postgres("expr-error-update", || {
        let source = r#"
fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err:#{e}")
    Ok( pool) -> do
      let q = Query.from("m033_expr_updates")
      let result = Repo.update_where_expr(pool,
      "m033_expr_updates",
      %{"amount" => Expr.value("1")},
      q)
      case result do
        Ok( _) -> println("unexpected_ok")
        Err( e) -> println(e)
      end
    end
  end
end
"#;
        let output = compile_and_run_mesh(source);
        assert_eq!(output, "update_where_expr: no WHERE conditions\n");
    });
}

#[test]
fn expr_error_insert_or_update_expr_requires_conflict_targets() {
    with_mesher_postgres("expr-error-upsert", || {
        let source = r#"
fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err:#{e}")
    Ok( pool) -> do
      let result = Repo.insert_or_update_expr(pool,
      "m033_expr_upserts",
      %{"slug" => "alpha", "amount" => "1", "status" => "resolved"},
      [],
      %{"amount" => Expr.value("2")})
      case result do
        Ok( _) -> println("unexpected_ok")
        Err( e) -> println(e)
      end
    end
  end
end
"#;
        let output = compile_and_run_mesh(source);
        assert_eq!(output, "insert_or_update_expr: no conflict targets provided\n");
    });
}

#[test]
fn e2e_m033_mesher_mutations() {
    with_mesher_postgres("mesher-mutations", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");

        let build_output = build_mesher();
        assert_command_success(&build_output, "meshc build mesher");
        assert!(mesher_binary().exists(), "mesher binary was not built");

        let config = mesher_test_config();
        let spawned = spawn_mesher(config);

        let test_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let startup_settings = wait_for_mesher(&config);
            assert_eq!(startup_settings["retention_days"].as_i64(), Some(90));
            assert_eq!(startup_settings["sample_rate"].as_f64(), Some(1.0));

            let project_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT id::text AS id FROM projects WHERE slug = $1",
                &[DEFAULT_PROJECT_SLUG],
            );
            let project_id = project_row.get("id").cloned().expect("project id missing");

            let user_row = query_single_row(
                MESHER_DATABASE_URL,
                "INSERT INTO users (email, password_hash, display_name) VALUES ('m033-owner@example.com', 'hash', 'M033 Owner') RETURNING id::text AS id",
                &[],
            );
            let user_id = user_row.get("id").cloned().expect("user id missing");

            let ingest_body = r#"{"message":"M033 mutation issue","level":"error"}"#;
            let ingest = post_json_with_headers(
                &config,
                "/api/v1/events",
                ingest_body,
                &[("x-sentry-auth", DEFAULT_API_KEY)],
                202,
            );
            assert_eq!(ingest["status"].as_str(), Some("accepted"));

            let issue_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT id::text AS id, COALESCE(assigned_to::text, '') AS assigned_to FROM issues WHERE title = $1",
                &["M033 mutation issue"],
            );
            let issue_id = issue_row.get("id").cloned().expect("issue id missing");
            assert_eq!(issue_row.get("assigned_to").map(String::as_str), Some(""));

            let assign_response = post_json(
                &config,
                &format!("/api/v1/issues/{issue_id}/assign"),
                &format!(r#"{{"user_id":"{user_id}"}}"#),
                200,
            );
            assert_eq!(assign_response["status"].as_str(), Some("ok"));

            let assigned_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT COALESCE(assigned_to::text, '') AS assigned_to FROM issues WHERE id = $1::uuid",
                &[&issue_id],
            );
            assert_eq!(assigned_row.get("assigned_to").map(String::as_str), Some(user_id.as_str()));

            let unassign_response = post_json(
                &config,
                &format!("/api/v1/issues/{issue_id}/assign"),
                r#"{"user_id":""}"#,
                200,
            );
            assert_eq!(unassign_response["status"].as_str(), Some("ok"));

            let unassigned_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT COALESCE(assigned_to::text, '') AS assigned_to FROM issues WHERE id = $1::uuid",
                &[&issue_id],
            );
            assert_eq!(unassigned_row.get("assigned_to").map(String::as_str), Some(""));

            let api_key_row = query_single_row(
                MESHER_DATABASE_URL,
                "INSERT INTO api_keys (project_id, key_value, label) VALUES ($1::uuid, 'm033-manual-key', 'm033') RETURNING id::text AS id",
                &[&project_id],
            );
            let key_id = api_key_row.get("id").cloned().expect("api key id missing");

            let revoke_response = post_json(
                &config,
                &format!("/api/v1/api-keys/{key_id}/revoke"),
                "{}",
                200,
            );
            assert_eq!(revoke_response["status"].as_str(), Some("ok"));

            let revoked_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT COALESCE(revoked_at::text, '') AS revoked_at FROM api_keys WHERE id = $1::uuid",
                &[&key_id],
            );
            assert!(
                revoked_row
                    .get("revoked_at")
                    .map(|value| !value.is_empty())
                    .unwrap_or(false),
                "revoked_at was not set: {:?}",
                revoked_row
            );

            let rule_row = query_single_row(
                MESHER_DATABASE_URL,
                "INSERT INTO alert_rules (project_id, name, condition_json, action_json) VALUES ($1::uuid, 'm033-rule', '{\"condition_type\":\"threshold\"}'::jsonb, '{\"kind\":\"noop\"}'::jsonb) RETURNING id::text AS id",
                &[&project_id],
            );
            let rule_id = rule_row.get("id").cloned().expect("rule id missing");
            let alert_row = query_single_row(
                MESHER_DATABASE_URL,
                "INSERT INTO alerts (rule_id, project_id, status, message, condition_snapshot) VALUES ($1::uuid, $2::uuid, 'active', 'm033 active alert', '{\"value\":1}'::jsonb) RETURNING id::text AS id",
                &[&rule_id, &project_id],
            );
            let alert_id = alert_row.get("id").cloned().expect("alert id missing");

            let acknowledge_response = post_json(
                &config,
                &format!("/api/v1/alerts/{alert_id}/acknowledge"),
                "{}",
                200,
            );
            assert_eq!(acknowledge_response["status"].as_str(), Some("ok"));

            let acknowledged_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT status, COALESCE(acknowledged_at::text, '') AS acknowledged_at, COALESCE(resolved_at::text, '') AS resolved_at FROM alerts WHERE id = $1::uuid",
                &[&alert_id],
            );
            assert_eq!(acknowledged_row.get("status").map(String::as_str), Some("acknowledged"));
            assert!(
                acknowledged_row
                    .get("acknowledged_at")
                    .map(|value| !value.is_empty())
                    .unwrap_or(false),
                "acknowledged_at was not set: {:?}",
                acknowledged_row
            );
            assert_eq!(acknowledged_row.get("resolved_at").map(String::as_str), Some(""));

            let resolve_response = post_json(
                &config,
                &format!("/api/v1/alerts/{alert_id}/resolve"),
                "{}",
                200,
            );
            assert_eq!(resolve_response["status"].as_str(), Some("ok"));

            let resolved_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT status, COALESCE(acknowledged_at::text, '') AS acknowledged_at, COALESCE(resolved_at::text, '') AS resolved_at FROM alerts WHERE id = $1::uuid",
                &[&alert_id],
            );
            assert_eq!(resolved_row.get("status").map(String::as_str), Some("resolved"));
            assert!(
                resolved_row
                    .get("acknowledged_at")
                    .map(|value| !value.is_empty())
                    .unwrap_or(false),
                "acknowledged_at must stay set after resolve: {:?}",
                resolved_row
            );
            assert!(
                resolved_row
                    .get("resolved_at")
                    .map(|value| !value.is_empty())
                    .unwrap_or(false),
                "resolved_at was not set: {:?}",
                resolved_row
            );

            let settings_one = post_json(
                &config,
                "/api/v1/projects/default/settings",
                r#"{"retention_days":30}"#,
                200,
            );
            assert_eq!(settings_one["status"].as_str(), Some("ok"));

            let project_after_retention = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT retention_days::text AS retention_days, sample_rate::text AS sample_rate FROM projects WHERE id = $1::uuid",
                &[&project_id],
            );
            assert_eq!(
                project_after_retention.get("retention_days").map(String::as_str),
                Some("30")
            );
            let sample_rate_before = project_after_retention
                .get("sample_rate")
                .and_then(|value| value.parse::<f64>().ok())
                .expect("sample_rate must parse as float");
            assert!((sample_rate_before - 1.0).abs() < 0.0001);

            let settings_two = post_json(
                &config,
                "/api/v1/projects/default/settings",
                r#"{"sample_rate":0.25}"#,
                200,
            );
            assert_eq!(settings_two["status"].as_str(), Some("ok"));

            let project_after_sample_rate = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT retention_days::text AS retention_days, sample_rate::text AS sample_rate FROM projects WHERE id = $1::uuid",
                &[&project_id],
            );
            assert_eq!(
                project_after_sample_rate.get("retention_days").map(String::as_str),
                Some("30")
            );
            let sample_rate_after = project_after_sample_rate
                .get("sample_rate")
                .and_then(|value| value.parse::<f64>().ok())
                .expect("sample_rate must parse as float");
            assert!((sample_rate_after - 0.25).abs() < 0.0001);
        }));

        let logs = stop_mesher(spawned);

        match test_result {
            Ok(()) => assert_mesher_logs(&logs, &config),
            Err(payload) => panic!(
                "M033/S01 mesher mutation assertions failed: {}\nstdout:\n{}\nstderr:\n{}",
                panic_payload_to_string(payload),
                logs.stdout,
                logs.stderr
            ),
        }
    });
}

#[test]
fn e2e_m033_mesher_issue_upsert() {
    with_mesher_postgres("mesher-upsert", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");

        let build_output = build_mesher();
        assert_command_success(&build_output, "meshc build mesher");
        assert!(mesher_binary().exists(), "mesher binary was not built");

        let config = mesher_test_config();
        let spawned = spawn_mesher(config);

        let test_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            wait_for_mesher(&config);

            let first = post_json_with_headers(
                &config,
                "/api/v1/events",
                r#"{"message":"M033 repeated issue","level":"error"}"#,
                &[("x-sentry-auth", DEFAULT_API_KEY)],
                202,
            );
            assert_eq!(first["status"].as_str(), Some("accepted"));

            let row_one = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT id::text AS id, status, event_count::text AS event_count, last_seen::text AS last_seen FROM issues WHERE title = $1",
                &["M033 repeated issue"],
            );
            let issue_id = row_one.get("id").cloned().expect("issue id missing");
            let last_seen_one = row_one.get("last_seen").cloned().expect("last_seen missing");
            assert_eq!(row_one.get("status").map(String::as_str), Some("unresolved"));
            assert_eq!(row_one.get("event_count").map(String::as_str), Some("1"));

            std::thread::sleep(Duration::from_secs(1));

            let second = post_json_with_headers(
                &config,
                "/api/v1/events",
                r#"{"message":"M033 repeated issue","level":"error"}"#,
                &[("x-sentry-auth", DEFAULT_API_KEY)],
                202,
            );
            assert_eq!(second["status"].as_str(), Some("accepted"));

            let row_two = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT id::text AS id, status, event_count::text AS event_count, last_seen::text AS last_seen FROM issues WHERE id = $1::uuid",
                &[&issue_id],
            );
            let last_seen_two = row_two.get("last_seen").cloned().expect("last_seen missing");
            assert_eq!(row_two.get("id").map(String::as_str), Some(issue_id.as_str()));
            assert_eq!(row_two.get("status").map(String::as_str), Some("unresolved"));
            assert_eq!(row_two.get("event_count").map(String::as_str), Some("2"));
            assert_ne!(last_seen_two, last_seen_one, "last_seen must advance on repeated ingest");

            let resolve_response = post_json(
                &config,
                &format!("/api/v1/issues/{issue_id}/resolve"),
                "{}",
                200,
            );
            assert_eq!(resolve_response["status"].as_str(), Some("ok"));

            let resolved_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT status FROM issues WHERE id = $1::uuid",
                &[&issue_id],
            );
            assert_eq!(resolved_row.get("status").map(String::as_str), Some("resolved"));

            std::thread::sleep(Duration::from_secs(1));

            let third = post_json_with_headers(
                &config,
                "/api/v1/events",
                r#"{"message":"M033 repeated issue","level":"error"}"#,
                &[("x-sentry-auth", DEFAULT_API_KEY)],
                202,
            );
            assert_eq!(third["status"].as_str(), Some("accepted"));

            let row_three = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT id::text AS id, status, event_count::text AS event_count, last_seen::text AS last_seen FROM issues WHERE id = $1::uuid",
                &[&issue_id],
            );
            let last_seen_three = row_three.get("last_seen").cloned().expect("last_seen missing");
            assert_eq!(row_three.get("id").map(String::as_str), Some(issue_id.as_str()));
            assert_eq!(row_three.get("status").map(String::as_str), Some("unresolved"));
            assert_eq!(row_three.get("event_count").map(String::as_str), Some("3"));
            assert_ne!(last_seen_three, last_seen_two, "last_seen must advance after resolve regression");

            let event_count_row = query_single_row(
                MESHER_DATABASE_URL,
                "SELECT count(*)::text AS count FROM events WHERE issue_id = $1::uuid",
                &[&issue_id],
            );
            assert_eq!(event_count_row.get("count").map(String::as_str), Some("3"));
        }));

        let logs = stop_mesher(spawned);

        match test_result {
            Ok(()) => assert_mesher_logs(&logs, &config),
            Err(payload) => panic!(
                "M033/S01 issue upsert assertions failed: {}\nstdout:\n{}\nstderr:\n{}",
                panic_payload_to_string(payload),
                logs.stdout,
                logs.stderr
            ),
        }
    });
}
