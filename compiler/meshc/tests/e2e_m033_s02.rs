use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use mesh_rt::db::pg::{native_pg_close, native_pg_connect, native_pg_execute, native_pg_query};
use serde_json::Value;

type DbRow = HashMap<String, String>;

type OutputMap = HashMap<String, String>;

const MESHER_DATABASE_URL: &str = "postgres://mesh:mesh@127.0.0.1:5432/mesher";
const POSTGRES_IMAGE: &str = "postgres:16";
const POSTGRES_CONTAINER_PREFIX: &str = "mesh-m033-s02-pg";

struct PostgresContainer {
    name: String,
}

impl Drop for PostgresContainer {
    fn drop(&mut self) {
        let _ = Command::new("docker")
            .args(["rm", "-f", &self.name])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
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

    if path.file_name().is_some_and(|n| n == "deps") {
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

fn assert_command_success(output: &Output, description: &str) {
    assert!(
        output.status.success(),
        "{description} failed:\n{}",
        command_output_text(output)
    );
}

fn cleanup_stale_mesher_postgres_containers() {
    let output = Command::new("docker")
        .args([
            "ps",
            "-aq",
            "--filter",
            &format!("name={POSTGRES_CONTAINER_PREFIX}"),
        ])
        .output()
        .expect("failed to list stale docker containers");
    assert!(
        output.status.success(),
        "failed to list stale docker containers:\n{}",
        command_output_text(&output)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    let ids: Vec<&str> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    if ids.is_empty() {
        return;
    }

    let mut args = vec!["rm", "-f"];
    args.extend(ids.iter().copied());
    let cleanup = Command::new("docker")
        .args(args)
        .output()
        .expect("failed to remove stale docker containers");
    assert!(
        cleanup.status.success(),
        "failed to remove stale docker containers:\n{}",
        command_output_text(&cleanup)
    );
}

fn wait_for_postgres_ready() {
    for _ in 0..80 {
        if native_pg_connect(MESHER_DATABASE_URL).is_ok() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    panic!("temporary Postgres never accepted connections");
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
    assert!(
        output.status.success(),
        "failed to start temporary postgres container:\n{}",
        command_output_text(&output)
    );

    wait_for_postgres_ready();
    PostgresContainer { name }
}

fn with_mesher_postgres<T>(label: &str, f: impl FnOnce() -> T) -> T {
    let _guard = test_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _container = start_postgres_container(label);
    f()
}

fn run_mesher_migrations(database_url: &str) -> Output {
    Command::new(find_meshc())
        .current_dir(repo_root())
        .env("DATABASE_URL", database_url)
        .args(["migrate", "mesher", "up"])
        .output()
        .expect("failed to invoke meshc migrate mesher up")
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

fn ensure_today_event_partition(database_url: &str) {
    let day = query_single_row(
        database_url,
        "SELECT to_char(current_date, 'YYYYMMDD') AS suffix, current_date::text AS start_day, (current_date + 1)::text AS end_day",
        &[],
    );
    let suffix = day.get("suffix").expect("missing partition suffix");
    let start_day = day.get("start_day").expect("missing partition start_day");
    let end_day = day.get("end_day").expect("missing partition end_day");
    let sql = format!(
        "CREATE TABLE IF NOT EXISTS events_{suffix} PARTITION OF events FOR VALUES FROM ('{start_day}') TO ('{end_day}')"
    );
    execute_database_sql(database_url, &sql, &[]);
}

fn default_project_id(database_url: &str) -> String {
    query_single_row(
        database_url,
        "SELECT id::text AS id FROM projects WHERE slug = 'default'",
        &[],
    )
    .remove("id")
    .expect("default project id missing")
}

fn insert_org_and_project(database_url: &str, slug: &str) -> String {
    let org_slug = format!("org-{slug}");
    let org_name = format!("Org {slug}");
    let project_name = format!("Project {slug}");

    let org_id = query_single_row(
        database_url,
        "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id::text AS id",
        &[&org_name, &org_slug],
    )
    .remove("id")
    .expect("org id missing");

    query_single_row(
        database_url,
        "INSERT INTO projects (org_id, name, platform, slug) VALUES ($1::uuid, $2, 'mesh', $3) RETURNING id::text AS id",
        &[&org_id, &project_name, slug],
    )
    .remove("id")
    .expect("project id missing")
}

fn insert_issue(database_url: &str, project_id: &str, fingerprint: &str, title: &str, level: &str) -> String {
    query_single_row(
        database_url,
        "INSERT INTO issues (project_id, fingerprint, title, level) VALUES ($1::uuid, $2, $3, $4) RETURNING id::text AS id",
        &[project_id, fingerprint, title, level],
    )
    .remove("id")
    .expect("issue id missing")
}

fn insert_seed_event(
    database_url: &str,
    project_id: &str,
    issue_id: &str,
    level: &str,
    message: &str,
    fingerprint: &str,
    tags_json: &str,
) -> String {
    query_single_row(
        database_url,
        "INSERT INTO events (project_id, issue_id, level, message, fingerprint, tags, extra) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, '{}'::jsonb) RETURNING id::text AS id",
        &[project_id, issue_id, level, message, fingerprint, tags_json],
    )
    .remove("id")
    .expect("event id missing")
}

fn ensure_mesh_rt_staticlib() {
    static BUILD_ONCE: OnceLock<()> = OnceLock::new();
    BUILD_ONCE.get_or_init(|| {
        let output = Command::new("cargo")
            .current_dir(repo_root())
            .args(["build", "-p", "mesh-rt"])
            .output()
            .expect("failed to invoke cargo build -p mesh-rt");
        assert_command_success(&output, "cargo build -p mesh-rt");
    });
}

fn copy_mpl_tree(src: &Path, dst: &Path) {
    if !src.exists() {
        panic!("source tree missing: {}", src.display());
    }
    fs::create_dir_all(dst).unwrap_or_else(|e| {
        panic!(
            "failed to create destination tree {}: {}",
            dst.display(),
            e
        )
    });

    for entry in fs::read_dir(src).unwrap_or_else(|e| panic!("failed to read {}: {}", src.display(), e)) {
        let entry = entry.unwrap_or_else(|e| panic!("failed to read dir entry in {}: {}", src.display(), e));
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_mpl_tree(&path, &target);
        } else if path.extension().is_some_and(|ext| ext == "mpl") {
            fs::copy(&path, &target).unwrap_or_else(|e| {
                panic!(
                    "failed to copy {} -> {}: {}",
                    path.display(),
                    target.display(),
                    e
                )
            });
        }
    }
}

fn render_mesh_template(template: &str, replacements: &[(&str, String)]) -> String {
    let mut rendered = template.to_string();
    for (needle, value) in replacements {
        rendered = rendered.replace(needle, value);
    }
    rendered
}

fn mesh_string_literal(value: &str) -> String {
    serde_json::to_string(value).expect("failed to encode mesh string literal")
}

fn compile_and_run_mesher_storage_probe(main_source: &str) -> String {
    ensure_mesh_rt_staticlib();

    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let project_dir = temp_dir.path().join("project");
    fs::create_dir_all(&project_dir).expect("failed to create project dir");

    copy_mpl_tree(
        &repo_root().join("mesher").join("storage"),
        &project_dir.join("storage"),
    );
    copy_mpl_tree(
        &repo_root().join("mesher").join("types"),
        &project_dir.join("types"),
    );
    fs::write(project_dir.join("main.mpl"), main_source).expect("failed to write main.mpl");

    let meshc = find_meshc();
    let build_output = Command::new(&meshc)
        .current_dir(repo_root())
        .args(["build", project_dir.to_str().unwrap()])
        .output()
        .expect("failed to invoke meshc build");
    assert!(
        build_output.status.success(),
        "meshc build failed for Mesher storage probe:\n{}",
        command_output_text(&build_output)
    );

    let binary = project_dir.join("project");
    let run_output = Command::new(&binary)
        .current_dir(&project_dir)
        .output()
        .unwrap_or_else(|e| panic!("failed to run {}: {}", binary.display(), e));
    assert!(
        run_output.status.success(),
        "Mesher storage probe failed with exit code {:?}:\nstdout: {}\nstderr: {}",
        run_output.status.code(),
        String::from_utf8_lossy(&run_output.stdout),
        String::from_utf8_lossy(&run_output.stderr)
    );

    String::from_utf8_lossy(&run_output.stdout).to_string()
}

fn parse_output_map(output: &str) -> OutputMap {
    output
        .lines()
        .filter_map(|line| line.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

fn json_from_row(row: &DbRow, key: &str) -> Value {
    serde_json::from_str(row.get(key).unwrap_or_else(|| panic!("missing {key} in row: {row:?}")))
        .unwrap_or_else(|e| panic!("failed to parse json field {key}: {e}; row={row:?}"))
}

#[test]
fn e2e_m033_s02_pgcrypto_auth_helpers() {
    with_mesher_postgres("auth", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");

        let email = "m033-auth@example.com";
        let password = "Tricky auth password 42";
        let wrong_password = "definitely-wrong";
        let display_name = "M033 Auth";

        let template = r#"
from Storage.Queries import create_user, authenticate_user

fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err=#{e}")
    Ok( pool) -> do
      let create_result = create_user(pool, __EMAIL__, __PASSWORD__, __DISPLAY_NAME__)
      case create_result do
        Err( e) -> println("create_err=#{e}")
        Ok( user_id) -> do
          println("created=#{user_id}")
          case authenticate_user(pool, __EMAIL__, __PASSWORD__) do
            Err( e) -> println("auth_err=#{e}")
            Ok( user) -> println("auth_ok=#{user.id}|#{user.email}|#{user.display_name}")
          end
          case authenticate_user(pool, __EMAIL__, __WRONG_PASSWORD__) do
            Ok( _) -> println("auth_wrong=unexpected_ok")
            Err( e) -> println("auth_wrong=#{e}")
          end
        end
      end
    end
  end
end
"#;
        let source = render_mesh_template(
            template,
            &[
                ("__EMAIL__", mesh_string_literal(email)),
                ("__PASSWORD__", mesh_string_literal(password)),
                ("__DISPLAY_NAME__", mesh_string_literal(display_name)),
                ("__WRONG_PASSWORD__", mesh_string_literal(wrong_password)),
            ],
        );

        let output = compile_and_run_mesher_storage_probe(&source);
        let values = parse_output_map(&output);
        assert!(
            values.contains_key("created"),
            "e2e_m033_s02_pgcrypto_auth_helpers missing created marker:\n{output}"
        );
        assert_eq!(
            values.get("auth_wrong").map(String::as_str),
            Some("not found"),
            "e2e_m033_s02_pgcrypto_auth_helpers should reject the wrong password without echoing it:\n{output}"
        );
        assert!(
            values
                .get("auth_ok")
                .map(|v| v.ends_with("|m033-auth@example.com|M033 Auth"))
                .unwrap_or(false),
            "e2e_m033_s02_pgcrypto_auth_helpers did not authenticate the stored user:\n{output}"
        );

        let user_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT id::text AS id, email, display_name, password_hash, (password_hash = crypt($1, password_hash))::text AS verifies FROM users WHERE email = $2",
            &[password, email],
        );
        assert_eq!(
            user_row.get("email").map(String::as_str),
            Some(email),
            "e2e_m033_s02_auth_user_row email drifted: {user_row:?}"
        );
        assert_eq!(
            user_row.get("display_name").map(String::as_str),
            Some(display_name),
            "e2e_m033_s02_auth_user_row display_name drifted: {user_row:?}"
        );
        assert_eq!(
            user_row.get("verifies").map(String::as_str),
            Some("true"),
            "e2e_m033_s02_auth_user_row password hash no longer verifies via pgcrypto: {user_row:?}"
        );
        assert!(
            user_row
                .get("password_hash")
                .map(|hash| hash != password && hash.starts_with("$2"))
                .unwrap_or(false),
            "e2e_m033_s02_auth_user_row password_hash was not stored as a bcrypt-like pgcrypto hash: {user_row:?}"
        );
    });
}

#[test]
fn e2e_m033_s02_search_fulltext_ranking_and_binding() {
    with_mesher_postgres("search", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");
        ensure_today_event_partition(MESHER_DATABASE_URL);

        let default_project_id = default_project_id(MESHER_DATABASE_URL);
        let other_project_id = insert_org_and_project(MESHER_DATABASE_URL, "m033-search-alt");

        let hot_issue = insert_issue(
            MESHER_DATABASE_URL,
            &default_project_id,
            "fp-search-hot",
            "Search hot",
            "error",
        );
        let warm_issue = insert_issue(
            MESHER_DATABASE_URL,
            &default_project_id,
            "fp-search-warm",
            "Search warm",
            "error",
        );
        let other_issue = insert_issue(
            MESHER_DATABASE_URL,
            &other_project_id,
            "fp-search-other",
            "Search other",
            "error",
        );

        insert_seed_event(
            MESHER_DATABASE_URL,
            &default_project_id,
            &hot_issue,
            "error",
            "critical database critical database outage",
            "fp-search-hot",
            r#"{"env":"prod"}"#,
        );
        insert_seed_event(
            MESHER_DATABASE_URL,
            &default_project_id,
            &warm_issue,
            "error",
            "critical database outage",
            "fp-search-warm",
            r#"{"env":"prod"}"#,
        );
        insert_seed_event(
            MESHER_DATABASE_URL,
            &other_project_id,
            &other_issue,
            "error",
            "critical database critical database outage",
            "fp-search-other",
            r#"{"env":"shadow"}"#,
        );

        let template = r#"
from Storage.Queries import search_events_fulltext

fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err=#{e}")
    Ok( pool) -> do
      let result = search_events_fulltext(pool, __PROJECT_ID__, __SEARCH_QUERY__, "10")
      case result do
        Err( e) -> println("search_err=#{e}")
        Ok( rows) -> do
          println("search_count=#{List.length(rows)}")
          let first = List.get(rows, 0)
          let second = List.get(rows, 1)
          println("first_message=#{Map.get(first, \"message\")}")
          println("first_issue_id=#{Map.get(first, \"issue_id\")}")
          println("first_rank=#{Map.get(first, \"rank\")}")
          println("second_message=#{Map.get(second, \"message\")}")
          println("second_issue_id=#{Map.get(second, \"issue_id\")}")
          println("second_rank=#{Map.get(second, \"rank\")}")
        end
      end
    end
  end
end
"#;
        let source = render_mesh_template(
            template,
            &[
                ("__PROJECT_ID__", mesh_string_literal(&default_project_id)),
                (
                    "__SEARCH_QUERY__",
                    mesh_string_literal("critical database"),
                ),
            ],
        );

        let output = compile_and_run_mesher_storage_probe(&source);
        let values = parse_output_map(&output);
        assert_eq!(
            values.get("search_count").map(String::as_str),
            Some("2"),
            "e2e_m033_s02_search_fulltext_ranking_and_binding should return only the default-project matches:\n{output}"
        );
        assert_eq!(
            values.get("first_message").map(String::as_str),
            Some("critical database critical database outage"),
            "e2e_m033_s02_search_fulltext_ranking_and_binding first result drifted:\n{output}"
        );
        assert_eq!(
            values.get("second_message").map(String::as_str),
            Some("critical database outage"),
            "e2e_m033_s02_search_fulltext_ranking_and_binding second result drifted:\n{output}"
        );
        assert_eq!(
            values.get("first_issue_id").map(String::as_str),
            Some(hot_issue.as_str()),
            "e2e_m033_s02_search_fulltext_ranking_and_binding first issue_id drifted:\n{output}"
        );
        assert_eq!(
            values.get("second_issue_id").map(String::as_str),
            Some(warm_issue.as_str()),
            "e2e_m033_s02_search_fulltext_ranking_and_binding second issue_id drifted:\n{output}"
        );

        let first_rank = values
            .get("first_rank")
            .and_then(|value| value.parse::<f64>().ok())
            .expect("first_rank must parse as f64");
        let second_rank = values
            .get("second_rank")
            .and_then(|value| value.parse::<f64>().ok())
            .expect("second_rank must parse as f64");
        assert!(
            first_rank > second_rank,
            "e2e_m033_s02_search_fulltext_ranking_and_binding rank ordering drifted: {values:?}"
        );

        let rows = query_database_rows(
            MESHER_DATABASE_URL,
            "SELECT project_id::text AS project_id, issue_id::text AS issue_id, message FROM events ORDER BY message",
            &[],
        );
        assert_eq!(rows.len(), 3, "e2e_m033_s02_search_event_rows expected 3 rows: {rows:?}");
        assert!(
            rows.iter().any(|row| {
                row.get("project_id").map(String::as_str) == Some(default_project_id.as_str())
                    && row.get("issue_id").map(String::as_str) == Some(hot_issue.as_str())
                    && row.get("message").map(String::as_str)
                        == Some("critical database critical database outage")
            }),
            "e2e_m033_s02_search_event_rows missing hot project row: {rows:?}"
        );
        assert!(
            rows.iter().any(|row| {
                row.get("project_id").map(String::as_str) == Some(other_project_id.as_str())
                    && row.get("issue_id").map(String::as_str) == Some(other_issue.as_str())
            }),
            "e2e_m033_s02_search_event_rows missing cross-project isolation row: {rows:?}"
        );
    });
}

#[test]
fn e2e_m033_s02_jsonb_tag_helpers() {
    with_mesher_postgres("jsonb", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");
        ensure_today_event_partition(MESHER_DATABASE_URL);

        let project_id = default_project_id(MESHER_DATABASE_URL);
        let issue_id = insert_issue(
            MESHER_DATABASE_URL,
            &project_id,
            "fp-jsonb",
            "JSONB probe",
            "error",
        );

        let payload_one = r#"{"level":"error","message":"prod outage","tags":{"env":"prod","service":"api"},"extra":{"release":"1.0.0"}}"#;
        let payload_two = r#"{"level":"warning","message":"prod slow","tags":{"env":"prod","service":"worker"}}"#;
        let payload_three = r#"{"level":"info","message":"staging noise","tags":{"env":"staging"}}"#;
        let payload_four = r#"{"level":"error","message":"untagged event"}"#;

        let template = r#"
from Storage.Writer import insert_event
from Storage.Queries import filter_events_by_tag, event_breakdown_by_tag

fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err=#{e}")
    Ok( pool) -> do
      let _ = insert_event(pool, __PROJECT_ID__, __ISSUE_ID__, "fp-jsonb-1", __PAYLOAD_ONE__)
      let _ = insert_event(pool, __PROJECT_ID__, __ISSUE_ID__, "fp-jsonb-2", __PAYLOAD_TWO__)
      let _ = insert_event(pool, __PROJECT_ID__, __ISSUE_ID__, "fp-jsonb-3", __PAYLOAD_THREE__)
      let _ = insert_event(pool, __PROJECT_ID__, __ISSUE_ID__, "fp-jsonb-4", __PAYLOAD_FOUR__)

      let filtered = filter_events_by_tag(pool, __PROJECT_ID__, __TAG_JSON__, "10")
      case filtered do
        Err( e) -> println("filter_err=#{e}")
        Ok( rows) -> println("filter_count=#{List.length(rows)}")
      end

      let breakdown = event_breakdown_by_tag(pool, __PROJECT_ID__, "env")
      case breakdown do
        Err( e) -> println("breakdown_err=#{e}")
        Ok( rows) -> do
          println("breakdown_count=#{List.length(rows)}")
          let first = List.get(rows, 0)
          let second = List.get(rows, 1)
          println("breakdown_first=#{Map.get(first, \"tag_value\")}|#{Map.get(first, \"count\")}")
          println("breakdown_second=#{Map.get(second, \"tag_value\")}|#{Map.get(second, \"count\")}")
        end
      end
    end
  end
end
"#;
        let source = render_mesh_template(
            template,
            &[
                ("__PROJECT_ID__", mesh_string_literal(&project_id)),
                ("__ISSUE_ID__", mesh_string_literal(&issue_id)),
                ("__PAYLOAD_ONE__", mesh_string_literal(payload_one)),
                ("__PAYLOAD_TWO__", mesh_string_literal(payload_two)),
                ("__PAYLOAD_THREE__", mesh_string_literal(payload_three)),
                ("__PAYLOAD_FOUR__", mesh_string_literal(payload_four)),
                (
                    "__TAG_JSON__",
                    mesh_string_literal(r#"{"env":"prod"}"#),
                ),
            ],
        );

        let output = compile_and_run_mesher_storage_probe(&source);
        let values = parse_output_map(&output);
        assert_eq!(
            values.get("filter_count").map(String::as_str),
            Some("2"),
            "e2e_m033_s02_jsonb_tag_helpers filter count drifted:\n{output}"
        );
        assert_eq!(
            values.get("breakdown_count").map(String::as_str),
            Some("2"),
            "e2e_m033_s02_jsonb_tag_helpers breakdown count drifted:\n{output}"
        );
        assert_eq!(
            values.get("breakdown_first").map(String::as_str),
            Some("prod|2"),
            "e2e_m033_s02_jsonb_tag_helpers first breakdown row drifted:\n{output}"
        );
        assert_eq!(
            values.get("breakdown_second").map(String::as_str),
            Some("staging|1"),
            "e2e_m033_s02_jsonb_tag_helpers second breakdown row drifted:\n{output}"
        );

        let rows = query_database_rows(
            MESHER_DATABASE_URL,
            "SELECT message, tags::text AS tags, extra::text AS extra FROM events WHERE issue_id = $1::uuid ORDER BY message",
            &[&issue_id],
        );
        assert_eq!(rows.len(), 4, "e2e_m033_s02_jsonb_event_rows expected 4 rows: {rows:?}");

        let prod_outage = rows
            .iter()
            .find(|row| row.get("message").map(String::as_str) == Some("prod outage"))
            .expect("missing prod outage row");
        let prod_outage_tags = json_from_row(prod_outage, "tags");
        let prod_outage_extra = json_from_row(prod_outage, "extra");
        assert_eq!(prod_outage_tags["env"], "prod");
        assert_eq!(prod_outage_tags["service"], "api");
        assert_eq!(prod_outage_extra["release"], "1.0.0");

        let untagged = rows
            .iter()
            .find(|row| row.get("message").map(String::as_str) == Some("untagged event"))
            .expect("missing untagged event row");
        assert_eq!(json_from_row(untagged, "tags"), serde_json::json!({}));
        assert_eq!(json_from_row(untagged, "extra"), serde_json::json!({}));
    });
}

#[test]
fn e2e_m033_s02_alert_rule_and_fire_helpers() {
    with_mesher_postgres("alerts", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");

        let project_id = default_project_id(MESHER_DATABASE_URL);
        let event_rule_body = r#"{"name":"New issue pager","condition":{"condition_type":"new_issue"}}"#;
        let threshold_rule_body = r#"{"name":"Error flood","condition":{"condition_type":"threshold","threshold":"5","window_minutes":"10"},"cooldown_minutes":"15","action":{"type":"email"}}"#;

        let template = r#"
from Storage.Queries import create_alert_rule, get_event_alert_rules, get_threshold_rules, fire_alert

fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err=#{e}")
    Ok( pool) -> do
      let event_rule = create_alert_rule(pool, __PROJECT_ID__, __EVENT_RULE_BODY__)
      case event_rule do
        Err( e) -> println("event_rule_err=#{e}")
        Ok( event_rule_id) -> do
          println("event_rule_id=#{event_rule_id}")
          let threshold_rule = create_alert_rule(pool, __PROJECT_ID__, __THRESHOLD_RULE_BODY__)
          case threshold_rule do
            Err( e) -> println("threshold_rule_err=#{e}")
            Ok( threshold_rule_id) -> do
              println("threshold_rule_id=#{threshold_rule_id}")
              let event_rules = get_event_alert_rules(pool, __PROJECT_ID__, "new_issue")
              case event_rules do
                Err( e) -> println("event_rules_err=#{e}")
                Ok( rows) -> println("event_rules_count=#{List.length(rows)}")
              end
              let threshold_rules = get_threshold_rules(pool)
              case threshold_rules do
                Err( e) -> println("threshold_rules_err=#{e}")
                Ok( rows) -> println("threshold_rules_count=#{List.length(rows)}")
              end
              let fired = fire_alert(pool, event_rule_id, __PROJECT_ID__, "new_issue detected for issue issue-123", "new_issue", "New issue pager")
              case fired do
                Err( e) -> println("fire_err=#{e}")
                Ok( alert_id) -> println("alert_id=#{alert_id}")
              end
            end
          end
        end
      end
    end
  end
end
"#;
        let source = render_mesh_template(
            template,
            &[
                ("__PROJECT_ID__", mesh_string_literal(&project_id)),
                (
                    "__EVENT_RULE_BODY__",
                    mesh_string_literal(event_rule_body),
                ),
                (
                    "__THRESHOLD_RULE_BODY__",
                    mesh_string_literal(threshold_rule_body),
                ),
            ],
        );

        let output = compile_and_run_mesher_storage_probe(&source);
        let values = parse_output_map(&output);
        assert_eq!(
            values.get("event_rules_count").map(String::as_str),
            Some("1"),
            "e2e_m033_s02_alert_rule_and_fire_helpers event rule filter drifted:\n{output}"
        );
        assert_eq!(
            values.get("threshold_rules_count").map(String::as_str),
            Some("1"),
            "e2e_m033_s02_alert_rule_and_fire_helpers threshold rule filter drifted:\n{output}"
        );
        let event_rule_id = values
            .get("event_rule_id")
            .cloned()
            .expect("missing event_rule_id marker");
        let threshold_rule_id = values
            .get("threshold_rule_id")
            .cloned()
            .expect("missing threshold_rule_id marker");
        let alert_id = values
            .get("alert_id")
            .cloned()
            .expect("missing alert_id marker");

        let event_rule_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT id::text AS id, name, condition_json::text AS condition_json, action_json::text AS action_json, cooldown_minutes::text AS cooldown_minutes, enabled::text AS enabled, COALESCE(last_fired_at::text, '') AS last_fired_at FROM alert_rules WHERE id = $1::uuid",
            &[&event_rule_id],
        );
        assert_eq!(
            event_rule_row.get("name").map(String::as_str),
            Some("New issue pager"),
            "e2e_m033_s02_event_rule_row name drifted: {event_rule_row:?}"
        );
        assert_eq!(
            event_rule_row.get("cooldown_minutes").map(String::as_str),
            Some("60"),
            "e2e_m033_s02_event_rule_row default cooldown drifted: {event_rule_row:?}"
        );
        assert_eq!(
            event_rule_row.get("enabled").map(String::as_str),
            Some("true"),
            "e2e_m033_s02_event_rule_row enabled drifted: {event_rule_row:?}"
        );
        assert!(
            event_rule_row
                .get("last_fired_at")
                .map(|value| !value.is_empty())
                .unwrap_or(false),
            "e2e_m033_s02_event_rule_row last_fired_at was not updated after fire_alert: {event_rule_row:?}"
        );
        assert_eq!(
            json_from_row(&event_rule_row, "condition_json")["condition_type"],
            "new_issue"
        );
        assert_eq!(
            json_from_row(&event_rule_row, "action_json"),
            serde_json::json!({"type": "websocket"})
        );

        let threshold_rule_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT id::text AS id, name, condition_json::text AS condition_json, action_json::text AS action_json, cooldown_minutes::text AS cooldown_minutes FROM alert_rules WHERE id = $1::uuid",
            &[&threshold_rule_id],
        );
        assert_eq!(
            threshold_rule_row.get("name").map(String::as_str),
            Some("Error flood"),
            "e2e_m033_s02_threshold_rule_row name drifted: {threshold_rule_row:?}"
        );
        assert_eq!(
            threshold_rule_row
                .get("cooldown_minutes")
                .map(String::as_str),
            Some("15"),
            "e2e_m033_s02_threshold_rule_row cooldown drifted: {threshold_rule_row:?}"
        );
        assert_eq!(
            json_from_row(&threshold_rule_row, "condition_json")["condition_type"],
            "threshold"
        );
        assert_eq!(
            json_from_row(&threshold_rule_row, "action_json")["type"],
            "email"
        );

        let alert_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT id::text AS id, rule_id::text AS rule_id, project_id::text AS project_id, status, message, condition_snapshot::text AS condition_snapshot FROM alerts WHERE id = $1::uuid",
            &[&alert_id],
        );
        assert_eq!(
            alert_row.get("rule_id").map(String::as_str),
            Some(event_rule_id.as_str()),
            "e2e_m033_s02_alert_row rule_id drifted: {alert_row:?}"
        );
        assert_eq!(
            alert_row.get("project_id").map(String::as_str),
            Some(project_id.as_str()),
            "e2e_m033_s02_alert_row project_id drifted: {alert_row:?}"
        );
        assert_eq!(
            alert_row.get("status").map(String::as_str),
            Some("active"),
            "e2e_m033_s02_alert_row status drifted: {alert_row:?}"
        );
        assert_eq!(
            alert_row.get("message").map(String::as_str),
            Some("new_issue detected for issue issue-123"),
            "e2e_m033_s02_alert_row message drifted: {alert_row:?}"
        );
        assert_eq!(
            json_from_row(&alert_row, "condition_snapshot"),
            serde_json::json!({"condition_type": "new_issue", "rule_name": "New issue pager"})
        );
    });
}

#[test]
fn e2e_m033_s02_event_ingest_defaulting() {
    with_mesher_postgres("ingest", || {
        let migrate_output = run_mesher_migrations(MESHER_DATABASE_URL);
        assert_command_success(&migrate_output, "meshc migrate mesher up");
        ensure_today_event_partition(MESHER_DATABASE_URL);

        let project_id = default_project_id(MESHER_DATABASE_URL);
        let payload = r#"{"message":"Cannot read property 0xDEADBEEF","level":"error","exception":{"type_name":"TypeError","value":"Cannot read property 0xDEADBEEF"},"sdk_name":"sdk-js","sdk_version":"1.2.3"}"#;

        let template = r#"
from Storage.Queries import extract_event_fields, upsert_issue
from Storage.Writer import insert_event

fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err=#{e}")
    Ok( pool) -> do
      let fields_result = extract_event_fields(pool, __PAYLOAD__)
      case fields_result do
        Err( e) -> println("extract_err=#{e}")
        Ok( fields) -> do
          let fingerprint = Map.get(fields, "fingerprint")
          let title = Map.get(fields, "title")
          let level = Map.get(fields, "level")
          println("fingerprint=#{fingerprint}")
          println("title=#{title}")
          println("level=#{level}")
          let issue_result = upsert_issue(pool, __PROJECT_ID__, fingerprint, title, level)
          case issue_result do
            Err( e) -> println("upsert_err=#{e}")
            Ok( issue_id) -> do
              println("issue_id=#{issue_id}")
              let store_result = insert_event(pool, __PROJECT_ID__, issue_id, fingerprint, __PAYLOAD__)
              case store_result do
                Err( e) -> println("store_err=#{e}")
                Ok( status) -> println("store=#{status}")
              end
            end
          end
        end
      end
    end
  end
end
"#;
        let source = render_mesh_template(
            template,
            &[
                ("__PROJECT_ID__", mesh_string_literal(&project_id)),
                ("__PAYLOAD__", mesh_string_literal(payload)),
            ],
        );

        let output = compile_and_run_mesher_storage_probe(&source);
        let values = parse_output_map(&output);
        let expected_fingerprint = "TypeError:cannot read property deadbeef";
        assert_eq!(
            values.get("fingerprint").map(String::as_str),
            Some(expected_fingerprint),
            "e2e_m033_s02_event_ingest_defaulting fingerprint drifted:\n{output}"
        );
        assert_eq!(
            values.get("title").map(String::as_str),
            Some("Cannot read property 0xDEADBEEF"),
            "e2e_m033_s02_event_ingest_defaulting title drifted:\n{output}"
        );
        assert_eq!(
            values.get("level").map(String::as_str),
            Some("error"),
            "e2e_m033_s02_event_ingest_defaulting level drifted:\n{output}"
        );
        assert_eq!(
            values.get("store").map(String::as_str),
            Some("stored"),
            "e2e_m033_s02_event_ingest_defaulting insert_event did not return stored:\n{output}"
        );
        let issue_id = values
            .get("issue_id")
            .cloned()
            .expect("missing issue_id marker");

        let issue_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT id::text AS id, project_id::text AS project_id, fingerprint, title, level, status, event_count::text AS event_count FROM issues WHERE id = $1::uuid",
            &[&issue_id],
        );
        assert_eq!(
            issue_row.get("project_id").map(String::as_str),
            Some(project_id.as_str()),
            "e2e_m033_s02_ingest_issue_row project drifted: {issue_row:?}"
        );
        assert_eq!(
            issue_row.get("fingerprint").map(String::as_str),
            Some(expected_fingerprint),
            "e2e_m033_s02_ingest_issue_row fingerprint drifted: {issue_row:?}"
        );
        assert_eq!(
            issue_row.get("title").map(String::as_str),
            Some("Cannot read property 0xDEADBEEF"),
            "e2e_m033_s02_ingest_issue_row title drifted: {issue_row:?}"
        );
        assert_eq!(
            issue_row.get("level").map(String::as_str),
            Some("error"),
            "e2e_m033_s02_ingest_issue_row level drifted: {issue_row:?}"
        );
        assert_eq!(
            issue_row.get("status").map(String::as_str),
            Some("unresolved"),
            "e2e_m033_s02_ingest_issue_row status drifted: {issue_row:?}"
        );
        assert_eq!(
            issue_row.get("event_count").map(String::as_str),
            Some("1"),
            "e2e_m033_s02_ingest_issue_row event_count drifted: {issue_row:?}"
        );

        let event_row = query_single_row(
            MESHER_DATABASE_URL,
            "SELECT project_id::text AS project_id, issue_id::text AS issue_id, level, message, fingerprint, exception::text AS exception, tags::text AS tags, extra::text AS extra, COALESCE(user_context::text, 'null') AS user_context, COALESCE(sdk_name, '') AS sdk_name, COALESCE(sdk_version, '') AS sdk_version FROM events WHERE issue_id = $1::uuid",
            &[&issue_id],
        );
        assert_eq!(
            event_row.get("project_id").map(String::as_str),
            Some(project_id.as_str()),
            "e2e_m033_s02_ingest_event_row project drifted: {event_row:?}"
        );
        assert_eq!(
            event_row.get("issue_id").map(String::as_str),
            Some(issue_id.as_str()),
            "e2e_m033_s02_ingest_event_row issue drifted: {event_row:?}"
        );
        assert_eq!(
            event_row.get("level").map(String::as_str),
            Some("error"),
            "e2e_m033_s02_ingest_event_row level drifted: {event_row:?}"
        );
        assert_eq!(
            event_row.get("message").map(String::as_str),
            Some("Cannot read property 0xDEADBEEF"),
            "e2e_m033_s02_ingest_event_row message drifted: {event_row:?}"
        );
        assert_eq!(
            event_row.get("fingerprint").map(String::as_str),
            Some(expected_fingerprint),
            "e2e_m033_s02_ingest_event_row fingerprint drifted: {event_row:?}"
        );
        assert_eq!(
            json_from_row(&event_row, "exception")["type_name"],
            "TypeError"
        );
        assert_eq!(json_from_row(&event_row, "tags"), serde_json::json!({}));
        assert_eq!(json_from_row(&event_row, "extra"), serde_json::json!({}));
        assert_eq!(
            event_row.get("user_context").map(String::as_str),
            Some("null"),
            "e2e_m033_s02_ingest_event_row user_context drifted: {event_row:?}"
        );
        assert_eq!(
            event_row.get("sdk_name").map(String::as_str),
            Some("sdk-js"),
            "e2e_m033_s02_ingest_event_row sdk_name drifted: {event_row:?}"
        );
        assert_eq!(
            event_row.get("sdk_version").map(String::as_str),
            Some("1.2.3"),
            "e2e_m033_s02_ingest_event_row sdk_version drifted: {event_row:?}"
        );
    });
}
