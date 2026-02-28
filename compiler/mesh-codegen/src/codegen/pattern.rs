//! Decision tree to LLVM branch/switch translation.
//!
//! Translates compiled `DecisionTree` nodes from the pattern compilation
//! phase into LLVM basic blocks with switch instructions, conditional
//! branches, and variable bindings.
//!
//! ## Strategy
//!
//! - `Leaf`: Bind variables from AccessPath, codegen arm body, store result,
//!   branch to merge block
//! - `Switch`: Load tag from scrutinee, emit LLVM switch instruction,
//!   recurse for each case
//! - `Test`: Load scrutinee value, compare with literal, conditional branch,
//!   recurse for success/failure
//! - `Guard`: Codegen guard expression, conditional branch, recurse
//! - `Fail`: Emit mesh_panic + unreachable

use inkwell::basic_block::BasicBlock;
use inkwell::values::{BasicValueEnum, PointerValue};
use inkwell::IntPredicate;

use super::intrinsics::get_intrinsic;
use super::types::variant_struct_type;
use super::CodeGen;
use crate::mir::{MirLiteral, MirMatchArm, MirType};
use crate::pattern::{AccessPath, DecisionTree};

impl<'ctx> CodeGen<'ctx> {
    /// Generate LLVM IR for a decision tree.
    ///
    /// The decision tree was compiled from pattern matching arms and controls
    /// which arm body to execute based on the scrutinee value.
    ///
    /// # Arguments
    ///
    /// * `tree` - The decision tree to codegen
    /// * `scrutinee_alloca` - Pointer to the scrutinee value (alloca'd)
    /// * `scrutinee_ty` - The MIR type of the scrutinee
    /// * `arms` - The original match arms (for arm body codegen)
    /// * `result_alloca` - Pointer to store the match result
    /// * `merge_bb` - Block to branch to after an arm body executes
    pub(crate) fn codegen_decision_tree(
        &mut self,
        tree: &DecisionTree,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        arms: &[MirMatchArm],
        result_alloca: PointerValue<'ctx>,
        merge_bb: BasicBlock<'ctx>,
    ) -> Result<(), String> {
        match tree {
            DecisionTree::Leaf {
                arm_index,
                bindings,
            } => {
                self.codegen_leaf(
                    *arm_index,
                    bindings,
                    scrutinee_alloca,
                    scrutinee_ty,
                    arms,
                    result_alloca,
                    merge_bb,
                )
            }
            DecisionTree::Switch {
                scrutinee_path,
                cases,
                default,
            } => {
                self.codegen_switch(
                    scrutinee_path,
                    cases,
                    default.as_deref(),
                    scrutinee_alloca,
                    scrutinee_ty,
                    arms,
                    result_alloca,
                    merge_bb,
                )
            }
            DecisionTree::Test {
                scrutinee_path,
                value,
                success,
                failure,
            } => {
                self.codegen_test(
                    scrutinee_path,
                    value,
                    success,
                    failure,
                    scrutinee_alloca,
                    scrutinee_ty,
                    arms,
                    result_alloca,
                    merge_bb,
                )
            }
            DecisionTree::Guard {
                guard_expr,
                success,
                failure,
            } => {
                self.codegen_guard(
                    guard_expr,
                    success,
                    failure,
                    scrutinee_alloca,
                    scrutinee_ty,
                    arms,
                    result_alloca,
                    merge_bb,
                )
            }
            DecisionTree::ListDecons {
                scrutinee_path,
                elem_ty,
                non_empty,
                empty,
            } => {
                self.codegen_list_decons(
                    scrutinee_path,
                    elem_ty,
                    non_empty,
                    empty,
                    scrutinee_alloca,
                    scrutinee_ty,
                    arms,
                    result_alloca,
                    merge_bb,
                )
            }
            DecisionTree::Fail {
                message,
                file,
                line,
            } => {
                self.codegen_fail(message, file, *line)
            }
        }
    }

    // ── Leaf node ────────────────────────────────────────────────────

    fn codegen_leaf(
        &mut self,
        arm_index: usize,
        bindings: &[(String, MirType, AccessPath)],
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        arms: &[MirMatchArm],
        result_alloca: PointerValue<'ctx>,
        merge_bb: BasicBlock<'ctx>,
    ) -> Result<(), String> {
        // Bind variables from access paths.
        for (name, ty, path) in bindings {
            // If already bound by a guard node for this arm, just update the
            // store so the value is current (guard pre-binds for guard-expr
            // evaluation but the scrutinee may differ between case expressions).
            if let Some(&existing_alloca) = self.locals.get(name) {
                let val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, path)?;
                let llvm_ty = self.llvm_type(ty);
                let val = if should_deref_boxed_payload(ty, &val, &llvm_ty) {
                    self.builder
                        .build_load(llvm_ty, val.into_pointer_value(), "deref_struct")
                        .map_err(|e| e.to_string())?
                } else {
                    val
                };
                self.builder
                    .build_store(existing_alloca, val)
                    .map_err(|e| e.to_string())?;
                continue;
            }
            let val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, path)?;
            let llvm_ty = self.llvm_type(ty);

            // When the binding type is a Struct, SumType, or opaque i64 handle (e.g., DateTime,
            // SqliteConn — MirType::Int) but the extracted value is a pointer, dereference the
            // pointer to load the actual value. This covers:
            // - Result<Struct, String> where Ok's payload is heap-allocated (Ptr)
            // - Result<DateTime, String> where Ok's i64 payload is boxed via alloc_result
            let val = if should_deref_boxed_payload(ty, &val, &llvm_ty) {
                self.builder
                    .build_load(llvm_ty, val.into_pointer_value(), "deref_struct")
                    .map_err(|e| e.to_string())?
            } else {
                val
            };

            // Place alloca in the function entry block for proper LLVM domination.
            // Without this, allocas inside case blocks (e.g., for Err(e) or Some(x)
            // bindings) fail verification when referenced from subsequent code.
            let current_bb = self.builder.get_insert_block().unwrap();
            let fn_val = self.current_function();
            let entry_bb = fn_val.get_first_basic_block().unwrap();
            if let Some(first_instr) = entry_bb.get_first_instruction() {
                self.builder.position_before(&first_instr);
            } else {
                self.builder.position_at_end(entry_bb);
            }
            let alloca = self
                .builder
                .build_alloca(llvm_ty, name)
                .map_err(|e| e.to_string())?;

            // Store the value at the original position (not in entry block).
            self.builder.position_at_end(current_bb);
            self.builder
                .build_store(alloca, val)
                .map_err(|e| e.to_string())?;
            self.locals.insert(name.clone(), alloca);
            self.local_types.insert(name.clone(), ty.clone());
        }

        // Codegen arm body
        let arm = arms
            .get(arm_index)
            .ok_or_else(|| format!("Invalid arm index {}", arm_index))?;
        let body_val = self.codegen_expr(&arm.body)?;

        // Store result and branch to merge (only if not already terminated by
        // return/panic). The ? operator desugaring generates match arms with
        // MirExpr::Return for early-return paths -- these emit a `ret`
        // instruction that terminates the block, so we must skip the store.
        if self.builder.get_insert_block().unwrap().get_terminator().is_none() {
            self.builder
                .build_store(result_alloca, body_val)
                .map_err(|e| e.to_string())?;
            self.builder
                .build_unconditional_branch(merge_bb)
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    // ── Switch node ──────────────────────────────────────────────────

    fn codegen_switch(
        &mut self,
        scrutinee_path: &AccessPath,
        cases: &[(crate::pattern::ConstructorTag, DecisionTree)],
        default: Option<&DecisionTree>,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        arms: &[MirMatchArm],
        result_alloca: PointerValue<'ctx>,
        merge_bb: BasicBlock<'ctx>,
    ) -> Result<(), String> {
        let fn_val = self.current_function();

        // Navigate to the value at the access path to get its pointer
        let switch_ptr = self.navigate_access_path_ptr(scrutinee_alloca, scrutinee_ty, scrutinee_path)?;

        // The type at the path should be a sum type -- load the tag (i8 at offset 0)
        let path_ty = self.resolve_path_type(scrutinee_ty, scrutinee_path)?;
        let sum_layout = match &path_ty {
            MirType::SumType(name) => {
                self.lookup_sum_type_layout(name)
                    .ok_or_else(|| format!("Unknown sum type layout '{}'", name))?
            }
            _ => return Err(format!("Switch on non-sum type: {:?}", path_ty)),
        };
        let sum_layout = *sum_layout;

        let tag_ptr = self
            .builder
            .build_struct_gep(sum_layout, switch_ptr, 0, "tag_ptr")
            .map_err(|e| e.to_string())?;
        let tag_val = self
            .builder
            .build_load(self.context.i8_type(), tag_ptr, "tag")
            .map_err(|e| e.to_string())?
            .into_int_value();

        // Create blocks for each case
        let default_bb = self.context.append_basic_block(fn_val, "switch_default");
        let case_bbs: Vec<BasicBlock<'ctx>> = cases
            .iter()
            .map(|(tag, _)| {
                self.context
                    .append_basic_block(fn_val, &format!("case_{}", tag.variant_name))
            })
            .collect();

        // Build switch instruction with all cases
        let switch_cases: Vec<(inkwell::values::IntValue<'ctx>, BasicBlock<'ctx>)> = cases
            .iter()
            .enumerate()
            .map(|(i, (tag, _))| {
                let case_val = self.context.i8_type().const_int(tag.tag as u64, false);
                (case_val, case_bbs[i])
            })
            .collect();

        self.builder
            .build_switch(tag_val, default_bb, &switch_cases)
            .map_err(|e| e.to_string())?;

        // Generate code for each case
        for (i, (_, subtree)) in cases.iter().enumerate() {
            self.builder.position_at_end(case_bbs[i]);
            self.codegen_decision_tree(
                subtree,
                scrutinee_alloca,
                scrutinee_ty,
                arms,
                result_alloca,
                merge_bb,
            )?;
        }

        // Generate default case
        self.builder.position_at_end(default_bb);
        if let Some(default_tree) = default {
            self.codegen_decision_tree(
                default_tree,
                scrutinee_alloca,
                scrutinee_ty,
                arms,
                result_alloca,
                merge_bb,
            )?;
        } else {
            // Default: unreachable (exhaustive match guaranteed by type checker)
            self.codegen_fail(
                "non-exhaustive match in switch",
                "<unknown>",
                0,
            )?;
        }

        Ok(())
    }

    // ── Test node ────────────────────────────────────────────────────

    fn codegen_test(
        &mut self,
        scrutinee_path: &AccessPath,
        value: &MirLiteral,
        success: &DecisionTree,
        failure: &DecisionTree,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        arms: &[MirMatchArm],
        result_alloca: PointerValue<'ctx>,
        merge_bb: BasicBlock<'ctx>,
    ) -> Result<(), String> {
        let fn_val = self.current_function();

        // Load the value at the access path
        let test_val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, scrutinee_path)?;

        // Compare with the literal
        let cond = match value {
            MirLiteral::Int(n) => {
                let lit_val = self.context.i64_type().const_int(*n as u64, true);
                self.builder
                    .build_int_compare(IntPredicate::EQ, test_val.into_int_value(), lit_val, "test_eq")
                    .map_err(|e| e.to_string())?
            }
            MirLiteral::Float(f) => {
                let lit_val = self.context.f64_type().const_float(*f);
                self.builder
                    .build_float_compare(
                        inkwell::FloatPredicate::OEQ,
                        test_val.into_float_value(),
                        lit_val,
                        "test_feq",
                    )
                    .map_err(|e| e.to_string())?
            }
            MirLiteral::Bool(b) => {
                let lit_val = self.context.bool_type().const_int(if *b { 1 } else { 0 }, false);
                self.builder
                    .build_int_compare(IntPredicate::EQ, test_val.into_int_value(), lit_val, "test_beq")
                    .map_err(|e| e.to_string())?
            }
            MirLiteral::String(s) => {
                // Create a MeshString for the pattern literal
                let pattern_str = self.codegen_string_lit(s)?;

                // Call mesh_string_eq(scrutinee, pattern)
                let eq_fn = get_intrinsic(&self.module, "mesh_string_eq");
                let result = self
                    .builder
                    .build_call(eq_fn, &[test_val.into(), pattern_str.into()], "str_eq")
                    .map_err(|e| e.to_string())?;
                let i8_result = result
                    .try_as_basic_value()
                    .basic()
                    .ok_or("mesh_string_eq returned void")?
                    .into_int_value();

                // Convert i8 result to i1 for branch condition
                let zero = self.context.i8_type().const_int(0, false);
                self.builder
                    .build_int_compare(IntPredicate::NE, i8_result, zero, "str_eq_bool")
                    .map_err(|e| e.to_string())?
            }
        };

        let success_bb = self.context.append_basic_block(fn_val, "test_success");
        let failure_bb = self.context.append_basic_block(fn_val, "test_failure");

        self.builder
            .build_conditional_branch(cond, success_bb, failure_bb)
            .map_err(|e| e.to_string())?;

        // Success branch
        self.builder.position_at_end(success_bb);
        self.codegen_decision_tree(
            success,
            scrutinee_alloca,
            scrutinee_ty,
            arms,
            result_alloca,
            merge_bb,
        )?;

        // Failure branch
        self.builder.position_at_end(failure_bb);
        self.codegen_decision_tree(
            failure,
            scrutinee_alloca,
            scrutinee_ty,
            arms,
            result_alloca,
            merge_bb,
        )?;

        Ok(())
    }

    // ── Guard node ───────────────────────────────────────────────────

    fn codegen_guard(
        &mut self,
        guard_expr: &crate::mir::MirExpr,
        success: &DecisionTree,
        failure: &DecisionTree,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        arms: &[MirMatchArm],
        result_alloca: PointerValue<'ctx>,
        merge_bb: BasicBlock<'ctx>,
    ) -> Result<(), String> {
        let fn_val = self.current_function();

        // Guard expressions may reference variables bound by the pattern.
        // Extract bindings from the success Leaf and bind them before evaluating
        // the guard, so that guard expressions like `n < 0` can access `n`.
        // Allocas are placed in the entry block to ensure proper LLVM domination.
        if let DecisionTree::Leaf { bindings, .. } = success {
            let current_bb = self.builder.get_insert_block().unwrap();
            let entry_bb = fn_val.get_first_basic_block().unwrap();

            for (name, ty, path) in bindings {
                let val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, path)?;
                let llvm_ty = self.llvm_type(ty);

                // Place alloca in the entry block for proper domination.
                if let Some(first_instr) = entry_bb.get_first_instruction() {
                    self.builder.position_before(&first_instr);
                } else {
                    self.builder.position_at_end(entry_bb);
                }
                let alloca = self
                    .builder
                    .build_alloca(llvm_ty, name)
                    .map_err(|e| e.to_string())?;

                // Store the value at the original position (not in entry block).
                self.builder.position_at_end(current_bb);
                self.builder
                    .build_store(alloca, val)
                    .map_err(|e| e.to_string())?;

                self.locals.insert(name.clone(), alloca);
                self.local_types.insert(name.clone(), ty.clone());
            }

            // Restore insertion point.
            self.builder.position_at_end(current_bb);
        }

        let guard_val = self.codegen_expr(guard_expr)?.into_int_value();

        let success_bb = self.context.append_basic_block(fn_val, "guard_pass");
        let failure_bb = self.context.append_basic_block(fn_val, "guard_fail");

        self.builder
            .build_conditional_branch(guard_val, success_bb, failure_bb)
            .map_err(|e| e.to_string())?;

        // Guard passed
        self.builder.position_at_end(success_bb);
        self.codegen_decision_tree(
            success,
            scrutinee_alloca,
            scrutinee_ty,
            arms,
            result_alloca,
            merge_bb,
        )?;

        // Guard failed
        self.builder.position_at_end(failure_bb);
        self.codegen_decision_tree(
            failure,
            scrutinee_alloca,
            scrutinee_ty,
            arms,
            result_alloca,
            merge_bb,
        )?;

        Ok(())
    }

    // ── ListDecons node ──────────────────────────────────────────────

    fn codegen_list_decons(
        &mut self,
        scrutinee_path: &AccessPath,
        _elem_ty: &MirType,
        non_empty: &DecisionTree,
        empty: &DecisionTree,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        arms: &[MirMatchArm],
        result_alloca: PointerValue<'ctx>,
        merge_bb: BasicBlock<'ctx>,
    ) -> Result<(), String> {
        let fn_val = self.current_function();

        // Load the list pointer at the access path.
        let list_val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, scrutinee_path)?;
        let list_ptr = list_val.into_pointer_value();

        // Call mesh_list_length(list) to check if non-empty.
        let length_fn = get_intrinsic(&self.module, "mesh_list_length");
        let length_result = self
            .builder
            .build_call(length_fn, &[list_ptr.into()], "list_len")
            .map_err(|e| e.to_string())?;
        let length_val = length_result
            .try_as_basic_value()
            .basic()
            .ok_or("mesh_list_length returned void")?
            .into_int_value();

        // Compare length > 0.
        let zero = self.context.i64_type().const_int(0, false);
        let is_non_empty = self
            .builder
            .build_int_compare(IntPredicate::SGT, length_val, zero, "is_non_empty")
            .map_err(|e| e.to_string())?;

        let non_empty_bb = self.context.append_basic_block(fn_val, "list_non_empty");
        let empty_bb = self.context.append_basic_block(fn_val, "list_empty");

        self.builder
            .build_conditional_branch(is_non_empty, non_empty_bb, empty_bb)
            .map_err(|e| e.to_string())?;

        // Non-empty branch: compile the non_empty decision tree.
        self.builder.position_at_end(non_empty_bb);
        self.codegen_decision_tree(
            non_empty,
            scrutinee_alloca,
            scrutinee_ty,
            arms,
            result_alloca,
            merge_bb,
        )?;

        // Empty branch: compile the empty decision tree.
        self.builder.position_at_end(empty_bb);
        self.codegen_decision_tree(
            empty,
            scrutinee_alloca,
            scrutinee_ty,
            arms,
            result_alloca,
            merge_bb,
        )?;

        Ok(())
    }

    // ── Fail node ────────────────────────────────────────────────────

    fn codegen_fail(
        &mut self,
        message: &str,
        file: &str,
        line: u32,
    ) -> Result<(), String> {
        // Emit panic call
        self.codegen_panic(message, file, line)?;
        // codegen_panic already emits unreachable
        Ok(())
    }

    // ── Access path navigation ───────────────────────────────────────

    /// Navigate an access path and return the loaded value.
    fn navigate_access_path(
        &mut self,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        path: &AccessPath,
    ) -> Result<BasicValueEnum<'ctx>, String> {
        let ptr = self.navigate_access_path_ptr(scrutinee_alloca, scrutinee_ty, path)?;
        let path_ty = self.resolve_path_type(scrutinee_ty, path)?;
        let llvm_ty = self.llvm_type(&path_ty);
        let val = self
            .builder
            .build_load(llvm_ty, ptr, "path_val")
            .map_err(|e| e.to_string())?;
        Ok(val)
    }

    /// Navigate an access path and return a pointer to the value.
    fn navigate_access_path_ptr(
        &mut self,
        scrutinee_alloca: PointerValue<'ctx>,
        scrutinee_ty: &MirType,
        path: &AccessPath,
    ) -> Result<PointerValue<'ctx>, String> {
        match path {
            AccessPath::Root => Ok(scrutinee_alloca),

            AccessPath::TupleField(parent, index) => {
                let parent_ptr =
                    self.navigate_access_path_ptr(scrutinee_alloca, scrutinee_ty, parent)?;
                let parent_ty = self.resolve_path_type(scrutinee_ty, parent)?;
                let llvm_parent_ty = self.llvm_type(&parent_ty);

                // GEP into tuple struct
                let field_ptr = self
                    .builder
                    .build_struct_gep(
                        llvm_parent_ty.into_struct_type(),
                        parent_ptr,
                        *index as u32,
                        "tuple_field",
                    )
                    .map_err(|e| e.to_string())?;
                Ok(field_ptr)
            }

            AccessPath::VariantField(parent, variant_name, index) => {
                let parent_ptr =
                    self.navigate_access_path_ptr(scrutinee_alloca, scrutinee_ty, parent)?;
                let parent_ty = self.resolve_path_type(scrutinee_ty, parent)?;

                // Get sum type info
                let type_name = match &parent_ty {
                    MirType::SumType(name) => name.clone(),
                    _ => return Err(format!("VariantField on non-sum type: {:?}", parent_ty)),
                };

                let sum_def = self
                    .lookup_sum_type_def(&type_name)
                    .ok_or_else(|| format!("Unknown sum type '{}'", type_name))?
                    .clone();

                let variant_def = sum_def
                    .variants
                    .iter()
                    .find(|v| v.name == *variant_name)
                    .ok_or_else(|| format!("Unknown variant '{}'", variant_name))?;

                // Create variant overlay type { i8 tag, field0, field1, ... }
                let variant_ty = variant_struct_type(
                    self.context,
                    &variant_def.fields,
                    &self.struct_types,
                    &self.sum_type_layouts,
                );

                // GEP into the variant overlay (field 0 is tag, so field N is index+1)
                let field_ptr = self
                    .builder
                    .build_struct_gep(
                        variant_ty,
                        parent_ptr,
                        (*index + 1) as u32,
                        "variant_field",
                    )
                    .map_err(|e| e.to_string())?;
                Ok(field_ptr)
            }

            AccessPath::StructField(parent, field_name) => {
                let parent_ptr =
                    self.navigate_access_path_ptr(scrutinee_alloca, scrutinee_ty, parent)?;
                let parent_ty = self.resolve_path_type(scrutinee_ty, parent)?;

                let struct_name = match &parent_ty {
                    MirType::Struct(name) => name.clone(),
                    _ => return Err(format!("StructField on non-struct type: {:?}", parent_ty)),
                };

                let struct_ty = self
                    .struct_types
                    .get(&struct_name)
                    .ok_or_else(|| format!("Unknown struct type '{}'", struct_name))?;
                let struct_ty = *struct_ty;

                let field_idx = self.find_struct_field_index(&struct_name, field_name)?;

                let field_ptr = self
                    .builder
                    .build_struct_gep(struct_ty, parent_ptr, field_idx as u32, "struct_field")
                    .map_err(|e| e.to_string())?;
                Ok(field_ptr)
            }

            AccessPath::ListHead(parent) => {
                // Load the list pointer, call mesh_list_head, store result in an alloca.
                let parent_val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, parent)?;
                let list_ptr = parent_val.into_pointer_value();

                let head_fn = get_intrinsic(&self.module, "mesh_list_head");
                let head_result = self
                    .builder
                    .build_call(head_fn, &[list_ptr.into()], "list_head")
                    .map_err(|e| e.to_string())?;
                let head_i64 = head_result
                    .try_as_basic_value()
                    .basic()
                    .ok_or("mesh_list_head returned void")?
                    .into_int_value();

                // Convert u64 -> actual element type based on resolve_path_type.
                let path_ty = self.resolve_path_type(scrutinee_ty, &AccessPath::ListHead(parent.clone()))?;
                let converted = self.convert_list_elem_from_u64(head_i64, &path_ty)?;

                // Store in an alloca so we can return a pointer.
                let llvm_ty = self.llvm_type(&path_ty);
                let alloca = self
                    .builder
                    .build_alloca(llvm_ty, "list_head_alloca")
                    .map_err(|e| e.to_string())?;
                self.builder
                    .build_store(alloca, converted)
                    .map_err(|e| e.to_string())?;
                Ok(alloca)
            }

            AccessPath::ListTail(parent) => {
                // Load the list pointer, call mesh_list_tail, store result in an alloca.
                let parent_val = self.navigate_access_path(scrutinee_alloca, scrutinee_ty, parent)?;
                let list_ptr = parent_val.into_pointer_value();

                let tail_fn = get_intrinsic(&self.module, "mesh_list_tail");
                let tail_result = self
                    .builder
                    .build_call(tail_fn, &[list_ptr.into()], "list_tail")
                    .map_err(|e| e.to_string())?;
                let tail_ptr = tail_result
                    .try_as_basic_value()
                    .basic()
                    .ok_or("mesh_list_tail returned void")?
                    .into_pointer_value();

                // Store in an alloca so we can return a pointer.
                let ptr_ty = self.context.ptr_type(inkwell::AddressSpace::default());
                let alloca = self
                    .builder
                    .build_alloca(ptr_ty, "list_tail_alloca")
                    .map_err(|e| e.to_string())?;
                self.builder
                    .build_store(alloca, tail_ptr)
                    .map_err(|e| e.to_string())?;
                Ok(alloca)
            }
        }
    }

    /// Convert a u64 value from mesh_list_head to the actual element type.
    ///
    /// `mesh_list_head` returns u64 (uniform storage). Based on the element type:
    /// - Int: keep as i64
    /// - Bool: truncate to i1
    /// - Float: bitcast to f64
    /// - String/Ptr: inttoptr
    fn convert_list_elem_from_u64(
        &self,
        val: inkwell::values::IntValue<'ctx>,
        elem_ty: &MirType,
    ) -> Result<BasicValueEnum<'ctx>, String> {
        match elem_ty {
            MirType::Int => Ok(val.into()),
            MirType::Bool => {
                let i1_val = self
                    .builder
                    .build_int_truncate(val, self.context.bool_type(), "head_to_bool")
                    .map_err(|e| e.to_string())?;
                Ok(i1_val.into())
            }
            MirType::Float => {
                let f64_val = self
                    .builder
                    .build_bit_cast(val, self.context.f64_type(), "head_to_f64")
                    .map_err(|e| e.to_string())?;
                Ok(f64_val)
            }
            MirType::String | MirType::Ptr | MirType::Struct(_) | MirType::SumType(_) | MirType::Pid(_) => {
                let ptr_ty = self.context.ptr_type(inkwell::AddressSpace::default());
                let ptr_val = self
                    .builder
                    .build_int_to_ptr(val, ptr_ty, "head_to_ptr")
                    .map_err(|e| e.to_string())?;
                Ok(ptr_val.into())
            }
            _ => {
                // Fallback: keep as i64
                Ok(val.into())
            }
        }
    }

    /// Resolve the MIR type at a given access path.
    fn resolve_path_type(
        &self,
        scrutinee_ty: &MirType,
        path: &AccessPath,
    ) -> Result<MirType, String> {
        match path {
            AccessPath::Root => Ok(scrutinee_ty.clone()),

            AccessPath::TupleField(parent, index) => {
                let parent_ty = self.resolve_path_type(scrutinee_ty, parent)?;
                match parent_ty {
                    MirType::Tuple(elems) => elems
                        .get(*index)
                        .cloned()
                        .ok_or_else(|| format!("Tuple field {} out of bounds", index)),
                    _ => Err(format!("TupleField on non-tuple type: {:?}", parent_ty)),
                }
            }

            AccessPath::VariantField(parent, variant_name, index) => {
                let parent_ty = self.resolve_path_type(scrutinee_ty, parent)?;
                match &parent_ty {
                    MirType::SumType(type_name) => {
                        let sum_def = self.lookup_sum_type_def(type_name).ok_or_else(|| {
                            format!("Unknown sum type '{}'", type_name)
                        })?;
                        let variant = sum_def
                            .variants
                            .iter()
                            .find(|v| v.name == *variant_name)
                            .ok_or_else(|| format!("Unknown variant '{}'", variant_name))?;
                        variant
                            .fields
                            .get(*index)
                            .cloned()
                            .ok_or_else(|| format!("Variant field {} out of bounds", index))
                    }
                    _ => Err(format!("VariantField on non-sum type: {:?}", parent_ty)),
                }
            }

            AccessPath::StructField(parent, field_name) => {
                let parent_ty = self.resolve_path_type(scrutinee_ty, parent)?;
                match &parent_ty {
                    MirType::Struct(struct_name) => {
                        let fields = self.mir_struct_defs.get(struct_name).ok_or_else(|| {
                            format!("Unknown struct type '{}'", struct_name)
                        })?;
                        fields
                            .iter()
                            .find(|(n, _)| n == field_name)
                            .map(|(_, ty)| ty.clone())
                            .ok_or_else(|| {
                                format!("Field '{}' not found in struct '{}'", field_name, struct_name)
                            })
                    }
                    _ => Err(format!("StructField on non-struct type: {:?}", parent_ty)),
                }
            }

            AccessPath::ListHead(_parent) => {
                // The type of list head is determined by the column_types
                // propagated through the pattern compiler. It's the element type.
                // Since we can't derive it from scrutinee_ty alone (MirType::Ptr),
                // we return the column type that was set during specialization.
                // This is handled by the leaf binding's type, so returning Ptr
                // is fine as a fallback -- the real type comes from the binding.
                // For the navigate_access_path_ptr path, we use the elem_ty from
                // the ListDecons node.
                //
                // The actual type will be resolved from the binding's MirType.
                // For navigate purposes, the alloca is created with the right type.
                Ok(MirType::Int) // Fallback; real type from column_types in compile.rs
            }

            AccessPath::ListTail(_parent) => {
                // Tail of a list is always a list (Ptr at MIR level).
                Ok(MirType::Ptr)
            }
        }
    }
}

/// Returns true if a case arm binding value needs to be dereferenced.
///
/// This covers two cases:
/// 1. Struct/SumType bindings from generic `Result<Struct, String>` where the
///    Ok payload is a heap pointer (Ptr) but the target type is a struct.
/// 2. Opaque i64 handle types (DateTime, SqliteConn, etc.) lowered as
///    `MirType::Int` where the Ok payload is boxed via `alloc_result` as
///    `Box::into_raw(Box::new(i64))`. The extracted value is a Ptr to the i64;
///    we must dereference it to get the actual i64.
///
/// The guard conditions: the value IS a pointer, but the binding's LLVM type
/// is NOT a pointer, meaning a load is needed to get the true value.
fn should_deref_boxed_payload(
    ty: &MirType,
    val: &inkwell::values::BasicValueEnum<'_>,
    llvm_ty: &inkwell::types::BasicTypeEnum<'_>,
) -> bool {
    if !val.is_pointer_value() || llvm_ty.is_pointer_type() {
        return false;
    }
    matches!(
        ty,
        MirType::Struct(_) | MirType::SumType(_) | MirType::Int | MirType::Float | MirType::Bool
    )
}
