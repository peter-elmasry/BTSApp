import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { eventId } from './public-fixtures';
import { mockStandingsEvent } from './standings-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['en', 'ar'] as const) {
  test(`setup checklist: review, schedule grid and bulk add in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    await page.goto(`/manage/${eventId}/setup`);
    // A round already started in this fixture, so the Excel import card is hidden.
    await expect(page.getByTestId('setup-step-review')).toBeVisible();
    await expect(page.getByTestId('import-card')).toHaveCount(0);

    // Review lists what is missing and jumps to the step that fixes it.
    await page.getByTestId('setup-step-review').click();
    const review = page.getByTestId('setup-review');
    await expect(review).toContainText(t.review.noReferee.replace('{{n}}', '1'));
    await review.getByRole('button', { name: t.setup.fix }).first().click();
    await expect(page.getByTestId('setup-step-staff')).toHaveAttribute('aria-pressed', 'true');

    // Schedule grid shows team names; a draft round's cell opens the two-team picker.
    await page.getByTestId('setup-step-rounds').click();
    const grid = page.getByTestId('schedule-grid');
    await expect(grid).toContainText(lang === 'ar' ? 'الصقور' : 'Falcons');
    await grid.getByTestId('grid-cell').last().click();
    await expect(page.locator('dialog').getByLabel(t.manage.teamA)).toBeVisible();
    await page.keyboard.press('Escape');

    // "Add N teams" creates generated teams one by one.
    await page.getByTestId('setup-step-teams').click();
    await page.getByTestId('bulk-teams').click();
    await page.getByTestId('bulk-count').fill('2');
    await page.getByTestId('bulk-confirm').click();
    await expect
      .poll(() => fixture.calls.filter((call) => call.name === 'upsert_team').length)
      .toBe(2);
    const codes = fixture.calls
      .filter((call) => call.name === 'upsert_team')
      .map((call) => call.args['p_team'].code);
    expect(codes).toEqual(['T03', 'T04']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
