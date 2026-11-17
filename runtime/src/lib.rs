//! Browser adapter for the pinned Kıvıl interpreter; no browser dependencies enter the core repo.
use std::io::{self, Cursor, Write};

#[path = "../vendor/kivil/src/diagnostic.rs"]
mod diagnostic;
#[path = "../vendor/kivil/src/interpreter.rs"]
mod interpreter;
#[path = "../vendor/kivil/src/lexer.rs"]
mod lexer;
#[path = "../vendor/kivil/src/parser.rs"]
mod parser;

const MAX_OUTPUT: usize = 128 * 1024;

#[derive(Default)]
struct Output(Vec<u8>);
impl Write for Output {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len() + bytes.len() > MAX_OUTPUT {
            return Err(io::Error::other("Çıktı sınırına ulaşıldı (128 KB)."));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub struct RunResult {
    pub output: String,
    pub error: Option<diagnostic::Diagnostic>,
    pub consumed_input: usize,
}

pub fn run_source(source: &str, input: &str) -> RunResult {
    let mut output = Output::default();
    let mut input_cursor = Cursor::new(input.as_bytes());
    let execution = (|| {
        if source.len() > 64 * 1024 {
            return Err("Kod sınırı aşıldı (64 KB).".into());
        }
        if input.len() > 32 * 1024 {
            return Err("Girdi sınırı aşıldı (32 KB).".into());
        }
        let tokens = lexer::tokenize(source)?;
        let statements = parser::parse(&tokens)?;
        let mut interpreter = interpreter::Interpreter::with_io(&mut input_cursor, &mut output);
        for statement in &statements {
            interpreter.execute(statement)?;
        }
        Ok(())
    })();
    let consumed = input_cursor.position() as usize;
    RunResult {
        output: String::from_utf8_lossy(&output.0).into_owned(),
        error: execution.err(),
        consumed_input: input.as_bytes()[..consumed]
            .iter()
            .filter(|byte| **byte == b'\n')
            .count(),
    }
}

fn json_string(value: &str) -> String {
    let mut out = String::from("\"");
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if ch < '\u{20}' => out.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => out.push(ch),
        }
    }
    out.push('"');
    out
}

impl RunResult {
    pub fn to_json(&self) -> String {
        let error = self
            .error
            .as_ref()
            .map(|error| json_string(&error.message))
            .unwrap_or("null".into());
        let position = self.error.as_ref().and_then(|error| error.position);
        let line = position
            .map(|position| position.line.to_string())
            .unwrap_or("null".into());
        let column = position
            .map(|position| position.column.to_string())
            .unwrap_or("null".into());
        let needs_input = self
            .error
            .as_ref()
            .is_some_and(|error| error.message == "Girdi beklenirken giriş sona erdi.");
        format!(
            "{{\"output\":{},\"error\":{error},\"line\":{line},\"column\":{column},\"needsInput\":{needs_input},\"consumedInput\":{}}}",
            json_string(&self.output),
            self.consumed_input
        )
    }
}

// The JS wrapper owns each input allocation until `release` and copies the result before reuse.
#[cfg(target_arch = "wasm32")]
mod abi {
    use super::run_source;
    use std::cell::RefCell;
    thread_local! { static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) }; }

    #[unsafe(no_mangle)]
    pub extern "C" fn allocate(length: usize) -> *mut u8 {
        Box::into_raw(vec![0u8; length].into_boxed_slice()) as *mut u8
    }

    /// # Safety
    /// `pointer` and `length` must refer to a live allocation returned by `allocate`.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn release(pointer: *mut u8, length: usize) {
        unsafe {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
                pointer, length,
            )));
        }
    }

    /// # Safety
    /// Both input slices must be live allocated memory and contain valid UTF-8.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn run(
        source: *const u8,
        source_len: usize,
        input: *const u8,
        input_len: usize,
    ) -> *const u8 {
        let source = unsafe { std::slice::from_raw_parts(source, source_len) };
        let input = unsafe { std::slice::from_raw_parts(input, input_len) };
        let json = match (std::str::from_utf8(source), std::str::from_utf8(input)) {
            (Ok(source), Ok(input)) => run_source(source, input).to_json(),
            _ => {
                "{\"output\":\"\",\"error\":\"Geçersiz UTF-8 metni.\",\"needsInput\":false}".into()
            }
        };
        RESULT.with(|result| {
            let mut result = result.borrow_mut();
            *result = json.into_bytes();
            result.as_ptr()
        })
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn result_length() -> usize {
        RESULT.with(|result| result.borrow().len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_input_can_resume_by_replaying_deterministic_source() {
        let source = "isim = girdi(\"Adın: \")\nyaz(\"Merhaba\", isim)";
        let result = run_source(source, "");
        assert!(result.to_json().contains("\"needsInput\":true"));
        assert_eq!(result.output, "Adın: ");
        let result = run_source(source, "Herdem\n");
        assert!(result.error.is_none());
        assert_eq!(result.output, "Adın: Merhaba Herdem\n");
        assert_eq!(result.consumed_input, 1);
    }
    #[test]
    fn diagnostics_and_json_escaping_survive_the_adapter() {
        let result = run_source("yaz(\"Kıvıl\\n\\\"test\\\"\")\n1 / 0", "");
        assert_eq!(result.error.as_ref().unwrap().position.unwrap().line, 2);
        assert_eq!(
            json_string("\"\\\n\t\r\0İ"),
            "\"\\\"\\\\\\n\\t\\r\\u0000İ\""
        );
    }
    #[test]
    fn output_and_source_limits_report_errors() {
        assert!(run_source(&" ".repeat(65537), "").error.is_some());
        assert!(
            run_source("tekrarla 100000 { yaz(\"uzun çıktı\") }", "")
                .error
                .is_some()
        );
    }
}
