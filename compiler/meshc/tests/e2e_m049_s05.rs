use std::fs;
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn read_source_file(path: &Path) -> String {
    fs::read_to_string(path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()))
}

fn assert_source_contains(path: &Path, needle: &str) {
    let source = read_source_file(path);
    assert!(
        source.contains(needle),
        "expected {} to contain `{}` but it was missing",
        path.display(),
        needle
    );
}

fn assert_source_omits(path: &Path, needle: &str) {
    let source = read_source_file(path);
    assert!(
        !source.contains(needle),
        "expected {} to omit `{}` but it was still present",
        path.display(),
        needle
    );
}

fn assert_source_contains_all(path: &Path, needles: &[&str]) {
    for needle in needles {
        assert_source_contains(path, needle);
    }
}

fn assert_source_omits_all(path: &Path, needles: &[&str]) {
    for needle in needles {
        assert_source_omits(path, needle);
    }
}

fn assert_source_order(path: &Path, needles: &[&str]) {
    let source = read_source_file(path);
    let mut previous_index = None;
    for needle in needles {
        let index = source.find(needle).unwrap_or_else(|| {
            panic!(
                "expected {} to contain `{}` before checking order",
                path.display(),
                needle
            )
        });
        if let Some(previous_index) = previous_index {
            assert!(
                index > previous_index,
                "expected {} to keep `{}` after the prior ordered marker",
                path.display(),
                needle
            );
        }
        previous_index = Some(index);
    }
}

#[test]
fn m049_s05_wrapper_replays_the_named_scaffold_and_example_stack() {
    let verifier_path = repo_root().join("scripts").join("verify-m049-s05.sh");

    assert_source_contains_all(
        &verifier_path,
        &[
            "bash scripts/verify-m050-s01.sh",
            "m050-s01-preflight",
            "node --test scripts/tests/verify-m049-s04-onboarding-contract.test.mjs",
            "cargo test -p mesh-pkg m049_s0 -- --nocapture",
            "cargo test -p meshc --test tooling_e2e test_init_todo_template_ -- --nocapture",
            "cargo build -q -p meshc",
            "node scripts/tests/verify-m049-s03-materialize-examples.mjs --check",
            "cargo test -p meshc --test e2e_m049_s01 -- --nocapture",
            "cargo test -p meshc --test e2e_m049_s02 -- --nocapture",
            "cargo test -p meshc --test e2e_m049_s03 -- --nocapture",
            "bash scripts/verify-m039-s01.sh",
            "bash scripts/verify-m045-s02.sh",
            "bash scripts/verify-m047-s05.sh",
            "bash scripts/verify-m048-s05.sh",
            "m049-s01-env-preflight",
            "meshc-build-preflight",
            "m049-s03-materialize-direct",
            "m049-s05-bundle-shape",
            "retained-m039-s01-verify",
            "retained-m045-s02-verify",
            "retained-m047-s05-verify",
            "retained-m048-s05-verify",
            "retained-m049-s01-artifacts",
            "retained-m049-s02-artifacts",
            "retained-m049-s03-artifacts",
            ".tmp/m049-s01/local-postgres/connection.env",
            "latest-proof-bundle.txt",
            "status.txt",
            "current-phase.txt",
            "phase-report.txt",
            "full-contract.log",
            "todos-unmigrated.http",
            "todos-unmigrated.json",
        ],
    );
}

#[test]
fn m049_s05_wrapper_runs_the_m050_docs_preflight_before_heavier_replays() {
    let verifier_path = repo_root().join("scripts").join("verify-m049-s05.sh");

    assert_source_order(
        &verifier_path,
        &[
            "bash scripts/verify-m050-s01.sh",
            "node --test scripts/tests/verify-m049-s04-onboarding-contract.test.mjs",
            "cargo test -p mesh-pkg m049_s0 -- --nocapture",
            "cargo test -p meshc --test tooling_e2e test_init_todo_template_ -- --nocapture",
            "cargo build -q -p meshc",
            "node scripts/tests/verify-m049-s03-materialize-examples.mjs --check",
            "cargo test -p meshc --test e2e_m049_s01 -- --nocapture",
            "cargo test -p meshc --test e2e_m049_s02 -- --nocapture",
            "cargo test -p meshc --test e2e_m049_s03 -- --nocapture",
            "bash scripts/verify-m039-s01.sh",
            "bash scripts/verify-m045-s02.sh",
            "bash scripts/verify-m047-s05.sh",
            "bash scripts/verify-m048-s05.sh",
        ],
    );
}

#[test]
fn m049_s05_wrapper_avoids_inline_secret_echoes_and_old_proof_app_replays() {
    let verifier_path = repo_root().join("scripts").join("verify-m049-s05.sh");

    assert_source_omits_all(
        &verifier_path,
        &[
            "bash scripts/verify-m049-s04.sh",
            "npm --prefix website run build",
            "cargo run -q -p meshc -- build cluster-proof",
            "cargo run -q -p meshc -- test cluster-proof/tests",
            "cargo run -q -p meshc -- build tiny-cluster",
            "cargo run -q -p meshc -- test tiny-cluster/tests",
            "source \"$ROOT_DIR/.env\"",
            "cat .env",
            "echo \"$DATABASE_URL\"",
            "printf \"%s\\n\" \"$DATABASE_URL\"",
            "todos-unmigrated.response.json",
        ],
    );
}
