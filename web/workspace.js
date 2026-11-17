export const STORAGE_KEY = 'kivil-workspace-v2';
export function normalizeName(value) {
  const name = value.trim();
  if (!name || name === '.' || name === '..' || /[\\/\x00-\x1f<>:"|?*]/.test(name)) throw new Error('Geçerli bir dosya adı yaz. Klasör yolu kullanma.');
  const result = name.endsWith('.kivil') ? name : name + '.kivil';
  if (result.length > 80) throw new Error('Dosya adı en fazla 80 karakter olabilir.');
  return result;
}
export function uniqueName(files, name) {
  const normalized = normalizeName(name);
  if (!files.some((file) => file.name === normalized)) return normalized;
  const base = normalized.slice(0, -6).slice(0, 65);
  let counter = 2;
  while (files.some((file) => file.name === `${base}-${counter}.kivil`)) counter++;
  return `${base}-${counter}.kivil`;
}
export function createFile(workspace, name, code = '') {
  if (workspace.files.length >= 30) throw new Error('Bir çalışma alanında en fazla 30 dosya olabilir.');
  const normalized = normalizeName(name);
  if (workspace.files.some((file) => file.name === normalized)) throw new Error('Bu adla bir dosya zaten var.');
  const file = { id: crypto.randomUUID(), name: normalized, code };
  workspace.files.push(file);
  return file;
}
export function restoreWorkspace(saved, legacy) {
  const workspace = { files: [], activeId: '' };
  if (saved && Array.isArray(saved.files)) {
    for (const item of saved.files.slice(0, 30)) {
      if (!item || typeof item.code !== 'string' || item.code.length > 1000000) continue;
      let name;
      try { name = uniqueName(workspace.files, String(item.name || 'kurtarilan.kivil')); }
      catch { name = uniqueName(workspace.files, 'kurtarilan.kivil'); }
      const file = createFile(workspace, name, item.code);
      if (item.id === saved.activeId) workspace.activeId = file.id;
    }
  }
  if (!workspace.files.length && legacy && typeof legacy.code === 'string') {
    let name;
    try { name = normalizeName(String(legacy.filename || 'main.kivil')); } catch { name = 'main.kivil'; }
    createFile(workspace, name, legacy.code);
  }
  if (!workspace.files.length) createFile(workspace, 'main.kivil', '# Kıvıl programın\nyaz("Merhaba dünya!")\n');
  workspace.activeId ||= workspace.files[0].id;
  return workspace;
}
