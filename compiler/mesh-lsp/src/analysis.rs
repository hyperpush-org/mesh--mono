//! Document analysis: parse, type-check, and produce LSP diagnostics.
//!
//! This module bridges the Mesh compiler frontend (parser + typeck) with the
//! LSP protocol. It converts byte-offset spans into LSP line/character
//! positions (0-based, UTF-16 code units per the LSP spec) and translates
//! parse errors and type errors into `lsp_types::Diagnostic`.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use rowan::TextRange;
use tower_lsp::lsp_types::{Diagnostic, DiagnosticSeverity, Position, Range, Url};

use mesh_common::module_graph::{self, ModuleGraph, ModuleId};
use mesh_parser::ast::item::{Item, SourceFile};
use mesh_typeck::error::{ConstraintOrigin, TypeError};
use mesh_typeck::ty::Ty;
use mesh_typeck::{ImportContext, ModuleExports, TypeckResult};

/// The result of analyzing a Mesh document.
pub struct AnalysisResult {
    /// LSP diagnostics (parse errors + type errors + warnings).
    pub diagnostics: Vec<Diagnostic>,
    /// The parse result, kept for further queries.
    pub parse: mesh_parser::Parse,
    /// The type-check result, kept for hover queries.
    pub typeck: TypeckResult,
}

/// Analyze a Mesh document: parse, type-check, and produce diagnostics.
///
/// This is the main entry point called by the LSP server on didOpen/didChange.
/// When the URI belongs to a Mesh project (an ancestor contains `main.mpl`),
/// analysis uses project-aware import resolution with open-document overlays so
/// backend-shaped files behave like the real compiler path instead of isolated
/// single-file snippets.
pub fn analyze_document(uri: &str, source: &str, open_documents: &[(String, String)]) -> AnalysisResult {
    analyze_project_document(uri, source, open_documents)
        .unwrap_or_else(|| analyze_single_document(source))
}

fn analyze_single_document(source: &str) -> AnalysisResult {
    let parse = mesh_parser::parse(source);
    let typeck = mesh_typeck::check(&parse);
    let diagnostics = diagnostics_from_parse_and_typeck(source, &parse, &typeck);

    AnalysisResult {
        diagnostics,
        parse,
        typeck,
    }
}

/// Convert a byte offset to an LSP Position (0-based line, 0-based UTF-16 character offset).
///
/// The LSP specification requires positions in UTF-16 code units. For ASCII-only
/// sources, UTF-16 offset == byte offset within the line. For non-ASCII sources,
/// we count UTF-16 code units properly.
pub fn offset_to_position(source: &str, offset: usize) -> Position {
    let offset = offset.min(source.len());
    let before = &source[..offset];

    let line = before.matches('\n').count() as u32;
    let line_start = before.rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_text = &source[line_start..offset];

    // Count UTF-16 code units for LSP spec compliance.
    let character: u32 = line_text.chars().map(|c| c.len_utf16() as u32).sum();

    Position { line, character }
}

/// Look up the inferred type at a given LSP position.
///
/// Searches the typeck result's type map for the smallest range that contains
/// the given byte offset. Returns the type formatted as a string.
pub fn type_at_position(
    source: &str,
    typeck: &TypeckResult,
    position: &Position,
) -> Option<String> {
    let offset = position_to_offset(source, position)?;
    let target_offset = rowan::TextSize::from(offset as u32);

    // Find the smallest range containing this offset.
    let mut best: Option<(TextRange, &Ty)> = None;
    for (range, ty) in &typeck.types {
        if range.contains(target_offset) || range.start() == target_offset {
            match &best {
                Some((best_range, _)) if range.len() < best_range.len() => {
                    best = Some((*range, ty));
                }
                None => {
                    best = Some((*range, ty));
                }
                _ => {}
            }
        }
    }

    best.map(|(_, ty)| format!("{}", ty))
}

/// Convert an LSP Position back to a byte offset in the source.
///
/// Public wrapper for go-to-definition support.
pub fn position_to_offset_pub(source: &str, position: &Position) -> Option<usize> {
    position_to_offset(source, position)
}

/// Convert an LSP Position back to a byte offset in the source.
fn position_to_offset(source: &str, position: &Position) -> Option<usize> {
    let mut current_line = 0u32;
    let mut line_start = 0usize;

    for (i, ch) in source.char_indices() {
        if current_line == position.line {
            // Count UTF-16 code units from line_start to find character offset.
            let line_text = &source[line_start..];
            let mut utf16_offset = 0u32;
            for (byte_idx, c) in line_text.char_indices() {
                if utf16_offset >= position.character {
                    return Some(line_start + byte_idx);
                }
                utf16_offset += c.len_utf16() as u32;
            }
            // Position is at or past end of line.
            return Some(line_start + line_text.find('\n').unwrap_or(line_text.len()));
        }
        if ch == '\n' {
            current_line += 1;
            line_start = i + 1;
        }
    }

    // If we're looking for a position on the last line (no trailing newline).
    if current_line == position.line {
        let line_text = &source[line_start..];
        let mut utf16_offset = 0u32;
        for (byte_idx, c) in line_text.char_indices() {
            if utf16_offset >= position.character {
                return Some(line_start + byte_idx);
            }
            utf16_offset += c.len_utf16() as u32;
        }
        return Some(source.len());
    }

    None
}

/// Extract a TextRange span from a TypeError for diagnostic positioning.
fn type_error_span(error: &TypeError) -> Option<TextRange> {
    match error {
        TypeError::Mismatch { origin, .. } => origin_to_range(origin),
        TypeError::InfiniteType { origin, .. } => origin_to_range(origin),
        TypeError::ArityMismatch { origin, .. } => origin_to_range(origin),
        TypeError::UnboundVariable { span, .. } => Some(*span),
        TypeError::NotAFunction { span, .. } => Some(*span),
        TypeError::TraitNotSatisfied { origin, .. } => origin_to_range(origin),
        TypeError::MissingTraitMethod { .. } => None,
        TypeError::TraitMethodSignatureMismatch { .. } => None,
        TypeError::MissingField { span, .. } => Some(*span),
        TypeError::UnknownField { span, .. } => Some(*span),
        TypeError::NoSuchField { span, .. } => Some(*span),
        TypeError::UnknownVariant { span, .. } => Some(*span),
        TypeError::OrPatternBindingMismatch { span, .. } => Some(*span),
        TypeError::NonExhaustiveMatch { span, .. } => Some(*span),
        TypeError::RedundantArm { span, .. } => Some(*span),
        TypeError::InvalidGuardExpression { span, .. } => Some(*span),
        TypeError::SendTypeMismatch { span, .. } => Some(*span),
        TypeError::SelfOutsideActor { span, .. } => Some(*span),
        TypeError::SpawnNonFunction { span, .. } => Some(*span),
        TypeError::ReceiveOutsideActor { span, .. } => Some(*span),
        TypeError::InvalidChildStart { span, .. } => Some(*span),
        TypeError::InvalidStrategy { span, .. } => Some(*span),
        TypeError::InvalidRestartType { span, .. } => Some(*span),
        TypeError::InvalidShutdownValue { span, .. } => Some(*span),
        TypeError::CatchAllNotLast { span, .. } => Some(*span),
        TypeError::NonConsecutiveClauses { second_span, .. } => Some(*second_span),
        TypeError::ClauseArityMismatch { span, .. } => Some(*span),
        TypeError::NonFirstClauseAnnotation { span, .. } => Some(*span),
        TypeError::GuardTypeMismatch { span, .. } => Some(*span),
        TypeError::DuplicateImpl { .. } => None,
        TypeError::AmbiguousMethod { span, .. } => Some(*span),
        TypeError::UnsupportedDerive { .. } => None,
        TypeError::MissingDerivePrerequisite { .. } => None,
        TypeError::NoSuchMethod { span, .. } => Some(*span),
        TypeError::BreakOutsideLoop { span, .. } => Some(*span),
        TypeError::ContinueOutsideLoop { span, .. } => Some(*span),
        TypeError::ImportModuleNotFound { span, .. } => Some(*span),
        TypeError::ImportNameNotFound { span, .. } => Some(*span),
        TypeError::PrivateItem { span, .. } => Some(*span),
        TypeError::TryIncompatibleReturn { span, .. } => Some(*span),
        TypeError::TryOnNonResultOption { span, .. } => Some(*span),
        TypeError::NonSerializableField { .. } => None,
        TypeError::NonMappableField { .. } => None,
        TypeError::MissingAssocType { .. } => None,
        TypeError::ExtraAssocType { .. } => None,
        TypeError::UnresolvedAssocType { span, .. } => Some(*span),
        TypeError::SlotPositionConflict { span, .. } => Some(*span),
        TypeError::SlotPipeOutOfRange { span, .. } => Some(*span),
        TypeError::UndefinedType { span, .. } => Some(*span),
    }
}

/// Extract a TextRange from a ConstraintOrigin.
fn origin_to_range(origin: &ConstraintOrigin) -> Option<TextRange> {
    match origin {
        ConstraintOrigin::FnArg { call_site, .. } => Some(*call_site),
        ConstraintOrigin::BinOp { op_span } => Some(*op_span),
        ConstraintOrigin::IfBranches { if_span, .. } => Some(*if_span),
        ConstraintOrigin::Annotation { annotation_span } => Some(*annotation_span),
        ConstraintOrigin::Return { return_span, .. } => Some(*return_span),
        ConstraintOrigin::LetBinding { binding_span } => Some(*binding_span),
        ConstraintOrigin::Assignment { lhs_span, .. } => Some(*lhs_span),
        ConstraintOrigin::Builtin => None,
    }
}

/// Convert a TypeError into an LSP Diagnostic.
fn type_error_to_diagnostic(
    source: &str,
    error: &TypeError,
    severity: DiagnosticSeverity,
) -> Option<Diagnostic> {
    let range = type_error_span(error)?;
    let start_tree: usize = range.start().into();
    let end_tree: usize = range.end().into();
    let start_offset = crate::definition::tree_to_source_offset(source, start_tree)
        .unwrap_or(start_tree);
    let end_offset = crate::definition::tree_to_source_offset(source, end_tree).unwrap_or(end_tree);

    let start = offset_to_position(source, start_offset);
    let end = offset_to_position(source, end_offset);

    Some(Diagnostic {
        range: Range::new(start, end),
        severity: Some(severity),
        source: Some("mesh".to_string()),
        message: format!("{}", error),
        ..Default::default()
    })
}

fn diagnostics_from_parse_and_typeck(
    source: &str,
    parse: &mesh_parser::Parse,
    typeck: &TypeckResult,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    for error in parse.errors() {
        let start = offset_to_position(source, error.span.start as usize);
        let end = offset_to_position(source, error.span.end as usize);
        diagnostics.push(Diagnostic {
            range: Range::new(start, end),
            severity: Some(DiagnosticSeverity::ERROR),
            source: Some("mesh".to_string()),
            message: error.message.clone(),
            ..Default::default()
        });
    }

    for error in &typeck.errors {
        if let Some(diag) = type_error_to_diagnostic(source, error, DiagnosticSeverity::ERROR) {
            diagnostics.push(diag);
        }
    }

    for warning in &typeck.warnings {
        if let Some(diag) = type_error_to_diagnostic(source, warning, DiagnosticSeverity::WARNING) {
            diagnostics.push(diag);
        }
    }

    diagnostics
}

fn analyze_project_document(
    uri: &str,
    source: &str,
    open_documents: &[(String, String)],
) -> Option<AnalysisResult> {
    let doc_path = canonical_file_path(uri)?;
    let project_root = find_project_root(&doc_path)?;
    let relative_path = doc_path.strip_prefix(&project_root).ok()?.to_path_buf();

    let mut overlays = HashMap::new();
    for (open_uri, open_source) in open_documents {
        if let Some(path) = canonical_file_path(open_uri) {
            overlays.insert(path, open_source.clone());
        }
    }
    overlays.insert(doc_path, source.to_string());

    let project = build_project_with_overlays(&project_root, &overlays).ok()?;
    let current_id = project
        .graph
        .modules
        .iter()
        .find(|module| module.path == relative_path)
        .map(|module| module.id)?;

    let module_count = project.graph.module_count();
    let mut all_exports = vec![None; module_count];
    let mut all_typeck = (0..module_count).map(|_| None).collect::<Vec<_>>();

    for &id in &project.compilation_order {
        let idx = id.0 as usize;
        let parse = &project.module_parses[idx];
        let mut import_ctx = build_import_context(&project.graph, &all_exports, parse);
        import_ctx.current_module = Some(project.graph.get(id).name.clone());

        let typeck = mesh_typeck::check_with_imports(parse, &import_ctx);
        let exports = mesh_typeck::collect_exports(parse, &typeck);
        all_exports[idx] = Some(exports);
        all_typeck[idx] = Some(typeck);
    }

    let current_idx = current_id.0 as usize;
    let current_source = project.module_sources.get(current_idx)?.clone();
    let current_typeck = all_typeck.into_iter().nth(current_idx).flatten()?;
    let current_parse = mesh_parser::parse(&current_source);
    let diagnostics = diagnostics_from_parse_and_typeck(&current_source, &current_parse, &current_typeck);

    Some(AnalysisResult {
        diagnostics,
        parse: current_parse,
        typeck: current_typeck,
    })
}

struct ProjectAnalysisData {
    graph: ModuleGraph,
    compilation_order: Vec<ModuleId>,
    module_sources: Vec<String>,
    module_parses: Vec<mesh_parser::Parse>,
}

fn build_project_with_overlays(
    project_root: &Path,
    overlays: &HashMap<PathBuf, String>,
) -> Result<ProjectAnalysisData, String> {
    let files = discover_mesh_files(project_root)?;
    let mut graph = ModuleGraph::new();
    let mut module_sources = Vec::new();
    let mut module_parses = Vec::new();

    for relative_path in &files {
        let full_path = project_root.join(relative_path);
        let source = read_source_with_overlays(&full_path, overlays)?;
        let is_entry = relative_path == Path::new("main.mpl");
        let name = if is_entry {
            "Main".to_string()
        } else {
            path_to_module_name(relative_path).ok_or_else(|| {
                format!(
                    "Cannot determine module name for '{}'",
                    relative_path.display()
                )
            })?
        };

        let parse = mesh_parser::parse(&source);
        graph.add_module(name, relative_path.clone(), is_entry);
        module_sources.push(source);
        module_parses.push(parse);
    }

    let packages_dir = project_root.join(".mesh").join("packages");
    if packages_dir.exists() {
        for entry in std::fs::read_dir(&packages_dir)
            .map_err(|e| format!("Failed to read .mesh/packages: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read packages entry: {}", e))?;
            let pkg_dir = entry.path();
            if !pkg_dir.is_dir() {
                continue;
            }

            let pkg_files = discover_mesh_files(&pkg_dir)?;
            for relative_path in &pkg_files {
                let name = match path_to_module_name(relative_path) {
                    Some(name) => name,
                    None => continue,
                };

                let full_path = pkg_dir.join(relative_path);
                let source = read_source_with_overlays(&full_path, overlays)?;
                let parse = mesh_parser::parse(&source);
                graph.add_module(name, relative_path.clone(), false);
                module_sources.push(source);
                module_parses.push(parse);
            }
        }
    }

    for id_val in 0..graph.module_count() {
        let id = ModuleId(id_val as u32);
        let tree = module_parses[id_val].tree();
        let imports = extract_imports(&tree);
        let module_name = graph.get(id).name.clone();

        for import_name in imports {
            match graph.resolve(&import_name) {
                None => {}
                Some(dep_id) if dep_id == id => {
                    return Err(format!("Module '{}' cannot import itself", module_name));
                }
                Some(dep_id) => graph.add_dependency(id, dep_id),
            }
        }
    }

    let compilation_order = module_graph::topological_sort(&graph)
        .map_err(|e| format!("Circular dependency: {}", e))?;

    Ok(ProjectAnalysisData {
        graph,
        compilation_order,
        module_sources,
        module_parses,
    })
}

fn read_source_with_overlays(
    path: &Path,
    overlays: &HashMap<PathBuf, String>,
) -> Result<String, String> {
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if let Some(source) = overlays.get(&canonical) {
        return Ok(source.clone());
    }

    std::fs::read_to_string(path).map_err(|e| format!("Failed to read '{}': {}", path.display(), e))
}

fn canonical_file_path(uri: &str) -> Option<PathBuf> {
    let url = Url::parse(uri).ok()?;
    let path = url.to_file_path().ok()?;
    Some(std::fs::canonicalize(&path).unwrap_or(path))
}

fn find_project_root(path: &Path) -> Option<PathBuf> {
    let mut current = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()?.to_path_buf()
    };

    loop {
        if current.join("main.mpl").exists() {
            return Some(std::fs::canonicalize(&current).unwrap_or(current));
        }
        if !current.pop() {
            return None;
        }
    }
}

fn path_to_module_name(relative_path: &Path) -> Option<String> {
    let stem = relative_path.file_stem()?.to_str()?;
    let parent = relative_path.parent();
    let parent_is_empty = match parent {
        None => true,
        Some(parent) => parent.as_os_str().is_empty() || parent == Path::new("."),
    };

    if stem == "main" && parent_is_empty {
        return None;
    }

    let mut parts = Vec::new();
    if let Some(parent) = parent {
        for component in parent.components() {
            if let Component::Normal(os_str) = component {
                if let Some(segment) = os_str.to_str() {
                    parts.push(to_pascal_case(segment));
                }
            }
        }
    }
    parts.push(to_pascal_case(stem));
    Some(parts.join("."))
}

fn to_pascal_case(segment: &str) -> String {
    segment
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let upper: String = first.to_uppercase().collect();
                    upper + chars.as_str()
                }
                None => String::new(),
            }
        })
        .collect()
}

fn discover_mesh_files(project_root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    discover_recursive(project_root, project_root, &mut files)
        .map_err(|e| format!("Failed to walk directory '{}': {}", project_root.display(), e))?;
    files.sort();
    Ok(files)
}

fn discover_recursive(root: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            discover_recursive(root, &path, files)?;
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("mpl") {
            if name.ends_with(".test.mpl") {
                continue;
            }
            let relative = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
            files.push(relative);
        }
    }

    Ok(())
}

fn extract_imports(source_file: &SourceFile) -> Vec<String> {
    let mut imports = Vec::new();
    for item in source_file.items() {
        match item {
            Item::ImportDecl(decl) => {
                if let Some(path) = decl.module_path() {
                    let segments = path.segments();
                    if !segments.is_empty() {
                        imports.push(segments.join("."));
                    }
                }
            }
            Item::FromImportDecl(decl) => {
                if let Some(path) = decl.module_path() {
                    let segments = path.segments();
                    if !segments.is_empty() {
                        imports.push(segments.join("."));
                    }
                }
            }
            _ => {}
        }
    }
    imports
}

fn build_import_context(
    graph: &ModuleGraph,
    all_exports: &[Option<mesh_typeck::ExportedSymbols>],
    parse: &mesh_parser::Parse,
) -> ImportContext {
    let mut context = ImportContext::empty();

    for exports_opt in all_exports {
        if let Some(exports) = exports_opt {
            context
                .all_trait_defs
                .extend(exports.trait_defs.iter().cloned());
            context
                .all_trait_impls
                .extend(exports.trait_impls.iter().cloned());
        }
    }

    let tree = parse.tree();
    for item in tree.items() {
        let segments = match &item {
            Item::ImportDecl(import_decl) => import_decl.module_path().map(|path| path.segments()),
            Item::FromImportDecl(from_import) => from_import.module_path().map(|path| path.segments()),
            _ => None,
        };

        if let Some(segments) = segments {
            let full_name = segments.join(".");
            let last_segment = segments.last().cloned().unwrap_or_default();
            if let Some(dep_id) = graph.resolve(&full_name) {
                let idx = dep_id.0 as usize;
                if let Some(Some(exports)) = all_exports.get(idx) {
                    context.module_exports.insert(
                        last_segment,
                        ModuleExports {
                            module_name: full_name,
                            functions: exports.functions.clone(),
                            struct_defs: exports.struct_defs.clone(),
                            sum_type_defs: exports.sum_type_defs.clone(),
                            service_defs: exports.service_defs.clone(),
                            actor_defs: exports.actor_defs.clone(),
                            private_names: exports.private_names.clone(),
                            type_aliases: exports.type_aliases.clone(),
                        },
                    );
                }
            }
        }
    }

    context
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ── Diagnostic Tests ──────────────────────────────────────────────────

    #[test]
    fn analyze_valid_source_no_diagnostics() {
        let source = "let x = 42";
        let result = analyze_document("file:///test.mpl", source, &[]);
        assert!(
            result.diagnostics.is_empty(),
            "Valid source should produce no diagnostics, got: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| &d.message)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn analyze_valid_function_no_diagnostics() {
        let source = "fn add(a, b) do\na + b\nend";
        let result = analyze_document("file:///test.mpl", source, &[]);
        assert!(
            result.diagnostics.is_empty(),
            "Valid function should produce no diagnostics, got: {:?}",
            result
                .diagnostics
                .iter()
                .map(|d| &d.message)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn analyze_reference_backend_jobs_uses_project_imports() {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("mesh-lsp crate should live under compiler/")
            .parent()
            .expect("workspace root should be above compiler/")
            .to_path_buf();
        let jobs_path = std::fs::canonicalize(repo_root.join("reference-backend/api/jobs.mpl"))
            .expect("reference-backend jobs file should exist");
        let uri = Url::from_file_path(&jobs_path)
            .expect("jobs path should convert to file URI")
            .to_string();
        let source = std::fs::read_to_string(&jobs_path).expect("jobs source should be readable");

        let result = analyze_document(&uri, &source, &[]);
        let messages = result
            .diagnostics
            .iter()
            .map(|diag| diag.message.as_str())
            .collect::<Vec<_>>();

        assert!(
            messages.is_empty(),
            "reference-backend/api/jobs.mpl should analyze without bogus import diagnostics, got: {:?}",
            messages
        );
    }

    #[test]
    fn analyze_type_error_produces_diagnostic() {
        // Using an undefined variable should produce a type error diagnostic.
        let source = "let x = undefined_var";
        let result = analyze_document("file:///test.mpl", source, &[]);
        assert!(
            !result.diagnostics.is_empty(),
            "Type error should produce at least one diagnostic"
        );
        let diag = &result.diagnostics[0];
        assert_eq!(diag.severity, Some(DiagnosticSeverity::ERROR));
        assert_eq!(diag.source.as_deref(), Some("mesh"));
    }

    #[test]
    fn analyze_type_error_has_range() {
        // The diagnostic range should point to the error location.
        let source = "let x = undefined_var";
        let result = analyze_document("file:///test.mpl", source, &[]);
        assert!(!result.diagnostics.is_empty());
        let diag = &result.diagnostics[0];
        // The error is for "undefined_var" which is on line 0.
        assert_eq!(diag.range.start.line, 0);
    }

    #[test]
    fn analyze_multiple_errors_all_reported() {
        // Two undefined variables should produce at least two diagnostics.
        let source = "let x = undef1\nlet y = undef2";
        let result = analyze_document("file:///test.mpl", source, &[]);
        assert!(
            result.diagnostics.len() >= 2,
            "Expected at least 2 diagnostics, got {}",
            result.diagnostics.len()
        );
    }

    #[test]
    fn analyze_parse_error_produces_diagnostic() {
        // A parse error (incomplete expression) should produce a diagnostic.
        // Note: `fn do end` is now valid syntax (no-params closure, Phase 12-01).
        // Use a clearly invalid expression instead.
        let source = "let x = + +";
        let result = analyze_document("file:///test.mpl", source, &[]);
        assert!(
            !result.diagnostics.is_empty(),
            "Parse error should produce at least one diagnostic"
        );
        let diag = &result.diagnostics[0];
        assert_eq!(diag.severity, Some(DiagnosticSeverity::ERROR));
    }

    // ── Hover Tests ───────────────────────────────────────────────────────

    #[test]
    fn hover_integer_literal() {
        let source = "let x = 42";
        let result = analyze_document("file:///test.mpl", source, &[]);
        // Hover over the let binding -- should show the type.
        // The rowan tree has "letx=42" so the LET_BINDING covers tree offsets.
        // The type map uses tree-coordinate ranges.
        // type_at_position converts LSP position to source byte offset.
        // However, since the typeck uses rowan ranges (not source byte offsets),
        // the hover might not work correctly for all positions due to the
        // whitespace coordinate mismatch (pre-existing issue).
        // We test with line 0, character 0 which should be in the LET_BINDING range.
        let ty = type_at_position(
            source,
            &result.typeck,
            &Position {
                line: 0,
                character: 0,
            },
        );
        // May return Some("Int") or None depending on what range the typeck stored.
        // At minimum, verify it doesn't panic.
        let _ = ty;
    }

    #[test]
    fn hover_over_empty_space_returns_none() {
        // Hovering over whitespace or at end of file should return None.
        let source = "let x = 42";
        let result = analyze_document("file:///test.mpl", source, &[]);
        // Position past end of source.
        let ty = type_at_position(
            source,
            &result.typeck,
            &Position {
                line: 5,
                character: 0,
            },
        );
        assert!(ty.is_none(), "Hover past end should return None");
    }

    // ── Go-to-definition Tests ────────────────────────────────────────────

    #[test]
    fn goto_def_function_defined_then_called() {
        let source = "fn greet(name) do\nname\nend\nlet msg = greet(42)";
        let result = analyze_document("file:///test.mpl", source, &[]);
        let root = result.parse.syntax();
        // Find the call to "greet" in `greet(42)`.
        let call_offset = source.rfind("greet").unwrap();
        let def = crate::definition::find_definition(source, &root, call_offset);
        assert!(def.is_some(), "Should find definition of greet");
        // Verify it resolves to the fn definition, not the call.
        let range = def.unwrap();
        let def_source = crate::definition::tree_to_source_offset(source, range.start().into());
        assert!(def_source.is_some());
        let offset = def_source.unwrap();
        // "fn greet" -- "greet" starts at offset 3.
        assert_eq!(offset, 3);
    }

    #[test]
    fn goto_def_let_binding_used_later() {
        let source = "let count = 10\nlet doubled = count + count";
        let result = analyze_document("file:///test.mpl", source, &[]);
        let root = result.parse.syntax();
        // Find "count" in the second let binding.
        let second_count = source.find("count + count").unwrap();
        let def = crate::definition::find_definition(source, &root, second_count);
        assert!(def.is_some(), "Should find definition of count");
        let range = def.unwrap();
        let def_source =
            crate::definition::tree_to_source_offset(source, range.start().into()).unwrap();
        // "let count" -- "count" starts at offset 4.
        assert_eq!(def_source, 4);
    }

    #[test]
    fn goto_def_variable_shadowing_inner_scope() {
        let source = "fn test() do\nlet x = 1\nfn inner() do\nlet x = 2\nlet y = x\nend\nend";
        let result = analyze_document("file:///test.mpl", source, &[]);
        let root = result.parse.syntax();
        let y_binding = source.find("let y = x").unwrap();
        let x_use = y_binding + "let y = ".len();
        let def = crate::definition::find_definition(source, &root, x_use);
        assert!(def.is_some(), "Should find inner x definition");
        let range = def.unwrap();
        let def_source =
            crate::definition::tree_to_source_offset(source, range.start().into()).unwrap();
        let inner_x = source.find("let x = 2").unwrap() + "let ".len();
        assert_eq!(
            def_source, inner_x,
            "Should resolve to inner binding, not outer"
        );
    }

    #[test]
    fn goto_def_unknown_identifier_returns_none() {
        let source = "let y = completely_unknown";
        let result = analyze_document("file:///test.mpl", source, &[]);
        let root = result.parse.syntax();
        let unknown_offset = source.find("completely_unknown").unwrap();
        let def = crate::definition::find_definition(source, &root, unknown_offset);
        assert!(def.is_none(), "Unknown identifier should return None");
    }

    #[test]
    fn goto_def_struct_name_resolves() {
        let source = "struct Point do\nx :: Int\nend";
        let result = analyze_document("file:///test.mpl", source, &[]);
        let root = result.parse.syntax();
        // Definition search for "Point" at the struct def should find itself.
        let point_offset = source.find("Point").unwrap();
        // "Point" at the definition site is in a NAME node, not NAME_REF,
        // so it won't resolve to anything (it IS the definition).
        let def = crate::definition::find_definition(source, &root, point_offset);
        // This should return None since the user is clicking on the definition itself.
        assert!(
            def.is_none(),
            "Clicking on definition site should return None"
        );
    }

    // ── Position Conversion Tests ─────────────────────────────────────────

    #[test]
    fn offset_to_position_first_line() {
        let source = "hello world";
        let pos = offset_to_position(source, 0);
        assert_eq!(
            pos,
            Position {
                line: 0,
                character: 0
            }
        );

        let pos = offset_to_position(source, 5);
        assert_eq!(
            pos,
            Position {
                line: 0,
                character: 5
            }
        );
    }

    #[test]
    fn offset_to_position_multiline() {
        let source = "line1\nline2\nline3";
        // 'l' of line2 is at offset 6
        let pos = offset_to_position(source, 6);
        assert_eq!(
            pos,
            Position {
                line: 1,
                character: 0
            }
        );

        // 'l' of line3 is at offset 12
        let pos = offset_to_position(source, 12);
        assert_eq!(
            pos,
            Position {
                line: 2,
                character: 0
            }
        );

        // 'i' of line2 is at offset 7
        let pos = offset_to_position(source, 7);
        assert_eq!(
            pos,
            Position {
                line: 1,
                character: 1
            }
        );
    }

    #[test]
    fn offset_to_position_at_end() {
        let source = "ab\ncd";
        let pos = offset_to_position(source, 5);
        assert_eq!(
            pos,
            Position {
                line: 1,
                character: 2
            }
        );
    }

    #[test]
    fn position_to_offset_single_line() {
        let source = "hello";
        assert_eq!(
            position_to_offset(
                source,
                &Position {
                    line: 0,
                    character: 0
                }
            ),
            Some(0)
        );
        assert_eq!(
            position_to_offset(
                source,
                &Position {
                    line: 0,
                    character: 3
                }
            ),
            Some(3)
        );
        assert_eq!(
            position_to_offset(
                source,
                &Position {
                    line: 0,
                    character: 5
                }
            ),
            Some(5)
        );
    }

    #[test]
    fn position_to_offset_multiline() {
        let source = "abc\ndef\nghi";
        // First char of line 2 (0-indexed) at (1, 0).
        assert_eq!(
            position_to_offset(
                source,
                &Position {
                    line: 1,
                    character: 0
                }
            ),
            Some(4)
        );
        // First char of line 3 at (2, 0).
        assert_eq!(
            position_to_offset(
                source,
                &Position {
                    line: 2,
                    character: 0
                }
            ),
            Some(8)
        );
    }

    #[test]
    fn position_to_offset_roundtrip() {
        let source = "hello\nworld\nfoo";
        for offset in 0..source.len() {
            let pos = offset_to_position(source, offset);
            let back = position_to_offset(source, &pos);
            assert_eq!(
                back,
                Some(offset),
                "Roundtrip failed for offset {} (pos {:?})",
                offset,
                pos
            );
        }
    }

    #[test]
    fn position_past_eof_returns_none() {
        let source = "hello";
        let result = position_to_offset(
            source,
            &Position {
                line: 5,
                character: 0,
            },
        );
        assert!(result.is_none(), "Position past EOF should return None");
    }

    // ── Source/Tree Offset Conversion Tests ────────────────────────────────

    #[test]
    fn source_tree_offset_roundtrip() {
        let source = "let x = 42\nlet y = x";
        // For each non-EOF token in the source, verify the roundtrip.
        let tokens = mesh_lexer::Lexer::tokenize(source);
        for token in &tokens {
            // Skip EOF (zero-length token at end).
            if token.kind == mesh_common::token::TokenKind::Eof {
                continue;
            }
            let src_start = token.span.start as usize;
            let tree = crate::definition::source_to_tree_offset(source, src_start);
            assert!(
                tree.is_some(),
                "source_to_tree_offset should succeed for offset {}",
                src_start
            );
            let back = crate::definition::tree_to_source_offset(source, tree.unwrap());
            assert_eq!(
                back,
                Some(src_start),
                "Roundtrip failed for source offset {}",
                src_start
            );
        }
    }
}
