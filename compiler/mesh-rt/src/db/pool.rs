//! PostgreSQL connection pool for the Mesh runtime.
//!
//! Provides a bounded pool of PostgreSQL connections with Mutex+Condvar
//! synchronization. Multiple Mesh actors share a fixed set of database
//! connections, preventing connection exhaustion.
//!
//! ## Functions
//!
//! - `mesh_pool_open`: Create a pool with configurable min/max/timeout
//! - `mesh_pool_checkout`: Borrow a connection (blocks with timeout)
//! - `mesh_pool_checkin`: Return a connection (auto-ROLLBACK if dirty)
//! - `mesh_pool_query`: Auto checkout-use-checkin for SELECT
//! - `mesh_pool_execute`: Auto checkout-use-checkin for INSERT/UPDATE/DELETE
//! - `mesh_pool_close`: Drain all connections, prevent new checkouts
//!
//! Pool handles are opaque u64 values (Box::into_raw), same pattern as
//! PgConn/SqliteConn handles.

use std::time::{Duration, Instant};

use parking_lot::{Condvar, Mutex};

use super::pg::{
    mesh_pg_close, mesh_pg_connect, mesh_pg_execute, mesh_pg_query, mesh_pg_query_as,
    pg_simple_command, PgConn,
};
use crate::io::alloc_result;
use crate::string::{mesh_string_new, MeshString};

// ── Data Structures ──────────────────────────────────────────────────────

struct PooledConn {
    handle: u64,
    #[allow(dead_code)]
    last_used: Instant,
}

struct PoolInner {
    url: String,
    idle: Vec<PooledConn>,
    active_count: usize,
    total_created: usize,
    #[allow(dead_code)]
    min_conns: usize,
    max_conns: usize,
    checkout_timeout_ms: u64,
    closed: bool,
}

struct PgPool {
    inner: Mutex<PoolInner>,
    available: Condvar,
}

// ── Helpers ──────────────────────────────────────────────────────────────

/// Extract a Rust &str from a raw MeshString pointer.
unsafe fn mesh_str_to_rust(s: *const MeshString) -> &'static str {
    (*s).as_str()
}

/// Create a MeshString from a Rust &str and return as *mut u8.
fn rust_str_to_mesh(s: &str) -> *mut u8 {
    mesh_string_new(s.as_ptr(), s.len() as u64) as *mut u8
}

/// Create an error MeshResult from a Rust string.
fn err_result(msg: &str) -> *mut u8 {
    let s = rust_str_to_mesh(msg);
    alloc_result(1, s) as *mut u8
}

/// Create a new PG connection from a URL string.
/// Returns Ok(handle_u64) or Err(error_message).
unsafe fn create_connection(url: &str) -> Result<u64, String> {
    // Create a MeshString from the URL
    let url_mesh = mesh_string_new(url.as_ptr(), url.len() as u64);
    let result_ptr = mesh_pg_connect(url_mesh as *const MeshString);
    let r = &*(result_ptr as *const crate::io::MeshResult);
    if r.tag == 0 {
        Ok(r.value as u64)
    } else {
        // Extract the error message string from the MeshString value
        let err_str = &*(r.value as *const MeshString);
        Err(err_str.as_str().to_string())
    }
}

fn box_u64_payload(value: u64) -> *mut u8 {
    Box::into_raw(Box::new(value)) as *mut u8
}

unsafe fn unbox_u64_payload(ptr: *mut u8) -> u64 {
    *(ptr as *const u64)
}

/// Perform a health check on a connection by sending SELECT 1.
/// Returns true if healthy, false if dead.
unsafe fn health_check(handle: u64) -> bool {
    let conn = &mut *(handle as *mut PgConn);
    pg_simple_command(conn, "SELECT 1").is_ok()
}

// ── Public API ───────────────────────────────────────────────────────────

/// Create a PostgreSQL connection pool.
///
/// # Signature
///
/// `mesh_pool_open(url: *const MeshString, min_conns: i64, max_conns: i64,
///     timeout_ms: i64) -> *mut u8 (MeshResult<u64, String>)`
///
/// Pre-creates `min_conns` connections. Returns MeshResult with tag 0 (Ok)
/// containing the pool handle as u64, or tag 1 (Err) with error message.
#[no_mangle]
pub extern "C" fn mesh_pool_open(
    url: *const MeshString,
    min_conns: i64,
    max_conns: i64,
    timeout_ms: i64,
) -> *mut u8 {
    unsafe {
        let url_str = mesh_str_to_rust(url);

        // Clamp parameters to reasonable values
        let min = (min_conns.max(0)) as usize;
        let max = (max_conns.max(1)) as usize;
        let max = max.max(min.max(1));
        let timeout = (timeout_ms.max(100)) as u64;

        // Pre-create min_conns connections
        let mut idle = Vec::with_capacity(min);
        for _ in 0..min {
            match create_connection(url_str) {
                Ok(handle) => {
                    idle.push(PooledConn {
                        handle,
                        last_used: Instant::now(),
                    });
                }
                Err(e) => {
                    // Close all already-created connections
                    for c in idle.drain(..) {
                        mesh_pg_close(c.handle);
                    }
                    return err_result(&format!("pool open: {}", e));
                }
            }
        }

        let pool = Box::new(PgPool {
            inner: Mutex::new(PoolInner {
                url: url_str.to_string(),
                idle,
                active_count: 0,
                total_created: min,
                min_conns: min,
                max_conns: max,
                checkout_timeout_ms: timeout,
                closed: false,
            }),
            available: Condvar::new(),
        });

        let handle = Box::into_raw(pool) as u64;
        alloc_result(0, box_u64_payload(handle)) as *mut u8
    }
}

/// Check out a connection from the pool.
///
/// # Signature
///
/// `mesh_pool_checkout(pool_handle: u64) -> *mut u8 (MeshResult<u64, String>)`
///
/// Returns an idle connection, creates a new one if under max, or blocks
/// with timeout if pool is exhausted. Performs health check on idle
/// connections before returning them.
#[no_mangle]
pub extern "C" fn mesh_pool_checkout(pool_handle: u64) -> *mut u8 {
    unsafe {
        let pool = &*(pool_handle as *const PgPool);
        let timeout = Duration::from_millis({
            let inner = pool.inner.lock();
            inner.checkout_timeout_ms
        });

        let mut inner = pool.inner.lock();

        loop {
            // Check if pool is closed
            if inner.closed {
                return err_result("pool is closed");
            }

            // Try to get an idle connection
            if let Some(conn) = inner.idle.pop() {
                // Health check: validate connection before returning
                if health_check(conn.handle) {
                    inner.active_count += 1;
                    return alloc_result(0, box_u64_payload(conn.handle)) as *mut u8;
                } else {
                    // Connection is dead -- close it and try next
                    mesh_pg_close(conn.handle);
                    inner.total_created -= 1;
                    continue;
                }
            }

            // No idle connections -- can we create a new one?
            if inner.total_created < inner.max_conns {
                // Optimistically reserve a slot
                inner.total_created += 1;
                inner.active_count += 1;
                let url = inner.url.clone();
                // Drop the lock before doing I/O (connection creation)
                drop(inner);

                match create_connection(&url) {
                    Ok(handle) => {
                        return alloc_result(0, box_u64_payload(handle)) as *mut u8;
                    }
                    Err(e) => {
                        // Undo the reservation
                        let mut inner = pool.inner.lock();
                        inner.total_created -= 1;
                        inner.active_count -= 1;
                        return err_result(&format!("pool connect: {}", e));
                    }
                }
            }

            // All connections busy, wait with timeout
            let wait_result = pool.available.wait_for(&mut inner, timeout);
            if wait_result.timed_out() {
                return err_result("pool checkout timeout");
            }
            // Loop back to try again after being notified
        }
    }
}

/// Return a connection to the pool.
///
/// # Signature
///
/// `mesh_pool_checkin(pool_handle: u64, conn_handle: u64)`
///
/// If the connection has an active transaction (txn_status != 'I'),
/// sends ROLLBACK to clean it up. If ROLLBACK fails, the connection
/// is destroyed instead of returned to idle.
#[no_mangle]
pub extern "C" fn mesh_pool_checkin(pool_handle: u64, conn_handle: u64) {
    unsafe {
        let pool = &*(pool_handle as *const PgPool);

        {
            let inner = pool.inner.lock();
            if inner.closed {
                // Pool is closed -- just destroy the connection
                mesh_pg_close(conn_handle);
                // Note: total_created/active_count will be cleaned up by close
                return;
            }
        }

        // Transaction cleanup (POOL-05): ROLLBACK if not idle
        let conn = &mut *(conn_handle as *mut PgConn);
        if conn.txn_status != b'I' {
            if pg_simple_command(conn, "ROLLBACK").is_err() {
                // Connection is broken -- close it instead of returning to idle
                mesh_pg_close(conn_handle);
                let mut inner = pool.inner.lock();
                inner.total_created -= 1;
                inner.active_count -= 1;
                pool.available.notify_one();
                return;
            }
        }

        // Return to idle
        let mut inner = pool.inner.lock();
        inner.active_count -= 1;
        inner.idle.push(PooledConn {
            handle: conn_handle,
            last_used: Instant::now(),
        });
        // Drop the lock before notifying
        drop(inner);
        pool.available.notify_one();
    }
}

/// Execute a read query (SELECT) with automatic checkout-use-checkin.
///
/// # Signature
///
/// `mesh_pool_query(pool_handle: u64, sql: *const MeshString, params: *mut u8)
///     -> *mut u8 (MeshResult<List<Map<String, String>>, String>)`
#[no_mangle]
pub extern "C" fn mesh_pool_query(
    pool_handle: u64,
    sql: *const MeshString,
    params: *mut u8,
) -> *mut u8 {
    unsafe {
        // Checkout
        let checkout_result = mesh_pool_checkout(pool_handle);
        let r = &*(checkout_result as *const crate::io::MeshResult);
        if r.tag != 0 {
            return checkout_result; // propagate checkout error
        }
        let conn_handle = unbox_u64_payload(r.value);

        // Use
        let query_result = mesh_pg_query(conn_handle, sql, params);

        // Checkin (always, even on error)
        mesh_pool_checkin(pool_handle, conn_handle);

        query_result
    }
}

/// Execute a write statement (INSERT/UPDATE/DELETE) with automatic checkout-use-checkin.
///
/// # Signature
///
/// `mesh_pool_execute(pool_handle: u64, sql: *const MeshString, params: *mut u8)
///     -> *mut u8 (MeshResult<Int, String>)`
#[no_mangle]
pub extern "C" fn mesh_pool_execute(
    pool_handle: u64,
    sql: *const MeshString,
    params: *mut u8,
) -> *mut u8 {
    unsafe {
        // Checkout
        let checkout_result = mesh_pool_checkout(pool_handle);
        let r = &*(checkout_result as *const crate::io::MeshResult);
        if r.tag != 0 {
            return checkout_result; // propagate checkout error
        }
        let conn_handle = unbox_u64_payload(r.value);

        // Use
        let exec_result = mesh_pg_execute(conn_handle, sql, params);

        // Checkin (always, even on error)
        mesh_pool_checkin(pool_handle, conn_handle);

        exec_result
    }
}

/// Execute a SELECT query with automatic checkout-use-checkin and map rows through a callback.
///
/// # Signature
///
/// `mesh_pool_query_as(pool_handle: u64, sql: *mut u8, params: *mut u8,
///     from_row_fn: *mut u8) -> *mut u8 (MeshResult<List<MeshResult>, String>)`
///
/// Same checkout/query_as/checkin pattern as `mesh_pool_query` but delegates to
/// `mesh_pg_query_as` for struct mapping.
#[no_mangle]
pub extern "C" fn mesh_pool_query_as(
    pool_handle: u64,
    sql: *mut u8,
    params: *mut u8,
    from_row_fn: *mut u8,
) -> *mut u8 {
    unsafe {
        // Checkout
        let checkout_result = mesh_pool_checkout(pool_handle);
        let r = &*(checkout_result as *const crate::io::MeshResult);
        if r.tag != 0 {
            return checkout_result; // propagate checkout error
        }
        let conn_handle = unbox_u64_payload(r.value);

        // Use
        let query_result = mesh_pg_query_as(conn_handle, sql, params, from_row_fn);

        // Checkin (always, even on error)
        mesh_pool_checkin(pool_handle, conn_handle);

        query_result
    }
}

/// Close a connection pool.
///
/// # Signature
///
/// `mesh_pool_close(pool_handle: u64)`
///
/// Sets pool to closed state, drains all idle connections, and wakes
/// all blocked checkouts so they return "pool is closed" errors.
/// Active connections will be closed when checked in.
#[no_mangle]
pub extern "C" fn mesh_pool_close(pool_handle: u64) {
    unsafe {
        let pool = &*(pool_handle as *const PgPool);
        let idle_conns: Vec<u64>;

        {
            let mut inner = pool.inner.lock();
            inner.closed = true;
            // Drain all idle connections
            idle_conns = inner.idle.drain(..).map(|c| c.handle).collect();
        }

        // Close idle connections outside the lock
        for handle in idle_conns {
            mesh_pg_close(handle);
        }

        // Wake all blocked checkouts so they see closed=true
        pool.available.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collections::list::{mesh_list_append, mesh_list_new};
    use crate::gc::mesh_rt_init;
    use crate::io::MeshResult;
    use crate::string::mesh_string_new;

    fn mk_str(s: &[u8]) -> *mut MeshString {
        mesh_string_new(s.as_ptr(), s.len() as u64)
    }

    #[test]
    #[ignore]
    fn test_pool_execute_postgres_round_trip() {
        mesh_rt_init();

        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL must be set for test_pool_execute_postgres_round_trip");
        let url = mk_str(database_url.as_bytes());
        let open_result = mesh_pool_open(url, 1, 2, 5000);
        let open = unsafe { &*(open_result as *const MeshResult) };
        assert_eq!(open.tag, 0, "pool open should succeed");
        let pool = unsafe { unbox_u64_payload(open.value) };

        let create_sql = mk_str(
            b"CREATE TEMP TABLE IF NOT EXISTS mesh_pool_smoke (id INTEGER PRIMARY KEY, name TEXT)",
        );
        let empty_params = mesh_list_new();
        let create_result = mesh_pool_execute(pool, create_sql, empty_params);
        let create = unsafe { &*(create_result as *const MeshResult) };
        assert_eq!(create.tag, 0, "pool execute should succeed");

        let insert_sql = mk_str(b"INSERT INTO mesh_pool_smoke (id, name) VALUES ($1, $2)");
        let mut insert_params = mesh_list_new();
        insert_params = mesh_list_append(insert_params, mk_str(b"1") as u64);
        insert_params = mesh_list_append(insert_params, mk_str(b"mesh") as u64);
        let insert_result = mesh_pool_execute(pool, insert_sql, insert_params);
        let insert = unsafe { &*(insert_result as *const MeshResult) };
        assert_eq!(insert.tag, 0, "pool insert should succeed");
        assert_eq!(unsafe { *(insert.value as *const i64) }, 1, "pool insert should affect one row");

        mesh_pool_close(pool);
    }
}
