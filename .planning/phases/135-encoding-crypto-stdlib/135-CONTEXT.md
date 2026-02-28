# Phase 135: Encoding & Crypto Stdlib - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Mesh programs call `Crypto.*`, `Base64.*`, and `Hex.*` functions to compute cryptographic hashes, HMAC signatures, UUIDs, and encode/decode binary data. Implemented via the three-file stdlib pattern (runtime + typeck + codegen) with zero new Rust dependencies. Module names, function signatures, and return types are fixed by requirements CRYPTO-01 through ENCODE-06.

</domain>

<decisions>
## Implementation Decisions

### Input encoding contract
- All String inputs are treated as their UTF-8 byte representation (sha256, sha512, hmac_sha256, hmac_sha512, hex encode/decode, base64 encode/decode)
- HMAC: both `key` and `msg` parameters are UTF-8 bytes — consistent with hash functions
- This encoding contract should be documented (e.g. "hashes the UTF-8 encoding of the string") so users know what's being operated on for interop with other languages
- `secure_compare(a, b)` runs in constant time regardless of string length — no short-circuit on length mismatch, so length information is not leaked

### Decode error verbosity
- `Base64.decode` and `Base64.decode_url` return `Err("invalid base64")` on failure — generic, predictable
- `Hex.decode` returns `Err("invalid hex")` on failure — same generic style, consistent with Base64
- `Base64.decode` is lenient with padding: accepts both padded (`==`) and unpadded input (real-world base64 varies on padding)
- `Base64.decode`: if decoded bytes are not valid UTF-8, return `Err("invalid utf-8")`

### Hex casing
- `Hex.encode` always outputs lowercase hex — consistent with `Crypto.sha256` etc. which also produce lowercase hex
- No `Hex.encode_upper` variant in v14.0
- `Hex.decode` is case-insensitive: accepts both `"DEADBEEF"` and `"deadbeef"` as valid input

### Binary data scope
- API is String-only for v14.0 — no `Bytes` type or binary input variants
- Users needing to hash arbitrary binary data (file bytes, non-UTF-8 content) are deferred to a future phase that introduces a Bytes type

### Claude's Discretion
- Exact Rust implementation approach for zero-dependency SHA-256/SHA-512/HMAC (pure Rust, inline implementation)
- UUID v4 randomness source (OS entropy via existing Rust std — no new deps)
- Test vector selection for correctness verification (NIST for SHA, RFC 2202 for HMAC, RFC 4648 for Base64)
- Three-file pattern file locations and registration approach (follow existing stdlib pattern)

</decisions>

<specifics>
## Specific Ideas

- The UTF-8 encoding contract documentation matters for interoperability — users computing sha256 in Mesh should get the same digest as Python `hashlib.sha256(s.encode('utf-8'))` or Node `crypto.createHash('sha256').update(s, 'utf8')`
- `secure_compare` must be safe for HMAC token verification (constant-time regardless of length is required for this use case)

</specifics>

<deferred>
## Deferred Ideas

- `Hex.encode_upper` — uppercase hex variant (not in v14.0 scope)
- `Bytes` type for hashing arbitrary binary data — future phase
- `Crypto.pbkdf2` — already listed as CRYPTO-07 (backlog, not v14.0)

</deferred>

---

*Phase: 135-encoding-crypto-stdlib*
*Context gathered: 2026-02-28*
