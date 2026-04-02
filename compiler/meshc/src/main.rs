//! The Mesh compiler CLI.
//!
//! Provides the `meshc` command with the following subcommands:
//!
//! - `meshc build <dir>` - Compile a Mesh project to a native binary
//! - `meshc init [--clustered] [--template <name>] [--db <sqlite|postgres>] <name>` - Initialize a new Mesh project (`todo-api` defaults to local SQLite; `--db postgres` opts into the clustered/deployable starter)
//! - `meshc cluster <status|continuity|diagnostics> ...` - Inspect runtime-owned clustered operator surfaces
//! - `meshc deps [dir]` - Resolve and fetch dependencies
//! - `meshc update` - Refresh installed `meshc` and `meshpkg` through the canonical installer path
//! - `meshc fmt <path>` - Format Mesh source files in-place
//! - `meshc test [path]` - Run *.test.mpl files from a project root, tests directory, or specific test file
//! - `meshc migrate [up|down|status|generate]` - Database migration management
//! - `meshc repl` - Start an interactive REPL with LLVM JIT
//! - `meshc lsp` - Start the LSP server (communicates via stdin/stdout)
//!
//! Options:
//! - `--opt-level` - Optimization level (0 = debug, 2 = release)
//! - `--emit-llvm` - Emit LLVM IR (.ll) alongside the binary
//! - `--output` - Output path for the compiled binary
//! - `--target` - Target triple for cross-compilation
//! - `--json` - Output diagnostics as JSON (one object per line)
//! - `--no-color` - Disable colorized output

#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod cluster;
mod discovery;
mod migrate;
mod test_runner;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process;

use clap::{Parser, Subcommand, ValueEnum};
use mesh_parser::ast::expr::{FieldAccess, NameRef};
use mesh_parser::ast::AstNode;
use mesh_parser::syntax_kind::SyntaxKind;
use mesh_pkg::manifest::{
    build_clustered_export_surface, collect_source_cluster_declarations, resolve_entrypoint,
    validate_cluster_declarations_with_source, ClusteredDeclarationError,
    ClusteredExecutionMetadata, Manifest,
};

use mesh_typeck::diagnostics::DiagnosticOptions;
use mesh_typeck::ty::Ty;

#[derive(Parser)]
#[command(name = "meshc", version, about = "The Mesh compiler")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Compile a Mesh project to a native binary
    Build {
        /// Path to the project directory (must contain the resolved Mesh entrypoint)
        dir: PathBuf,

        /// Optimization level (0 = debug, 2 = release)
        #[arg(long = "opt-level", default_value = "0")]
        opt_level: u8,

        /// Emit LLVM IR (.ll file) alongside the binary
        #[arg(long = "emit-llvm")]
        emit_llvm: bool,

        /// Output path for the compiled binary
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Target triple for cross-compilation (e.g., x86_64-unknown-linux-gnu)
        #[arg(long)]
        target: Option<String>,

        /// Output diagnostics as JSON (one object per line) instead of human-readable format
        #[arg(long)]
        json: bool,

        /// Disable colorized output
        #[arg(long = "no-color")]
        no_color: bool,
    },
    /// Initialize a new Mesh project
    Init {
        /// Generate the minimal clustered app scaffold instead of the hello-world app
        #[arg(long)]
        clustered: bool,

        /// Generate a named starter template (currently: todo-api; default SQLite is local-only)
        #[arg(long)]
        template: Option<String>,

        /// Select the todo-api database backend (sqlite = local default, postgres = clustered/deployable)
        #[arg(long, value_enum)]
        db: Option<InitTodoDb>,

        /// Project name (creates directory with this name)
        name: String,
    },
    /// Inspect runtime-owned clustered operator surfaces
    Cluster {
        #[command(subcommand)]
        action: cluster::ClusterCommand,
    },
    /// Resolve and fetch dependencies
    Deps {
        /// Project directory (default: current directory)
        #[arg(default_value = ".")]
        dir: PathBuf,
    },
    /// Refresh installed meshc and meshpkg through the canonical installer path
    Update,
    /// Format Mesh source files
    Fmt {
        /// Path to a Mesh source file (or directory to format all .mpl files)
        path: PathBuf,

        /// Check if files are formatted (exit 1 if not, don't modify)
        #[arg(long)]
        check: bool,

        /// Maximum line width (default: 100)
        #[arg(long = "line-width", default_value = "100")]
        line_width: usize,

        /// Indent size in spaces (default: 2)
        #[arg(long = "indent-size", default_value = "2")]
        indent_size: usize,
    },
    /// Start an interactive REPL with LLVM JIT compilation
    Repl,
    /// Start the LSP server (communicates via stdin/stdout)
    Lsp,
    /// Run test files (*.test.mpl) from a project root, tests directory, or specific test file
    Test {
        /// Path to a Mesh project, test directory, or specific *.test.mpl file (default: current directory)
        path: Option<PathBuf>,

        /// Show dots instead of test names (compact output)
        #[arg(long)]
        quiet: bool,

        /// Request coverage reporting (currently unsupported; exits with an error)
        #[arg(long)]
        coverage: bool,
    },
    /// Run database migrations
    Migrate {
        #[command(subcommand)]
        action: Option<MigrateAction>,

        /// Project directory (default: current directory)
        #[arg(default_value = ".")]
        dir: PathBuf,
    },
}

#[derive(Subcommand)]
enum MigrateAction {
    /// Apply all pending migrations (default)
    Up,
    /// Rollback the last applied migration
    Down,
    /// Show migration status (applied vs pending)
    Status,
    /// Generate a new migration scaffold
    Generate {
        /// Migration name (e.g., "create_users")
        name: String,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum InitTodoDb {
    Sqlite,
    Postgres,
}

impl From<InitTodoDb> for mesh_pkg::TodoApiDatabase {
    fn from(value: InitTodoDb) -> Self {
        match value {
            InitTodoDb::Sqlite => mesh_pkg::TodoApiDatabase::Sqlite,
            InitTodoDb::Postgres => mesh_pkg::TodoApiDatabase::Postgres,
        }
    }
}

enum InitTarget {
    HelloWorld,
    Clustered,
    TodoApi(mesh_pkg::TodoApiDatabase),
}

fn resolve_init_target(
    clustered: bool,
    template: Option<&str>,
    db: Option<InitTodoDb>,
) -> Result<InitTarget, String> {
    if let Some(template_name) = template {
        if template_name != "todo-api" {
            let db_guidance = if db.is_some() {
                " `--db` is only supported with `--template todo-api`."
            } else {
                ""
            };
            return Err(format!(
                "unknown init template '{template_name}'; supported templates: todo-api.{db_guidance}"
            ));
        }
    }

    if db.is_some() && template != Some("todo-api") {
        return Err(
            "`--db` is only supported with `meshc init --template todo-api <name>`; omit `--db` for hello-world or `--clustered`, or add `--template todo-api` (sqlite stays the local default, postgres opts into the clustered/deployable starter)."
                .to_string(),
        );
    }

    if clustered && template == Some("todo-api") {
        return Err(
            "`meshc init --clustered` cannot be combined with `--template todo-api` or `--db`; use `meshc init --template todo-api <name>` for the local SQLite starter, `meshc init --template todo-api --db postgres <name>` for the clustered/deployable Todo starter, or `meshc init --clustered <name>` for the minimal clustered scaffold."
                .to_string(),
        );
    }

    match (clustered, template, db) {
        (true, None, None) => Ok(InitTarget::Clustered),
        (false, Some("todo-api"), Some(database)) => Ok(InitTarget::TodoApi(database.into())),
        (false, Some("todo-api"), None) => {
            Ok(InitTarget::TodoApi(mesh_pkg::TodoApiDatabase::Sqlite))
        }
        (false, None, None) => Ok(InitTarget::HelloWorld),
        _ => unreachable!("init argument validation should return early for unsupported cases"),
    }
}

fn run_init_command(
    clustered: bool,
    template: Option<&str>,
    db: Option<InitTodoDb>,
    name: &str,
    dir: &Path,
) -> Result<(), String> {
    match resolve_init_target(clustered, template, db)? {
        InitTarget::HelloWorld => mesh_pkg::scaffold_project(name, dir),
        InitTarget::Clustered => mesh_pkg::scaffold_clustered_project(name, dir),
        InitTarget::TodoApi(database) => {
            mesh_pkg::scaffold_todo_api_project_with_db(name, dir, database)
        }
    }
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build {
            dir,
            opt_level,
            emit_llvm,
            output,
            target,
            json,
            no_color,
        } => {
            let diag_opts = DiagnosticOptions {
                color: !no_color && !json,
                json,
            };
            if let Err(e) = build(
                &dir,
                opt_level,
                emit_llvm,
                output.as_deref(),
                target.as_deref(),
                &diag_opts,
            ) {
                if json {
                    // In JSON mode, emit the final error as JSON too.
                    let msg = serde_json::json!({
                        "code": "C0001",
                        "severity": "error",
                        "message": e,
                        "file": "",
                        "spans": [],
                        "fix": null
                    });
                    eprintln!("{}", msg);
                } else {
                    eprintln!("error: {}", e);
                }
                process::exit(1);
            }
        }
        Commands::Init {
            clustered,
            template,
            db,
            name,
        } => {
            let dir = std::env::current_dir().unwrap_or_default();
            if let Err(e) = run_init_command(clustered, template.as_deref(), db, &name, &dir) {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        }
        Commands::Cluster { action } => {
            if let Err(e) = cluster::run_cluster_command(action) {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        }
        Commands::Deps { dir } => {
            if let Err(e) = deps_command(&dir) {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        }
        Commands::Update => {
            if let Err(e) = run_update_command() {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        }
        Commands::Fmt {
            path,
            check,
            line_width,
            indent_size,
        } => {
            let config = mesh_fmt::FormatConfig {
                indent_size,
                max_width: line_width,
            };
            match fmt_command(&path, check, &config) {
                Ok(stats) => {
                    if check {
                        if stats.unformatted > 0 {
                            eprintln!("{} file(s) would be reformatted", stats.unformatted);
                            process::exit(1);
                        }
                    } else {
                        eprintln!("Formatted {} file(s)", stats.total);
                    }
                }
                Err(e) => {
                    eprintln!("error: {}", e);
                    process::exit(1);
                }
            }
        }
        Commands::Repl => {
            if let Err(e) = mesh_repl::run_repl(&mesh_repl::ReplConfig::default()) {
                eprintln!("REPL error: {}", e);
                process::exit(1);
            }
        }
        Commands::Lsp => {
            let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
            rt.block_on(mesh_lsp::run_server());
        }
        Commands::Test {
            path,
            quiet,
            coverage,
        } => match test_runner::run_tests(path.as_deref(), quiet, coverage) {
            Ok(summary) => {
                if summary.failed > 0 {
                    process::exit(1);
                }
            }
            Err(e) => {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        },
        Commands::Migrate { action, dir } => {
            let action = action.unwrap_or(MigrateAction::Up);
            let result = match action {
                MigrateAction::Up => migrate::run_migrations_up(&dir),
                MigrateAction::Down => migrate::run_migrations_down(&dir),
                MigrateAction::Status => migrate::show_migration_status(&dir),
                MigrateAction::Generate { name } => migrate::generate_migration(&dir, &name),
            };
            if let Err(e) = result {
                eprintln!("error: {}", e);
                process::exit(1);
            }
        }
    }
}

fn run_update_command() -> Result<(), String> {
    let outcome = mesh_pkg::run_toolchain_update().map_err(|error| error.to_string())?;
    match outcome.mode {
        mesh_pkg::ToolchainUpdateMode::Completed => {
            println!("Mesh toolchain update completed via the canonical installer.");
        }
        mesh_pkg::ToolchainUpdateMode::DetachedBootstrap => {
            println!(
                "Mesh toolchain update bootstrap launched; the installer will finish replacing the toolchain after this process exits."
            );
        }
    }
    Ok(())
}

pub(crate) struct PreparedBuild {
    pub(crate) merged_mir: mesh_codegen::mir::MirModule,
    pub(crate) clustered_execution_plan: Vec<ClusteredExecutionMetadata>,
    pub(crate) clustered_route_handler_plan: Vec<mesh_codegen::DeclaredHandlerPlanEntry>,
}

/// Execute the build pipeline: discover all .mpl files -> parse -> typecheck entry -> codegen -> link.
pub(crate) fn build(
    dir: &Path,
    opt_level: u8,
    emit_llvm: bool,
    output: Option<&Path>,
    target: Option<&str>,
    diag_opts: &DiagnosticOptions,
) -> Result<(), String> {
    let mut prepared = prepare_project_build(dir, diag_opts)?;
    let declared_handler_plan = prepare_declared_handler_plan(
        &prepared.clustered_execution_plan,
        &prepared.clustered_route_handler_plan,
    );
    let startup_work_registrations =
        mesh_codegen::prepare_startup_work_registrations(&declared_handler_plan);
    let declared_handlers = mesh_codegen::prepare_declared_runtime_handlers(
        &mut prepared.merged_mir,
        &declared_handler_plan,
    )?;

    // Determine output path
    let project_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("output");
    let output_path = match output {
        Some(p) => p.to_path_buf(),
        None => dir.join(project_name),
    };

    // Emit LLVM IR if requested
    if emit_llvm {
        let ll_path = output_path.with_extension("ll");
        mesh_codegen::compile_mir_to_llvm_ir(
            &prepared.merged_mir,
            &declared_handlers,
            &startup_work_registrations,
            &ll_path,
            target,
        )?;
        eprintln!("  LLVM IR: {}", ll_path.display());
    }

    // Compile to native binary
    let runtime_override = runtime_lib_override_from_env()?;
    mesh_codegen::compile_mir_to_binary(
        &prepared.merged_mir,
        &declared_handlers,
        &startup_work_registrations,
        &output_path,
        opt_level,
        target,
        runtime_override.as_deref(),
    )?;

    eprintln!("  Compiled: {}", output_path.display());

    Ok(())
}

fn prepare_declared_handler_plan(
    entries: &[ClusteredExecutionMetadata],
    clustered_route_entries: &[mesh_codegen::DeclaredHandlerPlanEntry],
) -> Vec<mesh_codegen::DeclaredHandlerPlanEntry> {
    let mut plan = entries
        .iter()
        .map(|entry| mesh_codegen::DeclaredHandlerPlanEntry {
            kind: match entry.kind {
                mesh_pkg::manifest::ClusteredDeclarationKind::Work => {
                    mesh_codegen::DeclaredHandlerKind::Work
                }
                mesh_pkg::manifest::ClusteredDeclarationKind::ServiceCall => {
                    mesh_codegen::DeclaredHandlerKind::ServiceCall
                }
                mesh_pkg::manifest::ClusteredDeclarationKind::ServiceCast => {
                    mesh_codegen::DeclaredHandlerKind::ServiceCast
                }
            },
            runtime_registration_name: entry.runtime_registration_name.clone(),
            executable_symbol: entry.executable_symbol.clone(),
            replication_count: entry.replication_count.value as u64,
        })
        .collect::<Vec<_>>();
    plan.extend(clustered_route_entries.iter().cloned());
    plan
}

pub(crate) fn prepare_project_build(
    dir: &Path,
    diag_opts: &DiagnosticOptions,
) -> Result<PreparedBuild, String> {
    // Validate the project directory
    if !dir.exists() {
        return Err(format!(
            "Project directory '{}' does not exist",
            dir.display()
        ));
    }
    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", dir.display()));
    }

    let manifest_path = dir.join("mesh.toml");
    let manifest = if manifest_path.exists() {
        Some(Manifest::from_file(&manifest_path)?)
    } else {
        None
    };
    let entry_relative_path = resolve_entrypoint(dir, manifest.as_ref())?;

    // Build the project: discover all files, parse, build module graph
    let project = discovery::build_project_with_entrypoint(dir, &entry_relative_path)?;

    // Find the entry module
    let entry_id = project
        .compilation_order
        .iter()
        .copied()
        .find(|id| project.graph.get(*id).is_entry)
        .ok_or_else(|| {
            format!(
                "Resolved entrypoint '{}' was not marked executable in module discovery",
                entry_relative_path.display()
            )
        })?;

    // Check parse errors in ALL modules (not just entry)
    let mut has_errors = false;
    for id in &project.compilation_order {
        let idx = id.0 as usize;
        let parse = &project.module_parses[idx];
        let source = &project.module_sources[idx];
        let module_path = dir.join(&project.graph.get(*id).path);

        for error in parse.errors() {
            has_errors = true;
            let file_name = module_path.display().to_string();
            if diag_opts.json {
                let start = error.span.start as usize;
                let end = (error.span.end as usize).max(start + 1);
                let json_diag = serde_json::json!({
                    "code": "P0001",
                    "severity": "error",
                    "message": format!("Parse error: {}", error.message),
                    "file": file_name,
                    "spans": [{
                        "start": start,
                        "end": end,
                        "label": error.message
                    }],
                    "fix": null
                });
                eprintln!("{}", json_diag);
            } else {
                use ariadne::{Config, Label, Report, ReportKind, Source};
                let config = if diag_opts.color {
                    Config::default()
                } else {
                    Config::default().with_color(false)
                };
                let start = error.span.start as usize;
                let end = (error.span.end as usize).max(start + 1);
                let _ = Report::<std::ops::Range<usize>>::build(ReportKind::Error, start..end)
                    .with_message("Parse error")
                    .with_config(config)
                    .with_label(Label::new(start..end).with_message(&error.message))
                    .finish()
                    .eprint(Source::from(source.as_str()));
            }
        }
    }

    // If any parse errors exist, skip type checking entirely
    if has_errors {
        return Err("Compilation failed due to errors above.".to_string());
    }

    // Type-check ALL modules in topological order (Phase 39)
    let module_count = project.graph.module_count();
    let mut all_exports: Vec<Option<mesh_typeck::ExportedSymbols>> =
        (0..module_count).map(|_| None).collect();
    let mut all_typeck: Vec<Option<mesh_typeck::TypeckResult>> =
        (0..module_count).map(|_| None).collect();
    let mut has_type_errors = false;

    for &id in &project.compilation_order {
        let idx = id.0 as usize;
        let parse = &project.module_parses[idx];
        let source = &project.module_sources[idx];
        let module_path = dir.join(&project.graph.get(id).path);

        // Build ImportContext from already-checked dependencies
        let mut import_ctx = build_import_context(&project.graph, &all_exports, parse, id);

        // Thread current module name for display_prefix on locally-defined types.
        // Multi-module builds set this so type errors show module-qualified names
        // (e.g., "expected Geometry.Point, got Main.Point").
        let module_name = &project.graph.get(id).name;
        import_ctx.current_module = Some(module_name.clone());

        // Type-check this module with imports
        let typeck = mesh_typeck::check_with_imports(parse, &import_ctx);

        // Report type-check diagnostics for this module
        let file_name = module_path.display().to_string();
        for error in &typeck.errors {
            has_type_errors = true;
            let rendered = mesh_typeck::diagnostics::render_diagnostic(
                error, source, &file_name, diag_opts, None,
            );
            eprint!("{}", rendered);
        }

        // Report warnings
        for warning in &typeck.warnings {
            let rendered = mesh_typeck::diagnostics::render_diagnostic(
                warning, source, &file_name, diag_opts, None,
            );
            eprint!("{}", rendered);
        }

        // Collect exports for downstream modules
        let exports = mesh_typeck::collect_exports(parse, &typeck);
        all_exports[idx] = Some(exports);
        all_typeck[idx] = Some(typeck);
    }

    if has_type_errors {
        return Err("Compilation failed due to errors above.".to_string());
    }

    let source_cluster_declarations =
        collect_source_cluster_declarations(&project.graph, &project.module_parses);
    let clustered_execution_plan = if manifest
        .as_ref()
        .and_then(|manifest| manifest.cluster.as_ref())
        .is_some()
        || !source_cluster_declarations.is_empty()
    {
        let surface =
            build_clustered_export_surface(&project.graph, &project.module_parses, &all_exports);
        match validate_cluster_declarations_with_source(
            manifest
                .as_ref()
                .and_then(|manifest| manifest.cluster.as_ref()),
            &source_cluster_declarations,
            &surface,
        ) {
            Ok(metadata) => metadata,
            Err(issues) => {
                emit_clustered_declaration_diagnostics(&manifest_path, &issues, diag_opts);
                return Err("Compilation failed due to errors above.".to_string());
            }
        }
    } else {
        Vec::new()
    };
    let clustered_route_handler_plan = mesh_codegen::prepare_clustered_route_handler_plan(
        all_typeck.iter().filter_map(|typeck| typeck.as_ref()),
    )?;

    let inferred_export_names: HashSet<String> = all_exports
        .iter()
        .filter_map(|exports_opt| exports_opt.as_ref())
        .flat_map(|exports| {
            exports.functions.iter().filter_map(|(name, scheme)| {
                if ty_contains_var(&scheme.ty) {
                    Some(name.clone())
                } else {
                    None
                }
            })
        })
        .collect();
    let inferred_fn_usage_types = collect_inferred_fn_usage_types(
        &project.module_parses,
        &all_typeck,
        &inferred_export_names,
    );

    // Lower ALL modules to MIR and merge into a single module for codegen.
    let mut mir_modules = Vec::new();
    let mut entry_mir_idx = 0;
    for (i, &id) in project.compilation_order.iter().enumerate() {
        let idx = id.0 as usize;
        let parse = &project.module_parses[idx];
        let typeck = all_typeck[idx]
            .as_ref()
            .ok_or("Module was not type-checked")?;

        // Build set of pub function names for module-qualified naming (Phase 41)
        let module_name = &project.graph.get(id).name;
        let pub_fns: std::collections::HashSet<String> = all_exports[idx]
            .as_ref()
            .map(|e| e.functions.keys().cloned().collect())
            .unwrap_or_default();

        let mir = mesh_codegen::lower_to_mir_raw(
            parse,
            typeck,
            module_name,
            &pub_fns,
            &inferred_fn_usage_types,
        )?;
        if id == entry_id {
            entry_mir_idx = i;
        }
        mir_modules.push(mir);
    }
    let declared_executable_symbols = clustered_execution_plan
        .iter()
        .map(|entry| entry.executable_symbol.clone())
        .chain(
            clustered_route_handler_plan
                .iter()
                .map(|entry| entry.executable_symbol.clone()),
        )
        .collect::<Vec<_>>();
    let merged_mir =
        mesh_codegen::merge_mir_modules(mir_modules, entry_mir_idx, &declared_executable_symbols);

    Ok(PreparedBuild {
        merged_mir,
        clustered_execution_plan,
        clustered_route_handler_plan,
    })
}

fn runtime_lib_override_from_env() -> Result<Option<PathBuf>, String> {
    let Some(raw) = std::env::var_os("MESH_RT_LIB_PATH") else {
        return Ok(None);
    };

    if raw.is_empty() {
        return Err("MESH_RT_LIB_PATH was set but empty. Provide an absolute path to the Mesh runtime static library or unset it.".to_string());
    }

    Ok(Some(PathBuf::from(raw)))
}

fn ty_contains_var(ty: &Ty) -> bool {
    match ty {
        Ty::Var(_) => true,
        Ty::Con(_) | Ty::Never => false,
        Ty::Fun(params, ret) => params.iter().any(ty_contains_var) || ty_contains_var(ret),
        Ty::App(con, args) => ty_contains_var(con) || args.iter().any(ty_contains_var),
        Ty::Tuple(elems) => elems.iter().any(ty_contains_var),
    }
}

fn is_concrete_fn_ty(ty: &Ty) -> bool {
    matches!(ty, Ty::Fun(..)) && !ty_contains_var(ty)
}

fn push_usage_type(map: &mut HashMap<String, Vec<Ty>>, name: &str, ty: &Ty) {
    if !is_concrete_fn_ty(ty) {
        return;
    }
    let entry = map.entry(name.to_string()).or_default();
    if !entry.contains(ty) {
        entry.push(ty.clone());
    }
}

fn collect_inferred_fn_usage_types(
    parses: &[mesh_parser::Parse],
    typecks: &[Option<mesh_typeck::TypeckResult>],
    candidate_names: &HashSet<String>,
) -> HashMap<String, Vec<Ty>> {
    let mut usage = HashMap::new();
    if candidate_names.is_empty() {
        return usage;
    }

    for (parse, typeck_opt) in parses.iter().zip(typecks.iter()) {
        let Some(typeck) = typeck_opt.as_ref() else {
            continue;
        };

        for node in parse.syntax().descendants() {
            match node.kind() {
                SyntaxKind::NAME_REF => {
                    if let Some(name_ref) = NameRef::cast(node.clone()) {
                        if let Some(name) = name_ref.text() {
                            if candidate_names.contains(&name) {
                                if let Some(ty) = typeck.types.get(&name_ref.syntax().text_range())
                                {
                                    push_usage_type(&mut usage, &name, ty);
                                }
                            }
                        }
                    }
                }
                SyntaxKind::FIELD_ACCESS => {
                    if let Some(field_access) = FieldAccess::cast(node) {
                        let Some(base_expr) = field_access.base() else {
                            continue;
                        };
                        let mesh_parser::ast::expr::Expr::NameRef(base_name_ref) = base_expr else {
                            continue;
                        };
                        let Some(base_name) = base_name_ref.text() else {
                            continue;
                        };
                        if !typeck.qualified_modules.contains_key(&base_name) {
                            continue;
                        }
                        let Some(field_name) = field_access.field().map(|t| t.text().to_string())
                        else {
                            continue;
                        };
                        if !candidate_names.contains(&field_name) {
                            continue;
                        }
                        if let Some(ty) = typeck.types.get(&field_access.syntax().text_range()) {
                            push_usage_type(&mut usage, &field_name, ty);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    usage
}

/// Build an ImportContext for a module from already-checked dependency exports.
///
/// Reads the module's import declarations to determine which modules are imported,
/// then constructs an ImportContext with the exports of those modules. Trait defs
/// and impls from ALL already-checked modules are included (XMOD-05: globally visible).
fn build_import_context(
    graph: &mesh_common::module_graph::ModuleGraph,
    all_exports: &[Option<mesh_typeck::ExportedSymbols>],
    parse: &mesh_parser::Parse,
    _module_id: mesh_common::module_graph::ModuleId,
) -> mesh_typeck::ImportContext {
    use mesh_parser::ast::item::Item;
    use mesh_typeck::{ImportContext, ModuleExports};

    let mut ctx = ImportContext::empty();

    // Collect ALL trait defs and impls from ALL already-checked modules (XMOD-05)
    for exports_opt in all_exports.iter() {
        if let Some(exports) = exports_opt {
            ctx.all_trait_defs
                .extend(exports.trait_defs.iter().cloned());
            ctx.all_trait_impls
                .extend(exports.trait_impls.iter().cloned());
        }
    }

    // For each import declaration in this module, find the corresponding
    // module's exports and add them to the ImportContext.
    let tree = parse.tree();
    for item in tree.items() {
        let segments = match &item {
            Item::ImportDecl(import_decl) => import_decl.module_path().map(|p| p.segments()),
            Item::FromImportDecl(from_import) => from_import.module_path().map(|p| p.segments()),
            _ => None,
        };

        if let Some(segments) = segments {
            let full_name = segments.join(".");
            let last_segment = segments.last().cloned().unwrap_or_default();

            // Look up the module in the graph
            if let Some(dep_id) = graph.resolve(&full_name) {
                let idx = dep_id.0 as usize;
                if let Some(Some(exports)) = all_exports.get(idx) {
                    // Build ModuleExports from ExportedSymbols
                    let mod_exports = ModuleExports {
                        module_name: full_name.clone(),
                        functions: exports.functions.clone(),
                        struct_defs: exports.struct_defs.clone(),
                        sum_type_defs: exports.sum_type_defs.clone(),
                        service_defs: exports.service_defs.clone(),
                        actor_defs: exports.actor_defs.clone(),
                        private_names: exports.private_names.clone(),
                        type_aliases: exports.type_aliases.clone(),
                    };
                    ctx.module_exports.insert(last_segment, mod_exports);
                }
            }
            // If module not found in graph, that's fine -- the type checker
            // will emit ImportModuleNotFound when it processes the import.
        }
    }

    ctx
}

fn clustered_issue_file_and_span(
    manifest_path: &Path,
    issue: &ClusteredDeclarationError,
) -> (String, Option<String>, Option<std::ops::Range<usize>>) {
    let Some(provenance) = issue.origin.provenance() else {
        return (manifest_path.display().to_string(), None, None);
    };

    let project_root = manifest_path.parent().unwrap_or_else(|| Path::new("."));
    let file_path = project_root.join(&provenance.file);
    let file_name = file_path.display().to_string();
    let source = std::fs::read_to_string(&file_path).ok();
    let span = source
        .as_ref()
        .map(|source| clustered_issue_range(source, provenance.span));
    (file_name, source, span)
}

fn clustered_issue_range(source: &str, span: mesh_common::span::Span) -> std::ops::Range<usize> {
    if source.is_empty() {
        return 0..0;
    }

    let mut start = (span.start as usize).min(source.len() - 1);
    let mut end = (span.end as usize).min(source.len());
    if end <= start {
        end = (start + 1).min(source.len());
    }
    start = start.min(end.saturating_sub(1));
    start..end
}

fn offset_to_line_col(source: &str, offset: usize) -> (usize, usize) {
    let offset = offset.min(source.len());
    let prefix = &source[..offset];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let col = prefix
        .rsplit_once('\n')
        .map(|(_, line_text)| line_text.chars().count() + 1)
        .unwrap_or_else(|| prefix.chars().count() + 1);
    (line, col)
}

fn emit_clustered_declaration_diagnostics(
    manifest_path: &Path,
    issues: &[ClusteredDeclarationError],
    diag_opts: &DiagnosticOptions,
) {
    for issue in issues {
        let (file_name, source, span) = clustered_issue_file_and_span(manifest_path, issue);

        if diag_opts.json {
            let spans = span
                .as_ref()
                .map(|span| {
                    vec![serde_json::json!({
                        "start": span.start,
                        "end": span.end,
                        "label": issue.reason
                    })]
                })
                .unwrap_or_default();
            let json_diag = serde_json::json!({
                "code": "CFG0001",
                "severity": "error",
                "message": issue.to_string(),
                "file": file_name,
                "spans": spans,
                "fix": null
            });
            eprintln!("{}", json_diag);
            continue;
        }

        if let (Some(source), Some(span)) = (source.as_ref(), span.as_ref()) {
            use ariadne::{Config, Label, Report, ReportKind, Source};

            let config = if diag_opts.color {
                Config::default()
            } else {
                Config::default().with_color(false)
            };
            let (line, col) = offset_to_line_col(source, span.start);
            eprintln!("error: {}", issue);
            eprintln!("  --> {}:{}:{}", file_name, line, col);
            let _ = Report::<std::ops::Range<usize>>::build(ReportKind::Error, span.clone())
                .with_message("Invalid clustered declaration")
                .with_config(config)
                .with_label(Label::new(span.clone()).with_message(&issue.reason))
                .finish()
                .eprint(Source::from(source.as_str()));
        } else {
            eprintln!("error: {}", issue);
            eprintln!("  --> {}", file_name);
        }
    }
}

/// Report parse and type-check diagnostics.
///
/// When `diag_opts.json` is true, outputs one JSON object per line to stderr.
/// Otherwise, outputs colorized (or colorless) human-readable diagnostics.
/// Returns true if there are any errors.
#[allow(dead_code)]
fn report_diagnostics(
    source: &str,
    path: &Path,
    parse: &mesh_parser::Parse,
    typeck: &mesh_typeck::TypeckResult,
    diag_opts: &DiagnosticOptions,
) -> bool {
    let file_name = path.display().to_string();
    let mut has_errors = false;

    // Check for parse errors
    for error in parse.errors() {
        has_errors = true;
        if diag_opts.json {
            // Emit parse errors as JSON.
            let start = error.span.start as usize;
            let end = (error.span.end as usize).max(start + 1);
            let json_diag = serde_json::json!({
                "code": "P0001",
                "severity": "error",
                "message": format!("Parse error: {}", error.message),
                "file": file_name,
                "spans": [{
                    "start": start,
                    "end": end,
                    "label": error.message
                }],
                "fix": null
            });
            eprintln!("{}", json_diag);
        } else {
            use ariadne::{Config, Label, Report, ReportKind, Source};
            let config = if diag_opts.color {
                Config::default()
            } else {
                Config::default().with_color(false)
            };
            let start = error.span.start as usize;
            let end = (error.span.end as usize).max(start + 1);
            let _ = Report::<std::ops::Range<usize>>::build(ReportKind::Error, start..end)
                .with_message("Parse error")
                .with_config(config)
                .with_label(Label::new(start..end).with_message(&error.message))
                .finish()
                .eprint(Source::from(source));
        }
    }

    // Check for type errors
    for error in &typeck.errors {
        has_errors = true;
        let rendered =
            mesh_typeck::diagnostics::render_diagnostic(error, source, &file_name, diag_opts, None);
        eprint!("{}", rendered);
    }

    has_errors
}

// ── Deps subcommand ──────────────────────────────────────────────────

/// Execute the `deps` subcommand: resolve dependencies and generate mesh.lock.
///
/// If mesh.lock already exists and the manifest hasn't changed, skips resolution.
fn deps_command(dir: &Path) -> Result<(), String> {
    let manifest_path = dir.join("mesh.toml");
    if !manifest_path.exists() {
        return Err(format!(
            "No 'mesh.toml' found in '{}'. Run `meshc init` to create a project.",
            dir.display()
        ));
    }

    let lock_path = dir.join("mesh.lock");

    // Check if lockfile is fresh: exists and manifest hasn't been modified after it
    if lock_path.exists() {
        let manifest_modified = std::fs::metadata(&manifest_path)
            .and_then(|m| m.modified())
            .ok();
        let lock_modified = std::fs::metadata(&lock_path)
            .and_then(|m| m.modified())
            .ok();
        if let (Some(manifest_time), Some(lock_time)) = (manifest_modified, lock_modified) {
            if manifest_time <= lock_time {
                eprintln!("Dependencies up to date");
                return Ok(());
            }
        }
    }

    let (resolved, lockfile) = mesh_pkg::resolve_dependencies(dir)?;

    lockfile.write(&lock_path)?;

    if resolved.is_empty() {
        eprintln!("No dependencies");
    } else {
        eprintln!("Resolved {} dependencies", resolved.len());
    }

    Ok(())
}

// ── Format subcommand ─────────────────────────────────────────────────

/// Statistics from a format operation.
struct FmtStats {
    /// Total number of files processed.
    total: usize,
    /// Number of files that were not already formatted (check mode).
    unformatted: usize,
}

/// Execute the `fmt` subcommand: format Mesh source files in-place or check formatting.
fn fmt_command(
    path: &Path,
    check: bool,
    config: &mesh_fmt::FormatConfig,
) -> Result<FmtStats, String> {
    let files = collect_mesh_files(path)?;
    if files.is_empty() {
        return Err(format!("No .mpl files found at '{}'", path.display()));
    }

    let mut total = 0;
    let mut unformatted = 0;

    for file in &files {
        let source = std::fs::read_to_string(file)
            .map_err(|e| format!("Failed to read '{}': {}", file.display(), e))?;

        let formatted = mesh_fmt::format_source(&source, config);
        total += 1;

        if formatted != source {
            if check {
                eprintln!("  would reformat: {}", file.display());
                unformatted += 1;
            } else {
                std::fs::write(file, &formatted)
                    .map_err(|e| format!("Failed to write '{}': {}", file.display(), e))?;
            }
        }
    }

    Ok(FmtStats { total, unformatted })
}

/// Collect `.mpl` files from a path. If the path is a file, return it directly.
/// If it is a directory, recursively find all `.mpl` files.
fn collect_mesh_files(path: &Path) -> Result<Vec<PathBuf>, String> {
    if !path.exists() {
        return Err(format!("Path '{}' does not exist", path.display()));
    }

    if path.is_file() {
        if path.extension().and_then(|e| e.to_str()) == Some("mpl") {
            return Ok(vec![path.to_path_buf()]);
        } else {
            return Err(format!("'{}' is not a .mpl file", path.display()));
        }
    }

    if path.is_dir() {
        let mut files = Vec::new();
        collect_mesh_files_recursive(path, &mut files)
            .map_err(|e| format!("Failed to walk directory '{}': {}", path.display(), e))?;
        files.sort();
        return Ok(files);
    }

    Err(format!("'{}' is not a file or directory", path.display()))
}

/// Recursively collect `.mpl` files from a directory.
fn collect_mesh_files_recursive(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_mesh_files_recursive(&entry_path, files)?;
        } else if entry_path.extension().and_then(|e| e.to_str()) == Some("mpl") {
            files.push(entry_path);
        }
    }
    Ok(())
}
