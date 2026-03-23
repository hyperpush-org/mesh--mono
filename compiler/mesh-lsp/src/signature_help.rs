//! LSP textDocument/signatureHelp implementation for the Mesh language.
//!
//! Provides parameter information and active parameter highlighting when the
//! cursor is inside function call parentheses. Detects the enclosing CALL_EXPR,
//! counts commas for the active parameter index, resolves the callee's type
//! from the TypeckResult, and extracts parameter names from the CST.

use tower_lsp::lsp_types::*;

use mesh_parser::SyntaxKind;
use mesh_parser::SyntaxNode;
use mesh_typeck::ty::Ty;

use crate::analysis::AnalysisResult;

/// Compute signature help at the given LSP position.
///
/// Returns `Some(SignatureHelp)` when the cursor is inside function call
/// parentheses, with the active parameter index set based on comma counting.
/// Returns `None` if the cursor is not inside a call expression or the
/// callee's type cannot be resolved.
pub fn compute_signature_help(
    source: &str,
    analysis: &AnalysisResult,
    position: &Position,
) -> Option<SignatureHelp> {
    // Step 1: Position conversion.
    let source_offset = crate::analysis::position_to_offset_pub(source, position)?;
    let tree_offset = crate::definition::source_to_tree_offset(source, source_offset)?;
    let target = rowan::TextSize::from(tree_offset as u32);

    let root = analysis.parse.syntax();

    // Step 2: Find enclosing CALL_EXPR via ARG_LIST walk.
    let token = root.token_at_offset(target).right_biased()?;
    let start_node = token.parent()?;
    let (call_expr, arg_list, active_parameter) = find_enclosing_call(&start_node, target)?;

    // Step 4: Extract callee name.
    let callee_name = extract_callee_name(&call_expr, &arg_list)?;

    // Step 5: Look up function type from TypeckResult.
    let fn_type = resolve_callee_type(&callee_name, &call_expr, &analysis.typeck)?;

    // Steps 6-7: Build SignatureInformation.
    let sig_info = build_signature_info(&root, &callee_name, &fn_type)?;

    Some(SignatureHelp {
        signatures: vec![sig_info],
        active_signature: Some(0),
        active_parameter: Some(active_parameter),
    })
}

/// Walk upward from a node to find the innermost enclosing CALL_EXPR.
///
/// Returns the CALL_EXPR node, the ARG_LIST node, and the active parameter
/// index (number of commas before the cursor in the ARG_LIST).
fn find_enclosing_call(
    start: &SyntaxNode,
    cursor_offset: rowan::TextSize,
) -> Option<(SyntaxNode, SyntaxNode, u32)> {
    let mut node = start.clone();

    loop {
        if node.kind() == SyntaxKind::ARG_LIST {
            // Found an arg list -- check that parent is a CALL_EXPR.
            if let Some(parent) = node.parent() {
                if parent.kind() == SyntaxKind::CALL_EXPR {
                    // Count commas before the cursor within this ARG_LIST.
                    let mut comma_count = 0u32;
                    for child_or_tok in node.children_with_tokens() {
                        if let rowan::NodeOrToken::Token(t) = child_or_tok {
                            if t.kind() == SyntaxKind::COMMA
                                && t.text_range().end() <= cursor_offset
                            {
                                comma_count += 1;
                            }
                        }
                    }

                    return Some((parent, node, comma_count));
                }
            }
        }

        node = node.parent()?;
    }
}

/// Extract the callee name from a CALL_EXPR node.
///
/// Handles simple calls (`add(x, y)`), qualified calls (`Module.func(x)`),
/// and method-style calls (`expr.method(args)`).
fn extract_callee_name(call_expr: &SyntaxNode, arg_list: &SyntaxNode) -> Option<String> {
    let arg_list_range = arg_list.text_range();

    // The callee is the child of CALL_EXPR that is NOT the ARG_LIST.
    for child in call_expr.children() {
        if child.text_range() == arg_list_range {
            continue;
        }

        match child.kind() {
            SyntaxKind::NAME_REF => {
                // Simple call: `add(x, y)` -- NAME_REF contains the IDENT.
                return first_ident_text(&child);
            }
            SyntaxKind::FIELD_ACCESS => {
                // Qualified call: `Module.func(x)` or method call: `expr.method(args)`.
                // Extract the method/function name from the NAME child.
                let name_part = child
                    .children()
                    .find(|n| n.kind() == SyntaxKind::NAME)
                    .and_then(|n| first_ident_text(&n));

                let base_part = child
                    .children()
                    .find(|n| n.kind() == SyntaxKind::NAME_REF)
                    .and_then(|n| first_ident_text(&n));

                match (base_part, name_part) {
                    (Some(base), Some(name)) => {
                        return Some(format!("{}.{}", base, name));
                    }
                    (_, Some(name)) => {
                        return Some(name);
                    }
                    _ => {}
                }
            }
            _ => {
                // Try to extract an IDENT token directly from this node.
                if let Some(name) = first_ident_text(&child) {
                    return Some(name);
                }
            }
        }
    }

    None
}

/// Resolve the callee's function type from the TypeckResult.
///
/// Tries multiple strategies:
/// A. Look up the callee node's text range directly.
/// B. Look up NAME_REF/FIELD_ACCESS children of the CALL_EXPR.
/// C. Iterate all entries looking for a Ty::Fun matching the callee range.
fn resolve_callee_type(
    _callee_name: &str,
    call_expr: &SyntaxNode,
    typeck: &mesh_typeck::TypeckResult,
) -> Option<Ty> {
    let arg_list_range = call_expr
        .children()
        .find(|n| n.kind() == SyntaxKind::ARG_LIST)
        .map(|n| n.text_range());

    // Strategy A: Look up the callee (non-ARG_LIST child) range directly.
    for child in call_expr.children() {
        if let Some(al_range) = arg_list_range {
            if child.text_range() == al_range {
                continue;
            }
        }
        if let Some(ty) = typeck.types.get(&child.text_range()) {
            if matches!(ty, Ty::Fun(_, _)) {
                return Some(ty.clone());
            }
        }
    }

    // Strategy B: Search NAME_REF / FIELD_ACCESS children and their sub-nodes.
    for child in call_expr.children() {
        match child.kind() {
            SyntaxKind::NAME_REF | SyntaxKind::FIELD_ACCESS => {
                // Try the child itself.
                if let Some(ty) = typeck.types.get(&child.text_range()) {
                    if matches!(ty, Ty::Fun(_, _)) {
                        return Some(ty.clone());
                    }
                }
                // Try sub-children.
                for sub in child.children() {
                    if let Some(ty) = typeck.types.get(&sub.text_range()) {
                        if matches!(ty, Ty::Fun(_, _)) {
                            return Some(ty.clone());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Strategy C: Iterate all entries for a Ty::Fun overlapping the callee range.
    let call_range = call_expr.text_range();
    for (range, ty) in &typeck.types {
        if matches!(ty, Ty::Fun(_, _)) && call_range.contains_range(*range) {
            // Make sure it's not the call result range itself.
            if *range != call_range {
                return Some(ty.clone());
            }
        }
    }

    None
}

/// Find parameter names for a user-defined function from the CST.
///
/// Searches the SOURCE_FILE for a FN_DEF with a matching NAME, then extracts
/// parameter names from its PARAM_LIST -> PARAM children.
fn find_fn_def_param_names(root: &SyntaxNode, callee_name: &str) -> Option<Vec<String>> {
    // For qualified names like "Module.func", use the last segment.
    let fn_name = callee_name.rsplit('.').next().unwrap_or(callee_name);

    // Search top-level functions.
    for child in root.children() {
        if child.kind() == SyntaxKind::FN_DEF {
            if name_child_text(&child).as_deref() == Some(fn_name) {
                return Some(extract_param_names(&child));
            }
        }
        // Also search inside MODULE_DEF blocks.
        if child.kind() == SyntaxKind::MODULE_DEF {
            for module_child in child.children() {
                if module_child.kind() == SyntaxKind::BLOCK {
                    for block_child in module_child.children() {
                        if block_child.kind() == SyntaxKind::FN_DEF {
                            if name_child_text(&block_child).as_deref() == Some(fn_name) {
                                return Some(extract_param_names(&block_child));
                            }
                        }
                    }
                }
                // Direct children of MODULE_DEF (not in BLOCK).
                if module_child.kind() == SyntaxKind::FN_DEF {
                    if name_child_text(&module_child).as_deref() == Some(fn_name) {
                        return Some(extract_param_names(&module_child));
                    }
                }
            }
        }
    }

    None
}

/// Extract parameter names from a FN_DEF node.
fn extract_param_names(fn_def: &SyntaxNode) -> Vec<String> {
    let mut names = Vec::new();
    for child in fn_def.children() {
        if child.kind() == SyntaxKind::PARAM_LIST {
            for param in child.children() {
                if param.kind() == SyntaxKind::PARAM {
                    if let Some(name) = param_name(&param) {
                        names.push(name);
                    }
                }
            }
        }
    }
    names
}

/// Extract the name from a PARAM node.
fn param_name(param: &SyntaxNode) -> Option<String> {
    for token_or_node in param.children_with_tokens() {
        match token_or_node {
            rowan::NodeOrToken::Token(t) if t.kind() == SyntaxKind::IDENT => {
                return Some(t.text().to_string());
            }
            rowan::NodeOrToken::Node(n) if n.kind() == SyntaxKind::NAME => {
                return first_ident_text(&n);
            }
            _ => {}
        }
    }
    None
}

/// Build the SignatureInformation from the function type and optional param names.
fn build_signature_info(
    root: &SyntaxNode,
    callee_name: &str,
    fn_type: &Ty,
) -> Option<SignatureInformation> {
    match fn_type {
        Ty::Fun(params, ret) => {
            let param_names = find_fn_def_param_names(root, callee_name);

            let param_infos: Vec<ParameterInformation> = params
                .iter()
                .enumerate()
                .map(|(i, ty)| {
                    let label = match param_names.as_ref().and_then(|names| names.get(i)) {
                        Some(name) => format!("{}: {}", name, ty),
                        None => format!("{}", ty),
                    };
                    ParameterInformation {
                        label: ParameterLabel::Simple(label),
                        documentation: None,
                    }
                })
                .collect();

            let param_labels: Vec<String> = param_infos
                .iter()
                .map(|p| match &p.label {
                    ParameterLabel::Simple(s) => s.clone(),
                    _ => String::new(),
                })
                .collect();

            let label = format!("{}({}) -> {}", callee_name, param_labels.join(", "), ret,);

            Some(SignatureInformation {
                label,
                documentation: None,
                parameters: Some(param_infos),
                active_parameter: None,
            })
        }
        _ => None,
    }
}

/// Get the text of the NAME child of a definition node.
fn name_child_text(node: &SyntaxNode) -> Option<String> {
    for child in node.children() {
        if child.kind() == SyntaxKind::NAME {
            return first_ident_text(&child);
        }
    }
    None
}

/// Get the text of the first IDENT token in a node.
fn first_ident_text(node: &SyntaxNode) -> Option<String> {
    for token in node.children_with_tokens() {
        if let rowan::NodeOrToken::Token(t) = token {
            if t.kind() == SyntaxKind::IDENT {
                return Some(t.text().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower_lsp::lsp_types::Position;

    /// Helper: compute signature help for source at the given position.
    fn sig_help_at(source: &str, line: u32, character: u32) -> Option<SignatureHelp> {
        let analysis = crate::analysis::analyze_document("file:///test.mpl", source, &[]);
        let position = Position { line, character };
        compute_signature_help(source, &analysis, &position)
    }

    #[test]
    fn signature_help_simple_call() {
        // fn add(a, b) do a + b end\nlet x = add(1, 2)
        let source = "fn add(a, b) do\na + b\nend\nlet x = add(1, 2)";
        // Cursor inside add(1, 2) -- after the opening paren.
        // "let x = add(" starts at line 3, "add(" -> character 8+4 = 12.
        // Position: line 3, character 12 -> inside the call at the `1`.
        let result = sig_help_at(source, 3, 12);
        assert!(
            result.is_some(),
            "Should return signature help inside add(1, 2)"
        );
        let help = result.unwrap();
        assert_eq!(help.signatures.len(), 1);
        let sig = &help.signatures[0];
        assert!(sig.parameters.is_some());
        let params = sig.parameters.as_ref().unwrap();
        assert_eq!(params.len(), 2, "add has 2 parameters");
    }

    #[test]
    fn signature_help_active_parameter_after_comma() {
        // fn add(a, b) do a + b end\nlet x = add(1, )
        let source = "fn add(a, b) do\na + b\nend\nlet x = add(1, )";
        // Cursor after the comma, at the space before ')'.
        // "let x = add(1, )" -- comma is at character 14, cursor at 15.
        let result = sig_help_at(source, 3, 15);
        assert!(result.is_some(), "Should return signature help after comma");
        let help = result.unwrap();
        assert_eq!(
            help.active_parameter,
            Some(1),
            "Active parameter should be 1 after first comma"
        );
    }

    #[test]
    fn signature_help_no_call() {
        // No function call -- cursor at a simple let binding.
        let source = "let x = 42";
        let result = sig_help_at(source, 0, 5);
        assert!(
            result.is_none(),
            "Should return None when not inside a function call"
        );
    }

    #[test]
    fn signature_help_first_parameter() {
        // fn greet(name) do name end\nlet x = greet()
        let source = "fn greet(name) do\nname\nend\nlet x = greet()";
        // Cursor right after '(' in greet() -- character 13.
        let result = sig_help_at(source, 3, 14);
        assert!(
            result.is_some(),
            "Should return signature help inside greet()"
        );
        let help = result.unwrap();
        assert_eq!(
            help.active_parameter,
            Some(0),
            "Active parameter should be 0 right after opening paren"
        );
        let sig = &help.signatures[0];
        let params = sig.parameters.as_ref().unwrap();
        assert_eq!(params.len(), 1, "greet has 1 parameter");
    }

    #[test]
    fn signature_help_has_parameter_names() {
        // Verify that parameter labels include the name from the FN_DEF.
        let source = "fn add(a, b) do\na + b\nend\nlet x = add(1, 2)";
        let result = sig_help_at(source, 3, 12);
        assert!(result.is_some());
        let help = result.unwrap();
        let sig = &help.signatures[0];
        let params = sig.parameters.as_ref().unwrap();
        // The first parameter label should contain "a".
        let first_label = match &params[0].label {
            ParameterLabel::Simple(s) => s.clone(),
            _ => String::new(),
        };
        assert!(
            first_label.contains("a"),
            "First parameter label should contain 'a', got: {}",
            first_label
        );
    }
}
