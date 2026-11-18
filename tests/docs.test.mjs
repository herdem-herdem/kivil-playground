import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { pages } from '../documentation/content.mjs';
import { execute } from '../web/engine.js';
const module = await WebAssembly.compile(await readFile('dist/runtime.wasm'));
for (const page of pages) {
  test(`documentation examples: ${page.slug}`, async () => {
    for (const section of page.sections) for (const block of section.blocks) {
      if (block.kind !== 'code' || block.language) continue;
      const result = await execute(module, block.source, block.input || '');
      if (block.error) assert.ok(result.error?.includes(block.error), `${section.id}: ${result.error}`);
      else assert.equal(result.error, null, `${section.id}: ${result.error}`);
      assert.equal(result.output, block.output, section.id);
      assert.equal(result.needsInput, false);
    }
  });
}
test('all generated documentation links and section anchors resolve', async () => {
  const { resolve, dirname } = await import('node:path');
  for (const page of pages) {
    const file = resolve('dist/docs', `${page.slug}.html`);
    const html = await readFile(file, 'utf8');
    for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|data:)/.test(href)) continue;
      const [path, hash] = href.split('#');
      const target = resolve(dirname(file), path.split('?')[0] || `${page.slug}.html`);
      await access(target);
      if (hash && !hash.includes('=') && !path?.endsWith('/')) {
        const content = target === file ? html : await readFile(target, 'utf8');
        assert.ok(content.includes(`id="${hash}"`), `${page.slug}: ${href}`);
      }
    }
  }
});
