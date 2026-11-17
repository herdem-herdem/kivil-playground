import { examples } from './examples.js';
import { STORAGE_KEY, createFile, restoreWorkspace, uniqueName } from './workspace.js';
const $ = (id) => document.getElementById(id);
const editor = $('editor');
const runButton = $('run');
const stopButton = $('stop');
let worker = null;
let timer = null;
let modulePromise;
let ready = false;
let activeSource = '';
let answers = [];
let waiting = false;
let toastTimer;
let errorLine = null;
let lastClosed = null;
let storageFailureShown = false;
const positions = new Map();
function readStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
const workspace = restoreWorkspace(readStorage(STORAGE_KEY), readStorage('kivil-playground-draft-v1'));
function activeFile() { return workspace.files.find((file) => file.id === workspace.activeId); }
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function status(label, state = 'idle') {
  $('status').replaceChildren(document.createElement('span'), document.createTextNode(label));
  $('status').dataset.state = state;
}
function highlight() {
  const code = editor.value;
  const keywords = new Set(['yaz', 'eger', 'degilse', 'iken', 'tekrarla', 'islev', 'dondur', 've', 'veya', 'degil', 'dogru', 'yanlis', 'bos', 'girdi', 'sayi', 'metin']);
  const fragment = document.createDocumentFragment();
  const pattern = /#[^\n]*|"(?:\\.|[^"\\])*"|[\p{L}_][\p{L}\p{N}_]*|\d+(?:\.\d+)?|[+*/=<>!-]+/gu;
  let previous = 0;
  for (const match of code.matchAll(pattern)) {
    fragment.append(document.createTextNode(code.slice(previous, match.index)));
    const text = match[0];
    const type = text.startsWith('#') ? 'comment' : text.startsWith('"') ? 'string' : /^\d/.test(text) ? 'number' : keywords.has(text) ? 'keyword' : /^[+*/=<>!-]+$/.test(text) ? 'operator' : '';
    const span = document.createElement('span');
    span.className = type;
    span.textContent = text;
    fragment.append(span);
    previous = match.index + text.length;
  }
  fragment.append(document.createTextNode(code.slice(previous) + '\n'));
  $('highlight').firstElementChild.replaceChildren(fragment);
  $('line-numbers').textContent = Array.from({ length: code.split('\n').length }, (_, i) => i + 1).join('\n');
  syncScroll();
  cursor();
}
function syncScroll() {
  $('highlight').scrollTop = editor.scrollTop;
  $('highlight').scrollLeft = editor.scrollLeft;
  $('line-numbers').style.transform = `translateY(${-editor.scrollTop}px)`;
  updateActiveLine();
}
function cursor() {
  const prefix = editor.value.slice(0, editor.selectionStart);
  const lines = prefix.split('\n');
  $('cursor-position').textContent = `Satır ${lines.length}, Sütun ${Array.from(lines.at(-1)).length + 1}`;
  updateActiveLine();
}
function updateActiveLine() {
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight);
  const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
  $('editor-shell').style.setProperty('--active-line-top', `${parseFloat(style.paddingTop) + line * lineHeight - editor.scrollTop}px`);
}
window.addEventListener('resize', updateActiveLine);
function save() {
  activeFile().code = editor.value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); storageFailureShown = false; return true; }
  catch {
    if (!storageFailureShown) toast('Tarayıcı kaydı kullanılamıyor. Dosyalarını indirerek saklayabilirsin.');
    storageFailureShown = true; return false;
  }
}
function stop(label = 'Durduruldu') {
  if (worker) worker.terminate(); worker = null; clearTimeout(timer);
  waiting = false; $('input-form').hidden = true;
  runButton.disabled = !ready; stopButton.disabled = true; status(label);
}
function resetOutput() {
  $('empty-output').hidden = false; $('output').hidden = true; $('output').textContent = '';
  $('error').hidden = true; $('error').textContent = ''; $('goto-error').hidden = true;
  $('duration').textContent = '—'; errorLine = null;
}
function closeFile(id) {
  if (!workspace.files.some((file) => file.id === id)) return;
  activeFile().code = editor.value;
  const index = workspace.files.findIndex((file) => file.id === id);
  lastClosed = { file: workspace.files[index], index };
  const wasActive = id === workspace.activeId;
  workspace.files.splice(index, 1); positions.delete(id);
  if (!workspace.files.length) createFile(workspace, 'main.kivil', '');
  if (wasActive) {
    workspace.activeId = workspace.files[Math.min(index, workspace.files.length - 1)].id;
    delete editor.dataset.loaded;
    activateFile(workspace.activeId);
  } else { renderFiles(); save(); }
  toast('Sekme kapatıldı.');
  const undo = document.createElement('button'); undo.textContent = 'Geri al';
  undo.addEventListener('click', () => {
    if (!lastClosed || workspace.files.length >= 30) return;
    const restored = lastClosed.file;
    restored.name = uniqueName(workspace.files, restored.name);
    workspace.files.splice(lastClosed.index, 0, restored); lastClosed = null;
    activateFile(restored.id); $('toast').hidden = true;
  });
  $('toast').append(undo);
}
function renderFiles() {
  $('file-tabs').replaceChildren();
  for (const file of workspace.files) {
    const item = document.createElement('div'); item.className = 'tab-item'; item.setAttribute('role', 'presentation');
    const tab = document.createElement('button'); tab.className = 'file-tab'; tab.id = 'tab-' + file.id;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(file.id === workspace.activeId)); tab.setAttribute('aria-controls', 'editor-panel');
    tab.tabIndex = file.id === workspace.activeId ? 0 : -1;
    const fileIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fileIcon.setAttribute('viewBox', '0 0 16 18'); fileIcon.setAttribute('aria-hidden', 'true'); fileIcon.classList.add('tab-file-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M9.5 1.5h-6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-10Zm0 0v4h4M5.5 9h5m-5 3h3');
    fileIcon.append(path);
    const fileLabel = document.createElement('span'); fileLabel.className = 'tab-label'; fileLabel.textContent = file.name;
    tab.append(fileIcon, fileLabel); tab.title = file.name;
    tab.addEventListener('click', () => activateFile(file.id));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Delete') { event.preventDefault(); closeFile(file.id); return; }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let index = workspace.files.findIndex((item) => item.id === file.id);
      index = event.key === 'Home' ? 0 : event.key === 'End' ? workspace.files.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + workspace.files.length) % workspace.files.length;
      activateFile(workspace.files[index].id); $('tab-' + workspace.activeId).focus();
    });
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', `${file.name} sekmesini kapat`);
    close.addEventListener('click', () => closeFile(file.id));
    item.classList.toggle('active', file.id === workspace.activeId);
    item.append(tab, close); $('file-tabs').append(item);
  }
  $('editor-panel').setAttribute('aria-labelledby', 'tab-' + workspace.activeId);
}
function activateFile(id, persist = true) {
  if (!workspace.files.some((file) => file.id === id)) return;
  if (editor.dataset.loaded) {
    activeFile().code = editor.value;
    positions.set(workspace.activeId, { start: editor.selectionStart, end: editor.selectionEnd, top: editor.scrollTop, left: editor.scrollLeft });
  }
  stop('Hazır'); resetOutput(); workspace.activeId = id;
  const file = activeFile(); editor.value = file.code; editor.dataset.loaded = 'true';
  document.title = `${file.name} — Kıvıl Web IDE`;
  renderFiles(); highlight();
  const position = positions.get(id);
  editor.setSelectionRange(position?.start || 0, position?.end || 0);
  editor.scrollTop = position?.top || 0; editor.scrollLeft = position?.left || 0; syncScroll(); cursor();
  $('tab-' + id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (persist) save();
}
function setExample(key) {
  if (!examples[key]) return;
  const example = examples[key];
  try {
    const file = createFile(workspace, uniqueName(workspace.files, example.file), example.code);
    activateFile(file.id); $('examples-menu').open = false;
  } catch (error) { toast(error.message); }
}
async function initializeRuntime() {
  ready = false;
  runButton.disabled = true;
  status('Dil hazırlanıyor');
  modulePromise = (async () => {
    const response = await fetch(new URL('./runtime.wasm', import.meta.url));
    if (!response.ok) throw new Error('WASM indirilemedi');
    return WebAssembly.compile(await response.arrayBuffer());
  })();
  try {
    await modulePromise;
    ready = true;
    runButton.disabled = false;
    status('Hazır');
  } catch {
    status('Yüklenemedi', 'error');
    $('empty-output').hidden = true;
    $('error').hidden = false;
    $('error').textContent = 'Kıvıl yüklenemedi. Bağlantını kontrol edip sayfayı yenile.';
  }
}
async function run(replay = false) {
  if (!ready || worker) return;
  if (!replay) { activeSource = editor.value; answers = []; }
  if (new TextEncoder().encode(activeSource).length > 65536) { toast('Kod en fazla 64 KB olabilir.'); return; }
  waiting = false;
  $('input-form').hidden = true;
  $('empty-output').hidden = true;
  $('output').hidden = false;
  $('output').textContent = '';
  $('error').hidden = true;
  $('error').textContent = '';
  $('goto-error').hidden = true;
  runButton.disabled = true;
  stopButton.disabled = false;
  status('Çalışıyor', 'running');
  $('duration').textContent = '…';
  try {
    const module = await modulePromise;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const activeWorker = worker;
    const finish = () => { activeWorker.terminate(); if (worker === activeWorker) worker = null; clearTimeout(timer); runButton.disabled = !ready; stopButton.disabled = true; };
    activeWorker.onmessage = ({ data }) => {
      if (worker !== activeWorker) return;
      finish();
      $('output').textContent = data.output || '';
      $('duration').textContent = typeof data.elapsed === 'number' ? `${data.elapsed < 1 ? '<1' : data.elapsed.toFixed(0)} ms` : '—';
      if (data.needsInput) {
        waiting = true;
        status('Girdi bekleniyor', 'input');
        $('input-form').hidden = false;
        $('runtime-input').value = '';
        stopButton.disabled = false;
        $('runtime-input').focus();
      } else if (data.error) {
        status('Hata', 'error');
        $('error').hidden = false;
        const location = data.line ? `Satır ${data.line}, sütun ${data.column}\n` : '';
        $('error').textContent = location + data.error;
        errorLine = data.line;
        $('goto-error').hidden = !errorLine;
      } else { status('Tamamlandı', 'done'); }
      $('output-body').scrollTop = $('output-body').scrollHeight;
    };
    activeWorker.onerror = () => { finish(); status('Çalıştırma hatası', 'error'); $('error').hidden = false; $('error').textContent = 'Program başlatılamadı. Sayfayı yenileyip tekrar dene.'; };
    timer = setTimeout(() => {
      if (worker !== activeWorker) return;
      finish(); status('Süre sınırı', 'error');
      $('duration').textContent = '5 sn';
      $('error').hidden = false;
      $('error').textContent = 'Program 5 saniyeyi aştığı için durduruldu. Döngü koşullarını kontrol et.';
    }, 5000);
    activeWorker.postMessage({ module, source: activeSource, input: answers.length ? answers.join('\n') + '\n' : '' });
  } catch {
    stop('Çalıştırılamadı');
    $('error').hidden = false;
    $('error').textContent = 'Tarayıcı çalıştırma alanını başlatamadı.';
  }
}

editor.addEventListener('input', () => { highlight(); save(); if (waiting) stop('Kod değişti; yeniden çalıştır'); });
editor.addEventListener('scroll', syncScroll);
editor.addEventListener('click', cursor); editor.addEventListener('keyup', cursor);
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = editor.selectionStart, end = editor.selectionEnd;
    if (start === end && !event.shiftKey) editor.setRangeText('    ', start, end, 'end');
    else {
      const lineStart = start === 0 ? 0 : editor.value.lastIndexOf('\n', start - 1) + 1;
      const block = editor.value.slice(lineStart, end);
      const updated = block.split('\n').map((line) => event.shiftKey ? line.replace(/^ {1,4}/, '') : '    ' + line).join('\n');
      editor.setRangeText(updated, lineStart, end, 'select');
    }
    editor.dispatchEvent(new Event('input'));
  }
  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const start = editor.selectionStart;
    const prefix = editor.value.slice(0, start).split('\n').at(-1);
    const base = prefix.match(/^\s*/)[0];
    const indent = base + (prefix.trimEnd().endsWith('{') ? '    ' : '');
    const closing = prefix.trimEnd().endsWith('{') && editor.value.slice(editor.selectionEnd).startsWith('}');
    editor.setRangeText('\n' + indent + (closing ? '\n' + base : ''), start, editor.selectionEnd, 'end');
    if (closing) editor.setSelectionRange(start + 1 + indent.length, start + 1 + indent.length);
    editor.dispatchEvent(new Event('input'));
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); downloadFile(); }
});
runButton.addEventListener('click', () => run()); stopButton.addEventListener('click', () => stop());
document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => setExample(button.dataset.example)));
document.addEventListener('click', (event) => { if (!$('examples-menu').contains(event.target)) $('examples-menu').open = false; });
$('new-file').addEventListener('click', () => {
  try { const file = createFile(workspace, uniqueName(workspace.files, 'program.kivil')); activateFile(file.id); editor.focus(); }
  catch (error) { toast(error.message); }
});
$('input-form').addEventListener('submit', (event) => { event.preventDefault(); if (!waiting) return; answers.push($('runtime-input').value); run(true); });
$('open-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async () => {
  for (const file of $('file-input').files) {
    try {
      if (file.size > 65536) throw new Error(`${file.name}: dosya en fazla 64 KB olabilir.`);
      const code = await file.text();
      const added = createFile(workspace, uniqueName(workspace.files, file.name), code);
      activateFile(added.id);
    } catch (error) { toast(error.message); }
  }
  $('file-input').value = '';
});
function downloadFile() {
  const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = activeFile().name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('download').addEventListener('click', downloadFile);
$('clear-output').addEventListener('click', () => { stop('Hazır'); resetOutput(); });
$('goto-error').addEventListener('click', () => {
  const lines = editor.value.split('\n'); const start = lines.slice(0, errorLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
  editor.focus(); editor.setSelectionRange(start, start + (lines[errorLine - 1]?.length || 0)); editor.scrollTop = Math.max(0, (errorLine - 3) * parseFloat(getComputedStyle(editor).lineHeight)); syncScroll(); cursor();
});
$('copy-output').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('output').textContent); toast('Çıktı kopyalandı.'); } catch { toast('Kopyalanamadı. Çıktıyı seçerek kopyalayabilirsin.'); } });
const resizer = $('resize-handle');
function resizeOutput(clientX) {
  const rect = $('panes').getBoundingClientRect();
  const percentage = Math.max(25, Math.min(60, (rect.right - clientX) / rect.width * 100));
  document.documentElement.style.setProperty('--output-width', percentage + '%'); resizer.setAttribute('aria-valuenow', String(Math.round(percentage)));
}
resizer.addEventListener('pointerdown', (event) => { resizer.setPointerCapture(event.pointerId); resizer.dataset.dragging = 'true'; });
resizer.addEventListener('pointermove', (event) => { if (resizer.dataset.dragging) resizeOutput(event.clientX); });
resizer.addEventListener('pointerup', () => { delete resizer.dataset.dragging; });
resizer.addEventListener('lostpointercapture', () => { delete resizer.dataset.dragging; });
resizer.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault();
  const current = Number(resizer.getAttribute('aria-valuenow')); const value = Math.max(25, Math.min(60, current + (event.key === 'ArrowLeft' ? 2 : -2)));
  document.documentElement.style.setProperty('--output-width', value + '%'); resizer.setAttribute('aria-valuenow', String(value));
});
$('shortcut-key').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
activateFile(workspace.activeId); initializeRuntime();
