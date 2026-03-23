//! GC-managed string operations for the Mesh runtime.
//!
//! Strings in Mesh are length-prefixed, UTF-8, GC-managed values. The layout
//! is `{ len: u64, data: [u8; len] }` -- the data bytes immediately follow
//! the length field in memory.
//!
//! All string functions allocate via `mesh_gc_alloc_actor` so they are managed
//! by the per-actor GC heap (falling back to the global arena outside actor
//! context).

use std::io::Write;
use std::ptr;

use crate::gc::mesh_gc_alloc_actor;
use crate::option::alloc_option;
use crate::collections::list::{mesh_list_builder_new, mesh_list_builder_push};

/// A GC-managed Mesh string.
///
/// Layout: `[u64 len][u8 data...]` -- the `data` bytes immediately follow
/// the `len` field in memory. This struct only declares the `len` field;
/// the data is accessed by pointer arithmetic past the struct.
#[repr(C)]
pub struct MeshString {
    pub len: u64,
    // data bytes follow immediately after this struct in memory
}

impl MeshString {
    /// Size of the header (the `len` field).
    const HEADER_SIZE: usize = std::mem::size_of::<u64>();

    /// Get a pointer to the data bytes following the header.
    ///
    /// # Safety
    ///
    /// Caller must ensure `self` points to a valid MeshString allocation
    /// with at least `self.len` bytes following the header.
    pub unsafe fn data_ptr(&self) -> *const u8 {
        (self as *const Self as *const u8).add(Self::HEADER_SIZE)
    }

    /// Get a mutable pointer to the data bytes following the header.
    ///
    /// # Safety
    ///
    /// Caller must ensure `self` points to a valid, mutable MeshString
    /// allocation with at least `self.len` bytes following the header.
    pub unsafe fn data_ptr_mut(&mut self) -> *mut u8 {
        (self as *mut Self as *mut u8).add(Self::HEADER_SIZE)
    }

    /// View the string data as a byte slice.
    ///
    /// # Safety
    ///
    /// Caller must ensure the MeshString was properly initialized with
    /// valid UTF-8 data of length `self.len`.
    pub unsafe fn as_bytes(&self) -> &[u8] {
        std::slice::from_raw_parts(self.data_ptr(), self.len as usize)
    }

    /// View the string data as a `&str`.
    ///
    /// # Safety
    ///
    /// Caller must ensure the MeshString contains valid UTF-8.
    pub unsafe fn as_str(&self) -> &str {
        std::str::from_utf8_unchecked(self.as_bytes())
    }
}

/// Create a new GC-managed Mesh string from raw bytes.
///
/// Allocates `sizeof(u64) + len` bytes from the GC arena, copies `data`
/// into the allocation, and returns a pointer to the new `MeshString`.
///
/// # Safety
///
/// `data` must point to at least `len` valid bytes. If `data` is null,
/// the string data is zeroed.
#[no_mangle]
pub extern "C" fn mesh_string_new(data: *const u8, len: u64) -> *mut MeshString {
    unsafe {
        let total = MeshString::HEADER_SIZE + len as usize;
        let ptr = mesh_gc_alloc_actor(total as u64, 8) as *mut MeshString;
        (*ptr).len = len;
        if !data.is_null() && len > 0 {
            let dst = (*ptr).data_ptr_mut();
            ptr::copy_nonoverlapping(data, dst, len as usize);
        }
        ptr
    }
}

/// Concatenate two Mesh strings, returning a new GC-managed string.
#[no_mangle]
pub extern "C" fn mesh_string_concat(
    a: *const MeshString,
    b: *const MeshString,
) -> *mut MeshString {
    unsafe {
        let a_len = (*a).len;
        let b_len = (*b).len;
        let new_len = a_len + b_len;
        let result = mesh_string_new(ptr::null(), new_len);
        let dst = (*result).data_ptr_mut();
        ptr::copy_nonoverlapping((*a).data_ptr(), dst, a_len as usize);
        ptr::copy_nonoverlapping((*b).data_ptr(), dst.add(a_len as usize), b_len as usize);
        result
    }
}

/// Convert an i64 integer to a GC-managed Mesh string.
#[no_mangle]
pub extern "C" fn mesh_int_to_string(val: i64) -> *mut MeshString {
    let s = val.to_string();
    mesh_string_new(s.as_ptr(), s.len() as u64)
}

/// Convert an f64 float to a GC-managed Mesh string.
#[no_mangle]
pub extern "C" fn mesh_float_to_string(val: f64) -> *mut MeshString {
    let s = val.to_string();
    mesh_string_new(s.as_ptr(), s.len() as u64)
}

/// Convert a boolean (i8: 0 = false, non-zero = true) to a GC-managed Mesh string.
#[no_mangle]
pub extern "C" fn mesh_bool_to_string(val: i8) -> *mut MeshString {
    let s = if val != 0 { "true" } else { "false" };
    mesh_string_new(s.as_ptr(), s.len() as u64)
}

/// Identity function for string-to-string conversion.
///
/// Used as a callback for collection Display when elements are strings.
/// Takes a u64 (which is a MeshString pointer cast to u64) and returns
/// it as a `*mut MeshString`. This allows collection to_string helpers
/// to use a uniform callback signature `fn(u64) -> *mut u8`.
#[no_mangle]
pub extern "C" fn mesh_string_to_string(val: u64) -> *mut MeshString {
    val as *mut MeshString
}

/// Print a Mesh string to stdout (no trailing newline).
#[no_mangle]
pub extern "C" fn mesh_print(s: *const MeshString) {
    unsafe {
        let text = (*s).as_str();
        print!("{}", text);
        let _ = std::io::stdout().flush();
    }
}

/// Print a Mesh string to stdout with a trailing newline.
#[no_mangle]
pub extern "C" fn mesh_println(s: *const MeshString) {
    unsafe {
        let text = (*s).as_str();
        println!("{}", text);
        let _ = std::io::stdout().flush();
    }
}

// ── String operations (Phase 8) ──────────────────────────────────────────

/// Return the number of Unicode codepoints in the string (NOT byte length).
#[no_mangle]
pub extern "C" fn mesh_string_length(s: *const MeshString) -> i64 {
    unsafe { (*s).as_str().chars().count() as i64 }
}

/// Codepoint-based slice (0-indexed, exclusive end). Clamps to bounds.
#[no_mangle]
pub extern "C" fn mesh_string_slice(
    s: *const MeshString,
    start: i64,
    end: i64,
) -> *mut MeshString {
    unsafe {
        let text = (*s).as_str();
        let char_count = text.chars().count();
        let start = (start.max(0) as usize).min(char_count);
        let end = (end.max(0) as usize).min(char_count).max(start);
        let sliced: String = text.chars().skip(start).take(end - start).collect();
        mesh_string_new(sliced.as_ptr(), sliced.len() as u64)
    }
}

/// Returns 1 if haystack contains needle, 0 otherwise.
#[no_mangle]
pub extern "C" fn mesh_string_contains(
    haystack: *const MeshString,
    needle: *const MeshString,
) -> i8 {
    unsafe {
        if (*haystack).as_str().contains((*needle).as_str()) {
            1
        } else {
            0
        }
    }
}

/// Returns 1 if string starts with prefix, 0 otherwise.
#[no_mangle]
pub extern "C" fn mesh_string_starts_with(
    s: *const MeshString,
    prefix: *const MeshString,
) -> i8 {
    unsafe {
        if (*s).as_str().starts_with((*prefix).as_str()) {
            1
        } else {
            0
        }
    }
}

/// Returns 1 if string ends with suffix, 0 otherwise.
#[no_mangle]
pub extern "C" fn mesh_string_ends_with(
    s: *const MeshString,
    suffix: *const MeshString,
) -> i8 {
    unsafe {
        if (*s).as_str().ends_with((*suffix).as_str()) {
            1
        } else {
            0
        }
    }
}

/// Trim whitespace from both sides.
#[no_mangle]
pub extern "C" fn mesh_string_trim(s: *const MeshString) -> *mut MeshString {
    unsafe {
        let trimmed = (*s).as_str().trim();
        mesh_string_new(trimmed.as_ptr(), trimmed.len() as u64)
    }
}

/// Convert to uppercase.
#[no_mangle]
pub extern "C" fn mesh_string_to_upper(s: *const MeshString) -> *mut MeshString {
    unsafe {
        let upper = (*s).as_str().to_uppercase();
        mesh_string_new(upper.as_ptr(), upper.len() as u64)
    }
}

/// Convert to lowercase.
#[no_mangle]
pub extern "C" fn mesh_string_to_lower(s: *const MeshString) -> *mut MeshString {
    unsafe {
        let lower = (*s).as_str().to_lowercase();
        mesh_string_new(lower.as_ptr(), lower.len() as u64)
    }
}

/// Replace all occurrences of `from` with `to` in the string.
#[no_mangle]
pub extern "C" fn mesh_string_replace(
    s: *const MeshString,
    from: *const MeshString,
    to: *const MeshString,
) -> *mut MeshString {
    unsafe {
        let result = (*s)
            .as_str()
            .replace((*from).as_str(), (*to).as_str());
        mesh_string_new(result.as_ptr(), result.len() as u64)
    }
}

/// Compare two Mesh strings for equality. Returns 1 if equal, 0 otherwise.
#[no_mangle]
pub extern "C" fn mesh_string_eq(a: *const MeshString, b: *const MeshString) -> i8 {
    unsafe {
        if (*a).as_str() == (*b).as_str() {
            1
        } else {
            0
        }
    }
}

// ── String split/join/parse operations (Phase 46 Plan 02) ────────────

/// Split a string by a delimiter, returning a List<String>.
///
/// Uses the list builder API to construct the result list efficiently.
#[no_mangle]
pub extern "C" fn mesh_string_split(
    s: *const MeshString,
    delim: *const MeshString,
) -> *mut u8 {
    unsafe {
        let text = (*s).as_str();
        let delimiter = (*delim).as_str();
        let parts: Vec<&str> = text.split(delimiter).collect();
        let list = mesh_list_builder_new(parts.len() as i64);
        for part in &parts {
            let mesh_str = mesh_string_new(part.as_ptr(), part.len() as u64);
            mesh_list_builder_push(list, mesh_str as u64);
        }
        list
    }
}

/// Join a list of strings with a separator, returning a new String.
///
/// Reads list elements as MeshString pointers (stored as u64 in the list).
/// List layout: u64 length at offset 0, u64 elements starting at offset 16
/// (after length + capacity header).
#[no_mangle]
pub extern "C" fn mesh_string_join(
    list: *mut u8,
    sep: *const MeshString,
) -> *mut u8 {
    unsafe {
        let separator = (*sep).as_str();
        let len = *(list as *const u64) as usize;
        let data = (list as *const u64).add(2); // skip length + capacity header
        let mut parts: Vec<&str> = Vec::with_capacity(len);
        for i in 0..len {
            let elem = *data.add(i);
            let mesh_str = elem as *const MeshString;
            parts.push((*mesh_str).as_str());
        }
        let result = parts.join(separator);
        mesh_string_new(result.as_ptr(), result.len() as u64) as *mut u8
    }
}

/// Parse a string to an integer, returning Option<Int>.
///
/// Returns Some(n) on success (tag 0), None on failure (tag 1).
#[no_mangle]
pub extern "C" fn mesh_string_to_int(s: *const MeshString) -> *mut u8 {
    unsafe {
        let text = (*s).as_str().trim();
        match text.parse::<i64>() {
            Ok(val) => {
                let boxed = Box::into_raw(Box::new(val)) as *mut u8;
                alloc_option(0, boxed) as *mut u8
            }
            Err(_) => alloc_option(1, std::ptr::null_mut()) as *mut u8,
        }
    }
}

/// Parse a string to a float, returning Option<Float>.
///
/// Returns Some(f) on success (tag 0), None on failure (tag 1).
/// CRITICAL: Uses f64::to_bits() to store the float as its bit pattern
/// in the u64 value field of MeshOption.
#[no_mangle]
pub extern "C" fn mesh_string_to_float(s: *const MeshString) -> *mut u8 {
    unsafe {
        let text = (*s).as_str().trim();
        match text.parse::<f64>() {
            Ok(val) => {
                let boxed = Box::into_raw(Box::new(f64::to_bits(val))) as *mut u8;
                alloc_option(0, boxed) as *mut u8
            }
            Err(_) => alloc_option(1, std::ptr::null_mut()) as *mut u8,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gc::mesh_rt_init;

    #[test]
    fn test_string_new_and_read() {
        mesh_rt_init();
        let data = b"hello";
        let s = mesh_string_new(data.as_ptr(), data.len() as u64);
        unsafe {
            assert_eq!((*s).len, 5);
            assert_eq!((*s).as_str(), "hello");
        }
    }

    #[test]
    fn test_string_concat() {
        mesh_rt_init();
        let a = mesh_string_new(b"hello ".as_ptr(), 6);
        let b = mesh_string_new(b"world".as_ptr(), 5);
        let result = mesh_string_concat(a, b);
        unsafe {
            assert_eq!((*result).len, 11);
            assert_eq!((*result).as_str(), "hello world");
        }
    }

    #[test]
    fn test_int_to_string() {
        mesh_rt_init();
        let s = mesh_int_to_string(42);
        unsafe {
            assert_eq!((*s).as_str(), "42");
        }
    }

    #[test]
    fn test_int_to_string_negative() {
        mesh_rt_init();
        let s = mesh_int_to_string(-123);
        unsafe {
            assert_eq!((*s).as_str(), "-123");
        }
    }

    #[test]
    fn test_float_to_string() {
        mesh_rt_init();
        let s = mesh_float_to_string(3.14);
        unsafe {
            let text = (*s).as_str();
            assert!(text.starts_with("3.14"), "got: {}", text);
        }
    }

    #[test]
    fn test_bool_to_string() {
        mesh_rt_init();
        let t = mesh_bool_to_string(1);
        let f = mesh_bool_to_string(0);
        unsafe {
            assert_eq!((*t).as_str(), "true");
            assert_eq!((*f).as_str(), "false");
        }
    }

    #[test]
    fn test_empty_string() {
        mesh_rt_init();
        let s = mesh_string_new(std::ptr::null(), 0);
        unsafe {
            assert_eq!((*s).len, 0);
            assert_eq!((*s).as_str(), "");
        }
    }

    // ── Phase 8 string operation tests ─────────────────────────────────

    #[test]
    fn test_string_length() {
        mesh_rt_init();
        let s = mesh_string_new(b"hello".as_ptr(), 5);
        assert_eq!(mesh_string_length(s), 5);
    }

    #[test]
    fn test_string_length_unicode() {
        mesh_rt_init();
        // "cafe\u{0301}" = "cafe\u{0301}" -- 5 codepoints, but more bytes
        let text = "caf\u{00e9}"; // 4 codepoints, e-with-accent is 2 bytes
        let s = mesh_string_new(text.as_ptr(), text.len() as u64);
        assert_eq!(mesh_string_length(s), 4);
    }

    #[test]
    fn test_string_length_empty() {
        mesh_rt_init();
        let s = mesh_string_new(std::ptr::null(), 0);
        assert_eq!(mesh_string_length(s), 0);
    }

    #[test]
    fn test_string_slice() {
        mesh_rt_init();
        let s = mesh_string_new(b"hello world".as_ptr(), 11);
        let sliced = mesh_string_slice(s, 0, 5);
        unsafe {
            assert_eq!((*sliced).as_str(), "hello");
        }
    }

    #[test]
    fn test_string_slice_clamp() {
        mesh_rt_init();
        let s = mesh_string_new(b"abc".as_ptr(), 3);
        // Out of bounds clamps
        let sliced = mesh_string_slice(s, -5, 100);
        unsafe {
            assert_eq!((*sliced).as_str(), "abc");
        }
    }

    #[test]
    fn test_string_contains() {
        mesh_rt_init();
        let hay = mesh_string_new(b"hello world".as_ptr(), 11);
        let needle = mesh_string_new(b"world".as_ptr(), 5);
        let missing = mesh_string_new(b"xyz".as_ptr(), 3);
        assert_eq!(mesh_string_contains(hay, needle), 1);
        assert_eq!(mesh_string_contains(hay, missing), 0);
    }

    #[test]
    fn test_string_starts_with() {
        mesh_rt_init();
        let s = mesh_string_new(b"hello world".as_ptr(), 11);
        let prefix = mesh_string_new(b"hello".as_ptr(), 5);
        let wrong = mesh_string_new(b"world".as_ptr(), 5);
        assert_eq!(mesh_string_starts_with(s, prefix), 1);
        assert_eq!(mesh_string_starts_with(s, wrong), 0);
    }

    #[test]
    fn test_string_ends_with() {
        mesh_rt_init();
        let s = mesh_string_new(b"hello world".as_ptr(), 11);
        let suffix = mesh_string_new(b"world".as_ptr(), 5);
        let wrong = mesh_string_new(b"hello".as_ptr(), 5);
        assert_eq!(mesh_string_ends_with(s, suffix), 1);
        assert_eq!(mesh_string_ends_with(s, wrong), 0);
    }

    #[test]
    fn test_string_trim() {
        mesh_rt_init();
        let s = mesh_string_new(b"  hello  ".as_ptr(), 9);
        let trimmed = mesh_string_trim(s);
        unsafe {
            assert_eq!((*trimmed).as_str(), "hello");
        }
    }

    #[test]
    fn test_string_to_upper() {
        mesh_rt_init();
        let s = mesh_string_new(b"hello".as_ptr(), 5);
        let upper = mesh_string_to_upper(s);
        unsafe {
            assert_eq!((*upper).as_str(), "HELLO");
        }
    }

    #[test]
    fn test_string_to_lower() {
        mesh_rt_init();
        let s = mesh_string_new(b"HELLO".as_ptr(), 5);
        let lower = mesh_string_to_lower(s);
        unsafe {
            assert_eq!((*lower).as_str(), "hello");
        }
    }

    #[test]
    fn test_string_replace() {
        mesh_rt_init();
        let s = mesh_string_new(b"hello world".as_ptr(), 11);
        let from = mesh_string_new(b"world".as_ptr(), 5);
        let to = mesh_string_new(b"mesh".as_ptr(), 4);
        let result = mesh_string_replace(s, from, to);
        unsafe {
            assert_eq!((*result).as_str(), "hello mesh");
        }
    }

    #[test]
    fn test_string_eq() {
        mesh_rt_init();
        let a = mesh_string_new(b"hello".as_ptr(), 5);
        let b = mesh_string_new(b"hello".as_ptr(), 5);
        let c = mesh_string_new(b"world".as_ptr(), 5);
        assert_eq!(mesh_string_eq(a, b), 1);
        assert_eq!(mesh_string_eq(a, c), 0);
    }
}
