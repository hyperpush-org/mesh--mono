use mesh_common::{module_graph::ModuleGraph, span::Span};
use mesh_parser::ast::item::{ClusteredDeclSyntax, Item};
use serde::{Deserialize, Deserializer};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt;
use std::path::{Component, Path, PathBuf};

/// Represents a parsed mesh.toml manifest file.
#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub package: Package,
    #[serde(default)]
    pub dependencies: BTreeMap<String, Dependency>,
    #[serde(default)]
    pub cluster: Option<ClusterConfig>,
}

/// Package metadata from the [package] section of mesh.toml.
#[derive(Debug, Deserialize)]
pub struct Package {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default, deserialize_with = "deserialize_entrypoint")]
    pub entrypoint: Option<PathBuf>,
}

pub const DEFAULT_ENTRYPOINT: &str = "main.mpl";

/// Clustered-app configuration from the optional [cluster] section.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ClusterConfig {
    pub enabled: bool,
    pub declarations: Vec<ClusteredDeclaration>,
}

impl ClusterConfig {
    fn validate_shape(&self) -> Result<(), String> {
        if !self.enabled {
            return Err(
                "[cluster].enabled must be true when the [cluster] section is present".to_string(),
            );
        }

        if self.declarations.is_empty() {
            return Err(
                "[cluster].declarations must contain at least one clustered declaration"
                    .to_string(),
            );
        }

        for (idx, declaration) in self.declarations.iter().enumerate() {
            if declaration.target.trim().is_empty() {
                return Err(format!(
                    "[cluster].declarations[{idx}].target must not be blank"
                ));
            }
        }

        Ok(())
    }
}

/// One clustered declaration from the [cluster] section.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ClusteredDeclaration {
    pub kind: ClusteredDeclarationKind,
    pub target: String,
}

/// The narrow public clustered-handler boundary.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClusteredDeclarationKind {
    ServiceCall,
    ServiceCast,
    Work,
}

impl ClusteredDeclarationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ClusteredDeclarationKind::ServiceCall => "service_call",
            ClusteredDeclarationKind::ServiceCast => "service_cast",
            ClusteredDeclarationKind::Work => "work",
        }
    }
}

impl fmt::Display for ClusteredDeclarationKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Compiler-known executable metadata for one declared clustered target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClusteredExecutableSurfaceInfo {
    pub runtime_registration_name: String,
    pub executable_symbol: Option<String>,
}

pub const DEFAULT_CLUSTER_REPLICATION_COUNT: u32 = 2;

/// Whether a clustered declaration used the default replication count or an explicit source value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClusteredReplicationCountSource {
    Default,
    Explicit,
}

impl fmt::Display for ClusteredReplicationCountSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ClusteredReplicationCountSource::Default => f.write_str("default"),
            ClusteredReplicationCountSource::Explicit => f.write_str("explicit"),
        }
    }
}

/// Resolved replication count for a clustered declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClusteredReplicationCount {
    pub value: u32,
    pub source: ClusteredReplicationCountSource,
}

impl ClusteredReplicationCount {
    pub fn defaulted() -> Self {
        Self {
            value: DEFAULT_CLUSTER_REPLICATION_COUNT,
            source: ClusteredReplicationCountSource::Default,
        }
    }

    pub fn explicit(value: u32) -> Self {
        Self {
            value,
            source: ClusteredReplicationCountSource::Explicit,
        }
    }
}

impl fmt::Display for ClusteredReplicationCount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.value, self.source)
    }
}

/// Source spelling used for a clustered declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceClusteredDeclarationSyntax {
    Decorator,
    LegacyCompat,
}

impl SourceClusteredDeclarationSyntax {
    pub fn as_str(self) -> &'static str {
        match self {
            SourceClusteredDeclarationSyntax::Decorator => "`@cluster` decorator",
            SourceClusteredDeclarationSyntax::LegacyCompat => "`clustered(work)` marker",
        }
    }
}

impl fmt::Display for SourceClusteredDeclarationSyntax {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl From<ClusteredDeclSyntax> for SourceClusteredDeclarationSyntax {
    fn from(value: ClusteredDeclSyntax) -> Self {
        match value {
            ClusteredDeclSyntax::SourceDecorator => SourceClusteredDeclarationSyntax::Decorator,
            ClusteredDeclSyntax::LegacyCompat => SourceClusteredDeclarationSyntax::LegacyCompat,
        }
    }
}

/// Provenance for a clustered declaration discovered in source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClusteredDeclarationProvenance {
    pub module_name: String,
    pub file: PathBuf,
    pub span: Span,
    pub syntax: SourceClusteredDeclarationSyntax,
}

/// One clustered declaration collected from source code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceClusteredDeclaration {
    pub kind: ClusteredDeclarationKind,
    pub target: String,
    pub replication_count: ClusteredReplicationCount,
    pub provenance: ClusteredDeclarationProvenance,
}

/// Validated clustered execution metadata that survives manifest checking.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClusteredExecutionMetadata {
    pub kind: ClusteredDeclarationKind,
    pub manifest_target: String,
    pub runtime_registration_name: String,
    pub executable_symbol: String,
    pub replication_count: ClusteredReplicationCount,
    pub origin: ClusteredDeclarationOrigin,
}

/// Minimal compiler-known clustered boundary used by both meshc and mesh-lsp.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ClusteredExportSurface {
    pub work_functions: BTreeMap<String, ClusteredExecutableSurfaceInfo>,
    pub ambiguous_work_functions: BTreeSet<String>,
    pub private_work_functions: BTreeSet<String>,
    pub service_call_handlers: BTreeMap<String, ClusteredExecutableSurfaceInfo>,
    pub service_cast_handlers: BTreeMap<String, ClusteredExecutableSurfaceInfo>,
    pub service_start_helpers: BTreeSet<String>,
}

/// Where a clustered declaration came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClusteredDeclarationOrigin {
    Manifest,
    Source(ClusteredDeclarationProvenance),
}

impl ClusteredDeclarationOrigin {
    pub fn provenance(&self) -> Option<&ClusteredDeclarationProvenance> {
        match self {
            ClusteredDeclarationOrigin::Manifest => None,
            ClusteredDeclarationOrigin::Source(provenance) => Some(provenance),
        }
    }
}

impl fmt::Display for ClusteredDeclarationOrigin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ClusteredDeclarationOrigin::Manifest => f.write_str("mesh.toml"),
            ClusteredDeclarationOrigin::Source(provenance) => {
                write!(f, "a source {}", provenance.syntax)
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ClusteredDeclarationEntry {
    declaration: ClusteredDeclaration,
    origin: ClusteredDeclarationOrigin,
    replication_count: ClusteredReplicationCount,
}

/// One fail-closed clustered declaration validation issue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClusteredDeclarationError {
    pub origin: ClusteredDeclarationOrigin,
    pub kind: ClusteredDeclarationKind,
    pub target: String,
    pub replication_count: ClusteredReplicationCount,
    pub reason: String,
}

impl fmt::Display for ClusteredDeclarationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "clustered declaration `{}` for `{}` from {} with replication count {} is invalid: {}",
            self.kind, self.target, self.origin, self.replication_count, self.reason
        )
    }
}

/// A dependency specification -- registry, git-based, or path-based.
///
/// Serde uses `untagged` deserialization, so variants are tried in declaration
/// order. RegistryShorthand MUST be first so a bare string "1.0.0" matches it
/// before Git or Path are attempted.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Dependency {
    /// Bare string shorthand: `foo = "1.0.0"`
    RegistryShorthand(String),
    /// Table form: `foo = { version = "1.0.0" }`
    Registry { version: String },
    /// Git source: `foo = { git = "https://...", ... }`
    Git {
        git: String,
        #[serde(default)]
        rev: Option<String>,
        #[serde(default)]
        branch: Option<String>,
        #[serde(default)]
        tag: Option<String>,
    },
    /// Local path: `foo = { path = "../foo" }`
    Path { path: String },
}

impl Dependency {
    /// Returns the version string if this is a registry dependency.
    pub fn registry_version(&self) -> Option<&str> {
        match self {
            Dependency::RegistryShorthand(v) => Some(v),
            Dependency::Registry { version } => Some(version),
            _ => None,
        }
    }

    /// Returns true if this is a registry (not git or path) dependency.
    pub fn is_registry(&self) -> bool {
        self.registry_version().is_some()
    }
}

fn deserialize_entrypoint<'de, D>(deserializer: D) -> Result<Option<PathBuf>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = Option::<String>::deserialize(deserializer)?;
    raw.map(|value| normalize_entrypoint(&value).map_err(serde::de::Error::custom))
        .transpose()
}

fn normalize_entrypoint(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("`[package].entrypoint` must not be blank".to_string());
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(format!(
            "`[package].entrypoint` must be project-root-relative, got absolute path `{trimmed}`"
        ));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            Component::ParentDir => {
                return Err(format!(
                    "`[package].entrypoint` must stay within the project root, got `{trimmed}`"
                ));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!(
                    "`[package].entrypoint` must be project-root-relative, got `{trimmed}`"
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err("`[package].entrypoint` must not be blank".to_string());
    }

    if normalized.extension().and_then(|ext| ext.to_str()) != Some("mpl") {
        return Err(format!(
            "`[package].entrypoint` must end with `.mpl`, got `{trimmed}`"
        ));
    }

    Ok(normalized)
}

pub fn resolve_entrypoint(
    project_root: &Path,
    manifest: Option<&Manifest>,
) -> Result<PathBuf, String> {
    let entrypoint = manifest
        .and_then(|manifest| manifest.package.entrypoint.clone())
        .unwrap_or_else(|| PathBuf::from(DEFAULT_ENTRYPOINT));
    let entry_full_path = project_root.join(&entrypoint);

    if !entry_full_path.exists() {
        return Err(format!(
            "Entrypoint '{}' was not found in project '{}'",
            entrypoint.display(),
            project_root.display()
        ));
    }

    if !entry_full_path.is_file() {
        return Err(format!(
            "Entrypoint '{}' in project '{}' is not a file",
            entrypoint.display(),
            project_root.display()
        ));
    }

    Ok(entrypoint)
}

pub fn rewrite_manifest_entrypoint_source(
    manifest_source: &str,
    entrypoint: &Path,
) -> Result<String, String> {
    let entrypoint_str = entrypoint.to_str().ok_or_else(|| {
        format!(
            "`[package].entrypoint` must be valid UTF-8, got '{}'",
            entrypoint.display()
        )
    })?;
    let normalized_entrypoint = normalize_entrypoint(entrypoint_str)?;
    let mut manifest_value: toml::Value = toml::from_str(manifest_source)
        .map_err(|error| format!("Failed to parse manifest for rewrite: {}", error))?;
    let manifest_table = manifest_value
        .as_table_mut()
        .ok_or_else(|| "Manifest root must be a TOML table".to_string())?;
    let package_value = manifest_table
        .get_mut("package")
        .ok_or_else(|| "Manifest must contain a [package] table to rewrite entrypoint".to_string())?;
    let package_table = package_value
        .as_table_mut()
        .ok_or_else(|| "Manifest [package] section must be a TOML table".to_string())?;

    package_table.insert(
        "entrypoint".to_string(),
        toml::Value::String(normalized_entrypoint.to_string_lossy().into_owned()),
    );

    toml::to_string_pretty(&manifest_value)
        .map_err(|error| format!("Failed to serialize manifest rewrite: {}", error))
}

fn legacy_cluster_section_error(source_path: Option<&Path>) -> String {
    let message = "`[cluster]` manifest sections are no longer supported; move clustered declarations into source with `@cluster` or `@cluster(N)`";
    match source_path {
        Some(path) => format!("Failed to parse {}: {}", path.display(), message),
        None => format!("Failed to parse manifest: {}", message),
    }
}

impl Manifest {
    /// Read and parse a mesh.toml manifest from a file path.
    pub fn from_file(path: &Path) -> Result<Manifest, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        Self::parse(content.as_str(), Some(path))
    }

    /// Parse a mesh.toml manifest from a string.
    pub fn from_str(content: &str) -> Result<Manifest, String> {
        Self::parse(content, None)
    }

    fn parse(content: &str, source_path: Option<&Path>) -> Result<Manifest, String> {
        let value: toml::Value = toml::from_str(content).map_err(|error| match source_path {
            Some(path) => format!("Failed to parse {}: {}", path.display(), error),
            None => format!("Failed to parse manifest: {}", error),
        })?;

        if value
            .as_table()
            .is_some_and(|table| table.contains_key("cluster"))
        {
            return Err(legacy_cluster_section_error(source_path));
        }

        let manifest: Manifest = value.try_into().map_err(|error| match source_path {
            Some(path) => format!("Failed to parse {}: {}", path.display(), error),
            None => format!("Failed to parse manifest: {}", error),
        })?;

        if let Some(cluster) = &manifest.cluster {
            cluster
                .validate_shape()
                .map_err(|error| match source_path {
                    Some(path) => format!("Failed to parse {}: {}", path.display(), error),
                    None => format!("Failed to parse manifest: {}", error),
                })?;
        }

        Ok(manifest)
    }
}

/// Collect source-level clustered declarations from parsed function items.
pub fn collect_source_cluster_declarations(
    graph: &ModuleGraph,
    parses: &[mesh_parser::Parse],
) -> Vec<SourceClusteredDeclaration> {
    let mut declarations = Vec::new();

    for (module_info, parse) in graph.modules.iter().zip(parses.iter()) {
        let tree = parse.tree();
        for item in tree.items() {
            let Item::FnDef(fn_def) = item else {
                continue;
            };
            let Some(decl) = fn_def.clustered_decl() else {
                continue;
            };
            if decl.kind() != mesh_parser::ast::item::ClusteredDeclKind::Work {
                continue;
            }
            let Some(name) = fn_def.name().and_then(|name| name.text()) else {
                continue;
            };

            declarations.push(SourceClusteredDeclaration {
                kind: ClusteredDeclarationKind::Work,
                target: format!("{}.{}", module_info.name, name),
                replication_count: decl
                    .explicit_replica_count()
                    .map(ClusteredReplicationCount::explicit)
                    .unwrap_or_else(ClusteredReplicationCount::defaulted),
                provenance: ClusteredDeclarationProvenance {
                    module_name: module_info.name.clone(),
                    file: module_info.path.clone(),
                    span: decl.declaration_span(),
                    syntax: decl.syntax_style().into(),
                },
            });
        }
    }

    declarations
}

/// Build the compiler-known clustered export surface for public work functions
/// and service-generated call/cast helpers.
pub fn build_clustered_export_surface(
    graph: &ModuleGraph,
    parses: &[mesh_parser::Parse],
    all_exports: &[Option<mesh_typeck::ExportedSymbols>],
) -> ClusteredExportSurface {
    let mut surface = ClusteredExportSurface::default();

    for idx in 0..graph.module_count() {
        let module_id = mesh_common::module_graph::ModuleId(idx as u32);
        let module_name = &graph.get(module_id).name;
        let parse = &parses[idx];
        let tree = parse.tree();
        let mut public_fn_counts: HashMap<String, usize> = HashMap::new();

        for item in tree.items() {
            if let Item::FnDef(fn_def) = &item {
                if fn_def.visibility().is_some() {
                    if let Some(name) = fn_def.name().and_then(|name| name.text()) {
                        *public_fn_counts.entry(name).or_insert(0) += 1;
                    }
                }
            }
        }

        for item in tree.items() {
            if let Item::FnDef(fn_def) = item {
                let Some(name) = fn_def.name().and_then(|name| name.text()) else {
                    continue;
                };
                let qualified = format!("{}.{}", module_name, name);
                if fn_def.visibility().is_some() {
                    if public_fn_counts.get(&name).copied().unwrap_or(0) > 1 {
                        surface.ambiguous_work_functions.insert(qualified);
                    } else {
                        surface.work_functions.insert(
                            qualified.clone(),
                            ClusteredExecutableSurfaceInfo {
                                runtime_registration_name: qualified,
                                executable_symbol: Some(name),
                            },
                        );
                    }
                } else {
                    surface.private_work_functions.insert(qualified);
                }
            }
        }

        let Some(exports) = all_exports.get(idx).and_then(|exports| exports.as_ref()) else {
            continue;
        };

        for (service_name, service_info) in &exports.service_defs {
            for method in &service_info.method_exports {
                let target = format!("{}.{}.{}", module_name, service_name, method.method_name);
                match method.kind {
                    mesh_typeck::ServiceMethodExportKind::Start => {
                        surface.service_start_helpers.insert(target);
                    }
                    mesh_typeck::ServiceMethodExportKind::Call => {
                        surface.service_call_handlers.insert(
                            target.clone(),
                            ClusteredExecutableSurfaceInfo {
                                runtime_registration_name: target,
                                executable_symbol: Some(method.generated_name.clone()),
                            },
                        );
                    }
                    mesh_typeck::ServiceMethodExportKind::Cast => {
                        surface.service_cast_handlers.insert(
                            target.clone(),
                            ClusteredExecutableSurfaceInfo {
                                runtime_registration_name: target,
                                executable_symbol: Some(method.generated_name.clone()),
                            },
                        );
                    }
                }
            }
        }
    }

    surface
}

/// Validate manifest declarations against the compiler-known exported boundary.
pub fn validate_cluster_declarations(
    cluster: &ClusterConfig,
    surface: &ClusteredExportSurface,
) -> Result<Vec<ClusteredExecutionMetadata>, Vec<ClusteredDeclarationError>> {
    let entries = cluster
        .declarations
        .iter()
        .cloned()
        .map(|declaration| ClusteredDeclarationEntry {
            declaration,
            origin: ClusteredDeclarationOrigin::Manifest,
            replication_count: ClusteredReplicationCount::defaulted(),
        })
        .collect::<Vec<_>>();
    validate_cluster_declaration_entries(&entries, surface)
}

/// Validate the combined manifest + source clustered declaration surface.
pub fn validate_cluster_declarations_with_source(
    cluster: Option<&ClusterConfig>,
    source_declarations: &[SourceClusteredDeclaration],
    surface: &ClusteredExportSurface,
) -> Result<Vec<ClusteredExecutionMetadata>, Vec<ClusteredDeclarationError>> {
    if source_declarations.is_empty() {
        return match cluster {
            Some(cluster) => validate_cluster_declarations(cluster, surface),
            None => Ok(Vec::new()),
        };
    }

    let mut entries = cluster
        .into_iter()
        .flat_map(|cluster| cluster.declarations.iter().cloned())
        .map(|declaration| ClusteredDeclarationEntry {
            declaration,
            origin: ClusteredDeclarationOrigin::Manifest,
            replication_count: ClusteredReplicationCount::defaulted(),
        })
        .collect::<Vec<_>>();
    let mut issues = Vec::new();
    let mut seen_targets = entries
        .iter()
        .map(|entry| (entry.declaration.target.clone(), entry.origin.clone()))
        .collect::<BTreeMap<_, _>>();

    for declaration in source_declarations {
        let key = declaration.target.clone();
        if let Some(previous_origin) = seen_targets.get(&key) {
            issues.push(source_duplicate_error(declaration, previous_origin));
            continue;
        }

        let origin = ClusteredDeclarationOrigin::Source(declaration.provenance.clone());
        seen_targets.insert(key, origin.clone());
        entries.push(ClusteredDeclarationEntry {
            declaration: ClusteredDeclaration {
                kind: declaration.kind,
                target: declaration.target.clone(),
            },
            origin,
            replication_count: declaration.replication_count,
        });
    }

    match validate_cluster_declaration_entries(&entries, surface) {
        Ok(metadata) if issues.is_empty() => Ok(metadata),
        Ok(_) => Err(issues),
        Err(mut validation_issues) => {
            issues.append(&mut validation_issues);
            Err(issues)
        }
    }
}

fn source_duplicate_error(
    declaration: &SourceClusteredDeclaration,
    previous_origin: &ClusteredDeclarationOrigin,
) -> ClusteredDeclarationError {
    let reason = match previous_origin {
        ClusteredDeclarationOrigin::Manifest => {
            "target is declared in both mesh.toml and source; keep only one declaration surface"
                .to_string()
        }
        ClusteredDeclarationOrigin::Source(_) => {
            "target is declared more than once via source clustered declarations".to_string()
        }
    };

    ClusteredDeclarationError {
        origin: ClusteredDeclarationOrigin::Source(declaration.provenance.clone()),
        kind: declaration.kind,
        target: declaration.target.clone(),
        replication_count: declaration.replication_count,
        reason,
    }
}

fn validate_cluster_declaration_entries(
    entries: &[ClusteredDeclarationEntry],
    surface: &ClusteredExportSurface,
) -> Result<Vec<ClusteredExecutionMetadata>, Vec<ClusteredDeclarationError>> {
    let mut issues = Vec::new();
    let mut metadata = Vec::with_capacity(entries.len());

    for entry in entries {
        let declaration = &entry.declaration;
        if let Some(reason) = validate_declaration_shape(declaration) {
            issues.push(ClusteredDeclarationError {
                origin: entry.origin.clone(),
                kind: declaration.kind,
                target: declaration.target.clone(),
                replication_count: entry.replication_count,
                reason,
            });
            continue;
        }

        match declaration.kind {
            ClusteredDeclarationKind::Work => {
                if let Some(executable) = surface.work_functions.get(&declaration.target) {
                    match clustered_execution_metadata(entry, executable, "public work function") {
                        Ok(planned) => metadata.push(planned),
                        Err(issue) => issues.push(issue),
                    }
                    continue;
                }

                let reason = if surface
                    .ambiguous_work_functions
                    .contains(&declaration.target)
                {
                    "target resolves to multiple public functions with the same source name; overloaded clustered work entrypoints are unsupported".to_string()
                } else if surface.private_work_functions.contains(&declaration.target) {
                    "target resolves to a private function; declare a `pub fn` clustered work entrypoint".to_string()
                } else if surface
                    .service_call_handlers
                    .contains_key(&declaration.target)
                {
                    "target resolves to a service call handler; declare it as `service_call` instead of `work`".to_string()
                } else if surface
                    .service_cast_handlers
                    .contains_key(&declaration.target)
                {
                    "target resolves to a service cast handler; declare it as `service_cast` instead of `work`".to_string()
                } else if surface.service_start_helpers.contains(&declaration.target) {
                    "target resolves to a service start helper; only public work functions belong to the `work` boundary".to_string()
                } else {
                    "no public clustered work function matches this target".to_string()
                };

                issues.push(ClusteredDeclarationError {
                    origin: entry.origin.clone(),
                    kind: declaration.kind,
                    target: declaration.target.clone(),
                    replication_count: entry.replication_count,
                    reason,
                });
            }
            ClusteredDeclarationKind::ServiceCall => {
                if let Some(executable) = surface.service_call_handlers.get(&declaration.target) {
                    match clustered_execution_metadata(entry, executable, "service call handler") {
                        Ok(planned) => metadata.push(planned),
                        Err(issue) => issues.push(issue),
                    }
                    continue;
                }

                let reason = if surface
                    .service_cast_handlers
                    .contains_key(&declaration.target)
                {
                    "target resolves to a service cast handler, not a service call handler"
                        .to_string()
                } else if surface.service_start_helpers.contains(&declaration.target) {
                    "target resolves to a service start helper; only call handlers are valid `service_call` targets"
                        .to_string()
                } else {
                    "no exported service call handler matches this target".to_string()
                };

                issues.push(ClusteredDeclarationError {
                    origin: entry.origin.clone(),
                    kind: declaration.kind,
                    target: declaration.target.clone(),
                    replication_count: entry.replication_count,
                    reason,
                });
            }
            ClusteredDeclarationKind::ServiceCast => {
                if let Some(executable) = surface.service_cast_handlers.get(&declaration.target) {
                    match clustered_execution_metadata(entry, executable, "service cast handler") {
                        Ok(planned) => metadata.push(planned),
                        Err(issue) => issues.push(issue),
                    }
                    continue;
                }

                let reason = if surface
                    .service_call_handlers
                    .contains_key(&declaration.target)
                {
                    "target resolves to a service call handler, not a service cast handler"
                        .to_string()
                } else if surface.service_start_helpers.contains(&declaration.target) {
                    "target resolves to a service start helper; only cast handlers are valid `service_cast` targets"
                        .to_string()
                } else {
                    "no exported service cast handler matches this target".to_string()
                };

                issues.push(ClusteredDeclarationError {
                    origin: entry.origin.clone(),
                    kind: declaration.kind,
                    target: declaration.target.clone(),
                    replication_count: entry.replication_count,
                    reason,
                });
            }
        }
    }

    if issues.is_empty() {
        Ok(metadata)
    } else {
        Err(issues)
    }
}

fn clustered_execution_metadata(
    entry: &ClusteredDeclarationEntry,
    executable: &ClusteredExecutableSurfaceInfo,
    matched_kind: &str,
) -> Result<ClusteredExecutionMetadata, ClusteredDeclarationError> {
    let declaration = &entry.declaration;
    let registration_name = executable.runtime_registration_name.trim();
    if registration_name.is_empty() {
        return Err(ClusteredDeclarationError {
            origin: entry.origin.clone(),
            kind: declaration.kind,
            target: declaration.target.clone(),
            replication_count: entry.replication_count,
            reason: format!(
                "target resolves to an exported {matched_kind}, but execution planning could not derive a runtime registration name"
            ),
        });
    }

    let Some(executable_symbol) = executable
        .executable_symbol
        .as_deref()
        .map(str::trim)
        .filter(|symbol| !symbol.is_empty())
    else {
        return Err(ClusteredDeclarationError {
            origin: entry.origin.clone(),
            kind: declaration.kind,
            target: declaration.target.clone(),
            replication_count: entry.replication_count,
            reason: format!(
                "target resolves to an exported {matched_kind}, but execution planning could not derive a runtime-executable symbol or wrapper"
            ),
        });
    };

    Ok(ClusteredExecutionMetadata {
        kind: declaration.kind,
        manifest_target: declaration.target.clone(),
        runtime_registration_name: registration_name.to_string(),
        executable_symbol: executable_symbol.to_string(),
        replication_count: entry.replication_count,
        origin: entry.origin.clone(),
    })
}

fn validate_declaration_shape(declaration: &ClusteredDeclaration) -> Option<String> {
    let segments: Vec<&str> = declaration.target.split('.').collect();
    let has_blank_segment = segments.iter().any(|segment| segment.is_empty());
    if has_blank_segment {
        return Some("target must not contain empty path segments".to_string());
    }

    match declaration.kind {
        ClusteredDeclarationKind::Work if segments.len() < 2 => {
            Some("work targets must use `<ModulePath>.<function>`".to_string())
        }
        ClusteredDeclarationKind::ServiceCall | ClusteredDeclarationKind::ServiceCast
            if segments.len() < 3 =>
        {
            Some("service handler targets must use `<ModulePath>.<Service>.<method>`".to_string())
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};

    use mesh_typeck::{
        ExportedSymbols, ServiceExportInfo, ServiceMethodExport, ServiceMethodExportKind,
    };

    fn cluster_surface() -> ClusteredExportSurface {
        let mut surface = ClusteredExportSurface::default();
        surface.work_functions.insert(
            "Work.handle_submit".to_string(),
            ClusteredExecutableSurfaceInfo {
                runtime_registration_name: "Work.handle_submit".to_string(),
                executable_symbol: Some("handle_submit".to_string()),
            },
        );
        surface
            .private_work_functions
            .insert("Work.hidden_submit".to_string());
        surface.service_call_handlers.insert(
            "Services.Jobs.submit".to_string(),
            ClusteredExecutableSurfaceInfo {
                runtime_registration_name: "Services.Jobs.submit".to_string(),
                executable_symbol: Some("__service_jobs_call_submit".to_string()),
            },
        );
        surface.service_cast_handlers.insert(
            "Services.Jobs.reset".to_string(),
            ClusteredExecutableSurfaceInfo {
                runtime_registration_name: "Services.Jobs.reset".to_string(),
                executable_symbol: Some("__service_jobs_cast_reset".to_string()),
            },
        );
        surface
            .service_start_helpers
            .insert("Services.Jobs.start".to_string());
        surface
    }

    fn source_work_declaration(
        target: &str,
        replication_count: ClusteredReplicationCount,
        syntax: SourceClusteredDeclarationSyntax,
    ) -> SourceClusteredDeclaration {
        SourceClusteredDeclaration {
            kind: ClusteredDeclarationKind::Work,
            target: target.to_string(),
            replication_count,
            provenance: ClusteredDeclarationProvenance {
                module_name: "Work".to_string(),
                file: PathBuf::from("work.mpl"),
                span: Span::new(0, 8),
                syntax,
            },
        }
    }

    #[test]
    fn m047_s01_collect_source_clustered_declarations_capture_counts_and_provenance() {
        let mut graph = ModuleGraph::new();
        graph.add_module("Work".to_string(), "work.mpl".into(), false);
        graph.add_module("Legacy".to_string(), "legacy.mpl".into(), false);
        let parses = vec![
            mesh_parser::parse(
                "@cluster pub fn handle_submit(payload :: String) -> String do\n  payload\nend\n\n@cluster(3) pub fn handle_retry(payload :: String) -> String do\n  payload\nend\n",
            ),
            mesh_parser::parse(
                "clustered(work) pub fn replay(payload :: String) -> String do\n  payload\nend\n",
            ),
        ];

        let declarations = collect_source_cluster_declarations(&graph, &parses);

        assert_eq!(declarations.len(), 3);
        assert_eq!(declarations[0].target, "Work.handle_submit");
        assert_eq!(
            declarations[0].replication_count,
            ClusteredReplicationCount::defaulted()
        );
        assert_eq!(declarations[0].provenance.file, PathBuf::from("work.mpl"));
        assert_eq!(
            declarations[0].provenance.syntax,
            SourceClusteredDeclarationSyntax::Decorator
        );
        assert!(!declarations[0].provenance.span.is_empty());

        assert_eq!(declarations[1].target, "Work.handle_retry");
        assert_eq!(
            declarations[1].replication_count,
            ClusteredReplicationCount::explicit(3)
        );
        assert_eq!(
            declarations[1].provenance.syntax,
            SourceClusteredDeclarationSyntax::Decorator
        );

        assert_eq!(declarations[2].target, "Legacy.replay");
        assert_eq!(
            declarations[2].replication_count,
            ClusteredReplicationCount::defaulted()
        );
        assert_eq!(
            declarations[2].provenance.syntax,
            SourceClusteredDeclarationSyntax::LegacyCompat
        );
    }

    #[test]
    fn m047_s01_cluster_validation_preserves_source_count_and_origin() {
        let metadata = validate_cluster_declarations_with_source(
            None,
            &[source_work_declaration(
                "Work.handle_submit",
                ClusteredReplicationCount::explicit(3),
                SourceClusteredDeclarationSyntax::Decorator,
            )],
            &cluster_surface(),
        )
        .expect("source-only clustered work should validate");

        assert_eq!(metadata.len(), 1);
        assert_eq!(metadata[0].manifest_target, "Work.handle_submit");
        assert_eq!(metadata[0].runtime_registration_name, "Work.handle_submit");
        assert_eq!(
            metadata[0].replication_count,
            ClusteredReplicationCount::explicit(3)
        );
        match &metadata[0].origin {
            ClusteredDeclarationOrigin::Source(provenance) => {
                assert_eq!(provenance.file, PathBuf::from("work.mpl"));
                assert_eq!(provenance.span, Span::new(0, 8));
                assert_eq!(
                    provenance.syntax,
                    SourceClusteredDeclarationSyntax::Decorator
                );
            }
            origin => panic!("expected source origin, got {origin:?}"),
        }
    }

    #[test]
    fn m047_s01_cluster_validation_rejects_manifest_source_duplicate_with_provenance() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::Work,
                target: "Work.handle_submit".to_string(),
            }],
        };

        let issues = validate_cluster_declarations_with_source(
            Some(&cluster),
            &[source_work_declaration(
                "Work.handle_submit",
                ClusteredReplicationCount::defaulted(),
                SourceClusteredDeclarationSyntax::Decorator,
            )],
            &cluster_surface(),
        )
        .expect_err("manifest/source duplicate should fail");

        assert_eq!(issues.len(), 1);
        assert_eq!(
            issues[0].replication_count,
            ClusteredReplicationCount::defaulted()
        );
        assert!(issues[0].reason.contains("mesh.toml"), "{}", issues[0]);
        match &issues[0].origin {
            ClusteredDeclarationOrigin::Source(provenance) => {
                assert_eq!(provenance.file, PathBuf::from("work.mpl"));
                assert_eq!(
                    provenance.syntax,
                    SourceClusteredDeclarationSyntax::Decorator
                );
            }
            origin => panic!("expected source origin, got {origin:?}"),
        }
    }

    #[test]
    fn m047_s01_cluster_validation_rejects_ambiguous_source_work() {
        let mut surface = cluster_surface();
        surface
            .ambiguous_work_functions
            .insert("Work.handle_submit".to_string());
        surface.work_functions.remove("Work.handle_submit");

        let issues = validate_cluster_declarations_with_source(
            None,
            &[source_work_declaration(
                "Work.handle_submit",
                ClusteredReplicationCount::defaulted(),
                SourceClusteredDeclarationSyntax::Decorator,
            )],
            &surface,
        )
        .expect_err("ambiguous source declaration should fail");

        assert_eq!(issues.len(), 1);
        assert_eq!(
            issues[0].replication_count,
            ClusteredReplicationCount::defaulted()
        );
        assert!(
            issues[0]
                .reason
                .contains("overloaded clustered work entrypoints"),
            "{}",
            issues[0]
        );
        assert!(matches!(
            issues[0].origin,
            ClusteredDeclarationOrigin::Source(_)
        ));
    }

    #[test]
    fn m047_s01_cluster_validation_rejects_private_source_work_with_count_context() {
        let issues = validate_cluster_declarations_with_source(
            None,
            &[source_work_declaration(
                "Work.hidden_submit",
                ClusteredReplicationCount::defaulted(),
                SourceClusteredDeclarationSyntax::Decorator,
            )],
            &cluster_surface(),
        )
        .expect_err("private source declaration should fail");

        assert_eq!(issues.len(), 1);
        assert_eq!(
            issues[0].replication_count,
            ClusteredReplicationCount::defaulted()
        );
        assert!(
            issues[0].reason.contains("private function"),
            "{}",
            issues[0]
        );
        assert!(matches!(
            issues[0].origin,
            ClusteredDeclarationOrigin::Source(_)
        ));
    }

    #[test]
    fn m047_s01_shared_export_surface_captures_work_and_service_handlers() {
        let mut graph = ModuleGraph::new();
        graph.add_module("Work".to_string(), "work.mpl".into(), false);
        graph.add_module("Services".to_string(), "services.mpl".into(), false);

        let parses = vec![
            mesh_parser::parse(
                "pub fn handle_submit(payload :: String) -> String do\n  payload\nend\n\npub fn handle_submit(payload :: String, retries :: Int) -> String do\n  payload\nend\n\nfn hidden_submit(payload :: String) -> String do\n  payload\nend\n",
            ),
            mesh_parser::parse(""),
        ];

        let mut service_exports = ExportedSymbols::default();
        service_exports.service_defs.insert(
            "Jobs".to_string(),
            ServiceExportInfo {
                name: "Jobs".to_string(),
                helpers: Default::default(),
                methods: vec![],
                method_exports: vec![
                    ServiceMethodExport {
                        method_name: "start".to_string(),
                        generated_name: "__service_jobs_start".to_string(),
                        kind: ServiceMethodExportKind::Start,
                    },
                    ServiceMethodExport {
                        method_name: "submit".to_string(),
                        generated_name: "__service_jobs_call_submit".to_string(),
                        kind: ServiceMethodExportKind::Call,
                    },
                    ServiceMethodExport {
                        method_name: "reset".to_string(),
                        generated_name: "__service_jobs_cast_reset".to_string(),
                        kind: ServiceMethodExportKind::Cast,
                    },
                ],
            },
        );
        let all_exports = vec![Some(ExportedSymbols::default()), Some(service_exports)];

        let surface = build_clustered_export_surface(&graph, &parses, &all_exports);

        assert!(surface
            .ambiguous_work_functions
            .contains("Work.handle_submit"));
        assert!(surface
            .private_work_functions
            .contains("Work.hidden_submit"));
        assert_eq!(
            surface.service_call_handlers["Services.Jobs.submit"].executable_symbol,
            Some("__service_jobs_call_submit".to_string())
        );
        assert_eq!(
            surface.service_cast_handlers["Services.Jobs.reset"].runtime_registration_name,
            "Services.Jobs.reset"
        );
        assert!(surface
            .service_start_helpers
            .contains("Services.Jobs.start"));
    }

    #[test]
    fn m047_s01_manifest_validation_rejects_malformed_target_with_default_count_context() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::Work,
                target: "handle_submit".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &cluster_surface())
            .expect_err("bad work target shape should fail");

        assert_eq!(err.len(), 1);
        assert_eq!(err[0].origin, ClusteredDeclarationOrigin::Manifest);
        assert_eq!(
            err[0].replication_count,
            ClusteredReplicationCount::defaulted()
        );
        assert!(
            err[0].reason.contains("<ModulePath>.<function>"),
            "{}",
            err[0]
        );
    }

    #[test]
    fn parse_full_manifest() {
        let toml = r#"
[package]
name = "my-project"
version = "0.1.0"
description = "A test project"
authors = ["Alice", "Bob"]

[dependencies]
json-lib = { git = "https://github.com/example/json-lib.git", tag = "v1.0" }
math-utils = { git = "https://github.com/example/math-utils.git", branch = "main" }
local-dep = { path = "../local-dep" }
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        assert_eq!(manifest.package.name, "my-project");
        assert_eq!(manifest.package.version, "0.1.0");
        assert_eq!(
            manifest.package.description.as_deref(),
            Some("A test project")
        );
        assert_eq!(manifest.package.authors, vec!["Alice", "Bob"]);
        assert_eq!(manifest.dependencies.len(), 3);

        // BTreeMap is sorted by key
        let keys: Vec<&String> = manifest.dependencies.keys().collect();
        assert_eq!(keys, vec!["json-lib", "local-dep", "math-utils"]);

        match &manifest.dependencies["json-lib"] {
            Dependency::Git { git, tag, .. } => {
                assert_eq!(git, "https://github.com/example/json-lib.git");
                assert_eq!(tag.as_deref(), Some("v1.0"));
            }
            _ => panic!("Expected git dependency"),
        }

        match &manifest.dependencies["local-dep"] {
            Dependency::Path { path } => {
                assert_eq!(path, "../local-dep");
            }
            _ => panic!("Expected path dependency"),
        }

        match &manifest.dependencies["math-utils"] {
            Dependency::Git { git, branch, .. } => {
                assert_eq!(git, "https://github.com/example/math-utils.git");
                assert_eq!(branch.as_deref(), Some("main"));
            }
            _ => panic!("Expected git dependency"),
        }
    }

    #[test]
    fn parse_minimal_manifest() {
        let toml = r#"
[package]
name = "minimal"
version = "0.0.1"
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        assert_eq!(manifest.package.name, "minimal");
        assert_eq!(manifest.package.version, "0.0.1");
        assert!(manifest.package.description.is_none());
        assert!(manifest.package.authors.is_empty());
        assert!(manifest.package.entrypoint.is_none());
        assert!(manifest.dependencies.is_empty());
        assert!(manifest.cluster.is_none());
    }

    #[test]
    fn parse_manifest_entrypoint_override() {
        let toml = r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "lib/start.mpl"
"#;

        let manifest = Manifest::from_str(toml).unwrap();

        assert_eq!(
            manifest.package.entrypoint,
            Some(PathBuf::from("lib/start.mpl"))
        );
    }

    #[test]
    fn reject_blank_entrypoint() {
        let toml = r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "   "
"#;

        let err = Manifest::from_str(toml).unwrap_err();
        assert!(err.contains("must not be blank"), "unexpected error: {err}");
    }

    #[test]
    fn reject_absolute_entrypoint() {
        let toml = r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "/tmp/start.mpl"
"#;

        let err = Manifest::from_str(toml).unwrap_err();
        assert!(
            err.contains("project-root-relative"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn reject_escaping_entrypoint() {
        let toml = r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "../escape.mpl"
"#;

        let err = Manifest::from_str(toml).unwrap_err();
        assert!(
            err.contains("stay within the project root"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn reject_non_mpl_entrypoint() {
        let toml = r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "lib/start.txt"
"#;

        let err = Manifest::from_str(toml).unwrap_err();
        assert!(
            err.contains("must end with `.mpl`"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn resolve_entrypoint_defaults_to_root_main() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("main.mpl"), "fn main() do\n  0\nend\n").unwrap();

        let entrypoint = resolve_entrypoint(temp.path(), None).unwrap();

        assert_eq!(entrypoint, PathBuf::from(DEFAULT_ENTRYPOINT));
    }

    #[test]
    fn resolve_entrypoint_prefers_manifest_override_when_both_entry_files_exist() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir_all(temp.path().join("lib")).unwrap();
        fs::write(temp.path().join("main.mpl"), "fn main() do\n  0\nend\n").unwrap();
        fs::write(
            temp.path().join("lib/start.mpl"),
            "fn main() do\n  1\nend\n",
        )
        .unwrap();
        let manifest = Manifest::from_str(
            r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "lib/start.mpl"
"#,
        )
        .unwrap();

        let entrypoint = resolve_entrypoint(temp.path(), Some(&manifest)).unwrap();

        assert_eq!(entrypoint, PathBuf::from("lib/start.mpl"));
    }

    #[test]
    fn resolve_entrypoint_rejects_missing_configured_file() {
        let temp = tempfile::tempdir().unwrap();
        let manifest = Manifest::from_str(
            r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "lib/start.mpl"
"#,
        )
        .unwrap();

        let err = resolve_entrypoint(temp.path(), Some(&manifest)).unwrap_err();

        assert!(err.contains("lib/start.mpl"), "unexpected error: {err}");
    }

    #[test]
    fn rewrite_manifest_entrypoint_source_preserves_dependencies_and_overrides_entrypoint() {
        let rewritten = rewrite_manifest_entrypoint_source(
            r#"
[package]
name = "custom-entry"
version = "0.1.0"
entrypoint = "lib/start.mpl"

[dependencies]
shared = { path = "../shared" }
"#,
            Path::new(DEFAULT_ENTRYPOINT),
        )
        .expect("manifest rewrite should succeed");

        let manifest = Manifest::from_str(&rewritten).expect("rewritten manifest should parse");

        assert_eq!(
            manifest.package.entrypoint,
            Some(PathBuf::from(DEFAULT_ENTRYPOINT))
        );
        assert!(manifest.dependencies.contains_key("shared"));
    }

    #[test]
    fn reject_missing_package_section() {
        let toml = r#"
[dependencies]
foo = { path = "./foo" }
"#;
        let result = Manifest::from_str(toml);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Failed to parse manifest"), "Error: {}", err);
    }

    #[test]
    fn reject_missing_name() {
        let toml = r#"
[package]
version = "1.0.0"
"#;
        let result = Manifest::from_str(toml);
        assert!(result.is_err());
    }

    #[test]
    fn reject_missing_version() {
        let toml = r#"
[package]
name = "no-version"
"#;
        let result = Manifest::from_str(toml);
        assert!(result.is_err());
    }

    #[test]
    fn parse_git_dep_with_rev() {
        let toml = r#"
[package]
name = "rev-test"
version = "1.0.0"

[dependencies]
pinned = { git = "https://example.com/pinned.git", rev = "abc123" }
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        match &manifest.dependencies["pinned"] {
            Dependency::Git { git, rev, .. } => {
                assert_eq!(git, "https://example.com/pinned.git");
                assert_eq!(rev.as_deref(), Some("abc123"));
            }
            _ => panic!("Expected git dependency"),
        }
    }

    #[test]
    fn parse_git_dep_bare() {
        let toml = r#"
[package]
name = "bare-git"
version = "1.0.0"

[dependencies]
lib = { git = "https://example.com/lib.git" }
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        match &manifest.dependencies["lib"] {
            Dependency::Git {
                git,
                rev,
                branch,
                tag,
            } => {
                assert_eq!(git, "https://example.com/lib.git");
                assert!(rev.is_none());
                assert!(branch.is_none());
                assert!(tag.is_none());
            }
            _ => panic!("Expected git dependency"),
        }
    }

    #[test]
    fn parse_registry_shorthand() {
        let toml = r#"
[package]
name = "uses-registry"
version = "0.1.0"

[dependencies]
foo = "1.0.0"
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        match &manifest.dependencies["foo"] {
            Dependency::RegistryShorthand(v) => {
                assert_eq!(v, "1.0.0");
            }
            other => panic!("Expected RegistryShorthand, got: {:?}", other),
        }
        assert!(manifest.dependencies["foo"].is_registry());
        assert_eq!(
            manifest.dependencies["foo"].registry_version(),
            Some("1.0.0")
        );
    }

    #[test]
    fn parse_registry_table_form() {
        let toml = r#"
[package]
name = "uses-registry-table"
version = "0.1.0"

[dependencies]
foo = { version = "1.0.0" }
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        match &manifest.dependencies["foo"] {
            Dependency::Registry { version } => {
                assert_eq!(version, "1.0.0");
            }
            other => panic!("Expected Registry, got: {:?}", other),
        }
        assert!(manifest.dependencies["foo"].is_registry());
        assert_eq!(
            manifest.dependencies["foo"].registry_version(),
            Some("1.0.0")
        );
    }

    #[test]
    fn parse_mixed_dependency_types() {
        let toml = r#"
[package]
name = "mixed-deps"
version = "1.0.0"

[dependencies]
registry-short = "2.3.4"
registry-table = { version = "1.0.0" }
git-dep = { git = "https://github.com/example/lib.git", tag = "v1.0" }
path-dep = { path = "../path-dep" }
"#;
        let manifest = Manifest::from_str(toml).unwrap();
        assert_eq!(manifest.dependencies.len(), 4);

        match &manifest.dependencies["registry-short"] {
            Dependency::RegistryShorthand(v) => assert_eq!(v, "2.3.4"),
            other => panic!("Expected RegistryShorthand, got: {:?}", other),
        }

        match &manifest.dependencies["registry-table"] {
            Dependency::Registry { version } => assert_eq!(version, "1.0.0"),
            other => panic!("Expected Registry, got: {:?}", other),
        }

        match &manifest.dependencies["git-dep"] {
            Dependency::Git { git, tag, .. } => {
                assert_eq!(git, "https://github.com/example/lib.git");
                assert_eq!(tag.as_deref(), Some("v1.0"));
            }
            other => panic!("Expected Git, got: {:?}", other),
        }

        match &manifest.dependencies["path-dep"] {
            Dependency::Path { path } => assert_eq!(path, "../path-dep"),
            other => panic!("Expected Path, got: {:?}", other),
        }
    }

    #[test]
    fn parse_license_field() {
        let toml_with_license = r#"
[package]
name = "licensed"
version = "1.0.0"
license = "MIT"
"#;
        let manifest = Manifest::from_str(toml_with_license).unwrap();
        assert_eq!(manifest.package.license.as_deref(), Some("MIT"));

        let toml_no_license = r#"
[package]
name = "unlicensed"
version = "1.0.0"
"#;
        let manifest = Manifest::from_str(toml_no_license).unwrap();
        assert!(manifest.package.license.is_none());
    }

    #[test]
    fn m047_s04_manifest_rejects_legacy_cluster_section_with_migration_guidance() {
        let cases = [
            r#"
[package]
name = "clustered"
version = "1.0.0"

[cluster]
enabled = true
declarations = [
  { kind = "service_call", target = "Services.Jobs.submit" },
  { kind = "service_cast", target = "Services.Jobs.reset" },
  { kind = "work", target = "Work.handle_submit" },
]
"#,
            r#"
[package]
name = "clustered"
version = "1.0.0"

[cluster]
enabled = false
declarations = [{ kind = "work", target = "Work.handle_submit" }]
"#,
            r#"
[package]
name = "clustered"
version = "1.0.0"

[cluster]
enabled = true
declarations = []
"#,
            r#"
[package]
name = "clustered"
version = "1.0.0"

[cluster]
enabled = true
declarations = [{ kind = "service", target = "Services.Jobs.submit" }]
"#,
        ];

        for toml in cases {
            let err = Manifest::from_str(toml).unwrap_err();
            assert!(
                err.contains("`[cluster]` manifest sections are no longer supported")
                    && err.contains("`@cluster`")
                    && err.contains("`@cluster(N)`"),
                "unexpected error: {err}"
            );
        }
    }

    #[test]
    fn m047_s04_manifest_without_legacy_cluster_section_still_parses() {
        let toml = r#"
[package]
name = "clustered"
version = "1.0.0"

[dependencies]
foo = { path = "../foo" }
"#;

        let manifest = Manifest::from_str(toml).unwrap();
        assert_eq!(manifest.package.name, "clustered");
        assert!(manifest.cluster.is_none());
    }

    #[test]
    fn m044_s01_clustered_manifest_validates_declared_targets_against_shared_surface() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![
                ClusteredDeclaration {
                    kind: ClusteredDeclarationKind::ServiceCall,
                    target: "Services.Jobs.submit".to_string(),
                },
                ClusteredDeclaration {
                    kind: ClusteredDeclarationKind::ServiceCast,
                    target: "Services.Jobs.reset".to_string(),
                },
                ClusteredDeclaration {
                    kind: ClusteredDeclarationKind::Work,
                    target: "Work.handle_submit".to_string(),
                },
            ],
        };

        let metadata = validate_cluster_declarations(&cluster, &cluster_surface())
            .expect("valid declarations should produce execution metadata");
        assert_eq!(
            metadata,
            vec![
                ClusteredExecutionMetadata {
                    kind: ClusteredDeclarationKind::ServiceCall,
                    manifest_target: "Services.Jobs.submit".to_string(),
                    runtime_registration_name: "Services.Jobs.submit".to_string(),
                    executable_symbol: "__service_jobs_call_submit".to_string(),
                    replication_count: ClusteredReplicationCount::defaulted(),
                    origin: ClusteredDeclarationOrigin::Manifest,
                },
                ClusteredExecutionMetadata {
                    kind: ClusteredDeclarationKind::ServiceCast,
                    manifest_target: "Services.Jobs.reset".to_string(),
                    runtime_registration_name: "Services.Jobs.reset".to_string(),
                    executable_symbol: "__service_jobs_cast_reset".to_string(),
                    replication_count: ClusteredReplicationCount::defaulted(),
                    origin: ClusteredDeclarationOrigin::Manifest,
                },
                ClusteredExecutionMetadata {
                    kind: ClusteredDeclarationKind::Work,
                    manifest_target: "Work.handle_submit".to_string(),
                    runtime_registration_name: "Work.handle_submit".to_string(),
                    executable_symbol: "handle_submit".to_string(),
                    replication_count: ClusteredReplicationCount::defaulted(),
                    origin: ClusteredDeclarationOrigin::Manifest,
                },
            ]
        );
    }

    #[test]
    fn m044_s02_clustered_manifest_rejects_missing_executable_symbol() {
        let mut surface = cluster_surface();
        surface.service_call_handlers.insert(
            "Services.Jobs.submit".to_string(),
            ClusteredExecutableSurfaceInfo {
                runtime_registration_name: "Services.Jobs.submit".to_string(),
                executable_symbol: None,
            },
        );

        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::ServiceCall,
                target: "Services.Jobs.submit".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &surface)
            .expect_err("missing executable symbol should fail");
        assert_eq!(err.len(), 1);
        assert!(
            err[0]
                .reason
                .contains("runtime-executable symbol or wrapper"),
            "{}",
            err[0]
        );
    }

    #[test]
    fn m044_s01_clustered_manifest_rejects_ambiguous_work_target() {
        let mut surface = cluster_surface();
        surface
            .ambiguous_work_functions
            .insert("Work.handle_submit".to_string());
        surface.work_functions.remove("Work.handle_submit");

        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::Work,
                target: "Work.handle_submit".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &surface)
            .expect_err("ambiguous work target should fail");
        assert_eq!(err.len(), 1);
        assert!(
            err[0]
                .reason
                .contains("overloaded clustered work entrypoints"),
            "{}",
            err[0]
        );
    }

    #[test]
    fn m044_s01_clustered_manifest_rejects_private_work_target() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::Work,
                target: "Work.hidden_submit".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &cluster_surface())
            .expect_err("private work target should fail");
        assert_eq!(err.len(), 1);
        assert!(err[0].reason.contains("private function"), "{}", err[0]);
    }

    #[test]
    fn m044_s01_clustered_manifest_rejects_service_kind_mismatch() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::ServiceCall,
                target: "Services.Jobs.reset".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &cluster_surface())
            .expect_err("service kind mismatch should fail");
        assert_eq!(err.len(), 1);
        assert!(err[0].reason.contains("service cast handler"), "{}", err[0]);
    }

    #[test]
    fn m044_s01_clustered_manifest_rejects_bad_work_target_shape() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::Work,
                target: "handle_submit".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &cluster_surface())
            .expect_err("bad work target shape should fail");
        assert_eq!(err.len(), 1);
        assert!(
            err[0].reason.contains("<ModulePath>.<function>"),
            "{}",
            err[0]
        );
    }

    #[test]
    fn m044_s01_clustered_manifest_rejects_service_start_helper_target() {
        let cluster = ClusterConfig {
            enabled: true,
            declarations: vec![ClusteredDeclaration {
                kind: ClusteredDeclarationKind::ServiceCall,
                target: "Services.Jobs.start".to_string(),
            }],
        };

        let err = validate_cluster_declarations(&cluster, &cluster_surface())
            .expect_err("service start helper should fail");
        assert_eq!(err.len(), 1);
        assert!(err[0].reason.contains("service start helper"), "{}", err[0]);
    }
}
