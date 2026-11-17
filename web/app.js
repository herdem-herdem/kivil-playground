import { examples } from './examples.js';
const $ = (id) => document.getElementById(id);
const editor = $('editor');
const runButton = $('run');
const stopButton = $('stop');
let selected = 'hello';
let worker = null;
let timer = null;
let modulePromise;
let ready = false;
let activeSource = '';
let answers = [];
let waiting = false;
let toastTimer;

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2500);
}
function status(label, state = 'idle') {
  $('status').replaceChildren(Object.assign(document.createElement('span'), {}), document.createTextNode(label));
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
  try { localStorage.setItem('kivil-playground-draft-v1', JSON.stringify({ code: editor.value, selected, filename: $('filename').textContent })); $('save-status').textContent = 'Taslak kaydedildi'; }
  catch { $('save-status').textContent = 'Yerel taslak'; }
}
function stop(label = 'Durduruldu') {
  if (worker) worker.terminate();
  worker = null;
  clearTimeout(timer);
  waiting = false;
  $('input-form').hidden = true;
  runButton.disabled = !ready;
  stopButton.disabled = true;
  status(label);
}
function resetOutput() {
  $('empty-output').hidden = false;
  $('output').hidden = true;
  $('output').textContent = '';
  $('error').hidden = true;
  $('error').textContent = '';
  $('duration').textContent = '—';
}
function setExample(key, persist = true) {
  if (!examples[key]) return;
  stop('Hazır');
  selected = key;
  editor.value = examples[key].code;
  editor.scrollTop = editor.scrollLeft = 0;
  $('filename').textContent = examples[key].file;
  document.querySelectorAll('[data-example]').forEach((button) => { button.classList.toggle('active', button.dataset.example === key); button.setAttribute('aria-pressed', String(button.dataset.example === key)); });
  highlight();
  resetOutput();
  if (persist) save();
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
editor.addEventListener('click', cursor);
editor.addEventListener('keyup', cursor);
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') { event.preventDefault(); editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
});
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run(); } });
runButton.addEventListener('click', () => run());
stopButton.addEventListener('click', () => stop());
document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => setExample(button.dataset.example)));
$('reset').addEventListener('click', () => setExample(selected));
$('input-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!waiting) return;
  answers.push($('runtime-input').value);
  run(true);
});
$('open-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async () => {
  const file = $('file-input').files[0];
  if (!file) return;
  if (file.size > 65536) { toast('Dosya en fazla 64 KB olabilir.'); return; }
  stop('Hazır'); resetOutput();
  editor.value = await file.text();
  $('filename').textContent = file.name;
  document.querySelectorAll('[data-example]').forEach((button) => { button.classList.remove('active'); button.setAttribute('aria-pressed', 'false'); });
  highlight(); save(); $('file-input').value = '';
});
$('download').addEventListener('click', () => {
  const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url;
  const name = $('filename').textContent;
  link.download = name.endsWith('.kivil') ? name : name + '.kivil'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('copy-output').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('output').textContent); toast('Çıktı kopyalandı.'); } catch { toast('Kopyalanamadı. Çıktıyı seçerek kopyalayabilirsin.'); } });
$('guide-open').addEventListener('click', () => $('guide').showModal());
$('guide-close').addEventListener('click', () => $('guide').close());
$('guide').addEventListener('click', (event) => { if (event.target === $('guide')) { const rect = $('guide').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('guide').close(); } });
document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => setExample({ print: 'hello', condition: 'conditions', function: 'functions' }[button.dataset.guide])));
$('shortcut-key').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
setExample('hello', false);
try {
  const saved = JSON.parse(localStorage.getItem('kivil-playground-draft-v1'));
  if (saved && typeof saved.code === 'string' && new TextEncoder().encode(saved.code).length <= 65536) {
    selected = examples[saved.selected] ? saved.selected : 'hello';
    editor.value = saved.code;
    $('filename').textContent = typeof saved.filename === 'string' ? saved.filename : examples[selected].file;
    document.querySelectorAll('[data-example]').forEach((button) => { const active = button.dataset.example === selected && saved.code === examples[selected].code; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    highlight();
  }
} catch { /* Local storage is optional. */ }
initializeRuntime();
