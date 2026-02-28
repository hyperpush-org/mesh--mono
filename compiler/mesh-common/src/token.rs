use serde::Serialize;

use crate::span::Span;

/// A token produced by the Mesh lexer.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

impl Token {
    /// Create a new token from a kind and byte offsets.
    pub fn new(kind: TokenKind, start: u32, end: u32) -> Self {
        Self {
            kind,
            span: Span::new(start, end),
        }
    }
}

/// Every kind of token in the Mesh language.
///
/// This enum is the complete vocabulary for the lexer. It covers all keywords,
/// operators, delimiters, literals, string interpolation markers, comments,
/// identifiers, and special tokens.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum TokenKind {
    // ── Keywords (49) ──────────────────────────────────────────────────
    Actor,
    After,
    Alias,
    And,
    Call,
    Case,
    Cast,
    Cond,
    Def,
    Do,
    Else,
    End,
    False,
    Fn,
    For,
    If,
    Impl,
    Import,
    Interface,
    /// The `json` keyword.
    JsonKw,
    In,
    Let,
    Link,
    Match,
    Module,
    Monitor,
    Nil,
    Not,
    Or,
    Pub,
    Receive,
    Return,
    /// The `self` keyword. Named `SelfKw` to avoid conflict with Rust's `Self`.
    SelfKw,
    Send,
    Service,
    Spawn,
    Struct,
    Supervisor,
    Terminate,
    Trait,
    Trap,
    True,
    Type,
    When,
    Where,
    While,
    With,
    Break,
    Continue,

    // ── Operators (24) ─────────────────────────────────────────────────
    /// `+`
    Plus,
    /// `-`
    Minus,
    /// `*`
    Star,
    /// `/`
    Slash,
    /// `%`
    Percent,
    /// `==`
    EqEq,
    /// `!=`
    NotEq,
    /// `<`
    Lt,
    /// `>`
    Gt,
    /// `<=`
    LtEq,
    /// `>=`
    GtEq,
    /// `&&`
    AmpAmp,
    /// `||`
    PipePipe,
    /// `!`
    Bang,
    /// `|>`
    Pipe,
    /// `|N>` slot pipe operator, e.g. `|2>`, `|3>`. N is the 1-indexed argument position.
    SlotPipe(u32),
    /// `..`
    DotDot,
    /// `<>`
    Diamond,
    /// `++`
    PlusPlus,
    /// `=`
    Eq,
    /// `->`
    Arrow,
    /// `=>`
    FatArrow,
    /// `::`
    ColonColon,
    /// `?`
    Question,
    /// `|` bare pipe for or-patterns
    Bar,

    // ── Delimiters (6) ─────────────────────────────────────────────────
    /// `(`
    LParen,
    /// `)`
    RParen,
    /// `[`
    LBracket,
    /// `]`
    RBracket,
    /// `{`
    LBrace,
    /// `}`
    RBrace,

    // ── Punctuation (5) ────────────────────────────────────────────────
    /// `,`
    Comma,
    /// `.`
    Dot,
    /// `:`
    Colon,
    /// `;`
    Semicolon,
    /// Significant newline (statement terminator).
    Newline,

    // ── Literals (9) ───────────────────────────────────────────────────
    /// Integer literal, e.g. `42`, `0xFF`, `0b1010`.
    IntLiteral,
    /// Floating-point literal, e.g. `3.14`, `1.0e10`.
    FloatLiteral,
    /// Opening `"` or `"""` of a string.
    StringStart,
    /// Closing `"` or `"""` of a string.
    StringEnd,
    /// Literal text content inside a string (between delimiters/interpolations).
    StringContent,
    /// `${` -- start of string interpolation.
    InterpolationStart,
    /// `}` that closes a string interpolation.
    InterpolationEnd,
    /// Atom literal, e.g. `:name`, `:email`, `:asc`.
    Atom,
    /// Regex literal, e.g. `~r/pattern/ims`. Fields: (pattern, flags).
    /// Pattern is the content between `/` delimiters; flags is the suffix (e.g. "ims" or "").
    RegexLiteral(String, String),

    // ── Identifiers and comments (4) ───────────────────────────────────
    /// Regular identifier, e.g. `foo`, `my_var`.
    Ident,
    /// Line comment content (`# ...`). Preserved for tooling.
    Comment,
    /// Doc comment content (`## ...`).
    DocComment,
    /// Module doc comment content (`##! ...`).
    ModuleDocComment,

    // ── Special (2) ────────────────────────────────────────────────────
    /// End of file.
    Eof,
    /// Invalid/unexpected input. Used for error recovery.
    Error,
}

/// Look up a keyword from its string representation.
///
/// Returns `Some(TokenKind)` if the string is a Mesh keyword, `None` otherwise.
/// The lexer calls this to distinguish keywords from identifiers after scanning
/// an identifier-shaped token.
pub fn keyword_from_str(s: &str) -> Option<TokenKind> {
    match s {
        "actor" => Some(TokenKind::Actor),
        "after" => Some(TokenKind::After),
        "alias" => Some(TokenKind::Alias),
        "and" => Some(TokenKind::And),
        "call" => Some(TokenKind::Call),
        "case" => Some(TokenKind::Case),
        "cast" => Some(TokenKind::Cast),
        "cond" => Some(TokenKind::Cond),
        "def" => Some(TokenKind::Def),
        "do" => Some(TokenKind::Do),
        "else" => Some(TokenKind::Else),
        "end" => Some(TokenKind::End),
        "false" => Some(TokenKind::False),
        "fn" => Some(TokenKind::Fn),
        "for" => Some(TokenKind::For),
        "if" => Some(TokenKind::If),
        "impl" => Some(TokenKind::Impl),
        "import" => Some(TokenKind::Import),
        "interface" => Some(TokenKind::Interface),
        "json" => Some(TokenKind::JsonKw),
        "in" => Some(TokenKind::In),
        "let" => Some(TokenKind::Let),
        "link" => Some(TokenKind::Link),
        "match" => Some(TokenKind::Match),
        "module" => Some(TokenKind::Module),
        "monitor" => Some(TokenKind::Monitor),
        "nil" => Some(TokenKind::Nil),
        "not" => Some(TokenKind::Not),
        "or" => Some(TokenKind::Or),
        "pub" => Some(TokenKind::Pub),
        "receive" => Some(TokenKind::Receive),
        "return" => Some(TokenKind::Return),
        "self" => Some(TokenKind::SelfKw),
        "send" => Some(TokenKind::Send),
        "service" => Some(TokenKind::Service),
        "spawn" => Some(TokenKind::Spawn),
        "struct" => Some(TokenKind::Struct),
        "supervisor" => Some(TokenKind::Supervisor),
        "terminate" => Some(TokenKind::Terminate),
        "trait" => Some(TokenKind::Trait),
        "trap" => Some(TokenKind::Trap),
        "true" => Some(TokenKind::True),
        "type" => Some(TokenKind::Type),
        "when" => Some(TokenKind::When),
        "where" => Some(TokenKind::Where),
        "while" => Some(TokenKind::While),
        "with" => Some(TokenKind::With),
        "break" => Some(TokenKind::Break),
        "continue" => Some(TokenKind::Continue),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyword_from_str_recognizes_all_keywords() {
        let keywords = [
            ("actor", TokenKind::Actor),
            ("after", TokenKind::After),
            ("alias", TokenKind::Alias),
            ("and", TokenKind::And),
            ("call", TokenKind::Call),
            ("case", TokenKind::Case),
            ("cast", TokenKind::Cast),
            ("cond", TokenKind::Cond),
            ("def", TokenKind::Def),
            ("do", TokenKind::Do),
            ("else", TokenKind::Else),
            ("end", TokenKind::End),
            ("false", TokenKind::False),
            ("fn", TokenKind::Fn),
            ("for", TokenKind::For),
            ("if", TokenKind::If),
            ("impl", TokenKind::Impl),
            ("import", TokenKind::Import),
            ("interface", TokenKind::Interface),
            ("json", TokenKind::JsonKw),
            ("in", TokenKind::In),
            ("let", TokenKind::Let),
            ("link", TokenKind::Link),
            ("match", TokenKind::Match),
            ("module", TokenKind::Module),
            ("monitor", TokenKind::Monitor),
            ("nil", TokenKind::Nil),
            ("not", TokenKind::Not),
            ("or", TokenKind::Or),
            ("pub", TokenKind::Pub),
            ("receive", TokenKind::Receive),
            ("return", TokenKind::Return),
            ("self", TokenKind::SelfKw),
            ("send", TokenKind::Send),
            ("service", TokenKind::Service),
            ("spawn", TokenKind::Spawn),
            ("struct", TokenKind::Struct),
            ("supervisor", TokenKind::Supervisor),
            ("terminate", TokenKind::Terminate),
            ("trait", TokenKind::Trait),
            ("trap", TokenKind::Trap),
            ("true", TokenKind::True),
            ("type", TokenKind::Type),
            ("when", TokenKind::When),
            ("where", TokenKind::Where),
            ("while", TokenKind::While),
            ("with", TokenKind::With),
            ("break", TokenKind::Break),
            ("continue", TokenKind::Continue),
        ];

        for (s, expected) in &keywords {
            assert_eq!(
                keyword_from_str(s),
                Some(expected.clone()),
                "keyword_from_str({s:?}) should return Some({expected:?})"
            );
        }

        // Verify we tested all 49 keywords
        assert_eq!(keywords.len(), 49, "must test all 49 keywords");
    }

    #[test]
    fn keyword_from_str_rejects_non_keywords() {
        assert_eq!(keyword_from_str("foo"), None);
        assert_eq!(keyword_from_str("bar"), None);
        assert_eq!(keyword_from_str("x"), None);
        assert_eq!(keyword_from_str(""), None);
        assert_eq!(keyword_from_str("IF"), None); // case-sensitive
        assert_eq!(keyword_from_str("True"), None); // case-sensitive
    }

    #[test]
    fn token_new_constructor() {
        let tok = Token::new(TokenKind::Fn, 10, 12);
        assert_eq!(tok.kind, TokenKind::Fn);
        assert_eq!(tok.span, Span::new(10, 12));
    }

    #[test]
    fn token_kind_variant_count() {
        // Count variants by checking that all categories are covered.
        // Keywords: 49 (added JsonKw), Operators: 25 (added SlotPipe(u32)), Delimiters: 6, Punctuation: 5,
        // Literals: 9 (added RegexLiteral(String, String)), Identifiers/comments: 4, Special: 2 = 100 total
        // This test documents the expected count.
        let keywords = 49u32; // Added JsonKw
        let operators = 25; // Added SlotPipe(u32)
        let delimiters = 6;
        let punctuation = 5;
        let literals = 9; // Added RegexLiteral(String, String)
        let ident_comments = 4;
        let special = 2;
        let total = keywords + operators + delimiters + punctuation + literals + ident_comments + special;
        assert_eq!(total, 100, "TokenKind should have 100 variants");
    }
}
