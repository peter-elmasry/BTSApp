import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockPublicEvent } from './public-fixtures';

for (const lang of ['en', 'ar']) {
  test(`PWA guidance and user-triggered installation in ${lang}`, async ({ page }) => {
    await mockPublicEvent(page, { noEvent: true });
    await page.addInitScript((language) => localStorage.setItem('bts.lang', language), lang);
    await page.goto('/about');
    const card = page.locator('app-install-card');
    await expect(card.getByRole('heading')).toBeVisible();
    await expect(card).toContainText(lang === 'en' ? 'Safari' : 'سفاري');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => document.body.setAttribute('data-install-prompted', 'yes'),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });
    const install = card.getByRole('button');
    await expect(install).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute('data-install-prompted');
    await install.click();
    await expect(page.locator('body')).toHaveAttribute('data-install-prompted', 'yes');
    await expect(install).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(card.getByRole('status')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/pwa-${lang}.png`, fullPage: true });
  });
}
