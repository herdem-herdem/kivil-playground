import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('./'); await expect(page.locator('#run')).toBeEnabled(); });
test('executes Rust code and shows located errors', async ({ page }) => {
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('Bugünkü puanın: 70');
  await page.locator('#editor').fill('yaz("İstanbul")\n10 / 0');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('İstanbul');
  await expect(page.locator('#error')).toContainText('Satır 2, sütun 4');
});
test('accepts two interactive inputs', async ({ page }) => {
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
test('saves drafts, supports keyboard shortcut and opens the guide', async ({ page }) => {
  await page.locator('#editor').fill('yaz("Taslak")');
  await page.reload();
  await expect(page.locator('#editor')).toHaveValue('yaz("Taslak")');
  await expect(page.locator('#run')).toBeEnabled();
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#output')).toHaveText('Taslak\n');
  await page.getByRole('button', { name: 'Dil rehberi' }).click();
  await expect(page.locator('#guide')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide')).not.toBeVisible();
});
test('mobile layout stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#run')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('Merhaba Dünya');
});
