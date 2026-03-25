//! Migration DDL generation module for the Mesh runtime.
//!
//! Provides eight `extern "C"` DDL builder functions that produce correctly
//! quoted PostgreSQL DDL SQL and execute it via `Pool.execute`:
//!
//! - `mesh_migration_create_table`: CREATE TABLE IF NOT EXISTS with column defs
//! - `mesh_migration_drop_table`: DROP TABLE IF EXISTS
//! - `mesh_migration_add_column`: ALTER TABLE ADD COLUMN IF NOT EXISTS
//! - `mesh_migration_drop_column`: ALTER TABLE DROP COLUMN IF EXISTS
//! - `mesh_migration_rename_column`: ALTER TABLE RENAME COLUMN
//! - `mesh_migration_create_index`: CREATE [UNIQUE] INDEX IF NOT EXISTS
//! - `mesh_migration_drop_index`: DROP INDEX IF EXISTS
//! - `mesh_migration_execute`: Raw SQL escape hatch via Pool.execute
//!
//! All functions accept Mesh runtime types (MeshString pointers, List pointers)
//! and execute the generated DDL via `mesh_pool_execute`. SQL identifiers are
//! double-quoted per PostgreSQL convention.

use crate::collections::list::{mesh_list_get, mesh_list_length, mesh_list_new};
use crate::db::pool::mesh_pool_execute;
use crate::io::alloc_result;
use crate::string::{mesh_string_new, MeshString};

// ── Helpers ──────────────────────────────────────────────────────────

/// Quote a SQL identifier with double quotes (PostgreSQL convention).
/// Escapes embedded double quotes by doubling them.
fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Extract a Vec<String> from a Mesh List<String> pointer.
unsafe fn list_to_strings(list_ptr: *mut u8) -> Vec<String> {
    let len = mesh_list_length(list_ptr);
    let mut result = Vec::with_capacity(len as usize);
    for i in 0..len {
        let elem = mesh_list_get(list_ptr, i) as *const MeshString;
        if !elem.is_null() {
            result.push((*elem).as_str().to_string());
        }
    }
    result
}

/// Create a MeshString from a Rust &str and return as *mut u8.
unsafe fn rust_string_to_mesh(s: &str) -> *mut u8 {
    mesh_string_new(s.as_ptr(), s.len() as u64) as *mut u8
}

fn err_result(message: &str) -> *mut u8 {
    unsafe { alloc_result(1, rust_string_to_mesh(message)) as *mut u8 }
}

// ── Pure Rust SQL builders (testable without GC) ─────────────────────

/// Build CREATE TABLE SQL from table name and column definitions.
///
/// Each column entry is colon-separated: `"name:TYPE:CONSTRAINTS"` (3 parts)
/// or `"name:TYPE"` (2 parts). Column names are quoted; types and constraints
/// are passed through verbatim.
///
/// Example: `["id:UUID:PRIMARY KEY", "name:TEXT:NOT NULL", "age:BIGINT"]`
/// produces: `CREATE TABLE IF NOT EXISTS "t" ("id" UUID PRIMARY KEY, "name" TEXT NOT NULL, "age" BIGINT)`
pub(crate) fn build_create_table_sql(table: &str, columns: &[String]) -> String {
    let mut sql = format!("CREATE TABLE IF NOT EXISTS {}", quote_ident(table));
    sql.push_str(" (");
    let col_defs: Vec<String> = columns
        .iter()
        .map(|c| {
            let parts: Vec<&str> = c.splitn(3, ':').collect();
            match parts.len() {
                3 => format!("{} {} {}", quote_ident(parts[0]), parts[1], parts[2]),
                2 => format!("{} {}", quote_ident(parts[0]), parts[1]),
                _ => c.to_string(),
            }
        })
        .collect();
    sql.push_str(&col_defs.join(", "));
    sql.push(')');
    sql
}

/// Build DROP TABLE SQL.
pub(crate) fn build_drop_table_sql(table: &str) -> String {
    format!("DROP TABLE IF EXISTS {}", quote_ident(table))
}

/// Build ADD COLUMN SQL from table name and column definition.
///
/// Column definition uses same colon encoding as create_table.
pub(crate) fn build_add_column_sql(table: &str, column_def: &str) -> String {
    let parts: Vec<&str> = column_def.splitn(3, ':').collect();
    match parts.len() {
        3 => format!(
            "ALTER TABLE {} ADD COLUMN IF NOT EXISTS {} {} {}",
            quote_ident(table),
            quote_ident(parts[0]),
            parts[1],
            parts[2]
        ),
        2 => format!(
            "ALTER TABLE {} ADD COLUMN IF NOT EXISTS {} {}",
            quote_ident(table),
            quote_ident(parts[0]),
            parts[1]
        ),
        _ => format!(
            "ALTER TABLE {} ADD COLUMN {}",
            quote_ident(table),
            column_def
        ),
    }
}

/// Build DROP COLUMN SQL.
pub(crate) fn build_drop_column_sql(table: &str, column: &str) -> String {
    format!(
        "ALTER TABLE {} DROP COLUMN IF EXISTS {}",
        quote_ident(table),
        quote_ident(column)
    )
}

/// Build RENAME COLUMN SQL.
pub(crate) fn build_rename_column_sql(table: &str, old_name: &str, new_name: &str) -> String {
    format!(
        "ALTER TABLE {} RENAME COLUMN {} TO {}",
        quote_ident(table),
        quote_ident(old_name),
        quote_ident(new_name)
    )
}

/// Build CREATE INDEX SQL.
///
/// Options is a string with space-separated key:value pairs:
/// - `unique:true` -- creates a UNIQUE index
/// - `name:idx_name` -- preserves the exact index name instead of deriving one
/// - `where:condition` -- adds a WHERE clause for partial index
///
/// Each column may optionally end with `:ASC` or `:DESC`. The neutral parser
/// intentionally rejects any other suffix so PostgreSQL-specific features like
/// opclasses stay behind explicit `Pg.*` helpers.
#[derive(Debug, Default, PartialEq, Eq)]
struct CreateIndexOptions {
    is_unique: bool,
    name: Option<String>,
    where_clause: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
struct IndexColumnSpec {
    name: String,
    direction: Option<&'static str>,
}

fn parse_create_index_options(options: &str) -> Result<CreateIndexOptions, String> {
    let trimmed = options.trim();
    if trimmed.is_empty() {
        return Ok(CreateIndexOptions::default());
    }

    let (head, where_clause) = if let Some(where_start) = trimmed.find("where:") {
        (
            trimmed[..where_start].trim_end(),
            Some(trimmed[where_start + 6..].trim().to_string()),
        )
    } else {
        (trimmed, None)
    };

    let mut parsed = CreateIndexOptions {
        where_clause,
        ..CreateIndexOptions::default()
    };

    for token in head.split_whitespace() {
        let Some((key, value)) = token.split_once(':') else {
            return Err(format!(
                "Migration.create_index options: invalid token `{token}`"
            ));
        };
        match key {
            "unique" => match value {
                "true" => parsed.is_unique = true,
                "false" => parsed.is_unique = false,
                _ => {
                    return Err(format!(
                        "Migration.create_index options: unique must be `true` or `false`, got `{value}`"
                    ));
                }
            },
            "name" => {
                if value.trim().is_empty() {
                    return Err(
                        "Migration.create_index options: name must not be empty".to_string(),
                    );
                }
                parsed.name = Some(value.trim().to_string());
            }
            "where" => {
                return Err(
                    "Migration.create_index options: where clause must come last".to_string(),
                );
            }
            other => {
                return Err(format!(
                    "Migration.create_index options: unsupported option `{other}`"
                ));
            }
        }
    }

    if matches!(parsed.where_clause.as_deref(), Some("")) {
        return Err("Migration.create_index options: where clause must not be empty".to_string());
    }

    Ok(parsed)
}

fn parse_index_column(column: &str) -> Result<IndexColumnSpec, String> {
    let trimmed = column.trim();
    if trimmed.is_empty() {
        return Err("Migration.create_index columns: column name must not be empty".to_string());
    }

    if let Some((name, suffix)) = trimmed.rsplit_once(':') {
        let name = name.trim();
        let suffix = suffix.trim();
        let direction = if suffix.eq_ignore_ascii_case("ASC") {
            Some("ASC")
        } else if suffix.eq_ignore_ascii_case("DESC") {
            Some("DESC")
        } else {
            None
        };

        if let Some(direction) = direction {
            if name.is_empty() {
                return Err(
                    "Migration.create_index columns: column name must not be empty".to_string(),
                );
            }
            return Ok(IndexColumnSpec {
                name: name.to_string(),
                direction: Some(direction),
            });
        }

        return Err(format!(
            "Migration.create_index columns: `{trimmed}` only supports :ASC or :DESC order suffixes"
        ));
    }

    Ok(IndexColumnSpec {
        name: trimmed.to_string(),
        direction: None,
    })
}

pub(crate) fn build_create_index_sql(
    table: &str,
    columns: &[String],
    options: &str,
) -> Result<String, String> {
    let parsed_options = parse_create_index_options(options)?;
    let parsed_columns: Vec<IndexColumnSpec> = columns
        .iter()
        .map(|column| parse_index_column(column))
        .collect::<Result<_, _>>()?;

    if parsed_columns.is_empty() {
        return Err("Migration.create_index columns: at least one column is required".to_string());
    }

    let index_name = parsed_options.name.unwrap_or_else(|| {
        let column_suffix = parsed_columns
            .iter()
            .map(|column| column.name.as_str())
            .collect::<Vec<_>>()
            .join("_");
        format!("idx_{table}_{column_suffix}")
    });

    let mut sql = String::new();
    sql.push_str("CREATE ");
    if parsed_options.is_unique {
        sql.push_str("UNIQUE ");
    }
    sql.push_str("INDEX IF NOT EXISTS ");
    sql.push_str(&quote_ident(&index_name));
    sql.push_str(" ON ");
    sql.push_str(&quote_ident(table));
    sql.push_str(" (");
    let rendered_columns: Vec<String> = parsed_columns
        .iter()
        .map(|column| match column.direction {
            Some(direction) => format!("{} {}", quote_ident(&column.name), direction),
            None => quote_ident(&column.name),
        })
        .collect();
    sql.push_str(&rendered_columns.join(", "));
    sql.push(')');

    if let Some(where_clause) = parsed_options.where_clause {
        sql.push_str(" WHERE ");
        sql.push_str(&where_clause);
    }

    Ok(sql)
}

/// Build DROP INDEX SQL.
///
/// The index name is derived as `idx_{table}_{col1}_{col2}` to match
/// the convention used by `build_create_index_sql`.
pub(crate) fn build_drop_index_sql(table: &str, columns: &[String]) -> String {
    let index_name = format!("idx_{}_{}", table, columns.join("_"));
    format!("DROP INDEX IF EXISTS {}", quote_ident(&index_name))
}

// ── Extern C wrappers ───────────────────────────────────────────────

/// Create a table with the given column definitions.
///
/// # Signature
///
/// `mesh_migration_create_table(pool: u64, table: ptr, columns: ptr) -> ptr`
///
/// - `pool`: Pool handle (i64/u64)
/// - `table`: MeshString table name
/// - `columns`: List<String> of colon-separated column definitions
///
/// Returns: Result<Int, String> (from Pool.execute)
#[no_mangle]
pub extern "C" fn mesh_migration_create_table(
    pool: u64,
    table: *const MeshString,
    columns: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let cols = list_to_strings(columns);
        let sql = build_create_table_sql(table_name, &cols);
        let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
        let empty_params = mesh_list_new();
        mesh_pool_execute(pool, sql_ptr, empty_params)
    }
}

/// Drop a table.
///
/// # Signature
///
/// `mesh_migration_drop_table(pool: u64, table: ptr) -> ptr`
#[no_mangle]
pub extern "C" fn mesh_migration_drop_table(pool: u64, table: *const MeshString) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let sql = build_drop_table_sql(table_name);
        let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
        let empty_params = mesh_list_new();
        mesh_pool_execute(pool, sql_ptr, empty_params)
    }
}

/// Add a column to an existing table.
///
/// # Signature
///
/// `mesh_migration_add_column(pool: u64, table: ptr, column_def: ptr) -> ptr`
#[no_mangle]
pub extern "C" fn mesh_migration_add_column(
    pool: u64,
    table: *const MeshString,
    column_def: *const MeshString,
) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let col_def = (*column_def).as_str();
        let sql = build_add_column_sql(table_name, col_def);
        let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
        let empty_params = mesh_list_new();
        mesh_pool_execute(pool, sql_ptr, empty_params)
    }
}

/// Drop a column from an existing table.
///
/// # Signature
///
/// `mesh_migration_drop_column(pool: u64, table: ptr, column: ptr) -> ptr`
#[no_mangle]
pub extern "C" fn mesh_migration_drop_column(
    pool: u64,
    table: *const MeshString,
    column: *const MeshString,
) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let col_name = (*column).as_str();
        let sql = build_drop_column_sql(table_name, col_name);
        let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
        let empty_params = mesh_list_new();
        mesh_pool_execute(pool, sql_ptr, empty_params)
    }
}

/// Rename a column in an existing table.
///
/// # Signature
///
/// `mesh_migration_rename_column(pool: u64, table: ptr, old_name: ptr, new_name: ptr) -> ptr`
#[no_mangle]
pub extern "C" fn mesh_migration_rename_column(
    pool: u64,
    table: *const MeshString,
    old_name: *const MeshString,
    new_name: *const MeshString,
) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let old = (*old_name).as_str();
        let new = (*new_name).as_str();
        let sql = build_rename_column_sql(table_name, old, new);
        let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
        let empty_params = mesh_list_new();
        mesh_pool_execute(pool, sql_ptr, empty_params)
    }
}

/// Create an index on the given columns.
///
/// # Signature
///
/// `mesh_migration_create_index(pool: u64, table: ptr, columns: ptr, options: ptr) -> ptr`
///
/// Options: `"unique:true"` for unique index, `"where:condition"` for partial.
#[no_mangle]
pub extern "C" fn mesh_migration_create_index(
    pool: u64,
    table: *const MeshString,
    columns: *mut u8,
    options: *const MeshString,
) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let cols = list_to_strings(columns);
        let opts = (*options).as_str();
        match build_create_index_sql(table_name, &cols, opts) {
            Ok(sql) => {
                let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
                let empty_params = mesh_list_new();
                mesh_pool_execute(pool, sql_ptr, empty_params)
            }
            Err(message) => err_result(&message),
        }
    }
}

/// Drop an index (derived name: idx_{table}_{col1}_{col2}).
///
/// # Signature
///
/// `mesh_migration_drop_index(pool: u64, table: ptr, columns: ptr) -> ptr`
#[no_mangle]
pub extern "C" fn mesh_migration_drop_index(
    pool: u64,
    table: *const MeshString,
    columns: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_name = (*table).as_str();
        let cols = list_to_strings(columns);
        let sql = build_drop_index_sql(table_name, &cols);
        let sql_ptr = rust_string_to_mesh(&sql) as *const MeshString;
        let empty_params = mesh_list_new();
        mesh_pool_execute(pool, sql_ptr, empty_params)
    }
}

/// Execute raw SQL (escape hatch for operations not covered by the DSL).
///
/// # Signature
///
/// `mesh_migration_execute(pool: u64, sql: ptr) -> ptr`
#[no_mangle]
pub extern "C" fn mesh_migration_execute(pool: u64, sql: *const MeshString) -> *mut u8 {
    let empty_params = mesh_list_new();
    mesh_pool_execute(pool, sql, empty_params)
}

// ── Unit tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_create_table_sql() {
        let sql = build_create_table_sql(
            "users",
            &[
                "id:UUID:PRIMARY KEY".to_string(),
                "name:TEXT:NOT NULL".to_string(),
                "age:BIGINT".to_string(),
            ],
        );
        assert_eq!(
            sql,
            "CREATE TABLE IF NOT EXISTS \"users\" (\"id\" UUID PRIMARY KEY, \"name\" TEXT NOT NULL, \"age\" BIGINT)"
        );
    }

    #[test]
    fn test_build_create_table_sql_two_part_columns() {
        let sql = build_create_table_sql(
            "posts",
            &["id:SERIAL".to_string(), "title:TEXT".to_string()],
        );
        assert_eq!(
            sql,
            "CREATE TABLE IF NOT EXISTS \"posts\" (\"id\" SERIAL, \"title\" TEXT)"
        );
    }

    #[test]
    fn test_build_drop_table_sql() {
        let sql = build_drop_table_sql("users");
        assert_eq!(sql, "DROP TABLE IF EXISTS \"users\"");
    }

    #[test]
    fn test_build_add_column_sql() {
        let sql = build_add_column_sql("users", "age:BIGINT:NOT NULL DEFAULT 0");
        assert_eq!(
            sql,
            "ALTER TABLE \"users\" ADD COLUMN IF NOT EXISTS \"age\" BIGINT NOT NULL DEFAULT 0"
        );
    }

    #[test]
    fn test_build_add_column_sql_two_part() {
        let sql = build_add_column_sql("users", "bio:TEXT");
        assert_eq!(
            sql,
            "ALTER TABLE \"users\" ADD COLUMN IF NOT EXISTS \"bio\" TEXT"
        );
    }

    #[test]
    fn test_build_drop_column_sql() {
        let sql = build_drop_column_sql("users", "age");
        assert_eq!(sql, "ALTER TABLE \"users\" DROP COLUMN IF EXISTS \"age\"");
    }

    #[test]
    fn test_build_rename_column_sql() {
        let sql = build_rename_column_sql("users", "name", "full_name");
        assert_eq!(
            sql,
            "ALTER TABLE \"users\" RENAME COLUMN \"name\" TO \"full_name\""
        );
    }

    #[test]
    fn test_build_create_index_sql() {
        let sql = build_create_index_sql("users", &["email".to_string()], "")
            .expect("plain index SQL should build");
        assert_eq!(
            sql,
            "CREATE INDEX IF NOT EXISTS \"idx_users_email\" ON \"users\" (\"email\")"
        );
    }

    #[test]
    fn test_build_create_index_sql_unique() {
        let sql = build_create_index_sql("users", &["email".to_string()], "unique:true")
            .expect("unique index SQL should build");
        assert_eq!(
            sql,
            "CREATE UNIQUE INDEX IF NOT EXISTS \"idx_users_email\" ON \"users\" (\"email\")"
        );
    }

    #[test]
    fn test_build_create_index_sql_multi_column() {
        let sql = build_create_index_sql(
            "orders",
            &["user_id".to_string(), "status".to_string()],
            "",
        )
        .expect("multi-column index SQL should build");
        assert_eq!(
            sql,
            "CREATE INDEX IF NOT EXISTS \"idx_orders_user_id_status\" ON \"orders\" (\"user_id\", \"status\")"
        );
    }

    #[test]
    fn test_build_create_index_sql_partial() {
        let sql = build_create_index_sql(
            "users",
            &["email".to_string()],
            "unique:true where:active = true",
        )
        .expect("partial index SQL should build");
        assert_eq!(
            sql,
            "CREATE UNIQUE INDEX IF NOT EXISTS \"idx_users_email\" ON \"users\" (\"email\") WHERE active = true"
        );
    }

    #[test]
    fn test_build_create_index_sql_preserves_exact_name_and_ordered_columns() {
        let sql = build_create_index_sql(
            "issues",
            &["project_id".to_string(), "last_seen:DESC".to_string()],
            "name:idx_issues_project_last_seen where:status = 'open'",
        )
        .expect("ordered named index SQL should build");
        assert_eq!(
            sql,
            "CREATE INDEX IF NOT EXISTS \"idx_issues_project_last_seen\" ON \"issues\" (\"project_id\", \"last_seen\" DESC) WHERE status = 'open'"
        );
    }

    #[test]
    fn test_build_create_index_sql_rejects_pg_only_column_suffixes() {
        let err = build_create_index_sql("events", &["tags:jsonb_path_ops".to_string()], "")
            .expect_err("PG-only opclass syntax must stay out of Migration.create_index");
        assert_eq!(
            err,
            "Migration.create_index columns: `tags:jsonb_path_ops` only supports :ASC or :DESC order suffixes"
        );
    }

    #[test]
    fn test_build_create_index_sql_rejects_unsupported_options() {
        let err = build_create_index_sql("events", &["tags".to_string()], "using:gin")
            .expect_err("PG-only index method options must stay out of Migration.create_index");
        assert_eq!(
            err,
            "Migration.create_index options: unsupported option `using`"
        );
    }

    #[test]
    fn test_build_drop_index_sql() {
        let sql = build_drop_index_sql("users", &["email".to_string()]);
        assert_eq!(sql, "DROP INDEX IF EXISTS \"idx_users_email\"");
    }

    #[test]
    fn test_build_drop_index_sql_multi_column() {
        let sql = build_drop_index_sql("orders", &["user_id".to_string(), "status".to_string()]);
        assert_eq!(sql, "DROP INDEX IF EXISTS \"idx_orders_user_id_status\"");
    }

    #[test]
    fn test_quote_ident_with_double_quotes() {
        // Table name with embedded double quote should be escaped
        let sql = build_drop_table_sql("my\"table");
        assert_eq!(sql, "DROP TABLE IF EXISTS \"my\"\"table\"");
    }
}
