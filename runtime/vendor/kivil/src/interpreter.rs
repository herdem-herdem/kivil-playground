use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::io::{self, BufRead, BufReader, Write};
use std::rc::Rc;

use crate::diagnostic::Diagnostic;
use crate::parser::{Expr, Operator, Statement};

#[derive(Debug, PartialEq, Clone)]
pub enum Value {
    Number(f64),
    Null,
    List(Rc<RefCell<Vec<Value>>>),
    Boolean(bool),
    Text(String),
}

impl fmt::Display for Value {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::List(values) => {
                write!(formatter, "[")?;
                for (index, value) in values.borrow().iter().enumerate() {
                    if index > 0 {
                        write!(formatter, ", ")?;
                    }
                    match value {
                        Value::Text(text) => write!(formatter, "{text:?}")?,
                        other => write!(formatter, "{other}")?,
                    }
                }
                write!(formatter, "]")
            }
            Value::Null => write!(formatter, "bos"),
            Value::Boolean(value) => {
                write!(formatter, "{}", if *value { "dogru" } else { "yanlis" })
            }
            Value::Number(value) => write!(formatter, "{value}"),
            Value::Text(text) => write!(formatter, "{text}"),
        }
    }
}

#[derive(Clone)]
struct Function {
    parameters: Vec<String>,
    body: Vec<Statement>,
}

enum Flow {
    Continue,
    Return(Value),
}

pub struct Interpreter<R: BufRead = BufReader<io::Stdin>, W: Write = io::Stdout> {
    input: R,
    output: W,
    variables: HashMap<String, Value>,
    locals: Vec<HashMap<String, Value>>,
    functions: HashMap<String, Function>,
}

impl Default for Interpreter {
    fn default() -> Self {
        Self::with_output(io::stdout())
    }
}

impl<W: Write> Interpreter<BufReader<io::Stdin>, W> {
    pub fn with_output(output: W) -> Self {
        Self::with_io(BufReader::new(io::stdin()), output)
    }
}

impl<R: BufRead, W: Write> Interpreter<R, W> {
    pub fn with_io(input: R, output: W) -> Self {
        Self {
            input,
            output,
            variables: HashMap::new(),
            locals: Vec::new(),
            functions: HashMap::new(),
        }
    }

    fn emit(&mut self, value: impl fmt::Display) -> Result<(), Diagnostic> {
        writeln!(self.output, "{value}")
            .map_err(|error| Diagnostic::from(format!("Çıktı yazılamadı: {error}")))
    }

    pub fn execute(&mut self, statement: &Statement) -> Result<(), Diagnostic> {
        match self.execute_statement(statement)? {
            Flow::Continue => Ok(()),
            Flow::Return(_) => Err("dondur bir işlev içinde kullanılmalı.".into()),
        }
    }

    fn execute_block(&mut self, statements: &[Statement]) -> Result<Flow, Diagnostic> {
        for statement in statements {
            if let Flow::Return(value) = self.execute_statement(statement)? {
                return Ok(Flow::Return(value));
            }
        }
        Ok(Flow::Continue)
    }

    fn execute_statement(&mut self, statement: &Statement) -> Result<Flow, Diagnostic> {
        match statement {
            Statement::Located(statement, position) => {
                return self
                    .execute_statement(statement)
                    .map_err(|error| error.at(*position));
            }
            Statement::Function {
                name,
                parameters,
                body,
            } => {
                if matches!(name.as_str(), "yaz" | "girdi" | "sayi" | "metin") {
                    return Err("Yerleşik işlev yeniden tanımlanamaz.".into());
                }
                self.functions.insert(
                    name.clone(),
                    Function {
                        parameters: parameters.clone(),
                        body: body.clone(),
                    },
                );
            }
            Statement::SetIndex {
                object,
                index,
                value,
            } => {
                let Value::List(list) = self.evaluate(object)? else {
                    return Err("İndeks ataması bir liste gerektiriyor.".into());
                };
                let index_value = self.evaluate(index)?;
                let index = Self::list_index(index_value, list.borrow().len())?;
                let value = self.evaluate(value)?;
                if Self::contains_list(&value, &list) {
                    return Err("Döngüsel liste oluşturulamaz.".into());
                }
                list.borrow_mut()[index] = value;
            }
            Statement::Return(expression) => return Ok(Flow::Return(self.evaluate(expression)?)),
            Statement::Assignment { name, value } => {
                let value = self.evaluate(value)?;
                if let Some(scope) = self.locals.last_mut() {
                    scope.insert(name.clone(), value);
                } else {
                    self.variables.insert(name.clone(), value);
                }
            }
            Statement::Expression(expression) => {
                let value = self.evaluate(expression)?;
                if self.locals.is_empty() && !matches!(value, Value::Null) {
                    self.emit(value)?;
                }
            }
            Statement::If {
                condition,
                then_body,
                else_body,
            } => {
                return match self.evaluate(condition)? {
                    Value::Boolean(true) => self.execute_block(then_body),
                    Value::Boolean(false) => self.execute_block(else_body),
                    _ => Err("Koşul mantıksal bir değer olmalı.".into()),
                };
            }
            Statement::While { condition, body } => loop {
                match self.evaluate(condition)? {
                    Value::Boolean(true) => {
                        if let Flow::Return(value) = self.execute_block(body)? {
                            return Ok(Flow::Return(value));
                        }
                    }
                    Value::Boolean(false) => break,
                    _ => return Err("Döngü koşulu mantıksal bir değer olmalı.".into()),
                }
            },
            Statement::Repeat { count, body } => {
                let Value::Number(count) = self.evaluate(count)? else {
                    return Err("Tekrar sayısı negatif olmayan bir tam sayı olmalı.".into());
                };
                if count < 0.0 || count.fract() != 0.0 || count >= usize::MAX as f64 {
                    return Err(
                        "Tekrar sayısı desteklenen aralıkta negatif olmayan bir tam sayı olmalı."
                            .into(),
                    );
                }
                for _ in 0..count as usize {
                    if let Flow::Return(value) = self.execute_block(body)? {
                        return Ok(Flow::Return(value));
                    }
                }
            }
        }
        Ok(Flow::Continue)
    }

    fn list_index(value: Value, length: usize) -> Result<usize, Diagnostic> {
        let Value::Number(index) = value else {
            return Err("Liste indeksi bir tam sayı olmalı.".into());
        };
        if index < 0.0 || index.fract() != 0.0 || index >= length as f64 {
            return Err(format!(
                "Liste indeksi sınır dışında veya tam sayı değil: {index} (uzunluk: {length})."
            )
            .into());
        }
        Ok(index as usize)
    }

    fn contains_list(value: &Value, target: &Rc<RefCell<Vec<Value>>>) -> bool {
        match value {
            Value::List(list) => {
                Rc::ptr_eq(list, target)
                    || list
                        .borrow()
                        .iter()
                        .any(|value| Self::contains_list(value, target))
            }
            _ => false,
        }
    }

    fn call_method(
        &mut self,
        object: Value,
        name: &str,
        arguments: Vec<Value>,
    ) -> Result<Value, Diagnostic> {
        let Value::List(list) = object else {
            return Err("Bu metot bir liste gerektiriyor.".into());
        };
        match (name, arguments.as_slice()) {
            ("uzunluk", []) => Ok(Value::Number(list.borrow().len() as f64)),
            ("ekle", [value]) => {
                if Self::contains_list(value, &list) {
                    return Err("Döngüsel liste oluşturulamaz.".into());
                }
                list.borrow_mut().push(value.clone());
                Ok(Value::Null)
            }
            ("uzunluk", _) => Err("uzunluk argüman almaz.".into()),
            ("ekle", _) => Err("ekle bir argüman bekliyor.".into()),
            _ => Err(format!("Tanımlanmamış liste metodu: {name}").into()),
        }
    }

    fn call(&mut self, name: &str, arguments: Vec<Value>) -> Result<Value, Diagnostic> {
        if let Some(function) = self.functions.get(name).cloned() {
            if arguments.len() != function.parameters.len() {
                return Err(format!(
                    "{name}: {} argüman bekleniyor, {} verildi.",
                    function.parameters.len(),
                    arguments.len()
                )
                .into());
            }
            if self.locals.len() >= 64 {
                return Err("İşlev çağrı derinliği sınırı aşıldı (64).".into());
            }
            let scope = function.parameters.into_iter().zip(arguments).collect();
            self.locals.push(scope);
            let result = self.execute_block(&function.body);
            self.locals.pop();
            return match result? {
                Flow::Return(value) => Ok(value),
                Flow::Continue => Ok(Value::Null),
            };
        }
        self.call_builtin(name, arguments)
    }

    fn call_builtin(&mut self, name: &str, arguments: Vec<Value>) -> Result<Value, Diagnostic> {
        match name {
            "yaz" => {
                let parts: Vec<String> = arguments.iter().map(ToString::to_string).collect();
                self.emit(parts.join(" "))?;
                Ok(Value::Null)
            }
            "girdi" => {
                let prompt = match arguments.as_slice() {
                    [] => "",
                    [Value::Text(prompt)] => prompt.as_str(),
                    _ => return Err("girdi sıfır veya bir metin argümanı bekliyor.".into()),
                };
                write!(self.output, "{prompt}")
                    .and_then(|_| self.output.flush())
                    .map_err(|error| Diagnostic::from(format!("Soru yazılamadı: {error}")))?;
                let mut line = String::new();
                if self
                    .input
                    .read_line(&mut line)
                    .map_err(|error| Diagnostic::from(format!("Girdi okunamadı: {error}")))?
                    == 0
                {
                    return Err("Girdi beklenirken giriş sona erdi.".into());
                }
                if line.ends_with('\n') {
                    line.pop();
                    if line.ends_with('\r') {
                        line.pop();
                    }
                }
                Ok(Value::Text(line))
            }
            "sayi" => {
                let value = match arguments.as_slice() {
                    [Value::Number(value)] => *value,
                    [Value::Text(text)] => text
                        .trim()
                        .parse::<f64>()
                        .map_err(|_| Diagnostic::from("Metin sayıya dönüştürülemedi."))?,
                    _ => return Err("sayi bir sayı veya metin argümanı bekliyor.".into()),
                };
                if !value.is_finite() {
                    return Err("Dönüştürülen sayı desteklenen aralığın dışında.".into());
                }
                Ok(Value::Number(value))
            }
            "metin" => match arguments.as_slice() {
                [value] => Ok(Value::Text(value.to_string())),
                _ => Err("metin bir argüman bekliyor.".into()),
            },
            _ => Err(format!("Tanımlanmamış işlev: {name}").into()),
        }
    }

    fn evaluate(&mut self, expression: &Expr) -> Result<Value, Diagnostic> {
        let result = match expression {
            Expr::Located(expression, position) => {
                return self
                    .evaluate(expression)
                    .map_err(|error| error.at(*position));
            }
            Expr::List(elements) => {
                let mut values = Vec::new();
                for element in elements {
                    values.push(self.evaluate(element)?);
                }
                Value::List(Rc::new(RefCell::new(values)))
            }
            Expr::Index { object, index } => {
                let Value::List(list) = self.evaluate(object)? else {
                    return Err("İndeks erişimi bir liste gerektiriyor.".into());
                };
                let index_value = self.evaluate(index)?;
                let index = Self::list_index(index_value, list.borrow().len())?;
                list.borrow()[index].clone()
            }
            Expr::Method {
                object,
                name,
                arguments,
            } => {
                let object = self.evaluate(object)?;
                let mut values = Vec::new();
                for argument in arguments {
                    values.push(self.evaluate(argument)?);
                }
                self.call_method(object, name, values)?
            }
            Expr::Call { name, arguments } => {
                let mut values = Vec::new();
                for argument in arguments {
                    values.push(self.evaluate(argument)?);
                }
                self.call(name, values)?
            }
            Expr::Null => Value::Null,
            Expr::Number(value) => Value::Number(*value),
            Expr::Boolean(value) => Value::Boolean(*value),
            Expr::Text(text) => Value::Text(text.clone()),
            Expr::Variable(name) => self
                .locals
                .last()
                .and_then(|scope| scope.get(name))
                .or_else(|| self.variables.get(name))
                .cloned()
                .ok_or_else(|| format!("Tanımlanmamış değişken: {name}"))?,
            Expr::Not(operand) => match self.evaluate(operand)? {
                Value::Boolean(value) => Value::Boolean(!value),
                _ => return Err("'degil' mantıksal bir değer gerektiriyor.".into()),
            },
            Expr::Negate(operand) => match self.evaluate(operand)? {
                Value::Number(value) => Value::Number(-value),
                _ => return Err("'-' işareti yalnızca sayılara uygulanabilir.".into()),
            },
            Expr::Positive(operand) => match self.evaluate(operand)? {
                Value::Number(value) => Value::Number(value),
                _ => return Err("'+' işareti yalnızca sayılara uygulanabilir.".into()),
            },
            Expr::Binary {
                left,
                operator,
                right,
            } => {
                let left = self.evaluate(left)?;
                if matches!(operator, Operator::And | Operator::Or) {
                    let Value::Boolean(left) = left else {
                        return Err("'ve' ve 'veya' mantıksal değerler gerektiriyor.".into());
                    };
                    if (matches!(operator, Operator::And) && !left)
                        || (matches!(operator, Operator::Or) && left)
                    {
                        return Ok(Value::Boolean(left));
                    }
                    return match self.evaluate(right)? {
                        Value::Boolean(right) => Ok(Value::Boolean(right)),
                        _ => Err("'ve' ve 'veya' mantıksal değerler gerektiriyor.".into()),
                    };
                }
                let right = self.evaluate(right)?;

                match (left, operator, right) {
                    (left, Operator::Equal, right) => Value::Boolean(left == right),
                    (left, Operator::NotEqual, right) => Value::Boolean(left != right),
                    (Value::Number(left), Operator::Less, Value::Number(right)) => {
                        Value::Boolean(left < right)
                    }
                    (Value::Number(left), Operator::LessEqual, Value::Number(right)) => {
                        Value::Boolean(left <= right)
                    }
                    (Value::Number(left), Operator::Greater, Value::Number(right)) => {
                        Value::Boolean(left > right)
                    }
                    (Value::Number(left), Operator::GreaterEqual, Value::Number(right)) => {
                        Value::Boolean(left >= right)
                    }
                    (
                        _,
                        Operator::Less
                        | Operator::LessEqual
                        | Operator::Greater
                        | Operator::GreaterEqual,
                        _,
                    ) => return Err("Sıralama karşılaştırmaları iki sayı gerektiriyor.".into()),
                    (Value::Number(left), Operator::Add, Value::Number(right)) => {
                        Value::Number(left + right)
                    }
                    (Value::Text(left), Operator::Add, Value::Text(right)) => {
                        Value::Text(left + &right)
                    }
                    (Value::Number(left), Operator::Subtract, Value::Number(right)) => {
                        Value::Number(left - right)
                    }
                    (Value::Number(left), Operator::Multiply, Value::Number(right)) => {
                        Value::Number(left * right)
                    }
                    (Value::Number(left), Operator::Divide, Value::Number(right)) => {
                        if right == 0.0 {
                            return Err("Sıfıra bölme yapılamaz.".into());
                        }
                        Value::Number(left / right)
                    }
                    (_, Operator::Add, _) => {
                        return Err("'+' için iki sayı veya iki metin gerekiyor.".into());
                    }
                    _ => {
                        return Err(
                            "Çıkarma, çarpma ve bölme yalnızca sayılarla yapılabilir.".into()
                        );
                    }
                }
            }
        };

        if let Value::Number(value) = &result
            && !value.is_finite()
        {
            return Err("İşlem sonucu desteklenen sayı aralığının dışında.".into());
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{lexer::tokenize, parser::parse};

    fn calculate(source: &str) -> Result<String, Diagnostic> {
        let statements = parse(&tokenize(source)?)?;
        let mut interpreter = Interpreter::with_output(Vec::new());
        interpreter.execute_block(&statements)?;
        Ok(String::from_utf8(interpreter.output).unwrap())
    }

    #[test]
    fn arithmetic_precedence_signs_and_lines() {
        assert_eq!(calculate("10 + 20 * 3\n(10 + 20) * 3\n20 - 5 - 3\n24 / 4 / 2\n-3 * (2 + 4)\n5 / 2\n1.5 + 2\n--3\n+2\n2 * -3\n1 - -2\n((2 + 3) * 4)").unwrap(), "70\n90\n12\n3\n-18\n2.5\n3.5\n3\n2\n-6\n3\n20\n");
    }

    #[test]
    fn variables_text_and_printing() {
        assert_eq!(calculate("isim = \"Herdem\"\npuan = 10\npuan = puan + 5\nyaz(\"Merhaba\", isim)\nyaz(\"Puanın:\", puan)\nisim = isim + \"!\"\nyaz(isim)\nyaz()\nyaz(\"ilk\\nikinci\")\npuan = \"on\"\npuan").unwrap(), "Merhaba Herdem\nPuanın: 15\nHerdem!\n\nilk\nikinci\non\n");
        assert_eq!(
            calculate("öğrenci_sayısı = 3\n_oran2 = 1.5\n-(öğrenci_sayısı + _oran2) / 2").unwrap(),
            "-2.25\n"
        );
    }

    #[test]
    fn comparisons_and_short_circuit() {
        assert_eq!(calculate("1 + 2 >= 3\n2 < 3\n3 <= 3\n4 > 3\n4 != 3\n\"a\" == \"a\"\ndogru == yanlis\n1 == \"1\"\nyanlis ve (1 / 0 > 1)\ndogru veya eksik\nyanlis veya dogru ve dogru\ndegil 2 > 3\ndegil degil dogru").unwrap(), "dogru\ndogru\ndogru\ndogru\ndogru\ndogru\nyanlis\nyanlis\nyanlis\ndogru\ndogru\ndogru\ndogru\n");
    }

    #[test]
    fn rejects_undefined_names_invalid_types_and_zero_division() {
        for source in [
            "puan",
            "puan = puan + 1",
            "yaz(\"Puan:\", eksik)",
            "1 / 0",
            "1 / (2 - 2)",
            "1 / -0.0",
            "\"a\" + 1",
            "1 + \"a\"",
            "\"a\" - \"b\"",
            "\"a\" * 3",
            "3 / \"a\"",
            "-\"a\"",
            "+\"a\"",
            "dogru + 1",
            "1 < \"a\"",
            "dogru ve eksik",
            "yanlis veya eksik",
            "1 ve dogru",
            "yanlis veya 1",
            "degil 1",
        ] {
            assert!(calculate(source).is_err(), "{source}");
        }
        let large = format!("{}.0", "9".repeat(200));
        assert!(calculate(&format!("{large} * {large}")).is_err());
    }

    #[test]
    fn failed_assignment_and_print_are_atomic() {
        let mut interpreter = Interpreter::with_output(Vec::new());
        let statements =
            parse(&tokenize("isim = \"Herdem\"\nisim = isim + 1\nyaz(isim, eksik)\nisim").unwrap())
                .unwrap();
        interpreter.execute(&statements[0]).unwrap();
        assert!(interpreter.execute(&statements[1]).is_err());
        assert!(interpreter.execute(&statements[2]).is_err());
        assert!(interpreter.output.is_empty());
        interpreter.execute(&statements[3]).unwrap();
        assert_eq!(interpreter.output, b"Herdem\n");
    }

    #[test]
    fn executes_only_selected_branches_and_nested_conditions() {
        assert_eq!(calculate("puan = 70\neger (puan >= 50) {\neger (dogru) { yaz(\"Geçtin\") }\n} degilse { eksik }\neger (yanlis) { 1 / 0 }\ndegilse eger (dogru) { puan = puan + 5 }\npuan").unwrap(), "Geçtin\n75\n");
        assert!(calculate("eger (1) { yaz(1) }").is_err());
        for source in [
            "eger dogru yaz(1)",
            "eger (dogru) { yaz(1)",
            "degilse {}",
            "}",
        ] {
            assert!(calculate(source).is_err(), "{source}");
        }
    }
    #[test]
    fn loops_update_state_and_evaluate_repeat_count_once() {
        assert_eq!(calculate("sayac = 0\niken sayac < 3 {\nyaz(sayac)\nsayac = sayac + 1\n}\ntekrarla sayac { sayac = sayac + 1 }\nsayac\niken yanlis { eksik }\ntekrarla 0 { 1 / 0 }\ntekrarla 2 {\ntekrarla 2 { yaz(\"x\") }\n}").unwrap(), "0\n1\n2\n6\nx\nx\nx\nx\n");
        for source in [
            "iken 1 {}",
            "tekrarla -1 {}",
            "tekrarla 1.5 {}",
            "tekrarla dogru {}",
            "iken dogru { 1 / 0 }",
        ] {
            assert!(calculate(source).is_err(), "{source}");
        }
    }
    #[test]
    fn reads_input_and_converts_values() {
        let source = "isim = girdi(\"Adın: \")\nyas = sayi(girdi(\"Yaşın: \") )\nyaz(isim, yas + 1, metin(dogru))";
        let statements = parse(&tokenize(source).unwrap()).unwrap();
        let mut interpreter =
            Interpreter::with_io(std::io::Cursor::new(" Herdem \r\n18\n"), Vec::new());
        interpreter.execute_block(&statements).unwrap();
        assert_eq!(
            String::from_utf8(interpreter.output).unwrap(),
            "Adın: Yaşın:  Herdem  19 dogru\n"
        );
        for source in [
            "sayi(\"abc\")",
            "sayi(\"NaN\")",
            "sayi(\"inf\")",
            "sayi(dogru)",
            "sayi()",
            "metin()",
            "girdi(1)",
            "girdi(\"a\", \"b\")",
        ] {
            assert!(calculate(source).is_err(), "{source}");
        }
        let statements = parse(&tokenize("girdi()").unwrap()).unwrap();
        let mut interpreter = Interpreter::with_io(std::io::Cursor::new(""), Vec::new());
        assert!(interpreter.execute_block(&statements).is_err());
    }
    #[test]
    fn functions_return_values_recurse_and_stop_nested_control_flow() {
        let source = r#"
islev faktoriyel(n) {
    eger (n <= 1) { dondur 1 }
    dondur n * faktoriyel(n - 1)
}
islev ilk() {
    tekrarla 3 {
        iken dogru { dondur 7 }
    }
    dondur 99
}
islev selam(isim) { yaz("Merhaba", isim) }
yaz(faktoriyel(6), ilk())
sonuc = selam("Herdem")
yaz(sonuc == bos)
islev bitir() { dondur }
yaz(bitir())
"#;
        assert_eq!(
            calculate(source).unwrap(),
            "720 7\nMerhaba Herdem\ndogru\nbos\n"
        );
    }

    #[test]
    fn function_scopes_do_not_leak_or_read_caller_locals() {
        let source = r#"
x = 10
islev oku() { dondur x }
islev cagir(x) {
    yerel = 99
    dondur oku() + x
}
yaz(cagir(20), x)
"#;
        assert_eq!(calculate(source).unwrap(), "30 10\n");
        assert!(calculate(&format!("{source}\nyerel")).is_err());
        let source = "islev hata() { dondur 1 / 0 }\nhata()";
        let statements = parse(&tokenize(source).unwrap()).unwrap();
        let mut interpreter = Interpreter::with_output(Vec::new());
        interpreter.execute(&statements[0]).unwrap();
        assert!(interpreter.execute(&statements[1]).is_err());
        assert!(interpreter.locals.is_empty());
    }

    #[test]
    fn validates_function_definitions_calls_and_return_context() {
        for source in [
            "dondur 1",
            "islev f(a, a) {}",
            "islev f(a,) {}",
            "islev f() { islev g() {} }",
            "islev yaz() {}",
            "islev f(a) { dondur a }\nf()",
            "islev f() {}\nf(1)",
            "bilinmeyen()",
            "islev f() { dondur f() }\nf()",
        ] {
            assert!(calculate(source).is_err(), "{source}");
        }
    }
    #[test]
    fn lists_support_indexing_mutation_methods_and_shared_arguments() {
        let source = r#"
sayilar = [10, 20, 30]
sayilar[1] = 99
sayilar.ekle(40)
yaz(sayilar[0], sayilar.uzunluk(), sayilar)
islev ekle(liste) { liste.ekle(50) }
ekle(sayilar)
yaz(sayilar[4])
icice = [[1, 2], [3]]
icice[0][1] = 8
yaz(icice)
yaz([1, "iki", dogru, bos])
yaz([1, 2] == [1, 2], [] == [])
islev liste() { dondur [7, 8] }
yaz(liste()[1], [].uzunluk())
kopya = sayilar
kopya[0] = 77
yaz(sayilar[0])
"#;
        assert_eq!(
            calculate(source).unwrap(),
            "10 4 [10, 99, 30, 40]\n50\n[[1, 8], [3]]\n[1, \"iki\", dogru, bos]\ndogru dogru\n8 0\n77\n"
        );
    }

    #[test]
    fn rejects_invalid_indices_methods_and_cycles() {
        for source in [
            "[1][-1]",
            "[1][0.5]",
            "[1][1]",
            "[][0]",
            "[1][dogru]",
            "1[0]",
            "a = [1]\na[2] = 3",
            "a = [1]\na[0] = 1 / 0",
            "[1].ekle()",
            "[].uzunluk(1)",
            "1.uzunluk()",
            "a = []\na.ekle(a)",
            "a = [0]\na[0] = a",
            "a = []\nb = [a]\na.ekle(b)",
            "a = [0]\nb = [a]\na[0] = b",
            "[1,]",
            "[1 2]",
            "[1",
            "[1][0",
            "[1].bilinmeyen()",
        ] {
            assert!(calculate(source).is_err(), "{source}");
        }
    }
    #[test]
    fn input_flushes_the_prompt_before_reading() {
        use std::cell::Cell;
        struct CheckedInput {
            data: std::io::Cursor<Vec<u8>>,
            flushed: Rc<Cell<bool>>,
        }
        impl std::io::Read for CheckedInput {
            fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
                self.data.read(bytes)
            }
        }
        impl BufRead for CheckedInput {
            fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
                assert!(
                    self.flushed.get(),
                    "The prompt must be flushed before reading input"
                );
                self.data.fill_buf()
            }
            fn consume(&mut self, amount: usize) {
                self.data.consume(amount);
            }
        }
        struct CheckedOutput {
            data: Vec<u8>,
            flushed: Rc<Cell<bool>>,
        }
        impl Write for CheckedOutput {
            fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                self.data.extend_from_slice(bytes);
                Ok(bytes.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                self.flushed.set(true);
                Ok(())
            }
        }
        let flushed = Rc::new(Cell::new(false));
        let input = CheckedInput {
            data: std::io::Cursor::new(b"Herdem\n".to_vec()),
            flushed: flushed.clone(),
        };
        let output = CheckedOutput {
            data: Vec::new(),
            flushed,
        };
        let mut interpreter = Interpreter::with_io(input, output);
        let statements = parse(&tokenize("yaz(girdi(\"Adın: \"))").unwrap()).unwrap();
        interpreter.execute_block(&statements).unwrap();
        assert_eq!(interpreter.output.data, "Adın: Herdem\n".as_bytes());
    }
}
