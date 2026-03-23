//! End-to-end integration tests for all Phase 10 developer tools.
//!
//! Verifies that the meshc binary's developer-facing subcommands work together:
//! - `meshc build --json` produces valid JSON diagnostics for type errors
//! - `meshc fmt` formats files, `meshc fmt --check` verifies formatting
//! - `meshc init` creates a compilable project
//! - `meshc repl --help` confirms REPL subcommand availability
//! - `meshc lsp --help` confirms LSP subcommand availability

use std::path::PathBuf;
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
    std::fs::write(project.join("main.mpl"), "fn main() do\n  println(\"app\")\nend\n").unwrap();
    std::fs::write(project.join("math.mpl"), "pub fn answer() -> Int do\n  42\nend\n").unwrap();
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
