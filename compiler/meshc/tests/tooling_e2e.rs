//! End-to-end integration tests for all Phase 10 developer tools.
//!
//! Verifies that the meshc binary's developer-facing subcommands work together:
//! - `meshc build --json` produces valid JSON diagnostics for type errors
//! - `meshc fmt` formats files, `meshc fmt --check` verifies formatting
//! - `meshc init` creates a compilable project
//! - `meshc init --clustered` creates a clustered project using only public clustered-app surfaces
//! - `meshc init --template todo-api` creates a clustered SQLite Todo API starter
//! - `meshc repl --help` confirms REPL subcommand availability
//! - `meshc lsp --help` confirms LSP subcommand availability

use std::path::{Path, PathBuf};
use std::process::Command;

/// Locate the repository root from the meshc package manifest directory.
fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("meshc crate should live under compiler/")
        .parent()
        .expect("workspace root should be above compiler/")
        .to_path_buf()
}

/// Locate the meshc binary built by cargo.
fn meshc_bin() -> PathBuf {
    // CARGO_BIN_EXE_meshc is set by cargo when running integration tests
    // for the meshc package.
    PathBuf::from(env!("CARGO_BIN_EXE_meshc"))
}

fn write_file(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, contents).unwrap();
}

fn write_override_entry_test_project(root: &Path) -> (PathBuf, PathBuf, PathBuf) {
    let project_dir = root.join("override-entry-project");
    let tests_dir = project_dir.join("tests");
    let test_file = tests_dir.join("override_entry.test.mpl");

    write_file(
        &project_dir.join("mesh.toml"),
        "[package]\nname = \"override-entry-project\"\nversion = \"0.1.0\"\nentrypoint = \"lib/start.mpl\"\n",
    );
    write_file(
        &project_dir.join("lib/start.mpl"),
        "from App import answer\n\nfn main() do\n  println(\"app=#{answer()}\")\nend\n",
    );
    write_file(
        &project_dir.join("app.mpl"),
        "pub fn answer() -> Int do\n  42\nend\n",
    );
    write_file(
        &tests_dir.join("support.mpl"),
        "pub fn label() -> String do\n  \"support\"\nend\n",
    );
    write_file(
        &test_file,
        "from App import answer\nfrom Tests.Support import label\n\ntest(\"override entry roots all targets the same way\") do\n  assert(answer() == 42)\n  assert(label() == \"support\")\nend\n",
    );

    (project_dir, tests_dir, test_file)
}

fn assert_meshc_test_target_succeeds(target: &Path) {
    let output = Command::new(meshc_bin())
        .args(["test", target.to_str().unwrap()])
        .output()
        .expect("failed to run meshc test target");

    assert!(
        output.status.success(),
        "meshc test {} failed:\nstdout: {}\nstderr: {}",
        target.display(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        String::from_utf8_lossy(&output.stdout).contains("1 passed"),
        "expected one passing test file for target {}, got:\n{}",
        target.display(),
        String::from_utf8_lossy(&output.stdout)
    );
}

// ── Error messages (--json) ──────────────────────────────────────────

#[test]
fn test_build_json_output() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    std::fs::create_dir_all(&project).unwrap();

    // Write a Mesh file with a type error (assigning string to Int annotation).
    std::fs::write(project.join("main.mpl"), "let x :: Int = \"hello\"\n").unwrap();

    let output = Command::new(meshc_bin())
        .args(["build", "--json", project.to_str().unwrap()])
        .output()
        .expect("failed to run meshc build --json");

    assert!(
        !output.status.success(),
        "Expected build to fail on type error"
    );

    let stderr = String::from_utf8_lossy(&output.stderr);

    // stderr contains concatenated JSON objects. Use a streaming deserializer
    // to extract the first one (the type error diagnostic).
    let mut stream = serde_json::Deserializer::from_str(&stderr).into_iter::<serde_json::Value>();
    let json = stream
        .next()
        .expect("no JSON object in stderr")
        .expect("first JSON object is not valid");

    // Verify required JSON fields.
    assert!(json.get("code").is_some(), "JSON missing 'code' field");
    assert!(
        json.get("severity").is_some(),
        "JSON missing 'severity' field"
    );
    assert!(
        json.get("message").is_some(),
        "JSON missing 'message' field"
    );
    assert!(json.get("spans").is_some(), "JSON missing 'spans' field");

    // Verify the error code starts with E (type error).
    let code = json["code"].as_str().unwrap();
    assert!(
        code.starts_with('E'),
        "Expected error code starting with E, got: {}",
        code
    );

    // Verify spans array is non-empty.
    let spans = json["spans"].as_array().unwrap();
    assert!(!spans.is_empty(), "Expected at least one span");

    // Verify no ANSI escape codes in output.
    assert!(
        !stderr.contains("\x1b["),
        "JSON mode should not contain ANSI escape codes"
    );
}

// ── Formatter ────────────────────────────────────────────────────────

#[test]
fn test_fmt_formats_file() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("test.mpl");

    // Write an unformatted Mesh file (no spaces around operator, no indentation).
    std::fs::write(&file, "fn add(a,b) do\na+b\nend").unwrap();

    let output = Command::new(meshc_bin())
        .args(["fmt", file.to_str().unwrap()])
        .output()
        .expect("failed to run meshc fmt");

    assert!(
        output.status.success(),
        "meshc fmt failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let contents = std::fs::read_to_string(&file).unwrap();

    // Verify the file was reformatted (canonical 2-space indent, spaces around ops).
    assert_eq!(contents, "fn add(a, b) do\n  a + b\nend\n");
}

#[test]
fn test_fmt_check_formatted() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("good.mpl");

    // Write an already-formatted file.
    std::fs::write(&file, "fn add(a, b) do\n  a + b\nend\n").unwrap();

    let output = Command::new(meshc_bin())
        .args(["fmt", "--check", file.to_str().unwrap()])
        .output()
        .expect("failed to run meshc fmt --check");

    assert!(
        output.status.success(),
        "Expected exit 0 for already-formatted file, got: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn test_fmt_check_unformatted() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("bad.mpl");

    // Write an unformatted file.
    std::fs::write(&file, "fn bad(a,b) do\na+b\nend").unwrap();

    let output = Command::new(meshc_bin())
        .args(["fmt", "--check", file.to_str().unwrap()])
        .output()
        .expect("failed to run meshc fmt --check");

    assert_eq!(
        output.status.code(),
        Some(1),
        "Expected exit 1 for unformatted file"
    );

    // File should NOT be modified in check mode.
    let contents = std::fs::read_to_string(&file).unwrap();
    assert_eq!(contents, "fn bad(a,b) do\na+b\nend");
}

#[test]
fn test_fmt_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("idem.mpl");

    // Write an unformatted file.
    std::fs::write(&file, "fn foo(x) do\nlet y = x\ny\nend").unwrap();

    // Format once.
    let output1 = Command::new(meshc_bin())
        .args(["fmt", file.to_str().unwrap()])
        .output()
        .expect("failed to run meshc fmt (first pass)");
    assert!(output1.status.success(), "First format pass failed");

    let after_first = std::fs::read_to_string(&file).unwrap();

    // Format again.
    let output2 = Command::new(meshc_bin())
        .args(["fmt", file.to_str().unwrap()])
        .output()
        .expect("failed to run meshc fmt (second pass)");
    assert!(output2.status.success(), "Second format pass failed");

    let after_second = std::fs::read_to_string(&file).unwrap();

    // Both passes should produce identical output.
    assert_eq!(
        after_first, after_second,
        "Formatting is not idempotent!\nFirst pass:\n{}\nSecond pass:\n{}",
        after_first, after_second
    );

    // Additionally verify --check agrees the file is formatted.
    let check = Command::new(meshc_bin())
        .args(["fmt", "--check", file.to_str().unwrap()])
        .output()
        .expect("failed to run meshc fmt --check after formatting");
    assert!(
        check.status.success(),
        "fmt --check disagrees after formatting: {}",
        String::from_utf8_lossy(&check.stderr)
    );
}

// ── Test runner ──────────────────────────────────────────────────────

#[test]
fn test_test_runs_tests_directory_target() {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("proj");
    let tests_dir = project.join("tests");

    std::fs::create_dir_all(&tests_dir).unwrap();
    std::fs::write(
        project.join("main.mpl"),
        "fn main() do\n  println(\"app\")\nend\n",
    )
    .unwrap();
    std::fs::write(
        project.join("math.mpl"),
        "pub fn answer() -> Int do\n  42\nend\n",
    )
    .unwrap();
    std::fs::write(
        tests_dir.join("math.test.mpl"),
        "from Math import answer\n\ntest(\"directory target runs project tests\") do\n  assert(answer() == 42)\nend\n",
    )
    .unwrap();

    let output = Command::new(meshc_bin())
        .args(["test", tests_dir.to_str().unwrap()])
        .output()
        .expect("failed to run meshc test on tests directory");

    assert!(
        output.status.success(),
        "meshc test <tests-dir> failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("1 passed"),
        "expected a passing file-level summary for directory-target execution, got:\n{}",
        stdout
    );
}

#[test]
fn test_test_project_directory_target_succeeds_for_override_entry_without_root_main() {
    let dir = tempfile::tempdir().unwrap();
    let (project_dir, _, _) = write_override_entry_test_project(dir.path());

    assert_meshc_test_target_succeeds(&project_dir);
}

#[test]
fn test_test_tests_directory_target_succeeds_for_override_entry_without_root_main() {
    let dir = tempfile::tempdir().unwrap();
    let (_, tests_dir, _) = write_override_entry_test_project(dir.path());

    assert_meshc_test_target_succeeds(&tests_dir);
}

#[test]
fn test_test_specific_file_target_succeeds_for_override_entry_without_root_main() {
    let dir = tempfile::tempdir().unwrap();
    let (_, _, test_file) = write_override_entry_test_project(dir.path());

    assert_meshc_test_target_succeeds(&test_file);
}

#[test]
fn test_test_specific_file_target_fails_closed_when_no_project_root_exists() {
    let dir = tempfile::tempdir().unwrap();
    let orphan = dir.path().join("orphan.test.mpl");
    write_file(
        &orphan,
        "test(\"orphan\") do\n  assert(true)\nend\n",
    );

    let output = Command::new(meshc_bin())
        .args(["test", orphan.to_str().unwrap()])
        .output()
        .expect("failed to run meshc test on orphan test file");

    assert!(
        !output.status.success(),
        "meshc test should fail closed for orphan file target:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Could not resolve a Mesh project root"),
        "expected truthful wrong-root error, got:\n{}",
        stderr
    );
    assert!(stderr.contains(orphan.to_str().unwrap()), "{}", stderr);
}

#[test]
fn test_test_reference_backend_project_directory_succeeds() {
    let root = repo_root();

    let output = Command::new(meshc_bin())
        .current_dir(&root)
        .args(["test", "reference-backend"])
        .output()
        .expect("failed to run meshc test reference-backend");

    assert!(
        output.status.success(),
        "meshc test reference-backend failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("1 passed"),
        "expected reference-backend project-dir run to execute one passing test file, got:\n{}",
        stdout
    );
}

#[test]
fn test_test_coverage_reports_unsupported_contract() {
    let root = repo_root();

    let output = Command::new(meshc_bin())
        .current_dir(&root)
        .args(["test", "--coverage", "reference-backend"])
        .output()
        .expect("failed to run meshc test --coverage reference-backend");

    assert_eq!(
        output.status.code(),
        Some(1),
        "expected unsupported coverage contract to exit 1, got stdout: {} stderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("coverage reporting is not implemented for `meshc test`; run the command without --coverage"),
        "expected honest unsupported coverage message, got:\n{}",
        stderr
    );
    assert!(
        !String::from_utf8_lossy(&output.stdout).contains("Coverage reporting coming soon"),
        "coverage command should no longer claim success with a placeholder"
    );
}

// ── Package manager ──────────────────────────────────────────────────

#[test]
fn test_init_creates_project() {
    let dir = tempfile::tempdir().unwrap();

    let output = Command::new(meshc_bin())
        .args(["init", "test-project"])
        .current_dir(dir.path())
        .output()
        .expect("failed to run meshc init");

    assert!(
        output.status.success(),
        "meshc init failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    // Verify mesh.toml exists.
    let toml_path = dir.path().join("test-project").join("mesh.toml");
    assert!(
        toml_path.exists(),
        "mesh.toml not created at {}",
        toml_path.display()
    );

    // Verify main.mpl exists.
    let main_path = dir.path().join("test-project").join("main.mpl");
    assert!(
        main_path.exists(),
        "main.mpl not created at {}",
        main_path.display()
    );

    // Verify mesh.toml contains the project name.
    let toml_contents = std::fs::read_to_string(&toml_path).unwrap();
    assert!(
        toml_contents.contains("test-project"),
        "mesh.toml does not contain project name"
    );
}

#[test]
fn test_init_clustered_creates_project() {
    let dir = tempfile::tempdir().unwrap();

    let output = Command::new(meshc_bin())
        .args(["init", "--clustered", "clustered-project"])
        .current_dir(dir.path())
        .output()
        .expect("failed to run meshc init --clustered");

    assert!(
        output.status.success(),
        "meshc init --clustered failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let project_dir = dir.path().join("clustered-project");
    let toml_path = project_dir.join("mesh.toml");
    let main_path = project_dir.join("main.mpl");
    let work_path = project_dir.join("work.mpl");
    let readme_path = project_dir.join("README.md");

    assert!(toml_path.exists(), "clustered mesh.toml should exist");
    assert!(main_path.exists(), "clustered main.mpl should exist");
    assert!(work_path.exists(), "clustered work.mpl should exist");
    assert!(readme_path.exists(), "clustered README.md should exist");

    let toml_contents = std::fs::read_to_string(&toml_path).unwrap();
    assert!(toml_contents.contains("[package]"));
    assert!(toml_contents.contains("clustered-project"));
    assert!(!toml_contents.contains("[cluster]"));
    assert!(!toml_contents.contains("Work.execute_declared_work"));

    let main_contents = std::fs::read_to_string(&main_path).unwrap();
    assert_eq!(main_contents.matches("Node.start_from_env()").count(), 1);
    assert!(main_contents.contains("BootstrapStatus"));
    assert!(main_contents.contains("runtime bootstrap"));
    assert!(main_contents.contains("runtime bootstrap failed"));
    assert!(!main_contents.contains("Continuity.submit_declared_work"));
    assert!(!main_contents.contains("HTTP.serve("));
    assert!(!main_contents.contains("/health"));
    assert!(!main_contents.contains("/work"));
    assert!(!main_contents.contains("Env.get_int"));
    assert!(!main_contents.contains("Node.start("));
    assert!(!main_contents.contains("CLUSTER_PROOF_"));

    let work_contents = std::fs::read_to_string(&work_path).unwrap();
    assert!(work_contents.contains("@cluster pub fn add()"));
    assert!(!work_contents.contains("execute_declared_work"));
    assert!(!work_contents.contains("request_key"));
    assert!(!work_contents.contains("attempt_id"));
    assert!(!work_contents.contains("declared_work_runtime_name"));
    assert!(!work_contents.contains("clustered(work)"));
    assert!(work_contents.contains("1 + 1"));
    assert!(!work_contents.contains("declared_work_target"));
    assert!(!work_contents.contains("Continuity.submit_declared_work"));
    assert!(!work_contents.contains("Continuity.mark_completed"));
    assert!(!work_contents.contains("Timer.sleep"));
    assert!(!work_contents.contains("owner_node"));
    assert!(!work_contents.contains("replica_node"));

    let readme_contents = std::fs::read_to_string(&readme_path).unwrap();
    assert!(
        readme_contents.contains("mesh.toml` is package-only and intentionally omits `[cluster]`")
    );
    assert!(readme_contents.contains("Node.start_from_env()"));
    assert!(readme_contents.contains("@cluster pub fn add()"));
    assert!(readme_contents.contains("Work.add"));
    assert!(readme_contents.contains("1 + 1"));
    assert!(readme_contents.contains("meshc cluster status"));
    assert!(readme_contents.contains("meshc cluster continuity <node-name@host:port> --json"));
    assert!(readme_contents
        .contains("meshc cluster continuity <node-name@host:port> <request-key> --json"));
    assert!(readme_contents.contains("meshc cluster diagnostics"));
    assert!(readme_contents.contains("MESH_CONTINUITY_ROLE"));
    assert!(readme_contents.contains("MESH_CONTINUITY_PROMOTION_EPOCH"));
    assert!(
        readme_contents.contains("automatically starts the source-declared `@cluster` function")
    );
    assert!(!readme_contents.contains("declared_work_runtime_name()"));
    assert!(!readme_contents.contains("clustered(work)"));
    assert!(!readme_contents.contains("Continuity.submit_declared_work"));
    assert!(!readme_contents.contains("HTTP.serve("));
    assert!(!readme_contents.contains("HTTP.clustered("));
    assert!(!readme_contents.contains("/health"));
    assert!(!readme_contents.contains("/work"));
    assert!(!readme_contents.contains("Timer.sleep"));
    assert!(!readme_contents.contains("CLUSTER_PROOF_"));
}

#[test]
fn test_init_clustered_rejects_existing_directory() {
    let dir = tempfile::tempdir().unwrap();

    let first = Command::new(meshc_bin())
        .args(["init", "--clustered", "clustered-project"])
        .current_dir(dir.path())
        .output()
        .expect("failed to run initial meshc init --clustered");
    assert!(
        first.status.success(),
        "initial meshc init --clustered failed: {}",
        String::from_utf8_lossy(&first.stderr)
    );

    let second = Command::new(meshc_bin())
        .args(["init", "--clustered", "clustered-project"])
        .current_dir(dir.path())
        .output()
        .expect("failed to rerun meshc init --clustered");

    assert!(
        !second.status.success(),
        "rerunning meshc init --clustered should fail cleanly"
    );

    let stderr = String::from_utf8_lossy(&second.stderr);
    let stdout = String::from_utf8_lossy(&second.stdout);
    let combined = format!("{stdout}\n{stderr}");
    assert!(
        combined.contains("already exists"),
        "expected existing-directory collision message, got:\n{}",
        combined
    );
}

#[test]
fn test_init_clustered_todo_template_creates_project() {
    let dir = tempfile::tempdir().unwrap();

    let output = Command::new(meshc_bin())
        .args(["init", "--template", "todo-api", "todo-starter"])
        .current_dir(dir.path())
        .output()
        .expect("failed to run meshc init --template todo-api");

    assert!(
        output.status.success(),
        "meshc init --template todo-api failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let project_dir = dir.path().join("todo-starter");
    let manifest_path = project_dir.join("mesh.toml");
    let main_path = project_dir.join("main.mpl");
    let work_path = project_dir.join("work.mpl");
    let readme_path = project_dir.join("README.md");
    let dockerfile_path = project_dir.join("Dockerfile");
    let dockerignore_path = project_dir.join(".dockerignore");
    let router_path = project_dir.join("api/router.mpl");
    let todos_path = project_dir.join("api/todos.mpl");
    let health_path = project_dir.join("api/health.mpl");
    let registry_path = project_dir.join("runtime/registry.mpl");
    let limiter_path = project_dir.join("services/rate_limiter.mpl");
    let storage_path = project_dir.join("storage/todos.mpl");
    let todo_type_path = project_dir.join("types/todo.mpl");

    for path in [
        &manifest_path,
        &main_path,
        &work_path,
        &readme_path,
        &dockerfile_path,
        &dockerignore_path,
        &router_path,
        &todos_path,
        &health_path,
        &registry_path,
        &limiter_path,
        &storage_path,
        &todo_type_path,
    ] {
        assert!(path.exists(), "missing generated file {}", path.display());
    }

    let manifest = std::fs::read_to_string(&manifest_path).unwrap();
    assert!(manifest.contains("[package]"));
    assert!(manifest.contains("todo-starter"));
    assert!(!manifest.contains("[cluster]"));

    let main = std::fs::read_to_string(&main_path).unwrap();
    assert!(main.contains("Node.start_from_env()"));
    assert!(main.contains("start_rate_limiter"));
    assert!(main.contains("start_registry"));
    assert!(main.contains("ensure_schema"));
    assert!(main.contains("HTTP.serve(router, port)"));
    assert!(main.contains("TODO_DB_PATH"));
    assert!(main.contains("TODO_RATE_LIMIT_WINDOW_SECONDS"));
    assert!(main.contains("TODO_RATE_LIMIT_MAX_REQUESTS"));
    assert!(!main.contains("execute_declared_work"));
    assert!(!main.contains("HTTP.clustered("));

    let work = std::fs::read_to_string(&work_path).unwrap();
    assert!(work.contains("@cluster pub fn sync_todos()"));
    assert!(!work.contains("execute_declared_work"));
    assert!(!work.contains("request_key"));
    assert!(!work.contains("attempt_id"));

    let router = std::fs::read_to_string(&router_path).unwrap();
    assert!(router.contains("HTTP.on_get(\"/health\", handle_health)"));
    assert!(router.contains("HTTP.on_get(\"/todos\", HTTP.clustered(1, handle_list_todos))"));
    assert!(router.contains("HTTP.on_get(\"/todos/:id\", HTTP.clustered(1, handle_get_todo))"));
    assert!(router.contains("HTTP.on_post(\"/todos\", handle_create_todo)"));
    assert!(router.contains("HTTP.on_put(\"/todos/:id\", handle_toggle_todo)"));
    assert!(router.contains("HTTP.on_delete(\"/todos/:id\", handle_delete_todo)"));
    assert!(!router.contains("HTTP.on_get(\"/health\", HTTP.clustered("));
    assert!(!router.contains("HTTP.on_post(\"/todos\", HTTP.clustered("));
    assert!(!router.contains("HTTP.on_put(\"/todos/:id\", HTTP.clustered("));
    assert!(!router.contains("HTTP.on_delete(\"/todos/:id\", HTTP.clustered("));
    assert!(!router.contains("HTTP.clustered(handle_list_todos)"));
    assert!(!router.contains("HTTP.clustered(handle_get_todo)"));

    let todos = std::fs::read_to_string(&todos_path).unwrap();
    assert!(todos.contains("allow_write("));
    assert!(todos.contains("title is required"));
    assert!(todos.contains("rate limited"));
    assert!(todos.contains("Json.encode(todo)"));
    assert!(todos.contains("pub fn handle_list_todos(_request :: Request) -> Response do"));
    assert!(todos.contains("pub fn handle_get_todo(request :: Request) -> Response do"));

    let health = std::fs::read_to_string(&health_path).unwrap();
    assert!(health.contains("clustered_handler : \"Work.sync_todos\""));

    let registry = std::fs::read_to_string(&registry_path).unwrap();
    assert!(registry.contains("Process.register(\"todo_api_registry\""));

    let limiter = std::fs::read_to_string(&limiter_path).unwrap();
    assert!(limiter.contains("service TodoWriteRateLimiter do"));
    assert!(limiter.contains("spawn(rate_window_ticker"));

    let storage = std::fs::read_to_string(&storage_path).unwrap();
    assert!(storage.contains("Sqlite.open"));
    assert!(storage.contains("CREATE TABLE IF NOT EXISTS todos"));
    assert!(storage.contains("last_insert_rowid()"));

    let todo_type = std::fs::read_to_string(&todo_type_path).unwrap();
    assert!(todo_type.contains("pub struct Todo do"));
    assert!(todo_type.contains("end deriving(Json)"));

    let readme = std::fs::read_to_string(&readme_path).unwrap();
    assert!(readme.contains("meshc init --template todo-api"));
    assert!(readme.contains("@cluster pub fn sync_todos()"));
    assert!(readme.contains("Work.sync_todos"));
    assert!(readme.contains("GET /health"));
    assert!(readme.contains("GET /todos"));
    assert!(readme.contains("POST /todos"));
    assert!(readme.contains("PUT /todos/:id"));
    assert!(readme.contains("DELETE /todos/:id"));
    assert!(readme.contains("`GET /todos` and `GET /todos/:id` use `HTTP.clustered(1, ...)`"));
    assert!(readme.contains("`GET /health` — local runtime + rate-limit configuration snapshot"));
    assert!(readme.contains("list todos through `HTTP.clustered(1, ...)`"));
    assert!(readme.contains("fetch one todo through `HTTP.clustered(1, ...)`"));
    assert!(readme.contains("Mutating routes (`POST`, `PUT`, `DELETE`) stay local"));
    assert!(readme.contains("TODO_DB_PATH"));
    assert!(readme.contains("TODO_RATE_LIMIT_WINDOW_SECONDS"));
    assert!(readme.contains("TODO_RATE_LIMIT_MAX_REQUESTS"));
    assert!(readme.contains("meshc cluster status"));
    assert!(readme.contains("docker build -t todo-starter ."));
    assert!(readme.contains("packages the binary produced by `meshc build .`"));
    assert!(readme.contains("the Dockerfile copies the already-compiled `./output` binary"));
    assert!(!readme.contains("execute_declared_work"));
    assert!(!readme.contains("does **not** pretend `HTTP.clustered(...)` exists yet"));

    let dockerfile = std::fs::read_to_string(&dockerfile_path).unwrap();
    assert!(dockerfile.contains("FROM ubuntu:24.04"));
    assert!(dockerfile.contains("COPY output /usr/local/bin/todo-starter"));
    assert!(dockerfile.contains("ENTRYPOINT [\"/usr/local/bin/todo-starter\"]"));
    assert!(dockerfile.contains("EXPOSE 8080 4370"));

    let dockerignore = std::fs::read_to_string(&dockerignore_path).unwrap();
    assert!(dockerignore.contains("*.sqlite3"));
    assert!(dockerignore.contains("target"));
}

#[test]
fn test_init_clustered_todo_template_rejects_existing_directory() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("todo-starter")).unwrap();

    let output = Command::new(meshc_bin())
        .args(["init", "--template", "todo-api", "todo-starter"])
        .current_dir(dir.path())
        .output()
        .expect("failed to rerun meshc init --template todo-api");

    assert!(
        !output.status.success(),
        "rerunning meshc init --template todo-api should fail cleanly"
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{stdout}\n{stderr}");
    assert!(
        combined.contains("already exists"),
        "expected existing-directory collision message, got:\n{}",
        combined
    );
}

// ── REPL ─────────────────────────────────────────────────────────────

#[test]
fn test_repl_help() {
    let output = Command::new(meshc_bin())
        .args(["repl", "--help"])
        .output()
        .expect("failed to run meshc repl --help");

    assert!(
        output.status.success(),
        "meshc repl --help failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Help text should mention REPL or interactive.
    let mentions_repl =
        stdout.to_lowercase().contains("repl") || stdout.to_lowercase().contains("interactive");
    assert!(
        mentions_repl,
        "repl --help should mention REPL or interactive, got:\n{}",
        stdout
    );
}

// ── LSP ──────────────────────────────────────────────────────────────

#[test]
fn test_lsp_subcommand_exists() {
    let output = Command::new(meshc_bin())
        .args(["lsp", "--help"])
        .output()
        .expect("failed to run meshc lsp --help");

    assert!(
        output.status.success(),
        "meshc lsp --help should exit 0, got: {:?}\nstderr: {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stderr)
    );
}
