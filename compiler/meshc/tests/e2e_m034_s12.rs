use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("meshc crate should live under compiler/")
        .parent()
        .expect("workspace root should be above compiler/")
        .to_path_buf()
}

fn meshc_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_meshc"))
}

fn fixture_dir() -> PathBuf {
    repo_root().join("scripts/fixtures/m034-s03-installer-smoke")
}

fn copy_smoke_fixture(dest: &Path) {
    std::fs::create_dir_all(dest).expect("failed to create smoke project dir");
    std::fs::copy(fixture_dir().join("mesh.toml"), dest.join("mesh.toml"))
        .expect("failed to copy mesh.toml");
    std::fs::copy(fixture_dir().join("main.mpl"), dest.join("main.mpl"))
        .expect("failed to copy main.mpl");
}

fn read_trace(path: &Path) -> Value {
    let raw = std::fs::read_to_string(path)
        .unwrap_or_else(|error| panic!("failed to read trace {}: {}", path.display(), error));
    serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("failed to parse trace {}: {}\n{}", path.display(), error, raw))
}

#[test]
fn m034_s12_native_build_trace_records_object_and_link_context() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let project_dir = temp_dir.path().join("installer-smoke");
    let output_path = temp_dir.path().join("installer-smoke-bin");
    let trace_path = temp_dir.path().join("build-trace.json");
    copy_smoke_fixture(&project_dir);

    let output = Command::new(meshc_bin())
        .env("MESH_BUILD_TRACE_PATH", &trace_path)
        .env_remove("CARGO_TARGET_DIR")
        .env_remove("MESH_RT_LIB_PATH")
        .args([
            "build",
            project_dir.to_str().unwrap(),
            "--output",
            output_path.to_str().unwrap(),
            "--no-color",
        ])
        .output()
        .expect("failed to invoke meshc build");

    assert!(
        output.status.success(),
        "meshc build should succeed with trace enabled:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(trace_path.exists(), "trace file was not written");

    let trace = read_trace(&trace_path);
    assert_eq!(trace["lastStage"], "compile-succeeded");
    assert_eq!(trace["success"], true);
    assert_eq!(trace["objectEmissionStarted"], true);
    assert_eq!(trace["objectEmissionCompleted"], true);
    assert_eq!(trace["objectExistsAfterEmit"], true);
    assert_eq!(trace["linkStarted"], true);
    assert_eq!(trace["linkCompleted"], true);
    assert_eq!(trace["buildOutputPath"], output_path.display().to_string());
    assert_eq!(trace["objectPath"], output_path.with_extension("o").display().to_string());
    assert!(
        trace["runtimeLibraryPath"].as_str().is_some_and(|value| !value.is_empty()),
        "trace should record the resolved runtime path: {trace:#}"
    );
    assert!(
        trace["linkerProgram"].as_str().is_some_and(|value| !value.is_empty()),
        "trace should record the linker program: {trace:#}"
    );
}

#[test]
fn m034_s12_missing_runtime_lookup_is_reported_before_object_emission() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let project_dir = temp_dir.path().join("installer-smoke");
    let empty_target_dir = temp_dir.path().join("empty-target");
    let output_path = temp_dir.path().join("installer-smoke-bin");
    let trace_path = temp_dir.path().join("build-trace-missing-runtime.json");
    copy_smoke_fixture(&project_dir);
    std::fs::create_dir_all(&empty_target_dir).expect("failed to create empty target dir");

    let output = Command::new(meshc_bin())
        .env("MESH_BUILD_TRACE_PATH", &trace_path)
        .env("CARGO_TARGET_DIR", &empty_target_dir)
        .env_remove("MESH_RT_LIB_PATH")
        .args([
            "build",
            project_dir.to_str().unwrap(),
            "--output",
            output_path.to_str().unwrap(),
            "--no-color",
        ])
        .output()
        .expect("failed to invoke meshc build");

    assert!(
        !output.status.success(),
        "meshc build should fail when runtime discovery is forced to an empty target dir"
    );
    assert!(trace_path.exists(), "trace file was not written on failure");

    let trace = read_trace(&trace_path);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert_eq!(trace["lastStage"], "resolve-runtime-library");
    assert_eq!(trace["objectEmissionStarted"], Value::Null);
    assert_eq!(trace["objectEmissionCompleted"], Value::Null);
    assert_eq!(trace["objectExistsAfterEmit"], Value::Null);
    assert_eq!(trace["linkStarted"], Value::Null);
    assert_eq!(trace["linkCompleted"], Value::Null);
    assert_eq!(trace["runtimeLibraryExists"], false);
    assert_eq!(trace["cargoTargetDir"], empty_target_dir.display().to_string());
    assert!(
        trace["error"]
            .as_str()
            .is_some_and(|value| value.contains("Could not locate Mesh runtime static library")),
        "trace should preserve the runtime lookup failure: {trace:#}"
    );
    assert!(
        stderr.contains("Could not locate Mesh runtime static library"),
        "stderr should preserve the runtime lookup failure:\n{stderr}"
    );
}

#[test]
fn m034_s12_bad_windows_llvm_prefix_is_reported_before_object_emission() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let project_dir = temp_dir.path().join("installer-smoke");
    let output_path = temp_dir.path().join("installer-smoke.exe");
    let trace_path = temp_dir.path().join("build-trace-bad-windows-llvm.json");
    let runtime_path = temp_dir.path().join("mesh_rt.lib");
    let bad_llvm_prefix = temp_dir.path().join("missing-llvm");
    copy_smoke_fixture(&project_dir);
    std::fs::write(&runtime_path, b"fake windows runtime").expect("failed to create fake runtime");

    let output = Command::new(meshc_bin())
        .env("MESH_BUILD_TRACE_PATH", &trace_path)
        .env("MESH_RT_LIB_PATH", &runtime_path)
        .env("LLVM_SYS_211_PREFIX", &bad_llvm_prefix)
        .args([
            "build",
            project_dir.to_str().unwrap(),
            "--output",
            output_path.to_str().unwrap(),
            "--target",
            "x86_64-pc-windows-msvc",
            "--no-color",
        ])
        .output()
        .expect("failed to invoke meshc build");

    assert!(
        !output.status.success(),
        "meshc build should fail when LLVM_SYS_211_PREFIX does not contain clang.exe"
    );
    assert!(trace_path.exists(), "trace file was not written on failure");

    let trace = read_trace(&trace_path);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let expected_clang = bad_llvm_prefix.join("bin").join("clang.exe");

    assert_eq!(trace["lastStage"], "resolve-runtime-library");
    assert_eq!(trace["meshRtLibPath"], runtime_path.display().to_string());
    assert_eq!(trace["runtimeLibraryPath"], runtime_path.display().to_string());
    assert_eq!(trace["runtimeLibraryExists"], true);
    assert_eq!(trace["objectEmissionStarted"], Value::Null);
    assert_eq!(trace["objectEmissionCompleted"], Value::Null);
    assert_eq!(trace["linkStarted"], Value::Null);
    assert_eq!(trace["linkCompleted"], Value::Null);
    assert!(
        trace["error"].as_str().is_some_and(|value| {
            value.contains("LLVM_SYS_211_PREFIX") && value.contains(&expected_clang.display().to_string())
        }),
        "trace should preserve the bad LLVM prefix failure: {trace:#}"
    );
    assert!(
        stderr.contains("LLVM_SYS_211_PREFIX") && stderr.contains(&expected_clang.display().to_string()),
        "stderr should preserve the bad LLVM prefix failure:\n{stderr}"
    );
}
