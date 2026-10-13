import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['en', 'ar'] as const) {
  test(`admin runs a round without leaving the admin area in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    const fixture = await mockLiveEvent(page, { role: 'EVENT_ADMIN', lang });
    await page.goto(`/manage/${eventId}/live`);
    await expect(page.getByTestId('kpi-pending')).toContainText('1');

    // Enter the waiting result inline from the chase list.
    await page.getByTestId('control-enter').first().click();
    const sheet = page.locator('dialog');
    await sheet.getByRole('button', { name: t.live.choice.draw, exact: true }).click();
    await sheet.getByTestId('review-result').click();
    await sheet.getByTestId('confirm-result').click();
    await expect.poll(() => fixture.snapshot.matches[0].status).toBe('COMPLETED');
    expect(page.url()).toContain(`/manage/${eventId}/live`);

    // End the round and start the next one 10 minutes ago (D041, D042).
    await page.getByTestId('end-and-start').click();
    await page.getByTestId('start-ago').check();
    await page.getByTestId('start-minutes').fill('10');
    await expect(page.getByTestId('start-ends')).toBeVisible();
    await page.getByTestId('confirm-live-action').click();
    await expect.poll(() => fixture.snapshot.rounds[0].status).toBe('CLOSED');
    await expect.poll(() => fixture.snapshot.rounds[1].status).toBe('ACTIVE');
    const start = fixture.calls.find((call) => call.name === 'start_round');
    expect(start?.args['p_started_minutes_ago']).toBe(10);
    expect(fixture.calls.some((call) => call.name === 'void_match')).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test(`results table drills into a team and export is one tap away in ${lang}`, async ({
    page,
  }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { role: 'EVENT_ADMIN', lang });
    await page.goto(`/manage/${eventId}/results`);
    await expect(page.getByRole('table', { name: t.results.title })).toBeVisible();
    await page.getByTestId('results-team').first().click();
    await expect(page.getByTestId('team-breakdown')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('toolbar-export').click();
    await expect(page.getByTestId('export-sheet')).toBeVisible();
    await expect(page.getByTestId('export-download')).toContainText(t.export.download);
    await page.keyboard.press('Escape');
    await page.goto(`/manage/${eventId}/adjustments`);
    await page.getByTestId('add-adjustment').click();
    await expect(
      page.locator('dialog').getByRole('textbox', { name: t.live.reason }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
