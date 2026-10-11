import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockStandingsEvent } from './standings-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: 'en' | 'ar') => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['en', 'ar'] as const) {
  test(`leaderboard shows shared ties, own team and accessible mobile totals in ${lang}`, async ({
    page,
  }) => {
    const fixture = await mockStandingsEvent(page, { lang });
    const t = labels(lang);
    await page.goto('/leaderboard');
    const list = page.locator('app-leaderboard-page app-standings-list');
    await expect(list.locator('[data-team-id]')).toHaveCount(2);
    await expect(list.getByText(t.standings.tied, { exact: true })).toHaveCount(2);
    await expect(list.locator('[data-team-code="T01"]')).toHaveClass(/selected/);
    await expect(list.locator('.rank')).toHaveText(['1', '1']);
    const navigation = page.locator('nav[aria-label] > div');
    expect(
      await navigation.evaluate(
        (element) =>
          [...element.childNodes].filter(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ).length,
      ),
    ).toBe(0);
    await expect(list.locator('.total-number [aria-hidden="true"]')).toHaveText(['1', '1']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/standings-${lang}.png`, fullPage: true });
    fixture.rows[1].total = 3;
    fixture.rows[1].rank = 1;
    fixture.rows[0].rank = 2;
    fixture.rows.forEach((row) => (row.is_tied = false));
    fixture.rows.reverse();
    await page.getByRole('button', { name: t.standings.refresh, exact: true }).click();
    await expect(list.locator('[data-team-id]').first()).toHaveAttribute('data-team-id', 'team-2');
    await expect(list.locator('.total-number [aria-hidden="true"]')).toHaveText(['3', '1']);
    await page.goto('/home');
    await expect(page.getByTestId('home-standing')).toContainText('2');
    await expect(page.locator('app-home-page app-standings-list [data-team-id]')).toHaveCount(2);
    await page.goto('/teams/T01');
    await expect(page.getByTestId('team-standing')).toContainText('2');
  });
}

test('visibility change clears already rendered standings and hidden deep link redirects', async ({
  page,
}) => {
  const fixture = await mockStandingsEvent(page);
  const t = labels('en');
  await page.goto('/leaderboard');
  await expect(page.locator('app-leaderboard-page [data-team-id]')).toHaveCount(2);
  fixture.snapshot.event.leaderboard_public = false;
  await page.getByRole('button', { name: t.standings.refresh, exact: true }).click();
  await expect(page.locator('app-leaderboard-page [data-team-id]')).toHaveCount(0);
  await expect(page.getByText(t['leaderboard.hidden'], { exact: true })).toBeVisible();
  await page.goto('/leaderboard');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('app-leaderboard-page')).toHaveCount(0);
});

test('display removes navigation chrome and cycles latest visible results every 20 seconds', async ({
  page,
}) => {
  await mockStandingsEvent(page);
  const t = labels('en');
  await page.clock.install();
  await page.goto('/display');
  await expect(page.locator('app-display-page [data-team-id]')).toHaveCount(2);
  await expect(page.locator('nav')).toHaveCount(0);
  await expect(page.locator('header')).toHaveCount(1);
  await expect(
    page.locator('.results-ticker').getByText(t.player.outcome.DRAW, { exact: false }).first(),
  ).toBeVisible();
  await page.clock.fastForward(20001);
  await expect(page.locator('.display-results app-public-match-card')).toHaveCount(1);
  await page.getByRole('button', { name: t.standings.pauseCycle, exact: true }).click();
  await page.clock.fastForward(40000);
  await expect(page.locator('.display-results app-public-match-card')).toHaveCount(1);
  await page.getByRole('button', { name: t.standings.resumeCycle, exact: true }).click();
  await page.clock.fastForward(20001);
  await expect(page.locator('app-display-page [data-team-id]')).toHaveCount(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/standings-display.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/standings-display-landscape.png', fullPage: true });
  await page.getByRole('button', { name: t.standings.changeLanguage, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/standings-display-landscape-ar.png', fullPage: true });
});
