use std::fs::{self, File};
use std::io::{Read as _, Write as _};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

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

fn build_reference_backend() -> Output {
    let root = repo_root();
    let meshc = find_meshc();
    Command::new(&meshc)
        .current_dir(&root)
        .args(["build", "reference-backend"])
        .output()
        .expect("failed to invoke meshc build for reference-backend")
}

fn assert_reference_backend_build_succeeds() {
    let output = build_reference_backend();
    assert!(
        output.status.success(),
        "meshc build reference-backend failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn reference_backend_binary() -> PathBuf {
    repo_root()
        .join("reference-backend")
        .join("reference-backend")
}

fn run_reference_backend_migration(database_url: &str, command: &str) -> Output {
    let root = repo_root();
    let meshc = find_meshc();
    Command::new(&meshc)
        .current_dir(&root)
        .env("DATABASE_URL", database_url)
        .args(["migrate", "reference-backend", command])
        .output()
        .unwrap_or_else(|e| {
            panic!(
                "failed to invoke meshc migrate reference-backend {}: {}",
                command, e
            )
        })
}

fn assert_reference_backend_migration_succeeds(database_url: &str, command: &str) {
    let output = run_reference_backend_migration(database_url, command);
    assert!(
        output.status.success(),
        "meshc migrate reference-backend {} failed:\nstdout: {}\nstderr: {}",
        command,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

struct SpawnedReferenceBackend {
    child: Child,
    stdout_path: PathBuf,
    stderr_path: PathBuf,
}

fn reference_backend_log_paths() -> (PathBuf, PathBuf) {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_nanos();
    let base = std::env::temp_dir();
    let stdout_path = base.join(format!("reference-backend-{stamp}-stdout.log"));
    let stderr_path = base.join(format!("reference-backend-{stamp}-stderr.log"));
    (stdout_path, stderr_path)
}

fn spawn_reference_backend(database_url: &str) -> SpawnedReferenceBackend {
    let binary = reference_backend_binary();
    let (stdout_path, stderr_path) = reference_backend_log_paths();
    let stdout_file = File::create(&stdout_path)
        .unwrap_or_else(|e| panic!("failed to create {}: {}", stdout_path.display(), e));
    let stderr_file = File::create(&stderr_path)
        .unwrap_or_else(|e| panic!("failed to create {}: {}", stderr_path.display(), e));

    let child = Command::new(&binary)
        .current_dir(repo_root())
        .env("DATABASE_URL", database_url)
        .env("PORT", "18080")
        .env("JOB_POLL_MS", "1000")
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .unwrap_or_else(|e| panic!("failed to spawn {}: {}", binary.display(), e));

    SpawnedReferenceBackend {
        child,
        stdout_path,
        stderr_path,
    }
}

fn send_http_request(method: &str, path: &str, body: Option<&str>) -> std::io::Result<String> {
    let mut stream = TcpStream::connect("127.0.0.1:18080")?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;

    let request = match body {
        Some(body) => format!(
            "{method} {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        ),
        None => format!(
            "{method} {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        ),
    };

    stream.write_all(request.as_bytes())?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    Ok(response)
}

fn wait_for_reference_backend() -> String {
    for attempt in 0..20 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(250));
        }

        match send_http_request("GET", "/health", None) {
            Ok(response) => return response,
            Err(_) => continue,
        }
    }

    panic!("reference-backend never became reachable on :18080");
}

fn stop_reference_backend(mut spawned: SpawnedReferenceBackend) -> (String, String, String) {
    let _ = Command::new("kill")
        .args(["-TERM", &spawned.child.id().to_string()])
        .status();
    std::thread::sleep(std::time::Duration::from_millis(250));
    if spawned
        .child
        .try_wait()
        .expect("failed to probe reference-backend exit status")
        .is_none()
    {
        let _ = spawned.child.kill();
    }
    spawned
        .child
        .wait()
        .expect("failed to collect reference-backend exit status");

    let stdout = fs::read_to_string(&spawned.stdout_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {}", spawned.stdout_path.display(), e));
    let stderr = fs::read_to_string(&spawned.stderr_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {}", spawned.stderr_path.display(), e));
    let _ = fs::remove_file(&spawned.stdout_path);
    let _ = fs::remove_file(&spawned.stderr_path);
    let combined = format!("{stdout}{stderr}");
    (stdout, stderr, combined)
}

fn assert_startup_logs(combined: &str, database_url: &str) {
    assert!(
        combined.contains("[reference-backend] Config loaded port=18080 job_poll_ms=1000"),
        "expected config-loaded log line, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[reference-backend] PostgreSQL pool ready"),
        "expected pool-ready log line, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[reference-backend] Runtime registry ready"),
        "expected registry-ready log line, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[reference-backend] HTTP server starting on :18080"),
        "expected HTTP-bind log line, got:\n{}",
        combined
    );
    assert!(
        !combined.contains(database_url),
        "startup logs must not echo DATABASE_URL\nlogs:\n{}",
        combined
    );
}

fn assert_reference_backend_runtime_starts(database_url: &str) {
    assert_reference_backend_build_succeeds();

    let child = spawn_reference_backend(database_url);
    let response = wait_for_reference_backend();
    let (stdout, stderr, combined) = stop_reference_backend(child);

    assert!(
        response.contains("200"),
        "expected HTTP 200 from /health, got: {}\nstdout: {}\nstderr: {}",
        response,
        stdout,
        stderr
    );
    assert!(
        response.contains(r#""status":"ok""#),
        "expected JSON health payload, got: {}\nstdout: {}\nstderr: {}",
        response,
        stdout,
        stderr
    );
    assert_startup_logs(&combined, database_url);
}

fn run_reference_backend_smoke_script(database_url: &str) -> Output {
    let root = repo_root();
    Command::new("bash")
        .current_dir(&root)
        .arg("reference-backend/scripts/smoke.sh")
        .env("DATABASE_URL", database_url)
        .env("PORT", "18080")
        .env("JOB_POLL_MS", "500")
        .output()
        .expect("failed to invoke reference-backend/scripts/smoke.sh")
}

fn assert_reference_backend_postgres_smoke(database_url: &str) {
    assert_reference_backend_migration_succeeds(database_url, "status");
    assert_reference_backend_migration_succeeds(database_url, "up");

    let output = run_reference_backend_smoke_script(database_url);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{stdout}{stderr}");

    assert!(
        output.status.success(),
        "reference-backend smoke script failed:\nstdout: {}\nstderr: {}",
        stdout,
        stderr
    );
    assert!(
        combined.contains("[smoke] building reference-backend"),
        "expected smoke build step, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[smoke] starting reference-backend on :18080"),
        "expected smoke start step, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[smoke] health ready:"),
        "expected smoke health step, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[smoke] created job:"),
        "expected smoke create step, got:\n{}",
        combined
    );
    assert!(
        combined.contains("[smoke] processed job after attempts="),
        "expected smoke processed step, got:\n{}",
        combined
    );
    assert!(
        combined.contains(r#""status":"processed""#),
        "expected processed job payload in smoke output, got:\n{}",
        combined
    );
    assert!(
        !combined.contains(database_url),
        "smoke output must not echo DATABASE_URL\nlogs:\n{}",
        combined
    );
}

#[test]
fn e2e_reference_backend_builds() {
    assert_reference_backend_build_succeeds();

    let binary = reference_backend_binary();
    assert!(
        binary.exists(),
        "compiled reference-backend binary not found at {}",
        binary.display()
    );
}

#[test]
#[ignore]
fn e2e_reference_backend_runtime_starts() {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set for e2e_reference_backend_runtime_starts");
    assert_reference_backend_runtime_starts(&database_url);
}

#[test]
#[ignore]
fn e2e_reference_backend_postgres_smoke() {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set for e2e_reference_backend_postgres_smoke");
    assert_reference_backend_postgres_smoke(&database_url);
}
