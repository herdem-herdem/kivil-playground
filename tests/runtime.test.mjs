import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execute } from '../web/engine.js';
import { examples } from '../web/examples.js';
const module = await WebAssembly.compile(await readFile(new URL('../dist/runtime.wasm', import.meta.url)));

test('all examples execute with the real Rust WASM runtime', async () => {
  for (const [name, example] of Object.entries(examples)) {
    const result = await execute(module, example.code, name === 'input' ? 'Ada\n18\n' : '');
    assert.equal(result.error, null, `${name}: ${result.error}`);
    assert.ok(result.output.length > 0);
  }
});
test('browser input pauses and resumes deterministically', async () => {
  const first = await execute(module, examples.input.code);
  assert.equal(first.needsInput, true);
  assert.equal(first.output, 'Adın ne? ');
  const second = await execute(module, examples.input.code, 'Ada\n');
  assert.equal(second.needsInput, true);
  assert.equal(second.consumedInput, 1);
  const third = await execute(module, examples.input.code, 'Ada\n18\n');
  assert.equal(third.needsInput, false);
  assert.equal(third.error, null);
  assert.match(third.output, /Gelecek yıl 19/);
});
test('syntax errors and runtime errors keep Unicode source positions', async () => {
  const result = await execute(module, 'isim = "Ada"\n10 / 0');
  assert.equal(result.line, 2); assert.equal(result.column, 4);
  assert.match(result.error, /Sıfıra/);
  assert.ok((await execute(module, 'eger dogru {}')).error);
  const lex = await execute(module, 'öğrenci @');
  assert.equal(lex.column, 9);
});
test('memory transfers preserve Unicode, escaped output, lists and recursion', async () => {
  const source = `islev f(n) {\neger (n <= 1) { dondur 1 }\ndondur n * f(n - 1)\n}\na = ["İstanbul", 3]\na.ekle(f(6))\nyaz(a)\nyaz("\\\"Türkçe\\\"\\nçığöşü")`;
  const result = await execute(module, source);
  assert.equal(result.error, null);
  assert.match(result.output, /İstanbul/); assert.match(result.output, /720/); assert.match(result.output, /çığöşü/);
});
test('runtime reports output, source, conversion and list limits', async () => {
  for (const source of [' '.repeat(65537), 'sayi("abc")', 'a = []\na.ekle(a)', 'tekrarla 100000 { yaz("test test test") }']) {
    assert.ok((await execute(module, source)).error);
  }
});
