//! Repo (repository) module for the Mesh runtime.
//!
//! Provides stateless database operations that consume Query structs
//! (built by the Query module) and execute them via Pool.query. Each read
//! function reads the Query object's 13 slots to build parameterized SQL,
//! then delegates to `mesh_pool_query` for execution. Write functions use
//! the ORM SQL builders from orm.rs with RETURNING * clauses.
//!
//! ## Read Functions
//!
//! - `mesh_repo_all`: Execute query, return all matching rows
//! - `mesh_repo_one`: Execute query with LIMIT 1, return first row or error
//! - `mesh_repo_get`: Fetch single row by primary key
//! - `mesh_repo_get_by`: Fetch single row by field condition
//! - `mesh_repo_count`: Return integer count of matching rows
//! - `mesh_repo_exists`: Return boolean existence check
//!
//! ## Write Functions
//!
//! - `mesh_repo_insert`: INSERT with RETURNING *, accepts Map<String,String> fields
//! - `mesh_repo_update`: UPDATE with RETURNING *, accepts id + Map<String,String> fields
//! - `mesh_repo_delete`: DELETE with RETURNING *, accepts id
//! - `mesh_repo_transaction`: Wraps callback in checkout/begin/commit-or-rollback/checkin

use crate::collections::list::{mesh_list_append, mesh_list_get, mesh_list_length, mesh_list_new};
use crate::collections::map::{mesh_map_get, mesh_map_put};
use crate::db::changeset::{
    add_constraint_error_to_changeset, map_constraint_error, SLOT_CHANGES, SLOT_VALID,
};
use crate::db::expr::{clone_expr, serialize_expr, SqlExpr};
use crate::db::pg::{mesh_pg_begin, mesh_pg_commit, mesh_pg_rollback};
use crate::db::pool::{mesh_pool_checkin, mesh_pool_checkout, mesh_pool_execute, mesh_pool_query};
use crate::io::{alloc_result, MeshResult};
use crate::string::{mesh_string_new, MeshString};

// ── Helpers ──────────────────────────────────────────────────────────

/// Extract a Rust &str from a raw MeshString pointer.
unsafe fn mesh_str_ref(ptr: *mut u8) -> &'static str {
    let ms = ptr as *const MeshString;
    (*ms).as_str()
}

/// Create a MeshString from a Rust &str and return as *mut u8.
unsafe fn rust_str_to_mesh(s: &str) -> *mut u8 {
    mesh_string_new(s.as_ptr(), s.len() as u64) as *mut u8
}

/// Create an error MeshResult from a Rust string.
fn err_result(msg: &str) -> *mut u8 {
    unsafe {
        let s = rust_str_to_mesh(msg);
        alloc_result(1, s) as *mut u8
    }
}

/// Create an Ok MeshResult wrapping a value pointer.
fn ok_result(value: *mut u8) -> *mut u8 {
    alloc_result(0, value) as *mut u8
}

/// Quote a SQL identifier with double quotes (PostgreSQL convention).
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

/// Build a Mesh List<String> from a Vec of Rust strings.
unsafe fn strings_to_mesh_list(strings: &[String]) -> *mut u8 {
    let mut list = mesh_list_new();
    for s in strings {
        let ms = rust_str_to_mesh(s);
        list = mesh_list_append(list, ms as u64);
    }
    list
}

// ── Query slot access ────────────────────────────────────────────────

// Slot indices (must match query.rs exactly)
const SLOT_SOURCE: usize = 0;
const SLOT_SELECT: usize = 1;
const SLOT_WHERE_CLAUSES: usize = 2;
const SLOT_WHERE_PARAMS: usize = 3;
const SLOT_ORDER: usize = 4;
const SLOT_LIMIT: usize = 5;
const SLOT_OFFSET: usize = 6;
const SLOT_JOIN: usize = 7;
const SLOT_GROUP: usize = 8;
const SLOT_HAVING_CLAUSES: usize = 9;
const SLOT_HAVING_PARAMS: usize = 10;
const SLOT_FRAGMENT_PARTS: usize = 11;
const SLOT_FRAGMENT_PARAMS: usize = 12;
const SLOT_SELECT_PARAMS: usize = 13;

unsafe fn query_get(q: *mut u8, slot: usize) -> *mut u8 {
    *(q.add(slot * 8) as *mut *mut u8)
}

unsafe fn query_get_int(q: *mut u8, slot: usize) -> i64 {
    *(q.add(slot * 8) as *mut i64)
}

// ── Placeholder renumbering helper ───────────────────────────────────

/// Renumber $N placeholders in a SQL fragment.
/// E.g., with start_idx=4: "$1" -> "$4", "$2" -> "$5"
/// Also replaces `?` with next sequential $N.
/// Returns (renumbered_sql, number_of_params_consumed).
fn renumber_placeholders(sql: &str, start_idx: usize) -> (String, usize) {
    let mut result = String::with_capacity(sql.len());
    let mut max_placeholder = 0usize;
    let mut question_count = 0usize;
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '?' {
            let new_idx = start_idx + question_count;
            result.push_str(&format!("${}", new_idx));
            question_count += 1;
            i += 1;
        } else if chars[i] == '$' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit() {
            // Parse the number after $
            let mut num_str = String::new();
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_ascii_digit() {
                num_str.push(chars[j]);
                j += 1;
            }
            if let Ok(n) = num_str.parse::<usize>() {
                if n > max_placeholder {
                    max_placeholder = n;
                }
                let new_idx = start_idx + n - 1; // $1 -> $start_idx, $2 -> $start_idx+1
                result.push_str(&format!("${}", new_idx));
            } else {
                result.push('$');
                result.push_str(&num_str);
            }
            i = j;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    let params_consumed = if question_count > 0 {
        question_count
    } else {
        max_placeholder
    };
    (result, params_consumed)
}

// ── Comprehensive SQL Builder ────────────────────────────────────────

/// Read all 13 slots of a Query struct and produce a complete SELECT SQL
/// statement with parameterized placeholders, plus the parameter values list.
///
/// Returns `(sql_string, params_vec)` as pure Rust types.
unsafe fn query_to_select_sql(query: *mut u8) -> (String, Vec<String>) {
    let source_ptr = query_get(query, SLOT_SOURCE);
    let source = mesh_str_ref(source_ptr);
    let select_fields = list_to_strings(query_get(query, SLOT_SELECT));
    let select_params = list_to_strings(query_get(query, SLOT_SELECT_PARAMS));
    let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
    let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));
    let order_fields = list_to_strings(query_get(query, SLOT_ORDER));
    let limit_val = query_get_int(query, SLOT_LIMIT);
    let offset_val = query_get_int(query, SLOT_OFFSET);
    let join_clauses = list_to_strings(query_get(query, SLOT_JOIN));
    let group_fields = list_to_strings(query_get(query, SLOT_GROUP));
    let having_clauses = list_to_strings(query_get(query, SLOT_HAVING_CLAUSES));
    let having_params = list_to_strings(query_get(query, SLOT_HAVING_PARAMS));
    let fragment_parts = list_to_strings(query_get(query, SLOT_FRAGMENT_PARTS));
    let fragment_params = list_to_strings(query_get(query, SLOT_FRAGMENT_PARAMS));

    build_select_sql_from_parts_with_select_params(
        source,
        &select_fields,
        &select_params,
        &where_clauses,
        &where_params,
        &order_fields,
        limit_val,
        offset_val,
        &join_clauses,
        &group_fields,
        &having_clauses,
        &having_params,
        &fragment_parts,
        &fragment_params,
    )
}

/// Pure Rust SQL builder from decomposed Query parts.
/// Separated for testability without GC.
#[allow(dead_code)]
fn build_select_sql_from_parts(
    source: &str,
    select_fields: &[String],
    where_clauses: &[String],
    where_params: &[String],
    order_fields: &[String],
    limit_val: i64,
    offset_val: i64,
    join_clauses: &[String],
    group_fields: &[String],
    having_clauses: &[String],
    having_params: &[String],
    fragment_parts: &[String],
    fragment_params: &[String],
) -> (String, Vec<String>) {
    build_select_sql_from_parts_with_select_params(
        source,
        select_fields,
        &[],
        where_clauses,
        where_params,
        order_fields,
        limit_val,
        offset_val,
        join_clauses,
        group_fields,
        having_clauses,
        having_params,
        fragment_parts,
        fragment_params,
    )
}

fn build_select_sql_from_parts_with_select_params(
    source: &str,
    select_fields: &[String],
    select_params: &[String],
    where_clauses: &[String],
    where_params: &[String],
    order_fields: &[String],
    limit_val: i64,
    offset_val: i64,
    join_clauses: &[String],
    group_fields: &[String],
    having_clauses: &[String],
    having_params: &[String],
    fragment_parts: &[String],
    fragment_params: &[String],
) -> (String, Vec<String>) {
    let mut sql = String::new();
    let mut params: Vec<String> = Vec::new();
    let mut param_idx = 1usize;

    // SELECT clause
    sql.push_str("SELECT ");
    if select_fields.is_empty() {
        sql.push('*');
    } else {
        let mut cols = Vec::with_capacity(select_fields.len());
        let mut select_param_idx = 0usize;
        for field in select_fields {
            if let Some(raw) = field.strip_prefix("RAW:") {
                cols.push(raw.to_string());
                continue;
            }
            if let Some(expr_sql) = field.strip_prefix("EXPR:") {
                let (renumbered, consumed) = renumber_placeholders(expr_sql, param_idx);
                cols.push(renumbered);
                for _ in 0..consumed {
                    if select_param_idx < select_params.len() {
                        params.push(select_params[select_param_idx].clone());
                        select_param_idx += 1;
                    }
                    param_idx += 1;
                }
                continue;
            }
            cols.push(quote_ident(field));
        }
        sql.push_str(&cols.join(", "));
    }

    // FROM clause
    sql.push_str(&format!(" FROM {}", quote_ident(source)));

    // JOIN clauses (format: "TYPE:table:on_clause" or "ALIAS:TYPE:table:alias:on_clause")
    for join in join_clauses {
        if let Some(rest) = join.strip_prefix("ALIAS:") {
            let parts: Vec<&str> = rest.splitn(4, ':').collect();
            if parts.len() == 4 {
                sql.push_str(&format!(
                    " {} JOIN {} {} ON {}",
                    parts[0],              // join type (INNER, LEFT)
                    quote_ident(parts[1]), // table name
                    parts[2],              // alias (unquoted)
                    parts[3]               // on clause
                ));
            }
        } else {
            let parts: Vec<&str> = join.splitn(3, ':').collect();
            if parts.len() == 3 {
                sql.push_str(&format!(
                    " {} JOIN {} ON {}",
                    parts[0],
                    quote_ident(parts[1]),
                    parts[2]
                ));
            }
        }
    }

    // WHERE clause
    if !where_clauses.is_empty() {
        let (where_sql, where_param_values, next_param_idx) =
            build_where_from_query_parts(where_clauses, where_params, param_idx);
        sql.push_str(&format!(" WHERE {}", where_sql));
        params.extend(where_param_values);
        param_idx = next_param_idx;
    }

    // GROUP BY clause
    if !group_fields.is_empty() {
        let cols: Vec<String> = group_fields
            .iter()
            .map(|f| {
                if let Some(raw) = f.strip_prefix("RAW:") {
                    raw.to_string() // emit verbatim
                } else {
                    quote_ident(f)
                }
            })
            .collect();
        sql.push_str(&format!(" GROUP BY {}", cols.join(", ")));
    }

    // HAVING clause
    if !having_clauses.is_empty() {
        sql.push_str(" HAVING ");
        let mut having_parts_sql = Vec::new();
        for clause in having_clauses {
            having_parts_sql.push(format!("{} ${}", clause, param_idx));
            param_idx += 1;
        }
        sql.push_str(&having_parts_sql.join(" AND "));
        for p in having_params {
            params.push(p.clone());
        }
    }

    // Fragment injection (raw SQL appended, with $N renumbering)
    for frag in fragment_parts {
        let (renumbered, consumed) = renumber_placeholders(frag, param_idx);
        sql.push_str(&format!(" {}", renumbered));
        param_idx += consumed;
    }
    for p in fragment_params {
        params.push(p.clone());
    }

    // ORDER BY clause
    if !order_fields.is_empty() {
        sql.push_str(" ORDER BY ");
        let orders: Vec<String> = order_fields
            .iter()
            .map(|o| {
                if let Some(raw) = o.strip_prefix("RAW:") {
                    raw.to_string() // emit verbatim
                } else if let Some(space_pos) = o.rfind(' ') {
                    let col = &o[..space_pos];
                    let dir = &o[space_pos + 1..];
                    format!("{} {}", quote_ident(col), dir)
                } else {
                    format!("{} ASC", quote_ident(o))
                }
            })
            .collect();
        sql.push_str(&orders.join(", "));
    }

    // LIMIT clause
    if limit_val >= 0 {
        sql.push_str(&format!(" LIMIT {}", limit_val));
    }

    // OFFSET clause
    if offset_val >= 0 {
        sql.push_str(&format!(" OFFSET {}", offset_val));
    }

    (sql, params)
}

/// Build SQL for count queries: SELECT COUNT(*) FROM ... WHERE ...
/// (reuses WHERE/JOIN/GROUP/HAVING/FRAGMENT logic but overrides SELECT)
unsafe fn query_to_count_sql(query: *mut u8) -> (String, Vec<String>) {
    let source_ptr = query_get(query, SLOT_SOURCE);
    let source = mesh_str_ref(source_ptr);
    let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
    let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));
    let join_clauses = list_to_strings(query_get(query, SLOT_JOIN));
    let group_fields = list_to_strings(query_get(query, SLOT_GROUP));
    let having_clauses = list_to_strings(query_get(query, SLOT_HAVING_CLAUSES));
    let having_params = list_to_strings(query_get(query, SLOT_HAVING_PARAMS));
    let fragment_parts = list_to_strings(query_get(query, SLOT_FRAGMENT_PARTS));
    let fragment_params = list_to_strings(query_get(query, SLOT_FRAGMENT_PARAMS));

    build_count_sql_from_parts(
        source,
        &where_clauses,
        &where_params,
        &join_clauses,
        &group_fields,
        &having_clauses,
        &having_params,
        &fragment_parts,
        &fragment_params,
    )
}

fn build_count_sql_from_parts(
    source: &str,
    where_clauses: &[String],
    where_params: &[String],
    join_clauses: &[String],
    group_fields: &[String],
    having_clauses: &[String],
    having_params: &[String],
    fragment_parts: &[String],
    fragment_params: &[String],
) -> (String, Vec<String>) {
    let mut sql = String::new();
    let mut params: Vec<String> = Vec::new();
    let mut param_idx = 1usize;

    sql.push_str(&format!("SELECT COUNT(*) FROM {}", quote_ident(source)));

    // JOIN clauses (format: "TYPE:table:on_clause" or "ALIAS:TYPE:table:alias:on_clause")
    for join in join_clauses {
        if let Some(rest) = join.strip_prefix("ALIAS:") {
            let parts: Vec<&str> = rest.splitn(4, ':').collect();
            if parts.len() == 4 {
                sql.push_str(&format!(
                    " {} JOIN {} {} ON {}",
                    parts[0],
                    quote_ident(parts[1]),
                    parts[2],
                    parts[3]
                ));
            }
        } else {
            let parts: Vec<&str> = join.splitn(3, ':').collect();
            if parts.len() == 3 {
                sql.push_str(&format!(
                    " {} JOIN {} ON {}",
                    parts[0],
                    quote_ident(parts[1]),
                    parts[2]
                ));
            }
        }
    }

    // WHERE clause
    if !where_clauses.is_empty() {
        let (where_sql, where_param_values, next_param_idx) =
            build_where_from_query_parts(where_clauses, where_params, param_idx);
        sql.push_str(&format!(" WHERE {}", where_sql));
        params.extend(where_param_values);
        param_idx = next_param_idx;
    }

    // GROUP BY clause
    if !group_fields.is_empty() {
        let cols: Vec<String> = group_fields
            .iter()
            .map(|f| {
                if let Some(raw) = f.strip_prefix("RAW:") {
                    raw.to_string()
                } else {
                    quote_ident(f)
                }
            })
            .collect();
        sql.push_str(&format!(" GROUP BY {}", cols.join(", ")));
    }

    // HAVING clause
    if !having_clauses.is_empty() {
        sql.push_str(" HAVING ");
        let mut having_parts_sql = Vec::new();
        for clause in having_clauses {
            having_parts_sql.push(format!("{} ${}", clause, param_idx));
            param_idx += 1;
        }
        sql.push_str(&having_parts_sql.join(" AND "));
        for p in having_params {
            params.push(p.clone());
        }
    }

    // Fragment injection (raw SQL appended, with $N renumbering)
    for frag in fragment_parts {
        let (renumbered, consumed) = renumber_placeholders(frag, param_idx);
        sql.push_str(&format!(" {}", renumbered));
        param_idx += consumed;
    }
    for p in fragment_params {
        params.push(p.clone());
    }

    (sql, params)
}

/// Build SQL for exists queries: SELECT EXISTS(SELECT 1 FROM ... WHERE ... LIMIT 1)
unsafe fn query_to_exists_sql(query: *mut u8) -> (String, Vec<String>) {
    let source_ptr = query_get(query, SLOT_SOURCE);
    let source = mesh_str_ref(source_ptr);
    let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
    let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));
    let join_clauses = list_to_strings(query_get(query, SLOT_JOIN));

    build_exists_sql_from_parts(source, &where_clauses, &where_params, &join_clauses)
}

fn build_exists_sql_from_parts(
    source: &str,
    where_clauses: &[String],
    where_params: &[String],
    join_clauses: &[String],
) -> (String, Vec<String>) {
    let mut inner_sql = String::new();
    let mut params: Vec<String> = Vec::new();
    let param_idx = 1usize;

    inner_sql.push_str(&format!("SELECT 1 FROM {}", quote_ident(source)));

    // JOIN clauses (format: "TYPE:table:on_clause" or "ALIAS:TYPE:table:alias:on_clause")
    for join in join_clauses {
        if let Some(rest) = join.strip_prefix("ALIAS:") {
            let parts: Vec<&str> = rest.splitn(4, ':').collect();
            if parts.len() == 4 {
                inner_sql.push_str(&format!(
                    " {} JOIN {} {} ON {}",
                    parts[0],
                    quote_ident(parts[1]),
                    parts[2],
                    parts[3]
                ));
            }
        } else {
            let parts: Vec<&str> = join.splitn(3, ':').collect();
            if parts.len() == 3 {
                inner_sql.push_str(&format!(
                    " {} JOIN {} ON {}",
                    parts[0],
                    quote_ident(parts[1]),
                    parts[2]
                ));
            }
        }
    }

    // WHERE clause
    if !where_clauses.is_empty() {
        let (where_sql, where_param_values, _next_param_idx) =
            build_where_from_query_parts(where_clauses, where_params, param_idx);
        inner_sql.push_str(&format!(" WHERE {}", where_sql));
        params.extend(where_param_values);
    }

    inner_sql.push_str(" LIMIT 1");

    let sql = format!("SELECT EXISTS({})", inner_sql);
    (sql, params)
}

// ── Extern C functions ───────────────────────────────────────────────

/// Execute a query and return all matching rows.
///
/// `Repo.all(pool, query)` -> `Result<List<Map<String,String>>, String>`
///
/// Reads the Query struct's slots, builds complete SELECT SQL with all
/// clause types, and executes via Pool.query.
#[no_mangle]
pub extern "C" fn mesh_repo_all(pool: u64, query: *mut u8) -> *mut u8 {
    unsafe {
        let (sql, params) = query_to_select_sql(query);
        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        mesh_pool_query(pool, sql_ptr, params_ptr)
    }
}

/// Execute a query and return the first matching row or error.
///
/// `Repo.one(pool, query)` -> `Result<Map<String,String>, String>`
///
/// Adds LIMIT 1 to the query, executes, and extracts the first row.
/// Returns Err("not found") if no rows match.
#[no_mangle]
pub extern "C" fn mesh_repo_one(pool: u64, query: *mut u8) -> *mut u8 {
    unsafe {
        // Read the query but force limit to 1
        let source_ptr = query_get(query, SLOT_SOURCE);
        let source = mesh_str_ref(source_ptr);
        let select_fields = list_to_strings(query_get(query, SLOT_SELECT));
        let select_params = list_to_strings(query_get(query, SLOT_SELECT_PARAMS));
        let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
        let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));
        let order_fields = list_to_strings(query_get(query, SLOT_ORDER));
        let offset_val = query_get_int(query, SLOT_OFFSET);
        let join_clauses = list_to_strings(query_get(query, SLOT_JOIN));
        let group_fields = list_to_strings(query_get(query, SLOT_GROUP));
        let having_clauses = list_to_strings(query_get(query, SLOT_HAVING_CLAUSES));
        let having_params = list_to_strings(query_get(query, SLOT_HAVING_PARAMS));
        let fragment_parts = list_to_strings(query_get(query, SLOT_FRAGMENT_PARTS));
        let fragment_params = list_to_strings(query_get(query, SLOT_FRAGMENT_PARAMS));

        let (sql, params) = build_select_sql_from_parts_with_select_params(
            source,
            &select_fields,
            &select_params,
            &where_clauses,
            &where_params,
            &order_fields,
            1, // force LIMIT 1
            offset_val,
            &join_clauses,
            &group_fields,
            &having_clauses,
            &having_params,
            &fragment_parts,
            &fragment_params,
        );

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        // Check if query succeeded
        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result; // propagate query error
        }

        // Extract first row from the result list
        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("not found");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Fetch a single row by primary key.
///
/// `Repo.get(pool, table, id)` -> `Result<Map<String,String>, String>`
///
/// Builds: `SELECT * FROM "table" WHERE "id" = $1 LIMIT 1`
#[no_mangle]
pub extern "C" fn mesh_repo_get(pool: u64, table: *mut u8, id: *mut u8) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let sql = format!(
            "SELECT * FROM {} WHERE {} = $1 LIMIT 1",
            quote_ident(table_str),
            quote_ident("id")
        );
        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let mut params_list = mesh_list_new();
        params_list = mesh_list_append(params_list, id as u64);
        let result = mesh_pool_query(pool, sql_ptr, params_list);

        // Check if query succeeded
        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("not found");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Fetch a single row by field condition.
///
/// `Repo.get_by(pool, table, field, value)` -> `Result<Map<String,String>, String>`
///
/// Builds: `SELECT * FROM "table" WHERE "field" = $1 LIMIT 1`
#[no_mangle]
pub extern "C" fn mesh_repo_get_by(
    pool: u64,
    table: *mut u8,
    field: *mut u8,
    value: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let field_str = mesh_str_ref(field);
        let sql = format!(
            "SELECT * FROM {} WHERE {} = $1 LIMIT 1",
            quote_ident(table_str),
            quote_ident(field_str)
        );
        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let mut params_list = mesh_list_new();
        params_list = mesh_list_append(params_list, value as u64);
        let result = mesh_pool_query(pool, sql_ptr, params_list);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("not found");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Return the count of matching rows.
///
/// `Repo.count(pool, query)` -> `Result<Int, String>`
///
/// Builds: `SELECT COUNT(*) FROM "table" WHERE ...`
/// Parses the integer from the first row's first column.
#[no_mangle]
pub extern "C" fn mesh_repo_count(pool: u64, query: *mut u8) -> *mut u8 {
    unsafe {
        let (sql, params) = query_to_count_sql(query);
        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("count returned no rows");
        }

        // Get the first row (a Map<String,String>)
        let first_row = mesh_list_get(list, 0) as *mut u8;
        // Get the "count" column value
        let count_key = rust_str_to_mesh("count");
        let count_val = mesh_map_get(first_row, count_key as u64);
        if count_val == 0 {
            // No "count" key found -- try first value by any key
            return ok_result(0i64 as *mut u8);
        }

        // Parse the string value as an integer
        let count_str = mesh_str_ref(count_val as *mut u8);
        let count: i64 = count_str.parse().unwrap_or(0);
        ok_result(count as *mut u8)
    }
}

/// Check if any rows match the query.
///
/// `Repo.exists(pool, query)` -> `Result<Bool, String>`
///
/// Builds: `SELECT EXISTS(SELECT 1 FROM "table" WHERE ... LIMIT 1)`
/// Returns true (1) or false (0) as the result value.
#[no_mangle]
pub extern "C" fn mesh_repo_exists(pool: u64, query: *mut u8) -> *mut u8 {
    unsafe {
        let (sql, params) = query_to_exists_sql(query);
        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return ok_result(0i64 as *mut u8); // false
        }

        // Get the first row, extract the "exists" column
        let first_row = mesh_list_get(list, 0) as *mut u8;
        let exists_key = rust_str_to_mesh("exists");
        let exists_val = mesh_map_get(first_row, exists_key as u64);
        if exists_val == 0 {
            return ok_result(0i64 as *mut u8); // false
        }

        let exists_str = mesh_str_ref(exists_val as *mut u8);
        let exists_bool: i64 = if exists_str == "t" || exists_str == "true" || exists_str == "1" {
            1
        } else {
            0
        };
        ok_result(exists_bool as *mut u8)
    }
}

// ── Map extraction helpers ─────────────────────────────────────────

/// Map header size in bytes (must match collections/map.rs)
const MAP_HEADER_SIZE: usize = 16;

/// Extract (column_names, values) from a Mesh Map<String, String> pointer.
/// Reads the map's internal structure directly for efficiency.
unsafe fn map_to_columns_and_values(map: *mut u8) -> (Vec<String>, Vec<String>) {
    let len = *(map as *const u64) as usize;
    let entries = map.add(MAP_HEADER_SIZE) as *const [u64; 2];
    let mut columns = Vec::with_capacity(len);
    let mut values = Vec::with_capacity(len);
    for i in 0..len {
        let key_ptr = (*entries.add(i))[0] as *const MeshString;
        let val_ptr = (*entries.add(i))[1] as *const MeshString;
        if !key_ptr.is_null() {
            columns.push((*key_ptr).as_str().to_string());
        }
        if !val_ptr.is_null() {
            values.push((*val_ptr).as_str().to_string());
        } else {
            values.push(String::new());
        }
    }
    (columns, values)
}

/// Extract (column_names, expressions) from a Mesh Map<String, Ptr> pointer.
unsafe fn map_to_columns_and_exprs(map: *mut u8) -> (Vec<String>, Vec<SqlExpr>) {
    let len = *(map as *const u64) as usize;
    let entries = map.add(MAP_HEADER_SIZE) as *const [u64; 2];
    let mut columns = Vec::with_capacity(len);
    let mut exprs = Vec::with_capacity(len);
    for i in 0..len {
        let key_ptr = (*entries.add(i))[0] as *const MeshString;
        let expr_ptr = (*entries.add(i))[1] as *mut u8;
        if !key_ptr.is_null() {
            columns.push((*key_ptr).as_str().to_string());
            exprs.push(clone_expr(expr_ptr));
        }
    }
    (columns, exprs)
}

fn build_set_expr_parts(
    columns: &[String],
    exprs: &[SqlExpr],
    start_idx: usize,
) -> (Vec<String>, Vec<String>, usize) {
    let mut set_parts = Vec::with_capacity(columns.len());
    let mut params = Vec::new();
    let mut next_idx = start_idx;

    for (column, expr) in columns.iter().zip(exprs.iter()) {
        let (expr_sql_local, expr_params) = serialize_expr(expr);
        let (expr_sql, _consumed) = renumber_placeholders(&expr_sql_local, next_idx);
        next_idx += expr_params.len();
        params.extend(expr_params);
        set_parts.push(format!("{} = {}", quote_ident(column), expr_sql));
    }

    (set_parts, params, next_idx)
}

fn build_update_where_expr_sql_pure(
    table: &str,
    columns: &[String],
    exprs: &[SqlExpr],
    where_clauses: &[String],
    where_params: &[String],
) -> Result<(String, Vec<String>), &'static str> {
    if columns.is_empty() {
        return Err("update_where_expr: no fields provided");
    }
    if where_clauses.is_empty() {
        return Err("update_where_expr: no WHERE conditions");
    }

    let mut sql = format!("UPDATE {} SET ", quote_ident(table));
    let (set_parts, mut params, next_idx) = build_set_expr_parts(columns, exprs, 1);
    sql.push_str(&set_parts.join(", "));

    let (where_sql, where_param_values, _next_idx) =
        build_where_from_query_parts(where_clauses, where_params, next_idx);
    sql.push_str(&format!(" WHERE {} RETURNING *", where_sql));
    params.extend(where_param_values);

    Ok((sql, params))
}

fn build_insert_or_update_expr_sql_pure(
    table: &str,
    insert_columns: &[String],
    insert_values: &[String],
    conflict_targets: &[String],
    update_columns: &[String],
    update_exprs: &[SqlExpr],
) -> Result<(String, Vec<String>), &'static str> {
    if insert_columns.is_empty() {
        return Err("insert_or_update_expr: no fields provided");
    }
    if conflict_targets.is_empty() {
        return Err("insert_or_update_expr: no conflict targets provided");
    }
    if update_columns.is_empty() {
        return Err("insert_or_update_expr: no update fields provided");
    }

    let quoted_columns = insert_columns
        .iter()
        .map(|column| quote_ident(column))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=insert_columns.len())
        .map(|idx| format!("${idx}"))
        .collect::<Vec<_>>()
        .join(", ");
    let quoted_targets = conflict_targets
        .iter()
        .map(|target| quote_ident(target))
        .collect::<Vec<_>>()
        .join(", ");

    let (set_parts, update_params, _next_idx) =
        build_set_expr_parts(update_columns, update_exprs, insert_columns.len() + 1);

    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {} RETURNING *",
        quote_ident(table),
        quoted_columns,
        placeholders,
        quoted_targets,
        set_parts.join(", ")
    );

    let mut params = insert_values.to_vec();
    params.extend(update_params);
    Ok((sql, params))
}

fn build_insert_expr_sql_pure(
    table: &str,
    columns: &[String],
    exprs: &[SqlExpr],
) -> Result<(String, Vec<String>), &'static str> {
    if columns.is_empty() {
        return Err("insert_expr: no fields provided");
    }

    let quoted_columns = columns
        .iter()
        .map(|column| quote_ident(column))
        .collect::<Vec<_>>()
        .join(", ");

    let mut value_sql_parts = Vec::with_capacity(exprs.len());
    let mut params = Vec::new();
    let mut next_idx = 1usize;

    for expr in exprs {
        let (expr_sql_local, expr_params) = serialize_expr(expr);
        let (expr_sql, _consumed) = renumber_placeholders(&expr_sql_local, next_idx);
        next_idx += expr_params.len();
        params.extend(expr_params);
        value_sql_parts.push(expr_sql);
    }

    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({}) RETURNING *",
        quote_ident(table),
        quoted_columns,
        value_sql_parts.join(", ")
    );

    Ok((sql, params))
}

// ── Write Operations ──────────────────────────────────────────────────

/// Insert a new row and return the inserted record.
///
/// `Repo.insert(pool, table, fields_map)` -> `Result<Map<String,String>, String>`
///
/// 1. Extracts column names and values from the Map<String, String>
/// 2. Builds INSERT SQL with RETURNING * using ORM SQL builder
/// 3. Executes via Pool.query (RETURNING produces rows)
/// 4. Returns the first (inserted) row
#[no_mangle]
pub extern "C" fn mesh_repo_insert(pool: u64, table: *mut u8, fields: *mut u8) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (columns, values) = map_to_columns_and_values(fields);

        if columns.is_empty() {
            return err_result("insert: no fields provided");
        }

        // Build INSERT SQL with RETURNING *
        let returning = vec!["*".to_string()];
        let sql = crate::db::orm::build_insert_sql_pure(table_str, &columns, &returning);

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&values);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        // Check if query succeeded
        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result; // propagate query error
        }

        // Extract first row from the result list (the inserted row)
        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("insert: no row returned");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Insert a new row using expression-valued fields and return the inserted record.
///
/// `Repo.insert_expr(pool, table, expr_fields_map)` -> `Result<Map<String,String>, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_insert_expr(pool: u64, table: *mut u8, expr_fields: *mut u8) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (columns, exprs) = map_to_columns_and_exprs(expr_fields);

        let (sql, params) = match build_insert_expr_sql_pure(table_str, &columns, &exprs) {
            Ok(built) => built,
            Err(msg) => return err_result(msg),
        };

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("insert_expr: no row returned");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Update a row by primary key and return the updated record.
///
/// `Repo.update(pool, table, id, fields_map)` -> `Result<Map<String,String>, String>`
///
/// 1. Extracts column names and values from the Map<String, String>
/// 2. Builds UPDATE SQL with SET columns and WHERE id = $N, RETURNING *
/// 3. Params: SET values first ($1..$N), then id ($N+1)
/// 4. Returns the first (updated) row
#[no_mangle]
pub extern "C" fn mesh_repo_update(
    pool: u64,
    table: *mut u8,
    id: *mut u8,
    fields: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (columns, mut values) = map_to_columns_and_values(fields);

        if columns.is_empty() {
            return err_result("update: no fields provided");
        }

        // Build UPDATE SQL: SET columns, WHERE id =, RETURNING *
        let wheres = vec!["id =".to_string()];
        let returning = vec!["*".to_string()];
        let sql = crate::db::orm::build_update_sql_pure(table_str, &columns, &wheres, &returning);

        // Params: SET values first, then id value for WHERE
        let id_str = mesh_str_ref(id);
        values.push(id_str.to_string());

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&values);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("update: no row returned (id not found)");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Delete a row by primary key and return the deleted record.
///
/// `Repo.delete(pool, table, id)` -> `Result<Map<String,String>, String>`
///
/// 1. Builds DELETE SQL with WHERE id = $1, RETURNING *
/// 2. Returns the first (deleted) row
#[no_mangle]
pub extern "C" fn mesh_repo_delete(pool: u64, table: *mut u8, id: *mut u8) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);

        // Build DELETE SQL: WHERE id =, RETURNING *
        let wheres = vec!["id =".to_string()];
        let returning = vec!["*".to_string()];
        let sql = crate::db::orm::build_delete_sql_pure(table_str, &wheres, &returning);

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let mut params_list = mesh_list_new();
        params_list = mesh_list_append(params_list, id as u64);
        let result = mesh_pool_query(pool, sql_ptr, params_list);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("delete: no row returned (id not found)");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Execute a callback inside a database transaction with automatic
/// checkout/begin/commit-or-rollback/checkin lifecycle.
///
/// `Repo.transaction(pool, callback)` -> `Result<Ptr, String>`
///
/// Protocol:
/// 1. Pool.checkout(pool) to get a connection handle
/// 2. Pg.begin(conn) to start transaction
/// 3. Call user callback with conn handle (via closure calling convention)
/// 4. On Ok: Pg.commit(conn), Pool.checkin(pool, conn), return Ok(value)
/// 5. On Err: Pg.rollback(conn), Pool.checkin(pool, conn), return Err(error)
/// 6. On panic: Pg.rollback(conn), Pool.checkin(pool, conn), return Err("transaction panicked")
#[no_mangle]
pub extern "C" fn mesh_repo_transaction(
    pool: u64,
    fn_ptr: *const u8,
    env_ptr: *const u8,
) -> *mut u8 {
    unsafe {
        // 1. Checkout a connection from the pool
        let checkout_result = mesh_pool_checkout(pool);
        let r = &*(checkout_result as *const MeshResult);
        if r.tag != 0 {
            return checkout_result; // propagate checkout error
        }
        let conn_handle = r.value as u64;

        // 2. BEGIN transaction
        let begin_result = mesh_pg_begin(conn_handle);
        let br = &*(begin_result as *const MeshResult);
        if br.tag != 0 {
            // BEGIN failed -- checkin and return error
            mesh_pool_checkin(pool, conn_handle);
            return begin_result;
        }

        // 3. Call the user callback with catch_unwind for panic safety
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            if env_ptr.is_null() {
                let f: extern "C" fn(u64) -> *mut u8 = std::mem::transmute(fn_ptr);
                f(conn_handle)
            } else {
                let f: extern "C" fn(*const u8, u64) -> *mut u8 = std::mem::transmute(fn_ptr);
                f(env_ptr, conn_handle)
            }
        }));

        match result {
            Ok(result_ptr) => {
                // Check if callback returned Ok or Err
                let cr = &*(result_ptr as *const MeshResult);
                if cr.tag == 0 {
                    // Success -> COMMIT
                    let commit_result = mesh_pg_commit(conn_handle);
                    let cmr = &*(commit_result as *const MeshResult);
                    if cmr.tag != 0 {
                        // COMMIT failed -> ROLLBACK
                        let _ = mesh_pg_rollback(conn_handle);
                        mesh_pool_checkin(pool, conn_handle);
                        return err_result("transaction: COMMIT failed");
                    }
                    mesh_pool_checkin(pool, conn_handle);
                    result_ptr // return Ok(value) from callback
                } else {
                    // Error -> ROLLBACK
                    let _ = mesh_pg_rollback(conn_handle);
                    mesh_pool_checkin(pool, conn_handle);
                    result_ptr // propagate the Err result from callback
                }
            }
            Err(_) => {
                // Panic -> ROLLBACK
                let _ = mesh_pg_rollback(conn_handle);
                mesh_pool_checkin(pool, conn_handle);
                err_result("transaction aborted: panic in callback")
            }
        }
    }
}

// ── Changeset slot access ────────────────────────────────────────────

/// Read a pointer slot from a changeset.
unsafe fn cs_get(cs: *mut u8, slot: usize) -> *mut u8 {
    *(cs.add(slot * 8) as *const *mut u8)
}

/// Read an integer slot from a changeset.
unsafe fn cs_get_int(cs: *mut u8, slot: usize) -> i64 {
    *(cs.add(slot * 8) as *const i64)
}

// ── PG error string parsing ─────────────────────────────────────────

/// Parse the structured error string from pg.rs (tab-separated format).
///
/// Format: `{sqlstate}\t{constraint}\t{table}\t{column}\t{message}`
/// Returns: (sqlstate, constraint, table, column, message)
fn parse_pg_error_string(err: &str) -> (&str, &str, &str, &str, &str) {
    let parts: Vec<&str> = err.splitn(5, '\t').collect();
    if parts.len() == 5 {
        (parts[0], parts[1], parts[2], parts[3], parts[4])
    } else {
        // Fallback for non-PG errors or unstructured error strings
        ("", "", "", "", err)
    }
}

// ── Changeset Write Operations ──────────────────────────────────────

/// Insert a row using a changeset, validating before SQL execution.
///
/// `Repo.insert_changeset(pool, table, changeset)` -> `Result<Map<String,String>, Changeset>`
///
/// 1. If changeset is invalid (valid == 0): return Err(changeset) without executing SQL
/// 2. Extract changes map, build INSERT SQL with RETURNING *
/// 3. Execute via Pool.query
/// 4. On success: return Ok(first_row)
/// 5. On PG error: parse structured error, map constraint to changeset error, return Err(changeset)
#[no_mangle]
pub extern "C" fn mesh_repo_insert_changeset(
    pool: u64,
    table: *mut u8,
    changeset: *mut u8,
) -> *mut u8 {
    unsafe {
        // 1. Check if changeset is valid
        if cs_get_int(changeset, SLOT_VALID) == 0 {
            return alloc_result(1, changeset) as *mut u8;
        }

        // 2. Extract changes map
        let changes = cs_get(changeset, SLOT_CHANGES);
        let (columns, values) = map_to_columns_and_values(changes);

        if columns.is_empty() {
            return alloc_result(1, changeset) as *mut u8;
        }

        // 3. Build INSERT SQL with RETURNING *
        let table_str = mesh_str_ref(table);
        let returning = vec!["*".to_string()];
        let sql = crate::db::orm::build_insert_sql_pure(table_str, &columns, &returning);

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&values);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        // 4. Check result
        let r = &*(result as *const MeshResult);
        if r.tag == 0 {
            // Success: extract first row
            let list = r.value;
            let list_len = mesh_list_length(list);
            if list_len == 0 {
                return err_result("insert_changeset: no row returned");
            }
            let first_row = mesh_list_get(list, 0) as *mut u8;
            ok_result(first_row)
        } else {
            // Error: try to map constraint violation to changeset error
            let err_str = mesh_str_ref(r.value);
            let (sqlstate, constraint, pg_table, column, _message) = parse_pg_error_string(err_str);

            if let Some((field, msg)) = map_constraint_error(sqlstate, constraint, pg_table, column)
            {
                let cs_with_err = add_constraint_error_to_changeset(changeset, &field, &msg);
                alloc_result(1, cs_with_err) as *mut u8
            } else {
                // Unknown error: add as generic _base error
                let cs_with_err =
                    add_constraint_error_to_changeset(changeset, "_base", "database error");
                alloc_result(1, cs_with_err) as *mut u8
            }
        }
    }
}

/// Update a row using a changeset, validating before SQL execution.
///
/// `Repo.update_changeset(pool, table, id, changeset)` -> `Result<Map<String,String>, Changeset>`
///
/// Same pattern as insert_changeset but builds UPDATE SQL with WHERE id = $N+1.
#[no_mangle]
pub extern "C" fn mesh_repo_update_changeset(
    pool: u64,
    table: *mut u8,
    id: *mut u8,
    changeset: *mut u8,
) -> *mut u8 {
    unsafe {
        // 1. Check if changeset is valid
        if cs_get_int(changeset, SLOT_VALID) == 0 {
            return alloc_result(1, changeset) as *mut u8;
        }

        // 2. Extract changes map
        let changes = cs_get(changeset, SLOT_CHANGES);
        let (columns, mut values) = map_to_columns_and_values(changes);

        if columns.is_empty() {
            return alloc_result(1, changeset) as *mut u8;
        }

        // 3. Build UPDATE SQL with RETURNING *
        let table_str = mesh_str_ref(table);
        let wheres = vec!["id =".to_string()];
        let returning = vec!["*".to_string()];
        let sql = crate::db::orm::build_update_sql_pure(table_str, &columns, &wheres, &returning);

        // Params: SET values first, then id value for WHERE
        let id_str = mesh_str_ref(id);
        values.push(id_str.to_string());

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&values);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        // 4. Check result
        let r = &*(result as *const MeshResult);
        if r.tag == 0 {
            // Success: extract first row
            let list = r.value;
            let list_len = mesh_list_length(list);
            if list_len == 0 {
                return err_result("update_changeset: no row returned (id not found)");
            }
            let first_row = mesh_list_get(list, 0) as *mut u8;
            ok_result(first_row)
        } else {
            // Error: try to map constraint violation to changeset error
            let err_str = mesh_str_ref(r.value);
            let (sqlstate, constraint, pg_table, column, _message) = parse_pg_error_string(err_str);

            if let Some((field, msg)) = map_constraint_error(sqlstate, constraint, pg_table, column)
            {
                let cs_with_err = add_constraint_error_to_changeset(changeset, &field, &msg);
                alloc_result(1, cs_with_err) as *mut u8
            } else {
                // Unknown error: add as generic _base error
                let cs_with_err =
                    add_constraint_error_to_changeset(changeset, "_base", "database error");
                alloc_result(1, cs_with_err) as *mut u8
            }
        }
    }
}

// ── Preload Operations (Phase 100) ─────────────────────────────────

use std::collections::{HashMap, HashSet};

/// Parsed relationship metadata from "kind:name:target:fk:target_table" strings.
struct RelMeta {
    kind: String,         // "belongs_to", "has_many", "has_one"
    _name: String,        // association name (e.g., "posts")
    _target: String,      // target struct name (e.g., "Post")
    fk: String,           // foreign key column (e.g., "user_id")
    target_table: String, // target table (e.g., "posts")
}

/// Parse relationship metadata strings into a lookup map keyed by association name.
fn parse_relationship_meta(meta_strings: &[String]) -> HashMap<String, RelMeta> {
    let mut map = HashMap::new();
    for entry in meta_strings {
        let parts: Vec<&str> = entry.splitn(5, ':').collect();
        if parts.len() == 5 {
            map.insert(
                parts[1].to_string(),
                RelMeta {
                    kind: parts[0].to_string(),
                    _name: parts[1].to_string(),
                    _target: parts[2].to_string(),
                    fk: parts[3].to_string(),
                    target_table: parts[4].to_string(),
                },
            );
        }
    }
    map
}

/// Build a simple SELECT query with an IN clause for preloading.
/// Returns (sql, params) where params are the IN values.
fn build_preload_sql(table: &str, where_col: &str, ids: &[String]) -> (String, Vec<String>) {
    let mut sql = format!("SELECT * FROM {}", quote_ident(table));
    if ids.is_empty() {
        // Should not reach here (caller checks), but safety.
        return (sql, vec![]);
    }
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("${}", i)).collect();
    sql.push_str(&format!(
        " WHERE {} IN ({})",
        quote_ident(where_col),
        placeholders.join(", ")
    ));
    (sql, ids.to_vec())
}

/// Preload a single direct association onto a list of rows.
///
/// For has_many/has_one: collects parent "id" values, queries WHERE fk IN (...), groups by fk.
/// For belongs_to: collects parent FK values, queries WHERE id IN (...), groups by id.
///
/// Returns a new list with each row enriched with the association data:
/// - has_many: a List pointer under the association key
/// - has_one/belongs_to: a Map pointer (single row) under the association key, or null
unsafe fn preload_direct(
    pool: u64,
    rows: *mut u8,
    assoc_name: &str,
    rel_map: &HashMap<String, RelMeta>,
) -> Result<*mut u8, *mut u8> {
    let meta = rel_map.get(assoc_name)
        .ok_or_else(|| err_result(&format!("Repo.preload: unknown association '{}' -- check that the relationship metadata includes this association", assoc_name)))?;

    let row_count = mesh_list_length(rows);

    // Determine which column to extract from parent rows and which column to match in target
    let (parent_key, target_match_key) = match meta.kind.as_str() {
        "has_many" | "has_one" => {
            // Parent PK "id" -> target FK: collect parent "id" values,
            // query target WHERE fk IN (...), group by fk
            ("id".to_string(), meta.fk.clone())
        }
        "belongs_to" => {
            // Parent FK -> target PK "id": collect parent FK values,
            // query target WHERE id IN (...), group by id
            (meta.fk.clone(), "id".to_string())
        }
        _ => {
            return Err(err_result(&format!(
                "Repo.preload: unknown relationship kind '{}'",
                meta.kind
            )))
        }
    };

    // 1. Collect unique parent values for the IN clause
    let parent_key_mesh = rust_str_to_mesh(&parent_key);
    let mut id_set: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    for i in 0..row_count {
        let row = mesh_list_get(rows, i) as *mut u8;
        let val = mesh_map_get(row, parent_key_mesh as u64);
        if val != 0 {
            let s = mesh_str_ref(val as *mut u8).to_string();
            if seen.insert(s.clone()) {
                id_set.push(s);
            }
        }
    }

    if id_set.is_empty() {
        // No IDs to query -- attach empty associations and return
        return Ok(attach_empty_association(
            rows, row_count, assoc_name, &meta.kind,
        ));
    }

    // 2. Build and execute the IN query
    let (sql, params) = build_preload_sql(&meta.target_table, &target_match_key, &id_set);

    let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
    let params_ptr = strings_to_mesh_list(&params);
    let result = mesh_pool_query(pool, sql_ptr, params_ptr);

    let r = &*(result as *const MeshResult);
    if r.tag != 0 {
        return Err(result);
    }
    let result_rows = r.value;

    // 3. Group results by the match key
    let match_key_mesh = rust_str_to_mesh(&target_match_key);
    let result_count = mesh_list_length(result_rows);
    let mut grouped: HashMap<String, Vec<*mut u8>> = HashMap::new();
    for i in 0..result_count {
        let row = mesh_list_get(result_rows, i) as *mut u8;
        let key_val = mesh_map_get(row, match_key_mesh as u64);
        if key_val != 0 {
            let key_str = mesh_str_ref(key_val as *mut u8).to_string();
            grouped.entry(key_str).or_default().push(row);
        }
    }

    // 4. Attach results to each parent row under the association key
    let assoc_key_mesh = rust_str_to_mesh(assoc_name);
    let mut enriched = mesh_list_new();
    for i in 0..row_count {
        let row = mesh_list_get(rows, i) as *mut u8;
        let parent_val = mesh_map_get(row, parent_key_mesh as u64);
        let parent_str = if parent_val != 0 {
            mesh_str_ref(parent_val as *mut u8).to_string()
        } else {
            String::new()
        };

        let assoc_data: u64 = match meta.kind.as_str() {
            "has_many" => {
                // Build a List of associated rows
                let mut list = mesh_list_new();
                if let Some(matches) = grouped.get(&parent_str) {
                    for &m in matches {
                        list = mesh_list_append(list, m as u64);
                    }
                }
                list as u64
            }
            "has_one" | "belongs_to" => {
                // Single associated row or null pointer (0)
                grouped
                    .get(&parent_str)
                    .and_then(|v| v.first())
                    .map(|&m| m as u64)
                    .unwrap_or(0)
            }
            _ => 0,
        };

        // Add association to the row's map (creates new map via copy-on-write)
        let new_row = mesh_map_put(row, assoc_key_mesh as u64, assoc_data);
        enriched = mesh_list_append(enriched, new_row as u64);
    }

    Ok(enriched)
}

/// Attach empty associations (empty List for has_many, null for has_one/belongs_to)
/// to all rows when there are no parent IDs to query.
unsafe fn attach_empty_association(
    rows: *mut u8,
    row_count: i64,
    assoc_name: &str,
    kind: &str,
) -> *mut u8 {
    let assoc_key_mesh = rust_str_to_mesh(assoc_name);
    let mut enriched = mesh_list_new();
    for i in 0..row_count {
        let row = mesh_list_get(rows, i) as *mut u8;
        let empty_val: u64 = if kind == "has_many" {
            mesh_list_new() as u64
        } else {
            0 // null for has_one/belongs_to with no match
        };
        let new_row = mesh_map_put(row, assoc_key_mesh as u64, empty_val);
        enriched = mesh_list_append(enriched, new_row as u64);
    }
    enriched
}

/// Preload a nested association path like "posts.comments".
///
/// Algorithm:
/// 1. Split path into parent_assoc ("posts") and child_assoc ("comments")
/// 2. Collect all intermediate rows from the parent association (flatten all has_many lists)
/// 3. Preload child_assoc on the intermediate rows using the SAME merged metadata
/// 4. Re-stitch: rebuild parent association lists using positional tracking
unsafe fn preload_nested(
    pool: u64,
    rows: *mut u8,
    assoc_path: &str,
    rel_map: &HashMap<String, RelMeta>,
) -> Result<*mut u8, *mut u8> {
    let parts: Vec<&str> = assoc_path.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Err(err_result(&format!(
            "Repo.preload: invalid nested association path '{}'",
            assoc_path
        )));
    }
    let parent_assoc = parts[0];
    let child_assoc = parts[1];

    let row_count = mesh_list_length(rows);
    let parent_key_mesh = rust_str_to_mesh(parent_assoc);

    // Check parent association's kind to decide how to extract intermediate rows
    let parent_meta = rel_map.get(parent_assoc).ok_or_else(|| {
        err_result(&format!(
            "Repo.preload: unknown parent association '{}' in nested path",
            parent_assoc
        ))
    })?;

    // Collect intermediate rows and track which parent row each came from
    // and its position within the parent's association list.
    // Structure: Vec<(parent_row_index, position_in_list, intermediate_row_ptr)>
    let mut intermediate_rows = mesh_list_new();
    let mut position_map: Vec<(i64, i64)> = Vec::new(); // (parent_idx, pos_in_list)

    for i in 0..row_count {
        let row = mesh_list_get(rows, i) as *mut u8;
        let assoc_val = mesh_map_get(row, parent_key_mesh as u64);
        if assoc_val != 0 {
            if parent_meta.kind == "has_many" {
                let sub_list = assoc_val as *mut u8;
                let sub_count = mesh_list_length(sub_list);
                for j in 0..sub_count {
                    let sub_row = mesh_list_get(sub_list, j);
                    intermediate_rows = mesh_list_append(intermediate_rows, sub_row);
                    position_map.push((i, j));
                }
            } else {
                // has_one or belongs_to: single row
                intermediate_rows = mesh_list_append(intermediate_rows, assoc_val);
                position_map.push((i, 0));
            }
        }
    }

    let intermediate_count = mesh_list_length(intermediate_rows);
    if intermediate_count == 0 {
        return Ok(rows); // nothing to preload at nested level
    }

    // Preload child_assoc on intermediate rows (recursive if child_assoc contains dots)
    let enriched_intermediate = if child_assoc.contains('.') {
        preload_nested(pool, intermediate_rows, child_assoc, rel_map)?
    } else {
        preload_direct(pool, intermediate_rows, child_assoc, rel_map)?
    };

    // Re-stitch: rebuild parent rows with enriched intermediate rows
    // Group enriched intermediate rows back by parent index
    let mut parent_groups: HashMap<i64, Vec<*mut u8>> = HashMap::new();
    for (idx, &(parent_idx, _pos)) in position_map.iter().enumerate() {
        let enriched_row = mesh_list_get(enriched_intermediate, idx as i64) as *mut u8;
        parent_groups
            .entry(parent_idx)
            .or_default()
            .push(enriched_row);
    }

    // Rebuild parent rows
    let assoc_key_mesh_parent = rust_str_to_mesh(parent_assoc);
    let mut result = mesh_list_new();
    for i in 0..row_count {
        let row = mesh_list_get(rows, i) as *mut u8;
        if let Some(enriched_children) = parent_groups.get(&i) {
            if parent_meta.kind == "has_many" {
                // Rebuild the has_many list with enriched rows
                let mut new_list = mesh_list_new();
                for &child in enriched_children {
                    new_list = mesh_list_append(new_list, child as u64);
                }
                let new_row = mesh_map_put(row, assoc_key_mesh_parent as u64, new_list as u64);
                result = mesh_list_append(result, new_row as u64);
            } else {
                // has_one/belongs_to: single enriched row
                let new_row = mesh_map_put(
                    row,
                    assoc_key_mesh_parent as u64,
                    enriched_children[0] as u64,
                );
                result = mesh_list_append(result, new_row as u64);
            }
        } else {
            // No intermediate rows for this parent -- keep as-is
            result = mesh_list_append(result, row as u64);
        }
    }

    Ok(result)
}

/// Batch preload associated records for a list of parent rows.
///
/// `Repo.preload(pool, rows, associations, relationship_meta)`
///   -> `Result<List<Map<String,String>>, String>`
///
/// For each association in the list:
/// 1. Parse relationship metadata to find FK, target table, cardinality
/// 2. Collect unique parent IDs
/// 3. Execute: SELECT * FROM "target_table" WHERE "fk" IN ($1, $2, ...)
/// 4. Group results by FK value
/// 5. Attach grouped results to each parent row under the association key
///
/// Associations are sorted by nesting depth (atoms/direct first, then "a.b", then "a.b.c")
/// to ensure parent-level data is loaded before nested preloading accesses it.
#[no_mangle]
pub extern "C" fn mesh_repo_preload(
    pool: u64,
    rows: *mut u8,
    associations: *mut u8,
    rel_meta: *mut u8,
) -> *mut u8 {
    unsafe {
        let row_count = mesh_list_length(rows);
        if row_count == 0 {
            return ok_result(rows); // nothing to preload
        }

        // Parse relationship metadata into lookup map
        let meta_strings = list_to_strings(rel_meta);
        let rel_map = parse_relationship_meta(&meta_strings);

        // Parse association names
        let assoc_names = list_to_strings(associations);

        // Sort by depth: direct associations (depth 0) first, then nested
        let mut sorted_assocs: Vec<(usize, String)> = assoc_names
            .iter()
            .map(|a| (a.matches('.').count(), a.clone()))
            .collect();
        sorted_assocs.sort_by_key(|(depth, _)| *depth);

        // Working copy: enrich rows progressively
        let mut current_rows = rows;

        for (_depth, assoc_path) in &sorted_assocs {
            if assoc_path.contains('.') {
                // Nested preload: "posts.comments"
                match preload_nested(pool, current_rows, assoc_path, &rel_map) {
                    Ok(enriched) => current_rows = enriched,
                    Err(e) => return e,
                }
            } else {
                // Direct preload: "posts"
                match preload_direct(pool, current_rows, assoc_path, &rel_map) {
                    Ok(enriched) => current_rows = enriched,
                    Err(e) => return e,
                }
            }
        }

        ok_result(current_rows)
    }
}

// ── Shared WHERE clause builder ──────────────────────────────────────

/// Build a WHERE clause from decomposed where_clauses and where_params.
///
/// Returns `(where_sql, params, next_param_idx)`.
/// `start_idx` is the first $N placeholder to use.
fn build_where_from_query_parts(
    where_clauses: &[String],
    where_params: &[String],
    start_idx: usize,
) -> (String, Vec<String>, usize) {
    let mut conditions = Vec::new();
    let mut params = Vec::new();
    let mut param_idx = start_idx;
    let mut wp_idx = 0;

    for clause in where_clauses {
        // OR clause: "OR:field1,field2,...:N"
        if clause.starts_with("OR:") {
            let parts: Vec<&str> = clause.splitn(3, ':').collect();
            if parts.len() == 3 {
                let fields: Vec<&str> = parts[1].split(',').collect();
                let count: usize = parts[2].parse().unwrap_or(0);
                let mut or_parts = Vec::new();
                for field in fields.iter().take(count) {
                    or_parts.push(format!("{} = ${}", quote_ident(field), param_idx));
                    if wp_idx < where_params.len() {
                        params.push(where_params[wp_idx].clone());
                        wp_idx += 1;
                    }
                    param_idx += 1;
                }
                conditions.push(format!("({})", or_parts.join(" OR ")));
            }
            continue;
        }
        if let Some(expr_sql) = clause.strip_prefix("EXPR:") {
            let (renumbered, consumed) = renumber_placeholders(expr_sql, param_idx);
            conditions.push(renumbered);
            for _ in 0..consumed {
                if wp_idx < where_params.len() {
                    params.push(where_params[wp_idx].clone());
                    wp_idx += 1;
                }
                param_idx += 1;
            }
            continue;
        }
        if let Some(raw_sql) = clause.strip_prefix("RAW:") {
            let (renumbered, consumed) = renumber_placeholders(raw_sql, param_idx);
            conditions.push(renumbered);
            for _ in 0..consumed {
                if wp_idx < where_params.len() {
                    params.push(where_params[wp_idx].clone());
                    wp_idx += 1;
                }
                param_idx += 1;
            }
            continue;
        }
        if let Some(space_pos) = clause.find(' ') {
            let col = &clause[..space_pos];
            let op = clause[space_pos + 1..].trim();
            if op == "IS NULL" || op == "IS NOT NULL" {
                conditions.push(format!("{} {}", quote_ident(col), op));
            } else if op.starts_with("IN:") {
                let count: usize = op[3..].parse().unwrap_or(0);
                let placeholders: Vec<String> =
                    (0..count).map(|i| format!("${}", param_idx + i)).collect();
                conditions.push(format!(
                    "{} IN ({})",
                    quote_ident(col),
                    placeholders.join(", ")
                ));
                for _ in 0..count {
                    if wp_idx < where_params.len() {
                        params.push(where_params[wp_idx].clone());
                        wp_idx += 1;
                    }
                    param_idx += 1;
                }
            } else if op.starts_with("NOT_IN:") {
                let count: usize = op[7..].parse().unwrap_or(0);
                let placeholders: Vec<String> =
                    (0..count).map(|i| format!("${}", param_idx + i)).collect();
                conditions.push(format!(
                    "{} NOT IN ({})",
                    quote_ident(col),
                    placeholders.join(", ")
                ));
                for _ in 0..count {
                    if wp_idx < where_params.len() {
                        params.push(where_params[wp_idx].clone());
                        wp_idx += 1;
                    }
                    param_idx += 1;
                }
            } else if op == "BETWEEN" {
                conditions.push(format!(
                    "{} BETWEEN ${} AND ${}",
                    quote_ident(col),
                    param_idx,
                    param_idx + 1
                ));
                for _ in 0..2 {
                    if wp_idx < where_params.len() {
                        params.push(where_params[wp_idx].clone());
                        wp_idx += 1;
                    }
                    param_idx += 1;
                }
            } else {
                conditions.push(format!("{} {} ${}", quote_ident(col), op, param_idx));
                if wp_idx < where_params.len() {
                    params.push(where_params[wp_idx].clone());
                    wp_idx += 1;
                }
                param_idx += 1;
            }
        } else {
            conditions.push(format!("{} = ${}", quote_ident(clause), param_idx));
            if wp_idx < where_params.len() {
                params.push(where_params[wp_idx].clone());
                wp_idx += 1;
            }
            param_idx += 1;
        }
    }

    (conditions.join(" AND "), params, param_idx)
}

// ── Extended Write Operations (Phase 103) ────────────────────────────

/// Update rows matching a Query's WHERE conditions.
/// `Repo.update_where(pool, table, fields_map, query)` -> `Result<Map<String,String>, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_update_where(
    pool: u64,
    table: *mut u8,
    fields: *mut u8,
    query: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (columns, mut values) = map_to_columns_and_values(fields);

        if columns.is_empty() {
            return err_result("update_where: no fields provided");
        }

        let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
        let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));

        if where_clauses.is_empty() {
            return err_result("update_where: no WHERE conditions");
        }

        let mut sql = format!("UPDATE {} SET ", quote_ident(table_str));
        let set_parts: Vec<String> = columns
            .iter()
            .enumerate()
            .map(|(i, c)| format!("{} = ${}", quote_ident(c), i + 1))
            .collect();
        sql.push_str(&set_parts.join(", "));

        let start_idx = columns.len() + 1;
        let (where_sql, where_param_values, _next_idx) =
            build_where_from_query_parts(&where_clauses, &where_params, start_idx);
        sql.push_str(&format!(" WHERE {} RETURNING *", where_sql));

        values.extend(where_param_values);

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&values);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("update_where: no rows matched");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Update rows matching a Query's WHERE conditions with expression-valued SET clauses.
/// `Repo.update_where_expr(pool, table, expr_fields_map, query)`
///   -> `Result<Map<String,String>, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_update_where_expr(
    pool: u64,
    table: *mut u8,
    expr_fields: *mut u8,
    query: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (columns, exprs) = map_to_columns_and_exprs(expr_fields);
        let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
        let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));

        let (sql, params) = match build_update_where_expr_sql_pure(
            table_str,
            &columns,
            &exprs,
            &where_clauses,
            &where_params,
        ) {
            Ok(built) => built,
            Err(msg) => return err_result(msg),
        };

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("update_where_expr: no rows matched");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Delete rows matching a Query's WHERE conditions.
/// `Repo.delete_where(pool, table, query)` -> `Result<Int, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_delete_where(pool: u64, table: *mut u8, query: *mut u8) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);

        let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
        let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));

        if where_clauses.is_empty() {
            return err_result("delete_where: no WHERE conditions");
        }

        let mut sql = format!("DELETE FROM {}", quote_ident(table_str));
        let (where_sql, where_param_values, _next_idx) =
            build_where_from_query_parts(&where_clauses, &where_params, 1);
        sql.push_str(&format!(" WHERE {}", where_sql));

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&where_param_values);
        mesh_pool_execute(pool, sql_ptr, params_ptr)
    }
}

/// Upsert: INSERT with ON CONFLICT DO UPDATE.
///
/// `Repo.insert_or_update(pool, table, fields_map, conflict_targets, update_fields)`
///   -> `Result<Map<String,String>, String>`
///
/// - `fields_map`: Map<String,String> of column->value for the INSERT
/// - `conflict_targets`: List<String> of conflict target column names
/// - `update_fields`: List<String> of column names to update on conflict
///
/// Generated SQL:
///   INSERT INTO "table" ("cols") VALUES ($1, ...)
///   ON CONFLICT ("target1", "target2") DO UPDATE SET "col" = EXCLUDED."col", ...
///   RETURNING *
#[no_mangle]
pub extern "C" fn mesh_repo_insert_or_update(
    pool: u64,
    table: *mut u8,
    fields: *mut u8,
    conflict_targets: *mut u8,
    update_fields: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (columns, values) = map_to_columns_and_values(fields);
        if columns.is_empty() {
            return err_result("insert_or_update: no fields provided");
        }
        let targets = list_to_strings(conflict_targets);
        let updates = list_to_strings(update_fields);
        if targets.is_empty() {
            return err_result("insert_or_update: no conflict targets provided");
        }
        if updates.is_empty() {
            return err_result("insert_or_update: no update fields provided");
        }

        let returning = vec!["*".to_string()];
        let sql = crate::db::orm::build_upsert_sql_pure(
            table_str, &columns, &targets, &updates, &returning,
        );

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&values);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("insert_or_update: no row returned");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Upsert with expression-valued ON CONFLICT DO UPDATE assignments.
/// `Repo.insert_or_update_expr(pool, table, fields_map, conflict_targets, expr_fields_map)`
///   -> `Result<Map<String,String>, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_insert_or_update_expr(
    pool: u64,
    table: *mut u8,
    fields: *mut u8,
    conflict_targets: *mut u8,
    expr_fields: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let (insert_columns, insert_values) = map_to_columns_and_values(fields);
        let targets = list_to_strings(conflict_targets);
        let (update_columns, update_exprs) = map_to_columns_and_exprs(expr_fields);

        let (sql, params) = match build_insert_or_update_expr_sql_pure(
            table_str,
            &insert_columns,
            &insert_values,
            &targets,
            &update_columns,
            &update_exprs,
        ) {
            Ok(built) => built,
            Err(msg) => return err_result(msg),
        };

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&params);
        let result = mesh_pool_query(pool, sql_ptr, params_ptr);

        let r = &*(result as *const MeshResult);
        if r.tag != 0 {
            return result;
        }

        let list = r.value;
        let list_len = mesh_list_length(list);
        if list_len == 0 {
            return err_result("insert_or_update_expr: no row returned");
        }

        let first_row = mesh_list_get(list, 0) as *mut u8;
        ok_result(first_row)
    }
}

/// Delete rows matching a Query's WHERE conditions and return deleted rows.
/// `Repo.delete_where_returning(pool, table, query)` -> `Result<List<Map<String,String>>, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_delete_where_returning(
    pool: u64,
    table: *mut u8,
    query: *mut u8,
) -> *mut u8 {
    unsafe {
        let table_str = mesh_str_ref(table);
        let where_clauses = list_to_strings(query_get(query, SLOT_WHERE_CLAUSES));
        let where_params = list_to_strings(query_get(query, SLOT_WHERE_PARAMS));

        if where_clauses.is_empty() {
            return err_result("delete_where_returning: no WHERE conditions");
        }

        let mut sql = format!("DELETE FROM {}", quote_ident(table_str));
        let (where_sql, where_param_values, _next_idx) =
            build_where_from_query_parts(&where_clauses, &where_params, 1);
        sql.push_str(&format!(" WHERE {} RETURNING *", where_sql));

        let sql_ptr = rust_str_to_mesh(&sql) as *const MeshString;
        let params_ptr = strings_to_mesh_list(&where_param_values);
        mesh_pool_query(pool, sql_ptr, params_ptr)
    }
}

/// Execute raw SQL and return rows.
/// `Repo.query_raw(pool, sql, params)` -> `Result<List<Map<String,String>>, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_query_raw(pool: u64, sql: *mut u8, params: *mut u8) -> *mut u8 {
    let sql_ptr = sql as *const MeshString;
    mesh_pool_query(pool, sql_ptr, params)
}

/// Execute raw SQL and return affected row count.
/// `Repo.execute_raw(pool, sql, params)` -> `Result<Int, String>`
#[no_mangle]
pub extern "C" fn mesh_repo_execute_raw(pool: u64, sql: *mut u8, params: *mut u8) -> *mut u8 {
    let sql_ptr = sql as *const MeshString;
    mesh_pool_execute(pool, sql_ptr, params)
}

// ── Unit tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_all_from_table() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT * FROM \"users\"");
        assert!(params.is_empty());
    }

    #[test]
    fn test_select_with_columns() {
        let (sql, _) = build_select_sql_from_parts(
            "users",
            &["id".into(), "name".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT \"id\", \"name\" FROM \"users\"");
    }

    #[test]
    fn test_select_with_where() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["name =".into(), "age >".into()],
            &["Alice".into(), "21".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"name\" = $1 AND \"age\" > $2"
        );
        assert_eq!(params, vec!["Alice", "21"]);
    }

    #[test]
    fn test_select_with_is_null() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["deleted_at IS NULL".into(), "name =".into()],
            &["Alice".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"deleted_at\" IS NULL AND \"name\" = $1"
        );
        assert_eq!(params, vec!["Alice"]);
    }

    #[test]
    fn test_select_with_in_clause() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["status IN:3".into()],
            &["active".into(), "pending".into(), "trial".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"status\" IN ($1, $2, $3)"
        );
        assert_eq!(params, vec!["active", "pending", "trial"]);
    }

    // ── Phase 106: Advanced WHERE operators ──────────────────────────────

    #[test]
    fn test_select_with_not_in() {
        let (sql, params) = build_select_sql_from_parts(
            "issues",
            &[],
            &["status NOT_IN:2".into()],
            &["archived".into(), "deleted".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"issues\" WHERE \"status\" NOT IN ($1, $2)"
        );
        assert_eq!(params, vec!["archived", "deleted"]);
    }

    #[test]
    fn test_select_with_between() {
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[],
            &["age BETWEEN".into()],
            &["18".into(), "65".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"events\" WHERE \"age\" BETWEEN $1 AND $2"
        );
        assert_eq!(params, vec!["18", "65"]);
    }

    #[test]
    fn test_select_with_or() {
        let (sql, params) = build_select_sql_from_parts(
            "issues",
            &[],
            &["OR:status,level:2".into()],
            &["active".into(), "error".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"issues\" WHERE (\"status\" = $1 OR \"level\" = $2)"
        );
        assert_eq!(params, vec!["active", "error"]);
    }

    #[test]
    fn test_select_with_ilike() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["name ILIKE".into()],
            &["%alice%".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT * FROM \"users\" WHERE \"name\" ILIKE $1");
        assert_eq!(params, vec!["%alice%"]);
    }

    #[test]
    fn test_mixed_where_clauses() {
        // Combines: WHERE + NOT IN + BETWEEN + OR to verify $N sequencing
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[],
            &[
                "project_id =".into(),
                "status NOT_IN:2".into(),
                "age BETWEEN".into(),
                "OR:status,priority:2".into(),
            ],
            &[
                "abc".into(),
                "archived".into(),
                "deleted".into(),
                "18".into(),
                "65".into(),
                "active".into(),
                "high".into(),
            ],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"events\" WHERE \"project_id\" = $1 AND \"status\" NOT IN ($2, $3) AND \"age\" BETWEEN $4 AND $5 AND (\"status\" = $6 OR \"priority\" = $7)"
        );
        assert_eq!(
            params,
            vec!["abc", "archived", "deleted", "18", "65", "active", "high"]
        );
    }

    #[test]
    fn test_select_with_join() {
        let (sql, _) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &["INNER:posts:posts.user_id = users.id".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" INNER JOIN \"posts\" ON posts.user_id = users.id"
        );
    }

    #[test]
    fn test_select_with_group_by_having() {
        let (sql, params) = build_select_sql_from_parts(
            "orders",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &["category".into()],
            &["count(*) >".into()],
            &["5".into()],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"orders\" GROUP BY \"category\" HAVING count(*) > $1"
        );
        assert_eq!(params, vec!["5"]);
    }

    #[test]
    fn test_select_with_order_limit_offset() {
        let (sql, _) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &["name ASC".into(), "age DESC".into()],
            10,
            20,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" ORDER BY \"name\" ASC, \"age\" DESC LIMIT 10 OFFSET 20"
        );
    }

    #[test]
    fn test_select_full_query() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &["id".into(), "name".into()],
            &["active =".into()],
            &["true".into()],
            &["name ASC".into()],
            10,
            0,
            &["INNER:posts:posts.user_id = users.id".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT \"id\", \"name\" FROM \"users\" INNER JOIN \"posts\" ON posts.user_id = users.id WHERE \"active\" = $1 ORDER BY \"name\" ASC LIMIT 10 OFFSET 0"
        );
        assert_eq!(params, vec!["true"]);
    }

    #[test]
    fn test_select_with_fragment() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &["AND custom_fn(?)".into()],
            &["test_val".into()],
        );
        assert_eq!(sql, "SELECT * FROM \"users\" AND custom_fn($1)");
        assert_eq!(params, vec!["test_val"]);
    }

    // ── Phase 106 Plan 02: Fragment $N renumbering and raw ORDER BY/GROUP BY ──

    #[test]
    fn test_fragment_dollar_renumbering() {
        // Fragment with $1 after 2 WHERE params should renumber $1 -> $3
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["email =".into(), "active =".into()],
            &["alice@example.com".into(), "true".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &["AND password_hash = crypt($1, password_hash)".into()],
            &["secret".into()],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"email\" = $1 AND \"active\" = $2 AND password_hash = crypt($3, password_hash)"
        );
        assert_eq!(params, vec!["alice@example.com", "true", "secret"]);
    }

    #[test]
    fn test_where_raw_dollar_renumbering() {
        // where_raw with $1 after 1 WHERE param should renumber $1 -> $2
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["active =".into(), "RAW:email ILIKE $1".into()],
            &["true".into(), "%@example.com".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"active\" = $1 AND email ILIKE $2"
        );
        assert_eq!(params, vec!["true", "%@example.com"]);
    }

    #[test]
    fn test_order_by_raw() {
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[],
            &[],
            &[],
            &["RAW:random()".into()],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT * FROM \"events\" ORDER BY random()");
        assert!(params.is_empty());
    }

    #[test]
    fn test_group_by_raw() {
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &["RAW:date_trunc('hour', received_at)".into()],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"events\" GROUP BY date_trunc('hour', received_at)"
        );
        assert!(params.is_empty());
    }

    #[test]
    fn test_fragment_with_pg_crypt() {
        // crypt($1, gen_salt('bf')) with offset=1 -> crypt($1, gen_salt('bf'))
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &["AND password_hash = crypt($1, gen_salt('bf'))".into()],
            &["secret123".into()],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" AND password_hash = crypt($1, gen_salt('bf'))"
        );
        assert_eq!(params, vec!["secret123"]);
    }

    #[test]
    fn test_fragment_with_jsonb() {
        // metadata @> $1::jsonb after 1 WHERE param
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[],
            &["project_id =".into()],
            &["abc".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &["AND metadata @> $1::jsonb".into()],
            &[r#"{"env":"production"}"#.into()],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"events\" WHERE \"project_id\" = $1 AND metadata @> $2::jsonb"
        );
        assert_eq!(params, vec!["abc", r#"{"env":"production"}"#]);
    }

    #[test]
    fn test_mixed_fragments_and_where() {
        // Full query: WHERE + where_raw + fragment with correct numbering
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[],
            &[
                "project_id =".into(),
                "RAW:received_at > now() - interval '24 hours'".into(),
            ],
            &["abc".into()],
            &["RAW:date_trunc('hour', received_at)".into()],
            -1,
            -1,
            &[],
            &["RAW:date_trunc('hour', received_at)".into()],
            &[],
            &[],
            &["AND tags @> $1::jsonb".into()],
            &[r#"{"env":"prod"}"#.into()],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"events\" WHERE \"project_id\" = $1 AND received_at > now() - interval '24 hours' GROUP BY date_trunc('hour', received_at) AND tags @> $2::jsonb ORDER BY date_trunc('hour', received_at)"
        );
        assert_eq!(params, vec!["abc", r#"{"env":"prod"}"#]);
    }

    #[test]
    fn test_count_sql() {
        let (sql, params) = build_count_sql_from_parts(
            "users",
            &["active =".into()],
            &["true".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT COUNT(*) FROM \"users\" WHERE \"active\" = $1");
        assert_eq!(params, vec!["true"]);
    }

    #[test]
    fn test_exists_sql() {
        let (sql, params) =
            build_exists_sql_from_parts("users", &["name =".into()], &["Alice".into()], &[]);
        assert_eq!(
            sql,
            "SELECT EXISTS(SELECT 1 FROM \"users\" WHERE \"name\" = $1 LIMIT 1)"
        );
        assert_eq!(params, vec!["Alice"]);
    }

    // ── PG error string parsing tests ─────────────────────────────────

    #[test]
    fn test_parse_pg_error_string_structured() {
        let err = "23505\tusers_email_key\tusers\t\tduplicate key value violates unique constraint";
        let (sqlstate, constraint, table, column, message) = parse_pg_error_string(err);
        assert_eq!(sqlstate, "23505");
        assert_eq!(constraint, "users_email_key");
        assert_eq!(table, "users");
        assert_eq!(column, "");
        assert_eq!(message, "duplicate key value violates unique constraint");
    }

    #[test]
    fn test_parse_pg_error_string_unstructured() {
        let err = "some random error";
        let (sqlstate, constraint, table, column, message) = parse_pg_error_string(err);
        assert_eq!(sqlstate, "");
        assert_eq!(constraint, "");
        assert_eq!(table, "");
        assert_eq!(column, "");
        assert_eq!(message, "some random error");
    }

    // ── Constraint mapping tests ──────────────────────────────────────

    #[test]
    fn test_map_constraint_unique_violation() {
        let result = map_constraint_error("23505", "users_email_key", "users", "");
        assert_eq!(
            result,
            Some(("email".to_string(), "has already been taken".to_string()))
        );
    }

    #[test]
    fn test_map_constraint_foreign_key_violation() {
        let result = map_constraint_error("23503", "posts_user_id_fkey", "posts", "");
        assert_eq!(
            result,
            Some(("user_id".to_string(), "does not exist".to_string()))
        );
    }

    #[test]
    fn test_map_constraint_not_null_violation() {
        let result = map_constraint_error("23502", "", "", "name");
        assert_eq!(
            result,
            Some(("name".to_string(), "can't be blank".to_string()))
        );
    }

    #[test]
    fn test_map_constraint_unknown_sqlstate() {
        let result = map_constraint_error("42601", "", "", "");
        assert_eq!(result, None);
    }

    // ── Preload unit tests (Phase 100) ──────────────────────────────────

    #[test]
    fn test_parse_relationship_meta() {
        let meta = vec![
            "has_many:posts:Post:user_id:posts".to_string(),
            "has_one:profile:Profile:user_id:profiles".to_string(),
            "belongs_to:user:User:user_id:users".to_string(),
        ];
        let map = parse_relationship_meta(&meta);
        assert_eq!(map.len(), 3);
        let posts = map.get("posts").unwrap();
        assert_eq!(posts.kind, "has_many");
        assert_eq!(posts.fk, "user_id");
        assert_eq!(posts.target_table, "posts");
        let profile = map.get("profile").unwrap();
        assert_eq!(profile.kind, "has_one");
        let user = map.get("user").unwrap();
        assert_eq!(user.kind, "belongs_to");
        assert_eq!(user.fk, "user_id");
        assert_eq!(user.target_table, "users");
    }

    #[test]
    fn test_build_preload_sql_basic() {
        let ids = vec!["1".to_string(), "2".to_string(), "3".to_string()];
        let (sql, params) = build_preload_sql("posts", "user_id", &ids);
        assert_eq!(
            sql,
            "SELECT * FROM \"posts\" WHERE \"user_id\" IN ($1, $2, $3)"
        );
        assert_eq!(params, vec!["1", "2", "3"]);
    }

    #[test]
    fn test_build_preload_sql_single_id() {
        let ids = vec!["42".to_string()];
        let (sql, params) = build_preload_sql("users", "id", &ids);
        assert_eq!(sql, "SELECT * FROM \"users\" WHERE \"id\" IN ($1)");
        assert_eq!(params, vec!["42"]);
    }

    #[test]
    fn test_build_preload_sql_empty() {
        let ids: Vec<String> = vec![];
        let (sql, params) = build_preload_sql("posts", "user_id", &ids);
        assert_eq!(sql, "SELECT * FROM \"posts\"");
        assert!(params.is_empty());
    }

    // ── RAW: prefix tests (Phase 103) ──────────────────────────────────

    #[test]
    fn test_select_with_raw_expressions() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &["RAW:count(*)::text AS count".into(), "level".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT count(*)::text AS count, \"level\" FROM \"users\""
        );
        assert!(params.is_empty());
    }

    #[test]
    fn test_select_with_all_raw() {
        let (sql, _) = build_select_sql_from_parts(
            "sessions",
            &["RAW:count(*)".into(), "RAW:max(created_at)".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT count(*), max(created_at) FROM \"sessions\"");
    }

    #[test]
    fn test_where_raw_no_params() {
        let (sql, params) = build_select_sql_from_parts(
            "sessions",
            &[],
            &["RAW:expires_at > now()".into()],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT * FROM \"sessions\" WHERE expires_at > now()");
        assert!(params.is_empty());
    }

    #[test]
    fn test_where_raw_with_params() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &["RAW:status IN (?, ?)".into()],
            &["active".into(), "pending".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT * FROM \"users\" WHERE status IN ($1, $2)");
        assert_eq!(params, vec!["active", "pending"]);
    }

    #[test]
    fn test_where_raw_mixed_with_normal() {
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &[
                "name =".into(),
                "RAW:expires_at > now()".into(),
                "age >".into(),
            ],
            &["Alice".into(), "21".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"name\" = $1 AND expires_at > now() AND \"age\" > $2"
        );
        assert_eq!(params, vec!["Alice", "21"]);
    }

    #[test]
    fn test_where_raw_with_params_mixed() {
        // Normal where (1 param) + RAW with 2 params + normal where (1 param)
        let (sql, params) = build_select_sql_from_parts(
            "users",
            &[],
            &[
                "org_id =".into(),
                "RAW:role IN (?, ?)".into(),
                "active =".into(),
            ],
            &[
                "org1".into(),
                "admin".into(),
                "editor".into(),
                "true".into(),
            ],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" WHERE \"org_id\" = $1 AND role IN ($2, $3) AND \"active\" = $4"
        );
        assert_eq!(params, vec!["org1", "admin", "editor", "true"]);
    }

    #[test]
    fn test_count_with_raw_where() {
        let (sql, params) = build_count_sql_from_parts(
            "sessions",
            &["RAW:expires_at > now()".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT COUNT(*) FROM \"sessions\" WHERE expires_at > now()"
        );
        assert!(params.is_empty());
    }

    #[test]
    fn test_exists_with_raw_where() {
        let (sql, params) = build_exists_sql_from_parts(
            "sessions",
            &["RAW:expires_at > now()".into(), "user_id =".into()],
            &["42".into()],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT EXISTS(SELECT 1 FROM \"sessions\" WHERE expires_at > now() AND \"user_id\" = $1 LIMIT 1)"
        );
        assert_eq!(params, vec!["42"]);
    }

    // ── build_where_from_query_parts tests (Phase 103) ──────────────────

    #[test]
    fn test_where_builder_basic_equality() {
        let (sql, params, next) = build_where_from_query_parts(&["id =".into()], &["42".into()], 1);
        assert_eq!(sql, "\"id\" = $1");
        assert_eq!(params, vec!["42"]);
        assert_eq!(next, 2);
    }

    #[test]
    fn test_where_builder_with_offset() {
        let (sql, params, next) = build_where_from_query_parts(
            &["id =".into(), "status !=".into()],
            &["42".into(), "resolved".into()],
            3,
        );
        assert_eq!(sql, "\"id\" = $3 AND \"status\" != $4");
        assert_eq!(params, vec!["42", "resolved"]);
        assert_eq!(next, 5);
    }

    #[test]
    fn test_where_builder_is_null() {
        let (sql, params, next) = build_where_from_query_parts(
            &["deleted_at IS NULL".into(), "id =".into()],
            &["42".into()],
            1,
        );
        assert_eq!(sql, "\"deleted_at\" IS NULL AND \"id\" = $1");
        assert_eq!(params, vec!["42"]);
        assert_eq!(next, 2);
    }

    #[test]
    fn test_where_builder_raw_clause() {
        let (sql, params, next) = build_where_from_query_parts(
            &["RAW:status IN (?, ?)".into()],
            &["active".into(), "pending".into()],
            1,
        );
        assert_eq!(sql, "status IN ($1, $2)");
        assert_eq!(params, vec!["active", "pending"]);
        assert_eq!(next, 3);
    }

    #[test]
    fn test_where_builder_in_clause() {
        let (sql, params, next) = build_where_from_query_parts(
            &["id IN:3".into()],
            &["1".into(), "2".into(), "3".into()],
            1,
        );
        assert_eq!(sql, "\"id\" IN ($1, $2, $3)");
        assert_eq!(params, vec!["1", "2", "3"]);
        assert_eq!(next, 4);
    }

    #[test]
    fn test_where_builder_default_eq() {
        let (sql, params, next) =
            build_where_from_query_parts(&["name".into()], &["Alice".into()], 1);
        assert_eq!(sql, "\"name\" = $1");
        assert_eq!(params, vec!["Alice"]);
        assert_eq!(next, 2);
    }

    // ── Phase 107 Plan 01: JOIN alias support and comprehensive join tests ──

    #[test]
    fn test_select_with_left_join() {
        let (sql, _) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &["LEFT:profiles:profiles.user_id = users.id".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" LEFT JOIN \"profiles\" ON profiles.user_id = users.id"
        );
    }

    #[test]
    fn test_select_with_multi_join() {
        let (sql, _) = build_select_sql_from_parts(
            "issues",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[
                "INNER:projects:projects.id = issues.project_id".into(),
                "INNER:organizations:organizations.id = projects.org_id".into(),
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"issues\" INNER JOIN \"projects\" ON projects.id = issues.project_id INNER JOIN \"organizations\" ON organizations.id = projects.org_id"
        );
    }

    #[test]
    fn test_select_with_alias_join() {
        let (sql, _) = build_select_sql_from_parts(
            "issues",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &["ALIAS:INNER:projects:p:p.id = issues.project_id".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"issues\" INNER JOIN \"projects\" p ON p.id = issues.project_id"
        );
    }

    #[test]
    fn test_select_with_multi_alias_join() {
        let (sql, _) = build_select_sql_from_parts(
            "alerts",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[
                "ALIAS:INNER:alert_rules:r:r.id = alerts.rule_id".into(),
                "ALIAS:INNER:projects:p:p.id = alerts.project_id".into(),
            ],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"alerts\" INNER JOIN \"alert_rules\" r ON r.id = alerts.rule_id INNER JOIN \"projects\" p ON p.id = alerts.project_id"
        );
    }

    #[test]
    fn test_select_with_left_alias_join() {
        let (sql, _) = build_select_sql_from_parts(
            "users",
            &[],
            &[],
            &[],
            &[],
            -1,
            -1,
            &["ALIAS:LEFT:profiles:p:p.user_id = users.id".into()],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"users\" LEFT JOIN \"profiles\" p ON p.user_id = users.id"
        );
    }

    // ── Phase 108: Aggregate SELECT functions ─────────────────────────────

    #[test]
    fn test_aggregate_select_count() {
        let (sql, params) = build_select_sql_from_parts(
            "issues",
            &["RAW:count(*)".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT count(*) FROM \"issues\"");
        assert!(params.is_empty());
    }

    #[test]
    fn test_aggregate_select_sum() {
        let (sql, params) = build_select_sql_from_parts(
            "orders",
            &["RAW:sum(\"amount\")".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(sql, "SELECT sum(\"amount\") FROM \"orders\"");
        assert!(params.is_empty());
    }

    #[test]
    fn test_aggregate_select_avg_with_group_by() {
        let (sql, params) = build_select_sql_from_parts(
            "products",
            &["RAW:avg(\"price\")".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &["category".into()],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT avg(\"price\") FROM \"products\" GROUP BY \"category\""
        );
        assert!(params.is_empty());
    }

    #[test]
    fn test_aggregate_select_min_max() {
        let (sql, params) = build_select_sql_from_parts(
            "events",
            &[
                "RAW:min(\"created_at\")".into(),
                "RAW:max(\"created_at\")".into(),
            ],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT min(\"created_at\"), max(\"created_at\") FROM \"events\""
        );
        assert!(params.is_empty());
    }

    #[test]
    fn test_aggregate_with_having() {
        let (sql, params) = build_select_sql_from_parts(
            "issues",
            &["RAW:count(*)".into()],
            &[],
            &[],
            &[],
            -1,
            -1,
            &[],
            &["project_id".into()],
            &["count(*) >".into()],
            &["5".into()],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT count(*) FROM \"issues\" GROUP BY \"project_id\" HAVING count(*) > $1"
        );
        assert_eq!(params, vec!["5"]);
    }

    // ── Phase 109 Plan 01: Upsert and subquery WHERE tests ──────────────

    #[test]
    fn test_upsert_sql() {
        let sql = crate::db::orm::build_upsert_sql_pure(
            "issues",
            &["project_id".into(), "fingerprint".into(), "title".into()],
            &["project_id".into(), "fingerprint".into()],
            &["title".into()],
            &["*".into()],
        );
        assert_eq!(
            sql,
            "INSERT INTO \"issues\" (\"project_id\", \"fingerprint\", \"title\") VALUES ($1, $2, $3) ON CONFLICT (\"project_id\", \"fingerprint\") DO UPDATE SET \"title\" = EXCLUDED.\"title\" RETURNING *"
        );
    }

    #[test]
    fn test_upsert_sql_multi_update() {
        let sql = crate::db::orm::build_upsert_sql_pure(
            "users",
            &["email".into(), "name".into(), "role".into()],
            &["email".into()],
            &["name".into(), "role".into()],
            &["*".into()],
        );
        assert_eq!(
            sql,
            "INSERT INTO \"users\" (\"email\", \"name\", \"role\") VALUES ($1, $2, $3) ON CONFLICT (\"email\") DO UPDATE SET \"name\" = EXCLUDED.\"name\", \"role\" = EXCLUDED.\"role\" RETURNING *"
        );
    }

    #[test]
    fn test_subquery_where_clause() {
        let (sql, params) = build_select_sql_from_parts(
            "issues",
            &[],
            &[
                "status =".into(),
                "RAW:\"project_id\" IN (SELECT \"id\" FROM \"projects\" WHERE \"org_id\" = ?)"
                    .into(),
            ],
            &["open".into(), "org-123".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );
        assert_eq!(
            sql,
            "SELECT * FROM \"issues\" WHERE \"status\" = $1 AND \"project_id\" IN (SELECT \"id\" FROM \"projects\" WHERE \"org_id\" = $2)"
        );
        assert_eq!(params, vec!["open", "org-123"]);
    }

    #[test]
    fn test_select_expr_sql_renumbers_select_params_before_where_params() {
        let (sql, params) = build_select_sql_from_parts_with_select_params(
            "issues",
            &[
                "EXPR:COALESCE(\"nickname\", $1) AS \"nick\"".into(),
                "EXPR:(\"event_count\" + $1) AS \"next_count\"".into(),
            ],
            &["fallback".into(), "2".into()],
            &["id =".into()],
            &["issue-123".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );

        assert_eq!(
            sql,
            "SELECT COALESCE(\"nickname\", $1) AS \"nick\", (\"event_count\" + $2) AS \"next_count\" FROM \"issues\" WHERE \"id\" = $3"
        );
        assert_eq!(params, vec!["fallback", "2", "issue-123"]);
    }

    #[test]
    fn test_update_where_expr_sql_renumbers_set_and_where_params() {
        let (sql, params) = build_update_where_expr_sql_pure(
            "issues",
            &["event_count".into(), "status".into(), "last_seen".into()],
            &[
                SqlExpr::Binary {
                    op: "+",
                    lhs: Box::new(SqlExpr::Column("event_count".into())),
                    rhs: Box::new(SqlExpr::Value("1".into())),
                },
                SqlExpr::Case {
                    branches: vec![(
                        SqlExpr::Binary {
                            op: "=",
                            lhs: Box::new(SqlExpr::Column("status".into())),
                            rhs: Box::new(SqlExpr::Value("resolved".into())),
                        },
                        SqlExpr::Value("unresolved".into()),
                    )],
                    else_expr: Box::new(SqlExpr::Column("status".into())),
                },
                SqlExpr::Call {
                    name: "now".into(),
                    args: vec![],
                },
            ],
            &["RAW:id = ?::uuid".into()],
            &["issue-123".into()],
        )
        .expect("update_where_expr SQL should build");

        assert_eq!(
            sql,
            "UPDATE \"issues\" SET \"event_count\" = (\"event_count\" + $1), \"status\" = CASE WHEN (\"status\" = $2) THEN $3 ELSE \"status\" END, \"last_seen\" = now() WHERE id = $4::uuid RETURNING *"
        );
        assert_eq!(params, vec!["1", "resolved", "unresolved", "issue-123"]);
    }

    #[test]
    fn test_insert_or_update_expr_sql_preserves_insert_then_update_param_order() {
        let (sql, params) = build_insert_or_update_expr_sql_pure(
            "issues",
            &[
                "project_id".into(),
                "fingerprint".into(),
                "title".into(),
                "level".into(),
                "event_count".into(),
            ],
            &[
                "project-1".into(),
                "fp-1".into(),
                "Boom".into(),
                "error".into(),
                "1".into(),
            ],
            &["project_id".into(), "fingerprint".into()],
            &["event_count".into(), "status".into(), "last_seen".into()],
            &[
                SqlExpr::Binary {
                    op: "+",
                    lhs: Box::new(SqlExpr::Column("event_count".into())),
                    rhs: Box::new(SqlExpr::Value("1".into())),
                },
                SqlExpr::Case {
                    branches: vec![(
                        SqlExpr::Binary {
                            op: "=",
                            lhs: Box::new(SqlExpr::Column("status".into())),
                            rhs: Box::new(SqlExpr::Value("resolved".into())),
                        },
                        SqlExpr::Value("unresolved".into()),
                    )],
                    else_expr: Box::new(SqlExpr::Column("status".into())),
                },
                SqlExpr::Call {
                    name: "now".into(),
                    args: vec![],
                },
            ],
        )
        .expect("insert_or_update_expr SQL should build");

        assert_eq!(
            sql,
            "INSERT INTO \"issues\" (\"project_id\", \"fingerprint\", \"title\", \"level\", \"event_count\") VALUES ($1, $2, $3, $4, $5) ON CONFLICT (\"project_id\", \"fingerprint\") DO UPDATE SET \"event_count\" = (\"event_count\" + $6), \"status\" = CASE WHEN (\"status\" = $7) THEN $8 ELSE \"status\" END, \"last_seen\" = now() RETURNING *"
        );
        assert_eq!(
            params,
            vec![
                "project-1",
                "fp-1",
                "Boom",
                "error",
                "1",
                "1",
                "resolved",
                "unresolved",
            ]
        );
    }

    #[test]
    fn test_where_expr_sql_renumbers_after_select_params() {
        let (sql, params) = build_select_sql_from_parts_with_select_params(
            "users",
            &["EXPR:crypt($1, password_hash) AS \"candidate\"".into()],
            &["secret".into()],
            &["EXPR:(\"password_hash\" = crypt($1, \"password_hash\"))".into()],
            &["secret".into()],
            &[],
            -1,
            -1,
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        );

        assert_eq!(
            sql,
            "SELECT crypt($1, password_hash) AS \"candidate\" FROM \"users\" WHERE (\"password_hash\" = crypt($2, \"password_hash\"))"
        );
        assert_eq!(params, vec!["secret", "secret"]);
    }

    #[test]
    fn test_insert_expr_sql_preserves_expr_param_order() {
        let (sql, params) = build_insert_expr_sql_pure(
            "users",
            &["email".into(), "password_hash".into(), "display_name".into()],
            &[
                SqlExpr::Value("alice@example.com".into()),
                SqlExpr::Call {
                    name: "crypt".into(),
                    args: vec![
                        SqlExpr::Value("secret".into()),
                        SqlExpr::Call {
                            name: "gen_salt".into(),
                            args: vec![
                                SqlExpr::Value("bf".into()),
                                SqlExpr::Value("12".into()),
                            ],
                        },
                    ],
                },
                SqlExpr::Value("Alice".into()),
            ],
        )
        .expect("insert_expr SQL should build");

        assert_eq!(
            sql,
            "INSERT INTO \"users\" (\"email\", \"password_hash\", \"display_name\") VALUES ($1, crypt($2, gen_salt($3, $4)), $5) RETURNING *"
        );
        assert_eq!(
            params,
            vec!["alice@example.com", "secret", "bf", "12", "Alice"]
        );
    }
}
