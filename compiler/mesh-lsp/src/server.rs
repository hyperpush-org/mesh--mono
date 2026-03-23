//! Tower-lsp Backend implementation for the Mesh language server.
//!
//! Implements the LSP `LanguageServer` trait with support for:
//! - textDocument/didOpen, didChange, didClose (diagnostics)
//! - textDocument/hover (type information)
//! - textDocument/definition (go-to-definition)
//! - textDocument/documentSymbol (Outline, Breadcrumbs, Go-to-Symbol)
//! - textDocument/completion (keyword, type, snippet, scope-aware completions)
//! - textDocument/signatureHelp (parameter info and active parameter tracking)
//! - Server capabilities advertisement

use std::collections::HashMap;
use std::sync::Mutex;

use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};

use mesh_parser::SyntaxKind;
use mesh_parser::SyntaxNode;

use crate::analysis::{self, AnalysisResult};

/// Per-document state stored in the server.
struct DocumentState {
    /// The latest source text.
    source: String,
    /// The latest analysis result.
    analysis: AnalysisResult,
}

/// The Mesh LSP server backend.
///
/// Holds a reference to the LSP client (for sending notifications like
/// diagnostics) and an in-memory document store keyed by URI.
pub struct MeshBackend {
    /// The LSP client used to send notifications (e.g., publishDiagnostics).
    client: Client,
    /// Document store: URI -> (source, analysis result).
    documents: Mutex<HashMap<String, DocumentState>>,
}

impl MeshBackend {
    /// Create a new Mesh LSP backend.
    pub fn new(client: Client) -> Self {
        Self {
            client,
            documents: Mutex::new(HashMap::new()),
        }
    }

    /// Analyze a document and publish diagnostics.
    async fn analyze_and_publish(&self, uri: Url, source: String) {
        let uri_str = uri.to_string();
        let open_documents = {
            let docs = self.documents.lock().unwrap();
            docs.iter()
                .map(|(doc_uri, state)| (doc_uri.clone(), state.source.clone()))
                .collect::<Vec<_>>()
        };
        let result = analysis::analyze_document(&uri_str, &source, &open_documents);
        let diagnostics = result.diagnostics.clone();

        // Store document state for hover queries.
        {
            let mut docs = self.documents.lock().unwrap();
            docs.insert(
                uri_str,
                DocumentState {
                    source,
                    analysis: result,
                },
            );
        }

        // Publish diagnostics to the client.
        self.client
            .publish_diagnostics(uri, diagnostics, None)
            .await;
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for MeshBackend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                document_symbol_provider: Some(OneOf::Left(true)),
                document_formatting_provider: Some(OneOf::Left(true)),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: None,
                    resolve_provider: Some(false),
                    ..Default::default()
                }),
                signature_help_provider: Some(SignatureHelpOptions {
                    trigger_characters: Some(vec!["(".to_string(), ",".to_string()]),
                    retrigger_characters: None,
                    work_done_progress_options: Default::default(),
                }),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Mesh LSP server initialized")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri;
        let source = params.text_document.text;
        self.analyze_and_publish(uri, source).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri;
        // We use TextDocumentSyncKind::FULL, so the first content change
        // contains the entire document.
        if let Some(change) = params.content_changes.into_iter().next() {
            self.analyze_and_publish(uri, change.text).await;
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        let uri_str = params.text_document.uri.to_string();

        // Remove document from store.
        {
            let mut docs = self.documents.lock().unwrap();
            docs.remove(&uri_str);
        }

        // Clear diagnostics for the closed document.
        self.client
            .publish_diagnostics(params.text_document.uri, vec![], None)
            .await;
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri_str = params
            .text_document_position_params
            .text_document
            .uri
            .to_string();
        let position = params.text_document_position_params.position;

        let docs = self.documents.lock().unwrap();
        let doc = match docs.get(&uri_str) {
            Some(doc) => doc,
            None => return Ok(None),
        };

        let type_info = analysis::type_at_position(&doc.source, &doc.analysis.typeck, &position);

        match type_info {
            Some(ty_str) => Ok(Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: format!("```mesh\n{}\n```", ty_str),
                }),
                range: None,
            })),
            None => Ok(None),
        }
    }

    async fn goto_definition(
        &self,
        params: GotoDefinitionParams,
    ) -> Result<Option<GotoDefinitionResponse>> {
        let uri = params
            .text_document_position_params
            .text_document
            .uri
            .clone();
        let uri_str = uri.to_string();
        let position = params.text_document_position_params.position;

        let docs = self.documents.lock().unwrap();
        let doc = match docs.get(&uri_str) {
            Some(doc) => doc,
            None => return Ok(None),
        };

        // Convert LSP position to byte offset.
        let offset = match analysis::position_to_offset_pub(&doc.source, &position) {
            Some(o) => o,
            None => return Ok(None),
        };

        // Traverse the CST to find the definition.
        let root = doc.analysis.parse.syntax();
        let def_range = match crate::definition::find_definition(&doc.source, &root, offset) {
            Some(r) => r,
            None => return Ok(None),
        };

        // Convert the definition range (in rowan tree coordinates) back to
        // source byte offsets, then to LSP positions.
        let start_tree: usize = def_range.start().into();
        let end_tree: usize = def_range.end().into();
        let start_source =
            crate::definition::tree_to_source_offset(&doc.source, start_tree).unwrap_or(start_tree);
        let end_source =
            crate::definition::tree_to_source_offset(&doc.source, end_tree).unwrap_or(end_tree);
        let start = analysis::offset_to_position(&doc.source, start_source);
        let end = analysis::offset_to_position(&doc.source, end_source);

        let location = Location {
            uri,
            range: Range::new(start, end),
        };

        Ok(Some(GotoDefinitionResponse::Scalar(location)))
    }

    async fn document_symbol(
        &self,
        params: DocumentSymbolParams,
    ) -> Result<Option<DocumentSymbolResponse>> {
        let uri_str = params.text_document.uri.to_string();

        let docs = self.documents.lock().unwrap();
        let doc = match docs.get(&uri_str) {
            Some(doc) => doc,
            None => return Ok(None),
        };

        let root = doc.analysis.parse.syntax();
        let symbols = collect_symbols(&doc.source, &root);

        Ok(Some(DocumentSymbolResponse::Nested(symbols)))
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri_str = params.text_document_position.text_document.uri.to_string();
        let position = params.text_document_position.position;

        let docs = self.documents.lock().unwrap();
        let doc = match docs.get(&uri_str) {
            Some(doc) => doc,
            None => return Ok(None),
        };

        let items = crate::completion::compute_completions(&doc.source, &doc.analysis, &position);

        if items.is_empty() {
            Ok(None)
        } else {
            Ok(Some(CompletionResponse::Array(items)))
        }
    }

    async fn signature_help(&self, params: SignatureHelpParams) -> Result<Option<SignatureHelp>> {
        let uri_str = params
            .text_document_position_params
            .text_document
            .uri
            .to_string();
        let position = params.text_document_position_params.position;

        let docs = self.documents.lock().unwrap();
        let doc = match docs.get(&uri_str) {
            Some(doc) => doc,
            None => return Ok(None),
        };

        Ok(crate::signature_help::compute_signature_help(
            &doc.source,
            &doc.analysis,
            &position,
        ))
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
        let uri_str = params.text_document.uri.to_string();
        let docs = self.documents.lock().unwrap();
        let doc = match docs.get(&uri_str) {
            Some(doc) => doc,
            None => return Ok(None),
        };

        let config = mesh_fmt::FormatConfig {
            indent_size: params.options.tab_size as usize,
            ..Default::default()
        };
        let formatted = mesh_fmt::format_source(&doc.source, &config);

        if formatted == doc.source {
            return Ok(None);
        }

        // Full-document replacement: single TextEdit covering entire document.
        let line_count = doc.source.lines().count() as u32;
        let last_line_len = doc.source.lines().last().map_or(0, |l| l.len()) as u32;
        Ok(Some(vec![TextEdit {
            range: Range::new(
                Position::new(0, 0),
                Position::new(line_count, last_line_len),
            ),
            new_text: formatted,
        }]))
    }
}

/// Walk CST children and collect document symbols for the Outline panel.
///
/// Recursively descends into container nodes (modules, actors, services,
/// interfaces, impls) to produce a hierarchical symbol tree.
fn collect_symbols(source: &str, node: &SyntaxNode) -> Vec<DocumentSymbol> {
    let mut symbols = Vec::new();

    for child in node.children() {
        match child.kind() {
            SyntaxKind::FN_DEF => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::FUNCTION, None) {
                    symbols.push(sym);
                }
            }
            SyntaxKind::STRUCT_DEF => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::STRUCT, None) {
                    symbols.push(sym);
                }
            }
            SyntaxKind::MODULE_DEF => {
                if let Some(mut sym) = make_symbol(source, &child, SymbolKind::MODULE, None) {
                    let block = child.children().find(|n| n.kind() == SyntaxKind::BLOCK);
                    if let Some(block) = block {
                        let children = collect_symbols(source, &block);
                        if !children.is_empty() {
                            sym.children = Some(children);
                        }
                    }
                    symbols.push(sym);
                }
            }
            SyntaxKind::ACTOR_DEF => {
                if let Some(mut sym) = make_symbol(source, &child, SymbolKind::CLASS, None) {
                    let block = child.children().find(|n| n.kind() == SyntaxKind::BLOCK);
                    if let Some(block) = block {
                        let children = collect_symbols(source, &block);
                        if !children.is_empty() {
                            sym.children = Some(children);
                        }
                    }
                    symbols.push(sym);
                }
            }
            SyntaxKind::SERVICE_DEF => {
                if let Some(mut sym) = make_symbol(source, &child, SymbolKind::CLASS, None) {
                    let block = child.children().find(|n| n.kind() == SyntaxKind::BLOCK);
                    if let Some(block) = block {
                        let children = collect_symbols(source, &block);
                        if !children.is_empty() {
                            sym.children = Some(children);
                        }
                    }
                    symbols.push(sym);
                }
            }
            SyntaxKind::SUPERVISOR_DEF => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::CLASS, None) {
                    symbols.push(sym);
                }
            }
            SyntaxKind::INTERFACE_DEF => {
                if let Some(mut sym) = make_symbol(source, &child, SymbolKind::INTERFACE, None) {
                    // Collect interface methods as child symbols.
                    let mut method_symbols = Vec::new();
                    for method in child.children() {
                        if method.kind() == SyntaxKind::INTERFACE_METHOD {
                            if let Some(msym) =
                                make_symbol(source, &method, SymbolKind::FUNCTION, None)
                            {
                                method_symbols.push(msym);
                            }
                        }
                    }
                    if !method_symbols.is_empty() {
                        sym.children = Some(method_symbols);
                    }
                    symbols.push(sym);
                }
            }
            SyntaxKind::IMPL_DEF => {
                // IMPL_DEF has no NAME child; extract name from PATH child.
                let impl_name = extract_impl_name(&child);
                let sel_node = child.children().find(|n| n.kind() == SyntaxKind::PATH);
                if let Some(mut sym) = make_symbol(
                    source,
                    &child,
                    SymbolKind::OBJECT,
                    Some((&impl_name, sel_node.as_ref())),
                ) {
                    let block = child.children().find(|n| n.kind() == SyntaxKind::BLOCK);
                    if let Some(block) = block {
                        let children = collect_symbols(source, &block);
                        if !children.is_empty() {
                            sym.children = Some(children);
                        }
                    }
                    symbols.push(sym);
                }
            }
            SyntaxKind::LET_BINDING => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::VARIABLE, None) {
                    symbols.push(sym);
                }
            }
            SyntaxKind::SUM_TYPE_DEF => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::ENUM, None) {
                    symbols.push(sym);
                }
            }
            SyntaxKind::TYPE_ALIAS_DEF => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::TYPE_PARAMETER, None) {
                    symbols.push(sym);
                }
            }
            // Also handle fn defs and call/cast handlers inside service blocks.
            SyntaxKind::CALL_HANDLER => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::FUNCTION, None) {
                    symbols.push(sym);
                }
            }
            SyntaxKind::CAST_HANDLER => {
                if let Some(sym) = make_symbol(source, &child, SymbolKind::FUNCTION, None) {
                    symbols.push(sym);
                }
            }
            _ => {}
        }
    }

    symbols
}

/// Extract a display name for an IMPL_DEF node.
///
/// Returns "impl TraitName" by reading the first IDENT from the first PATH child.
fn extract_impl_name(node: &SyntaxNode) -> String {
    for child in node.children() {
        if child.kind() == SyntaxKind::PATH {
            // Get the first IDENT token from the PATH.
            for token in child.children_with_tokens() {
                if let rowan::NodeOrToken::Token(t) = token {
                    if t.kind() == SyntaxKind::IDENT {
                        return format!("impl {}", t.text());
                    }
                }
            }
        }
    }
    "impl".to_string()
}

/// Construct a `DocumentSymbol` from a CST node.
///
/// Computes the full range (entire definition) and selection range (name only)
/// using the rowan-to-source offset conversion chain.
///
/// The `override_name` parameter allows callers (e.g., for IMPL_DEF) to provide
/// a custom name and an alternative node for the selection range.
fn make_symbol(
    source: &str,
    node: &SyntaxNode,
    kind: SymbolKind,
    override_name: Option<(&str, Option<&SyntaxNode>)>,
) -> Option<DocumentSymbol> {
    let (name, sel_range_node) = match override_name {
        Some((n, sel_node)) => (n.to_string(), sel_node),
        None => {
            // Find the NAME child and extract the IDENT token text.
            let name_text = node
                .children()
                .find(|n| n.kind() == SyntaxKind::NAME)
                .and_then(|name_node| {
                    name_node
                        .children_with_tokens()
                        .filter_map(|it| it.into_token())
                        .find(|t| t.kind() == SyntaxKind::IDENT)
                        .map(|t| t.text().to_string())
                })?;
            (name_text, None)
        }
    };

    // Compute the full range of the node.
    let node_range = node.text_range();
    let range_start_tree: usize = node_range.start().into();
    let range_end_tree: usize = node_range.end().into();
    let range_start_source = crate::definition::tree_to_source_offset(source, range_start_tree)?;
    let range_end_source = crate::definition::tree_to_source_offset(source, range_end_tree)?;

    let range = Range::new(
        analysis::offset_to_position(source, range_start_source),
        analysis::offset_to_position(source, range_end_source),
    );

    // Compute the selection range (name identifier only).
    let selection_range = if let Some(sel_node) = sel_range_node {
        // Use the provided node (e.g., PATH for IMPL_DEF).
        let sel_text_range = sel_node.text_range();
        let sel_start_tree: usize = sel_text_range.start().into();
        let sel_end_tree: usize = sel_text_range.end().into();
        let sel_start_source = crate::definition::tree_to_source_offset(source, sel_start_tree)?;
        let sel_end_source = crate::definition::tree_to_source_offset(source, sel_end_tree)?;
        Range::new(
            analysis::offset_to_position(source, sel_start_source),
            analysis::offset_to_position(source, sel_end_source),
        )
    } else {
        // Find the NAME child for selection range.
        let name_node = node.children().find(|n| n.kind() == SyntaxKind::NAME)?;
        let name_text_range = name_node.text_range();
        let sel_start_tree: usize = name_text_range.start().into();
        let sel_end_tree: usize = name_text_range.end().into();
        let sel_start_source = crate::definition::tree_to_source_offset(source, sel_start_tree)?;
        let sel_end_source = crate::definition::tree_to_source_offset(source, sel_end_tree)?;
        Range::new(
            analysis::offset_to_position(source, sel_start_source),
            analysis::offset_to_position(source, sel_end_source),
        )
    };

    #[allow(deprecated)] // `deprecated` field is deprecated but required by the struct
    Some(DocumentSymbol {
        name,
        detail: None,
        kind,
        tags: None,
        deprecated: None,
        range,
        selection_range,
        children: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify that the server advertises the expected capabilities.
    #[tokio::test]
    async fn server_capabilities() {
        let (service, _) = tower_lsp::LspService::new(|client| MeshBackend::new(client));
        let server = service.inner();
        let result = server
            .initialize(InitializeParams::default())
            .await
            .unwrap();

        let caps = result.capabilities;
        assert!(caps.hover_provider.is_some());
        assert!(caps.text_document_sync.is_some());
        assert!(caps.document_symbol_provider.is_some());
        assert!(caps.completion_provider.is_some());
        assert!(caps.signature_help_provider.is_some());
        assert!(caps.document_formatting_provider.is_some());
    }
}
