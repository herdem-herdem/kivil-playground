import { examples } from './examples.js';
import { STORAGE_KEY, createFile, normalizeName, restoreWorkspace, uniqueName } from './workspace.js';
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
let dialogMode = 'new';
let storageFailureShown = false;
const positions = new Map();
function readStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
const workspace = restoreWorkspace(readStorage(STORAGE_KEY), readStorage('kivil-playground-draft-v1'));
function activeFile() { return workspace.files.find((file) => file.id === workspace.activeId); }
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
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
}
function cursor() {
  const prefix = editor.value.slice(0, editor.selectionStart);
  const lines = prefix.split('\n');
  $('cursor-position').textContent = `Satır ${lines.length}, Sütun ${Array.from(lines.at(-1)).length + 1}`;
}
function save() {
  activeFile().code = editor.value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); $('save-status').textContent = 'Kaydedildi'; storageFailureShown = false; return true; }
  catch {
    $('save-status').textContent = 'Kaydedilemedi — dosyanı indir';
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
function renderFiles() {
  $('file-list').replaceChildren(); $('file-tabs').replaceChildren();
  for (const file of workspace.files) {
    const fileButton = document.createElement('button');
    fileButton.className = 'file-item' + (file.id === workspace.activeId ? ' active' : '');
    fileButton.dataset.fileId = file.id; fileButton.title = file.name;
    fileButton.setAttribute('aria-current', file.id === workspace.activeId ? 'true' : 'false');
    const symbol = document.createElement('span'); symbol.className = 'file-symbol'; symbol.textContent = 'K'; symbol.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = file.name;
    fileButton.append(symbol, label); fileButton.addEventListener('click', () => activateFile(file.id));
    $('file-list').append(fileButton);
    const tab = document.createElement('button'); tab.className = 'file-tab'; tab.id = 'tab-' + file.id;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(file.id === workspace.activeId)); tab.setAttribute('aria-controls', 'editor-panel');
    tab.tabIndex = file.id === workspace.activeId ? 0 : -1;
    tab.append(symbol.cloneNode(true), label.cloneNode(true)); tab.addEventListener('click', () => activateFile(file.id));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let index = workspace.files.findIndex((item) => item.id === file.id);
      index = event.key === 'Home' ? 0 : event.key === 'End' ? workspace.files.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + workspace.files.length) % workspace.files.length;
      activateFile(workspace.files[index].id); $('tab-' + workspace.activeId).focus();
    });
    $('file-tabs').append(tab);
  }
  $('editor-panel').setAttribute('aria-labelledby', 'tab-' + workspace.activeId);
  $('file-count').textContent = `${workspace.files.length} dosya`;
}
function setSidebar(open) {
  if (matchMedia('(max-width: 600px)').matches) {
    document.body.dataset.sidebar = open ? 'open' : 'closed';
  } else { document.body.classList.toggle('sidebar-hidden', !open); }
  $('toggle-files').setAttribute('aria-expanded', String(open));
}
function activateFile(id, persist = true) {
  if (!workspace.files.some((file) => file.id === id)) return;
  if (editor.dataset.loaded) {
    activeFile().code = editor.value;
    positions.set(workspace.activeId, { start: editor.selectionStart, end: editor.selectionEnd, top: editor.scrollTop, left: editor.scrollLeft });
  }
  stop('Hazır'); resetOutput(); workspace.activeId = id;
  const file = activeFile(); editor.value = file.code; editor.dataset.loaded = 'true';
  $('filename').textContent = file.name; document.title = `${file.name} — Kıvıl Web IDE`;
  renderFiles(); highlight();
  const position = positions.get(id);
  editor.setSelectionRange(position?.start || 0, position?.end || 0);
  editor.scrollTop = position?.top || 0; editor.scrollLeft = position?.left || 0; syncScroll(); cursor();
  $('tab-' + id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (matchMedia('(max-width: 600px)').matches) setSidebar(false);
  if (persist) save();
}
function setExample(key) {
  if (!examples[key]) return;
  const example = examples[key];
  try {
    const existing = workspace.files.find((file) => file.code === example.code && file.name === example.file);
    const file = existing || createFile(workspace, uniqueName(workspace.files, example.file), example.code);
    activateFile(file.id); $('examples-menu').open = false;
  } catch (error) { toast(error.message); }
}
function openFileDialog(mode) {
  dialogMode = mode; $('file-name-error').textContent = '';
  $('file-dialog-title').textContent = { new: 'Yeni dosya', rename: 'Dosyayı yeniden adlandır', delete: 'Dosyayı sil' }[mode];
  $('file-confirm').textContent = { new: 'Oluştur', rename: 'Kaydet', delete: 'Sil' }[mode];
  $('file-name').value = mode === 'new' ? uniqueName(workspace.files, 'program.kivil') : activeFile().name;
  $('file-name').disabled = mode === 'delete'; $('delete-note').hidden = mode !== 'delete';
  $('file-dialog').showModal();
  if (mode !== 'delete') { $('file-name').focus(); $('file-name').select(); }
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
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (!$('file-dialog').open && !$('guide').open) run(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (save()) toast('Çalışma alanı bu tarayıcıya kaydedildi.'); }
});
runButton.addEventListener('click', () => run()); stopButton.addEventListener('click', () => stop());
document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => setExample(button.dataset.example)));
document.addEventListener('click', (event) => { if (!$('examples-menu').contains(event.target)) $('examples-menu').open = false; });
$('new-file').addEventListener('click', () => openFileDialog('new'));
$('rename-file').addEventListener('click', () => openFileDialog('rename'));
$('delete-file').addEventListener('click', () => openFileDialog('delete'));
$('file-cancel').addEventListener('click', () => $('file-dialog').close());
$('file-dialog-close').addEventListener('click', () => $('file-dialog').close());
$('file-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (dialogMode === 'delete') {
      stop('Hazır'); const id = workspace.activeId;
      workspace.files = workspace.files.filter((file) => file.id !== id); positions.delete(id);
      if (!workspace.files.length) createFile(workspace, 'main.kivil', '');
      workspace.activeId = workspace.files[0].id; delete editor.dataset.loaded;
      activateFile(workspace.activeId);
    } else {
      const name = normalizeName($('file-name').value);
      if (dialogMode === 'new') { const file = createFile(workspace, name); activateFile(file.id); }
      else {
        if (workspace.files.some((file) => file.id !== workspace.activeId && file.name === name)) throw new Error('Bu adla bir dosya zaten var.');
        activeFile().name = name; activateFile(workspace.activeId);
      }
    }
    $('file-dialog').close(); editor.focus();
  } catch (error) { $('file-name-error').textContent = error.message; }
});
$('toggle-files').addEventListener('click', () => setSidebar($('toggle-files').getAttribute('aria-expanded') !== 'true'));
$('sidebar-scrim').addEventListener('click', () => setSidebar(false));
setSidebar(!matchMedia('(max-width: 600px)').matches);
matchMedia('(max-width: 600px)').addEventListener('change', (event) => setSidebar(!event.matches));
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
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = activeFile().name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('clear-output').addEventListener('click', () => { stop('Hazır'); resetOutput(); });
$('goto-error').addEventListener('click', () => {
  const lines = editor.value.split('\n'); const start = lines.slice(0, errorLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
  editor.focus(); editor.setSelectionRange(start, start + (lines[errorLine - 1]?.length || 0)); editor.scrollTop = Math.max(0, (errorLine - 3) * 23); syncScroll(); cursor();
});
$('copy-output').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('output').textContent); toast('Çıktı kopyalandı.'); } catch { toast('Kopyalanamadı. Çıktıyı seçerek kopyalayabilirsin.'); } });
$('guide-open').addEventListener('click', () => $('guide').showModal()); $('guide-close').addEventListener('click', () => $('guide').close());
$('guide').addEventListener('click', (event) => { if (event.target === $('guide')) { const rect = $('guide').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide').close(); } });
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
