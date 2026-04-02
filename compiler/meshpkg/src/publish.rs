use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use colored::Colorize;
use flate2::write::GzEncoder;
use flate2::Compression;
use indicatif::{ProgressBar, ProgressStyle};
use sha2::{Digest, Sha256};
use tar::Builder;

use mesh_pkg::Manifest;

pub fn run(project_dir: &Path, registry: &str, json_mode: bool) -> Result<(), String> {
    // Read manifest
    let manifest_path = project_dir.join("mesh.toml");
    let manifest = Manifest::from_file(&manifest_path)?;

    let name = &manifest.package.name;
    let version = &manifest.package.version;

    // Create tarball in memory
    let (tarball_bytes, sha256) = create_tarball(project_dir)?;

    // Upload with spinner
    let msg = format!("Publishing {}@{}...", name, version);
    let description = manifest.package.description.as_deref().unwrap_or("");
    with_spinner(&msg, json_mode, || {
        upload_tarball(
            &tarball_bytes,
            &sha256,
            name,
            version,
            description,
            registry,
        )
    })?;

    if json_mode {
        println!(
            "{{\"status\": \"ok\", \"name\": \"{}\", \"version\": \"{}\", \"sha256\": \"{}\"}}",
            name, version, sha256
        );
    } else {
        println!("{} Published {}@{}", "✓".green().bold(), name, version);
        println!("  SHA-256: {}", sha256);
    }

    Ok(())
}

fn create_tarball(project_dir: &Path) -> Result<(Vec<u8>, String), String> {
    let archive_members = publish_archive_members(project_dir)?;
    let mut buf = Vec::new();
    {
        let enc = GzEncoder::new(&mut buf, Compression::default());
        let mut archive = Builder::new(enc);

        for member in &archive_members {
            let source_path = project_dir.join(member);
            archive
                .append_path_with_name(&source_path, member)
                .map_err(|e| format!("Failed to add '{}' to tarball: {}", member.display(), e))?;
        }

        archive
            .into_inner()
            .map_err(|e| format!("Failed to finalize tarball: {}", e))?
            .finish()
            .map_err(|e| format!("Failed to flush gzip stream: {}", e))?;
    }

    // Compute SHA-256
    let hash_bytes = Sha256::digest(&buf);
    let sha256: String = hash_bytes.iter().map(|b| format!("{:02x}", b)).collect();

    Ok((buf, sha256))
}

fn publish_archive_members(project_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut source_members = Vec::new();
    discover_publish_source_members(project_dir, project_dir, &mut source_members)?;
    source_members.sort();

    let mut archive_members = Vec::with_capacity(source_members.len() + 1);
    archive_members.push(PathBuf::from("mesh.toml"));
    archive_members.extend(source_members);
    ensure_unique_archive_members(&archive_members)?;

    Ok(archive_members)
}

fn discover_publish_source_members(
    project_root: &Path,
    dir: &Path,
    members: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("Failed to read '{}': {}", dir.display(), e))?;
    let mut child_dirs = Vec::new();

    for entry in entries {
        let entry =
            entry.map_err(|e| format!("Failed to read entry under '{}': {}", dir.display(), e))?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            child_dirs.push(path);
            continue;
        }

        if path.extension().and_then(|ext| ext.to_str()) != Some("mpl") {
            continue;
        }

        if name.ends_with(".test.mpl") {
            continue;
        }

        members.push(relative_archive_member_path(project_root, &path)?);
    }

    child_dirs.sort();
    for child_dir in child_dirs {
        discover_publish_source_members(project_root, &child_dir, members)?;
    }

    Ok(())
}

fn relative_archive_member_path(
    project_root: &Path,
    source_path: &Path,
) -> Result<PathBuf, String> {
    let relative_path = source_path.strip_prefix(project_root).map_err(|_| {
        format!(
            "Failed to preserve '{}' relative to project root '{}'",
            source_path.display(),
            project_root.display()
        )
    })?;
    validate_archive_member_path(relative_path, source_path)?;
    Ok(relative_path.to_path_buf())
}

fn validate_archive_member_path(relative_path: &Path, source_path: &Path) -> Result<(), String> {
    if relative_path.as_os_str().is_empty() {
        return Err(format!(
            "Refusing to archive '{}' as an empty member name",
            source_path.display()
        ));
    }

    for component in relative_path.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err(format!(
                    "Refusing to archive malformed member '{}' derived from '{}'",
                    relative_path.display(),
                    source_path.display()
                ));
            }
        }
    }

    Ok(())
}

fn ensure_unique_archive_members(members: &[PathBuf]) -> Result<(), String> {
    let mut seen = HashSet::new();

    for member in members {
        if !seen.insert(member.as_path()) {
            return Err(format!(
                "Refusing to archive duplicate member '{}'",
                member.display()
            ));
        }
    }

    Ok(())
}

fn upload_tarball(
    tarball: &[u8],
    sha256: &str,
    name: &str,
    version: &str,
    description: &str,
    registry: &str,
) -> Result<(), String> {
    // Read auth token
    let token = crate::auth::read_token()?;

    let agent = ureq::Agent::new_with_defaults();
    let url = format!("{}/api/v1/packages", registry);

    let response = agent
        .post(&url)
        .header("Authorization", &format!("Bearer {}", token))
        .header("Content-Type", "application/octet-stream")
        .header("X-Package-Name", name)
        .header("X-Package-Version", version)
        .header("X-Package-SHA256", sha256)
        .header("X-Package-Description", description)
        .send(tarball)
        .map_err(|e| format!("Failed to connect to registry: {}", e))?;

    match response.status().as_u16() {
        200 | 201 => Ok(()),
        409 => Err(format!(
            "{}@{} already exists in registry. Versions are immutable.",
            name, version
        )),
        401 => Err("Unauthorized. Run `meshpkg login` to authenticate.".to_string()),
        status => Err(format!("Registry returned HTTP {}", status)),
    }
}

pub(crate) fn with_spinner<T, F: FnOnce() -> Result<T, String>>(
    msg: &str,
    json_mode: bool,
    f: F,
) -> Result<T, String> {
    if json_mode {
        return f();
    }
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::with_template("{spinner:.cyan} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", ""]),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(Duration::from_millis(80));
    let result = f();
    pb.finish_and_clear();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    use flate2::read::GzDecoder;
    use tar::Archive;

    fn manifest(name: &str, entrypoint: &str) -> String {
        format!(
            "[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nentrypoint = \"{entrypoint}\"\n"
        )
    }

    fn write_project_file(project_dir: &Path, relative_path: &str, contents: &str) {
        let full_path = project_dir.join(relative_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(full_path, contents).unwrap();
    }

    fn archive_member_names(project_dir: &Path) -> Vec<String> {
        let (tarball_bytes, _sha256) = create_tarball(project_dir).unwrap();
        let decoder = GzDecoder::new(tarball_bytes.as_slice());
        let mut archive = Archive::new(decoder);
        let mut members = archive
            .entries()
            .unwrap()
            .map(|entry| {
                entry
                    .unwrap()
                    .path()
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            })
            .collect::<Vec<_>>();
        members.sort();
        members
    }

    #[test]
    fn publish_archive_members_include_override_entry_and_nested_support_modules() {
        let tempdir = tempfile::tempdir().unwrap();
        let project_dir = tempdir.path();

        write_project_file(
            project_dir,
            "mesh.toml",
            &manifest("override-only-package", "lib/start.mpl"),
        );
        write_project_file(
            project_dir,
            "lib/start.mpl",
            "from Features.Workflows.Renderer import render\n\nfn main() do\n  render()\nend\n",
        );
        write_project_file(
            project_dir,
            "features/workflows/renderer.mpl",
            "pub fn render() -> Int do\n  42\nend\n",
        );
        write_project_file(
            project_dir,
            "lib/support/helpers.mpl",
            "pub fn label() -> String do\n  \"support\"\nend\n",
        );

        let members = archive_member_names(project_dir);

        assert_eq!(
            members,
            vec![
                "features/workflows/renderer.mpl",
                "lib/start.mpl",
                "lib/support/helpers.mpl",
                "mesh.toml",
            ],
            "unexpected archive members: {members:?}"
        );
    }

    #[test]
    fn publish_archive_members_exclude_hidden_paths_and_test_files() {
        let tempdir = tempfile::tempdir().unwrap();
        let project_dir = tempdir.path();

        write_project_file(
            project_dir,
            "mesh.toml",
            &manifest("publish-filtering", "lib/start.mpl"),
        );
        write_project_file(project_dir, "lib/start.mpl", "fn main() do\n  0\nend\n");
        write_project_file(
            project_dir,
            "lib/visible.mpl",
            "pub fn ok() -> Int do\n  1\nend\n",
        );
        write_project_file(
            project_dir,
            "lib/visible.test.mpl",
            "test(\"hidden\") do\n  assert(true)\nend\n",
        );
        write_project_file(project_dir, ".secret.mpl", "fn nope() do\n  0\nend\n");
        write_project_file(
            project_dir,
            ".hidden/secret.mpl",
            "fn nope() do\n  0\nend\n",
        );
        write_project_file(
            project_dir,
            "lib/.private/secret.mpl",
            "fn nope() do\n  0\nend\n",
        );

        let members = archive_member_names(project_dir);

        assert!(
            members.contains(&"lib/start.mpl".to_string()),
            "expected override entry to be archived, got: {members:?}"
        );
        assert!(
            members.contains(&"lib/visible.mpl".to_string()),
            "expected visible nested module to be archived, got: {members:?}"
        );
        assert!(
            !members.iter().any(|member| member.contains(".secret.mpl")
                || member.contains(".hidden/")
                || member.contains("/.private/")
                || member.ends_with(".test.mpl")),
            "hidden or test-only files leaked into the archive: {members:?}"
        );
    }

    #[test]
    fn publish_archive_members_keep_root_main_when_override_and_root_entries_both_exist() {
        let tempdir = tempfile::tempdir().unwrap();
        let project_dir = tempdir.path();

        write_project_file(
            project_dir,
            "mesh.toml",
            &manifest("override-precedence-package", "lib/start.mpl"),
        );
        write_project_file(project_dir, "main.mpl", "fn main() do\n  0\nend\n");
        write_project_file(project_dir, "lib/start.mpl", "fn main() do\n  1\nend\n");
        write_project_file(
            project_dir,
            "modules/support.mpl",
            "pub fn label() -> String do\n  \"ok\"\nend\n",
        );

        let members = archive_member_names(project_dir);

        assert!(
            members.contains(&"main.mpl".to_string()),
            "expected root main.mpl to remain published when present, got: {members:?}"
        );
        assert!(
            members.contains(&"lib/start.mpl".to_string()),
            "expected override entrypoint to be published, got: {members:?}"
        );
        assert!(
            members.contains(&"modules/support.mpl".to_string()),
            "expected non-src nested support module to be published, got: {members:?}"
        );
    }

    #[test]
    fn discover_publish_source_members_reports_directory_path_when_walk_fails() {
        let tempdir = tempfile::tempdir().unwrap();
        let missing_dir = tempdir.path().join("missing");
        let mut members = Vec::new();

        let err = discover_publish_source_members(tempdir.path(), &missing_dir, &mut members)
            .expect_err("missing directories should surface a read error");

        assert!(
            err.contains(&missing_dir.display().to_string()),
            "expected walk failure to include the unreadable path, got: {err}"
        );
    }

    #[test]
    fn validate_archive_member_path_rejects_escaping_components() {
        let err =
            validate_archive_member_path(Path::new("../escape.mpl"), Path::new("../escape.mpl"))
                .expect_err("escaping member names should be rejected");

        assert!(
            err.contains("malformed member"),
            "unexpected validation error: {err}"
        );
    }

    #[test]
    fn ensure_unique_archive_members_rejects_duplicate_relative_paths() {
        let members = vec![
            PathBuf::from("mesh.toml"),
            PathBuf::from("lib/start.mpl"),
            PathBuf::from("lib/start.mpl"),
        ];

        let err = ensure_unique_archive_members(&members)
            .expect_err("duplicate archive members should be rejected");

        assert!(
            err.contains("lib/start.mpl"),
            "duplicate-path error should name the conflicting member, got: {err}"
        );
    }
}
