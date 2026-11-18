const menu = document.querySelector('#menu-toggle');
menu.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menu.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    document.body.classList.remove('menu-open'); menu.setAttribute('aria-expanded', 'false');
    if (search.value) { search.value = ''; updateSearch(); }
  }
});
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  const source = button.closest('figure').querySelector('pre code').textContent;
  try { await navigator.clipboard.writeText(source); button.textContent = 'Kopyalandı'; }
  catch { button.textContent = 'Kopyalanamadı'; }
  setTimeout(() => { button.textContent = 'Kopyala'; }, 1800);
});
const search = document.querySelector('#search');
const panel = document.querySelector('#search-panel');
const article = document.querySelector('article');
const results = document.querySelector('#search-results');
const normalize = (value) => value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
let entries;
let request;
async function updateSearch() {
  const query = search.value.trim();
  panel.hidden = !query; article.hidden = Boolean(query);
  document.body.classList.toggle('searching', Boolean(query));
  if (!query) return;
  document.querySelector('#search-count').textContent = 'Aranıyor…';
  try {
    request ||= fetch('./search-index.json').then((response) => { if (!response.ok) throw new Error('index'); return response.json(); }).catch((error) => { request = null; throw error; });
    entries ||= await request;
    if (search.value.trim() !== query) return;
    const terms = normalize(query).split(/\s+/);
    const matches = entries.map((e) => ({ ...e, score: terms.reduce((s, t) => s + (normalize(e.title).includes(t) ? 5 : 0), 0) })).filter((e) => terms.every((t) => normalize(e.page + ' ' + e.title + ' ' + e.text).includes(t))).sort((a, b) => b.score - a.score);
    results.replaceChildren();
    document.querySelector('#search-count').textContent = matches.length ? `${matches.length} bölüm bulundu.` : 'Sonuç bulunamadı. Başka bir terim dene.';
    for (const match of matches) {
      const li = document.createElement('li'); const link = document.createElement('a'); const small = document.createElement('small'); const text = document.createElement('p');
      link.href = match.href; link.textContent = match.title; small.textContent = match.page;
      const position = Math.max(0, normalize(match.text).indexOf(terms[0]) - 45);
      text.textContent = (position ? '…' : '') + match.text.slice(position, position + 220) + '…';
      li.append(small, link, text); results.append(li);
    }
  } catch { document.querySelector('#search-count').textContent = 'Arama dizini yüklenemedi. Bölüm menüsünü kullanabilir veya yeniden deneyebilirsin.'; }
}
search.addEventListener('input', updateSearch);
