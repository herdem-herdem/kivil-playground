use crate::diagnostic::{Diagnostic, Position};

#[derive(Debug, PartialEq)]
pub enum TokenKind {
    Eof,
    LeftBracket,
    RightBracket,
    Dot,
    Function,
    Return,
    Null,
    While,
    Repeat,
    If,
    Else,
    LeftBrace,
    RightBrace,
    And,
    Or,
    Not,
    True,
    False,
    EqualEqual,
    NotEqual,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    Integer(i64),
    Float(f64),
    Identifier(String),
    Text(String),
    LeftParen,
    RightParen,
    Plus,
    Minus,
    Star,
    Slash,
    Equal,
    Comma,
    Newline,
}

#[derive(Debug, PartialEq)]
pub struct Token {
    pub kind: TokenKind,
    pub position: Position,
}

pub fn tokenize(source: &str) -> Result<Vec<Token>, Diagnostic> {
    let mut tokens = Vec::new();
    let mut chars = source
        .chars()
        .scan(Position { line: 1, column: 1 }, |position, ch| {
            let start = *position;
            if ch == '\n' {
                position.line += 1;
                position.column = 1;
            } else {
                position.column += 1;
            }
            Some((ch, start))
        })
        .peekable();

    while let Some((ch, position)) = chars.next() {
        if matches!(ch, ' ' | '\t' | '\r') {
            continue;
        }
        if ch == '#' {
            while chars.peek().is_some_and(|(ch, _)| *ch != '\n') {
                chars.next();
            }
            continue;
        }
        let token_result = (|| -> Result<TokenKind, Diagnostic> {
            let token = match ch {
                ' ' | '\t' | '\r' => unreachable!(),
                '\n' => TokenKind::Newline,
                '[' => TokenKind::LeftBracket,
                ']' => TokenKind::RightBracket,
                '.' => TokenKind::Dot,
                '{' => TokenKind::LeftBrace,
                '}' => TokenKind::RightBrace,
                '(' => TokenKind::LeftParen,
                ')' => TokenKind::RightParen,
                '+' => TokenKind::Plus,
                '-' => TokenKind::Minus,
                '*' => TokenKind::Star,
                '/' => TokenKind::Slash,
                '=' => {
                    if chars.peek().is_some_and(|(ch, _)| *ch == '=') {
                        chars.next();
                        TokenKind::EqualEqual
                    } else {
                        TokenKind::Equal
                    }
                }
                '!' => {
                    if chars.peek().is_some_and(|(ch, _)| *ch == '=') {
                        chars.next();
                        TokenKind::NotEqual
                    } else {
                        return Err("'!' sonrasında '=' bekleniyor.".into());
                    }
                }
                '<' => {
                    if chars.peek().is_some_and(|(ch, _)| *ch == '=') {
                        chars.next();
                        TokenKind::LessEqual
                    } else {
                        TokenKind::Less
                    }
                }
                '>' => {
                    if chars.peek().is_some_and(|(ch, _)| *ch == '=') {
                        chars.next();
                        TokenKind::GreaterEqual
                    } else {
                        TokenKind::Greater
                    }
                }
                ',' => TokenKind::Comma,
                '0'..='9' => {
                    let mut number = String::from(ch);

                    while let Some(next) = chars.peek() {
                        if !next.0.is_ascii_digit() {
                            break;
                        }
                        number.push(chars.next().unwrap().0);
                    }

                    if chars.peek().is_some_and(|(ch, _)| *ch == '.') {
                        number.push(chars.next().unwrap().0);

                        if !chars.peek().is_some_and(|next| next.0.is_ascii_digit()) {
                            return Err("Ondalık noktadan sonra bir rakam bekleniyor.".into());
                        }

                        while let Some(next) = chars.peek() {
                            if !next.0.is_ascii_digit() {
                                break;
                            }
                            number.push(chars.next().unwrap().0);
                        }

                        let value: f64 = number
                            .parse()
                            .map_err(|_| format!("Geçersiz ondalıklı sayı: {number}"))?;
                        if !value.is_finite() {
                            return Err(format!("Ondalıklı sayı çok büyük: {number}").into());
                        }
                        TokenKind::Float(value)
                    } else {
                        let value = number.parse().map_err(|_| {
                            format!("Tam sayı desteklenen aralığın dışında: {number}")
                        })?;
                        TokenKind::Integer(value)
                    }
                }
                '"' => {
                    let mut text = String::new();

                    loop {
                        match chars.next() {
                            Some(('"', _)) => break,
                            Some(('\\', _)) => match chars.next() {
                                Some(('n', _)) => text.push('\n'),
                                Some(('t', _)) => text.push('\t'),
                                Some(('"', _)) => text.push('"'),
                                Some(('\\', _)) => text.push('\\'),
                                Some((other, _)) => {
                                    return Err(format!("Geçersiz kaçış dizisi: \\{other}").into());
                                }
                                None => return Err("Metnin kapanış tırnağı eksik.".into()),
                            },
                            Some(('\n' | '\r', _)) => {
                                return Err("Metin satır bitmeden kapatılmalı.".into());
                            }
                            Some((other, _)) => text.push(other),
                            None => return Err("Metnin kapanış tırnağı eksik.".into()),
                        }
                    }

                    TokenKind::Text(text)
                }
                ch if ch.is_alphabetic() || ch == '_' => {
                    let mut name = String::from(ch);

                    while let Some(next) = chars.peek() {
                        if !next.0.is_alphanumeric() && next.0 != '_' {
                            break;
                        }
                        name.push(chars.next().unwrap().0);
                    }

                    match name.as_str() {
                        "islev" => TokenKind::Function,
                        "dondur" => TokenKind::Return,
                        "bos" => TokenKind::Null,
                        "iken" => TokenKind::While,
                        "tekrarla" => TokenKind::Repeat,
                        "eger" => TokenKind::If,
                        "degilse" => TokenKind::Else,
                        "ve" => TokenKind::And,
                        "veya" => TokenKind::Or,
                        "degil" => TokenKind::Not,
                        "dogru" => TokenKind::True,
                        "yanlis" => TokenKind::False,
                        _ => TokenKind::Identifier(name),
                    }
                }
                other => return Err(format!("Tanınmayan karakter: {other}").into()),
            };

            Ok(token)
        })();
        let kind = token_result.map_err(|error| error.at(position))?;
        tokens.push(Token { kind, position });
    }
    // Compute EOF directly so trailing comments and whitespace are covered too.
    let end = Position {
        line: source.chars().filter(|ch| *ch == '\n').count() + 1,
        column: source.rsplit('\n').next().unwrap_or("").chars().count() + 1,
    };
    tokens.push(Token {
        kind: TokenKind::Eof,
        position: end,
    });
    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::TokenKind;
    fn tokenize(source: &str) -> Result<Vec<TokenKind>, String> {
        super::tokenize(source)
            .map(|tokens| {
                tokens
                    .into_iter()
                    .filter(|token| token.kind != TokenKind::Eof)
                    .map(|token| token.kind)
                    .collect()
            })
            .map_err(|error| error.to_string())
    }

    #[test]
    fn tokenizes_function_call() {
        assert_eq!(
            tokenize("yaz(10 + 20)"),
            Ok(vec![
                TokenKind::Identifier("yaz".into()),
                TokenKind::LeftParen,
                TokenKind::Integer(10),
                TokenKind::Plus,
                TokenKind::Integer(20),
                TokenKind::RightParen,
            ])
        );
    }

    #[test]
    fn tokenizes_assignment_unicode_and_decimals() {
        assert_eq!(
            tokenize("öğrenci_sayısı2 = -12\r\noran = 1.25"),
            Ok(vec![
                TokenKind::Identifier("öğrenci_sayısı2".into()),
                TokenKind::Equal,
                TokenKind::Minus,
                TokenKind::Integer(12),
                TokenKind::Newline,
                TokenKind::Identifier("oran".into()),
                TokenKind::Equal,
                TokenKind::Float(1.25),
            ])
        );
    }

    #[test]
    fn tokenizes_text_and_escapes() {
        assert_eq!(
            tokenize(r#"yaz("Merhaba, dünya!\n\t\"Kıvıl\"\\", isim)"#),
            Ok(vec![
                TokenKind::Identifier("yaz".into()),
                TokenKind::LeftParen,
                TokenKind::Text("Merhaba, dünya!\n\t\"Kıvıl\"\\".into()),
                TokenKind::Comma,
                TokenKind::Identifier("isim".into()),
                TokenKind::RightParen,
            ])
        );
    }

    #[test]
    fn tokenizes_arithmetic_and_whitespace() {
        assert_eq!(
            tokenize(" \t(8 - 2) * 3 / 2 "),
            Ok(vec![
                TokenKind::LeftParen,
                TokenKind::Integer(8),
                TokenKind::Minus,
                TokenKind::Integer(2),
                TokenKind::RightParen,
                TokenKind::Star,
                TokenKind::Integer(3),
                TokenKind::Slash,
                TokenKind::Integer(2),
            ])
        );
        assert_eq!(tokenize(""), Ok(vec![]));
    }

    #[test]
    fn rejects_invalid_input() {
        for source in [
            "@",
            "\"kapanmamış",
            "\"satır\nsonu\"",
            r#""hatalı\q""#,
            "\"ters eğik çizgi\\",
            "1.",
            "9223372036854775808",
        ] {
            assert!(tokenize(source).is_err(), "Hata bekleniyordu: {source}");
        }
        assert!(tokenize(&format!("{}.0", "9".repeat(400))).is_err());
    }
}
