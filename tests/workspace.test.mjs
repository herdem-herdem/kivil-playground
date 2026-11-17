import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFile, normalizeName, restoreWorkspace, uniqueName } from '../web/workspace.js';
test('migrates legacy drafts without replacing user code', () => {
  const workspace = restoreWorkspace(null, { filename: 'eski.kivil', code: 'yaz("eski taslak")' });
  assert.equal(workspace.files[0].name, 'eski.kivil');
  assert.equal(workspace.files[0].code, 'yaz("eski taslak")');
  assert.equal(workspace.activeId, workspace.files[0].id);
});
test('restores the active file and independent contents', () => {
  const first = restoreWorkspace();
  const second = createFile(first, 'ikinci', 'yaz(2)');
  first.activeId = second.id;
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(first)));
  assert.equal(restored.files.find((file) => file.id === restored.activeId).name, 'ikinci.kivil');
  assert.equal(restored.files[1].code, 'yaz(2)');
  assert.match(restored.files[0].code, /Merhaba/);
});
test('normalizes names, avoids collisions and rejects paths', () => {
  assert.equal(normalizeName('  hesap  '), 'hesap.kivil');
  for (const name of ['', '../x', 'a/b', 'a\\b', '..', 'a'.repeat(81)]) assert.throws(() => normalizeName(name));
  const workspace = restoreWorkspace();
  assert.equal(uniqueName(workspace.files, 'main'), 'main-2.kivil');
  assert.throws(() => createFile(workspace, 'main'));
  for (let i = 1; i < 30; i++) createFile(workspace, 'dosya-' + i);
  assert.throws(() => createFile(workspace, 'fazla'));
});
