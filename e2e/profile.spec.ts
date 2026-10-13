import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['ar', 'en'] as const) {
  test(`members edit their own details from the menu in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { role: 'REFEREE', lang });
    const sent: Record<string, unknown>[] = [];
    let duplicate = true;
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    await page.route('**/rest/v1/rpc/update_own_profile', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      sent.push(route.request().postDataJSON());
      if (duplicate) {
        duplicate = false;
        return route.fulfill({
          status: 400,
          headers,
          json: { code: 'P0001', message: 'DUPLICATE_PHONE', details: null, hint: null },
        });
      }
      return route.fulfill({ headers, json: { id: 'live-member' } });
    });
    await page.goto('/ref');
    await page.getByTestId('account-menu').click();
    await page.getByTestId('staff-menu').getByRole('link', { name: t.profile.title }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    const form = page.getByTestId('profile-form');
    await expect(form.getByLabel(t.profile.username)).toHaveValue('referee');
    await form.getByLabel(t.profile.phone).fill('01012345678');
    await form.getByRole('button', { name: t.profile.save }).click();
    await expect(form.getByRole('alert')).toHaveText(t['errors.DUPLICATE_PHONE']);
    await form.getByRole('button', { name: t.profile.save }).click();
    await expect(page.getByTestId('toast')).toContainText(t.profile.saved);
    expect(sent.at(-1)).toMatchObject({
      p_username: 'referee',
      p_full_name_en: 'مينا الحكم',
      p_phone: '01012345678',
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
