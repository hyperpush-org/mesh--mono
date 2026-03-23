//! End-to-end JSON-RPC tests for `meshc lsp` against backend-shaped files.
//!
//! Proves that a real LSP process behaves correctly on the reference backend:
//! - initialize/initialized over stdio JSON-RPC
//! - diagnostics publication for valid and invalid backend buffers
//! - hover and definition on backend-shaped code
//! - document formatting through the shared formatter path
//! - signature help as an editor assist surface

use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const MESSAGE_TIMEOUT: Duration = Duration::from_secs(8);

fn repo_root() -> PathBuf {
    fs::canonicalize(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("meshc crate should live under compiler/")
            .parent()
            .expect("workspace root should be above compiler/"),
    )
    .expect("workspace root should canonicalize")
}

fn meshc_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_meshc"))
}

fn file_uri(path: &Path) -> String {
    format!("file://{}", path.to_string_lossy())
}

fn read_json_rpc_message(reader: &mut impl BufRead) -> Option<Value> {
    let mut content_length = None;

    loop {
        let mut line = String::new();
        let bytes = reader.read_line(&mut line).ok()?;
        if bytes == 0 {
            return None;
        }
        if line == "\r\n" {
            break;
        }
        if let Some(value) = line.strip_prefix("Content-Length:") {
            content_length = value.trim().parse::<usize>().ok();
        }
    }

    let len = content_length?;
    let mut body = vec![0; len];
    reader.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

struct LspSession {
    child: Child,
    stdin: ChildStdin,
    rx: mpsc::Receiver<Value>,
    pending: VecDeque<Value>,
    stderr: Arc<Mutex<String>>,
    next_id: u64,
}

impl LspSession {
    fn new(cwd: &Path) -> Self {
        let mut child = Command::new(meshc_bin())
            .current_dir(cwd)
            .arg("lsp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("failed to spawn meshc lsp");

        let stdin = child.stdin.take().expect("meshc lsp stdin should be piped");
        let stdout = child
            .stdout
            .take()
            .expect("meshc lsp stdout should be piped");
        let stderr_reader = child
            .stderr
            .take()
            .expect("meshc lsp stderr should be piped");

        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            while let Some(message) = read_json_rpc_message(&mut reader) {
                if tx.send(message).is_err() {
                    break;
                }
            }
        });

        let stderr = Arc::new(Mutex::new(String::new()));
        let stderr_capture = Arc::clone(&stderr);
        thread::spawn(move || {
            let mut reader = BufReader::new(stderr_reader);
            let mut output = String::new();
            let _ = reader.read_to_string(&mut output);
            *stderr_capture.lock().unwrap() = output;
        });

        Self {
            child,
            stdin,
            rx,
            pending: VecDeque::new(),
            stderr,
            next_id: 1,
        }
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }));

        self.recv_response(id, method)
    }

    fn request_without_params(&mut self, method: &str) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
        }));

        self.recv_response(id, method)
    }

    fn recv_response(&mut self, id: u64, method: &str) -> Value {
        let response = self.recv_matching(
            &format!("response for {}", method),
            |message| message.get("id").and_then(Value::as_u64) == Some(id),
        );

        if let Some(error) = response.get("error") {
            panic!(
                "{} returned JSON-RPC error: {}\nstderr:\n{}",
                method,
                error,
                self.stderr_output()
            );
        }

        response
    }

    fn notify(&mut self, method: &str, params: Value) {
        self.send(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }));
    }

    fn send(&mut self, message: &Value) {
        let body = serde_json::to_vec(message).expect("JSON-RPC payload should serialize");
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        self.stdin
            .write_all(header.as_bytes())
            .expect("failed to write JSON-RPC header");
        self.stdin
            .write_all(&body)
            .expect("failed to write JSON-RPC body");
        self.stdin.flush().expect("failed to flush JSON-RPC body");
    }

    fn recv_matching<F>(&mut self, label: &str, mut predicate: F) -> Value
    where
        F: FnMut(&Value) -> bool,
    {
        if let Some(index) = self.pending.iter().position(|message| predicate(message)) {
            return self.pending.remove(index).expect("pending index should exist");
        }

        let deadline = Instant::now() + MESSAGE_TIMEOUT;
        loop {
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .unwrap_or_else(|| Duration::from_millis(0));
            if remaining.is_zero() {
                panic!(
                    "timed out waiting for {}\npending messages: {:?}\nstderr:\n{}",
                    label,
                    self.pending,
                    self.stderr_output()
                );
            }

            match self.rx.recv_timeout(remaining) {
                Ok(message) => {
                    if predicate(&message) {
                        return message;
                    }
                    self.pending.push_back(message);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    panic!(
                        "timed out waiting for {}\npending messages: {:?}\nstderr:\n{}",
                        label,
                        self.pending,
                        self.stderr_output()
                    );
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    panic!(
                        "meshc lsp stdout disconnected while waiting for {}\nstderr:\n{}",
                        label,
                        self.stderr_output()
                    );
                }
            }
        }
    }

    fn wait_for_diagnostics(&mut self, uri: &str, phase: &str) -> Vec<Value> {
        let message = self.recv_matching(
            &format!("publishDiagnostics for {} during {}", uri, phase),
            |value| {
                value.get("method").and_then(Value::as_str) == Some("textDocument/publishDiagnostics")
                    && value
                        .get("params")
                        .and_then(|params| params.get("uri"))
                        .and_then(Value::as_str)
                        == Some(uri)
            },
        );

        message
            .get("params")
            .and_then(|params| params.get("diagnostics"))
            .and_then(Value::as_array)
            .cloned()
            .expect("publishDiagnostics notification should contain diagnostics array")
    }

    fn stderr_output(&self) -> String {
        self.stderr.lock().unwrap().clone()
    }
}

impl Drop for LspSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn lsp_json_rpc_reference_backend_flow() {
    let root = repo_root();
    let reference_backend = root.join("reference-backend");
    let health_path = fs::canonicalize(reference_backend.join("api/health.mpl"))
        .expect("reference backend health file should exist");
    let jobs_path = fs::canonicalize(reference_backend.join("api/jobs.mpl"))
        .expect("reference backend jobs file should exist");
    let health_uri = file_uri(&health_path);
    let jobs_uri = file_uri(&jobs_path);
    let health_source = fs::read_to_string(&health_path).expect("health source should be readable");
    let jobs_source = fs::read_to_string(&jobs_path).expect("jobs source should be readable");

    let mut session = LspSession::new(&root);

    let initialize = session.request(
        "initialize",
        json!({
            "processId": Value::Null,
            "rootUri": file_uri(&root),
            "capabilities": {},
        }),
    );
    assert_eq!(
        initialize["result"]["capabilities"]["documentFormattingProvider"].as_bool(),
        Some(true),
        "initialize should advertise document formatting support: {initialize:?}"
    );
    assert_eq!(
        initialize["result"]["capabilities"]["hoverProvider"].as_bool(),
        Some(true),
        "initialize should advertise hover support: {initialize:?}"
    );

    session.notify("initialized", json!({}));

    session.notify(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": health_uri,
                "languageId": "mesh",
                "version": 1,
                "text": health_source,
            }
        }),
    );
    let health_open_diagnostics = session.wait_for_diagnostics(&health_uri, "health didOpen");
    assert!(
        health_open_diagnostics.is_empty(),
        "reference-backend/api/health.mpl should open cleanly, got diagnostics: {:?}",
        health_open_diagnostics
    );

    session.notify(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": jobs_uri,
                "languageId": "mesh",
                "version": 1,
                "text": jobs_source,
            }
        }),
    );
    let jobs_open_diagnostics = session.wait_for_diagnostics(&jobs_uri, "jobs didOpen");
    assert!(
        jobs_open_diagnostics.is_empty(),
        "reference-backend/api/jobs.mpl should open cleanly, got diagnostics: {:?}",
        jobs_open_diagnostics
    );

    let hover = session.request(
        "textDocument/hover",
        json!({
            "textDocument": { "uri": jobs_uri },
            "position": { "line": 64, "character": 17 },
        }),
    );
    let hover_contents = hover["result"]["contents"]["value"]
        .as_str()
        .unwrap_or_default();
    assert!(
        hover_contents.contains("create_job_response") || hover_contents.contains("Job") || hover_contents.contains("String"),
        "hover should return function type information for backend code, got: {hover:?}"
    );

    let definition = session.request(
        "textDocument/definition",
        json!({
            "textDocument": { "uri": jobs_uri },
            "position": { "line": 64, "character": 17 },
        }),
    );
    assert_eq!(
        definition["result"]["uri"].as_str(),
        Some(jobs_uri.as_str()),
        "definition should stay within reference-backend/api/jobs.mpl for create_job_response call: {definition:?}"
    );
    assert_eq!(
        definition["result"]["range"]["start"]["line"].as_u64(),
        Some(35),
        "definition should jump to create_job_response definition, got: {definition:?}"
    );

    let signature_help = session.request(
        "textDocument/signatureHelp",
        json!({
            "textDocument": { "uri": jobs_uri },
            "position": { "line": 36, "character": 39 },
        }),
    );
    let signature_label = signature_help["result"]["signatures"][0]["label"]
        .as_str()
        .unwrap_or_default();
    assert!(
        signature_label.contains("log_create_success(job: Job, payload: String) -> ()"),
        "signature help should name the backend helper being called, got: {signature_help:?}"
    );
    assert_eq!(
        signature_help["result"]["activeParameter"].as_u64(),
        Some(1),
        "signature help should identify the second parameter inside log_create_success(...), got: {signature_help:?}"
    );

    let unformatted_health = health_source.replacen(
        "  let wrapped = if String.length(value) > 0 do\n",
        "let wrapped = if String.length(value) > 0 do\n",
        1,
    );
    assert_ne!(
        unformatted_health, health_source,
        "the health formatter probe must actually make the backend file non-canonical"
    );

    session.notify(
        "textDocument/didChange",
        json!({
            "textDocument": { "uri": health_uri, "version": 2 },
            "contentChanges": [{ "text": unformatted_health }],
        }),
    );
    let health_change_diagnostics = session.wait_for_diagnostics(&health_uri, "health unformatted didChange");
    assert!(
        health_change_diagnostics.is_empty(),
        "unformatted backend text should still type-check cleanly before formatting, got diagnostics: {:?}",
        health_change_diagnostics
    );

    let formatting = session.request(
        "textDocument/formatting",
        json!({
            "textDocument": { "uri": health_uri },
            "options": { "tabSize": 2, "insertSpaces": true },
        }),
    );
    let edits = formatting["result"]
        .as_array()
        .expect("formatting should return a text edit array for unformatted backend text");
    assert_eq!(
        edits.len(),
        1,
        "formatting should perform a single full-document replacement edit, got: {formatting:?}"
    );
    assert_eq!(
        edits[0]["newText"].as_str(),
        Some(health_source.as_str()),
        "formatting should restore canonical reference-backend/api/health.mpl text"
    );

    let invalid_health = format!(
        "{}\nlet broken :: Int = \"oops\"\n",
        health_source.trim_end()
    );
    session.notify(
        "textDocument/didChange",
        json!({
            "textDocument": { "uri": health_uri, "version": 3 },
            "contentChanges": [{ "text": invalid_health }],
        }),
    );
    let invalid_diagnostics = session.wait_for_diagnostics(&health_uri, "health invalid didChange");
    assert!(
        !invalid_diagnostics.is_empty(),
        "invalid backend-shaped text should publish diagnostics instead of staying green"
    );
    assert!(
        invalid_diagnostics.iter().any(|diag| {
            diag["message"]
                .as_str()
                .map(|message| message.contains("type mismatch") || message.contains("Parse error"))
                .unwrap_or(false)
        }),
        "invalid backend diagnostics should describe the backend buffer error instead of falling back to bogus import failures, got: {:?}",
        invalid_diagnostics
    );

    let shutdown = session.request_without_params("shutdown");
    assert!(
        shutdown.get("result").is_some(),
        "shutdown should return a JSON-RPC result, got: {shutdown:?}"
    );
}
