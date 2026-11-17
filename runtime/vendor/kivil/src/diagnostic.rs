use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Position {
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub message: String,
    pub position: Option<Position>,
}

impl Diagnostic {
    pub fn at(mut self, position: Position) -> Self {
        if self.position.is_none() {
            self.position = Some(position);
        }
        self
    }
}

impl From<String> for Diagnostic {
    fn from(message: String) -> Self {
        Self {
            message,
            position: None,
        }
    }
}

impl From<&str> for Diagnostic {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(position) = self.position {
            write!(
                formatter,
                "{}:{}: {}",
                position.line, position.column, self.message
            )
        } else {
            write!(formatter, "{}", self.message)
        }
    }
}
