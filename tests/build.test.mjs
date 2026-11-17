import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('published HTML, workers and module imports use the same asset version', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  const version = html.match(/app\.js\?v=([0-9a-f]{12})/)[1];
  assert.ok(html.includes(`style.css?v=${version}`));
  for (const file of ['app.js', 'worker.js']) {
    const source = await readFile(`dist/${file}`, 'utf8');
    const references = [...source.matchAll(/['"]\.\/[^'"]+\.(?:js|wasm)(?:\?v=([0-9a-f]{12}))?['"]/g)];
    assert.ok(references.length);
    for (const reference of references) assert.equal(reference[1], version);
  }
});
