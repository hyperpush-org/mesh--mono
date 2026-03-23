use std::io::{Read as _, Write as _};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};

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
    repo_root().join("reference-backend").join("reference-backend")
}

fn run_reference_backend_migrations(database_url: &str) {
    let root = repo_root();
    let meshc = find_meshc();
    let output = Command::new(&meshc)
        .current_dir(&root)
        .env("DATABASE_URL", database_url)
        .args(["migrate", "reference-backend", "up"])
        .output()
        .expect("failed to invoke meshc migrate up reference-backend");

    assert!(
        output.status.success(),
        "meshc migrate up reference-backend failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn spawn_reference_backend(database_url: &str) -> Child {
    let binary = reference_backend_binary();
    Command::new(&binary)
        .current_dir(repo_root())
        .env("DATABASE_URL", database_url)
        .env("PORT", "18080")
        .env("JOB_POLL_MS", "1000")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|e| panic!("failed to spawn {}: {}", binary.display(), e))
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

fn stop_reference_backend(mut child: Child) -> (String, String, String) {
    let _ = child.kill();
    let output = child
        .wait_with_output()
        .expect("failed to collect reference-backend output");
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
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

fn response_body(response: &str) -> &str {
    response.split("\r\n\r\n").nth(1).unwrap_or("")
}

fn compact_json(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

fn extract_json_string_field(body: &str, field: &str) -> String {
    let needle = format!("\"{}\":\"", field);
    let start = body
        .find(&needle)
        .unwrap_or_else(|| panic!("field '{}' not found in response body: {}", field, body))
        + needle.len();
    let tail = &body[start..];
    let end = tail
        .find('"')
        .unwrap_or_else(|| panic!("field '{}' missing closing quote in body: {}", field, body));
    tail[..end].to_string()
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
        response.contains(r#"{"status":"ok"}"#),
        "expected JSON health payload, got: {}\nstdout: {}\nstderr: {}",
        response,
        stdout,
        stderr
    );
    assert_startup_logs(&combined, database_url);
}

fn assert_reference_backend_jobs_round_trip(database_url: &str) {
    run_reference_backend_migrations(database_url);
    assert_reference_backend_build_succeeds();

    let child = spawn_reference_backend(database_url);
    let health_response = wait_for_reference_backend();
    assert!(
        health_response.contains("200"),
        "expected HTTP 200 from /health before jobs round trip, got: {}",
        health_response
    );

    let create_payload = r#"{"kind":"demo","attempt":1}"#;
    let create_response = send_http_request("POST", "/jobs", Some(create_payload))
        .expect("failed to create job via POST /jobs");
    let create_body = response_body(&create_response);
    let create_compact = compact_json(create_body);
    assert!(
        create_response.contains("201"),
        "expected HTTP 201 from POST /jobs, got: {}",
        create_response
    );
    assert!(
        create_compact.contains(r#""status":"pending""#),
        "expected pending status in create response, got: {}",
        create_body
    );
    assert!(
        create_compact.contains(r#""attempts":0"#),
        "expected attempts=0 in create response, got: {}",
        create_body
    );
    assert!(
        create_compact.contains(r#""last_error":null"#),
        "expected last_error=null in create response, got: {}",
        create_body
    );
    assert!(
        create_compact.contains(r#""processed_at":null"#),
        "expected processed_at=null in create response, got: {}",
        create_body
    );
    assert!(
        create_compact.contains(r#""payload":{"#),
        "expected nested payload object in create response, got: {}",
        create_body
    );
    assert!(
        create_compact.contains(r#""kind":"demo""#),
        "expected payload.kind in create response, got: {}",
        create_body
    );
    assert!(
        create_compact.contains(r#""attempt":1"#),
        "expected payload.attempt in create response, got: {}",
        create_body
    );

    let job_id = extract_json_string_field(create_body, "id");
    let get_path = format!("/jobs/{}", job_id);
    let get_response = send_http_request("GET", &get_path, None)
        .expect("failed to fetch job via GET /jobs/:id");
    let get_body = response_body(&get_response);
    let get_compact = compact_json(get_body);

    assert!(
        get_response.contains("200"),
        "expected HTTP 200 from GET /jobs/:id, got: {}",
        get_response
    );
    assert!(
        get_compact.contains(&format!(r#""id":"{}""#, job_id)),
        "expected stable job id in GET response, got: {}",
        get_body
    );
    assert!(
        get_compact.contains(r#""status":"pending""#),
        "expected pending status in GET response, got: {}",
        get_body
    );
    assert!(
        get_compact.contains(r#""payload":{"#),
        "expected nested payload object in GET response, got: {}",
        get_body
    );
    assert!(
        get_compact.contains(r#""kind":"demo""#),
        "expected payload.kind in GET response, got: {}",
        get_body
    );
    assert!(
        get_compact.contains(r#""attempt":1"#),
        "expected payload.attempt in GET response, got: {}",
        get_body
    );

    let (stdout, stderr, combined) = stop_reference_backend(child);
    assert_startup_logs(&combined, database_url);
    assert!(
        combined.contains(&format!("[reference-backend] Job created id={} status=pending", job_id)),
        "expected job-create log line, got:\n{}",
        combined
    );
    assert!(
        combined.contains(&format!("[reference-backend] Job fetched id={} status=pending attempts=0", job_id)),
        "expected job-fetch log line, got:\n{}",
        combined
    );
    assert!(
        !stdout.is_empty() || stderr.is_empty() || !combined.is_empty(),
        "expected collected process output to remain inspectable"
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
    assert_reference_backend_jobs_round_trip(&database_url);
}
