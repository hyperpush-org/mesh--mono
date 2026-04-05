//! Object file linking via a target-aware system linker driver.
//!
//! Links compiled object files with the Mesh runtime static library to produce
//! native executables. Unix targets keep using the system C compiler driver,
//! while Windows MSVC targets use `clang`/`clang.exe` so the installed
//! compiler does not assume Unix tool names or library naming.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::build_trace;

/// Link an object file with the Mesh runtime to produce a native executable.
///
/// # Arguments
///
/// * `object_path` - Path to the compiled object file
/// * `output_path` - Path for the output executable
/// * `target_triple` - Optional target triple for linker/runtime selection
/// * `rt_lib_path` - Optional path to the Mesh runtime static library; if None,
///   attempts to locate it in the workspace target directory
///
/// # Errors
///
/// Returns an error string if the linker cannot be found or linking fails.
pub fn link(
    object_path: &Path,
    output_path: &Path,
    target_triple: Option<&str>,
    rt_lib_path: Option<&Path>,
) -> Result<(), String> {
    let plan = prepare_link(target_triple, rt_lib_path)?;
    link_with_plan(object_path, output_path, &plan)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LinkPlan {
    target: LinkTarget,
    rt_path: PathBuf,
    linker_program: PathBuf,
}

pub(crate) fn prepare_link(
    target_triple: Option<&str>,
    rt_lib_path: Option<&Path>,
) -> Result<LinkPlan, String> {
    let target = LinkTarget::detect(target_triple)?;
    build_trace::set_stage("resolve-runtime-library");

    let rt_path = match rt_lib_path {
        Some(path) => match validate_runtime_override(path, &target) {
            Ok(()) => path.to_path_buf(),
            Err(error) => {
                build_trace::set_link_context(
                    &target.display_triple(),
                    Some(path),
                    Some(path.exists()),
                    None,
                );
                build_trace::record_error(&error);
                return Err(error);
            }
        },
        None => match find_mesh_rt(&target) {
            Ok(path) => path,
            Err(error) => {
                build_trace::set_link_context(&target.display_triple(), None, Some(false), None);
                build_trace::record_error(&error);
                return Err(error);
            }
        },
    };

    let runtime_exists = rt_path.exists();
    let linker_program = match target.linker_program() {
        Ok(path) => path,
        Err(error) => {
            build_trace::set_link_context(
                &target.display_triple(),
                Some(&rt_path),
                Some(runtime_exists),
                None,
            );
            build_trace::record_error(&error);
            return Err(error);
        }
    };
    build_trace::set_link_context(
        &target.display_triple(),
        Some(&rt_path),
        Some(runtime_exists),
        Some(&linker_program),
    );

    if !runtime_exists {
        let error = format!(
            "Mesh runtime static library not found at '{}'. Expected {} for target '{}'. Run `cargo build -p mesh-rt{}` first.",
            rt_path.display(),
            target.runtime_filename(),
            target.display_triple(),
            target.cargo_build_hint(),
        );
        build_trace::record_error(&error);
        return Err(error);
    }

    Ok(LinkPlan {
        target,
        rt_path,
        linker_program,
    })
}

pub(crate) fn link_with_plan(
    object_path: &Path,
    output_path: &Path,
    plan: &LinkPlan,
) -> Result<(), String> {
    let mut cmd = Command::new(&plan.linker_program);
    cmd.arg(object_path);

    match plan.target.kind {
        LinkTargetKind::Unix => {
            cmd.arg(&plan.rt_path).arg("-lm").arg("-o").arg(output_path);
        }
        LinkTargetKind::WindowsMsvc => {
            cmd.arg(&plan.rt_path).arg("-o").arg(output_path);
            // mesh_rt.lib is a Rust staticlib whose transitive deps (ureq/TLS,
            // sqlite, crossbeam, rand, Rust std) need these Windows system libraries.
            // Use -Wl, to forward them directly to MSVC's link.exe.
            for lib in &[
                "ws2_32.lib",
                "userenv.lib",
                "advapi32.lib",
                "bcrypt.lib",
                "ntdll.lib",
                "kernel32.lib",
                "msvcrt.lib",
                "synchronization.lib",
            ] {
                cmd.arg(format!("-Wl,{lib}"));
            }
            // Verbose mode so link failures show the full link.exe invocation.
            cmd.arg("-v");
        }
    }

    if plan.target.needs_security_framework() {
        cmd.arg("-framework").arg("Security");
    }

    build_trace::mark_link_started();
    let output = match cmd.output() {
        Ok(output) => output,
        Err(error) => {
            let error = format!(
                "Failed to invoke linker '{}': {}.{}",
                plan.linker_program.display(),
                error,
                plan.target.linker_help_suffix(),
            );
            build_trace::record_error(&error);
            return Err(error);
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            format!("stderr:\n{stderr}")
        } else if !stdout.is_empty() {
            format!("stdout:\n{stdout}")
        } else {
            format!(
                "linker exited with status {} without emitting output",
                output.status
            )
        };

        let error = format!(
            "Linking failed for target '{}'.\nlinker: {}\nruntime: {}\n{}",
            plan.target.display_triple(),
            plan.linker_program.display(),
            plan.rt_path.display(),
            detail,
        );
        build_trace::record_error(&error);
        return Err(error);
    }

    build_trace::mark_link_completed();
    std::fs::remove_file(object_path).ok();
    Ok(())
}

/// Locate the Mesh runtime static library.
///
/// Searches in the workspace target directory under both `debug` and `release`
/// profiles. Prefers the profile matching the compiler's own build: a release
/// `meshc` links the release runtime, a debug `meshc` links the debug runtime.
fn find_mesh_rt(target: &LinkTarget) -> Result<PathBuf, String> {
    // ENV override (highest priority)
    if let Ok(path) = std::env::var("MESH_RT_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    let profiles: &[&str] = if cfg!(debug_assertions) {
        &["debug", "release"]
    } else {
        &["release", "debug"]
    };

    let mut searched_paths = Vec::new();

    for target_dir in [find_workspace_target_dir()].iter().flatten() {
        for candidate in mesh_rt_candidates(target_dir, target, profiles) {
            if candidate.exists() {
                return Ok(candidate);
            }
            searched_paths.push(candidate);
        }
    }

    // NEW: fallback directories
    let mut extra_dirs: Vec<PathBuf> = Vec::new();

    // ~/.mesh/lib
    if let Some(home) = std::env::var_os("HOME") {
        extra_dirs.push(PathBuf::from(home).join(".mesh/lib"));
    }

    // current working directory
    if let Ok(current) = std::env::current_dir() {
        extra_dirs.push(current);
    }

    // directory of meshc binary
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            extra_dirs.push(parent.to_path_buf());
        }
    }

    // search fallback dirs
    for dir in extra_dirs {
        // check profile-based structure
        for profile in profiles {
            let candidate = dir.join(profile).join(target.runtime_filename());

            if candidate.exists() {
                return Ok(candidate);
            }

            searched_paths.push(candidate);
        }

        // check direct file
        let direct = dir.join(target.runtime_filename());
        if direct.exists() {
            return Ok(direct);
        }

        searched_paths.push(direct);
    }

    // error message (unchanged)
    let mut message = format!(
        "Could not locate Mesh runtime static library for target '{}'. Expected {}. Run `cargo build -p mesh-rt{}` first.",
        target.display_triple(),
        target.runtime_filename(),
        target.cargo_build_hint(),
    );

    if !searched_paths.is_empty() {
        message.push_str("\nSearched:\n");
        for path in searched_paths {
            message.push_str("  - ");
            message.push_str(&path.display().to_string());
            message.push('\n');
        }
        message.pop();
    }

    Err(message)
}

fn mesh_rt_candidates(target_dir: &Path, target: &LinkTarget, profiles: &[&str]) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(triple) = target.requested_triple.as_deref() {
        for profile in profiles {
            candidates.push(
                target_dir
                    .join(triple)
                    .join(profile)
                    .join(target.runtime_filename()),
            );
        }
    }

    for profile in profiles {
        candidates.push(target_dir.join(profile).join(target.runtime_filename()));
    }

    candidates
}

fn validate_runtime_override(path: &Path, target: &LinkTarget) -> Result<(), String> {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return Err(format!(
            "Mesh runtime override '{}' does not name a file. Expected {} for target '{}'.",
            path.display(),
            target.runtime_filename(),
            target.display_triple(),
        ));
    };

    if file_name != target.runtime_filename() {
        return Err(format!(
            "Mesh runtime override '{}' does not match expected filename '{}' for target '{}'.",
            path.display(),
            target.runtime_filename(),
            target.display_triple(),
        ));
    }

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LinkTargetKind {
    Unix,
    WindowsMsvc,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LinkTarget {
    requested_triple: Option<String>,
    kind: LinkTargetKind,
}

impl LinkTarget {
    fn detect(target_triple: Option<&str>) -> Result<Self, String> {
        let kind = match target_triple {
            Some(triple) => classify_requested_target(triple)?,
            None => classify_host_target()?,
        };

        Ok(Self {
            requested_triple: target_triple.map(ToOwned::to_owned),
            kind,
        })
    }

    fn display_triple(&self) -> String {
        self.requested_triple
            .clone()
            .unwrap_or_else(host_target_triple)
    }

    fn runtime_filename(&self) -> &'static str {
        match self.kind {
            LinkTargetKind::Unix => "libmesh_rt.a",
            LinkTargetKind::WindowsMsvc => "mesh_rt.lib",
        }
    }

    fn linker_program(&self) -> Result<PathBuf, String> {
        match self.kind {
            LinkTargetKind::Unix => Ok(PathBuf::from("cc")),
            LinkTargetKind::WindowsMsvc => windows_clang_path(),
        }
    }

    fn cargo_build_hint(&self) -> String {
        self.requested_triple
            .as_deref()
            .map(|triple| format!(" --target {triple}"))
            .unwrap_or_default()
    }

    fn linker_help_suffix(&self) -> &'static str {
        match self.kind {
            LinkTargetKind::Unix => "",
            LinkTargetKind::WindowsMsvc => {
                " Set LLVM_SYS_211_PREFIX to an LLVM install containing clang.exe or ensure clang.exe is on PATH."
            }
        }
    }

    fn needs_security_framework(&self) -> bool {
        self.requested_triple
            .as_deref()
            .map(|triple| triple.contains("apple-darwin"))
            .unwrap_or(cfg!(target_os = "macos"))
    }
}

fn classify_requested_target(target_triple: &str) -> Result<LinkTargetKind, String> {
    if target_triple.contains("windows-msvc") {
        return Ok(LinkTargetKind::WindowsMsvc);
    }

    if target_triple.contains("windows") {
        return Err(format!(
            "Unsupported linker target triple '{target_triple}'. Only Windows MSVC targets are supported on Windows."
        ));
    }

    if is_unix_like_target(target_triple) {
        return Ok(LinkTargetKind::Unix);
    }

    Err(format!(
        "Unsupported linker target triple '{target_triple}'. Supported linker families are Unix-like targets and Windows MSVC targets."
    ))
}

fn classify_host_target() -> Result<LinkTargetKind, String> {
    if cfg!(all(target_os = "windows", target_env = "msvc")) {
        return Ok(LinkTargetKind::WindowsMsvc);
    }

    if cfg!(target_family = "unix") {
        return Ok(LinkTargetKind::Unix);
    }

    Err(format!(
        "Unsupported host linker target '{}'. Supported linker families are Unix-like targets and Windows MSVC targets.",
        host_target_triple()
    ))
}

fn is_unix_like_target(target_triple: &str) -> bool {
    [
        "apple-darwin",
        "unknown-linux",
        "linux-musl",
        "freebsd",
        "netbsd",
        "openbsd",
        "dragonfly",
    ]
    .iter()
    .any(|needle| target_triple.contains(needle))
}

fn host_target_triple() -> String {
    let arch = std::env::consts::ARCH;

    if cfg!(all(target_os = "windows", target_env = "msvc")) {
        format!("{arch}-pc-windows-msvc")
    } else if cfg!(target_os = "macos") {
        format!("{arch}-apple-darwin")
    } else if cfg!(target_os = "linux") {
        format!("{arch}-unknown-linux-gnu")
    } else {
        format!("{arch}-unknown-{}", std::env::consts::OS)
    }
}

fn windows_clang_path() -> Result<PathBuf, String> {
    if let Ok(prefix) = std::env::var("LLVM_SYS_211_PREFIX") {
        let candidate = windows_clang_path_from_prefix(Path::new(&prefix));
        if candidate.exists() {
            return Ok(candidate);
        }

        return Err(format!(
            "LLVM_SYS_211_PREFIX='{}' does not contain bin/clang.exe at '{}'. Install LLVM 21 or set LLVM_SYS_211_PREFIX correctly.",
            prefix,
            candidate.display(),
        ));
    }

    Ok(PathBuf::from("clang"))
}

fn windows_clang_path_from_prefix(prefix: &Path) -> PathBuf {
    prefix.join("bin").join("clang.exe")
}

/// Attempt to find the workspace target directory.
///
/// Uses the `CARGO_TARGET_DIR` env var if set, otherwise walks up from the
/// current executable to find a `target/` directory.
fn find_workspace_target_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CARGO_TARGET_DIR") {
        return Some(PathBuf::from(dir));
    }

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|path| path.to_path_buf());
        while let Some(current) = dir {
            if current.file_name().is_some_and(|name| name == "target") {
                return Some(current);
            }

            let target_dir = current.join("target");
            if target_dir.exists() {
                return Some(target_dir);
            }

            dir = current.parent().map(|path| path.to_path_buf());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn find_workspace_target_dir_should_find_target_dir_during_cargo_test() {
        assert!(
            find_workspace_target_dir().is_some(),
            "Should find workspace target dir during cargo test"
        );
    }

    #[test]
    fn classify_requested_target_should_reject_unknown_windows_flavor() {
        let error = classify_requested_target("x86_64-pc-windows-gnu").unwrap_err();
        assert!(
            error.contains("Only Windows MSVC targets are supported on Windows."),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn mesh_rt_candidates_should_use_windows_runtime_name_inside_target_subdir() {
        let temp_target = unique_temp_target_dir("windows-runtime-name");
        let runtime = temp_target
            .join("x86_64-pc-windows-msvc")
            .join("debug")
            .join("mesh_rt.lib");
        fs::create_dir_all(runtime.parent().unwrap()).unwrap();
        fs::write(&runtime, b"fake").unwrap();

        let target = LinkTarget::detect(Some("x86_64-pc-windows-msvc")).unwrap();
        let found =
            find_mesh_rt_in(&[temp_target.clone()], &target, &["debug", "release"]).unwrap();
        assert_eq!(found, runtime);

        fs::remove_dir_all(temp_target).unwrap();
    }

    #[test]
    fn mesh_rt_candidates_should_keep_unix_runtime_name_in_profile_root() {
        let temp_target = unique_temp_target_dir("unix-runtime-name");
        let runtime = temp_target.join("debug").join("libmesh_rt.a");
        fs::create_dir_all(runtime.parent().unwrap()).unwrap();
        fs::write(&runtime, b"fake").unwrap();

        let target = LinkTarget::detect(Some("x86_64-unknown-linux-gnu")).unwrap();
        let found =
            find_mesh_rt_in(&[temp_target.clone()], &target, &["debug", "release"]).unwrap();
        assert_eq!(found, runtime);

        fs::remove_dir_all(temp_target).unwrap();
    }

    #[test]
    fn find_mesh_rt_in_should_report_target_specific_runtime_name_when_missing() {
        let temp_target = unique_temp_target_dir("windows-missing-runtime");
        let target = LinkTarget::detect(Some("x86_64-pc-windows-msvc")).unwrap();

        let error =
            find_mesh_rt_in(&[temp_target.clone()], &target, &["debug", "release"]).unwrap_err();
        assert!(
            error.contains("mesh_rt.lib"),
            "missing runtime error should name mesh_rt.lib: {error}"
        );
        assert!(
            error.contains("cargo build -p mesh-rt --target x86_64-pc-windows-msvc"),
            "missing runtime error should include target-aware cargo hint: {error}"
        );

        fs::remove_dir_all(temp_target).unwrap();
    }

    #[test]
    fn explicit_runtime_override_should_reject_wrong_filename_for_windows_target() {
        let target = LinkTarget::detect(Some("x86_64-pc-windows-msvc")).unwrap();
        let error = validate_runtime_override(Path::new("/tmp/libmesh_rt.a"), &target).unwrap_err();
        assert!(
            error.contains("expected filename 'mesh_rt.lib'"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn windows_clang_path_from_prefix_should_append_bin_clang_exe() {
        let actual = windows_clang_path_from_prefix(Path::new("C:/llvm"));
        assert_eq!(
            actual,
            PathBuf::from("C:/llvm").join("bin").join("clang.exe")
        );
    }

    fn find_mesh_rt_in(
        target_dirs: &[PathBuf],
        target: &LinkTarget,
        profiles: &[&str],
    ) -> Result<PathBuf, String> {
        let mut searched_paths = Vec::new();

        for target_dir in target_dirs {
            for candidate in mesh_rt_candidates(target_dir, target, profiles) {
                if candidate.exists() {
                    return Ok(candidate);
                }
                searched_paths.push(candidate);
            }
        }

        let mut message = format!(
            "Could not locate Mesh runtime static library for target '{}'. Expected {}. Run `cargo build -p mesh-rt{}` first.",
            target.display_triple(),
            target.runtime_filename(),
            target.cargo_build_hint(),
        );
        if !searched_paths.is_empty() {
            message.push_str("\nSearched:\n");
            for path in searched_paths {
                message.push_str("  - ");
                message.push_str(&path.display().to_string());
                message.push('\n');
            }
            message.pop();
        }

        Err(message)
    }

    fn unique_temp_target_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "mesh-codegen-{name}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }
}
