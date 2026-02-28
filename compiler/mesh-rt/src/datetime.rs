//! DateTime stdlib module for Mesh (Phase 136).
//!
//! All DateTime values are i64 Unix milliseconds at the ABI level.
//! chrono 0.4 handles all parsing, formatting, and arithmetic internally.
//!
//! Note: we do NOT use chrono's `clock` feature (which depends on iana-time-zone
//! and requires CoreFoundation on macOS). Instead, `utc_now` uses std::time
//! to avoid the framework dependency in the static library.

use std::time::{SystemTime, UNIX_EPOCH};

use crate::io::{MeshResult, alloc_result};
use crate::string::{MeshString, mesh_string_new};
use chrono::{DateTime, SecondsFormat, TimeDelta, Utc};

// ── utc_now ──────────────────────────────────────────────────────────────────

/// DateTime.utc_now() -> DateTime (i64 ms)
///
/// Uses std::time::SystemTime to avoid chrono's `clock` feature (which requires
/// iana-time-zone + CoreFoundation framework on macOS in static library builds).
#[no_mangle]
pub extern "C" fn mesh_datetime_utc_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before UNIX epoch")
        .as_millis() as i64
}

// ── ISO 8601 parse / format ───────────────────────────────────────────────────

/// DateTime.from_iso8601(s) -> Result<DateTime, String>
///
/// Accepts RFC 3339 with T separator only. Normalizes any timezone offset to UTC.
/// Returns Err for naive strings (no timezone) or malformed input.
#[no_mangle]
pub extern "C" fn mesh_datetime_from_iso8601(s: *const MeshString) -> *mut MeshResult {
    unsafe {
        let text = (*s).as_str();
        match DateTime::parse_from_rfc3339(text) {
            Err(_) => {
                let e = "invalid ISO 8601 datetime";
                alloc_result(1, mesh_string_new(e.as_ptr(), e.len() as u64) as *mut u8)
            }
            Ok(dt) => {
                let ms: i64 = dt.timestamp_millis();
                // Box the i64 so we can pass it as a *mut u8 payload.
                // The codegen that unpacks Result<DateTime, String> knows to treat
                // the Ok payload as an i64 (same as SqliteConn pattern).
                let boxed = Box::into_raw(Box::new(ms)) as *mut u8;
                alloc_result(0, boxed)
            }
        }
    }
}

/// DateTime.to_iso8601(dt) -> String
///
/// Always emits Z suffix and 3 decimal digits: "2024-01-15T10:30:00.000Z"
#[no_mangle]
pub extern "C" fn mesh_datetime_to_iso8601(ms: i64) -> *mut MeshString {
    let dt: DateTime<Utc> = DateTime::from_timestamp_millis(ms)
        .expect("mesh_datetime_to_iso8601: ms out of range");
    // SecondsFormat::Millis + true (use_z=true) -> always Z, always 3 decimal digits
    let s = dt.to_rfc3339_opts(SecondsFormat::Millis, true);
    mesh_string_new(s.as_ptr(), s.len() as u64)
}

// ── Unix timestamp interop ────────────────────────────────────────────────────

/// DateTime.from_unix_ms(ms) -> Result<DateTime, String>
#[no_mangle]
pub extern "C" fn mesh_datetime_from_unix_ms(ms: i64) -> *mut MeshResult {
    match DateTime::from_timestamp_millis(ms) {
        None => {
            let e = "unix timestamp out of range";
            alloc_result(1, mesh_string_new(e.as_ptr(), e.len() as u64) as *mut u8)
        }
        Some(dt) => {
            let result_ms: i64 = dt.timestamp_millis();
            let boxed = Box::into_raw(Box::new(result_ms)) as *mut u8;
            alloc_result(0, boxed)
        }
    }
}

/// DateTime.to_unix_ms(dt) -> Int
#[no_mangle]
pub extern "C" fn mesh_datetime_to_unix_ms(ms: i64) -> i64 {
    ms  // Already stored as ms — identity conversion
}

/// DateTime.from_unix_secs(s) -> Result<DateTime, String>
#[no_mangle]
pub extern "C" fn mesh_datetime_from_unix_secs(secs: i64) -> *mut MeshResult {
    match DateTime::from_timestamp(secs, 0) {
        None => {
            let e = "unix timestamp out of range";
            alloc_result(1, mesh_string_new(e.as_ptr(), e.len() as u64) as *mut u8)
        }
        Some(dt) => {
            let result_ms: i64 = dt.timestamp_millis();
            let boxed = Box::into_raw(Box::new(result_ms)) as *mut u8;
            alloc_result(0, boxed)
        }
    }
}

/// DateTime.to_unix_secs(dt) -> Int
#[no_mangle]
pub extern "C" fn mesh_datetime_to_unix_secs(ms: i64) -> i64 {
    ms / 1_000
}

// ── Duration arithmetic ───────────────────────────────────────────────────────

/// DateTime.add(dt, n, unit) -> DateTime
///
/// Supported units (atom literals without leading colon): ms, second, minute, hour, day, week
/// Unknown unit panics with a clear message.
/// n can be negative (equivalent to subtraction).
#[no_mangle]
pub extern "C" fn mesh_datetime_add(
    ms: i64,
    n: i64,
    unit: *const MeshString,
) -> i64 {
    unsafe {
        let unit_str = (*unit).as_str();
        // Atom literals are lowered without the leading ':' (e.g. :day -> "day").
        let delta = match unit_str {
            "ms"     => TimeDelta::milliseconds(n),
            "second" => TimeDelta::seconds(n),
            "minute" => TimeDelta::minutes(n),
            "hour"   => TimeDelta::hours(n),
            "day"    => TimeDelta::days(n),
            "week"   => TimeDelta::weeks(n),
            other => panic!(
                "DateTime.add: unknown unit {:?}; valid units are :ms, :second, :minute, :hour, :day, :week",
                other
            ),
        };
        let dt: DateTime<Utc> = DateTime::from_timestamp_millis(ms)
            .expect("DateTime.add: invalid ms timestamp");
        (dt + delta).timestamp_millis()
    }
}

/// DateTime.diff(dt1, dt2, unit) -> Float
///
/// Returns (dt1 - dt2) in the given unit as f64.
/// Positive if dt1 is after dt2, negative if dt1 is before dt2.
/// Supported units (atom literals without leading colon): ms, second, minute, hour, day, week
#[no_mangle]
pub extern "C" fn mesh_datetime_diff(
    dt1_ms: i64,
    dt2_ms: i64,
    unit: *const MeshString,
) -> f64 {
    unsafe {
        let unit_str = (*unit).as_str();
        // Atom literals are lowered without the leading ':' (e.g. :day -> "day").
        let delta_ms = (dt1_ms - dt2_ms) as f64;
        match unit_str {
            "ms"     => delta_ms,
            "second" => delta_ms / 1_000.0,
            "minute" => delta_ms / 60_000.0,
            "hour"   => delta_ms / 3_600_000.0,
            "day"    => delta_ms / 86_400_000.0,
            "week"   => delta_ms / 604_800_000.0,
            other => panic!(
                "DateTime.diff: unknown unit {:?}; valid units are :ms, :second, :minute, :hour, :day, :week",
                other
            ),
        }
    }
}

// ── Comparison ────────────────────────────────────────────────────────────────

/// DateTime.is_before(dt1, dt2) -> Bool (i8: 1=true, 0=false)
#[no_mangle]
pub extern "C" fn mesh_datetime_before(dt1_ms: i64, dt2_ms: i64) -> i8 {
    if dt1_ms < dt2_ms { 1 } else { 0 }
}

/// DateTime.is_after(dt1, dt2) -> Bool (i8: 1=true, 0=false)
#[no_mangle]
pub extern "C" fn mesh_datetime_after(dt1_ms: i64, dt2_ms: i64) -> i8 {
    if dt1_ms > dt2_ms { 1 } else { 0 }
}
