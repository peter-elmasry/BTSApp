import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { eventId } from './public-fixtures';
import { mockLiveEvent } from './live-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: 'en' | 'ar') => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

for (const lang of ['en', 'ar'] as const) {
  test(`referee confirms a regular result and player sees it in ${lang}`, async ({ page }) => {
    const fixture = await mockLiveEvent(page, { lang });
    const t = labels(lang);
    await page.goto('/ref');
    await page.getByRole('link', { name: t.live.enterResult, exact: true }).click();
    await page.getByRole('button').filter({ hasText: t.live.choice.aWins }).click();
    await page.getByTestId('review-result').click();
    await expect(page.locator('dialog')).toBeVisible();
    expect(fixture.calls.filter((c) => c.name === 'submit_match_result')).toHaveLength(0);
    await page.getByTestId('confirm-result').click();
    await expect(page.getByText(t.live.resultSaved, { exact: true })).toBeVisible();
    expect(fixture.applied.size).toBe(1);
    expect(fixture.calls[0].args.p_outcomes).toEqual([
      { team_id: 'team-1', outcome: 'WIN' },
      { team_id: 'team-2', outcome: 'LOSS' },
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/live-result-${lang}.png`, fullPage: true });
    await page.goto('/home');
    await expect(page.getByText(t.player.outcome.WIN, { exact: true }).first()).toBeVisible();
  });
}

test('opening round permits every team to win after confirmation', async ({ page }) => {
  const fixture = await mockLiveEvent(page, { opening: true });
  const t = labels('en');
  await page.goto('/ref/match/match-1');
  const winners = page.getByRole('button', { name: t.live.winner, exact: true });
  await expect(winners).toHaveCount(2);
  await winners.nth(0).click();
  await winners.nth(1).click();
  await page.getByTestId('review-result').click();
  await page.getByTestId('confirm-result').click();
  await expect(page.getByText(t.live.resultSaved, { exact: true })).toBeVisible();
  expect(
    fixture.calls
      .find((c) => c.name === 'submit_match_result')!
      .args.p_outcomes.map((o: { outcome: string }) => o.outcome),
  ).toEqual(['WIN', 'WIN']);
});

test('lost acknowledgement persists across reload and replays the same operation once', async ({
  page,
}) => {
  const fixture = await mockLiveEvent(page);
  const t = labels('en');
  await page.goto('/ref/match/match-1');
  await page.getByRole('button', { name: t.live.choice.draw, exact: true }).click();
  await page.getByTestId('review-result').click();
  fixture.loseNextResponse();
  await page.getByTestId('confirm-result').click();
  const pending = t.live.pending.replace('{{n}}', '1').replace('{{ n }}', '1');
  await expect(page.getByText(pending, { exact: true })).toBeVisible();
  await expect.poll(() => fixture.calls.some((c) => c.name === 'submit_match_result')).toBe(true);
  await expect(page.getByText(t.live.queued, { exact: true })).toBeVisible();
  const firstId = fixture.calls.find((c) => c.name === 'submit_match_result')!.args.p_op_id;
  await page.reload();
  await expect(page.getByText(pending, { exact: true })).toBeVisible();
  await expect(page.getByTestId('review-result')).toBeDisabled();
  fixture.networkFailure(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(pending, { exact: true })).toHaveCount(0);
  expect(
    fixture.calls
      .filter((c) => c.name === 'submit_match_result')
      .every((c) => c.args.p_op_id === firstId),
  ).toBe(true);
  expect(fixture.applied.size).toBe(1);
  await expect(page.getByText(t.player.outcome.DRAW, { exact: true }).first()).toBeVisible();
});

test('airplane-mode submission waits for reconnection', async ({ page, context }) => {
  const fixture = await mockLiveEvent(page);
  const t = labels('en');
  await page.goto('/ref/match/match-1');
  await page.getByRole('button', { name: t.live.choice.draw, exact: true }).click();
  await page.getByTestId('review-result').click();
  fixture.networkFailure(true);
  await context.setOffline(true);
  await page.getByTestId('confirm-result').click();
  await expect(page.getByText(t.live.queued, { exact: true })).toBeVisible();
  expect(fixture.applied.size).toBe(0);
  fixture.networkFailure(false);
  await context.setOffline(false);
  await expect.poll(() => fixture.applied.size).toBe(1);
  await expect(page.getByText(t.player.outcome.DRAW, { exact: true }).first()).toBeVisible();
});

test('admin resolves pending overtime matches before closing, then reopens with a reason', async ({
  page,
}) => {
  const fixture = await mockLiveEvent(page, { role: 'EVENT_ADMIN', overtime: true });
  const t = labels('en');
  await page.goto(`/manage/${eventId}/live`);
  await page.getByRole('button', { name: t['admin.round.close'], exact: true }).first().click();
  await expect(
    page.locator('dialog').getByText(t.live.closeBlocked, { exact: true }),
  ).toBeVisible();
  expect(fixture.calls.some((c) => c.name === 'close_round')).toBe(false);
  await page.locator('dialog').getByRole('button', { name: t.common.cancel, exact: true }).click();
  await page.getByRole('button', { name: t.live.voidMatch, exact: true }).click();
  await page
    .locator('dialog')
    .getByRole('textbox', { name: t.live.reason, exact: true })
    .fill('Station unavailable');
  await page.getByTestId('confirm-live-action').click();
  await expect.poll(() => fixture.snapshot.matches[0].status).toBe('VOID');
  await page.getByRole('button', { name: t['admin.round.close'], exact: true }).first().click();
  await page.getByTestId('confirm-live-action').click();
  await expect.poll(() => fixture.snapshot.rounds[0].status).toBe('CLOSED');
  await page.getByRole('button', { name: t.live.reopen, exact: true }).click();
  await page
    .locator('dialog')
    .getByRole('textbox', { name: t.live.reason, exact: true })
    .fill('Review requested');
  await page.getByTestId('confirm-live-action').click();
  await expect.poll(() => fixture.snapshot.rounds[0].status).toBe('ACTIVE');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/live-admin-en.png', fullPage: true });
});

test('match adjustment shows giver, remaining cap and revoked history', async ({ page }) => {
  const fixture = await mockLiveEvent(page);
  const t = labels('en');
  await page.goto('/ref/match/match-1');
  await page.getByRole('textbox', { name: t.live.reason, exact: true }).fill('Great sportsmanship');
  await page.getByRole('button', { name: t.live.addAdjustment, exact: true }).click();
  await expect(page.getByText('Great sportsmanship', { exact: true })).toBeVisible();
  await expect(page.locator('article').getByText(/Mina Referee/)).toBeVisible();
  await expect(page.getByText(`${t.live.remaining}: 2`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.live.revoke, exact: true }).click();
  await page.locator('dialog').getByRole('textbox').fill('Entered by mistake');
  await page.locator('dialog').getByRole('button', { name: t.live.revoke, exact: true }).click();
  await expect.poll(() => fixture.snapshot.adjustments[0].revoked_at).not.toBeNull();
  await expect(page.getByText(`${t.live.remaining}: 3`, { exact: true })).toBeVisible();
  await expect(page.locator('article.line-through')).toContainText('Entered by mistake');
});
