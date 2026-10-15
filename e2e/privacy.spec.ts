import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { eventId, mockPublicEvent } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['en', 'ar'] as const) {
  test(`visitors see only their own team (D046) in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await page.addInitScript(
      ({ lang, eventId }) => {
        localStorage.setItem('bts.lang', lang);
        localStorage.setItem(`bts.team.${eventId}`, 'T01');
      },
      { lang, eventId },
    );
    await mockPublicEvent(page);
    await page.goto('/schedule');
    await expect(page.getByRole('button', { name: t.player.byRound })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t.player.byGame })).toHaveCount(0);
    await expect(page.locator('a[href^="/games/"]')).toHaveCount(0);
    await expect(page.locator('a[href="/teams/T02"]')).toHaveCount(0);
    await page.goto('/teams/T02');
    await expect(page).toHaveURL(/\/home$/);
    await page.goto('/games/G01');
    await expect(page).toHaveURL(/\/home$/);
    await page.goto('/teams/T01');
    await expect(page).toHaveURL(/\/teams\/T01$/);
  });
}

test('signed-in members keep every view and logout clears the device (D047)', async ({ page }) => {
  const t = labels('en');
  await mockLiveEvent(page, { role: 'REFEREE', lang: 'en' });
  await page.goto('/schedule');
  await expect(page.getByRole('button', { name: t.player.byGame })).toBeVisible();
  await page.goto('/games/G01');
  await expect(page).toHaveURL(/\/games\/G01$/);
  await page.evaluate(() => {
    sessionStorage.setItem('draft', 'x');
    localStorage.setItem('bts.extra', 'y');
  });
  // The fixture's init script signs in again on every load, so record the storage left
  // behind at the moment the logout reload starts (window.name survives the reload).
  await page.evaluate(() =>
    addEventListener('beforeunload', () => {
      window.name = JSON.stringify({
        keys: Object.keys(localStorage),
        session: sessionStorage.length,
      });
    }),
  );
  await page.getByTestId('account-menu').click();
  await page.getByTestId('staff-menu').getByRole('button', { name: t['auth.logout'] }).click();
  const readName = async () => {
    try {
      return await page.evaluate(() => window.name);
    } catch {
      return ''; // The page is reloading.
    }
  };
  // Parse and assert the same sample: another read can land in the reload.
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readName());
      } catch {
        return null;
      }
    })
    .toEqual({ keys: ['bts.lang'], session: 0 });
});
