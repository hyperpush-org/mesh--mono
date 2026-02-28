//! Test runner for Mesh: discovers *.test.mpl files, compiles and executes each,
//! aggregates pass/fail results, and formats output with ANSI colors.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use mesh_typeck::diagnostics::DiagnosticOptions;

const GREEN: &str = "\x1b[32m";
const RED: &str = "\x1b[31m";
const BOLD: &str = "\x1b[1m";
const RESET: &str = "\x1b[0m";

/// Summary of a test run.
#[allow(dead_code)]
pub struct TestSummary {
    /// Number of test files that passed (exit code 0).
    pub passed: usize,
    /// Number of test files that failed (compile error or exit code non-zero).
    pub failed: usize,
}

/// Run tests in the given project directory.
///
/// - `filter_file`: if Some, run only that specific *.test.mpl file.
/// - `quiet`: compact output (dots instead of per-file names).
/// - `coverage`: stub flag — prints message and exits cleanly without running tests.
pub fn run_tests(
    project_dir: &Path,
    filter_file: Option<&Path>,
    quiet: bool,
    coverage: bool,
) -> Result<TestSummary, String> {
    // --coverage stub: accepted, prints message, exits cleanly
    if coverage {
        println!("Coverage reporting coming soon");
        return Ok(TestSummary { passed: 0, failed: 0 });
    }

    // Discover test files
    let test_files = if let Some(specific) = filter_file {
        // Single file mode: resolve relative to cwd
        let abs = if specific.is_absolute() {
            specific.to_path_buf()
        } else {
            std::env::current_dir().unwrap_or_default().join(specific)
        };
        if !abs.exists() {
            return Err(format!("Test file '{}' does not exist", abs.display()));
        }
        if !abs.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with(".test.mpl"))
            .unwrap_or(false)
        {
            return Err(format!("'{}' is not a *.test.mpl file", abs.display()));
        }
        vec![abs]
    } else {
        discover_test_files(project_dir)?
    };

    if test_files.is_empty() {
        println!("No *.test.mpl files found.");
        return Ok(TestSummary { passed: 0, failed: 0 });
    }

    let start = Instant::now();
    let mut passed = 0usize;
    let mut failed = 0usize;

    for test_file in &test_files {
        let rel = test_file.strip_prefix(project_dir)
            .unwrap_or(test_file.as_path());
        let label = rel.display().to_string();

        // Compile the test file to a temp binary.
        // Each test file is a standalone program: copy it to a temp dir as main.mpl.
        let tmp_dir = tempfile::tempdir()
            .map_err(|e| format!("Failed to create temp dir: {}", e))?;
        let bin_path = tmp_dir.path().join("test_bin");

        let main_path = tmp_dir.path().join("main.mpl");
        std::fs::copy(test_file, &main_path)
            .map_err(|e| format!("Failed to copy test file: {}", e))?;

        let diag_opts = DiagnosticOptions { color: true, json: false };
        let compile_result = crate::build(
            tmp_dir.path(),
            0,        // opt_level: debug
            false,    // emit_llvm
            Some(&bin_path),
            None,     // target: native
            &diag_opts,
        );

        if let Err(e) = compile_result {
            if quiet {
                print!("{RED}F{RESET}");
                use std::io::Write;
                std::io::stdout().flush().ok();
            } else {
                println!("{RED}{BOLD}COMPILE ERROR{RESET}: {label}");
                println!("  {}", e);
            }
            failed += 1;
            continue;
        }

        // Execute the compiled binary
        let output = Command::new(&bin_path)
            .output()
            .map_err(|e| format!("Failed to execute '{}': {}", bin_path.display(), e))?;

        // Pass stdout/stderr through to terminal
        if !output.stdout.is_empty() {
            print!("{}", String::from_utf8_lossy(&output.stdout));
        }
        if !output.stderr.is_empty() {
            eprint!("{}", String::from_utf8_lossy(&output.stderr));
        }

        if output.status.success() {
            if quiet {
                print!("{GREEN}.{RESET}");
                use std::io::Write;
                std::io::stdout().flush().ok();
            }
            passed += 1;
        } else {
            if quiet {
                print!("{RED}F{RESET}");
                use std::io::Write;
                std::io::stdout().flush().ok();
            }
            failed += 1;
        }
    }

    if quiet {
        println!(); // newline after dots
    }

    let elapsed = start.elapsed();
    let elapsed_secs = elapsed.as_secs_f64();

    // Summary line
    if failed > 0 {
        println!("\n{RED}{BOLD}{failed} failed{RESET}, {passed} passed in {elapsed_secs:.2}s");
    } else {
        println!("\n{GREEN}{BOLD}{passed} passed{RESET} in {elapsed_secs:.2}s");
    }

    Ok(TestSummary { passed, failed })
}

/// Recursively discover all *.test.mpl files in a directory.
fn discover_test_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    discover_recursive(root, &mut files)
        .map_err(|e| format!("Failed to walk '{}': {}", root.display(), e))?;
    files.sort();
    Ok(files)
}

fn discover_recursive(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        // Skip hidden directories (e.g., .planning, .git, target) and build artifacts
        if name_str.starts_with('.') || name_str == "target" {
            continue;
        }
        if path.is_dir() {
            discover_recursive(&path, files)?;
        } else if path.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with(".test.mpl"))
            .unwrap_or(false)
        {
            files.push(path);
        }
    }
    Ok(())
}
