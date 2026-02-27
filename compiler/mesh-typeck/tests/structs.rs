//! Integration tests for struct, Option, Result, and type alias inference.
//!
//! These tests exercise:
//! - Struct definitions, struct literal type-checking, and field access
//! - Generic struct inference (type parameter propagation)
//! - Built-in Option<T> with `Some`, `None` constructors and `Int?` sugar
//! - Built-in Result<T, E> with `Ok`, `Err` constructors and `T!E` sugar
//! - Type alias resolution (transparent aliases)

use mesh_typeck::error::TypeError;
use mesh_typeck::ty::Ty;
use mesh_typeck::TypeckResult;

// ── Helpers ────────────────────────────────────────────────────────────

/// Parse Mesh source and run the type checker.
fn check_source(src: &str) -> TypeckResult {
    let parse = mesh_parser::parse(src);
    mesh_typeck::check(&parse)
}

/// Assert that the result has no errors and the final expression type
/// matches the expected type.
fn assert_result_type(result: &TypeckResult, expected: Ty) {
    assert!(
        result.errors.is_empty(),
        "expected no errors, got: {:?}",
        result.errors
    );
    let actual = result
        .result_type
        .as_ref()
        .expect("expected a result type from inference");
    let actual_str = format!("{}", actual);
    let expected_str = format!("{}", expected);
    assert_eq!(
        actual_str, expected_str,
        "expected type `{}`, got `{}`",
        expected_str, actual_str
    );
}

/// Assert that the result contains an error matching the given predicate.
fn assert_has_error<F: Fn(&TypeError) -> bool>(result: &TypeckResult, pred: F, desc: &str) {
    assert!(
        result.errors.iter().any(|e| pred(e)),
        "expected error matching `{}`, got errors: {:?}",
        desc,
        result.errors
    );
}

// ── Struct Tests ───────────────────────────────────────────────────────

/// Test 1: Struct definition and literal construction.
/// Parse a struct def followed by a struct literal and check the result type.
#[test]
fn test_struct_definition_and_literal() {
    let result = check_source(
        "struct Point do\n  x :: Int\n  y :: Int\nend\nlet p = Point { x: 1, y: 2 }\np",
    );
    assert_result_type(
        &result,
        Ty::App(
            Box::new(Ty::Con(mesh_typeck::ty::TyCon::new("Point"))),
            vec![],
        ),
    );
}

/// Test 2: Struct field access -- accessing a field returns the field's type.
#[test]
fn test_struct_field_access() {
    let result = check_source(
        "struct Point do\n  x :: Int\n  y :: Int\nend\nlet p = Point { x: 1, y: 2 }\np.x",
    );
    assert_result_type(&result, Ty::int());
}

/// Test 3: Generic struct -- type parameters inferred from field values.
#[test]
fn test_generic_struct() {
    let result = check_source(
        "struct Pair<A, B> do\n  first :: A\n  second :: B\nend\nlet p = Pair { first: 1, second: \"hello\" }\np",
    );
    assert_result_type(
        &result,
        Ty::App(
            Box::new(Ty::Con(mesh_typeck::ty::TyCon::new("Pair"))),
            vec![Ty::int(), Ty::string()],
        ),
    );
}

/// Test 4: Generic struct field access -- fields resolve to concrete types.
#[test]
fn test_generic_struct_field_access() {
    let src = "struct Pair<A, B> do\n  first :: A\n  second :: B\nend\nlet p = Pair { first: 1, second: \"hello\" }\np.first";
    let result = check_source(src);
    assert_result_type(&result, Ty::int());
}

/// Test 5: Struct literal with wrong field type produces type mismatch error.
#[test]
fn test_struct_wrong_field_type() {
    let result = check_source(
        "struct Point do\n  x :: Int\n  y :: Int\nend\nPoint { x: \"bad\", y: 2 }",
    );
    assert_has_error(
        &result,
        |e| matches!(e, TypeError::Mismatch { .. }),
        "Mismatch (wrong field type)",
    );
}

/// Test 6: Struct literal with missing field produces an error.
#[test]
fn test_struct_missing_field() {
    let result = check_source(
        "struct Point do\n  x :: Int\n  y :: Int\nend\nPoint { x: 1 }",
    );
    assert_has_error(
        &result,
        |e| {
            matches!(e, TypeError::Mismatch { .. })
                || matches!(e, TypeError::ArityMismatch { .. })
                || format!("{}", e).contains("missing")
        },
        "missing field error",
    );
}

// ── Option Tests ──────────────────────────────────────────────────────

/// Test 7: Option<Int> with Some(42) -- Some constructor inference.
#[test]
fn test_option_some_inference() {
    let result = check_source("let x :: Option<Int> = Some(42)\nx");
    assert_result_type(&result, Ty::option(Ty::int()));
}

/// Test 8: Option<Int> with None -- None constructor inference.
#[test]
fn test_option_none_inference() {
    let result = check_source("let x :: Option<Int> = None\nx");
    assert_result_type(&result, Ty::option(Ty::int()));
}

/// Test 9: Option sugar -- `Int?` desugars to `Option<Int>`.
#[test]
fn test_option_sugar_annotation() {
    let result = check_source("let x :: Int? = Some(42)\nx");
    assert_result_type(&result, Ty::option(Ty::int()));
}

/// Test 10: Generic propagation through Option -- wrap<T>(x: T) -> Option<T>.
#[test]
fn test_option_generic_propagation() {
    let result = check_source(
        "fn wrap(x) do\n  Some(x)\nend\nwrap(42)",
    );
    assert_result_type(&result, Ty::option(Ty::int()));
}

// ── Result Tests ──────────────────────────────────────────────────────

/// Test 11: Result<Int, String> with Ok(42).
#[test]
fn test_result_ok_inference() {
    let result = check_source("let x :: Result<Int, String> = Ok(42)\nx");
    assert_result_type(&result, Ty::result(Ty::int(), Ty::string()));
}

/// Test 12: Result<Int, String> with Err("bad").
#[test]
fn test_result_err_inference() {
    let result = check_source("let x :: Result<Int, String> = Err(\"bad\")\nx");
    assert_result_type(&result, Ty::result(Ty::int(), Ty::string()));
}

/// Test 13: Result sugar -- `Int!String` desugars to `Result<Int, String>`.
#[test]
fn test_result_sugar_annotation() {
    let result = check_source("let x :: Int!String = Ok(42)\nx");
    assert_result_type(&result, Ty::result(Ty::int(), Ty::string()));
}

// ── Type Alias Tests ─────────────────────────────────────────────────

/// Test 14: Simple type alias -- `type Name = String`.
/// The annotation `Name` must resolve to `String` so that a String value is accepted.
/// We verify by checking the annotation is enforced: if the alias is NOT resolved,
/// a mismatch would occur when annotations are enforced.
#[test]
fn test_type_alias_simple() {
    // Without alias resolution, `Name` as an annotation would either be ignored
    // or fail. We test that `Name` correctly resolves to `String`.
    let result = check_source("type Name = String\nlet x :: Name = \"hello\"\nx");
    assert_result_type(&result, Ty::string());
    // Verify no errors -- the alias resolved and String matches String.
    assert!(result.errors.is_empty(), "type alias should resolve without errors: {:?}", result.errors);
}

/// Test 15: Generic type alias -- `type Pair<A, B> = (A, B)`.
#[test]
fn test_type_alias_generic() {
    let result = check_source(
        "type Pair<A, B> = (A, B)\nlet x :: Pair<Int, String> = (1, \"hello\")\nx",
    );
    // After alias resolution, Pair<Int, String> is (Int, String)
    assert_result_type(&result, Ty::Tuple(vec![Ty::int(), Ty::string()]));
}

/// ALIAS-04: compiler emits error for alias referencing undefined type
#[test]
fn test_type_alias_undefined_target() {
    let result = check_source("type Foo = NonExistentType");
    assert!(!result.errors.is_empty(), "expected error for undefined alias target");
    // Verify the error mentions the undefined type name
    let err_str = format!("{:?}", result.errors);
    assert!(
        err_str.contains("NonExistentType") || err_str.contains("undefined"),
        "error should mention the undefined type: {}",
        err_str
    );
}

/// ALIAS-02: alias in let binding with type annotation
#[test]
fn test_type_alias_in_let_binding() {
    let result = check_source("type Name = String\nlet x :: Name = \"hello\"\nx");
    assert!(result.errors.is_empty(), "no errors expected: {:?}", result.errors);
}

/// ALIAS-02: alias in function return type
#[test]
fn test_type_alias_in_fn_return() {
    let result = check_source(
        "type Url = String\nfn make_url(s :: String) -> Url do\n  s\nend\nmake_url(\"http://x\")",
    );
    assert!(result.errors.is_empty(), "no errors expected: {:?}", result.errors);
}

/// ALIAS-03: pub type alias is usable in function signatures (pre-registration smoke test).
///
/// Simulates the import pre-registration path in a single-file form:
/// a pub type alias defined in the same file should be usable in function signatures
/// without errors. True cross-module coverage is in compiler/meshc/tests/e2e.rs
/// (e2e_type_alias_pub).
#[test]
fn test_alias_import_context_pre_registration() {
    let result = check_source(
        "pub type UserId = Int\nfn get(id :: UserId) -> UserId do id end\nget(1)"
    );
    assert!(result.errors.is_empty(), "pub type alias should work in function signatures: {:?}", result.errors);
}
