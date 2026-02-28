//! Type resolution: Ty -> MirType conversion.
//!
//! Converts the type checker's `Ty` representation to the concrete `MirType`
//! used in MIR. After type checking, all types should be fully resolved
//! (no remaining type variables).

use mesh_typeck::ty::{Ty, TyCon};
use mesh_typeck::TypeRegistry;

use super::MirType;

/// Convert a type checker `Ty` to a concrete `MirType`.
///
/// The `type_registry` is used to determine whether a named type is a struct
/// or a sum type. The `is_closure_context` flag indicates whether function types
/// should be treated as closures (true for values that may be closures) or as
/// known function pointers (false for named functions).
///
/// # Panics
///
/// Panics if a `Ty::Var` is encountered, which indicates an unresolved type
/// variable that should not exist after type checking.
pub fn resolve_type(ty: &Ty, registry: &TypeRegistry, is_closure_context: bool) -> MirType {
    match ty {
        Ty::Var(_v) => {
            // Unresolved type variables can occur when the type checker produces
            // errors or when types are not fully constrained. Fall back to Unit
            // for MIR lowering to proceed. The type error was already reported
            // during type checking.
            MirType::Unit
        }

        Ty::Con(con) => resolve_con(con, registry),

        Ty::Fun(params, ret) => {
            let param_types: Vec<MirType> = params
                .iter()
                .map(|p| resolve_type(p, registry, false))
                .collect();
            let ret_type = Box::new(resolve_type(ret, registry, false));
            if is_closure_context {
                MirType::Closure(param_types, ret_type)
            } else {
                MirType::FnPtr(param_types, ret_type)
            }
        }

        Ty::App(con_ty, args) => resolve_app(con_ty, args, registry),

        Ty::Tuple(elems) => {
            if elems.is_empty() {
                MirType::Unit
            } else {
                let mir_elems: Vec<MirType> = elems
                    .iter()
                    .map(|e| resolve_type(e, registry, false))
                    .collect();
                MirType::Tuple(mir_elems)
            }
        }

        Ty::Never => MirType::Never,
    }
}

/// Resolve a type constructor (no type arguments).
fn resolve_con(con: &TyCon, registry: &TypeRegistry) -> MirType {
    match con.name.as_str() {
        "Int" => MirType::Int,
        "Float" => MirType::Float,
        "Bool" => MirType::Bool,
        "String" => MirType::String,
        "Unit" | "()" => MirType::Unit,
        "Pid" => MirType::Pid(None),
        // SqliteConn is an opaque u64 handle, lowered to Int for GC safety (SQLT-07).
        // The GC never traces integer values, so the connection won't be corrupted.
        "SqliteConn" => MirType::Int,
        // PgConn is an opaque u64 handle, lowered to Int for GC safety (same as SqliteConn).
        "PgConn" => MirType::Int,
        // PoolHandle is an opaque u64 handle, lowered to Int for GC safety (same as PgConn/SqliteConn).
        "PoolHandle" => MirType::Int,
        // DateTime is an i64 Unix milliseconds value at the ABI level (Phase 136).
        // Must be lowered to Int to avoid LLVM opaque struct allocation errors.
        "DateTime" => MirType::Int,
        // Collection types, Json, HTTP types, and iterator handles are opaque pointers at LLVM level.
        "List" | "Map" | "Set" | "Range" | "Queue" | "Tuple" | "Json"
        | "Router" | "Request" | "Response"
        | "ListIterator" | "MapIterator" | "SetIterator" | "RangeIterator"
        // Phase 78: Adapter iterator types
        | "MapAdapterIterator" | "FilterAdapterIterator" | "TakeAdapterIterator"
        | "SkipAdapterIterator" | "EnumerateAdapterIterator" | "ZipAdapterIterator"
        // Phase 98: Ptr is an explicit opaque pointer type used by Query and other runtime types
        | "Ptr"
        // Phase 119: Regex is a heap-allocated opaque pointer (Box<regex::Regex> raw ptr)
        | "Regex" => MirType::Ptr,
        // Atom type resolves to String at MIR level (atoms are compile-time only, lowered to StringLit)
        "Atom" => MirType::String,
        name => {
            // Check registry: struct or sum type?
            if registry.struct_defs.contains_key(name) {
                MirType::Struct(name.to_string())
            } else if registry.sum_type_defs.contains_key(name) {
                MirType::SumType(name.to_string())
            } else {
                // Could be a type alias that was already resolved, or an unknown type.
                // Default to struct-like reference for now.
                MirType::Struct(name.to_string())
            }
        }
    }
}

/// Resolve a type application (e.g., Option<Int>, Result<T, E>, or user struct/sum).
fn resolve_app(con_ty: &Ty, args: &[Ty], registry: &TypeRegistry) -> MirType {
    // Extract the base name from the constructor.
    let base_name = match con_ty {
        Ty::Con(con) => &con.name,
        _ => return MirType::Ptr, // fallback for complex type expressions
    };

    // Collection types are opaque pointers regardless of type parameters.
    if matches!(base_name.as_str(), "List" | "Map" | "Set" | "Range" | "Queue") {
        return MirType::Ptr;
    }

    // Handle Pid<M> -> MirType::Pid(Some(M))
    if base_name == "Pid" {
        return if args.len() == 1 {
            let msg_ty = resolve_type(&args[0], registry, false);
            MirType::Pid(Some(Box::new(msg_ty)))
        } else {
            MirType::Pid(None)
        };
    }

    // For monomorphization: generate a mangled name from base + args
    if args.is_empty() {
        // No-arg application, e.g., Ty::App(Con("Point"), [])
        return resolve_con(
            &TyCon::new(base_name),
            registry,
        );
    }

    let mangled_name = mangle_type_name(base_name, args, registry);

    // Check if this is a sum type or struct
    if registry.sum_type_defs.contains_key(base_name) {
        MirType::SumType(mangled_name)
    } else if registry.struct_defs.contains_key(base_name) {
        MirType::Struct(mangled_name)
    } else {
        // Fallback: treat as a sum type (Option, Result are sum types)
        MirType::SumType(mangled_name)
    }
}

/// Generate a mangled type name for a monomorphized generic type.
///
/// E.g., `Option<Int>` -> `"Option_Int"`, `Result<Int, String>` -> `"Result_Int_String"`.
pub fn mangle_type_name(base: &str, args: &[Ty], registry: &TypeRegistry) -> String {
    let mut name = base.to_string();
    for arg in args {
        name.push('_');
        name.push_str(&mir_type_suffix(&resolve_type(arg, registry, false)));
    }
    name
}

/// Get a short suffix string for a MirType (used in name mangling).
fn mir_type_suffix(ty: &MirType) -> String {
    match ty {
        MirType::Int => "Int".to_string(),
        MirType::Float => "Float".to_string(),
        MirType::Bool => "Bool".to_string(),
        MirType::String => "String".to_string(),
        MirType::Unit => "Unit".to_string(),
        MirType::Tuple(elems) => {
            let parts: Vec<String> = elems.iter().map(mir_type_suffix).collect();
            format!("Tuple_{}", parts.join("_"))
        }
        MirType::Struct(name) | MirType::SumType(name) => name.clone(),
        MirType::FnPtr(params, ret) => {
            let p: Vec<String> = params.iter().map(mir_type_suffix).collect();
            format!("Fn_{}_to_{}", p.join("_"), mir_type_suffix(ret))
        }
        MirType::Closure(params, ret) => {
            let p: Vec<String> = params.iter().map(mir_type_suffix).collect();
            format!("Closure_{}_to_{}", p.join("_"), mir_type_suffix(ret))
        }
        MirType::Ptr => "Ptr".to_string(),
        MirType::Never => "Never".to_string(),
        MirType::Pid(None) => "Pid".to_string(),
        MirType::Pid(Some(msg_ty)) => format!("Pid_{}", mir_type_suffix(msg_ty)),
    }
}

/// Convert a MIR type back to a typeck `Ty` for TraitRegistry lookups.
///
/// This is the reverse of `resolve_type`: given a `MirType` produced during
/// lowering, reconstruct the `Ty` representation needed to query the
/// `TraitRegistry` (e.g., `has_impl`, `find_method_traits`).
///
/// Complex types (tuples, closures, function pointers) map to
/// `Ty::Con(TyCon::new("Unknown"))` since trait impls for those types
/// are not expected in v1.3.
pub fn mir_type_to_ty(mir_type: &MirType) -> Ty {
    match mir_type {
        MirType::Int => Ty::int(),
        MirType::Float => Ty::float(),
        MirType::String => Ty::string(),
        MirType::Bool => Ty::bool(),
        MirType::Struct(name) => Ty::Con(TyCon::new(name)),
        MirType::SumType(name) => Ty::Con(TyCon::new(name)),
        _ => Ty::Con(TyCon::new("Unknown")),
    }
}

/// Extract the type name string from a `MirType` for use in mangled names.
///
/// Used to construct the `Type` segment of `Trait__Method__Type` mangled
/// names. Returns the human-readable type name (e.g., "Int", "Point").
pub fn mir_type_to_impl_name(mir_type: &MirType) -> String {
    match mir_type {
        MirType::Int => "Int".to_string(),
        MirType::Float => "Float".to_string(),
        MirType::String => "String".to_string(),
        MirType::Bool => "Bool".to_string(),
        MirType::Struct(name) => name.clone(),
        MirType::SumType(name) => name.clone(),
        _ => "Unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mesh_typeck::ty::Ty;
    use mesh_typeck::TypeRegistry;

    fn empty_registry() -> TypeRegistry {
        TypeRegistry {
            struct_defs: Default::default(),
            type_aliases: Default::default(),
            sum_type_defs: Default::default(),
        }
    }

    #[test]
    fn resolve_int() {
        let reg = empty_registry();
        assert_eq!(resolve_type(&Ty::int(), &reg, false), MirType::Int);
    }

    #[test]
    fn resolve_float() {
        let reg = empty_registry();
        assert_eq!(resolve_type(&Ty::float(), &reg, false), MirType::Float);
    }

    #[test]
    fn resolve_bool() {
        let reg = empty_registry();
        assert_eq!(resolve_type(&Ty::bool(), &reg, false), MirType::Bool);
    }

    #[test]
    fn resolve_string() {
        let reg = empty_registry();
        assert_eq!(resolve_type(&Ty::string(), &reg, false), MirType::String);
    }

    #[test]
    fn resolve_unit_tuple() {
        let reg = empty_registry();
        assert_eq!(resolve_type(&Ty::Tuple(vec![]), &reg, false), MirType::Unit);
    }

    #[test]
    fn resolve_tuple() {
        let reg = empty_registry();
        let ty = Ty::Tuple(vec![Ty::int(), Ty::string()]);
        assert_eq!(
            resolve_type(&ty, &reg, false),
            MirType::Tuple(vec![MirType::Int, MirType::String])
        );
    }

    #[test]
    fn resolve_fn_ptr() {
        let reg = empty_registry();
        let ty = Ty::fun(vec![Ty::int()], Ty::string());
        assert_eq!(
            resolve_type(&ty, &reg, false),
            MirType::FnPtr(vec![MirType::Int], Box::new(MirType::String))
        );
    }

    #[test]
    fn resolve_closure() {
        let reg = empty_registry();
        let ty = Ty::fun(vec![Ty::int()], Ty::string());
        assert_eq!(
            resolve_type(&ty, &reg, true),
            MirType::Closure(vec![MirType::Int], Box::new(MirType::String))
        );
    }

    #[test]
    fn resolve_never() {
        let reg = empty_registry();
        assert_eq!(resolve_type(&Ty::Never, &reg, false), MirType::Never);
    }

    #[test]
    fn resolve_option_sum_type() {
        use mesh_typeck::{SumTypeDefInfo, VariantInfo};

        let mut reg = empty_registry();
        reg.sum_type_defs.insert(
            "Option".to_string(),
            SumTypeDefInfo {
                name: "Option".to_string(),
                generic_params: vec!["T".to_string()],
                variants: vec![
                    VariantInfo {
                        name: "Some".to_string(),
                        fields: vec![],
                    },
                    VariantInfo {
                        name: "None".to_string(),
                        fields: vec![],
                    },
                ],
            },
        );
        let ty = Ty::option(Ty::int());
        assert_eq!(
            resolve_type(&ty, &reg, false),
            MirType::SumType("Option_Int".to_string())
        );
    }

    #[test]
    fn resolve_struct_no_args() {
        use mesh_typeck::StructDefInfo;

        let mut reg = empty_registry();
        reg.struct_defs.insert(
            "Point".to_string(),
            StructDefInfo {
                name: "Point".to_string(),
                generic_params: vec![],
                fields: vec![],
            },
        );

        // Ty::App(Con("Point"), []) resolves to Struct("Point")
        let ty = Ty::struct_ty("Point", vec![]);
        assert_eq!(
            resolve_type(&ty, &reg, false),
            MirType::Struct("Point".to_string())
        );
    }

    #[test]
    fn mangle_generic_type() {
        let reg = empty_registry();
        let name = mangle_type_name("Result", &[Ty::int(), Ty::string()], &reg);
        assert_eq!(name, "Result_Int_String");
    }

    #[test]
    fn resolve_untyped_pid() {
        let reg = empty_registry();
        // Ty::Con("Pid") -> MirType::Pid(None)
        assert_eq!(
            resolve_type(&Ty::untyped_pid(), &reg, false),
            MirType::Pid(None)
        );
    }

    #[test]
    fn resolve_typed_pid() {
        let reg = empty_registry();
        // Ty::App(Con("Pid"), [Int]) -> MirType::Pid(Some(Int))
        assert_eq!(
            resolve_type(&Ty::pid(Ty::int()), &reg, false),
            MirType::Pid(Some(Box::new(MirType::Int)))
        );
    }

    #[test]
    fn resolve_sqlite_conn_to_int() {
        let reg = empty_registry();
        // SqliteConn is an opaque u64 handle, lowered to MirType::Int.
        assert_eq!(
            resolve_type(&Ty::Con(TyCon::new("SqliteConn")), &reg, false),
            MirType::Int,
        );
    }

    #[test]
    fn resolve_var_falls_back_to_unit() {
        use mesh_typeck::ty::TyVar;
        let reg = empty_registry();
        // Unresolved type variables fall back to Unit for graceful degradation.
        assert_eq!(resolve_type(&Ty::Var(TyVar(0)), &reg, false), MirType::Unit);
    }

    // ── mir_type_to_ty tests ─────────────────────────────────────────

    #[test]
    fn mir_type_to_ty_int() {
        assert_eq!(mir_type_to_ty(&MirType::Int), Ty::int());
    }

    #[test]
    fn mir_type_to_ty_float() {
        assert_eq!(mir_type_to_ty(&MirType::Float), Ty::float());
    }

    #[test]
    fn mir_type_to_ty_string() {
        assert_eq!(mir_type_to_ty(&MirType::String), Ty::string());
    }

    #[test]
    fn mir_type_to_ty_bool() {
        assert_eq!(mir_type_to_ty(&MirType::Bool), Ty::bool());
    }

    #[test]
    fn mir_type_to_ty_struct() {
        assert_eq!(
            mir_type_to_ty(&MirType::Struct("Point".to_string())),
            Ty::Con(TyCon::new("Point"))
        );
    }

    #[test]
    fn mir_type_to_ty_sum_type() {
        assert_eq!(
            mir_type_to_ty(&MirType::SumType("Shape".to_string())),
            Ty::Con(TyCon::new("Shape"))
        );
    }

    #[test]
    fn mir_type_to_ty_unknown_fallback() {
        // Complex types fall back to Unknown.
        assert_eq!(
            mir_type_to_ty(&MirType::Unit),
            Ty::Con(TyCon::new("Unknown"))
        );
        assert_eq!(
            mir_type_to_ty(&MirType::Ptr),
            Ty::Con(TyCon::new("Unknown"))
        );
    }

    // ── mir_type_to_impl_name tests ──────────────────────────────────

    #[test]
    fn mir_type_to_impl_name_primitives() {
        assert_eq!(mir_type_to_impl_name(&MirType::Int), "Int");
        assert_eq!(mir_type_to_impl_name(&MirType::Float), "Float");
        assert_eq!(mir_type_to_impl_name(&MirType::String), "String");
        assert_eq!(mir_type_to_impl_name(&MirType::Bool), "Bool");
    }

    #[test]
    fn mir_type_to_impl_name_struct() {
        assert_eq!(
            mir_type_to_impl_name(&MirType::Struct("Point".to_string())),
            "Point"
        );
    }

    #[test]
    fn mir_type_to_impl_name_sum_type() {
        assert_eq!(
            mir_type_to_impl_name(&MirType::SumType("Shape".to_string())),
            "Shape"
        );
    }

    #[test]
    fn mir_type_to_impl_name_unknown_fallback() {
        assert_eq!(mir_type_to_impl_name(&MirType::Unit), "Unknown");
        assert_eq!(mir_type_to_impl_name(&MirType::Ptr), "Unknown");
    }
}
