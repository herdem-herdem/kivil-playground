import { test, expect } from '@playwright/test';

async function openExample(page, name) {
  await page.locator('#examples-menu summary').click();
  const created = page.context().waitForEvent('page');
  await page.getByRole('button', { name, exact: true }).click();
  const child = await created;
  await expect(child.locator('#run')).toBeEnabled();
  return child;
}

test.beforeEach(async ({ page }) => { await page.goto('./', { waitUntil: 'domcontentloaded' }); await expect(page.locator('#run')).toBeEnabled(); });

test('runs source and reports located errors', async ({ page }) => {
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('Merhaba dünya!');
  await page.locator('#editor').fill('yaz("İstanbul")\n10 / 0');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('İstanbul');
  await expect(page.locator('#error')).toContainText('Satır 2, sütun 4');
});

test('examples open actual browser tabs and accept interactive input', async ({ page }) => {
  const child = await openExample(page, 'Girdi');
  await expect(child).toHaveTitle('girdi.kivil — Kıvıl');
  await child.locator('#run').click();
  await expect(child.locator('#input-form')).toBeVisible();
  await child.locator('#runtime-input').fill('Ada');
  await child.locator('#input-form').getByRole('button').click();
  await expect(child.locator('#output')).toContainText('Kaç yaşındasın?');
  await child.locator('#runtime-input').fill('18');
  await child.locator('#input-form').getByRole('button').click();
  await expect(child.locator('#output')).toContainText('Gelecek yıl 19');
});

test('each example creates a new browser page without replacing the original', async ({ page }) => {
  await page.locator('#editor').fill('yaz("Benim kodum")');
  const first = await openExample(page, 'Merhaba dünya');
  const second = await openExample(page, 'Merhaba dünya');
  expect(page.context().pages()).toHaveLength(3);
  expect(first.url()).not.toBe(second.url());
  await expect(page.locator('#editor')).toHaveValue('yaz("Benim kodum")');
  expect(await first.evaluate(() => window.opener)).toBeNull();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('new browser tabs save independently across reloads', async ({ page }) => {
  await page.locator('#editor').fill('yaz("ana dosya")');
  const created = page.context().waitForEvent('page');
  await page.locator('#new-file').click();
  const child = await created;
  await expect(child.locator('#run')).toBeEnabled();
  await expect(child.locator('#editor')).toHaveValue('');
  await child.locator('#editor').fill('yaz("diğer dosya")');
  await page.reload({ waitUntil: 'domcontentloaded' }); await child.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#editor')).toHaveValue('yaz("ana dosya")');
  await expect(child.locator('#editor')).toHaveValue('yaz("diğer dosya")');
  expect(new URL(page.url()).hash).not.toBe(new URL(child.url()).hash);
  expect(child.url()).not.toContain('source=');
});

test('uploaded files open separate browser pages and save as .kivil', async ({ page }) => {
  await page.locator('#editor').fill('yaz("ana dosya")');
  await page.locator('#file-input').setInputFiles([
    { name: 'bir.kivil', mimeType: 'text/plain', buffer: Buffer.from('yaz(1)') },
    { name: 'iki.kivil', mimeType: 'text/plain', buffer: Buffer.from('yaz(2)') },
  ]);
  await expect.poll(async () => page.context().pages().length + await page.locator('#pending-tabs a').count()).toBe(3);
  while (await page.locator('#pending-tabs a').count()) {
    const created = page.context().waitForEvent('page');
    await page.locator('#pending-tabs a').first().click();
    await created;
  }
  const children = page.context().pages().filter((item) => item !== page);
  expect(children).toHaveLength(2);
  for (const child of children) {
    await expect(child.locator('#run')).toBeEnabled();
    const name = await child.locator('#filename').innerText();
    await expect(child.locator('#editor')).toHaveValue(name === 'bir.kivil' ? 'yaz(1)' : 'yaz(2)');
  }
  const first = children.find((child) => child.url() !== page.url());
  const filename = await first.locator('#filename').innerText();
  const saved = first.waitForEvent('download');
  await first.locator('#download').click();
  expect((await saved).suggestedFilename()).toBe(filename);
  await expect(page.locator('#editor')).toHaveValue('yaz("ana dosya")');
});

test('blocked browser popups leave a working explicit link', async ({ page }) => {
  await page.evaluate(() => { window.open = () => null; });
  await page.locator('#examples-menu summary').click();
  await page.getByRole('button', { name: 'Koşullar', exact: true }).click();
  await expect(page.locator('#blocked-tabs')).toBeVisible();
  const created = page.context().waitForEvent('page');
  await page.locator('#pending-tabs a').click();
  const child = await created;
  await expect(child.locator('#filename')).toHaveText('kosullar.kivil');
});

test('can stop infinite loops and run again', async ({ page }) => {
  await page.locator('#editor').fill('iken dogru {}');
  await page.locator('#run').click();
  await expect(page.locator('#stop')).toBeEnabled();
  await page.locator('#stop').click();
  await page.locator('#editor').fill('yaz("Yeniden")');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('Yeniden\n');
});

test('automatically terminates infinite loops', async ({ page }) => {
  await page.locator('#editor').fill('iken dogru {}');
  await page.locator('#run').click();
  await expect(page.locator('#error')).toContainText('5 saniyeyi aştığı', { timeout: 10000 });
});

test('run and save keyboard shortcuts work', async ({ page }) => {
  await page.locator('#editor').fill('yaz("Taslak")');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#run')).toBeEnabled();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#output')).toHaveText('Taslak\n');
  const saved = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await saved).suggestedFilename()).toBe('main.kivil');
});

test('mobile header controls and indentation stay usable', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const selector of ['#run', '#download', '#open-file', '#new-file', '#stop']) await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
  }
  await page.locator('#editor').fill('eger (dogru) {}');
  await page.locator('#editor').focus();
  await page.locator('#editor').evaluate((editor) => editor.setSelectionRange(editor.value.length - 1, editor.value.length - 1));
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor')).toHaveValue('eger (dogru) {\n    \n}');
});

test('previous drafts migrate without deleting their backup', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kivil-playground-draft-v1', JSON.stringify({ filename: 'taslak.kivil', code: 'yaz("Korundu")' }));
    history.replaceState(null, '', location.pathname + location.search);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#filename')).toHaveText('taslak.kivil');
  await expect(page.locator('#editor')).toHaveValue('yaz("Korundu")');
  expect(await page.evaluate(() => localStorage.getItem('kivil-playground-draft-v1'))).not.toBeNull();
});

test('error navigation and panel resizing still work', async ({ page }) => {
  await page.locator('#editor').fill('yaz("önce")\n10 / 0');
  await page.locator('#run').click();
  await page.locator('#goto-error').click();
  expect(await page.locator('#editor').evaluate((editor) => editor.value.slice(editor.selectionStart, editor.selectionEnd))).toBe('10 / 0');
  await page.locator('#resize-handle').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#resize-handle')).toHaveAttribute('aria-valuenow', '38');
});

test('keeps removed UI out of the page', async ({ page }) => {
  await expect(page.locator('.sidebar, #guide, #rename-file, #file-dialog, .breadcrumb, .app-statusbar, #file-count, #file-tabs, .tabs-bar, .output-footer, #status, #duration')).toHaveCount(0);
  const menu = await page.locator('.app-header nav').innerText();
  expect(menu.indexOf('Örnekler')).toBeLessThan(menu.indexOf('Kaydet'));
  expect(menu.indexOf('Kaydet')).toBeLessThan(menu.indexOf('Yükle'));
});
