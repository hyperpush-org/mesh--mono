//! LSP textDocument/completion implementation for the Mesh language.
//!
//! Provides four tiers of code completions:
//! 1. **Keywords** -- all 49 Mesh keywords, filtered by typed prefix
//! 2. **Built-in types** -- common types (Int, Float, String, etc.)
//! 3. **Snippets** -- template expansions for common patterns (fn, let, struct, etc.)
//! 4. **Scope-aware names** -- variables, functions, and types visible at the cursor

use tower_lsp::lsp_types::*;

use mesh_parser::SyntaxKind;
use mesh_parser::SyntaxNode;

use crate::analysis::AnalysisResult;

/// All 49 Mesh keywords.
const KEYWORDS: &[&str] = &[
    "actor",
    "after",
    "alias",
    "and",
    "break",
    "call",
    "case",
    "cast",
    "cond",
    "continue",
    "def",
    "do",
    "else",
    "end",
    "false",
    "fn",
    "for",
    "if",
    "impl",
    "import",
    "in",
    "interface",
    "json",
    "let",
    "link",
    "match",
    "module",
    "monitor",
    "nil",
    "not",
    "or",
    "pub",
    "receive",
    "return",
    "self",
    "send",
    "service",
    "spawn",
    "struct",
    "supervisor",
    "terminate",
    "trait",
    "trap",
    "true",
    "type",
    "when",
    "where",
    "while",
    "with",
];

/// Built-in type names commonly used in Mesh.
const BUILTIN_TYPES: &[&str] = &[
    "Int", "Float", "String", "Bool", "List", "Map", "Set", "Option", "Result", "Queue", "Range",
    "Pid",
];

/// Snippet definitions: (label, snippet_body).
const SNIPPETS: &[(&str, &str)] = &[
    ("fn", "fn ${1:name}(${2:params}) do\n  ${0}\nend"),
    ("let", "let ${1:name} = ${0}"),
    ("struct", "struct ${1:Name} do\n  ${0}\nend"),
    ("case", "case ${1:expr} do\n  ${2:pattern} -> ${0}\nend"),
    ("for", "for ${1:item} in ${2:collection} do\n  ${0}\nend"),
    ("while", "while ${1:condition} do\n  ${0}\nend"),
    ("actor", "actor ${1:Name}(${2:state}) do\n  ${0}\nend"),
    ("interface", "interface ${1:Name} do\n  ${0}\nend"),
    ("impl", "impl ${1:Trait} for ${2:Type} do\n  ${0}\nend"),
    ("type", "type ${1:Alias} = ${0:ExistingType}"),
    ("json", "json {\n  ${1:key}: ${0:value}\n}"),
];

/// Compute completion items at the given position.
///
/// Combines all four completion tiers: keywords, built-in types, snippets,
/// and scope-aware names from CST traversal. Results are filtered by the
/// prefix the user has typed so far.
pub fn compute_completions(
    source: &str,
    analysis: &AnalysisResult,
    position: &Position,
) -> Vec<CompletionItem> {
    // Convert LSP position to source byte offset.
    let source_offset = match crate::analysis::position_to_offset_pub(source, position) {
        Some(o) => o,
        None => return Vec::new(),
    };

    // Extract the prefix by scanning backward from cursor to the last
    // non-identifier character. This avoids tree offset issues when cursor
    // is in whitespace.
    let prefix = extract_prefix(source, source_offset);

    let mut items = Vec::new();

    // Tier 1: Keyword completions.
    for &kw in KEYWORDS {
        if prefix.is_empty() || kw.starts_with(&prefix) {
            items.push(CompletionItem {
                label: kw.to_string(),
                kind: Some(CompletionItemKind::KEYWORD),
                sort_text: Some(format!("2_{}", kw)),
                ..Default::default()
            });
        }
    }

    // Tier 2: Built-in type completions.
    for &ty in BUILTIN_TYPES {
        if prefix.is_empty() || ty.starts_with(&prefix) {
            items.push(CompletionItem {
                label: ty.to_string(),
                kind: Some(CompletionItemKind::STRUCT),
                sort_text: Some(format!("1_{}", ty)),
                ..Default::default()
            });
        }
    }

    // Tier 3: Snippet completions.
    for &(label, body) in SNIPPETS {
        if prefix.is_empty() || label.starts_with(&prefix) {
            items.push(CompletionItem {
                label: label.to_string(),
                kind: Some(CompletionItemKind::SNIPPET),
                insert_text: Some(body.to_string()),
                insert_text_format: Some(InsertTextFormat::SNIPPET),
                sort_text: Some(format!("3_{}", label)),
                ..Default::default()
            });
        }
    }

    // Tier 4: Scope-aware name completions from CST walk.
    let root = analysis.parse.syntax();
    let scope_names = collect_in_scope_names(source, &root, source_offset);
    for (name, kind) in scope_names {
        if prefix.is_empty() || name.starts_with(&prefix) {
            items.push(CompletionItem {
                label: name.clone(),
                kind: Some(kind),
                sort_text: Some(format!("0_{}", name)),
                ..Default::default()
            });
        }
    }

    items
}

/// Extract the identifier prefix being typed by scanning backward from
/// the cursor position.
///
/// Stops at the first character that is not alphanumeric or underscore.
/// Returns an empty string if the cursor is at the start of a line or
/// right after whitespace/punctuation.
fn extract_prefix(source: &str, offset: usize) -> String {
    let before = &source[..offset];
    let start = before
        .rfind(|c: char| !c.is_alphanumeric() && c != '_')
        .map(|i| i + 1)
        .unwrap_or(0);
    before[start..].to_string()
}

/// Collect all in-scope names visible at the given source byte offset.
///
/// Walks upward through the CST from the cursor position, collecting
/// names from let bindings, function definitions, parameters, and
/// top-level definitions. Inner-scope names shadow outer-scope names.
///
/// When the cursor is in whitespace or past the end of tokens (i.e.,
/// `source_to_tree_offset` returns None), falls back to collecting all
/// top-level names from SOURCE_FILE.
fn collect_in_scope_names(
    source: &str,
    root: &SyntaxNode,
    source_offset: usize,
) -> Vec<(String, CompletionItemKind)> {
    // Convert source offset to tree offset for CST traversal.
    let tree_offset = match crate::definition::source_to_tree_offset(source, source_offset) {
        Some(o) => o,
        None => {
            // Cursor is in whitespace or past the end. Collect all top-level
            // names from the root SOURCE_FILE node.
            let mut seen = std::collections::HashSet::new();
            let mut names = Vec::new();
            // Use a very large offset so all definitions are "before" cursor.
            let max_offset = rowan::TextSize::from(u32::MAX);
            collect_block_names(root, max_offset, true, &mut seen, &mut names);
            return names;
        }
    };

    let target = rowan::TextSize::from(tree_offset as u32);

    // Find the token at the cursor position.
    let token = match root.token_at_offset(target).right_biased() {
        Some(t) => t,
        None => return Vec::new(),
    };

    let mut seen_names = std::collections::HashSet::new();
    let mut names = Vec::new();
    let mut current = match token.parent() {
        Some(p) => p,
        None => return Vec::new(),
    };

    loop {
        match current.kind() {
            SyntaxKind::BLOCK | SyntaxKind::SOURCE_FILE => {
                let search_all = current.kind() == SyntaxKind::SOURCE_FILE;
                collect_block_names(&current, target, search_all, &mut seen_names, &mut names);
            }
            SyntaxKind::FN_DEF | SyntaxKind::CLOSURE_EXPR => {
                collect_param_names(&current, &mut seen_names, &mut names);
            }
            _ => {}
        }

        current = match current.parent() {
            Some(p) => p,
            None => break,
        };
    }

    names
}

/// Collect names from definitions in a block or source file.
///
/// For blocks, only includes definitions before the cursor position.
/// For SOURCE_FILE, includes all definitions (forward references allowed).
fn collect_block_names(
    block: &SyntaxNode,
    cursor_offset: rowan::TextSize,
    search_all: bool,
    seen: &mut std::collections::HashSet<String>,
    names: &mut Vec<(String, CompletionItemKind)>,
) {
    for child in block.children() {
        // Only consider definitions before the cursor (unless top-level).
        if !search_all && child.text_range().start() >= cursor_offset {
            break;
        }

        let (name, kind) = match child.kind() {
            SyntaxKind::LET_BINDING => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::VARIABLE)
                } else {
                    continue;
                }
            }
            SyntaxKind::FN_DEF => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::FUNCTION)
                } else {
                    continue;
                }
            }
            SyntaxKind::ACTOR_DEF | SyntaxKind::SERVICE_DEF => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::FUNCTION)
                } else {
                    continue;
                }
            }
            SyntaxKind::MODULE_DEF => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::MODULE)
                } else {
                    continue;
                }
            }
            SyntaxKind::STRUCT_DEF => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::STRUCT)
                } else {
                    continue;
                }
            }
            SyntaxKind::SUM_TYPE_DEF => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::ENUM)
                } else {
                    continue;
                }
            }
            SyntaxKind::INTERFACE_DEF => {
                if let Some(n) = name_child_text(&child) {
                    (n, CompletionItemKind::INTERFACE)
                } else {
                    continue;
                }
            }
            _ => continue,
        };

        // Deduplicate: inner-scope names shadow outer-scope names.
        if seen.insert(name.clone()) {
            names.push((name, kind));
        }
    }
}

/// Collect parameter names from a FN_DEF or CLOSURE_EXPR node.
fn collect_param_names(
    fn_node: &SyntaxNode,
    seen: &mut std::collections::HashSet<String>,
    names: &mut Vec<(String, CompletionItemKind)>,
) {
    for child in fn_node.children() {
        if child.kind() == SyntaxKind::PARAM_LIST {
            for param in child.children() {
                if param.kind() == SyntaxKind::PARAM {
                    // Extract the parameter name from IDENT token or NAME child.
                    if let Some(name) = param_name(&param) {
                        if seen.insert(name.clone()) {
                            names.push((name, CompletionItemKind::VARIABLE));
                        }
                    }
                }
            }
        }
    }
}

/// Extract the name text from a PARAM node.
///
/// Parameters may contain either a bare IDENT token or a NAME child node.
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

    /// Helper: compute completions for source at the given position.
    fn completions_at(source: &str, line: u32, character: u32) -> Vec<CompletionItem> {
        let analysis = crate::analysis::analyze_document("file:///test.mpl", source, &[]);
        let position = Position { line, character };
        compute_completions(source, &analysis, &position)
    }

    #[test]
    fn keyword_completion_prefix_filter() {
        // Typing "wh" should match "when", "where", "while" but not "fn" or "let".
        let source = "wh";
        let items = completions_at(source, 0, 2);

        let keyword_labels: Vec<&str> = items
            .iter()
            .filter(|i| i.kind == Some(CompletionItemKind::KEYWORD))
            .map(|i| i.label.as_str())
            .collect();

        assert!(
            keyword_labels.contains(&"when"),
            "should contain 'when', got: {:?}",
            keyword_labels
        );
        assert!(
            keyword_labels.contains(&"where"),
            "should contain 'where', got: {:?}",
            keyword_labels
        );
        assert!(
            keyword_labels.contains(&"while"),
            "should contain 'while', got: {:?}",
            keyword_labels
        );
        assert!(!keyword_labels.contains(&"fn"), "should not contain 'fn'");
        assert!(!keyword_labels.contains(&"let"), "should not contain 'let'");
    }

    #[test]
    fn builtin_type_completion() {
        // Typing "St" should match "String" but not "Int".
        let source = "St";
        let items = completions_at(source, 0, 2);

        let type_labels: Vec<&str> = items
            .iter()
            .filter(|i| i.kind == Some(CompletionItemKind::STRUCT))
            .map(|i| i.label.as_str())
            .collect();

        assert!(
            type_labels.contains(&"String"),
            "should contain 'String', got: {:?}",
            type_labels
        );
        assert!(
            !type_labels.contains(&"Int"),
            "should not contain 'Int', got: {:?}",
            type_labels
        );
    }

    #[test]
    fn scope_completion_finds_let_bindings() {
        // Parse "let x = 1\nlet y = 2\n" and verify both appear in scope completions at the end.
        let source = "let x = 1\nlet y = 2\n";
        // Position at end of the second line (line 2, char 0 -- empty line).
        let items = completions_at(source, 2, 0);

        let scope_labels: Vec<&str> = items
            .iter()
            .filter(|i| i.kind == Some(CompletionItemKind::VARIABLE))
            .map(|i| i.label.as_str())
            .collect();

        assert!(
            scope_labels.contains(&"x"),
            "should contain 'x', got: {:?}",
            scope_labels
        );
        assert!(
            scope_labels.contains(&"y"),
            "should contain 'y', got: {:?}",
            scope_labels
        );
    }

    #[test]
    fn scope_completion_finds_fn_params() {
        // Parse "fn add(a, b) do\n\nend" and verify "a" and "b" appear at line 1.
        let source = "fn add(a, b) do\n\nend";
        // Position inside the function body (line 1, char 0).
        let items = completions_at(source, 1, 0);

        let scope_labels: Vec<&str> = items
            .iter()
            .filter(|i| i.kind == Some(CompletionItemKind::VARIABLE))
            .map(|i| i.label.as_str())
            .collect();

        assert!(
            scope_labels.contains(&"a"),
            "should contain 'a', got: {:?}",
            scope_labels
        );
        assert!(
            scope_labels.contains(&"b"),
            "should contain 'b', got: {:?}",
            scope_labels
        );
    }

    #[test]
    fn snippet_completions_filtered_by_prefix() {
        // Typing "fo" should match the "for" snippet but not "while" or "fn".
        let source = "fo";
        let items = completions_at(source, 0, 2);

        let snippet_labels: Vec<&str> = items
            .iter()
            .filter(|i| i.kind == Some(CompletionItemKind::SNIPPET))
            .map(|i| i.label.as_str())
            .collect();

        assert!(
            snippet_labels.contains(&"for"),
            "should contain 'for' snippet, got: {:?}",
            snippet_labels
        );
        assert!(
            !snippet_labels.contains(&"while"),
            "should not contain 'while' snippet"
        );
    }

    #[test]
    fn empty_prefix_returns_all_completions() {
        // At the start of an empty document, all keywords, types, and snippets should appear.
        let source = "";
        let items = completions_at(source, 0, 0);

        // Should have all 49 keywords + 12 types + 11 snippets = 72 minimum.
        assert!(
            items.len() >= 72,
            "expected at least 72 completions for empty prefix, got {}",
            items.len()
        );
    }

    #[test]
    fn scope_completion_includes_fn_defs() {
        // Functions defined in the file should appear as FUNCTION completions.
        let source = "fn greet(name) do\nname\nend\n";
        let items = completions_at(source, 3, 0);

        let fn_labels: Vec<&str> = items
            .iter()
            .filter(|i| i.kind == Some(CompletionItemKind::FUNCTION))
            .map(|i| i.label.as_str())
            .collect();

        assert!(
            fn_labels.contains(&"greet"),
            "should contain 'greet' function, got: {:?}",
            fn_labels
        );
    }
}
