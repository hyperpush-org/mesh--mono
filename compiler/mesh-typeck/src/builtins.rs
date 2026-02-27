//! Built-in type registration.
//!
//! Registers primitive types (Int, Float, String, Bool), generic type
//! constructors (Option, Result), built-in arithmetic operators, and
//! compiler-known traits (Add, Sub, Mul, Div, Mod, Eq, Ord, Not, Iterator, Iterable) into
//! the type environment and trait registry.

use rustc_hash::FxHashMap;

use crate::env::TypeEnv;
use crate::traits::{AssocTypeDef, ImplDef, ImplMethodSig, TraitDef, TraitMethodSig, TraitRegistry};
use crate::ty::{Scheme, Ty, TyCon, TyVar};
use crate::unify::InferCtx;

/// Register all built-in types and functions into the environment.
///
/// After this call, the environment contains:
/// - Primitive types: Int, Float, String, Bool
/// - Generic constructors: Option (arity 1), Result (arity 2)
/// - Arithmetic operators: +, -, *, / for Int and Float
/// - Comparison operators (returns Bool)
/// - Logical operators (and, or, not)
///
/// And the trait registry contains compiler-known traits:
/// - Add, Sub, Mul, Div, Mod (numeric operations)
/// - Eq (equality comparison)
/// - Ord (ordering comparison)
/// - Not (logical negation)
/// - Default (zero-initialization, static method -- no self parameter)
pub fn register_builtins(
    _ctx: &mut InferCtx,
    env: &mut TypeEnv,
    trait_registry: &mut TraitRegistry,
) {
    // ── Primitive type constructors ─────────────────────────────────

    // These are registered as monomorphic schemes so they can be
    // referenced as type names in annotations.
    env.insert("Int".into(), Scheme::mono(Ty::int()));
    env.insert("Float".into(), Scheme::mono(Ty::float()));
    env.insert("String".into(), Scheme::mono(Ty::string()));
    env.insert("Bool".into(), Scheme::mono(Ty::bool()));

    // ── Actor type constructor ────────────────────────────────────
    //
    // Pid is a type constructor with arity 1: Pid<M> where M is the
    // message type. Untyped Pid (arity 0) is also valid as an escape
    // hatch. We register the bare name so `Pid` resolves in annotations.
    env.insert("Pid".into(), Scheme::mono(Ty::untyped_pid()));

    // ── Regex type constructor (Phase 119) ──────────────────────
    //
    // Regex is an opaque type representing a compiled regex pattern.
    // Values of type Regex are produced by the ~r/pattern/flags literal.
    env.insert("Regex".into(), Scheme::mono(Ty::Con(TyCon::new("Regex"))));

    // ── I/O builtins ──────────────────────────────────────────────

    // println(String) -> () -- prints a string with trailing newline
    env.insert(
        "println".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::Tuple(vec![]))),
    );

    // print(String) -> () -- prints a string without trailing newline
    env.insert(
        "print".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::Tuple(vec![]))),
    );

    // ── Default protocol: static trait method ──────────────────────
    //
    // default() -> T -- polymorphic, type resolved from call-site context.
    // Registered as a polymorphic function so typeck can unify T with the
    // target type annotation (e.g., `let x: Int = default()` -> T = Int).
    {
        let t_var = TyVar(99000);
        let t = Ty::Var(t_var);
        env.insert(
            "default".into(),
            Scheme { vars: vec![t_var], ty: Ty::fun(vec![], t) },
        );
    }

    // ── compare(a, b) -> Ordering ───────────────────────────────────
    //
    // Polymorphic built-in function: compare(T, T) -> Ordering.
    // At MIR level, dispatches to Ord__compare__TypeName.
    {
        let t_var = TyVar(99002);
        let t = Ty::Var(t_var);
        env.insert(
            "compare".into(),
            Scheme {
                vars: vec![t_var],
                ty: Ty::fun(vec![t.clone(), t], Ty::Con(TyCon::new("Ordering"))),
            },
        );
    }

    // ── Compiler-known traits ──────────────────────────────────────

    register_compiler_known_traits(trait_registry);

    // ── Arithmetic operators (Int) ──────────────────────────────────

    // These remain in the env for backward compatibility. The binary
    // operator inference also uses trait dispatch for type checking.
    let int_binop = Scheme::mono(Ty::fun(vec![Ty::int(), Ty::int()], Ty::int()));
    env.insert("+".into(), int_binop.clone());
    env.insert("-".into(), int_binop.clone());
    env.insert("*".into(), int_binop.clone());
    env.insert("/".into(), int_binop);

    // ── Float arithmetic ────────────────────────────────────────────

    let float_binop = Scheme::mono(Ty::fun(
        vec![Ty::float(), Ty::float()],
        Ty::float(),
    ));
    env.insert("+.".into(), float_binop.clone());
    env.insert("-.".into(), float_binop.clone());
    env.insert("*.".into(), float_binop.clone());
    env.insert("/.".into(), float_binop);

    // ── String concatenation ────────────────────────────────────────

    env.insert(
        "<>".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::string()], Ty::string())),
    );

    // ── Comparison (returns Bool) ───────────────────────────────────

    let int_cmp = Scheme::mono(Ty::fun(vec![Ty::int(), Ty::int()], Ty::bool()));
    env.insert("==".into(), int_cmp.clone());
    env.insert("!=".into(), int_cmp.clone());
    env.insert("<".into(), int_cmp.clone());
    env.insert(">".into(), int_cmp.clone());
    env.insert("<=".into(), int_cmp.clone());
    env.insert(">=".into(), int_cmp);

    // ── Logical operators ───────────────────────────────────────────

    let bool_binop = Scheme::mono(Ty::fun(vec![Ty::bool(), Ty::bool()], Ty::bool()));
    env.insert("and".into(), bool_binop.clone());
    env.insert("or".into(), bool_binop);
    env.insert(
        "not".into(),
        Scheme::mono(Ty::fun(vec![Ty::bool()], Ty::bool())),
    );

    // ── Standard library: String operations (Phase 8) ────────────────

    env.insert(
        "string_length".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::int())),
    );
    env.insert(
        "string_slice".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::int(), Ty::int()], Ty::string())),
    );
    env.insert(
        "string_contains".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::string()], Ty::bool())),
    );
    env.insert(
        "string_starts_with".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::string()], Ty::bool())),
    );
    env.insert(
        "string_ends_with".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::string()], Ty::bool())),
    );
    env.insert(
        "string_trim".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::string())),
    );
    env.insert(
        "string_to_upper".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::string())),
    );
    env.insert(
        "string_to_lower".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::string())),
    );
    env.insert(
        "string_replace".into(),
        Scheme::mono(Ty::fun(
            vec![Ty::string(), Ty::string(), Ty::string()],
            Ty::string(),
        )),
    );
    env.insert(
        "string_split".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::string()], Ty::list(Ty::string()))),
    );
    env.insert(
        "string_join".into(),
        Scheme::mono(Ty::fun(vec![Ty::list(Ty::string()), Ty::string()], Ty::string())),
    );
    env.insert(
        "string_to_int".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::option(Ty::int()))),
    );
    env.insert(
        "string_to_float".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::option(Ty::float()))),
    );

    // ── Standard library: File I/O functions (Phase 8) ──────────────────

    env.insert(
        "file_read".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::result(Ty::string(), Ty::string()))),
    );
    env.insert(
        "file_write".into(),
        Scheme::mono(Ty::fun(
            vec![Ty::string(), Ty::string()],
            Ty::result(Ty::Tuple(vec![]), Ty::string()),
        )),
    );
    env.insert(
        "file_append".into(),
        Scheme::mono(Ty::fun(
            vec![Ty::string(), Ty::string()],
            Ty::result(Ty::Tuple(vec![]), Ty::string()),
        )),
    );
    env.insert(
        "file_exists".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::bool())),
    );
    env.insert(
        "file_delete".into(),
        Scheme::mono(Ty::fun(
            vec![Ty::string()],
            Ty::result(Ty::Tuple(vec![]), Ty::string()),
        )),
    );

    // ── Standard library: IO functions (Phase 8) ─────────────────────

    env.insert(
        "io_read_line".into(),
        Scheme::mono(Ty::fun(vec![], Ty::result(Ty::string(), Ty::string()))),
    );
    env.insert(
        "io_eprintln".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::Tuple(vec![]))),
    );

    // ── Standard library: Env functions (Phase 8) ────────────────────

    // Env.get(key, default) -> String
    // Module-qualified dispatch: Env.get -> prefixed "env_get" -> map_builtin_name -> mesh_env_get_with_default
    env.insert(
        "env_get_with_default".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::string()], Ty::string())),
    );
    // Env.get_int(key, default) -> Int
    env.insert(
        "env_get_int".into(),
        Scheme::mono(Ty::fun(vec![Ty::string(), Ty::int()], Ty::int())),
    );
    // Env.args() -> List<String>  (bare env_args still resolves via map_builtin_name)
    env.insert(
        "env_args".into(),
        Scheme::mono(Ty::fun(vec![], Ty::list(Ty::string()))),
    );

    // ── Standard library: Regex functions (Phase 119) ─────────────────

    // Regex.compile(pattern) -> Result<Regex, String>
    // Module-qualified: Regex.compile -> prefixed "regex_compile" -> map_builtin_name -> mesh_regex_compile
    env.insert(
        "regex_compile".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::result(Ty::Con(TyCon::new("Regex")), Ty::string()))),
    );
    // Regex.is_match(rx, str) -> Bool
    env.insert(
        "regex_is_match".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Regex")), Ty::string()], Ty::bool())),
    );
    // Regex.captures(rx, str) -> Option<List<String>>
    env.insert(
        "regex_captures".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Regex")), Ty::string()], Ty::option(Ty::list(Ty::string())))),
    );
    // Regex.replace(rx, str, replacement) -> String
    env.insert(
        "regex_replace".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Regex")), Ty::string(), Ty::string()], Ty::string())),
    );
    // Regex.split(rx, str) -> List<String>
    env.insert(
        "regex_split".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Regex")), Ty::string()], Ty::list(Ty::string()))),
    );

    // ── Standard library: Collection types (Phase 8) ─────────────────

    // Type constructors for collection types (bare names).
    env.insert("List".into(), Scheme::mono(Ty::list_untyped()));
    env.insert("Map".into(), Scheme::mono(Ty::map_untyped()));
    env.insert("Set".into(), Scheme::mono(Ty::set_untyped()));
    env.insert("Range".into(), Scheme::mono(Ty::range()));
    env.insert("Queue".into(), Scheme::mono(Ty::queue()));

    // Use opaque types (untyped) for non-list collection function signatures.
    // At the LLVM level these are all pointers; type safety is checked by Mesh's type system.
    let map_t = Ty::map_untyped();
    let set_t = Ty::set_untyped();
    let range_t = Ty::range();
    let queue_t = Ty::queue();

    // ── Polymorphic List functions ──────────────────────────────────────
    // List functions use TyVar(91000) for T and TyVar(91001) for U
    // (avoids collision with Map's 90000/90001 and Default's 99000).
    {
        let t_var = TyVar(91000);
        let u_var = TyVar(91001);
        let t = Ty::Var(t_var);
        let u = Ty::Var(u_var);
        let list_t = Ty::list(t.clone());
        let list_u = Ty::list(u.clone());
        let t_to_u = Ty::fun(vec![t.clone()], u.clone());
        let t_to_bool = Ty::fun(vec![t.clone()], Ty::bool());
        let u_t_to_u = Ty::fun(vec![u.clone(), t.clone()], u.clone());

        // ── Prelude (bare names): map, filter, reduce, head, tail ─────────
        // These are auto-imported without module qualification.

        // map(list, fn) -> list  (bare prelude name)
        env.insert("map".into(), Scheme { vars: vec![t_var, u_var], ty: Ty::fun(vec![list_t.clone(), t_to_u.clone()], list_u.clone()) });
        // filter(list, fn) -> list
        env.insert("filter".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t_to_bool.clone()], list_t.clone()) });
        // reduce(list, init, fn) -> U
        env.insert("reduce".into(), Scheme { vars: vec![t_var, u_var], ty: Ty::fun(vec![list_t.clone(), u.clone(), u_t_to_u.clone()], u.clone()) });
        // head(list) -> T
        env.insert("head".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], t.clone()) });
        // tail(list) -> List<T>
        env.insert("tail".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], list_t.clone()) });

        // Also register with list_ prefix for module-qualified lowering.
        env.insert("list_map".into(), Scheme { vars: vec![t_var, u_var], ty: Ty::fun(vec![list_t.clone(), t_to_u.clone()], list_u.clone()) });
        env.insert("list_filter".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t_to_bool.clone()], list_t.clone()) });
        env.insert("list_reduce".into(), Scheme { vars: vec![t_var, u_var], ty: Ty::fun(vec![list_t.clone(), u.clone(), u_t_to_u.clone()], u.clone()) });
        env.insert("list_head".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], t.clone()) });
        env.insert("list_tail".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], list_t.clone()) });

        // ── List module functions ─────────────────────────────────────────

        // List.new() -> List<T>
        env.insert("list_new".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![], list_t.clone()) });
        // List.length(List<T>) -> Int
        env.insert("list_length".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], Ty::int()) });
        // List.append(List<T>, T) -> List<T>
        env.insert("list_append".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t.clone()], list_t.clone()) });
        // List.get(List<T>, Int) -> T
        env.insert("list_get".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), Ty::int()], t.clone()) });
        // List.concat(List<T>, List<T>) -> List<T>
        env.insert("list_concat".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), list_t.clone()], list_t.clone()) });
        // List.reverse(List<T>) -> List<T>
        env.insert("list_reverse".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], list_t.clone()) });

        // Phase 46: sort, find, any, all, contains
        let t_t_to_int = Ty::fun(vec![t.clone(), t.clone()], Ty::int());
        env.insert("list_sort".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t_t_to_int], list_t.clone()) });
        env.insert("list_find".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t_to_bool.clone()], Ty::option(t.clone())) });
        env.insert("list_any".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t_to_bool.clone()], Ty::bool()) });
        env.insert("list_all".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t_to_bool.clone()], Ty::bool()) });
        env.insert("list_contains".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), t.clone()], Ty::bool()) });

        // Phase 47: zip, flat_map, flatten, enumerate, take, drop, last, nth
        env.insert("list_zip".into(), Scheme { vars: vec![t_var, u_var], ty: Ty::fun(vec![list_t.clone(), list_u.clone()], Ty::list(Ty::Tuple(vec![t.clone(), u.clone()]))) });
        let t_to_list_u = Ty::fun(vec![t.clone()], list_u.clone());
        env.insert("list_flat_map".into(), Scheme { vars: vec![t_var, u_var], ty: Ty::fun(vec![list_t.clone(), t_to_list_u], list_u.clone()) });
        env.insert("list_flatten".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![Ty::list(list_t.clone())], list_t.clone()) });
        env.insert("list_enumerate".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], Ty::list(Ty::Tuple(vec![Ty::int(), t.clone()]))) });
        env.insert("list_take".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), Ty::int()], list_t.clone()) });
        env.insert("list_drop".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), Ty::int()], list_t.clone()) });
        env.insert("list_last".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone()], t.clone()) });
        env.insert("list_nth".into(), Scheme { vars: vec![t_var], ty: Ty::fun(vec![list_t.clone(), Ty::int()], t.clone()) });
    }

    // ── Map module functions (polymorphic) ──────────────────────────────
    {
        let k_var = TyVar(90000);
        let v_var = TyVar(90001);
        let k = Ty::Var(k_var);
        let v = Ty::Var(v_var);
        let map_kv = Ty::map(k.clone(), v.clone());

        env.insert("map_new".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![], map_kv.clone()) });
        env.insert("map_put".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone(), k.clone(), v.clone()], map_kv.clone()) });
        env.insert("map_get".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone(), k.clone()], v.clone()) });
        env.insert("map_has_key".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone(), k.clone()], Ty::bool()) });
        env.insert("map_delete".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone(), k.clone()], map_kv.clone()) });
        env.insert("map_size".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone()], Ty::int()) });
        env.insert("map_keys".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone()], Ty::list(k.clone())) });
        env.insert("map_values".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone()], Ty::list(v.clone())) });
        // Phase 47: merge, to_list, from_list
        env.insert("map_merge".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone(), map_kv.clone()], map_kv.clone()) });
        env.insert("map_to_list".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![map_kv.clone()], Ty::list(Ty::Tuple(vec![k.clone(), v.clone()]))) });
        env.insert("map_from_list".into(), Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![Ty::list(Ty::Tuple(vec![k.clone(), v.clone()]))], map_kv.clone()) });
    }

    // ── Set module functions ──────────────────────────────────────────

    env.insert(
        "set_new".into(),
        Scheme::mono(Ty::fun(vec![], set_t.clone())),
    );
    env.insert(
        "set_add".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone(), Ty::int()], set_t.clone())),
    );
    env.insert(
        "set_remove".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone(), Ty::int()], set_t.clone())),
    );
    env.insert(
        "set_contains".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone(), Ty::int()], Ty::bool())),
    );
    env.insert(
        "set_size".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone()], Ty::int())),
    );
    env.insert(
        "set_union".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone(), set_t.clone()], set_t.clone())),
    );
    env.insert(
        "set_intersection".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone(), set_t.clone()], set_t.clone())),
    );
    // Phase 47: difference, to_list, from_list
    env.insert(
        "set_difference".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone(), set_t.clone()], set_t.clone())),
    );
    env.insert(
        "set_to_list".into(),
        Scheme::mono(Ty::fun(vec![set_t.clone()], Ty::list(Ty::int()))),
    );
    env.insert(
        "set_from_list".into(),
        Scheme::mono(Ty::fun(vec![Ty::list(Ty::int())], set_t.clone())),
    );

    // ── Tuple module functions ────────────────────────────────────────

    env.insert(
        "tuple_nth".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Tuple")), Ty::int()], Ty::int())),
    );
    env.insert(
        "tuple_first".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Tuple"))], Ty::int())),
    );
    env.insert(
        "tuple_second".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Tuple"))], Ty::int())),
    );
    env.insert(
        "tuple_size".into(),
        Scheme::mono(Ty::fun(vec![Ty::Con(TyCon::new("Tuple"))], Ty::int())),
    );

    // ── Range module functions ────────────────────────────────────────
    // Re-declare opaque list and closure types for range/JSON functions.
    let list_t = Ty::list_untyped();
    let int_to_int = Ty::fun(vec![Ty::int()], Ty::int());
    let int_to_bool = Ty::fun(vec![Ty::int()], Ty::bool());

    env.insert(
        "range_new".into(),
        Scheme::mono(Ty::fun(vec![Ty::int(), Ty::int()], range_t.clone())),
    );
    env.insert(
        "range_to_list".into(),
        Scheme::mono(Ty::fun(vec![range_t.clone()], list_t.clone())),
    );
    env.insert(
        "range_map".into(),
        Scheme::mono(Ty::fun(vec![range_t.clone(), int_to_int.clone()], list_t.clone())),
    );
    env.insert(
        "range_filter".into(),
        Scheme::mono(Ty::fun(vec![range_t.clone(), int_to_bool], list_t.clone())),
    );
    env.insert(
        "range_length".into(),
        Scheme::mono(Ty::fun(vec![range_t.clone()], Ty::int())),
    );

    // ── Queue module functions ────────────────────────────────────────

    env.insert(
        "queue_new".into(),
        Scheme::mono(Ty::fun(vec![], queue_t.clone())),
    );
    env.insert(
        "queue_push".into(),
        Scheme::mono(Ty::fun(vec![queue_t.clone(), Ty::int()], queue_t.clone())),
    );
    env.insert(
        "queue_pop".into(),
        Scheme::mono(Ty::fun(vec![queue_t.clone()], Ty::Con(TyCon::new("Tuple")))),
    );
    env.insert(
        "queue_peek".into(),
        Scheme::mono(Ty::fun(vec![queue_t.clone()], Ty::int())),
    );
    env.insert(
        "queue_size".into(),
        Scheme::mono(Ty::fun(vec![queue_t.clone()], Ty::int())),
    );
    env.insert(
        "queue_is_empty".into(),
        Scheme::mono(Ty::fun(vec![queue_t.clone()], Ty::bool())),
    );

    // ── Standard library: JSON functions (Phase 8 Plan 04) ────────────

    // Json type is opaque (Ptr) -- pattern matching on Json sum type deferred
    let json_t = Ty::Con(TyCon::new("Json"));
    env.insert("Json".into(), Scheme::mono(json_t.clone()));

    // JSON.parse(string) -> Result<Json, String>
    env.insert(
        "json_parse".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::result(json_t.clone(), Ty::string()))),
    );
    // JSON.encode(json) -> String
    env.insert(
        "json_encode".into(),
        Scheme::mono(Ty::fun(vec![json_t.clone()], Ty::string())),
    );
    // JSON.encode_string(string) -> String
    env.insert(
        "json_encode_string".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::string())),
    );
    // JSON.encode_int(int) -> String
    env.insert(
        "json_encode_int".into(),
        Scheme::mono(Ty::fun(vec![Ty::int()], Ty::string())),
    );
    // JSON.encode_bool(bool) -> String
    env.insert(
        "json_encode_bool".into(),
        Scheme::mono(Ty::fun(vec![Ty::bool()], Ty::string())),
    );
    // JSON.encode_map(map) -> String
    env.insert(
        "json_encode_map".into(),
        Scheme::mono(Ty::fun(vec![map_t.clone()], Ty::string())),
    );
    // JSON.encode_list(list) -> String
    env.insert(
        "json_encode_list".into(),
        Scheme::mono(Ty::fun(vec![list_t.clone()], Ty::string())),
    );

    // ── Standard library: HTTP functions (Phase 8 Plan 05) ────────────

    // HTTP types (opaque, resolve to MirType::Ptr at codegen level)
    let request_t = Ty::Con(TyCon::new("Request"));
    let response_t = Ty::Con(TyCon::new("Response"));
    let router_t = Ty::Con(TyCon::new("Router"));
    env.insert("Request".into(), Scheme::mono(request_t.clone()));
    env.insert("Response".into(), Scheme::mono(response_t.clone()));
    env.insert("Router".into(), Scheme::mono(router_t.clone()));

    // HTTP.router() -> Router
    env.insert(
        "http_router".into(),
        Scheme::mono(Ty::fun(vec![], router_t.clone())),
    );
    // HTTP.route(Router, String, (Request) -> Response) -> Router
    env.insert(
        "http_route".into(),
        Scheme::mono(Ty::fun(
            vec![router_t.clone(), Ty::string(), Ty::fun(vec![request_t.clone()], response_t.clone())],
            router_t.clone(),
        )),
    );
    // HTTP.serve(Router, Int) -> ()
    env.insert(
        "http_serve".into(),
        Scheme::mono(Ty::fun(vec![router_t.clone(), Ty::int()], Ty::Tuple(vec![]))),
    );
    // HTTP.serve_tls(Router, Int, String, String) -> () (Phase 56)
    env.insert(
        "http_serve_tls".into(),
        Scheme::mono(Ty::fun(vec![router_t.clone(), Ty::int(), Ty::string(), Ty::string()], Ty::Tuple(vec![]))),
    );
    // HTTP.response(Int, String) -> Response
    env.insert(
        "http_response".into(),
        Scheme::mono(Ty::fun(vec![Ty::int(), Ty::string()], response_t.clone())),
    );
    // HTTP.response_with_headers(Int, String, Map<K, V>) -> Response
    {
        let k_var = TyVar(92000);
        let v_var = TyVar(92001);
        let k = Ty::Var(k_var);
        let v = Ty::Var(v_var);
        let map_kv = Ty::map(k, v);
        env.insert(
            "http_response_with_headers".into(),
            Scheme { vars: vec![k_var, v_var], ty: Ty::fun(vec![Ty::int(), Ty::string(), map_kv], response_t.clone()) },
        );
    }
    // HTTP.get(String) -> Result<String, String>
    env.insert(
        "http_get".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::result(Ty::string(), Ty::string()))),
    );
    // HTTP.post(String, String) -> Result<String, String>
    env.insert(
        "http_post".into(),
        Scheme::mono(Ty::fun(
            vec![Ty::string(), Ty::string()],
            Ty::result(Ty::string(), Ty::string()),
        )),
    );

    // ── Phase 51: Method-specific routing ────────────────────────────────
    // HTTP.on_get(Router, String, Fn(Request) -> Response) -> Router
    env.insert(
        "http_on_get".into(),
        Scheme::mono(Ty::fun(
            vec![router_t.clone(), Ty::string(), Ty::fun(vec![request_t.clone()], response_t.clone())],
            router_t.clone(),
        )),
    );
    // HTTP.on_post(Router, String, Fn(Request) -> Response) -> Router
    env.insert(
        "http_on_post".into(),
        Scheme::mono(Ty::fun(
            vec![router_t.clone(), Ty::string(), Ty::fun(vec![request_t.clone()], response_t.clone())],
            router_t.clone(),
        )),
    );
    // HTTP.on_put(Router, String, Fn(Request) -> Response) -> Router
    env.insert(
        "http_on_put".into(),
        Scheme::mono(Ty::fun(
            vec![router_t.clone(), Ty::string(), Ty::fun(vec![request_t.clone()], response_t.clone())],
            router_t.clone(),
        )),
    );
    // HTTP.on_delete(Router, String, Fn(Request) -> Response) -> Router
    env.insert(
        "http_on_delete".into(),
        Scheme::mono(Ty::fun(
            vec![router_t.clone(), Ty::string(), Ty::fun(vec![request_t.clone()], response_t.clone())],
            router_t.clone(),
        )),
    );

    // ── Phase 52: HTTP.use(Router, Fn(Request, Fn(Request) -> Response) -> Response) -> Router
    env.insert(
        "http_use".into(),
        Scheme::mono(Ty::fun(
            vec![
                router_t.clone(),
                Ty::fun(
                    vec![request_t.clone(), Ty::fun(vec![request_t.clone()], response_t.clone())],
                    response_t.clone(),
                ),
            ],
            router_t.clone(),
        )),
    );

    // ── Phase 53: SQLite functions ──────────────────────────────────────
    // SqliteConn opaque type -- lowered to Int (i64) at MIR level for GC safety.
    let sqlite_conn_t = Ty::Con(TyCon::new("SqliteConn"));
    env.insert("SqliteConn".into(), Scheme::mono(sqlite_conn_t.clone()));

    // Sqlite.open(String) -> Result<SqliteConn, String>
    env.insert(
        "sqlite_open".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::result(sqlite_conn_t.clone(), Ty::string()))),
    );
    // Sqlite.close(SqliteConn) -> Unit
    env.insert(
        "sqlite_close".into(),
        Scheme::mono(Ty::fun(vec![sqlite_conn_t.clone()], Ty::Tuple(vec![]))),
    );
    // Sqlite.execute(SqliteConn, String, List<String>) -> Result<Int, String>
    env.insert(
        "sqlite_execute".into(),
        Scheme::mono(Ty::fun(
            vec![sqlite_conn_t.clone(), Ty::string(), Ty::list(Ty::string())],
            Ty::result(Ty::int(), Ty::string()),
        )),
    );
    // Sqlite.query(SqliteConn, String, List<String>) -> Result<List<Map<String, String>>, String>
    env.insert(
        "sqlite_query".into(),
        Scheme::mono(Ty::fun(
            vec![sqlite_conn_t.clone(), Ty::string(), Ty::list(Ty::string())],
            Ty::result(Ty::list(Ty::map(Ty::string(), Ty::string())), Ty::string()),
        )),
    );

    // ── Phase 54: PostgreSQL functions ─────────────────────────────────────
    // PgConn opaque type -- lowered to Int (i64) at MIR level for GC safety.
    let pg_conn_t = Ty::Con(TyCon::new("PgConn"));
    env.insert("PgConn".into(), Scheme::mono(pg_conn_t.clone()));

    // Pg.connect(String) -> Result<PgConn, String>
    env.insert(
        "pg_connect".into(),
        Scheme::mono(Ty::fun(vec![Ty::string()], Ty::result(pg_conn_t.clone(), Ty::string()))),
    );
    // Pg.close(PgConn) -> Unit
    env.insert(
        "pg_close".into(),
        Scheme::mono(Ty::fun(vec![pg_conn_t.clone()], Ty::Tuple(vec![]))),
    );
    // Pg.execute(PgConn, String, List<String>) -> Result<Int, String>
    env.insert(
        "pg_execute".into(),
        Scheme::mono(Ty::fun(
            vec![pg_conn_t.clone(), Ty::string(), Ty::list(Ty::string())],
            Ty::result(Ty::int(), Ty::string()),
        )),
    );
    // Pg.query(PgConn, String, List<String>) -> Result<List<Map<String, String>>, String>
    env.insert(
        "pg_query".into(),
        Scheme::mono(Ty::fun(
            vec![pg_conn_t.clone(), Ty::string(), Ty::list(Ty::string())],
            Ty::result(Ty::list(Ty::map(Ty::string(), Ty::string())), Ty::string()),
        )),
    );

    // ── Phase 57: PG Transaction functions ──────────────────────────
    // Pg.begin(PgConn) -> Result<Unit, String>
    env.insert(
        "pg_begin".into(),
        Scheme::mono(Ty::fun(vec![pg_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))),
    );
    // Pg.commit(PgConn) -> Result<Unit, String>
    env.insert(
        "pg_commit".into(),
        Scheme::mono(Ty::fun(vec![pg_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))),
    );
    // Pg.rollback(PgConn) -> Result<Unit, String>
    env.insert(
        "pg_rollback".into(),
        Scheme::mono(Ty::fun(vec![pg_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))),
    );
    // Pg.transaction(PgConn, fn(PgConn) -> Result<Unit, String>) -> Result<Unit, String>
    env.insert(
        "pg_transaction".into(),
        Scheme::mono(Ty::fun(
            vec![pg_conn_t.clone(), Ty::fun(vec![pg_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))],
            Ty::result(Ty::Tuple(vec![]), Ty::string()),
        )),
    );

    // ── Phase 57: SQLite Transaction functions ──────────────────────
    // Sqlite.begin(SqliteConn) -> Result<Unit, String>
    env.insert(
        "sqlite_begin".into(),
        Scheme::mono(Ty::fun(vec![sqlite_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))),
    );
    // Sqlite.commit(SqliteConn) -> Result<Unit, String>
    env.insert(
        "sqlite_commit".into(),
        Scheme::mono(Ty::fun(vec![sqlite_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))),
    );
    // Sqlite.rollback(SqliteConn) -> Result<Unit, String>
    env.insert(
        "sqlite_rollback".into(),
        Scheme::mono(Ty::fun(vec![sqlite_conn_t.clone()], Ty::result(Ty::Tuple(vec![]), Ty::string()))),
    );

    // ── Phase 57: Connection Pool ───────────────────────────────────
    // PoolHandle opaque type
    let pool_handle_t = Ty::Con(TyCon::new("PoolHandle"));
    env.insert("PoolHandle".into(), Scheme::mono(pool_handle_t.clone()));

    // Pool.open(String, Int, Int, Int) -> Result<PoolHandle, String>
    env.insert(
        "pool_open".into(),
        Scheme::mono(Ty::fun(
            vec![Ty::string(), Ty::int(), Ty::int(), Ty::int()],
            Ty::result(pool_handle_t.clone(), Ty::string()),
        )),
    );
    // Pool.close(PoolHandle) -> Unit
    env.insert(
        "pool_close".into(),
        Scheme::mono(Ty::fun(vec![pool_handle_t.clone()], Ty::Tuple(vec![]))),
    );
    // Pool.checkout(PoolHandle) -> Result<PgConn, String>
    env.insert(
        "pool_checkout".into(),
        Scheme::mono(Ty::fun(vec![pool_handle_t.clone()], Ty::result(pg_conn_t.clone(), Ty::string()))),
    );
    // Pool.checkin(PoolHandle, PgConn) -> Unit
    env.insert(
        "pool_checkin".into(),
        Scheme::mono(Ty::fun(vec![pool_handle_t.clone(), pg_conn_t.clone()], Ty::Tuple(vec![]))),
    );
    // Pool.query(PoolHandle, String, List<String>) -> Result<List<Map<String, String>>, String>
    env.insert(
        "pool_query".into(),
        Scheme::mono(Ty::fun(
            vec![pool_handle_t.clone(), Ty::string(), Ty::list(Ty::string())],
            Ty::result(Ty::list(Ty::map(Ty::string(), Ty::string())), Ty::string()),
        )),
    );
    // Pool.execute(PoolHandle, String, List<String>) -> Result<Int, String>
    env.insert(
        "pool_execute".into(),
        Scheme::mono(Ty::fun(
            vec![pool_handle_t.clone(), Ty::string(), Ty::list(Ty::string())],
            Ty::result(Ty::int(), Ty::string()),
        )),
    );

    // Request accessor functions
    // Request.method(Request) -> String
    env.insert(
        "request_method".into(),
        Scheme::mono(Ty::fun(vec![request_t.clone()], Ty::string())),
    );
    // Request.path(Request) -> String
    env.insert(
        "request_path".into(),
        Scheme::mono(Ty::fun(vec![request_t.clone()], Ty::string())),
    );
    // Request.body(Request) -> String
    env.insert(
        "request_body".into(),
        Scheme::mono(Ty::fun(vec![request_t.clone()], Ty::string())),
    );
    // Request.header(Request, String) -> Option<String>
    env.insert(
        "request_header".into(),
        Scheme::mono(Ty::fun(
            vec![request_t.clone(), Ty::string()],
            Ty::option(Ty::string()),
        )),
    );
    // Request.query(Request, String) -> Option<String>
    env.insert(
        "request_query".into(),
        Scheme::mono(Ty::fun(
            vec![request_t.clone(), Ty::string()],
            Ty::option(Ty::string()),
        )),
    );
    // Request.param(Request, String) -> Option<String>
    env.insert(
        "request_param".into(),
        Scheme::mono(Ty::fun(
            vec![request_t.clone(), Ty::string()],
            Ty::option(Ty::string()),
        )),
    );
}

/// Register compiler-known traits and their built-in implementations.
///
/// These traits back the arithmetic and comparison operators. When the
/// inference engine encounters `a + b`, it checks that the resolved type
/// of `a` has an impl for `Add`.
fn register_compiler_known_traits(registry: &mut TraitRegistry) {
    // ── Arithmetic traits ──────────────────────────────────────────

    let arithmetic_traits = ["Add", "Sub", "Mul", "Div", "Mod"];
    for trait_name in &arithmetic_traits {
        registry.register_trait(TraitDef {
            name: trait_name.to_string(),
            methods: vec![TraitMethodSig {
                name: trait_name.to_lowercase(),
                has_self: true,
                param_count: 1,
                return_type: None, // return type is Self (the implementing type)
                has_default_body: false,
            }],
            associated_types: vec![AssocTypeDef { name: "Output".to_string() }],
        });

        // Register impls for Int and Float.
        for (ty, ty_name) in &[(Ty::int(), "Int"), (Ty::float(), "Float")] {
            let mut methods = FxHashMap::default();
            methods.insert(
                trait_name.to_lowercase(),
                ImplMethodSig {
                    has_self: true,
                    param_count: 1,
                    return_type: Some(ty.clone()),
                },
            );
            let mut assoc_types = FxHashMap::default();
            assoc_types.insert("Output".to_string(), ty.clone());
            let _ = registry.register_impl(ImplDef {
                trait_name: trait_name.to_string(),
                trait_type_args: vec![],
                impl_type: ty.clone(),
                impl_type_name: ty_name.to_string(),
                methods,
                associated_types: assoc_types,
            });
        }
    }

    // ── Neg trait ─────────────────────────────────────────────────

    registry.register_trait(TraitDef {
        name: "Neg".to_string(),
        methods: vec![TraitMethodSig {
            name: "neg".to_string(),
            has_self: true,
            param_count: 0,
            return_type: None,
            has_default_body: false,
        }],
        associated_types: vec![AssocTypeDef { name: "Output".to_string() }],
    });

    // Neg impls for Int and Float.
    for (ty, ty_name) in &[(Ty::int(), "Int"), (Ty::float(), "Float")] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "neg".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(ty.clone()),
            },
        );
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Output".to_string(), ty.clone());
        let _ = registry.register_impl(ImplDef {
            trait_name: "Neg".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // ── Iterator trait ──────────────────────────────────────────────

    registry.register_trait(TraitDef {
        name: "Iterator".to_string(),
        methods: vec![TraitMethodSig {
            name: "next".to_string(),
            has_self: true,
            param_count: 0,
            return_type: None, // Option<Self.Item> -- resolved per impl
            has_default_body: false,
        }],
        associated_types: vec![AssocTypeDef { name: "Item".to_string() }],
    });

    // ── Iterable trait ─────────────────────────────────────────────

    registry.register_trait(TraitDef {
        name: "Iterable".to_string(),
        methods: vec![TraitMethodSig {
            name: "iter".to_string(),
            has_self: true,
            param_count: 0,
            return_type: None, // Self.Iter -- resolved per impl
            has_default_body: false,
        }],
        associated_types: vec![
            AssocTypeDef { name: "Item".to_string() },
            AssocTypeDef { name: "Iter".to_string() },
        ],
    });

    // ── Built-in Iterable impls for collections ────────────────────

    // impl Iterable for List<T>
    {
        let list_t = Ty::App(Box::new(Ty::Con(TyCon::new("List"))), vec![Ty::Con(TyCon::new("T"))]);
        let mut methods = FxHashMap::default();
        methods.insert("iter".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::Con(TyCon::new("T")));
        assoc_types.insert("Iter".to_string(), Ty::Con(TyCon::new("ListIterator")));
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterable".to_string(),
            trait_type_args: vec![],
            impl_type: list_t,
            impl_type_name: "List".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterator for ListIterator
    {
        let mut methods = FxHashMap::default();
        methods.insert("next".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::Con(TyCon::new("T")));
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterator".to_string(),
            trait_type_args: vec![],
            impl_type: Ty::Con(TyCon::new("ListIterator")),
            impl_type_name: "ListIterator".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterable for Map<K,V>
    {
        let map_kv = Ty::App(
            Box::new(Ty::Con(TyCon::new("Map"))),
            vec![Ty::Con(TyCon::new("K")), Ty::Con(TyCon::new("V"))],
        );
        let mut methods = FxHashMap::default();
        methods.insert("iter".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::Tuple(vec![Ty::Con(TyCon::new("K")), Ty::Con(TyCon::new("V"))]));
        assoc_types.insert("Iter".to_string(), Ty::Con(TyCon::new("MapIterator")));
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterable".to_string(),
            trait_type_args: vec![],
            impl_type: map_kv,
            impl_type_name: "Map".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterator for MapIterator
    {
        let mut methods = FxHashMap::default();
        methods.insert("next".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::Tuple(vec![Ty::Con(TyCon::new("K")), Ty::Con(TyCon::new("V"))]));
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterator".to_string(),
            trait_type_args: vec![],
            impl_type: Ty::Con(TyCon::new("MapIterator")),
            impl_type_name: "MapIterator".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterable for Set (untyped -- Set stores Int elements)
    {
        let set_t = Ty::Con(TyCon::new("Set"));
        let mut methods = FxHashMap::default();
        methods.insert("iter".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::int());
        assoc_types.insert("Iter".to_string(), Ty::Con(TyCon::new("SetIterator")));
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterable".to_string(),
            trait_type_args: vec![],
            impl_type: set_t,
            impl_type_name: "Set".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterator for SetIterator
    {
        let mut methods = FxHashMap::default();
        methods.insert("next".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::int());
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterator".to_string(),
            trait_type_args: vec![],
            impl_type: Ty::Con(TyCon::new("SetIterator")),
            impl_type_name: "SetIterator".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterable for Range
    {
        let range_t = Ty::Con(TyCon::new("Range"));
        let mut methods = FxHashMap::default();
        methods.insert("iter".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::int());
        assoc_types.insert("Iter".to_string(), Ty::Con(TyCon::new("RangeIterator")));
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterable".to_string(),
            trait_type_args: vec![],
            impl_type: range_t,
            impl_type_name: "Range".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // impl Iterator for RangeIterator
    {
        let mut methods = FxHashMap::default();
        methods.insert("next".to_string(), ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: None,
        });
        let mut assoc_types = FxHashMap::default();
        assoc_types.insert("Item".to_string(), Ty::int());
        let _ = registry.register_impl(ImplDef {
            trait_name: "Iterator".to_string(),
            trait_type_args: vec![],
            impl_type: Ty::Con(TyCon::new("RangeIterator")),
            impl_type_name: "RangeIterator".to_string(),
            methods,
            associated_types: assoc_types,
        });
    }

    // ── Eq trait ────────────────────────────────────────────────────

    registry.register_trait(TraitDef {
        name: "Eq".to_string(),
        methods: vec![TraitMethodSig {
            name: "eq".to_string(),
            has_self: true,
            param_count: 1,
            return_type: Some(Ty::bool()),
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // Eq impls for Int, Float, String, Bool.
    for (ty, ty_name) in &[
        (Ty::int(), "Int"),
        (Ty::float(), "Float"),
        (Ty::string(), "String"),
        (Ty::bool(), "Bool"),
    ] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "eq".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::bool()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Eq".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── Ord trait ───────────────────────────────────────────────────

    registry.register_trait(TraitDef {
        name: "Ord".to_string(),
        methods: vec![
            TraitMethodSig {
                name: "lt".to_string(),
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::bool()),
                has_default_body: false,
            },
            TraitMethodSig {
                name: "compare".to_string(),
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::Con(TyCon::new("Ordering"))),
                has_default_body: true,
            },
        ],
        associated_types: vec![],
    });

    // Ord impls for Int, Float, String.
    for (ty, ty_name) in &[
        (Ty::int(), "Int"),
        (Ty::float(), "Float"),
        (Ty::string(), "String"),
    ] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "lt".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::bool()),
            },
        );
        methods.insert(
            "compare".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::Con(TyCon::new("Ordering"))),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Ord".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── List Eq/Ord impls (Phase 27 Plan 01) ──────────────────────
    // Register Eq for List<T> -- parametric impl via single-letter type param "T".
    {
        let list_t = Ty::App(Box::new(Ty::Con(TyCon::new("List"))), vec![Ty::Con(TyCon::new("T"))]);
        let mut eq_methods = FxHashMap::default();
        eq_methods.insert(
            "eq".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::bool()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Eq".to_string(),
            trait_type_args: vec![],
            impl_type: list_t.clone(),
            impl_type_name: "List".to_string(),
            methods: eq_methods,
            associated_types: FxHashMap::default(),
        });

        let mut ord_methods = FxHashMap::default();
        ord_methods.insert(
            "lt".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::bool()),
            },
        );
        ord_methods.insert(
            "compare".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 1,
                return_type: Some(Ty::Con(TyCon::new("Ordering"))),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Ord".to_string(),
            trait_type_args: vec![],
            impl_type: list_t,
            impl_type_name: "List".to_string(),
            methods: ord_methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── Not trait ───────────────────────────────────────────────────

    registry.register_trait(TraitDef {
        name: "Not".to_string(),
        methods: vec![TraitMethodSig {
            name: "not".to_string(),
            has_self: true,
            param_count: 0,
            return_type: Some(Ty::bool()),
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    let mut not_methods = FxHashMap::default();
    not_methods.insert(
        "not".to_string(),
        ImplMethodSig {
            has_self: true,
            param_count: 0,
            return_type: Some(Ty::bool()),
        },
    );
    let _ = registry.register_impl(ImplDef {
        trait_name: "Not".to_string(),
        trait_type_args: vec![],
        impl_type: Ty::bool(),
        impl_type_name: "Bool".to_string(),
        methods: not_methods,
        associated_types: FxHashMap::default(),
    });

    // ── Display trait ──────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "Display".to_string(),
        methods: vec![TraitMethodSig {
            name: "to_string".to_string(),
            has_self: true,
            param_count: 0, // no params besides self
            return_type: Some(Ty::string()),
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    for (ty, ty_name) in &[
        (Ty::int(), "Int"),
        (Ty::float(), "Float"),
        (Ty::string(), "String"),
        (Ty::bool(), "Bool"),
    ] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "to_string".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Display".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── Display/Debug for collection types (Phase 31) ──────────
    // Register Display for List<T>, Map<K,V>, Set so method dot-syntax
    // works for to_string() on collections. The actual runtime Display
    // is handled by wrap_collection_to_string in MIR lowering.
    {
        let list_t = Ty::App(Box::new(Ty::Con(TyCon::new("List"))), vec![Ty::Con(TyCon::new("T"))]);
        let mut methods = FxHashMap::default();
        methods.insert(
            "to_string".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Display".to_string(),
            trait_type_args: vec![],
            impl_type: list_t,
            impl_type_name: "List".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }
    {
        let map_kv = Ty::App(
            Box::new(Ty::Con(TyCon::new("Map"))),
            vec![Ty::Con(TyCon::new("K")), Ty::Con(TyCon::new("V"))],
        );
        let mut methods = FxHashMap::default();
        methods.insert(
            "to_string".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Display".to_string(),
            trait_type_args: vec![],
            impl_type: map_kv,
            impl_type_name: "Map".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }
    {
        let set_t = Ty::Con(TyCon::new("Set"));
        let mut methods = FxHashMap::default();
        methods.insert(
            "to_string".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Display".to_string(),
            trait_type_args: vec![],
            impl_type: set_t,
            impl_type_name: "Set".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── Debug trait ──────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "Debug".to_string(),
        methods: vec![TraitMethodSig {
            name: "inspect".to_string(),
            has_self: true,
            param_count: 0,
            return_type: Some(Ty::string()),
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // Debug impls for primitives (Int, Float, String, Bool).
    // For primitives, inspect produces the same output as to_string
    // (except String wraps in quotes -- handled at codegen).
    for (ty, ty_name) in &[
        (Ty::int(), "Int"),
        (Ty::float(), "Float"),
        (Ty::string(), "String"),
        (Ty::bool(), "Bool"),
    ] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "inspect".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Debug".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── Hash trait ──────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "Hash".to_string(),
        methods: vec![TraitMethodSig {
            name: "hash".to_string(),
            has_self: true,
            param_count: 0,
            return_type: Some(Ty::int()),
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // Hash impls for primitives (Int, Float, String, Bool).
    for (ty, ty_name) in &[
        (Ty::int(), "Int"),
        (Ty::float(), "Float"),
        (Ty::string(), "String"),
        (Ty::bool(), "Bool"),
    ] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "hash".to_string(),
            ImplMethodSig {
                has_self: true,
                param_count: 0,
                return_type: Some(Ty::int()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Hash".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── Default trait ──────────────────────────────────────────────
    // Default is the first STATIC trait method in Mesh: no self parameter.
    // default() -> Self, where the return type is resolved per-impl.
    registry.register_trait(TraitDef {
        name: "Default".to_string(),
        methods: vec![TraitMethodSig {
            name: "default".to_string(),
            has_self: false,
            param_count: 0,
            return_type: None, // Self -- resolved per concrete type at call site
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // Default impls for primitives (Int, Float, String, Bool).
    // Each impl specifies the concrete return type.
    for (ty, ty_name) in &[
        (Ty::int(), "Int"),
        (Ty::float(), "Float"),
        (Ty::string(), "String"),
        (Ty::bool(), "Bool"),
    ] {
        let mut methods = FxHashMap::default();
        methods.insert(
            "default".to_string(),
            ImplMethodSig {
                has_self: false,
                param_count: 0,
                return_type: Some(ty.clone()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "Default".to_string(),
            trait_type_args: vec![],
            impl_type: ty.clone(),
            impl_type_name: ty_name.to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // ── From<T> trait ───────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "From".to_string(),
        methods: vec![TraitMethodSig {
            name: "from".to_string(),
            has_self: false,
            param_count: 1,
            return_type: None, // Self -- resolved per impl
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // ── Into<T> trait ───────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "Into".to_string(),
        methods: vec![TraitMethodSig {
            name: "into".to_string(),
            has_self: true,
            param_count: 0,
            return_type: None, // T -- the target type
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // ── TryFrom<T> trait ────────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "TryFrom".to_string(),
        methods: vec![TraitMethodSig {
            name: "try_from".to_string(),
            has_self: false,        // static method like From.from()
            param_count: 1,
            return_type: None,      // Result<Self, E> -- resolved per impl
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // ── TryInto<T> trait ────────────────────────────────────────────────
    registry.register_trait(TraitDef {
        name: "TryInto".to_string(),
        methods: vec![TraitMethodSig {
            name: "try_into".to_string(),
            has_self: true,         // instance method like Into.into()
            param_count: 0,
            return_type: None,      // Result<T, E> -- the target type wrapped in Result
            has_default_body: false,
        }],
        associated_types: vec![],
    });

    // ── Built-in From impls ────────────────────────────────────────
    // Each registers a From impl with trait_type_args; synthetic Into
    // generation in register_impl automatically creates corresponding Into impls.

    // impl From<Int> for Float
    {
        let mut methods = FxHashMap::default();
        methods.insert(
            "from".to_string(),
            ImplMethodSig {
                has_self: false,
                param_count: 1,
                return_type: Some(Ty::float()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "From".to_string(),
            trait_type_args: vec![Ty::int()],
            impl_type: Ty::float(),
            impl_type_name: "Float".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // impl From<Int> for String
    {
        let mut methods = FxHashMap::default();
        methods.insert(
            "from".to_string(),
            ImplMethodSig {
                has_self: false,
                param_count: 1,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "From".to_string(),
            trait_type_args: vec![Ty::int()],
            impl_type: Ty::string(),
            impl_type_name: "String".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // impl From<Float> for String
    {
        let mut methods = FxHashMap::default();
        methods.insert(
            "from".to_string(),
            ImplMethodSig {
                has_self: false,
                param_count: 1,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "From".to_string(),
            trait_type_args: vec![Ty::float()],
            impl_type: Ty::string(),
            impl_type_name: "String".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }

    // impl From<Bool> for String
    {
        let mut methods = FxHashMap::default();
        methods.insert(
            "from".to_string(),
            ImplMethodSig {
                has_self: false,
                param_count: 1,
                return_type: Some(Ty::string()),
            },
        );
        let _ = registry.register_impl(ImplDef {
            trait_name: "From".to_string(),
            trait_type_args: vec![Ty::bool()],
            impl_type: Ty::string(),
            impl_type_name: "String".to_string(),
            methods,
            associated_types: FxHashMap::default(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_register_primitives() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Check primitive types exist.
        assert!(env.lookup("Int").is_some());
        assert!(env.lookup("Float").is_some());
        assert!(env.lookup("String").is_some());
        assert!(env.lookup("Bool").is_some());
    }

    #[test]
    fn builtins_register_operators() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Check arithmetic operators exist.
        assert!(env.lookup("+").is_some());
        assert!(env.lookup("-").is_some());
        assert!(env.lookup("*").is_some());
        assert!(env.lookup("/").is_some());

        // Check comparison operators.
        assert!(env.lookup("==").is_some());
        assert!(env.lookup("<").is_some());
    }

    #[test]
    fn builtins_register_compiler_known_traits() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Check arithmetic traits.
        assert!(trait_registry.get_trait("Add").is_some());
        assert!(trait_registry.get_trait("Sub").is_some());
        assert!(trait_registry.get_trait("Eq").is_some());
        assert!(trait_registry.get_trait("Ord").is_some());

        // Check impls.
        assert!(trait_registry.has_impl("Add", &Ty::int()));
        assert!(trait_registry.has_impl("Add", &Ty::float()));
        assert!(!trait_registry.has_impl("Add", &Ty::string()));
        assert!(trait_registry.has_impl("Eq", &Ty::string()));
    }

    #[test]
    fn builtins_register_stdlib_functions() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // String operations
        assert!(env.lookup("string_length").is_some());
        assert!(env.lookup("string_slice").is_some());
        assert!(env.lookup("string_contains").is_some());
        assert!(env.lookup("string_starts_with").is_some());
        assert!(env.lookup("string_ends_with").is_some());
        assert!(env.lookup("string_trim").is_some());
        assert!(env.lookup("string_to_upper").is_some());
        assert!(env.lookup("string_to_lower").is_some());
        assert!(env.lookup("string_replace").is_some());
        assert!(env.lookup("string_split").is_some());
        assert!(env.lookup("string_join").is_some());
        assert!(env.lookup("string_to_int").is_some());
        assert!(env.lookup("string_to_float").is_some());

        // File I/O functions
        assert!(env.lookup("file_read").is_some());
        assert!(env.lookup("file_write").is_some());
        assert!(env.lookup("file_append").is_some());
        assert!(env.lookup("file_exists").is_some());
        assert!(env.lookup("file_delete").is_some());

        // IO functions
        assert!(env.lookup("io_read_line").is_some());
        assert!(env.lookup("io_eprintln").is_some());

        // Env functions
        assert!(env.lookup("env_get_with_default").is_some());
        assert!(env.lookup("env_get_int").is_some());
        assert!(env.lookup("env_args").is_some());

        // Regex functions (Phase 119)
        assert!(env.lookup("regex_compile").is_some());
        assert!(env.lookup("regex_is_match").is_some());
        assert!(env.lookup("regex_captures").is_some());
        assert!(env.lookup("regex_replace").is_some());
        assert!(env.lookup("regex_split").is_some());

        // HTTP functions (Phase 8 Plan 05)
        assert!(env.lookup("http_router").is_some());
        assert!(env.lookup("http_route").is_some());
        assert!(env.lookup("http_serve").is_some());
        assert!(env.lookup("http_response").is_some());
        assert!(env.lookup("http_get").is_some());
        assert!(env.lookup("http_post").is_some());

        // Request accessors
        assert!(env.lookup("request_method").is_some());
        assert!(env.lookup("request_path").is_some());
        assert!(env.lookup("request_body").is_some());
        assert!(env.lookup("request_header").is_some());
        assert!(env.lookup("request_query").is_some());
        assert!(env.lookup("request_param").is_some());

        // Phase 51: Method-specific routing
        assert!(env.lookup("http_on_get").is_some());
        assert!(env.lookup("http_on_post").is_some());
        assert!(env.lookup("http_on_put").is_some());
        assert!(env.lookup("http_on_delete").is_some());

        // Phase 52: Middleware
        assert!(env.lookup("http_use").is_some());
    }

    #[test]
    fn display_trait_registered_for_primitives() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Display trait exists
        assert!(trait_registry.has_impl("Display", &Ty::int()));
        assert!(trait_registry.has_impl("Display", &Ty::float()));
        assert!(trait_registry.has_impl("Display", &Ty::string()));
        assert!(trait_registry.has_impl("Display", &Ty::bool()));

        // find_method_traits should find Display for to_string
        let traits = trait_registry.find_method_traits("to_string", &Ty::int());
        assert!(traits.contains(&"Display".to_string()));
    }

    #[test]
    fn hash_trait_registered_for_primitives() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Hash trait exists for all primitives
        assert!(trait_registry.has_impl("Hash", &Ty::int()));
        assert!(trait_registry.has_impl("Hash", &Ty::float()));
        assert!(trait_registry.has_impl("Hash", &Ty::string()));
        assert!(trait_registry.has_impl("Hash", &Ty::bool()));

        // find_method_traits should find Hash for hash
        let traits = trait_registry.find_method_traits("hash", &Ty::int());
        assert!(traits.contains(&"Hash".to_string()));
    }

    #[test]
    fn debug_trait_registered_for_primitives() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Debug trait exists for all primitives
        assert!(trait_registry.has_impl("Debug", &Ty::int()));
        assert!(trait_registry.has_impl("Debug", &Ty::float()));
        assert!(trait_registry.has_impl("Debug", &Ty::string()));
        assert!(trait_registry.has_impl("Debug", &Ty::bool()));

        // find_method_traits should find Debug for inspect
        let traits = trait_registry.find_method_traits("inspect", &Ty::int());
        assert!(traits.contains(&"Debug".to_string()));
    }

    #[test]
    fn default_trait_registered_for_primitives() {
        let mut ctx = InferCtx::new();
        let mut env = TypeEnv::new();
        let mut trait_registry = TraitRegistry::new();
        register_builtins(&mut ctx, &mut env, &mut trait_registry);

        // Default trait exists for all primitives
        assert!(trait_registry.has_impl("Default", &Ty::int()));
        assert!(trait_registry.has_impl("Default", &Ty::float()));
        assert!(trait_registry.has_impl("Default", &Ty::string()));
        assert!(trait_registry.has_impl("Default", &Ty::bool()));

        // find_method_traits should find Default for "default"
        let traits = trait_registry.find_method_traits("default", &Ty::int());
        assert!(traits.contains(&"Default".to_string()));
    }
}
