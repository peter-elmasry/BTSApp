import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { bootstrap, mockPublicEvent } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
/** Adds a second game (unused in round 1) and a third round with no match at all. */
async function withBreaks(page: Page) {
  await page.route('**/rest/v1/rpc/get_bootstrap', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return route.fulfill({
      headers,
      json: {
        ...bootstrap,
        games: [
          ...bootstrap.games,
          {
            ...bootstrap.games[0],
            id: 'game-2',
            code: 'G02',
            name_en: 'Puzzle',
            name_ar: 'الألغاز',
            referees: [],
          },
        ],
        rounds: [...bootstrap.rounds, { ...bootstrap.rounds[1], id: 'round-3', number: 3 }],
      },
    });
  });
}

for (const lang of ['en', 'ar'] as const) {
  test(`a visitor's schedule shows their own breaks in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await page.addInitScript((value) => {
      localStorage.setItem('bts.lang', value);
      localStorage.setItem('bts.team.44000000-0000-0000-0000-000000000001', 'T01');
    }, lang);
    await mockPublicEvent(page);
    await withBreaks(page);
    await page.goto('/schedule');
    // Table is the default view. My team: rounds 1 and 2 are matches, round 3 is a break.
    const table = page.getByTestId('schedule-table');
    await expect(table.getByRole('rowheader')).toHaveCount(3);
    await expect(table.getByTestId('table-break')).toHaveCount(1);
    // Visitors see only their own team (D046): no by-round or by-game views.
    await expect(page.getByRole('button', { name: t.player.byRound })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    // Phones get compact rows only (D056); the Table/Cards switch starts at 640 px.
    await expect(page.getByTestId('view-cards')).toHaveCount(0);
    await page.setViewportSize({ width: 800, height: 740 });
    await page.getByTestId('view-cards').click();
    await expect(page.getByTestId('schedule-table')).toHaveCount(0);
    await expect(page.getByTestId('break-card')).toHaveCount(1);
    await expect(page.getByTestId('break-card')).toContainText(t.player.teamBreak);
    // The chosen view is remembered on this device.
    await page.reload();
    await expect(page.getByTestId('view-cards')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('break-card')).toHaveCount(1);
  });

  test(`members see breaks by round and on game details in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { role: 'REFEREE', lang });
    await withBreaks(page);
    await page.goto('/schedule');
    await page.getByRole('button', { name: t.player.byRound }).click();
    // Round 1: G02 break; round 2: G02 break; round 3: both games break.
    await expect(page.getByTestId('schedule-table').getByTestId('table-break')).toHaveCount(4);
    await page.goto('/games/G02');
    await expect(page.getByTestId('break-card')).toHaveCount(3);
    await expect(page.getByTestId('break-card').first()).toContainText(t.player.breakHint);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test(`referees see their games by round with breaks in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { lang });
    await withBreaks(page);
    await page.goto('/ref');
    const table = page.getByTestId('referee-schedule');
    await expect(table.getByRole('columnheader')).toHaveText([
      t.live.roundColumn,
      lang === 'ar' ? 'التتابع' : 'Relay',
    ]);
    await expect(table.getByRole('rowheader')).toHaveCount(3);
    await expect(table.getByRole('row').nth(1)).toContainText(t.live.activeRound);
    await expect(table.getByRole('row').nth(1)).toContainText(lang === 'ar' ? 'الصقور' : 'Falcons');
    await expect(table.getByTestId('referee-break')).toHaveCount(1);
    await expect(table.getByRole('row').nth(3)).toContainText(t.live.breakCell);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
