# Kıvıl Playground

Kıvıl programlarını tarayıcıda yazıp çalıştırmak için bağımsız web uygulaması.

**Site:** https://herdem-herdem.github.io/kivil-playground/

Dil motorunun ana deposu: [herdem-herdem/kivil](https://github.com/herdem-herdem/kivil).
Bu repo editörü, Web Worker'ı, WASM adaptörünü ve GitHub Pages yayınını içerir.
Ana dil reposuna web bağımlılıkları eklenmez.

## Yerel geliştirme

Rustup, Node.js 22+ ve npm gereklidir. Rust sürümü `rust-toolchain.toml` ile sabittir.

```sh
npm ci --ignore-scripts
npm run build
npm run dev
```

Önizleme: http://127.0.0.1:4173

## Özellikler

- Türkçe sözdizimi renklendirmeli kod editörü ve satır numaraları.
- Rust yorumlayıcısının gerçek WASM sürümü; JavaScript ile yeniden yazılmış bir dil motoru değildir.
- Merhaba dünya, koşullar, listeler, fonksiyonlar ve girdi örnekleri.
- Satır/sütun bilgili hatalar, çıktı kopyalama, dosya açma/indirme.
- Ctrl/⌘ + Enter kısayolu ve tarayıcıda otomatik taslak saklama.
- Ayrı Web Worker'da çalıştırma, durdurma düğmesi ve 5 saniyelik süre sınırı.
- 64 KB kaynak kodu, 32 KB girdi, 128 KB çıktı ve 64 MB WASM belleği sınırları.
- Mobil ekranlara uyumlu düzen ve klavyeyle kullanılabilen dil rehberi.

Kod ve girdiler tarayıcıda işlenir; çalıştırma için sunucuya gönderilmez.
Sayfa ve WASM dosyası normal statik web istekleriyle indirilir. Yerel taslak
aynı tarayıcıda saklanır; ziyaretçiler arasında veya cihazlar arasında paylaşılmaz.

### Tarayıcıda `girdi()`

WASM adaptörünün girdisi bellek içindeki bir metin akışıdır. Girdi bittiğinde
arayüz yanıt alanını açar. Yeni yanıt, önceki yanıtlarla birlikte programa
verilir ve program baştan yürütülür. Çıktı yenisiyle değiştirilir, yinelenmez.
Mevcut dilde dış dosya/ağ yan etkileri bulunmadığından bu deterministik tekrar
girdi davranışını korur. İleride böyle özellikler eklenirse devam ettirilebilir
bir yürütme modeli tasarlanmalıdır. Her yeniden yürütme için süre sınırı geçerlidir.

### Ana yorumlayıcıyla ilişki

`runtime/vendor/kivil/src/` yalnızca dört Rust modülünün sabit bir sürümünü
barındırır. Kaynak commit ve SHA-256 değerleri `SOURCE.json` içinde kayıtlıdır.
Bu dosyalar doğrudan düzenlenmez. Ana repo ayrı kalır; WASM derlemesinin herkese
sayfa sunabilmesi için private repoya veya ziyaretçi kimliğine erişmesi gerekmez.

Ana dildeki yeni bir commit'i almak için:

```sh
node scripts/sync-runtime.mjs /yerel/kivil/reposu
npm run build
npm test
npm run test:browser
```

Adaptör `runtime/src/lib.rs` içinde standart `Read`/`Write` arayüzlerini kullanır.
JS/WASM bellek sözleşmesi `web/engine.js` içindedir. Sonuçlar JSON olarak kopyalanır;
her çalıştırmanın WASM instance'ı ve worker'ı bağımsızdır.

## Testler

```sh
cargo fmt --manifest-path runtime/Cargo.toml --check
cargo test --manifest-path runtime/Cargo.toml --locked
cargo clippy --manifest-path runtime/Cargo.toml --all-targets -- -D warnings
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

Kurulu Chrome'u kullanmak için `CHROME_EXECUTABLE` ortam değişkenine tarayıcının
çalıştırılabilir dosya yolu verilebilir. CI, Chromium'u kendisi kurar.

## Yayın

`main` dalına push, `.github/workflows/pages.yml` iş akışını başlatır.
İş akışı Playwright ile uyumlu Ubuntu 24.04 üzerinde Rust, WASM ve tarayıcı testlerini çalıştırır; yalnızca `dist/` çıktısını
GitHub Pages'e yayınlar. Pull request'ler test edilir ama yayın yapmaz.
GitHub ayarlarında Pages kaynağı **GitHub Actions** olmalıdır.
