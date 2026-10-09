import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const lang of ['ar', 'en']) {
  test(`360px shell, forms, focus and accessibility in ${lang}`, async ({ page }) => {
    await page.addInitScript(
      (value) => !localStorage.getItem('bts.lang') && localStorage.setItem('bts.lang', value),
      lang,
    );
    await page.goto('/home');
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('header img')).toHaveAttribute('src', '/brand/dst-mark-white.webp');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const element of await page
      .locator('button:visible, input:visible, select:visible, nav a')
      .all()) {
      const box = await element.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/shell-initial-${lang}.png`, fullPage: true });
    await page.locator('ds-input input').fill('DST');
    await page.locator('ds-select select').selectOption('star');
    await page.locator('ds-toggle input').check();
    await page.locator('button[type=submit]').click();
    await expect(page.locator('dialog')).toBeVisible();
    expect(
      await page.evaluate(() => document.querySelector('dialog')!.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('button[type=submit]')).toBeFocused();
    await page.locator('header button').click();
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'ltr' : 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'ltr' : 'rtl');
    await page.screenshot({ path: `artifacts/shell-${lang}.png`, fullPage: true });
  });
}

test('shell loads offline after service worker takes control', async ({ page, context }) => {
  await page.goto('/home');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
  });
  // Activation is earlier than Angular's asset-cache initialization. Trigger a
  // controlled online navigation before testing a genuinely cached offline load.
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data).display).toBe('standalone');
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('header img')).toBeVisible();
});
