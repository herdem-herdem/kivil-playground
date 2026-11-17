import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_PREFIX, LAST_DOCUMENT, createDocument, documentUrl, restoreDocument } from '../web/documents.js';
test('each new document has an independent browser identity', () => {
  const a = createDocument('aynı.kivil', 'yaz(1)');
  const b = createDocument('aynı.kivil', 'yaz(2)');
  assert.notEqual(a.id, b.id);
  const url = new URL(documentUrl('https://example.com/kivil/?v=1', a));
  assert.equal(url.search, '?v=1');
  assert.ok(!url.search.includes('yaz'));
  const restored = restoreDocument(url.hash, () => null);
  assert.deepEqual(restored, a);
});
test('restores only the document requested by the browser tab', () => {
  const a = createDocument('bir.kivil', 'yaz(1)');
  const b = createDocument('iki.kivil', 'yaz(2)');
  const values = new Map([[DOCUMENT_PREFIX + a.id, JSON.stringify(a)], [DOCUMENT_PREFIX + b.id, JSON.stringify(b)], [LAST_DOCUMENT, b.id]]);
  assert.deepEqual(restoreDocument('#doc=' + a.id, (key) => values.get(key)), a);
});
test('preserves old workspaces and standalone drafts', () => {
  const a = createDocument('eski.kivil', 'yaz("eski")');
  const values = new Map([['kivil-workspace-v2', JSON.stringify({ files: [a], activeId: a.id })]]);
  assert.deepEqual(restoreDocument('', (key) => values.get(key), (key, value) => values.set(key, value)), a);
  assert.ok(values.has('kivil-workspace-v2'));
  assert.ok(values.has(DOCUMENT_PREFIX + a.id));
  const legacy = restoreDocument('', (key) => key === 'kivil-playground-draft-v1' ? JSON.stringify({ filename: 'taslak.kivil', code: 'yaz(3)' }) : null);
  assert.equal(legacy.name, 'taslak.kivil'); assert.equal(legacy.code, 'yaz(3)');
});
test('invalid fragments do not prevent starting the editor', () => {
  assert.equal(restoreDocument('#source=invalid', () => null).name, 'main.kivil');
});
