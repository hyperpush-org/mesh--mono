// Mesh lexer -- tokenizer for the Mesh programming language.

mod cursor;

use cursor::Cursor;
use mesh_common::token::{keyword_from_str, Token, TokenKind};

/// Tracks what the lexer is currently doing.
#[derive(Debug, Clone, PartialEq)]
enum LexerState {
    /// Normal top-level tokenization.
    Normal,
    /// Inside a string literal (after StringStart emitted).
    InString { triple: bool },
    /// Inside `${...}` string interpolation.
    InInterpolation { brace_depth: u32 },
}

/// The Mesh lexer. Converts source text into a stream of tokens.
///
/// Wraps a [`Cursor`] for byte-level iteration and implements
/// `Iterator<Item = Token>` so callers can consume tokens lazily
/// or collect them into a `Vec`.
///
/// Uses a state stack to handle nested string interpolation contexts.
pub struct Lexer<'src> {
    cursor: Cursor<'src>,
    #[allow(dead_code)]
    source: &'src str,
    /// Whether we have already emitted the `Eof` token.
    emitted_eof: bool,
    /// Pending tokens to emit before resuming normal lexing.
    pending: Vec<Token>,
    /// State stack for tracking nested lexing contexts.
    state_stack: Vec<LexerState>,
}

impl<'src> Lexer<'src> {
    /// Create a new lexer for the given source text.
    pub fn new(source: &'src str) -> Self {
        Self {
            cursor: Cursor::new(source),
            source,
            emitted_eof: false,
            pending: Vec::new(),
            state_stack: vec![LexerState::Normal],
        }
    }

    /// Convenience: tokenize the entire source into a `Vec<Token>`.
    ///
    /// The returned vector includes the final `Eof` token.
    pub fn tokenize(source: &str) -> Vec<Token> {
        Lexer::new(source).collect()
    }

    /// Current lexer state (top of stack).
    fn current_state(&self) -> &LexerState {
        self.state_stack.last().expect("state stack must never be empty")
    }

    /// Produce the next token based on current state.
    fn produce_token(&mut self) -> Token {
        match self.current_state().clone() {
            LexerState::Normal => self.lex_normal(),
            LexerState::InString { triple } => self.lex_string_content(triple),
            LexerState::InInterpolation { .. } => self.lex_interpolation(),
        }
    }

    // ── Normal mode ────────────────────────────────────────────────────

    /// Tokenize in normal mode (top-level or inside interpolation expression).
    fn lex_normal(&mut self) -> Token {
        self.skip_whitespace();

        let start = self.cursor.pos();

        let Some(c) = self.cursor.peek() else {
            return Token::new(TokenKind::Eof, start, start);
        };

        match c {
            // ── Newlines ───────────────────────────────────────────────────
            '\n' => {
                self.cursor.advance();
                Token::new(TokenKind::Newline, start, self.cursor.pos())
            }
            '\r' => {
                self.cursor.advance();
                // \r\n = single Newline
                if self.cursor.peek() == Some('\n') {
                    self.cursor.advance();
                }
                Token::new(TokenKind::Newline, start, self.cursor.pos())
            }

            // ── Single-character delimiters ─────────────────────────────
            '(' => self.single_char_token(TokenKind::LParen, start),
            ')' => self.single_char_token(TokenKind::RParen, start),
            '[' => self.single_char_token(TokenKind::LBracket, start),
            ']' => self.single_char_token(TokenKind::RBracket, start),
            '{' => self.single_char_token(TokenKind::LBrace, start),
            '}' => self.single_char_token(TokenKind::RBrace, start),
            ',' => self.single_char_token(TokenKind::Comma, start),
            ';' => self.single_char_token(TokenKind::Semicolon, start),

            // ── Multi-character operators ────────────────────────────────
            '=' => self.lex_eq(start),
            '!' => self.lex_bang(start),
            '<' => self.lex_lt(start),
            '>' => self.lex_gt(start),
            '&' => self.lex_amp(start),
            '|' => self.lex_pipe(start),
            '+' => self.lex_plus(start),
            '-' => self.lex_minus(start),
            ':' => self.lex_colon(start),
            '.' => self.lex_dot(start),
            '*' => self.single_char_token(TokenKind::Star, start),
            '/' => self.single_char_token(TokenKind::Slash, start),
            '%' => self.single_char_token(TokenKind::Percent, start),

            // ── Single-character operators ─────────────────────────────
            '?' => self.single_char_token(TokenKind::Question, start),

            // ── Comments ────────────────────────────────────────────────
            '#' => self.lex_comment(start),

            // ── Number literals ─────────────────────────────────────────
            '0'..='9' => self.lex_number(start),

            // ── String literals ─────────────────────────────────────────
            '"' => self.lex_string_start(start),

            // ── Identifiers and keywords ────────────────────────────────
            c if is_ident_start(c) => self.lex_ident(start),

            // ── Unknown character (error recovery) ──────────────────────
            _ => {
                self.cursor.advance();
                Token::new(TokenKind::Error, start, self.cursor.pos())
            }
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────

    /// Skip whitespace characters (spaces and tabs only -- newlines are tokens).
    fn skip_whitespace(&mut self) {
        self.cursor.eat_while(|c| c == ' ' || c == '\t');
    }

    /// Consume one character and return a token of the given kind.
    fn single_char_token(&mut self, kind: TokenKind, start: u32) -> Token {
        self.cursor.advance();
        Token::new(kind, start, self.cursor.pos())
    }

    // ── Operator lexing ────────────────────────────────────────────────

    /// `=` -> `Eq`, `==` -> `EqEq`, `=>` -> `FatArrow`
    fn lex_eq(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '='
        match self.cursor.peek() {
            Some('=') => {
                self.cursor.advance();
                Token::new(TokenKind::EqEq, start, self.cursor.pos())
            }
            Some('>') => {
                self.cursor.advance();
                Token::new(TokenKind::FatArrow, start, self.cursor.pos())
            }
            _ => Token::new(TokenKind::Eq, start, self.cursor.pos()),
        }
    }

    /// `!` -> `Bang`, `!=` -> `NotEq`
    fn lex_bang(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '!'
        if self.cursor.peek() == Some('=') {
            self.cursor.advance();
            Token::new(TokenKind::NotEq, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Bang, start, self.cursor.pos())
        }
    }

    /// `<` -> `Lt`, `<=` -> `LtEq`, `<>` -> `Diamond`
    fn lex_lt(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '<'
        match self.cursor.peek() {
            Some('=') => {
                self.cursor.advance();
                Token::new(TokenKind::LtEq, start, self.cursor.pos())
            }
            Some('>') => {
                self.cursor.advance();
                Token::new(TokenKind::Diamond, start, self.cursor.pos())
            }
            _ => Token::new(TokenKind::Lt, start, self.cursor.pos()),
        }
    }

    /// `>` -> `Gt`, `>=` -> `GtEq`
    fn lex_gt(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '>'
        if self.cursor.peek() == Some('=') {
            self.cursor.advance();
            Token::new(TokenKind::GtEq, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Gt, start, self.cursor.pos())
        }
    }

    /// `&&` -> `AmpAmp`, single `&` -> `Error`
    fn lex_amp(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '&'
        if self.cursor.peek() == Some('&') {
            self.cursor.advance();
            Token::new(TokenKind::AmpAmp, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Error, start, self.cursor.pos())
        }
    }

    /// `||` -> `PipePipe`, `|>` -> `Pipe`, `|N>` -> `SlotPipe(N)`, single `|` -> `Bar`
    ///
    /// For slot pipe:
    /// - `|2>` emits `SlotPipe(2)`, `|10>` emits `SlotPipe(10)`
    /// - `|0>` and `|1>` emit `Error` (invalid by design: 0 is meaningless, use `|>` for slot 1)
    fn lex_pipe(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '|'
        match self.cursor.peek() {
            Some('|') => {
                self.cursor.advance();
                Token::new(TokenKind::PipePipe, start, self.cursor.pos())
            }
            Some('>') => {
                self.cursor.advance();
                Token::new(TokenKind::Pipe, start, self.cursor.pos())
            }
            Some(c) if c.is_ascii_digit() => {
                // Scan the digit sequence
                let digit_start = self.cursor.pos();
                self.cursor.eat_while(|c| c.is_ascii_digit());
                let digit_end = self.cursor.pos();
                let digit_str = self.cursor.slice(digit_start, digit_end);
                let n: u32 = digit_str.parse().unwrap_or(0);
                // Must be followed by '>'
                if self.cursor.peek() == Some('>') {
                    self.cursor.advance(); // consume '>'
                    if n == 0 {
                        // |0> is invalid -- arguments are 1-indexed
                        Token::new(TokenKind::Error, start, self.cursor.pos())
                    } else if n == 1 {
                        // |1> is invalid -- use |> instead
                        Token::new(TokenKind::Error, start, self.cursor.pos())
                    } else {
                        Token::new(TokenKind::SlotPipe(n), start, self.cursor.pos())
                    }
                } else {
                    // Digits consumed but no '>' -- not a valid slot pipe, emit error
                    Token::new(TokenKind::Error, start, self.cursor.pos())
                }
            }
            _ => Token::new(TokenKind::Bar, start, self.cursor.pos()),
        }
    }

    /// `+` -> `Plus`, `++` -> `PlusPlus`
    fn lex_plus(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '+'
        if self.cursor.peek() == Some('+') {
            self.cursor.advance();
            Token::new(TokenKind::PlusPlus, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Plus, start, self.cursor.pos())
        }
    }

    /// `-` -> `Minus`, `->` -> `Arrow`
    fn lex_minus(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '-'
        if self.cursor.peek() == Some('>') {
            self.cursor.advance();
            Token::new(TokenKind::Arrow, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Minus, start, self.cursor.pos())
        }
    }

    /// `:` -> `Colon`, `::` -> `ColonColon`, `:ident` -> `Atom`
    fn lex_colon(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume ':'
        if self.cursor.peek() == Some(':') {
            self.cursor.advance();
            Token::new(TokenKind::ColonColon, start, self.cursor.pos())
        } else if self
            .cursor
            .peek()
            .is_some_and(|c| c.is_ascii_lowercase() || c == '_')
        {
            // Atom literal: `:name`, `:email`, `:asc`, `:_field`
            self.cursor.eat_while(is_ident_continue);
            Token::new(TokenKind::Atom, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Colon, start, self.cursor.pos())
        }
    }

    /// `.` -> `Dot`, `..` -> `DotDot`
    fn lex_dot(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '.'
        if self.cursor.peek() == Some('.') {
            self.cursor.advance();
            Token::new(TokenKind::DotDot, start, self.cursor.pos())
        } else {
            Token::new(TokenKind::Dot, start, self.cursor.pos())
        }
    }

    // ── Comments ──────────────────────────────────────────────────────

    /// Lex a comment starting with `#`.
    ///
    /// - `##!` -> `ModuleDocComment`
    /// - `##`  -> `DocComment`
    /// - `#=`  -> nestable block comment
    /// - `#`   -> `Comment`
    fn lex_comment(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '#'

        if self.cursor.peek() == Some('#') {
            // Could be doc comment or module doc comment
            self.cursor.advance(); // consume second '#'

            if self.cursor.peek() == Some('!') {
                // Module doc comment: ##!
                self.cursor.advance(); // consume '!'
                // Skip optional leading space
                if self.cursor.peek() == Some(' ') {
                    self.cursor.advance();
                }
                self.cursor.eat_while(|c| c != '\n' && c != '\r');
                Token::new(TokenKind::ModuleDocComment, start, self.cursor.pos())
            } else {
                // Doc comment: ##
                // Skip optional leading space
                if self.cursor.peek() == Some(' ') {
                    self.cursor.advance();
                }
                self.cursor.eat_while(|c| c != '\n' && c != '\r');
                Token::new(TokenKind::DocComment, start, self.cursor.pos())
            }
        } else if self.cursor.peek() == Some('=') {
            // Block comment: #= ... =#
            self.lex_block_comment(start)
        } else {
            // Regular line comment: #
            // Skip optional leading space
            if self.cursor.peek() == Some(' ') {
                self.cursor.advance();
            }
            self.cursor.eat_while(|c| c != '\n' && c != '\r');
            Token::new(TokenKind::Comment, start, self.cursor.pos())
        }
    }

    /// Lex a nestable block comment `#= ... =#`.
    ///
    /// Block comments can be nested: `#= outer #= inner =# still =#` is one comment.
    /// Tracks nesting depth starting at 1 (for the opening `#=` already consumed).
    fn lex_block_comment(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume '=' (the '#' was already consumed)
        let mut depth: u32 = 1;

        loop {
            match self.cursor.peek() {
                None => {
                    // Unterminated block comment
                    return Token::new(TokenKind::Error, start, self.cursor.pos());
                }
                Some('#') => {
                    self.cursor.advance();
                    if self.cursor.peek() == Some('=') {
                        self.cursor.advance();
                        depth += 1;
                    }
                }
                Some('=') => {
                    self.cursor.advance();
                    if self.cursor.peek() == Some('#') {
                        self.cursor.advance();
                        depth -= 1;
                        if depth == 0 {
                            return Token::new(TokenKind::Comment, start, self.cursor.pos());
                        }
                    }
                }
                Some(_) => {
                    self.cursor.advance();
                }
            }
        }
    }

    // ── Number literals ───────────────────────────────────────────────

    /// Lex a number literal starting with a digit.
    ///
    /// Handles decimal, hex (0x), binary (0b), octal (0o), floats, and
    /// scientific notation. Underscore separators are allowed.
    fn lex_number(&mut self, start: u32) -> Token {
        let first = self.cursor.advance().unwrap(); // consume first digit

        if first == '0' {
            match self.cursor.peek() {
                Some('x' | 'X') => return self.lex_hex(start),
                Some('b' | 'B') => return self.lex_binary(start),
                Some('o' | 'O') => return self.lex_octal(start),
                _ => {}
            }
        }

        // Decimal: eat digits and underscores
        self.cursor.eat_while(|c| c.is_ascii_digit() || c == '_');

        // Check for float: `.` followed by a digit (not `..` range)
        if self.cursor.peek() == Some('.')
            && self
                .cursor
                .peek_next()
                .is_some_and(|c| c.is_ascii_digit())
        {
            self.cursor.advance(); // consume '.'
            self.cursor.eat_while(|c| c.is_ascii_digit() || c == '_');

            // Check for scientific notation
            if matches!(self.cursor.peek(), Some('e' | 'E')) {
                self.lex_exponent();
            }

            return Token::new(TokenKind::FloatLiteral, start, self.cursor.pos());
        }

        // Check for scientific notation on integer (makes it a float)
        if matches!(self.cursor.peek(), Some('e' | 'E')) {
            self.lex_exponent();
            return Token::new(TokenKind::FloatLiteral, start, self.cursor.pos());
        }

        Token::new(TokenKind::IntLiteral, start, self.cursor.pos())
    }

    /// Lex hex digits after `0x`/`0X`.
    fn lex_hex(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume 'x'/'X'
        self.cursor
            .eat_while(|c| c.is_ascii_hexdigit() || c == '_');
        Token::new(TokenKind::IntLiteral, start, self.cursor.pos())
    }

    /// Lex binary digits after `0b`/`0B`.
    fn lex_binary(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume 'b'/'B'
        self.cursor
            .eat_while(|c| c == '0' || c == '1' || c == '_');
        Token::new(TokenKind::IntLiteral, start, self.cursor.pos())
    }

    /// Lex octal digits after `0o`/`0O`.
    fn lex_octal(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume 'o'/'O'
        self.cursor
            .eat_while(|c| matches!(c, '0'..='7' | '_'));
        Token::new(TokenKind::IntLiteral, start, self.cursor.pos())
    }

    /// Lex the exponent part of a float literal: `e`/`E` followed by optional
    /// sign and digits.
    fn lex_exponent(&mut self) {
        self.cursor.advance(); // consume 'e'/'E'
        if matches!(self.cursor.peek(), Some('+' | '-')) {
            self.cursor.advance(); // consume sign
        }
        self.cursor.eat_while(|c| c.is_ascii_digit() || c == '_');
    }

    // ── String literals ───────────────────────────────────────────────

    /// Lex the opening of a string literal (`"` or `"""`).
    ///
    /// Emits `StringStart` and pushes `InString` onto the state stack.
    fn lex_string_start(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume first '"'

        // Check for triple-quote: two more '"' follow
        if self.cursor.peek() == Some('"') && self.cursor.peek_next() == Some('"') {
            self.cursor.advance(); // consume second '"'
            self.cursor.advance(); // consume third '"'
            self.state_stack.push(LexerState::InString { triple: true });
            Token::new(TokenKind::StringStart, start, self.cursor.pos())
        } else {
            self.state_stack.push(LexerState::InString { triple: false });
            Token::new(TokenKind::StringStart, start, self.cursor.pos())
        }
    }

    /// Lex string content when in InString state.
    ///
    /// Scans characters until finding:
    /// - `${` -> emit StringContent (if any), then InterpolationStart
    /// - closing delimiter -> emit StringContent (if any), then StringEnd
    /// - escape sequence -> include in content
    /// - EOF -> Error token
    fn lex_string_content(&mut self, triple: bool) -> Token {
        let start = self.cursor.pos();

        loop {
            match self.cursor.peek() {
                None => {
                    // Unterminated string
                    self.state_stack.pop();
                    let end = self.cursor.pos();
                    if end > start {
                        // Emit accumulated content first, then queue error
                        self.pending.push(Token::new(TokenKind::Error, end, end));
                        return Token::new(TokenKind::StringContent, start, end);
                    }
                    return Token::new(TokenKind::Error, start, end);
                }
                Some('$') if self.cursor.peek_next() == Some('{') => {
                    let content_end = self.cursor.pos();
                    self.cursor.advance(); // consume '$'
                    self.cursor.advance(); // consume '{'
                    let interp_end = self.cursor.pos();

                    // Pop InString, push InString back (we'll return to it),
                    // then push InInterpolation on top.
                    // Actually, we keep InString on the stack and push InInterpolation on top.
                    self.state_stack.push(LexerState::InInterpolation { brace_depth: 0 });

                    // Queue the InterpolationStart token
                    self.pending.push(Token::new(TokenKind::InterpolationStart, content_end, interp_end));

                    if content_end > start {
                        // There's content before the interpolation
                        return Token::new(TokenKind::StringContent, start, content_end);
                    } else {
                        // No content before interpolation, emit InterpolationStart directly
                        return self.pending.remove(0);
                    }
                }
                Some('#') if self.cursor.peek_next() == Some('{') => {
                    let content_end = self.cursor.pos();
                    self.cursor.advance(); // consume '#'
                    self.cursor.advance(); // consume '{'
                    let interp_end = self.cursor.pos();

                    self.state_stack.push(LexerState::InInterpolation { brace_depth: 0 });

                    self.pending.push(Token::new(TokenKind::InterpolationStart, content_end, interp_end));

                    if content_end > start {
                        return Token::new(TokenKind::StringContent, start, content_end);
                    } else {
                        return self.pending.remove(0);
                    }
                }
                Some('"') if !triple => {
                    let content_end = self.cursor.pos();
                    self.cursor.advance(); // consume closing '"'
                    let str_end = self.cursor.pos();

                    // Pop InString state
                    self.state_stack.pop();

                    // Queue StringEnd
                    self.pending.push(Token::new(TokenKind::StringEnd, content_end, str_end));

                    if content_end > start {
                        return Token::new(TokenKind::StringContent, start, content_end);
                    } else {
                        // Empty content, just emit StringEnd
                        return self.pending.remove(0);
                    }
                }
                Some('"') if triple => {
                    // Check for closing """
                    if self.cursor.peek_next() == Some('"') {
                        let saved_pos = self.cursor.pos();
                        self.cursor.advance(); // first '"'
                        self.cursor.advance(); // second '"'
                        if self.cursor.peek() == Some('"') {
                            // Found closing """
                            self.cursor.advance(); // third '"'
                            let str_end = self.cursor.pos();

                            // Pop InString state
                            self.state_stack.pop();

                            // Queue StringEnd
                            self.pending.push(Token::new(TokenKind::StringEnd, saved_pos, str_end));

                            if saved_pos > start {
                                return Token::new(TokenKind::StringContent, start, saved_pos);
                            } else {
                                return self.pending.remove(0);
                            }
                        }
                        // Only two quotes -- they're part of content, keep scanning
                        continue;
                    }
                    // Single quote inside triple-quoted string is content
                    self.cursor.advance();
                }
                Some('\\') => {
                    self.cursor.advance(); // consume '\'
                    self.cursor.advance(); // consume escaped char
                }
                Some(_) => {
                    self.cursor.advance();
                }
            }
        }
    }

    // ── Interpolation ─────────────────────────────────────────────────

    /// Lex tokens inside `${...}` interpolation.
    ///
    /// Tokenizes normally but tracks brace depth. When the closing `}` is
    /// found (at depth 0), emits InterpolationEnd and pops back to InString.
    fn lex_interpolation(&mut self) -> Token {
        self.skip_whitespace();

        let start = self.cursor.pos();

        let Some(c) = self.cursor.peek() else {
            // EOF inside interpolation -- error
            self.state_stack.pop();
            return Token::new(TokenKind::Error, start, start);
        };

        match c {
            '{' => {
                // Increment brace depth
                if let Some(LexerState::InInterpolation { ref mut brace_depth }) = self.state_stack.last_mut() {
                    *brace_depth += 1;
                }
                self.single_char_token(TokenKind::LBrace, start)
            }
            '}' => {
                let brace_depth = if let Some(LexerState::InInterpolation { brace_depth }) = self.state_stack.last() {
                    *brace_depth
                } else {
                    0
                };

                if brace_depth == 0 {
                    // Closing interpolation
                    self.cursor.advance();
                    let end = self.cursor.pos();
                    self.state_stack.pop(); // pop InInterpolation, back to InString
                    Token::new(TokenKind::InterpolationEnd, start, end)
                } else {
                    // Decrement brace depth
                    if let Some(LexerState::InInterpolation { ref mut brace_depth }) = self.state_stack.last_mut() {
                        *brace_depth -= 1;
                    }
                    self.single_char_token(TokenKind::RBrace, start)
                }
            }
            // ── Newlines inside interpolation ───────────────────────────
            '\n' => {
                self.cursor.advance();
                Token::new(TokenKind::Newline, start, self.cursor.pos())
            }
            '\r' => {
                self.cursor.advance();
                if self.cursor.peek() == Some('\n') {
                    self.cursor.advance();
                }
                Token::new(TokenKind::Newline, start, self.cursor.pos())
            }
            // All other tokens: delegate to normal tokenization helpers
            '?' => self.single_char_token(TokenKind::Question, start),
            '(' => self.single_char_token(TokenKind::LParen, start),
            ')' => self.single_char_token(TokenKind::RParen, start),
            '[' => self.single_char_token(TokenKind::LBracket, start),
            ']' => self.single_char_token(TokenKind::RBracket, start),
            ',' => self.single_char_token(TokenKind::Comma, start),
            ';' => self.single_char_token(TokenKind::Semicolon, start),
            '=' => self.lex_eq(start),
            '!' => self.lex_bang(start),
            '<' => self.lex_lt(start),
            '>' => self.lex_gt(start),
            '&' => self.lex_amp(start),
            '|' => self.lex_pipe(start),
            '+' => self.lex_plus(start),
            '-' => self.lex_minus(start),
            ':' => self.lex_colon(start),
            '.' => self.lex_dot(start),
            '*' => self.single_char_token(TokenKind::Star, start),
            '/' => self.single_char_token(TokenKind::Slash, start),
            '%' => self.single_char_token(TokenKind::Percent, start),
            '#' => self.lex_comment(start),
            '0'..='9' => self.lex_number(start),
            '"' => self.lex_string_start(start),
            c if is_ident_start(c) => self.lex_ident(start),
            _ => {
                self.cursor.advance();
                Token::new(TokenKind::Error, start, self.cursor.pos())
            }
        }
    }

    // ── Identifiers and keywords ──────────────────────────────────────

    /// Lex an identifier or keyword.
    fn lex_ident(&mut self, start: u32) -> Token {
        self.cursor.advance(); // consume first char
        self.cursor.eat_while(is_ident_continue);
        let text = self.cursor.slice(start, self.cursor.pos());

        let kind = keyword_from_str(text).unwrap_or(TokenKind::Ident);
        Token::new(kind, start, self.cursor.pos())
    }
}

impl<'src> Iterator for Lexer<'src> {
    type Item = Token;

    fn next(&mut self) -> Option<Token> {
        if self.emitted_eof {
            return None;
        }

        // Drain pending tokens first.
        if !self.pending.is_empty() {
            let token = self.pending.remove(0);
            if token.kind == TokenKind::Eof {
                self.emitted_eof = true;
            }
            return Some(token);
        }

        let token = self.produce_token();
        if token.kind == TokenKind::Eof {
            self.emitted_eof = true;
        }
        Some(token)
    }
}

/// Whether a character can start an identifier.
fn is_ident_start(c: char) -> bool {
    c.is_alphabetic() || c == '_'
}

/// Whether a character can continue an identifier.
fn is_ident_continue(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lex_simple_expression() {
        let tokens = Lexer::tokenize("let x = 42");
        let kinds: Vec<_> = tokens.iter().map(|t| &t.kind).collect();
        assert_eq!(
            kinds,
            vec![
                &TokenKind::Let,
                &TokenKind::Ident,
                &TokenKind::Eq,
                &TokenKind::IntLiteral,
                &TokenKind::Eof,
            ]
        );
    }

    #[test]
    fn lex_simple_string() {
        let tokens = Lexer::tokenize(r#""hello""#);
        let kinds: Vec<_> = tokens.iter().map(|t| &t.kind).collect();
        assert_eq!(
            kinds,
            vec![
                &TokenKind::StringStart,
                &TokenKind::StringContent,
                &TokenKind::StringEnd,
                &TokenKind::Eof,
            ]
        );
    }

    #[test]
    fn lex_spans_accurate() {
        let tokens = Lexer::tokenize("let x = 42");
        // let: 0-3
        assert_eq!(tokens[0].span.start, 0);
        assert_eq!(tokens[0].span.end, 3);
        // x: 4-5
        assert_eq!(tokens[1].span.start, 4);
        assert_eq!(tokens[1].span.end, 5);
        // =: 6-7
        assert_eq!(tokens[2].span.start, 6);
        assert_eq!(tokens[2].span.end, 7);
        // 42: 8-10
        assert_eq!(tokens[3].span.start, 8);
        assert_eq!(tokens[3].span.end, 10);
    }

    #[test]
    fn lex_string_interpolation_basic() {
        let tokens = Lexer::tokenize(r#""hello ${name} world""#);
        let kinds: Vec<_> = tokens.iter().map(|t| &t.kind).collect();
        assert_eq!(
            kinds,
            vec![
                &TokenKind::StringStart,
                &TokenKind::StringContent,       // "hello "
                &TokenKind::InterpolationStart,   // ${
                &TokenKind::Ident,                // name
                &TokenKind::InterpolationEnd,     // }
                &TokenKind::StringContent,        // " world"
                &TokenKind::StringEnd,
                &TokenKind::Eof,
            ]
        );
    }

    #[test]
    fn lex_nested_block_comment() {
        let tokens = Lexer::tokenize("#= outer #= inner =# still =#");
        let kinds: Vec<_> = tokens.iter().map(|t| &t.kind).collect();
        assert_eq!(
            kinds,
            vec![
                &TokenKind::Comment,
                &TokenKind::Eof,
            ]
        );
    }

    #[test]
    fn lex_slot_pipe_basic() {
        let tokens = Lexer::tokenize("|2>");
        assert_eq!(tokens[0].kind, TokenKind::SlotPipe(2));
    }

    #[test]
    fn lex_slot_pipe_multidigit() {
        let tokens = Lexer::tokenize("|10>");
        assert_eq!(tokens[0].kind, TokenKind::SlotPipe(10));
    }

    #[test]
    fn lex_slot_pipe_zero_is_error() {
        let tokens = Lexer::tokenize("|0>");
        assert_eq!(tokens[0].kind, TokenKind::Error);
    }

    #[test]
    fn lex_slot_pipe_one_is_error() {
        let tokens = Lexer::tokenize("|1>");
        assert_eq!(tokens[0].kind, TokenKind::Error);
    }

    #[test]
    fn lex_regular_pipe_unchanged() {
        let tokens = Lexer::tokenize("|>");
        assert_eq!(tokens[0].kind, TokenKind::Pipe);
    }

    #[test]
    fn lex_bar_unchanged() {
        let tokens = Lexer::tokenize("|");
        assert_eq!(tokens[0].kind, TokenKind::Bar);
    }

    #[test]
    fn lex_newlines_emitted() {
        let tokens = Lexer::tokenize("let x = 1\nlet y = 2");
        let kinds: Vec<_> = tokens.iter().map(|t| &t.kind).collect();
        assert_eq!(
            kinds,
            vec![
                &TokenKind::Let,
                &TokenKind::Ident,
                &TokenKind::Eq,
                &TokenKind::IntLiteral,
                &TokenKind::Newline,
                &TokenKind::Let,
                &TokenKind::Ident,
                &TokenKind::Eq,
                &TokenKind::IntLiteral,
                &TokenKind::Eof,
            ]
        );
    }
}
