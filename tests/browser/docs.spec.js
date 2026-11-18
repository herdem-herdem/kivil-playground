import { test, expect } from '@playwright/test';
test('documentation search finds technical rules and keeps section links', async ({ page }) => {
  await page.goto('./docs/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Kıvıl dokümantasyonu', exact: true })).toBeVisible();
  await page.getByLabel('Belgelerde ara').fill('kısa devre');
  await expect(page.locator('#search-results a').filter({ hasText: 'Mantık ve kısa devre' })).toBeVisible();
  await page.locator('#search-results a').filter({ hasText: 'Mantık ve kısa devre' }).click();
  await expect(page).toHaveURL(/ifadeler.html#kisa-devre/);
  await expect(page.locator('#kisa-devre')).toBeVisible();
  await expect(page.locator('.chapters [aria-current="page"]')).toHaveText('İfadeler ve operatörler');
});
test('documentation example opens a real editor tab and executes', async ({ page }) => {
  await page.goto('./docs/', { waitUntil: 'domcontentloaded' });
  const created = page.context().waitForEvent('page');
  await page.getByRole('link', { name: 'Editörde aç ↗' }).first().click();
  const editor = await created;
  await expect(editor.locator('#editor')).toHaveValue(/islev kare/);
  await expect(editor.locator('#run')).toBeEnabled();
  await editor.locator('#run').click();
  await expect(editor.locator('#output')).toContainText('[1, 4, 9, 16]');
  expect(await editor.evaluate(() => window.opener)).toBeNull();
});
test('mobile documentation provides chapters, search and scrollable code', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./docs/listeler.html', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Bölüm menüsü' }).click();
  await expect(page.getByRole('navigation', { name: 'Bölümler' })).toBeVisible();
  await page.getByLabel('Belgelerde ara').fill('f64');
  await expect(page.locator('#search-results a').filter({ hasText: 'Sayı: f64' })).toBeVisible();
  await page.locator('#search-results a').filter({ hasText: 'Sayı: f64' }).click();
  await expect(page.locator('#sayi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bölüm menüsü' })).toHaveAttribute('aria-expanded', 'false');
});
test('search has an empty state and Escape restores the page', async ({ page }) => {
  await page.goto('./docs/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Belgelerde ara').fill('zzxyolmayan');
  await expect(page.locator('#search-count')).toContainText('Sonuç bulunamadı');
  await page.keyboard.press('Escape');
  await expect(page.locator('article')).toBeVisible();
});
