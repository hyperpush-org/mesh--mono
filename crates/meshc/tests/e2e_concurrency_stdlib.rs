//! End-to-end integration tests for Mesh concurrency standard library (Phase 9).
//!
//! Tests Service and Job constructs through the full compiler pipeline:
//! Mesh source -> parse -> typecheck -> MIR -> LLVM codegen -> native binary -> run.
//!
//! Tests use generous timeouts (30s) because:
//! - Each test compiles a fresh binary to a temp directory
//! - macOS Gatekeeper/XProtect adds ~1s first-run delay per unique binary
//! - When tests run in parallel, Gatekeeper checks serialize, so the Nth
//!   binary may wait up to N seconds before it even starts executing
//! - With 11 tests, worst-case startup delay is ~11s plus execution time

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// Helper: compile a Mesh source and run the binary with a timeout.
/// Returns stdout on success. Panics on compilation failure or timeout.
fn compile_and_run_with_timeout(source: &str, timeout_secs: u64) -> String {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let project_dir = temp_dir.path().join("project");
    std::fs::create_dir_all(&project_dir).expect("failed to create project dir");

    let main_mesh = project_dir.join("main.mpl");
    std::fs::write(&main_mesh, source).expect("failed to write main.mpl");

    // Build with meshc
    let meshc = find_meshc();
    let output = Command::new(&meshc)
        .args(["build", project_dir.to_str().unwrap()])
        .output()
        .expect("failed to invoke meshc");

    assert!(
        output.status.success(),
        "meshc build failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    // Run the compiled binary with a timeout
    let binary = project_dir.join("project");
    let child = Command::new(&binary)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap_or_else(|e| panic!("failed to spawn binary at {}: {}", binary.display(), e));

    let output = wait_with_timeout(child, Duration::from_secs(timeout_secs));

    match output {
        Ok(out) => {
            assert!(
                out.status.success(),
                "binary execution failed with exit code {:?}:\nstdout: {}\nstderr: {}",
                out.status.code(),
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).to_string()
        }
        Err(msg) => panic!("{}", msg),
    }
}

/// Wait for a child process with a timeout. Kill it if it exceeds the timeout.
fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let start = std::time::Instant::now();
    let poll_interval = Duration::from_millis(50);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    use std::io::Read;
                    out.read_to_end(&mut stdout).ok();
                }
                if let Some(mut err) = child.stderr.take() {
                    use std::io::Read;
                    err.read_to_end(&mut stderr).ok();
                }
                return Ok(std::process::Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "Binary timed out after {} seconds",
                        timeout.as_secs()
                    ));
                }
                std::thread::sleep(poll_interval);
            }
            Err(e) => return Err(format!("Error waiting for process: {}", e)),
        }
    }
}

/// Read a test fixture from the tests/e2e/ directory.
fn read_fixture(name: &str) -> String {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixture_path = Path::new(manifest_dir)
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests")
        .join("e2e")
        .join(name);
    std::fs::read_to_string(&fixture_path)
        .unwrap_or_else(|e| panic!("failed to read fixture {}: {}", fixture_path.display(), e))
}

/// Find the meshc binary in the target directory.
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

// ── Service E2E Tests ──────────────────────────────────────────────────

/// Test: Counter service with start, call (GetCount, Increment), and cast (Reset).
/// Exercises: service definition, init, call with reply, cast fire-and-forget.
#[test]
fn e2e_service_counter() {
    let source = read_fixture("service_counter.mpl");
    let output = compile_and_run_with_timeout(&source, 30);
    assert_eq!(output, "10\n15\n0\n");
}

/// Test: Service with multiple call/cast operations.
/// Exercises: multiple handler dispatch on type tags.
#[test]
fn e2e_service_call_cast() {
    let source = read_fixture("service_call_cast.mpl");
    let output = compile_and_run_with_timeout(&source, 30);
    assert_eq!(output, "100\n200\n0\n");
}

/// Test: Accumulator service proving state persistence across calls.
/// Exercises: functional state management (handler receives state, returns new state).
#[test]
fn e2e_service_state_management() {
    let source = read_fixture("service_state_management.mpl");
    let output = compile_and_run_with_timeout(&source, 30);
    assert_eq!(output, "6\n");
}

// ── Service Return Type E2E Tests ─────────────────────────────────────

/// Test: Service returning Bool (not Int) from a struct-state service.
/// Exercises: Bool truncation path (i64 -> i1) in codegen_service_call_helper,
/// and struct state serialization through ActorSpawn for large (>8 byte) state.
#[test]
fn e2e_service_bool_return() {
    let source = read_fixture("service_bool_return.mpl");
    let output = compile_and_run_with_timeout(&source, 30);
    assert_eq!(output, "true\ntrue\nfalse\nenabled:true\ndisabled:false\n");
}

/// Test: Service returning String (pointer type) via inttoptr conversion.
/// Exercises: String/Ptr reply path in codegen_service_call_helper.
#[test]
fn e2e_service_string_return() {
    let source = read_fixture("service_string_return.mpl");
    let output = compile_and_run_with_timeout(&source, 30);
    assert_eq!(output, "hello\nworld\n");
}

// ── Job E2E Tests ──────────────────────────────────────────────────────

/// Test: Job.async spawns work, Job.await collects Result.
/// Exercises: Job.async with closure, Job.await returning Ok(value).
#[test]
fn e2e_job_async_await() {
    let source = read_fixture("job_async_await.mpl");
    let output = compile_and_run_with_timeout(&source, 30);
    assert_eq!(output, "42\n");
}

// ── Receive-with-timeout E2E Tests ──────────────────────────────────

/// Test: receive timeout fires when no message arrives within the deadline.
/// Exercises: receive do msg -> msg after 50 -> 99 end returns 99 on timeout.
#[test]
fn test_receive_after_timeout_fires() {
    let source = r#"
actor worker() do
  let result = receive do
    msg -> msg
  after 50 -> 99 end
  println("${result}")
end

fn main() do
  spawn(worker)
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert_eq!(output.trim(), "99");
}

/// Test: message arrives before timeout, so the arm body runs (not timeout body).
/// Exercises: receive do msg -> msg after 5000 -> 99 end with immediate send returns 42.
#[test]
fn test_receive_after_message_arrives_before_timeout() {
    let source = r#"
actor worker() do
  let result = receive do
    msg -> msg
  after 5000 -> 99 end
  println("${result}")
end

fn main() do
  let pid = spawn(worker)
  send(pid, 42)
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert_eq!(output.trim(), "42");
}

/// Test: timeout body returns String type (verifies type unification end-to-end).
/// Exercises: receive do msg -> msg after 50 -> "timeout" end returns the string.
#[test]
fn test_receive_after_timeout_returns_string() {
    let source = r#"
actor worker() do
  let result = receive do
    msg -> msg
  after 50 -> "timeout" end
  println(result)
end

fn main() do
  spawn(worker)
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert_eq!(output.trim(), "timeout");
}

// ── Timer E2E Tests (Phase 44 Plan 02) ──────────────────────────────

/// Test: Timer.sleep(ms) suspends the actor and resumes after the delay.
/// Verifies sleep returns without hanging and doesn't crash.
#[test]
fn test_timer_sleep_basic() {
    let source = r#"
fn main() do
  Timer.sleep(50)
  println("awake")
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert_eq!(output.trim(), "awake");
}

/// Test: Timer.sleep doesn't block other actors. Spawns two actors: one sleeps
/// 50ms then prints "slow", the other prints "fast" immediately. Both should complete.
#[test]
fn test_timer_sleep_does_not_block_other_actors() {
    let source = r#"
actor slow() do
  Timer.sleep(50)
  println("slow")
end

actor fast() do
  println("fast")
end

fn main() do
  spawn(slow)
  spawn(fast)
  Timer.sleep(150)
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert!(output.contains("fast"), "Expected 'fast' in output: {}", output);
    assert!(output.contains("slow"), "Expected 'slow' in output: {}", output);
}

/// Test: Timer.send_after delivers a delayed message to the target actor.
/// The worker receives the message (99) before the 5000ms timeout.
#[test]
fn test_timer_send_after_delivers_message() {
    let source = r#"
actor worker() do
  let result = receive do
    msg -> msg
  after 5000 -> 0 end
  println("${result}")
end

fn main() do
  let pid = spawn(worker)
  Timer.send_after(pid, 50, 99)
  Timer.sleep(200)
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert_eq!(output.trim(), "99");
}

/// Test: Timer.send_after respects delay timing. The message is scheduled for 200ms
/// but the receive has a 5000ms timeout. The message should arrive and be received
/// rather than the timeout firing. This proves the delay is finite (not infinite).
#[test]
fn test_timer_send_after_arrives_after_delay() {
    let source = r#"
actor worker() do
  let result = receive do
    msg -> msg
  after 5000 -> 0 end
  println("${result}")
end

fn main() do
  let pid = spawn(worker)
  Timer.send_after(pid, 100, 77)
  Timer.sleep(500)
end
"#;
    let output = compile_and_run_with_timeout(source, 30);
    assert_eq!(output.trim(), "77");
}
