import { examples } from './examples.js';
import { DOCUMENT_PREFIX, LAST_DOCUMENT, createDocument, documentUrl, restoreDocument } from './documents.js';
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
let storageFailureShown = false;
function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
const currentDocument = restoreDocument(location.hash, readStorage, (key, value) => localStorage.setItem(key, value));
history.replaceState(null, '', new URL(location.pathname + location.search + '#doc=' + currentDocument.id, location.origin));
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function status(label, state = 'idle') {
  stopButton.hidden = state !== 'running';
  const pane = document.querySelector('.output-pane');
  pane.dataset.state = state;
  pane.setAttribute('aria-label', `Program çıktısı: ${label}`);
  pane.setAttribute('aria-busy', String(state === 'running'));
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
  currentDocument.code = editor.value;
  try { localStorage.setItem(DOCUMENT_PREFIX + currentDocument.id, JSON.stringify(currentDocument)); localStorage.setItem(LAST_DOCUMENT, currentDocument.id); storageFailureShown = false; return true; }
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
  errorLine = null;
}
function openDocument(document) {
  const url = documentUrl(location.href, document);
  const tab = window.open(url, '_blank');
  if (tab) { tab.opener = null; return; }
  // Browsers may block additional popups when multiple files are selected at once.
  const link = window.document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = document.name;
  link.addEventListener('click', () => setTimeout(() => {
    link.remove(); if (!$('pending-tabs').children.length) $('blocked-tabs').hidden = true;
  }, 0));
  $('pending-tabs').append(link); $('blocked-tabs').hidden = false;
}
function setExample(key) {
  if (!examples[key]) return;
  const example = examples[key];
  openDocument(createDocument(example.file, example.code));
  $('examples-menu').open = false;
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
  try {
    const module = await modulePromise;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const activeWorker = worker;
    const finish = () => { activeWorker.terminate(); if (worker === activeWorker) worker = null; clearTimeout(timer); runButton.disabled = !ready; stopButton.disabled = true; };
    activeWorker.onmessage = ({ data }) => {
      if (worker !== activeWorker) return;
      finish();
      $('output').textContent = data.output || '';
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
$('new-file').addEventListener('click', () => openDocument(createDocument()));
$('input-form').addEventListener('submit', (event) => { event.preventDefault(); if (!waiting) return; answers.push($('runtime-input').value); run(true); });
$('open-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async () => {
  for (const file of $('file-input').files) {
    try {
      if (file.size > 65536) throw new Error(`${file.name}: dosya en fazla 64 KB olabilir.`);
      const code = await file.text();
      openDocument(createDocument(file.name, code));
    } catch (error) { toast(error.message); }
  }
  $('file-input').value = '';
});
function downloadFile() {
  const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = currentDocument.name; link.click();
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
editor.value = currentDocument.code;
$('filename').textContent = currentDocument.name;
document.title = `${currentDocument.name} — Kıvıl`;
highlight(); save(); initializeRuntime();
