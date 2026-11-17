export const DOCUMENT_PREFIX = 'kivil-document-v3:';
export const LAST_DOCUMENT = 'kivil-last-document-v3';
const validId = (id) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);

function safeName(value) {
  const name = typeof value === 'string' ? value.trim().split(/[\\/]/).at(-1) : '';
  if (!name || name.length > 100 || /[\x00-\x1f<>:"|?*]/.test(name)) return 'program.kivil';
  return name.endsWith('.kivil') ? name : name + '.kivil';
}
export function createDocument(name = 'program.kivil', code = '') {
  return { id: crypto.randomUUID(), name: safeName(name), code };
}
function readJson(read, key) { try { return JSON.parse(read(key)); } catch { return null; } }
function storedDocument(value, id) {
  if (!value || typeof value.code !== 'string' || value.code.length > 1000000) return null;
  return { id: validId(id) ? id : crypto.randomUUID(), name: safeName(value.name || value.filename), code: value.code };
}
export function restoreDocument(hash, read, write = () => {}) {
  const parameters = new URLSearchParams(hash.replace(/^#/, ''));
  const requestedId = parameters.get('doc');
  const initial = parameters.get('source');
  if (initial && initial.length <= 1000000) {
    try {
      const document = storedDocument(JSON.parse(initial), requestedId);
      if (document) return document;
    } catch { /* Invalid fragments do not replace an existing document. */ }
  }
  if (validId(requestedId)) {
    return storedDocument(readJson(read, DOCUMENT_PREFIX + requestedId), requestedId)
      || { id: requestedId, name: 'program.kivil', code: '' };
  }
  const lastId = read(LAST_DOCUMENT);
  if (validId(lastId)) {
    const document = storedDocument(readJson(read, DOCUMENT_PREFIX + lastId), lastId);
    if (document) return document;
  }
  // Keep each old file under its own key without deleting the original workspace backup.
  const workspace = readJson(read, 'kivil-workspace-v2');
  if (workspace && Array.isArray(workspace.files)) {
    let active = null;
    for (const file of workspace.files.slice(0, 30)) {
      const document = storedDocument(file, file?.id);
      if (!document) continue;
      const key = DOCUMENT_PREFIX + document.id;
      if (!read(key)) { try { write(key, JSON.stringify(document)); } catch { /* Backup remains intact. */ } }
      if (file.id === workspace.activeId || !active) active = document;
    }
    if (active) return active;
  }
  const legacy = storedDocument(readJson(read, 'kivil-playground-draft-v1'));
  return legacy || createDocument('main.kivil', '# Kıvıl programın\nyaz("Merhaba dünya!")\n');
}
export function documentUrl(base, document) {
  const url = new URL(base);
  url.hash = new URLSearchParams({ doc: document.id, source: JSON.stringify({ name: document.name, code: document.code }) });
  return url.href;
}
