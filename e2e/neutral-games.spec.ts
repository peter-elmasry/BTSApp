import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockStandingsEvent } from './standings-fixtures';
import { mockLiveEvent } from './live-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: 'en' | 'ar') => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['en', 'ar'] as const) {
  test(`admin previews, cancels, enables and reverses neutral scoring in ${lang}`, async ({
    page,
  }) => {
    const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    const t = labels(lang);
    const game = fixture.snapshot.games[0];
    const calls: Record<string, unknown>[] = [];
    let stale = false;
    await page.route('**/rest/v1/rpc/set_game_neutral', async (route) => {
      const args = route.request().postDataJSON();
      calls.push(args);
      if (stale)
        return route.fulfill({
          status: 400,
          json: { message: 'NEUTRAL_GAME_CHANGED', code: 'P0001' },
        });
      game.is_neutral = args.p_neutral;
      await route.fulfill({ json: { id: game.id, is_neutral: game.is_neutral } });
    });
    await page.goto(`/manage/${eventId}/setup`);
    await page.getByTestId('setup-step-games').click();
    await page.getByTestId('neutral-open').first().click();
    await expect(page.getByTestId('neutral-confirmation')).toContainText(t.neutral.enableHint);
    const count = fixture.snapshot.matches.filter(
      (m) => m.game_id === game.id && m.status !== 'VOID',
    ).length;
    await expect(page.getByTestId('neutral-confirmation')).toContainText(
      t.neutral.impact.replace('{{n}}', String(count)),
    );
    expect(calls).toHaveLength(0);
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    await page
      .locator('dialog')
      .getByRole('button', { name: t.common.cancel, exact: true })
      .click();
    expect(calls).toHaveLength(0);
    await page.getByTestId('neutral-open').first().click();
    await page.getByTestId('neutral-confirm').click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      p_game: game.id,
      p_neutral: true,
      p_expected_neutral: false,
      p_expected_matches: count,
    });
    await expect(page.getByTestId('neutral-open').first()).toHaveText(t.neutral.disable);
    await page.getByTestId('neutral-open').first().click();
    await expect(page.getByTestId('neutral-confirmation')).toContainText(t.neutral.restoreHint);
    stale = true;
    await page.getByTestId('neutral-confirm').click();
    await expect(page.locator('dialog').getByRole('alert')).toHaveText(t.neutral.changed);
    expect(game.is_neutral).toBe(true);
    await page
      .locator('dialog')
      .getByRole('button', { name: t.common.cancel, exact: true })
      .click();
    stale = false;
    await page.getByTestId('neutral-open').first().click();
    await page.getByTestId('neutral-confirm').click();
    await expect(page.getByTestId('neutral-open').first()).toHaveText(t.neutral.enable);
    expect(game.is_neutral).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`neutral referee entry is read-only even through a direct link in ${lang}`, async ({
    page,
  }) => {
    const fixture = await mockLiveEvent(page, { lang });
    fixture.snapshot.games[0].is_neutral = true;
    fixture.snapshot.matches[0].is_neutral = true;
    fixture.snapshot.matches[0].status = 'COMPLETED';
    fixture.snapshot.matches[0].editable = false;
    fixture.snapshot.matches[0].participants.forEach((p) => (p.outcome = 'WIN'));
    const t = labels(lang);
    await page.goto('/ref/match/match-1');
    await expect(page.getByTestId('result-read-only')).toHaveText(t.neutral.resultHint);
    await expect(page.getByTestId('choice-aWins')).toHaveCount(0);
    await expect(page.getByTestId('confirm-result')).toHaveCount(0);
    expect(fixture.calls.filter((c) => c.name === 'submit_match_result')).toHaveLength(0);
  });
}

test('neutral scoring cannot be queued offline', async ({ page, context }) => {
  await mockStandingsEvent(page, { role: 'EVENT_ADMIN' });
  const t = labels('en');
  await page.goto(`/manage/${eventId}/setup`);
  await page.getByTestId('setup-step-games').click();
  await context.setOffline(true);
  await page.getByTestId('neutral-open').first().click();
  await expect(page.getByText(t.neutral.online, { exact: true })).toBeVisible();
  await expect(page.getByTestId('neutral-confirmation')).toHaveCount(0);
});

test('a result opened before neutral mode is enabled receives the server refusal safely', async ({
  page,
}) => {
  const fixture = await mockLiveEvent(page);
  const t = labels('en');
  let attempts = 0;
  await page.route('**/rest/v1/rpc/submit_match_result', (route) => {
    attempts++;
    return route.fulfill({ status: 400, json: { code: 'P0001', message: 'NEUTRAL_GAME' } });
  });
  await page.goto('/ref/match/match-1');
  await page.getByTestId('choice-aWins').click();
  await page.getByTestId('review-result').click();
  await page.getByTestId('confirm-result').click();
  await expect(page.getByText(t['errors.NEUTRAL_GAME'], { exact: true })).toBeVisible();
  expect(attempts).toBe(1);
  expect(fixture.applied.size).toBe(0);
});
