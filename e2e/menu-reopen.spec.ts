import { expect, test } from '@playwright/test';
import { mockLiveEvent } from './live-fixtures';

test.use({ serviceWorkers: 'block' });

test('the account menu reopens after closing it with × and with Escape', async ({ page }) => {
  await mockLiveEvent(page, { role: 'REFEREE', lang: 'en' });
  await page.goto('/ref');
  const menu = page.getByTestId('staff-menu');
  for (const close of ['x', 'escape', 'x'] as const) {
    await page.getByTestId('account-menu').click();
    await expect(menu).toBeVisible();
    if (close === 'x') await page.locator('dialog').getByRole('button', { name: 'Close' }).click();
    else await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }
});
