import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('./'); await expect(page.locator('#run')).toBeEnabled(); });
test('executes Rust code and shows located errors', async ({ page }) => {
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('Merhaba dünya!');
  await page.locator('#editor').fill('yaz("İstanbul")\n10 / 0');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('İstanbul');
  await expect(page.locator('#error')).toContainText('Satır 2, sütun 4');
});
test('accepts two interactive inputs', async ({ page }) => {
  await page.locator('#examples-menu summary').click();
  await page.getByRole('button', { name: 'Girdi', exact: true }).click();
  await page.locator('#run').click();
  await expect(page.locator('#input-form')).toBeVisible();
  await page.locator('#runtime-input').fill('Ada');
  await page.locator('#input-form').getByRole('button').click();
  await expect(page.locator('#output')).toContainText('Kaç yaşındasın?');
  await page.locator('#runtime-input').fill('18');
  await page.locator('#input-form').getByRole('button').click();
  await expect(page.locator('#output')).toContainText('Gelecek yıl 19');
  await expect(page.locator('#status')).toContainText('Tamamlandı');
});
test('can stop infinite loops and run again', async ({ page }) => {
  await page.locator('#editor').fill('iken dogru {}');
  await page.locator('#run').click();
  await expect(page.locator('#stop')).toBeEnabled();
  await page.locator('#stop').click();
  await expect(page.locator('#status')).toContainText('Durduruldu');
  await page.locator('#editor').fill('yaz("Yeniden")');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('Yeniden\n');
});
test('automatically terminates infinite loops', async ({ page }) => {
  await page.locator('#editor').fill('iken dogru {}');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('5 saniyeyi aştığı', { timeout: 10000 });
  await expect(page.locator('#run')).toBeEnabled();
});
test('saves drafts and supports the run shortcut', async ({ page }) => {
  await page.locator('#editor').fill('yaz("Taslak")');
  await page.reload();
  await expect(page.locator('#editor')).toHaveValue('yaz("Taslak")');
  await expect(page.locator('#run')).toBeEnabled();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#output')).toHaveText('Taslak\n');
});
test('mobile layout stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#run')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('Merhaba dünya!');
});

test('opens independent tabs without naming dialogs and restores them', async ({ page }) => {
  await page.locator('#editor').fill('yaz("birinci")');
  await page.locator('#new-file').click();
  await expect(page.locator('#file-tabs [aria-selected="true"]')).toHaveText('program.kivil');
  await page.locator('#editor').fill('yaz("ikinci")');
  await page.getByRole('tab', { name: 'main.kivil', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('yaz("birinci")');
  await page.getByRole('tab', { name: 'program.kivil', exact: true }).click();
  await page.reload();
  await expect(page.locator('#file-tabs [aria-selected="true"]')).toHaveText('program.kivil');
  await expect(page.locator('#editor')).toHaveValue('yaz("ikinci")');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('ikinci\n');
});

test('every example opens a new tab and preserves user code', async ({ page }) => {
  await page.locator('#editor').fill('yaz("Benim kodum")');
  for (let i = 0; i < 2; i++) {
    await page.locator('#examples-menu summary').click();
    await page.getByRole('button', { name: 'Merhaba dünya', exact: true }).click();
  }
  await expect(page.getByRole('tab')).toHaveCount(3);
  await page.getByRole('tab', { name: 'main.kivil', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('yaz("Benim kodum")');
});

test('closing a tab can be undone, including the last tab', async ({ page }) => {
  await page.locator('#editor').fill('yaz("Korunacak")');
  await page.getByRole('button', { name: 'main.kivil sekmesini kapat' }).click();
  await expect(page.locator('#editor')).toHaveValue('');
  await page.getByRole('button', { name: 'Geri al', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('yaz("Korunacak")');
});

test('imports and downloads files without overwriting existing contents', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({ name: 'main.kivil', mimeType: 'text/plain', buffer: Buffer.from('yaz("Dosyadan")') });
  await expect(page.locator('#file-tabs [aria-selected="true"]')).toHaveText('main-2.kivil');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('main-2.kivil');
  const shortcutDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await shortcutDownload).suggestedFilename()).toBe('main-2.kivil');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('Dosyadan\n');
  await page.locator('#file-input').setInputFiles([
    { name: 'bir.kivil', mimeType: 'text/plain', buffer: Buffer.from('yaz(1)') },
    { name: 'iki.kivil', mimeType: 'text/plain', buffer: Buffer.from('yaz(2)') },
  ]);
  await expect(page.getByRole('tab')).toHaveCount(4);
  await page.getByRole('tab', { name: 'bir.kivil', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('yaz(1)');
  await page.getByRole('tab', { name: 'iki.kivil', exact: true }).click();
  await expect(page.locator('#editor')).toHaveValue('yaz(2)');
});

test('migrates a draft from the previous interface', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('kivil-workspace-v2');
    localStorage.setItem('kivil-playground-draft-v1', JSON.stringify({ filename: 'taslak.kivil', code: 'yaz("Korundu")' }));
  });
  await page.reload();
  await expect(page.locator('#file-tabs [aria-selected="true"]')).toHaveText('taslak.kivil');
  await expect(page.locator('#editor')).toHaveValue('yaz("Korundu")');
});

test('mobile tabs and automatic indentation work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#new-file').click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.locator('#editor').fill('eger (dogru) {}');
  await page.locator('#editor').focus();
  await page.locator('#editor').evaluate((editor) => editor.setSelectionRange(editor.value.length - 1, editor.value.length - 1));
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor')).toHaveValue('eger (dogru) {\n    \n}');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('navigates to errors and resizes the output pane with the keyboard', async ({ page }) => {
  await page.locator('#editor').fill('yaz("önce")\n10 / 0');
  await page.locator('#run').click();
  await page.locator('#goto-error').click();
  expect(await page.locator('#editor').evaluate((editor) => editor.value.slice(editor.selectionStart, editor.selectionEnd))).toBe('10 / 0');
  const previous = Number(await page.locator('#resize-handle').getAttribute('aria-valuenow'));
  await page.locator('#resize-handle').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#resize-handle')).toHaveAttribute('aria-valuenow', String(previous + 2));
  await page.locator('#clear-output').click();
  await expect(page.locator('#empty-output')).toBeVisible();
});

test('reports storage failures without claiming the workspace was saved', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; });
  await page.locator('#editor').fill('yaz("Bellekte")');
  await expect(page.locator('#toast')).toContainText('kaydı kullanılamıyor');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('Bellekte\n');
});

test('keeps only tabs and the requested top-menu actions', async ({ page }) => {
  await expect(page.locator('.sidebar, #guide, #guide-open, #rename-file, #file-dialog, .breadcrumb, .app-statusbar, #file-count')).toHaveCount(0);
  const menu = await page.locator('.app-header nav').innerText();
  expect(menu.indexOf('Örnekler')).toBeLessThan(menu.indexOf('Kaydet'));
  expect(menu.indexOf('Kaydet')).toBeLessThan(menu.indexOf('Yükle'));
  for (const text of ['Dosyaların yalnızca bu tarayıcıda saklanır.', 'Tarayıcıda çalışır · 5 sn sınır', 'Her dosya ayrı çalıştırılır.', 'Çalışma alanım']) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
});
